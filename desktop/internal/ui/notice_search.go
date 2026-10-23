package ui

// Anonymous VSB search exposed by the preset public school websites. This is
// independent of the recent-column cache; a failed official search never turns
// into an apparently complete search of that cache.
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	xhtml "golang.org/x/net/html"
)

const noticeSearchPageSize = 12

type noticeSearchItem struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Date    string `json:"date,omitempty"`
	Column  string `json:"column,omitempty"`
	CanRead bool   `json:"can_read"`
}

type noticeSearchResult struct {
	SourceID   string             `json:"source_id"`
	Source     string             `json:"source"`
	URL        string             `json:"url"`
	Query      string             `json:"query"`
	Scope      string             `json:"scope"`
	Range      string             `json:"range"`
	RangeLabel string             `json:"range_label"`
	Page       int                `json:"page"`
	PageSize   int                `json:"page_size"`
	Total      int                `json:"total"`
	FetchedAt  time.Time          `json:"fetched_at"`
	Items      []noticeSearchItem `json:"items"`
}

var noticeSearchOwner = regexp.MustCompile(`\bappOwner\s*=\s*['"]([0-9]+)['"]`)
var noticeSearchColumn = regexp.MustCompile(`_jsq_\(\s*([0-9]+)\s*,\s*['"]([^'"]+)['"]\s*,\s*-?[0-9]+\s*,\s*([0-9]+)\s*\)`)

func noticeSearchRead(req *http.Request) ([]byte, error) {
	client := *noticeClient
	client.CheckRedirect = func(next *http.Request, via []*http.Request) error {
		if len(via) >= 3 || next.URL.Scheme != "https" || next.URL.Host != via[0].URL.Host || next.URL.User != nil || next.URL.Port() != "" && next.URL.Port() != "443" {
			return errors.New("unexpected notice search redirect")
		}
		return nil
	}
	req.Header.Set("User-Agent", ehallUserAgent)
	res, err := client.Do(req)
	if err != nil {
		return nil, errors.New("学校搜索暂时打不开，请稍后重试或查看原页")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, errors.New("学校搜索返回异常，请稍后重试或查看原页")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return nil, errors.New("学校搜索内容过大或未读取完整，请查看原页")
	}
	return data, nil
}

func noticeSearchText(markup string) string {
	root, err := xhtml.Parse(strings.NewReader(markup))
	if err != nil {
		return ""
	}
	return strings.Join(strings.Fields(noticeNodeText(root, false)), " ")
}

func noticeSearchURL(raw string, base *url.URL) (string, bool) {
	ref, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || raw == "" {
		return "", false
	}
	u := base.ResolveReference(ref)
	if u.User != nil || u.Hostname() == "" || u.Scheme != "https" && u.Scheme != "http" || u.Port() != "" && (u.Scheme == "https" && u.Port() != "443" || u.Scheme == "http" && u.Port() != "80") {
		return "", false
	}
	canRead := strings.EqualFold(u.Hostname(), base.Hostname()) && isSchoolSiteURL(u.String())
	if canRead {
		u.Scheme = "https"
		u.Host = base.Host
	} else if u.Scheme != "https" {
		return "", false
	}
	u.Fragment = ""
	return u.String(), canRead
}

func fetchNoticeSearch(ctx context.Context, source noticeSource, query, scope string, page int) (*noticeSearchResult, error) {
	// Only this preset URL can supply owner/column. Never accept these values (or
	// a host/path) from API callers or from the search result records themselves.
	metaReq, err := http.NewRequestWithContext(ctx, http.MethodGet, source.URL, nil)
	if err != nil {
		return nil, err
	}
	metadata, err := noticeSearchRead(metaReq)
	if err != nil {
		return nil, err
	}
	owner := noticeSearchOwner.FindSubmatch(metadata)
	if len(owner) != 2 {
		return nil, errors.New("这个学校页面的公开搜索入口已变化，请查看原页")
	}
	ownerID := string(owner[1])
	column := noticeSearchColumn.FindSubmatch(metadata)
	if len(column) == 4 && string(column[3]) != ownerID {
		return nil, errors.New("暂时不能核实学校搜索的栏目范围，请查看原页")
	}
	base, _ := url.Parse(source.URL)
	rangeType, rangeLabel := "site", source.Name+"网站（可能包含新闻等其他栏目）"
	filter := map[string][]string{"wbsourceid": {"0", "6"}}
	if len(column) == 4 && string(column[2]) == "/list.jsp" && base.Path != "" && base.Path != "/" {
		filter["column"] = []string{string(column[1])}
		rangeType, rangeLabel = "column", source.Name+"当前栏目"
	}
	searchScope := "1"
	if scope == "fulltext" {
		searchScope = "3"
	}
	payload := map[string]any{
		"aliasName": "article_data", "keyWord": query, "lastkeyWord": query,
		"orderType": "date", "searchType": "text", "searchScope": searchScope,
		"searchOperator": 1, "language": "chinese", "auditing": []string{"1", "5"},
		"owner": ownerID, "token": "tourist", "filterTerm": filter,
		"page":         map[string]int{"current": page - 1, "size": noticeSearchPageSize},
		"isMatchQuery": false,
	}
	body, _ := json.Marshal(payload)
	endpoint := *base
	endpoint.Path = "/aop_component//webber/search/search/search/queryPage"
	endpoint.RawPath, endpoint.RawQuery, endpoint.Fragment = "", "", ""
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json;charset=utf-8")
	request.Header.Set("Authorization", "tourist")
	request.Header.Set("owner", ownerID)
	request.Header.Set("appId", "app-search")
	data, err := noticeSearchRead(request)
	if err != nil {
		return nil, err
	}
	var response struct {
		Code string `json:"code"`
		Data struct {
			Page *struct {
				Current int `json:"current"`
				Size    int `json:"size"`
				Total   int `json:"total"`
				Records []struct {
					Title      string `json:"title"`
					URL        string `json:"url"`
					CreateDate string `json:"createDate"`
					ColumnName string `json:"columnName"`
				} `json:"records"`
			} `json:"page"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &response); err != nil || response.Code != "0000" || response.Data.Page == nil {
		return nil, errors.New("学校搜索暂时没有返回可读取的结果，请重试或查看原页")
	}
	resultPage := response.Data.Page
	if resultPage.Current != page-1 || resultPage.Size != noticeSearchPageSize || resultPage.Total < 0 {
		return nil, errors.New("学校搜索的分页格式已变化，请查看原页")
	}
	out := &noticeSearchResult{
		SourceID: source.ID, Source: source.Name, URL: source.URL, Query: query, Scope: scope,
		Range: rangeType, RangeLabel: rangeLabel, Page: page, PageSize: noticeSearchPageSize,
		Total: resultPage.Total, FetchedAt: time.Now(), Items: []noticeSearchItem{},
	}
	seen := map[string]bool{}
	for _, record := range resultPage.Records {
		address, canRead := noticeSearchURL(record.URL, base)
		title := noticeSearchText(record.Title)
		if address == "" || title == "" || seen[address] {
			continue
		}
		seen[address] = true
		date := ""
		if len(record.CreateDate) >= 10 {
			if _, err := time.Parse("2006-01-02", record.CreateDate[:10]); err == nil {
				date = record.CreateDate[:10]
			}
		}
		out.Items = append(out.Items, noticeSearchItem{title, address, date, noticeSearchText(record.ColumnName), canRead})
	}
	return out, nil
}

func (s *Server) handleCampusNoticeSearch(w http.ResponseWriter, r *http.Request) {
	source, exists := noticeSources[r.URL.Query().Get("source")]
	if !exists {
		writeAPIError(w, http.StatusBadRequest, errors.New("请选择已收录的学院或学校部门"))
		return
	}
	if !source.Readable || source.SearchMode != "official" {
		writeAPIError(w, http.StatusNotImplemented, errors.New("这个来源没有已接入的校方搜索；只能在本次读取的标题里检索，或查看原页"))
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	scope := r.URL.Query().Get("scope")
	if scope == "" {
		scope = "title"
	}
	page := 1
	var err error
	if raw := r.URL.Query().Get("page"); raw != "" {
		page, err = strconv.Atoi(raw)
	}
	if query == "" || utf8.RuneCountInString(query) > 80 || scope != "title" && scope != "fulltext" || err != nil || page < 1 || page > 1000 {
		writeAPIError(w, http.StatusBadRequest, errors.New("请填写 1–80 字关键词，选择标题或全文，并使用有效页号"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	out, err := fetchNoticeSearch(ctx, source, query, scope, page)
	if err != nil {
		writeAPIError(w, http.StatusServiceUnavailable, err)
		return
	}
	writeJSON(w, out)
}
