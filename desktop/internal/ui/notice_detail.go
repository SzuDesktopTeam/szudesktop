package ui

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	xhtml "golang.org/x/net/html"
)

// 公告正文与附件。
//
// 学院站的 CMS 五花八门，没法给每个源写一套解析。这里用一套通用启发式：
// 先按常见正文容器找，找不到就取文字最多的那个 div。宁可少抓一点，
// 也不要把整个导航栏当成正文塞给用户。
//
// 只允许学校域名——否则这个接口就是个任意 URL 抓取器。

type noticeAttachment struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type noticeDetail struct {
	Title       string             `json:"title"`
	Body        string             `json:"body"`
	Attachments []noticeAttachment `json:"attachments"`
	SourceURL   string             `json:"source_url"`
}

// 常见 CMS 的正文容器，按可信度从高到低。
var noticeBodySelectors = []struct {
	tag   string
	class string
	id    string
}{
	{"div", "v_news_content", ""},
	{"div", "article-content", ""},
	{"div", "content", ""},
	{"div", "article", ""},
	{"article", "", ""},
	{"div", "", "content"},
	{"div", "", "vsb_content"},
	{"main", "", ""},
}

var noticeAttachmentExt = []string{".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar", ".7z"}

func isSchoolSiteURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return host == "szu.edu.cn" || strings.HasSuffix(host, ".szu.edu.cn")
}

func fetchNoticeDetail(ctx context.Context, raw string) (*noticeDetail, error) {
	if !isSchoolSiteURL(raw) {
		return nil, errors.New("只支持学校站点（szu.edu.cn）的公告页面")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", ehallUserAgent)
	res, err := (&http.Client{
		Timeout:   20 * time.Second,
		Transport: &http.Transport{Proxy: nil},
	}).Do(req)
	if err != nil {
		return nil, errors.New("学校页面暂时打不开，请稍后再试")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, errors.New("学校页面返回异常，请稍后再试")
	}
	return parseNoticeDetail(res.Body, raw)
}

func parseNoticeDetail(body io.Reader, sourceURL string) (*noticeDetail, error) {
	doc, err := xhtml.Parse(body)
	if err != nil {
		return nil, errors.New("页面结构异常，未能解析")
	}
	base, _ := url.Parse(sourceURL)

	out := &noticeDetail{SourceURL: sourceURL}
	if h := findFirst(doc, "h1"); h != nil {
		out.Title = strings.TrimSpace(nodeText(h))
	}
	if out.Title == "" {
		if t := findFirst(doc, "title"); t != nil {
			out.Title = strings.TrimSpace(nodeText(t))
		}
	}

	block := findNoticeBody(doc)
	if block != nil {
		out.Body = cleanNoticeText(block)
	}
	out.Attachments = collectAttachments(doc, base)

	if out.Body == "" && len(out.Attachments) == 0 {
		return nil, errors.New("这页没有读出正文，可能在框架里或被脚本渲染；请点原文链接查看")
	}
	return out, nil
}

func findFirst(n *xhtml.Node, tag string) *xhtml.Node {
	if n.Type == xhtml.ElementNode && n.Data == tag {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if found := findFirst(c, tag); found != nil {
			return found
		}
	}
	return nil
}

// findNoticeBody 先按常见容器找，找不到就挑文字最多的 div。
func findNoticeBody(doc *xhtml.Node) *xhtml.Node {
	for _, sel := range noticeBodySelectors {
		if n := matchSelector(doc, sel.tag, sel.class, sel.id); n != nil {
			if len([]rune(cleanNoticeText(n))) >= 20 {
				return n
			}
		}
	}
	var best *xhtml.Node
	bestLen := 0
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n.Type == xhtml.ElementNode && n.Data == "div" {
			if l := len([]rune(cleanNoticeText(n))); l > bestLen {
				best, bestLen = n, l
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return best
}

func matchSelector(n *xhtml.Node, tag, class, id string) *xhtml.Node {
	if n.Type == xhtml.ElementNode && n.Data == tag {
		okClass := class == "" || hasClass(n, class)
		okID := id == "" || nodeAttr(n, "id") == id
		if okClass && okID && (class != "" || id != "") {
			return n
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if found := matchSelector(c, tag, class, id); found != nil {
			return found
		}
	}
	return nil
}

func hasClass(n *xhtml.Node, want string) bool {
	for _, c := range strings.Fields(nodeAttr(n, "class")) {
		if c == want {
			return true
		}
	}
	return false
}

func nodeAttr(n *xhtml.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

// cleanNoticeText 丢掉脚本、样式和导航块，把正文压成可读的段落。
func cleanNoticeText(n *xhtml.Node) string {
	var b strings.Builder
	var walk func(*xhtml.Node)
	walk = func(x *xhtml.Node) {
		if x.Type == xhtml.ElementNode {
			switch x.Data {
			case "script", "style", "nav", "header", "footer", "form", "noscript":
				return
			case "p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4":
				b.WriteString("\n")
			}
		}
		if x.Type == xhtml.TextNode {
			b.WriteString(x.Data)
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	lines := strings.Split(b.String(), "\n")
	var kept []string
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), " ")
		if line != "" {
			kept = append(kept, line)
		}
	}
	return strings.Join(kept, "\n")
}

func collectAttachments(doc *xhtml.Node, base *url.URL) []noticeAttachment {
	var out []noticeAttachment
	seen := map[string]bool{}
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n.Type == xhtml.ElementNode && n.Data == "a" {
			href := nodeAttr(n, "href")
			if href != "" {
				lower := strings.ToLower(href)
				for _, ext := range noticeAttachmentExt {
					if strings.Contains(lower, ext) {
						abs := resolveURL(base, href)
						if abs != "" && !seen[abs] {
							seen[abs] = true
							name := strings.TrimSpace(nodeText(n))
							if name == "" {
								name = abs[strings.LastIndex(abs, "/")+1:]
							}
							out = append(out, noticeAttachment{Name: name, URL: abs})
						}
						break
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return out
}

func resolveURL(base *url.URL, href string) string {
	u, err := url.Parse(strings.TrimSpace(href))
	if err != nil {
		return ""
	}
	if base != nil {
		u = base.ResolveReference(u)
	}
	if !isSchoolSiteURL(u.String()) {
		return ""
	}
	return u.String()
}

func (s *Server) handleNoticeDetail(w http.ResponseWriter, r *http.Request) {
	out, err := fetchNoticeDetail(r.Context(), r.URL.Query().Get("url"))
	if err != nil {
		writeAPIError(w, 400, err)
		return
	}
	writeJSON(w, out)
}
