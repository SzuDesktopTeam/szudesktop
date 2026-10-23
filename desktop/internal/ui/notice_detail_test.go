package ui

import (
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
	bad := []string{"https://szu.edu.cn.evil.com/", "https://notszu.edu.cn/", "javascript:alert(1)"}
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
