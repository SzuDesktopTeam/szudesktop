package ui

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	xhtml "golang.org/x/net/html"
)

// 图书馆 OPAC。
//
// 搜索是匿名的，不需要登录；「我的借阅」要 CAS（userinfo.aspx 会 302 到
// authserver）。这里只做搜索，借阅等学校窗口的会话接稳了再说。
//
// 页面是 ASP.NET WebForms，但搜索走 searchresult.aspx 的 GET 参数，
// 不必去凑 VIEWSTATE。

const librarySearchURL = "https://www.lib.szu.edu.cn/opac/searchresult.aspx"

type libraryBook struct {
	CtrlNo    string `json:"ctrl_no,omitempty"`
	Title     string `json:"title"`
	Author    string `json:"author"`
	Publisher string `json:"publisher"`
	Year      string `json:"year,omitempty"`
	CallNo    string `json:"call_no,omitempty"`
}

type libraryResult struct {
	Keyword   string        `json:"keyword"`
	Items     []libraryBook `json:"items"`
	Page      int           `json:"page"`
	FetchedAt time.Time     `json:"fetched_at"`
}

// libraryClient 只访问图书馆站点，强制直连（和学校其它请求一致，走代理会断）。
func libraryClient() *http.Client {
	return &http.Client{
		Timeout:   20 * time.Second,
		Transport: &http.Transport{Proxy: nil},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func fetchLibrarySearch(ctx context.Context, keyword string, page int) (*libraryResult, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" || len([]rune(keyword)) > 60 {
		return nil, errors.New("请输入 1–60 个字的检索词")
	}
	if page < 1 {
		page = 1
	}
	q := url.Values{}
	q.Set("dt", "ALL")
	q.Set("cl", "ALL")
	q.Set("dp", "20")
	q.Set("sf", "M_PUB_YEAR")
	q.Set("ob", "DESC")
	q.Set("sm", "table")
	q.Set("dept", "ALL")
	q.Set("anywords", keyword)
	q.Set("ecx", "1")
	q.Set("efz", "1")
	if page > 1 {
		q.Set("page", strconv.Itoa(page))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, librarySearchURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", ehallUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	res, err := libraryClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("图书馆暂时连不上：%w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("图书馆返回 %d，请稍后再试", res.StatusCode)
	}
	items, err := parseLibraryRows(res.Body)
	if err != nil {
		return nil, err
	}
	return &libraryResult{Keyword: keyword, Items: items, Page: page, FetchedAt: time.Now().UTC()}, nil
}

// parseLibraryRows 从结果表里取「序号 / 题名 / 责任者 / 出版者」四列。
// 表头行用「题名」认出来，不靠行号——学校改版时表头比顺序稳。
func parseLibraryRows(body io.Reader) ([]libraryBook, error) {
	doc, err := xhtml.Parse(body)
	if err != nil {
		return nil, errors.New("图书馆页面结构异常，未能解析")
	}
	var out []libraryBook
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n.Type == xhtml.ElementNode && n.Data == "tr" {
			cells := tableCells(n)
			if len(cells) >= 3 && cells[1] != "" && cells[1] != "题名" {
				book := libraryBook{Title: cells[1], CtrlNo: ctrlNoFromRow(n)}
				if len(cells) > 2 {
					book.Author = cells[2]
				}
				if len(cells) > 3 {
					book.Publisher = cells[3]
				}
				out = append(out, book)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	if len(out) == 0 {
		return nil, errors.New("没有检索到结果；也可能是学校页面改版了，请到图书馆原页核对")
	}
	return out, nil
}

func tableCells(tr *xhtml.Node) []string {
	var cells []string
	for c := tr.FirstChild; c != nil; c = c.NextSibling {
		if c.Type != xhtml.ElementNode || (c.Data != "td" && c.Data != "th") {
			continue
		}
		cells = append(cells, strings.TrimSpace(nodeText(c)))
	}
	return cells
}

func nodeText(n *xhtml.Node) string {
	var b strings.Builder
	var walk func(*xhtml.Node)
	walk = func(x *xhtml.Node) {
		if x.Type == xhtml.TextNode {
			b.WriteString(x.Data)
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	// 表里常有全角空格和换行，压成单个空格。
	return strings.Join(strings.Fields(b.String()), " ")
}

func (s *Server) handleLibrarySearch(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	out, err := fetchLibrarySearch(r.Context(), r.URL.Query().Get("q"), page)
	if err != nil {
		writeAPIError(w, 502, err)
		return
	}
	writeJSON(w, out)
}

// ctrlNoFromRow 从书名的链接里取书目编号（bookinfo.aspx?ctrlno=123）。
func ctrlNoFromRow(row *xhtml.Node) string {
	var found string
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if found != "" {
			return
		}
		if n.Type == xhtml.ElementNode && n.Data == "a" {
			if href := nodeAttr(n, "href"); strings.Contains(href, "ctrlno=") {
				if i := strings.Index(href, "ctrlno="); i >= 0 {
					v := href[i+7:]
					if j := strings.IndexAny(v, "&#"); j >= 0 {
						v = v[:j]
					}
					found = strings.TrimSpace(v)
					return
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(row)
	return found
}
