package ui

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestNoticeSearchCapabilitiesTellTheUIItsActualScope(t *testing.T) {
	w := httptest.NewRecorder()
	(&Server{}).handleCampusNoticeSources(w, httptest.NewRequest("GET", "/api/campus/notice-sources", nil))
	var catalog struct {
		Sources []struct {
			ID   string `json:"id"`
			Mode string `json:"search_mode"`
		} `json:"sources"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &catalog); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"college-ai": "official", "college-cmse": "loaded_titles", "college-csse": "unavailable"}
	for _, source := range catalog.Sources {
		if mode, exists := want[source.ID]; exists {
			if source.Mode != mode {
				t.Errorf("%s search mode = %q, want %q", source.ID, source.Mode, mode)
			}
			delete(want, source.ID)
		}
	}
	if len(want) != 0 {
		t.Fatal("catalog lost required sources", want)
	}
}

func TestNoticeSearchRequestsTheOfficialColumnAndPage(t *testing.T) {
	old := noticeClient
	t.Cleanup(func() { noticeClient = old })
	calls := 0
	noticeClient = &http.Client{Transport: noticeTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Cookie") != "" || r.URL.Host != "ai.szu.edu.cn" {
			t.Fatal("anonymous search escaped the preset school source", r.URL)
		}
		body := `<script>var appOwner = "2128551764"; _jsq_(1058,'/list.jsp',-1,2128551764)</script>`
		if r.Method == http.MethodPost {
			if r.URL.Path != "/aop_component//webber/search/search/search/queryPage" || r.Header.Get("Authorization") != "tourist" || r.Header.Get("owner") != "2128551764" {
				t.Fatal("wrong official search contract", r.URL, r.Header)
			}
			var query struct {
				Keyword string                      `json:"keyWord"`
				Scope   string                      `json:"searchScope"`
				Owner   string                      `json:"owner"`
				Filter  map[string][]string         `json:"filterTerm"`
				Page    struct{ Current, Size int } `json:"page"`
			}
			if err := json.NewDecoder(r.Body).Decode(&query); err != nil {
				t.Fatal(err)
			}
			if query.Keyword != "通知" || query.Scope != "3" || query.Owner != "2128551764" || len(query.Filter["column"]) != 1 || query.Filter["column"][0] != "1058" || query.Page.Current != 1 || query.Page.Size != 12 {
				t.Fatalf("search changed its keyword, scope or page: %+v", query)
			}
			body = `{"code":"0000","data":{"page":{"current":1,"size":12,"total":25,"records":[{"title":"AI &amp; <span>通知</span><script>hidden</script>","url":"//ai.szu.edu.cn/info/1058/1014.htm","createDate":"2026-10-20 12:00:00"},{"title":"外部通知","url":"https://mp.weixin.qq.com/s/example","createDate":"2026-10-19 12:00:00"},{"title":"危险链接","url":"javascript:alert(1)"}]}}}`
		} else if r.URL.Path != "/xwzx/tzgg.htm" {
			t.Fatal("read an unconfigured discovery page", r.URL)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	w := httptest.NewRecorder()
	(&Server{}).handleCampusNoticeSearch(w, httptest.NewRequest("GET", "/api/campus/notices/search?source=college-ai&q=%E9%80%9A%E7%9F%A5&scope=fulltext&page=2&owner=evil&host=evil.test", nil))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var out noticeSearchResult
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if calls != 2 || out.Scope != "fulltext" || out.Range != "column" || out.Page != 2 || out.Total != 25 || out.PageSize != 12 || out.FetchedAt.IsZero() || len(out.Items) != 2 {
		t.Fatalf("lost search scope or pagination: %+v, calls=%d", out, calls)
	}
	if out.Items[0].Title != "AI & 通知" || out.Items[0].URL != "https://ai.szu.edu.cn/info/1058/1014.htm" || out.Items[0].Date != "2026-10-20" || !out.Items[0].CanRead || out.Items[1].CanRead {
		t.Fatalf("unsafe or misleading search items: %+v", out.Items)
	}
}

func TestNoticeSearchHomePageIsAnExplicitSiteSearch(t *testing.T) {
	old := noticeClient
	t.Cleanup(func() { noticeClient = old })
	noticeClient = &http.Client{Transport: noticeTransport(func(r *http.Request) (*http.Response, error) {
		body := `<script>var appOwner="1941225227"; _jsq_(1001,'/index.jsp',-1,1941225227)</script>`
		if r.Method == http.MethodPost {
			var query struct {
				Filter map[string][]string `json:"filterTerm"`
			}
			if err := json.NewDecoder(r.Body).Decode(&query); err != nil {
				t.Fatal(err)
			}
			if len(query.Filter["column"]) != 0 {
				t.Fatal("homepage is not one notice column", query)
			}
			body = `{"code":"0000","data":{"page":{"current":0,"size":12,"total":0,"records":null}}}`
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	w := httptest.NewRecorder()
	(&Server{}).handleCampusNoticeSearch(w, httptest.NewRequest("GET", "/api/campus/notices/search?source=graduate&q=abc", nil))
	var out noticeSearchResult
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || out.Range != "site" || !strings.Contains(out.RangeLabel, "网站") || out.Scope != "title" || out.Total != 0 || out.Items == nil {
		t.Fatal("site range or legitimate empty search was misreported", w.Code, w.Body.String())
	}
}

func TestNoticeSearchMovedColumnNeverClaimsTheHomePageIsANoticeColumn(t *testing.T) {
	old := noticeClient
	t.Cleanup(func() { noticeClient = old })
	noticeClient = &http.Client{Transport: noticeTransport(func(r *http.Request) (*http.Response, error) {
		body := `<script>var appOwner="2128551764"; _jsq_(1001,'/index.jsp',-1,2128551764)</script>`
		if r.Method == http.MethodPost {
			body = `{"code":"0000","data":{"page":{"current":0,"size":12,"total":0,"records":[]}}}`
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	out, err := fetchNoticeSearch(t.Context(), noticeSources["college-ai"], "通知", "title", 1)
	if err != nil {
		t.Fatal(err)
	}
	if out.Range != "site" {
		t.Fatalf("home page metadata became a complete column search: %+v", out)
	}
}

func TestNoticeSearchInvalidInputAndUnsupportedSourcesNeverFetch(t *testing.T) {
	old := noticeClient
	t.Cleanup(func() { noticeClient = old })
	noticeClient = &http.Client{Transport: noticeTransport(func(r *http.Request) (*http.Response, error) {
		t.Fatal("invalid query made a school request", r.URL)
		return nil, nil
	})}
	for _, query := range []string{
		"source=https://evil.test&q=notice", "source=college-ai&q=", "source=college-ai&q=x&scope=everything", "source=college-ai&q=x&page=0", "source=college-ai&q=x&page=1.2", "source=college-ai&q=x&page=1001", "source=college-ai&q=" + strings.Repeat("a", 81),
	} {
		w := httptest.NewRecorder()
		(&Server{}).handleCampusNoticeSearch(w, httptest.NewRequest("GET", "/api/campus/notices/search?"+query, nil))
		if w.Code != 400 {
			t.Fatal(query, w.Code, w.Body.String())
		}
	}
	for _, source := range []string{"college-cmse", "college-csse"} {
		w := httptest.NewRecorder()
		(&Server{}).handleCampusNoticeSearch(w, httptest.NewRequest("GET", "/api/campus/notices/search?source="+source+"&q=x", nil))
		if w.Code != 501 {
			t.Fatal("unsupported source pretended to search", source, w.Code, w.Body.String())
		}
	}
}

func TestNoticeSearchFailureNeverPretendsToBeAnEmptyOrLocalSearch(t *testing.T) {
	for _, response := range []string{`<html>search widget removed</html>`, strings.Repeat("x", (2<<20)+1), `<script>var appOwner="2128551764";_jsq_(1058,'/list.jsp',-1,999)</script>`} {
		t.Run("missing_or_changed_metadata", func(t *testing.T) {
			old := noticeClient
			t.Cleanup(func() { noticeClient = old })
			noticeClient = &http.Client{Transport: noticeTransport(func(r *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(response))}, nil
			})}
			w := httptest.NewRecorder()
			(&Server{}).handleCampusNoticeSearch(w, httptest.NewRequest("GET", "/api/campus/notices/search?source=college-ai&q=x", nil))
			if w.Code != 503 {
				t.Fatal("broken metadata became a successful search", w.Code, w.Body.String())
			}
		})
	}
}

func TestNoticeSearchLinksRejectCredentialsAndUnexpectedPorts(t *testing.T) {
	base, _ := url.Parse("https://ai.szu.edu.cn/xwzx/tzgg.htm")
	for _, raw := range []string{"https://user:password@ai.szu.edu.cn/info/1/2.htm", "https://ai.szu.edu.cn:80/info/1/2.htm", "https://mp.weixin.qq.com:80/s/x", "http://ai.szu.edu.cn:443/info/1/2.htm", "https://ai.szu.edu.cn:8443/info/1/2.htm"} {
		if address, _ := noticeSearchURL(raw, base); address != "" {
			t.Errorf("unsafe search URL accepted: %s", raw)
		}
	}
	if address, canRead := noticeSearchURL("http://ai.szu.edu.cn:80/info/1/2.htm", base); address != "https://ai.szu.edu.cn/info/1/2.htm" || !canRead {
		t.Fatal("legacy school link should upgrade to the preset HTTPS origin", address, canRead)
	}
}

// Explicit opt-in only: CI remains offline, while maintainers can repeat the
// anonymous public-source checks without opening a school account session.
func TestNoticeSearchPublicLive(t *testing.T) {
	if os.Getenv("SZUDESKTOP_LIVE_NOTICE_SEARCH") != "1" {
		t.Skip("set SZUDESKTOP_LIVE_NOTICE_SEARCH=1 to query the public school search")
	}
	for _, check := range []struct {
		source, query, scope, searchRange string
		page                              int
	}{
		{"college-law", "公示", "title", "column", 1},
		{"college-law", "公示", "title", "column", 2},
		{"college-ai", "通知", "fulltext", "column", 1},
		{"graduate", "培养", "title", "site", 1},
		{"graduate", "培养", "title", "site", 2},
	} {
		t.Run(check.source+"_"+check.scope+"_"+string(rune('0'+check.page)), func(t *testing.T) {
			out, err := fetchNoticeSearch(t.Context(), noticeSources[check.source], check.query, check.scope, check.page)
			if err != nil {
				t.Fatal(err)
			}
			if out.Range != check.searchRange || out.Page != check.page || out.Scope != check.scope || out.FetchedAt.IsZero() {
				t.Fatalf("wrong live range/page: %+v", out)
			}
			t.Logf("public search source=%s scope=%s range=%s page=%d total=%d items=%d", check.source, out.Scope, out.Range, out.Page, out.Total, len(out.Items))
		})
	}
}
