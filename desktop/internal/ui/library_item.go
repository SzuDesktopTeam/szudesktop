package ui

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	xhtml "golang.org/x/net/html"
)

// 图书馆馆藏详情。
//
// bookinfo.aspx?ctrlno=<编号> 是公开页，不需要登录。表头固定为：
// 馆藏地(排/架参考) / 索取号 / 登录号 / 卷期 / 年代 / 状态 / 借阅类型。
// 「馆藏地」里已经带了排架位置，找书时直接照这个走。

const libraryItemURL = "https://www.lib.szu.edu.cn/opac/bookinfo.aspx"

type libraryCopy struct {
	Location string `json:"location"`
	CallNo   string `json:"call_no"`
	Barcode  string `json:"barcode"`
	Volume   string `json:"volume,omitempty"`
	Year     string `json:"year,omitempty"`
	Status   string `json:"status"`
	LoanType string `json:"loan_type,omitempty"`
}

type libraryItem struct {
	CtrlNo    string        `json:"ctrl_no"`
	Title     string        `json:"title"`
	Copies    []libraryCopy `json:"copies"`
	SourceURL string        `json:"source_url"`
}

var ctrlNoRe = regexp.MustCompile(`\d{1,12}`)

func fetchLibraryItem(ctx context.Context, ctrlNo string) (*libraryItem, error) {
	ctrlNo = strings.TrimSpace(ctrlNo)
	if !ctrlNoRe.MatchString(ctrlNo) || ctrlNoRe.FindString(ctrlNo) != ctrlNo {
		return nil, errors.New("书目编号不正确")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, libraryItemURL+"?ctrlno="+url.QueryEscape(ctrlNo), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", ehallUserAgent)
	res, err := libraryClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("图书馆暂时连不上：%w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("图书馆返回 %d，请稍后再试", res.StatusCode)
	}
	return parseLibraryItem(res.Body, ctrlNo)
}

func parseLibraryItem(body io.Reader, ctrlNo string) (*libraryItem, error) {
	doc, err := xhtml.Parse(body)
	if err != nil {
		return nil, errors.New("图书馆页面结构异常，未能解析")
	}
	out := &libraryItem{CtrlNo: ctrlNo, SourceURL: libraryItemURL + "?ctrlno=" + ctrlNo}

	if n := findFirst(doc, "title"); n != nil {
		out.Title = strings.TrimSpace(nodeText(n))
	}

	// 找到表头含「索取号」的那张表。
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if out.Copies != nil && len(out.Copies) > 0 {
			return
		}
		if n.Type == xhtml.ElementNode && n.Data == "table" {
			if copies := parseCopyTable(n); len(copies) > 0 {
				out.Copies = copies
				return
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if len(out.Copies) == 0 {
		return nil, errors.New("这页没有读出馆藏信息，可能在闭架库里；请到图书馆原页查看")
	}
	return out, nil
}

// parseCopyTable 只认表头里同时出现「索取号」和「状态」的表，
// 避免把导航表、分页表当成馆藏。
func parseCopyTable(table *xhtml.Node) []libraryCopy {
	var rows []*xhtml.Node
	var collect func(*xhtml.Node)
	collect = func(n *xhtml.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == xhtml.ElementNode && c.Data == "tr" {
				rows = append(rows, c)
			} else if c.Type == xhtml.ElementNode {
				collect(c)
			}
		}
	}
	collect(table)
	if len(rows) < 2 {
		return nil
	}

	head := tableCells(rows[0])
	idx := map[string]int{}
	for i, h := range head {
		switch {
		case strings.Contains(h, "馆藏地"):
			idx["location"] = i
		case strings.Contains(h, "索取号"):
			idx["callno"] = i
		case strings.Contains(h, "登录号"):
			idx["barcode"] = i
		case strings.Contains(h, "卷期"):
			idx["volume"] = i
		case strings.Contains(h, "年代"):
			idx["year"] = i
		case strings.Contains(h, "状态"):
			idx["status"] = i
		case strings.Contains(h, "借阅类型"):
			idx["loan"] = i
		}
	}
	if _, ok := idx["callno"]; !ok {
		return nil
	}
	if _, ok := idx["status"]; !ok {
		return nil
	}

	pick := func(cells []string, key string) string {
		if i, ok := idx[key]; ok && i < len(cells) {
			return cells[i]
		}
		return ""
	}

	var out []libraryCopy
	for _, row := range rows[1:] {
		cells := tableCells(row)
		if len(cells) < 2 {
			continue
		}
		cp := libraryCopy{
			Location: pick(cells, "location"),
			CallNo:   pick(cells, "callno"),
			Barcode:  pick(cells, "barcode"),
			Volume:   pick(cells, "volume"),
			Year:     pick(cells, "year"),
			Status:   pick(cells, "status"),
			LoanType: pick(cells, "loan"),
		}
		if cp.CallNo == "" && cp.Status == "" {
			continue
		}
		out = append(out, cp)
	}
	return out
}

func (s *Server) handleLibraryItem(w http.ResponseWriter, r *http.Request) {
	out, err := fetchLibraryItem(r.Context(), r.URL.Query().Get("ctrlno"))
	if err != nil {
		writeAPIError(w, 502, err)
		return
	}
	writeJSON(w, out)
}
