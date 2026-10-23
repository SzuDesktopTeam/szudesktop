package ui

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/text/encoding/simplifiedchinese"
)

// Fabricated private-network endpoint; no real school's address or room data.
const electricityTestEntry = "http://10.20.30.40:9090/cgcSims/login.do?task=station&client=zone-a"

const electricityTestMenu = `<html><select name="client"><option value="zone-a" selected>甲校区</option><option value="zone-b">乙校区</option></select><select name="buildingId"><option value="">请选择</option><option value="1001">第一栋</option></select></html>`
const electricityTestTable = `<table id="oTable"><tr><th>序号</th><th>房间</th><th>剩余电量</th><th>总用电量</th><th>总购电量</th><th>时间</th></tr><tr><td>2</td><td>A01</td><td>0</td><td>18.5</td><td>18.5</td><td>2026-10-24 23:59:00.0</td></tr><tr><td>1</td><td>A01</td><td>2.5</td><td>16</td><td>18.5</td><td>2026-10-23 23:59:00</td></tr></table>`

type electricityRoundTrip func(*http.Request) (*http.Response, error)

func (fn electricityRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return fn(r) }

func electricityReply(body string) *http.Response {
	return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"text/html; charset=utf-8"}}, Body: io.NopCloser(strings.NewReader(body))}
}

func TestElectricityEntryRejectsOtherTargets(t *testing.T) {
	for _, raw := range []string{
		"http://127.0.0.1:9090/cgcSims/login.do", "http://localhost/cgcSims/login.do",
		"http://169.254.1.2/cgcSims/login.do", "http://8.8.8.8/cgcSims/login.do",
		"https://example.com/cgcSims/login.do", "https://szu.edu.cn.example.com/cgcSims/login.do",
		"http://user:password@10.20.30.40/cgcSims/login.do", "http://10.20.30.40:22/cgcSims/login.do",
		"http://10.20.30.40/admin", "http://10.20.30.40/cgcSims/login.do?token=secret",
		"http://10.20.30.40/cgcSims/login.do#x", "file:///cgcSims/login.do",
	} {
		if _, err := validateElectricityEntry(raw); err == nil {
			t.Errorf("unsafe entry accepted: %q", raw)
		}
	}
	for _, raw := range []string{electricityTestEntry, "https://service.szu.edu.cn/cgcSims/", "http://[fd00::12]:9090/cgcSims/login.do"} {
		if _, err := validateElectricityEntry(raw); err != nil {
			t.Errorf("allowed entry rejected: %v", err)
		}
	}
}

func TestElectricitySettingsPersistSeparatelyAndDoNotRevealEntry(t *testing.T) {
	dir := t.TempDir()
	s := newElectricityService(dir)
	w := httptest.NewRecorder()
	s.handleSettings(w, httptest.NewRequest("POST", "/api/electricity/settings", strings.NewReader(`{"entry_url":"`+electricityTestEntry+`"}`)))
	if w.Code != 200 {
		t.Fatalf("save status=%d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"configured":true`) || strings.Contains(w.Body.String(), "10.20.") {
		t.Fatal("settings response must only report configuration state")
	}
	if _, err := os.Stat(filepath.Join(dir, "electricity.json")); err != nil {
		t.Fatal(err)
	}
	reloaded := newElectricityService(dir)
	w = httptest.NewRecorder()
	reloaded.handleSettings(w, httptest.NewRequest("GET", "/api/electricity/settings", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"configured":true`) || strings.Contains(w.Body.String(), "zone-a") {
		t.Fatalf("reload response=%s", w.Body.String())
	}
	bad := httptest.NewRecorder()
	reloaded.handleSettings(bad, httptest.NewRequest("POST", "/api/electricity/settings", strings.NewReader(`{"entry_url":"http://localhost/"}`)))
	if bad.Code != 400 {
		t.Fatal("invalid replacement accepted")
	}
	if _, err := reloaded.endpoint(); err != nil {
		t.Fatal("invalid replacement destroyed working settings")
	}
}

func TestElectricityOptionsUseVerifiedCampusSwitchAndNoSession(t *testing.T) {
	s := newElectricityService(t.TempDir())
	if err := s.saveEntry(electricityTestEntry); err != nil {
		t.Fatal(err)
	}
	s.http = &http.Client{Transport: electricityRoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.Method != "GET" || r.URL.Path != "/cgcSims/login.do" || r.URL.Query().Get("client") != "zone-b" || r.URL.Query().Get("task") != "station" {
			t.Fatalf("unexpected menu request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
			t.Fatal("electricity must stay anonymous")
		}
		menu := strings.ReplaceAll(electricityTestMenu, `value="zone-a" selected`, `value="zone-a"`)
		menu = strings.ReplaceAll(menu, `value="zone-b"`, `value="zone-b" selected`)
		return electricityReply(menu), nil
	})}
	out, err := s.options(context.Background(), "zone-b")
	if err != nil {
		t.Fatal(err)
	}
	if out.Client != "zone-b" || len(out.Campuses) != 2 || len(out.Buildings) != 1 || out.Buildings[0].Value != "1001" {
		t.Fatalf("bad options: %+v", out)
	}
}

func TestElectricityQuerySendsOnlyKnownReadOnlyFormAndKeepsZero(t *testing.T) {
	s := newElectricityService(t.TempDir())
	if err := s.saveEntry(electricityTestEntry); err != nil {
		t.Fatal(err)
	}
	s.http = &http.Client{Transport: electricityRoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" || r.URL.Path != "/cgcSims/selectList.do" || r.URL.RawQuery != "" {
			t.Fatal("query must use fixed school path")
		}
		if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
			t.Fatal("electricity must not borrow authentication")
		}
		b, _ := io.ReadAll(r.Body)
		form, _ := url.ParseQuery(string(b))
		want := map[string]string{"hiddenType": "", "isHost": "0", "beginTime": "2026-10-18", "endTime": "2026-10-24", "type": "2", "client": "zone-a", "roomId": "1001", "roomName": "A01", "building": ""}
		if len(form) != len(want) {
			t.Fatalf("unexpected fields: %v", form)
		}
		for key, value := range want {
			if form.Get(key) != value {
				t.Fatalf("bad %s", key)
			}
		}
		return electricityReply(electricityTestTable), nil
	})}
	out, err := s.query(context.Background(), electricityInput{Client: "zone-a", BuildingID: "1001", Room: "A01", From: "2026-10-18", To: "2026-10-24"})
	if err != nil {
		t.Fatal(err)
	}
	if out.RemainingKwh == nil || *out.RemainingKwh != 0 || out.TotalUsedKwh == nil || *out.TotalUsedKwh != 18.5 || out.RecordedAt != "2026-10-24 23:59:00" || len(out.Records) != 2 {
		t.Fatalf("incorrect latest reading: %+v", out)
	}
}

func TestElectricityEmptyAndMalformedPagesAreDifferent(t *testing.T) {
	empty := `<table id="oTable"><tr><th>序号</th><th>房间</th><th>剩余电量</th><th>总用电量</th><th>总购电量</th><th>时间</th></tr><tr><td colspan="6">暂无记录</td></tr></table>`
	rows, err := parseElectricityRecords(strings.NewReader(empty), "A01")
	if err != nil || rows == nil || len(rows) != 0 {
		t.Fatalf("valid empty table: %v %v", rows, err)
	}
	for _, page := range []string{`<html>维护中</html>`, `<table id="oTable"><tr><td>unrelated</td></tr></table>`, strings.ReplaceAll(electricityTestTable, "A01", "B02"), strings.Replace(electricityTestTable, "18.5", "broken", 1)} {
		if _, err := parseElectricityRecords(strings.NewReader(page), "A01"); err == nil {
			t.Fatal("malformed, unrelated or mismatched data accepted")
		}
	}
}

func TestElectricityErrorsDoNotRevealAddressOrRoom(t *testing.T) {
	s := newElectricityService(t.TempDir())
	if err := s.saveEntry(electricityTestEntry); err != nil {
		t.Fatal(err)
	}
	s.http = &http.Client{Transport: electricityRoundTrip(func(*http.Request) (*http.Response, error) {
		return nil, &url.Error{Op: "Post", URL: electricityTestEntry + "&roomName=A01", Err: io.ErrUnexpectedEOF}
	})}
	w := httptest.NewRecorder()
	s.handleQuery(w, httptest.NewRequest("POST", "/api/electricity/query", strings.NewReader(`{"client":"zone-a","building_id":"1001","room":"A01","from":"2026-10-18","to":"2026-10-24"}`)))
	if w.Code != 503 || strings.Contains(w.Body.String(), "10.20.") || strings.Contains(w.Body.String(), "A01") {
		t.Fatalf("unredacted error: %d %s", w.Code, w.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	bad := httptest.NewRecorder()
	s.handleQuery(bad, httptest.NewRequest("POST", "/api/electricity/query", strings.NewReader(`{"entry_url":"https://example.com","client":"zone-a","building_id":"1001","room":"A01","from":"2026-10-18","to":"2026-10-24"}`)))
	if bad.Code != 400 {
		t.Fatal("query accepted a caller-controlled target URL")
	}
}

func TestElectricityAnonymousClientBlocksRedirectAndUnsafeResolvedIP(t *testing.T) {
	c := newElectricityHTTPClient()
	if c.Jar != nil {
		t.Fatal("anonymous client must not retain school login")
	}
	base, _ := http.NewRequest("GET", electricityTestEntry, nil)
	foreign, _ := http.NewRequest("GET", "https://example.com/cgcSims/login.do", nil)
	if c.CheckRedirect(foreign, []*http.Request{base}) == nil {
		t.Fatal("cross-origin redirect allowed")
	}
	for _, addr := range []string{"127.0.0.1", "::1", "::ffff:127.0.0.1", "169.254.1.2", "0.0.0.0", "224.0.0.1"} {
		if electricityDialIPAllowed(addr) {
			t.Errorf("unsafe resolved IP accepted: %s", addr)
		}
	}
}

func TestElectricityMenusDecodeActualGB2312Encoding(t *testing.T) {
	s := newElectricityService(t.TempDir())
	if err := s.saveEntry(electricityTestEntry); err != nil {
		t.Fatal(err)
	}
	encoded, err := simplifiedchinese.GBK.NewEncoder().String(electricityTestMenu)
	if err != nil {
		t.Fatal(err)
	}
	s.http = &http.Client{Transport: electricityRoundTrip(func(*http.Request) (*http.Response, error) {
		response := electricityReply(encoded)
		response.Header.Set("Content-Type", "text/html; charset=gb2312")
		return response, nil
	})}
	out, err := s.options(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if out.Campuses[0].Name != "甲校区" || out.Buildings[0].Name != "第一栋" {
		t.Fatal("school GB2312 names were not decoded")
	}
}

func TestElectricityInvalidInputsDoNotContactSchool(t *testing.T) {
	s := newElectricityService(t.TempDir())
	if err := s.saveEntry(electricityTestEntry); err != nil {
		t.Fatal(err)
	}
	s.http = &http.Client{Transport: electricityRoundTrip(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid input reached school")
		return nil, io.EOF
	})}
	for _, in := range []electricityInput{
		{Client: "zone-a", BuildingID: "1001", Room: "", From: "2026-10-18", To: "2026-10-24"},
		{Client: "zone-a", BuildingID: "1001", Room: "A01", From: "2026-10-25", To: "2026-10-24"},
		{Client: "zone-a", BuildingID: "1001", Room: "A01", From: "2026-02-30", To: "2026-10-24"},
		{Client: "zone-a", BuildingID: "1001", Room: "A01", From: "2020-01-01", To: "2026-10-24"},
	} {
		if _, err := s.query(context.Background(), in); err == nil {
			t.Fatal("invalid query accepted")
		}
	}
}

func TestElectricitySchoolMustConfirmSelectedCampus(t *testing.T) {
	s := newElectricityService(t.TempDir())
	if err := s.saveEntry(electricityTestEntry); err != nil {
		t.Fatal(err)
	}
	s.http = &http.Client{Transport: electricityRoundTrip(func(*http.Request) (*http.Response, error) { return electricityReply(electricityTestMenu), nil })}
	if _, err := s.options(context.Background(), "zone-b"); err == nil {
		t.Fatal("old campus buildings were relabeled as requested campus")
	}
}

func TestElectricitySchoolDenialAndRedirectAreNotNetworkSuccess(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusFound, http.StatusInternalServerError} {
		s := newElectricityService(t.TempDir())
		if err := s.saveEntry(electricityTestEntry); err != nil {
			t.Fatal(err)
		}
		s.http = &http.Client{Transport: electricityRoundTrip(func(*http.Request) (*http.Response, error) {
			r := electricityReply("private response")
			r.StatusCode = status
			return r, nil
		})}
		_, err := s.options(context.Background(), "")
		if err == nil || err == errElectricityNetwork {
			t.Fatalf("HTTP %d must have an explicit school response error", status)
		}
		if strings.Contains(err.Error(), "private response") {
			t.Fatal("school body escaped into error")
		}
	}
}

func TestElectricityMenuWithoutSelectedUsesHTMLDefault(t *testing.T) {
	s := newElectricityService(t.TempDir())
	if err := s.saveEntry(electricityTestEntry); err != nil {
		t.Fatal(err)
	}
	menu := strings.ReplaceAll(electricityTestMenu, " selected", "")
	s.http = &http.Client{Transport: electricityRoundTrip(func(*http.Request) (*http.Response, error) { return electricityReply(menu), nil })}
	out, err := s.options(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if out.Client != "zone-a" {
		t.Fatal("a select without selected must default to the first option")
	}
	if _, err := s.options(context.Background(), "zone-b"); err == nil {
		t.Fatal("requesting zone-b cannot override the page's default zone-a selection")
	}
}

func TestElectricityNumericRowWithMissingCellsIsNotEmpty(t *testing.T) {
	page := `<table id="oTable"><tr><th>序号</th><th>房间</th><th>剩余电量</th><th>总用电量</th><th>总购电量</th><th>时间</th></tr><tr><td>1</td><td>A01</td><td>12.5</td></tr></table>`
	if _, err := parseElectricityRecords(strings.NewReader(page), "A01"); err == nil {
		t.Fatal("truncated data row must not become an empty successful query")
	}
}
