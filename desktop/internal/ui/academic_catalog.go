package ui

// eHall paths, query fields and mappings adapted from AwesomeHou/szu-cli 0.2.14
// src/modules/{timetable,program}{,-parser}.js (https://github.com/AwesomeHou/szu-cli).
// MIT License
// Copyright (c) 2026 SZU CLI contributors
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	catalogTimetableHome = "/jwapp/sys/kcbcx/*default/index.do"
	catalogTimetablePath = "/jwapp/sys/kcbcx/modules/bjkcb/"
	catalogProgramHome   = "/jwapp/sys/qxfacx/*default/index.do"
	catalogProgramPath   = "/jwapp/sys/qxfacx/modules/pyfacxepg/"
)

var errCatalogNotFound = errors.New("学校没有返回所选班级或培养方案，请重新查询列表")

func catalogPathAllowed(p string) bool {
	switch p {
	case catalogTimetableHome, catalogProgramHome,
		catalogTimetablePath + "xtcscx.do", catalogTimetablePath + "dqzc.do", catalogTimetablePath + "bjcx.do",
		catalogTimetablePath + "bjkcb.do", catalogTimetablePath + "bjdkkc.do", catalogTimetablePath + "bjsjkcb.do", catalogTimetablePath + "bjwpkc.do",
		catalogProgramPath + "qxpyfacx.do", catalogProgramPath + "kzcx.do", catalogProgramPath + "kzkccx.do":
		return true
	}
	return false
}

type catalogRange struct {
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
	Returned int    `json:"returned"`
	Total    *int   `json:"total"`
	Complete bool   `json:"complete"`
	HasNext  bool   `json:"has_next"`
	Note     string `json:"note"`
}
type catalogMeta struct {
	SourceURL string       `json:"source_url"`
	FetchedAt time.Time    `json:"fetched_at"`
	Range     catalogRange `json:"range"`
}
type catalogQuery struct {
	Term, Keyword, Grade, Department, Major string
	Page, PageSize                          int
}
type catalogTerm struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type catalogTermsResult struct {
	catalogMeta
	Items []catalogTerm `json:"items"`
}
type catalogClass struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	Grade      string `json:"grade"`
	Department string `json:"department"`
	Major      string `json:"major"`
}
type catalogClassesResult struct {
	catalogMeta
	Term     string         `json:"term"`
	Items    []catalogClass `json:"items"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
	Total    *int           `json:"total"`
}
type catalogCourse struct {
	Code         string `json:"code"`
	Name         string `json:"name"`
	Section      string `json:"section"`
	Teacher      string `json:"teacher"`
	Weeks        string `json:"weeks"`
	Weekday      *int   `json:"weekday"`
	StartSection *int   `json:"start_section"`
	EndSection   *int   `json:"end_section"`
	Location     string `json:"location"`
	Campus       string `json:"campus"`
	Arrangement  string `json:"arrangement"`
}
type catalogTimetableResult struct {
	catalogMeta
	Term        string                  `json:"term"`
	CurrentWeek *int                    `json:"current_week"`
	Class       catalogClass            `json:"class"`
	Scheduled   []catalogCourse         `json:"scheduled"`
	Adjustments []catalogCourse         `json:"adjustments"`
	Practicals  []catalogCourse         `json:"practicals"`
	Unarranged  []catalogCourse         `json:"unarranged"`
	Ranges      map[string]catalogRange `json:"ranges"`
}
type catalogProgram struct {
	Code           string   `json:"code"`
	Title          string   `json:"title"`
	Grade          string   `json:"grade"`
	Department     string   `json:"department"`
	Major          string   `json:"major"`
	Direction      string   `json:"direction"`
	MinimumCredits *float64 `json:"minimum_credits"`
	DurationYears  *float64 `json:"duration_years"`
	Degree         string   `json:"degree"`
}
type catalogProgramsResult struct {
	catalogMeta
	Items    []catalogProgram `json:"items"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
	Total    *int             `json:"total"`
}
type catalogProgramDetail struct {
	Objectives   string   `json:"objectives"`
	Requirements string   `json:"requirements"`
	Subjects     string   `json:"subjects"`
	CoreCourses  string   `json:"core_courses"`
	Notes        []string `json:"notes"`
	Features     string   `json:"features"`
}
type catalogModule struct {
	Code            string   `json:"code"`
	ParentCode      string   `json:"parent_code"`
	Name            string   `json:"name"`
	Type            string   `json:"type"`
	Category        string   `json:"category"`
	RequiredCredits *float64 `json:"required_credits"`
	TotalCredits    *float64 `json:"total_credits"`
	Hours           *float64 `json:"hours"`
	CourseCount     *float64 `json:"course_count"`
}
type catalogProgramCourse struct {
	ModuleCode          string   `json:"module_code"`
	Code                string   `json:"code"`
	Name                string   `json:"name"`
	Credits             *float64 `json:"credits"`
	Hours               *float64 `json:"hours"`
	Term                string   `json:"term"`
	RecommendedSemester *float64 `json:"recommended_semester"`
	Nature              string   `json:"nature"`
	ExamType            string   `json:"exam_type"`
	Core                *bool    `json:"core"`
}
type catalogProgramResult struct {
	catalogMeta
	Summary catalogProgram          `json:"summary"`
	Detail  catalogProgramDetail    `json:"detail"`
	Modules []catalogModule         `json:"modules"`
	Courses []catalogProgramCourse  `json:"courses"`
	Ranges  map[string]catalogRange `json:"ranges"`
}

func catalogMetadata(home string, span catalogRange) catalogMeta {
	return catalogMeta{SourceURL: ehallBaseURL + home, FetchedAt: time.Now().UTC(), Range: span}
}

// Only read-only, explicitly enumerated app pages may establish eHall context.
// The older generic getContext classifies a 403 as expiry; here permissions are
// kept distinct so a forbidden app does not erase a still-valid CAS session.
func catalogOpen(ctx context.Context, c *ehallClient, home string) error {
	if home != catalogTimetableHome && home != catalogProgramHome {
		return errUnsafeEhallURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+home, nil)
	if err != nil {
		return errors.New("无法创建学校查询")
	}
	req.Header.Set("User-Agent", ehallUserAgent)
	if !c.usesJar {
		req.Header.Set("Cookie", c.cookie)
	}
	res, err := c.http.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if errors.Is(err, errSessionExpired) {
			return errSessionExpired
		}
		return schoolConnectionError("学校查询暂时无法连接", "学校查询暂时无法连接，请检查网络后重试", req.URL, err)
	}
	defer res.Body.Close()
	if res.StatusCode == 401 {
		return errSessionExpired
	}
	if res.StatusCode == 403 {
		return errSessionPermission
	}
	if res.StatusCode != 200 {
		return errors.New("学校查询入口暂时无法打开")
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, ehallMaxBody+1))
	if err != nil || len(body) > ehallMaxBody {
		return errors.New("学校查询入口未能完整读取")
	}
	if strings.Contains(string(body), "统一身份认证") || casLoginFormRe.Match(body) {
		return errSessionExpired
	}
	if res.Request != nil && res.Request.URL != nil && res.Request.URL.Host != req.URL.Host {
		return errSessionExpired
	}
	return nil
}

func catalogCondition(name, builder, value string) map[string]string {
	return map[string]string{"name": name, "caption": "", "builder": builder, "linkOpt": "AND", "value": value}
}
func catalogListForm(q catalogQuery, program bool) url.Values {
	conditions := []map[string]string{}
	keyword, grade, department := "BJMC", "NJ", "YXDM_DISPLAY"
	if program {
		keyword, grade, department = "PYFAMC", "NJDM", "DWDM_DISPLAY"
		conditions = append(conditions, catalogCondition("FAZTDM", "equal", "99"))
	}
	if q.Keyword != "" {
		conditions = append(conditions, catalogCondition(keyword, "include", q.Keyword))
	}
	if q.Grade != "" {
		conditions = append(conditions, catalogCondition(grade, "equal", strings.TrimSuffix(q.Grade, "级")))
	}
	if q.Department != "" {
		conditions = append(conditions, catalogCondition(department, "include", q.Department))
	}
	if q.Major != "" {
		conditions = append(conditions, catalogCondition("ZYDM_DISPLAY", "include", q.Major))
	}
	b, _ := json.Marshal(conditions)
	form := url.Values{"pageNumber": {strconv.Itoa(q.Page)}, "pageSize": {strconv.Itoa(q.PageSize)}, "querySetting": {string(b)}}
	if program {
		form.Set("*order", "-NJDM,+DWDM,+ZYDM")
	} else {
		form.Set("XNXQDM", q.Term)
		form.Set("SFSY", "1")
		form.Set("SFYPK", "1")
		form.Set("*order", "-NJ,+YXPX,+ZYPX,+PX")
	}
	return form
}

// Presence of rows is essential: a renamed/missing dataset never means empty.
func catalogPage(ctx context.Context, c *ehallClient, p, dataset string, form url.Values) ([]map[string]any, catalogRange, error) {
	body, err := c.postFormContext(ctx, p, form)
	if err != nil {
		return nil, catalogRange{}, err
	}
	page, err := parseEhallPage(body, dataset)
	if err != nil {
		return nil, catalogRange{}, err
	}
	number, _ := strconv.Atoi(form.Get("pageNumber"))
	if number == 0 {
		number = 1
	}
	size, _ := strconv.Atoi(form.Get("pageSize"))
	if size == 0 {
		size = 200
	}
	var envelope struct {
		Datas map[string]map[string]json.RawMessage `json:"datas"`
	}
	_ = json.Unmarshal(body, &envelope)
	for key, target := range map[string]*int{"pageNumber": &number, "pageSize": &size} {
		if raw := envelope.Datas[dataset][key]; len(raw) > 0 && string(raw) != "null" {
			text := strings.Trim(string(raw), `"`)
			value, e := strconv.Atoi(text)
			if e != nil || value < 1 {
				return nil, catalogRange{}, errors.New("学校返回的分页信息无法识别")
			}
			if key == "pageNumber" && value != number {
				return nil, catalogRange{}, errors.New("学校返回了不同页的数据，请重新查询")
			}
			*target = value
		}
	}
	span := catalogRange{Page: number, PageSize: size, Returned: len(page.Rows), Total: page.Total}
	span.Complete = number == 1 && page.Total != nil && len(page.Rows) == *page.Total
	span.HasNext = len(page.Rows) > 0 && (page.Total == nil || (number-1)*size+len(page.Rows) < *page.Total)
	if page.Total == nil {
		span.Note = "学校未提供总数；仅显示本次返回的数据，不能确认已取全。"
	} else if !span.Complete {
		span.Note = "本页是查询结果的一部分。"
	}
	if page.Total != nil && ((number-1)*size+len(page.Rows) > *page.Total || len(page.Rows) == 0 && (number-1)*size < *page.Total) {
		return nil, catalogRange{}, errors.New("学校返回的分页条数与总数不一致")
	}
	return page.Rows, span, nil
}

func catalogAllRows(ctx context.Context, c *ehallClient, p, dataset string, form url.Values) ([]map[string]any, catalogRange, error) {
	query := url.Values{}
	for key, values := range form {
		query[key] = values
	}
	form = query
	form.Set("pageNumber", "1")
	form.Set("pageSize", "200")
	rows, span, err := catalogPage(ctx, c, p, dataset, form)
	if err != nil {
		return nil, span, err
	}
	all := append([]map[string]any{}, rows...)
	seen := map[string]bool{}
	first, _ := json.Marshal(rows)
	seen[string(first)] = true
	for span.Total != nil && len(all) < *span.Total {
		if span.Page >= 50 {
			return nil, span, errors.New("学校详情超过本次分页读取上限，请到官方页面查看")
		}
		form.Set("pageNumber", strconv.Itoa(span.Page+1))
		form.Set("pageSize", strconv.Itoa(span.PageSize))
		next, nextSpan, e := catalogPage(ctx, c, p, dataset, form)
		if e != nil {
			return nil, span, e
		}
		if nextSpan.Total == nil || *nextSpan.Total != *span.Total {
			return nil, span, errors.New("学校详情的总数发生变化或缺失，请重新查询")
		}
		encoded, _ := json.Marshal(next)
		if len(next) == 0 || seen[string(encoded)] || len(all)+len(next) > *span.Total {
			return nil, span, errors.New("学校详情分页重复或不完整，未展示不完整详情")
		}
		seen[string(encoded)] = true
		all = append(all, next...)
		span = nextSpan
	}
	span.Returned = len(all)
	span.Complete = span.Total != nil && len(all) == *span.Total
	span.HasNext = false
	// This range describes the accumulated detail, not its final remote page.
	span.Page, span.PageSize = 0, 0
	if span.Complete {
		span.Note = "已读取学校报告的全部记录。"
	}
	return all, span, nil
}

func catalogTermRows(ctx context.Context, c *ehallClient) ([]catalogTerm, error) {
	rows, _, err := catalogPage(ctx, c, catalogTimetablePath+"xtcscx.do", "xtcscx", url.Values{"ZCSDM": {"KBXNXQ"}})
	if err != nil {
		return nil, err
	}
	items := []catalogTerm{}
	seen := map[string]bool{}
	for _, row := range rows {
		for _, key := range []string{"CSZA", "CSZB", "CSZC"} {
			id := str(row, key)
			if validTermPattern.MatchString(id) && !seen[id] {
				seen[id] = true
				items = append(items, catalogTerm{ID: id, Name: id})
			}
		}
	}
	if len(items) == 0 {
		return nil, errors.New("学校未返回可识别的课表学期参数，请到全校课表原页核对")
	}
	return items, nil
}
func readCatalogTerms(ctx context.Context, c *ehallClient) (*catalogTermsResult, error) {
	if err := catalogOpen(ctx, c, catalogTimetableHome); err != nil {
		return nil, err
	}
	items, err := catalogTermRows(ctx, c)
	if err != nil {
		return nil, err
	}
	return &catalogTermsResult{catalogMeta: catalogMetadata(catalogTimetableHome, catalogRange{Returned: len(items), Note: "学校课表参数提供的学期；不是全部历史学期。"}), Items: items}, nil
}
func catalogClassRow(row map[string]any) (catalogClass, error) {
	out := catalogClass{Code: str(row, "BJDM"), Name: str(row, "BJMC"), Grade: str(row, "NJ", "NJ_DISPLAY"), Department: str(row, "YXMC", "YXDM_DISPLAY"), Major: str(row, "ZYDM_DISPLAY")}
	if out.Code == "" || out.Name == "" {
		return out, errors.New("学校班级列表缺少班级代码或名称，页面结构可能已改版")
	}
	return out, nil
}
func readCatalogClasses(ctx context.Context, c *ehallClient, q catalogQuery) (*catalogClassesResult, error) {
	if err := catalogOpen(ctx, c, catalogTimetableHome); err != nil {
		return nil, err
	}
	if q.Term == "" {
		terms, err := catalogTermRows(ctx, c)
		if err != nil {
			return nil, err
		}
		q.Term = terms[0].ID
	}
	rows, span, err := catalogPage(ctx, c, catalogTimetablePath+"bjcx.do", "bjcx", catalogListForm(q, false))
	if err != nil {
		return nil, err
	}
	items := []catalogClass{}
	for _, row := range rows {
		item, e := catalogClassRow(row)
		if e != nil {
			return nil, e
		}
		items = append(items, item)
	}
	return &catalogClassesResult{catalogMeta: catalogMetadata(catalogTimetableHome, span), Term: q.Term, Items: items, Page: span.Page, PageSize: span.PageSize, Total: span.Total}, nil
}

func catalogNumber(row map[string]any, key string) (*float64, error) {
	text := str(row, key)
	if text == "" {
		if raw, ok := row[key]; ok && raw != nil {
			if _, isString := raw.(string); !isString {
				return nil, errors.New("学校查询的数值字段无法识别")
			}
		}
		return nil, nil
	}
	n, err := strconv.ParseFloat(text, 64)
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n < 0 {
		return nil, errors.New("学校查询的数值字段无法识别，请到官方页面核对")
	}
	return &n, nil
}
func catalogInteger(row map[string]any, key string) (*int, error) {
	n, err := catalogNumber(row, key)
	if err != nil || n == nil {
		return nil, err
	}
	if *n != math.Trunc(*n) || *n > 100000 {
		return nil, errors.New("学校查询的节次或周次无法识别")
	}
	v := int(*n)
	return &v, nil
}
func catalogCourseRow(row map[string]any, unarranged bool) (catalogCourse, error) {
	out := catalogCourse{Code: str(row, "KCH"), Name: str(row, "KCM"), Section: str(row, "KXH"), Teacher: str(row, "SKJS"), Weeks: str(row, "ZCMC"), Arrangement: str(row, "YPSJDD")}
	if out.Name == "" {
		return out, errors.New("学校课表缺少课程名称，未展示不完整课表")
	}
	if unarranged {
		return out, nil
	}
	var err error
	if out.Weekday, err = catalogInteger(row, "SKXQ"); err != nil {
		return out, err
	}
	if out.StartSection, err = catalogInteger(row, "KSJC"); err != nil {
		return out, err
	}
	if out.EndSection, err = catalogInteger(row, "JSJC"); err != nil {
		return out, err
	}
	if out.Weekday != nil && (*out.Weekday < 1 || *out.Weekday > 7) || out.StartSection != nil && out.EndSection != nil && *out.EndSection < *out.StartSection {
		return out, errors.New("学校课表的星期或节次无法识别")
	}
	out.Location, out.Campus = str(row, "JASMC"), str(row, "XXXQDM")
	return out, nil
}
func readCatalogTimetable(ctx context.Context, c *ehallClient, term, classCode string) (*catalogTimetableResult, error) {
	if err := catalogOpen(ctx, c, catalogTimetableHome); err != nil {
		return nil, err
	}
	lookup := catalogListForm(catalogQuery{Term: term, Page: 1, PageSize: 1}, false)
	b, _ := json.Marshal([]map[string]string{catalogCondition("BJDM", "equal", classCode)})
	lookup.Set("querySetting", string(b))
	rows, _, err := catalogPage(ctx, c, catalogTimetablePath+"bjcx.do", "bjcx", lookup)
	if err != nil {
		return nil, err
	}
	if len(rows) != 1 || str(rows[0], "BJDM") != classCode {
		return nil, errCatalogNotFound
	}
	class, err := catalogClassRow(rows[0])
	if err != nil {
		return nil, err
	}
	parts := strings.Split(term, "-")
	weekRows, _, err := catalogPage(ctx, c, catalogTimetablePath+"dqzc.do", "dqzc", url.Values{"XN": {parts[0] + "-" + parts[1]}, "XQ": {parts[2]}, "RQ": {time.Now().In(time.FixedZone("CST", 8*3600)).Format("2006-1-2")}})
	if err != nil {
		return nil, err
	}
	var week *int
	if len(weekRows) > 0 {
		week, err = catalogInteger(weekRows[0], "ZC")
		if err != nil {
			return nil, err
		}
	}
	form := url.Values{"XNXQDM": {term}, "BJDM": {classCode}}
	if week != nil && *week > 0 {
		form.Set("SKZC", strconv.Itoa(*week))
	}
	out := &catalogTimetableResult{Term: term, CurrentWeek: week, Class: class, Ranges: map[string]catalogRange{}}
	totalReturned := 0
	complete := true
	for _, part := range []struct {
		key, dataset string
		target       *[]catalogCourse
	}{{"scheduled", "bjkcb", &out.Scheduled}, {"adjustments", "bjdkkc", &out.Adjustments}, {"practicals", "bjsjkcb", &out.Practicals}, {"unarranged", "bjwpkc", &out.Unarranged}} {
		rows, span, e := catalogAllRows(ctx, c, catalogTimetablePath+part.dataset+".do", part.dataset, form)
		if e != nil {
			return nil, e
		}
		*part.target = []catalogCourse{}
		for _, row := range rows {
			item, e := catalogCourseRow(row, part.key == "unarranged")
			if e != nil {
				return nil, e
			}
			*part.target = append(*part.target, item)
		}
		out.Ranges[part.key] = span
		totalReturned += len(rows)
		complete = complete && span.Complete
	}
	out.catalogMeta = catalogMetadata(catalogTimetableHome, catalogRange{Returned: totalReturned, Complete: complete, Note: "分别读取排课、调课、实践课和未排课程；完整性以各部分学校总数为准。"})
	return out, nil
}

func catalogProgramRow(row map[string]any) (catalogProgram, error) {
	out := catalogProgram{Code: str(row, "PYFADM"), Title: str(row, "PYFAMC"), Grade: str(row, "NJDM", "NJDM_DISPLAY"), Department: str(row, "DWDM_DISPLAY"), Major: str(row, "ZYDM_DISPLAY"), Direction: str(row, "ZYFXDM_DISPLAY"), Degree: str(row, "XWDM_DISPLAY")}
	if out.Code == "" || out.Title == "" {
		return out, errors.New("学校培养方案缺少方案代码或名称，页面结构可能已改版")
	}
	var err error
	if out.MinimumCredits, err = catalogNumber(row, "ZSYQXF"); err != nil {
		return out, err
	}
	if out.DurationYears, err = catalogNumber(row, "XZNX"); err != nil {
		return out, err
	}
	return out, nil
}
func readCatalogPrograms(ctx context.Context, c *ehallClient, q catalogQuery) (*catalogProgramsResult, error) {
	if err := catalogOpen(ctx, c, catalogProgramHome); err != nil {
		return nil, err
	}
	rows, span, err := catalogPage(ctx, c, catalogProgramPath+"qxpyfacx.do", "qxpyfacx", catalogListForm(q, true))
	if err != nil {
		return nil, err
	}
	items := []catalogProgram{}
	for _, row := range rows {
		item, e := catalogProgramRow(row)
		if e != nil {
			return nil, e
		}
		items = append(items, item)
	}
	return &catalogProgramsResult{catalogMeta: catalogMetadata(catalogProgramHome, span), Items: items, Page: span.Page, PageSize: span.PageSize, Total: span.Total}, nil
}
func readCatalogProgram(ctx context.Context, c *ehallClient, code string) (*catalogProgramResult, error) {
	if err := catalogOpen(ctx, c, catalogProgramHome); err != nil {
		return nil, err
	}
	conditions, _ := json.Marshal([]map[string]string{catalogCondition("FAZTDM", "equal", "99"), catalogCondition("PYFADM", "equal", code)})
	rows, _, err := catalogPage(ctx, c, catalogProgramPath+"qxpyfacx.do", "qxpyfacx", url.Values{"PYFADM": {code}, "querySetting": {string(conditions)}, "pageSize": {"1"}, "pageNumber": {"1"}})
	if err != nil {
		return nil, err
	}
	if len(rows) != 1 || str(rows[0], "PYFADM") != code {
		return nil, errCatalogNotFound
	}
	row := rows[0]
	if status := str(row, "FAZTDM"); status != "" && status != "99" {
		return nil, errors.New("学校返回的培养方案不是已发布方案，请在原页核对")
	}
	if flag, known := row["SFFB"].(bool); known && !flag {
		return nil, errors.New("学校返回的培养方案明确标为未发布，请在原页核对")
	}
	if flag := str(row, "SFFB"); flag == "0" || flag == "否" {
		return nil, errors.New("学校返回的培养方案明确标为未发布，请在原页核对")
	}
	summary, err := catalogProgramRow(row)
	if err != nil {
		return nil, err
	}
	out := &catalogProgramResult{Summary: summary, Detail: catalogProgramDetail{Objectives: str(row, "PYMB"), Requirements: str(row, "XDYQ"), Subjects: str(row, "ZGXK"), CoreCourses: str(row, "ZGKC"), Features: str(row, "FATS"), Notes: []string{}}, Modules: []catalogModule{}, Courses: []catalogProgramCourse{}, Ranges: map[string]catalogRange{}}
	for _, key := range []string{"KZZD1", "KZZD2", "KZZD3", "KZZD4", "KZZD5"} {
		if note := str(row, key); note != "" {
			out.Detail.Notes = append(out.Detail.Notes, note)
		}
	}
	form := url.Values{"PYFADM": {code}}
	moduleRows, moduleRange, err := catalogAllRows(ctx, c, catalogProgramPath+"kzcx.do", "kzcx", form)
	if err != nil {
		return nil, err
	}
	for _, row := range moduleRows {
		item := catalogModule{Code: str(row, "KZH"), ParentCode: str(row, "FKZH"), Name: str(row, "KZM"), Type: str(row, "KZLXDM_DISPLAY"), Category: str(row, "KCLBDM_DISPLAY")}
		if item.Code == "" || item.Name == "" {
			return nil, errors.New("学校培养方案的课程模块结构无法识别")
		}
		for key, target := range map[string]**float64{"ZSXDXF": &item.RequiredCredits, "KCZXF": &item.TotalCredits, "KCZXS": &item.Hours, "KCZMS": &item.CourseCount} {
			*target, err = catalogNumber(row, key)
			if err != nil {
				return nil, err
			}
		}
		out.Modules = append(out.Modules, item)
	}
	courseRows, courseRange, err := catalogAllRows(ctx, c, catalogProgramPath+"kzkccx.do", "kzkccx", form)
	if err != nil {
		return nil, err
	}
	for _, row := range courseRows {
		item := catalogProgramCourse{ModuleCode: str(row, "KZH"), Code: str(row, "KCH"), Name: str(row, "KCM"), Term: str(row, "XNXQ_DISPLAY", "XNXQ"), Nature: str(row, "KCXZDM_DISPLAY"), ExamType: str(row, "KSLXDM_DISPLAY")}
		if item.Code == "" || item.Name == "" {
			return nil, errors.New("学校培养方案的课程名称或代码无法识别")
		}
		for key, target := range map[string]**float64{"XF": &item.Credits, "XS": &item.Hours, "XDXQ": &item.RecommendedSemester} {
			*target, err = catalogNumber(row, key)
			if err != nil {
				return nil, err
			}
		}
		if flag, ok := row["SFZGKC"].(bool); ok {
			item.Core = &flag
		} else if flag := str(row, "SFZGKC"); flag != "" {
			value := flag == "1" || flag == "是"
			if flag != "0" && flag != "1" && flag != "是" && flag != "否" {
				return nil, errors.New("学校方案的主干课程标记无法识别")
			}
			item.Core = &value
		}
		out.Courses = append(out.Courses, item)
	}
	out.Ranges["modules"], out.Ranges["courses"] = moduleRange, courseRange
	out.catalogMeta = catalogMetadata(catalogProgramHome, catalogRange{Returned: len(out.Modules) + len(out.Courses), Complete: moduleRange.Complete && courseRange.Complete, Note: "培养方案规定不等于个人已修学分，也不保证课程当期开设。"})
	return out, nil
}

func validateCatalogSession(ctx context.Context, client *http.Client, business string) error {
	c := &ehallClient{usesJar: true, base: ehallRoot(), http: client}
	if business == "catalog-timetable" {
		_, err := readCatalogClasses(ctx, c, catalogQuery{Page: 1, PageSize: 1})
		return err
	}
	_, err := readCatalogPrograms(ctx, c, catalogQuery{Page: 1, PageSize: 1})
	return err
}

func parseCatalogQuery(r *http.Request) (catalogQuery, error) {
	values := r.URL.Query()
	q := catalogQuery{Term: strings.TrimSpace(values.Get("term")), Keyword: strings.TrimSpace(values.Get("q")), Grade: strings.TrimSpace(values.Get("grade")), Department: strings.TrimSpace(values.Get("department")), Major: strings.TrimSpace(values.Get("major")), Page: 1, PageSize: 20}
	if q.Term != "" && !validTermPattern.MatchString(q.Term) {
		return q, errors.New("学期格式应为 2026-2027-1")
	}
	for key, target := range map[string]*int{"page": &q.Page, "page_size": &q.PageSize} {
		if raw := values.Get(key); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil || n < 1 || key == "page_size" && n > 100 || n > 5000 {
				return q, errors.New("请输入有效的页码，每页为 1–100 条")
			}
			*target = n
		}
	}
	for _, value := range []string{q.Keyword, q.Grade, q.Department, q.Major} {
		if len([]rune(value)) > 100 {
			return q, errors.New("查询条件最多 100 个字")
		}
	}
	return q, nil
}
func (s *Server) catalogRead(w http.ResponseWriter, r *http.Request, read func(context.Context, *ehallClient) (any, error)) {
	c, err := s.schoolClient()
	if err != nil {
		writeSchoolClientError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
	defer cancel()
	out, err := read(ctx, c)
	if err != nil {
		if errors.Is(err, errCatalogNotFound) {
			writeAPIError(w, 404, err)
		} else {
			s.writeSchoolReadError(w, c, err)
		}
		return
	}
	writeJSON(w, out)
}
func (s *Server) handleCatalogTerms(w http.ResponseWriter, r *http.Request) {
	s.catalogRead(w, r, func(ctx context.Context, c *ehallClient) (any, error) { return readCatalogTerms(ctx, c) })
}
func (s *Server) handleCatalogClasses(w http.ResponseWriter, r *http.Request) {
	q, err := parseCatalogQuery(r)
	if err != nil {
		writeAPIError(w, 400, err)
		return
	}
	s.catalogRead(w, r, func(ctx context.Context, c *ehallClient) (any, error) { return readCatalogClasses(ctx, c, q) })
}
func (s *Server) handleCatalogPrograms(w http.ResponseWriter, r *http.Request) {
	q, err := parseCatalogQuery(r)
	if err != nil {
		writeAPIError(w, 400, err)
		return
	}
	s.catalogRead(w, r, func(ctx context.Context, c *ehallClient) (any, error) { return readCatalogPrograms(ctx, c, q) })
}
func (s *Server) handleCatalogTimetable(w http.ResponseWriter, r *http.Request) {
	q, err := parseCatalogQuery(r)
	code := strings.TrimSpace(r.URL.Query().Get("class_code"))
	if err != nil || q.Term == "" || code == "" || len(code) > 100 {
		writeAPIError(w, 400, errors.New("请选择有效学期和查询列表中的班级"))
		return
	}
	s.catalogRead(w, r, func(ctx context.Context, c *ehallClient) (any, error) {
		return readCatalogTimetable(ctx, c, q.Term, code)
	})
}
func (s *Server) handleCatalogProgram(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimSpace(r.URL.Query().Get("plan_code"))
	if code == "" || len(code) > 100 {
		writeAPIError(w, 400, errors.New("请选择查询列表中的培养方案"))
		return
	}
	s.catalogRead(w, r, func(ctx context.Context, c *ehallClient) (any, error) { return readCatalogProgram(ctx, c, code) })
}
