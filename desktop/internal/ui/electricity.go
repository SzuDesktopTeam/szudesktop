package ui

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	xhtml "golang.org/x/net/html"
	"golang.org/x/net/html/charset"
)

// The school entry is configured on this computer, never bundled or borrowed
// from the teaching-system session. Only these two read-only SIMS paths run.
const electricityLoginPath = "/cgcSims/login.do"
const electricityQueryPath = "/cgcSims/selectList.do"

var (
	errElectricityEntry         = errors.New("请输入学校电量查询系统的完整入口；仅支持学校域名或校园私网地址及常用网页端口")
	errElectricityNotConfigured = errors.New("请先在本机设置学校电量查询入口")
	errElectricityNetwork       = errors.New("宿舍电量系统暂时连不上，请连接校园网后重试；教务登录不能代替宿舍网络连接")
	errElectricityDenied        = errors.New("学校电量系统拒绝访问，请到学校原页面核对权限；这里不会借用教务登录")
	errElectricityResponse      = errors.New("学校电量系统返回异常或要求跳转，请到学校原页面核对后重试")
	errElectricityPage          = errors.New("学校电量页面结构无法识别，请到原系统核对；未把异常页面当作零电量")
	errElectricitySettings      = errors.New("本机电量设置无法读取或保存，请重新设置入口后重试")
	electricityValuePattern     = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,80}$`)
)

type electricityService struct {
	mu         sync.RWMutex
	configPath string
	entry      string
	loadErr    error
	http       *http.Client
}

type electricityChoice struct {
	Value string `json:"value"`
	Name  string `json:"name"`
}

type electricityOptions struct {
	Client    string              `json:"client"`
	Campuses  []electricityChoice `json:"campuses"`
	Buildings []electricityChoice `json:"buildings"`
	Manual    bool                `json:"manual"`
}

type electricityInput struct {
	Client     string `json:"client"`
	BuildingID string `json:"building_id"`
	Room       string `json:"room"`
	From       string `json:"from"`
	To         string `json:"to"`
}

type electricityRecord struct {
	RemainingKwh      *float64 `json:"remaining_kwh"`
	TotalUsedKwh      *float64 `json:"total_used_kwh"`
	TotalPurchasedKwh *float64 `json:"total_purchased_kwh"`
	RecordedAt        string   `json:"recorded_at"`
}

type electricityResult struct {
	electricityInput
	RemainingKwh      *float64            `json:"remaining_kwh"`
	TotalUsedKwh      *float64            `json:"total_used_kwh"`
	TotalPurchasedKwh *float64            `json:"total_purchased_kwh"`
	RecordedAt        string              `json:"recorded_at"`
	Records           []electricityRecord `json:"records"`
	FetchedAt         time.Time           `json:"fetched_at"`
}

func newElectricityService(configDir string) *electricityService {
	s := &electricityService{configPath: filepath.Join(configDir, "electricity.json"), http: newElectricityHTTPClient()}
	b, err := os.ReadFile(s.configPath)
	if errors.Is(err, os.ErrNotExist) {
		return s
	}
	var saved struct {
		EntryURL string `json:"entry_url"`
	}
	if err != nil || len(b) > 8192 || json.Unmarshal(b, &saved) != nil {
		s.loadErr = errElectricitySettings
		return s
	}
	u, err := validateElectricityEntry(saved.EntryURL)
	if err != nil {
		s.loadErr = errElectricitySettings
		return s
	}
	s.entry = u.String()
	return s
}

func validateElectricityEntry(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u == nil || u.User != nil || u.Fragment != "" || u.RawPath != "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, errElectricityEntry
	}
	host := strings.ToLower(u.Hostname())
	if ip, err := netip.ParseAddr(host); err == nil {
		ip = ip.Unmap()
		if !ip.IsPrivate() || ip.IsLoopback() {
			return nil, errElectricityEntry
		}
	} else if host != "szu.edu.cn" && !strings.HasSuffix(host, ".szu.edu.cn") {
		return nil, errElectricityEntry
	}
	switch u.Port() {
	case "", "80", "443", "9090":
	default:
		return nil, errElectricityEntry
	}
	if u.Path == "/cgcSims/" || u.Path == "/cgcSims" {
		u.Path = electricityLoginPath
	}
	if u.Path != electricityLoginPath {
		return nil, errElectricityEntry
	}
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return nil, errElectricityEntry
	}
	for key, values := range q {
		if len(values) != 1 || (key != "client" && key != "task") {
			return nil, errElectricityEntry
		}
		if key == "task" && values[0] != "station" {
			return nil, errElectricityEntry
		}
		if key == "client" && !electricityValuePattern.MatchString(values[0]) {
			return nil, errElectricityEntry
		}
	}
	q.Set("task", "station")
	u.RawQuery = q.Encode()
	return u, nil
}

func electricityDialIPAllowed(raw string) bool {
	ip, err := netip.ParseAddr(raw)
	return err == nil && ip.Unmap().IsGlobalUnicast() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast()
}

func newElectricityHTTPClient() *http.Client {
	transport := &http.Transport{Proxy: nil, IdleConnTimeout: 90 * time.Second, TLSHandshakeTimeout: 10 * time.Second}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, errElectricityNetwork
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil || len(ips) == 0 {
			return nil, errElectricityNetwork
		}
		for _, ip := range ips {
			if !electricityDialIPAllowed(ip.IP.String()) {
				return nil, errElectricityNetwork
			}
		}
		// Dial only the inspected address, so DNS cannot change between checking
		// a school hostname and opening the socket.
		return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}
	return &http.Client{Timeout: 20 * time.Second, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

func (s *electricityService) endpoint() (*url.URL, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.loadErr != nil {
		return nil, s.loadErr
	}
	if s.entry == "" {
		return nil, errElectricityNotConfigured
	}
	return url.Parse(s.entry)
}

func (s *electricityService) saveEntry(raw string) error {
	u, err := validateElectricityEntry(raw)
	if err != nil {
		return err
	}
	b, _ := json.Marshal(struct {
		EntryURL string `json:"entry_url"`
	}{u.String()})
	s.mu.Lock()
	defer s.mu.Unlock()
	if os.MkdirAll(filepath.Dir(s.configPath), 0700) != nil {
		return errElectricitySettings
	}
	f, err := os.CreateTemp(filepath.Dir(s.configPath), ".electricity-*")
	if err != nil {
		return errElectricitySettings
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(b)
	}
	closeErr := f.Close()
	if err != nil || closeErr != nil || os.Rename(name, s.configPath) != nil {
		return errElectricitySettings
	}
	s.entry, s.loadErr = u.String(), nil
	return nil
}

func (s *electricityService) read(ctx context.Context, u *url.URL, form url.Values) (io.ReadCloser, error) {
	method := http.MethodGet
	var body io.Reader
	if form != nil {
		method, body = http.MethodPost, strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
	if err != nil {
		return nil, errElectricityNetwork
	}
	req.Header.Set("User-Agent", ehallUserAgent)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	response, err := s.http.Do(req)
	if err != nil {
		return nil, errElectricityNetwork
	}
	if response.StatusCode != 200 {
		response.Body.Close()
		if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
			return nil, errElectricityDenied
		}
		return nil, errElectricityResponse
	}
	b, err := io.ReadAll(io.LimitReader(response.Body, 2<<20+1))
	response.Body.Close()
	if err != nil || len(b) > 2<<20 {
		return nil, errElectricityPage
	}
	decoded, err := charset.NewReader(strings.NewReader(string(b)), response.Header.Get("Content-Type"))
	if err != nil {
		return nil, errElectricityPage
	}
	return io.NopCloser(decoded), nil
}

func (s *electricityService) options(ctx context.Context, client string) (*electricityOptions, error) {
	u, err := s.endpoint()
	if err != nil {
		return nil, err
	}
	if client != "" && !electricityValuePattern.MatchString(client) {
		return nil, errors.New("校区值格式不正确，请核对学校页面")
	}
	q := u.Query()
	if client != "" {
		q.Set("client", client)
	}
	u.RawQuery = q.Encode()
	body, err := s.read(ctx, u, nil)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	doc, err := xhtml.Parse(body)
	if err != nil {
		return nil, errElectricityPage
	}
	out := &electricityOptions{Campuses: []electricityChoice{}, Buildings: []electricityChoice{}}
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n.Type == xhtml.ElementNode && n.Data == "select" {
			name := electricityAttr(n, "name")
			if name == "client" || name == "buildingId" {
				for option := n.FirstChild; option != nil; option = option.NextSibling {
					if option.Type != xhtml.ElementNode || option.Data != "option" {
						continue
					}
					value, label := electricityAttr(option, "value"), strings.TrimSpace(nodeText(option))
					if value == "" || label == "" {
						continue
					}
					choice := electricityChoice{value, label}
					if name == "client" {
						out.Campuses = append(out.Campuses, choice)
						for _, a := range option.Attr {
							if a.Key == "selected" {
								out.Client = value
							}
						}
					} else {
						out.Buildings = append(out.Buildings, choice)
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	if len(out.Campuses) == 0 {
		return nil, errElectricityPage
	}
	if out.Client == "" {
		out.Client = out.Campuses[0].Value
	}
	if client != "" && out.Client != "" && out.Client != client {
		return nil, errElectricityPage
	}
	found := false
	for _, c := range out.Campuses {
		found = found || c.Value == out.Client
	}
	if !found {
		return nil, errElectricityPage
	}
	out.Manual = len(out.Buildings) == 0
	return out, nil
}

func electricityAttr(n *xhtml.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func parseElectricityRecords(body io.Reader, room string) ([]electricityRecord, error) {
	doc, err := xhtml.Parse(body)
	if err != nil {
		return nil, errElectricityPage
	}
	var table *xhtml.Node
	var find func(*xhtml.Node)
	find = func(n *xhtml.Node) {
		if n.Type == xhtml.ElementNode && n.Data == "table" && electricityAttr(n, "id") == "oTable" {
			table = n
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			find(c)
		}
	}
	find(doc)
	if table == nil {
		return nil, errElectricityPage
	}
	rows := []electricityRecord{}
	recognized := false
	var parseErr error
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n.Type == xhtml.ElementNode && n.Data == "tr" {
			cells := tableCells(n)
			if len(cells) > 0 && len(cells) < 6 {
				if _, err := strconv.Atoi(strings.TrimSpace(cells[0])); err == nil {
					parseErr = errElectricityPage
					return
				}
			}
			if len(cells) >= 6 {
				if _, err := strconv.Atoi(strings.TrimSpace(cells[0])); err == nil {
					recognized = true
					if strings.TrimSpace(cells[1]) != room {
						parseErr = errElectricityPage
						return
					}
					values := make([]*float64, 3)
					for i := 0; i < 3; i++ {
						text := strings.TrimSpace(cells[i+2])
						if text == "" {
							continue
						}
						v, e := strconv.ParseFloat(text, 64)
						if e != nil || math.IsNaN(v) || math.IsInf(v, 0) {
							parseErr = errElectricityPage
							return
						}
						values[i] = &v
					}
					stamp := strings.TrimSuffix(strings.TrimSpace(cells[5]), ".0")
					if _, err := time.Parse("2006-01-02 15:04:05", stamp); err != nil {
						parseErr = errElectricityPage
						return
					}
					rows = append(rows, electricityRecord{values[0], values[1], values[2], stamp})
				} else if strings.Contains(strings.Join(cells, ""), "剩余") {
					recognized = true
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(table)
	if parseErr != nil || !recognized {
		return nil, errElectricityPage
	}
	return rows, nil
}

func (s *electricityService) query(ctx context.Context, in electricityInput) (*electricityResult, error) {
	u, err := s.endpoint()
	if err != nil {
		return nil, err
	}
	if !electricityValuePattern.MatchString(in.Client) || !regexp.MustCompile(`^\d{1,20}$`).MatchString(in.BuildingID) || strings.TrimSpace(in.Room) == "" || len([]rune(in.Room)) > 40 || strings.ContainsAny(in.Room, "\r\n\x00") {
		return nil, errors.New("请填写有效的校区、楼栋和房号")
	}
	in.Room = strings.TrimSpace(in.Room)
	from, e1 := time.Parse("2006-01-02", in.From)
	to, e2 := time.Parse("2006-01-02", in.To)
	if e1 != nil || e2 != nil || to.Before(from) || to.Sub(from) > 366*24*time.Hour {
		return nil, errors.New("请选择有效的起止日期，范围不能超过一年")
	}
	u.Path, u.RawQuery = electricityQueryPath, ""
	form := url.Values{"hiddenType": {""}, "isHost": {"0"}, "beginTime": {in.From}, "endTime": {in.To}, "type": {"2"}, "client": {in.Client}, "roomId": {in.BuildingID}, "roomName": {in.Room}, "building": {""}}
	body, err := s.read(ctx, u, form)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	rows, err := parseElectricityRecords(body, in.Room)
	if err != nil {
		return nil, err
	}
	out := &electricityResult{electricityInput: in, Records: rows, FetchedAt: time.Now().UTC()}
	for _, r := range rows {
		if r.RecordedAt > out.RecordedAt {
			out.RemainingKwh, out.TotalUsedKwh, out.TotalPurchasedKwh, out.RecordedAt = r.RemainingKwh, r.TotalUsedKwh, r.TotalPurchasedKwh, r.RecordedAt
		}
	}
	return out, nil
}

func writeElectricityError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, errElectricityNetwork) || errors.Is(err, errElectricitySettings) {
		status = http.StatusServiceUnavailable
	} else if errors.Is(err, errElectricityPage) || errors.Is(err, errElectricityResponse) {
		status = http.StatusBadGateway
	} else if errors.Is(err, errElectricityDenied) {
		status = http.StatusForbidden
	} else if errors.Is(err, errElectricityNotConfigured) {
		status = http.StatusConflict
	}
	writeAPIError(w, status, err)
}

func decodeElectricityJSON(r *http.Request, out any) error {
	d := json.NewDecoder(io.LimitReader(r.Body, 8192))
	d.DisallowUnknownFields()
	if d.Decode(out) != nil {
		return errors.New("电量查询参数格式不正确")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return errors.New("电量查询参数格式不正确")
	}
	return nil
}

func (s *electricityService) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var in struct {
			EntryURL string `json:"entry_url"`
		}
		if err := decodeElectricityJSON(r, &in); err != nil {
			writeElectricityError(w, err)
			return
		}
		if err := s.saveEntry(in.EntryURL); err != nil {
			writeElectricityError(w, err)
			return
		}
	}
	_, err := s.endpoint()
	if err != nil && !errors.Is(err, errElectricityNotConfigured) {
		writeElectricityError(w, err)
		return
	}
	writeJSON(w, map[string]bool{"configured": err == nil})
}

func (s *electricityService) handleOptions(w http.ResponseWriter, r *http.Request) {
	out, err := s.options(r.Context(), r.URL.Query().Get("client"))
	if err != nil {
		writeElectricityError(w, err)
		return
	}
	writeJSON(w, out)
}

func (s *electricityService) handleQuery(w http.ResponseWriter, r *http.Request) {
	var in electricityInput
	if err := decodeElectricityJSON(r, &in); err != nil {
		writeElectricityError(w, err)
		return
	}
	out, err := s.query(r.Context(), in)
	if err != nil {
		writeElectricityError(w, err)
		return
	}
	writeJSON(w, out)
}
