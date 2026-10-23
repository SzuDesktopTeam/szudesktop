package ui

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestParseNoticeDetailFindsBodyAndAttachments(t *testing.T) {
	page := `<html><head><title>关于选课的通知</title></head><body>
	<div class="nav">首页 新闻 通知</div>
	<div class="v_news_content">
	  <p>各位同学：</p><p>下周一开放选课，请在系统内完成。</p><p>附件见下。</p>
	</div>
	<div class="footer">版权所有</div>
	<a href="/files/2026/kb.pdf">选课手册.pdf</a>
	<a href="https://example.com/x.pdf">站外文件</a>
	</body></html>`
	out, err := parseNoticeDetail(strings.NewReader(page), "https://jw.szu.edu.cn/notice/1.html")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.Body, "下周一开放选课") {
		t.Fatalf("正文没抓到: %q", out.Body)
	}
	if strings.Contains(out.Body, "版权所有") {
		t.Fatal("页脚不该混进正文")
	}
	if len(out.Attachments) != 1 {
		t.Fatalf("附件应只保留校内链接，实际 %d 个: %+v", len(out.Attachments), out.Attachments)
	}
	if !strings.HasSuffix(out.Attachments[0].URL, "/files/2026/kb.pdf") {
		t.Fatalf("附件地址没补全: %s", out.Attachments[0].URL)
	}
}

// 没有常见容器时，取文字最多的 div，而不是返回空。
func TestParseNoticeDetailFallsBackToLargestBlock(t *testing.T) {
	page := `<html><body><div>短</div><div><p>` +
		strings.Repeat("这是一段比较长的公告正文。", 10) + `</p></div></body></html>`
	out, err := parseNoticeDetail(strings.NewReader(page), "https://www.szu.edu.cn/a.html")
	if err != nil {
		t.Fatal(err)
	}
	if len([]rune(out.Body)) < 50 {
		t.Fatalf("回退策略没取到正文: %q", out.Body)
	}
}

// 非学校域名必须拒绝，不能变成任意 URL 抓取器。
func TestFetchNoticeDetailRejectsForeignHost(t *testing.T) {
	for _, raw := range []string{
		"https://example.com/a",
		"https://szu.edu.cn.evil.com/a",
		"file:///etc/passwd",
		"http://127.0.0.1:8080/",
	} {
		if _, err := fetchNoticeDetail(t.Context(), raw); err == nil {
			t.Fatalf("%s 应该被拒绝", raw)
		}
	}
}

func TestIsSchoolSiteURL(t *testing.T) {
	ok := []string{"https://www.szu.edu.cn/", "http://jw.szu.edu.cn/a", "https://szu.edu.cn/x"}
	bad := []string{"https://szu.edu.cn.evil.com/", "https://notszu.edu.cn/", "javascript:alert(1)", "https://user:password@ai.szu.edu.cn/info/1.htm", "https://ai.szu.edu.cn:8443/info/1.htm"}
	for _, u := range ok {
		if !isSchoolSiteURL(u) {
			t.Fatalf("%s 应该允许", u)
		}
	}
	for _, u := range bad {
		if isSchoolSiteURL(u) {
			t.Fatalf("%s 应该拒绝", u)
		}
	}
}

func TestNoticeDetailPrefersSemanticBodyOverPageWrapper(t *testing.T) {
	for _, tag := range []string{"article", "main"} {
		t.Run(tag, func(t *testing.T) {
			page := `<div><nav>导航栏</nav><` + tag + `><p>` + strings.Repeat("应当读取的公告正文。", 4) + `</p></` + tag + `><div>不属于公告正文的边栏文字。</div></div>`
			out, err := parseNoticeDetail(strings.NewReader(page), "https://ai.szu.edu.cn/info/1058/1.htm")
			if err != nil || !strings.Contains(out.Body, "应当读取") || strings.Contains(out.Body, "边栏文字") {
				t.Fatalf("semantic body lost to wrapper: out=%+v err=%v", out, err)
			}
		})
	}
}

func TestNoticeDetailFindsSchoolDownloadLinksWithoutFalseExtensions(t *testing.T) {
	page := `<article><p>` + strings.Repeat("真实公告内容。", 4) + `</p></article>
<a href="/system/resource/code/datainfobase/download.jsp?owner=1&amp;wbfileid=fixture-id">申请表</a>
<a href="/files/handbook.PDF">手册</a>
<a href="/search?q=manual.pdf">不是附件</a>
<a href="/files/manual.pdf.html">不是文件</a>`
	out, err := parseNoticeDetail(strings.NewReader(page), "https://ai.szu.edu.cn/info/1058/1.htm")
	if err != nil || len(out.Attachments) != 2 || out.Attachments[0].Name != "申请表" || !strings.Contains(out.Attachments[0].URL, "download.jsp?") {
		t.Fatalf("wrong attachment recognition: out=%+v err=%v", out, err)
	}
}

func TestNoticeDetailRejectsOversizedPages(t *testing.T) {
	_, err := parseNoticeDetail(strings.NewReader(`<article>`+strings.Repeat("x", (2<<20)+1)+`</article>`), "https://ai.szu.edu.cn/info/1058/1.htm")
	if err == nil || !strings.Contains(err.Error(), "过大") {
		t.Fatalf("oversized page should fail truthfully: %v", err)
	}
}

func TestFetchNoticeDetailKeepsRedirectsOnOriginalHTTPSHost(t *testing.T) {
	original := noticeClient
	t.Cleanup(func() { noticeClient = original })
	for _, target := range []string{"https://example.com/body", "https://other.szu.edu.cn/body", "http://ai.szu.edu.cn/body", "https://user:secret@ai.szu.edu.cn/body", "https://ai.szu.edu.cn:8443/body"} {
		t.Run(target, func(t *testing.T) {
			calls := 0
			client := *original
			client.Transport = noticeTransport(func(req *http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: http.StatusFound, Header: http.Header{"Location": {target}}, Body: io.NopCloser(strings.NewReader("")), Request: req}, nil
			})
			noticeClient = &client
			if _, err := fetchNoticeDetail(t.Context(), "https://ai.szu.edu.cn/start"); err == nil || calls != 1 {
				t.Fatalf("unsafe redirect must not be fetched: calls=%d err=%v", calls, err)
			}
		})
	}
	client := *original
	client.Transport = noticeTransport(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/start" {
			return &http.Response{StatusCode: http.StatusFound, Header: http.Header{"Location": {"/moved/body.htm"}}, Body: io.NopCloser(strings.NewReader("")), Request: req}, nil
		}
		body := `<article><p>` + strings.Repeat("实际公告正文。", 5) + `</p><a href="file.pdf">附件</a></article>`
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body)), Request: req}, nil
	})
	noticeClient = &client
	out, err := fetchNoticeDetail(t.Context(), "https://ai.szu.edu.cn/start")
	if err != nil || out.SourceURL != "https://ai.szu.edu.cn/moved/body.htm" || len(out.Attachments) != 1 || out.Attachments[0].URL != "https://ai.szu.edu.cn/moved/file.pdf" {
		t.Fatalf("source and attachments should follow the final school page: out=%+v err=%v", out, err)
	}
}
