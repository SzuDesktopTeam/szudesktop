package ui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path"
	"reflect"
	"strings"
	"testing"
	"time"
)

// These are synthetic eHall contract fixtures, never live student records.
func catalogFixture(dataset string, rows []map[string]any, total *int) string {
	payload := map[string]any{"rows": rows}
	if total != nil {
		payload["totalSize"] = *total
	}
	b, _ := json.Marshal(map[string]any{"code": "0", "datas": map[string]any{dataset: payload}})
	return string(b)
}

func catalogFake(t *testing.T, handler http.HandlerFunc) *ehallClient {
	t.Helper()
	srv := httptest.NewTLSServer(handler)
	t.Cleanup(srv.Close)
	c := newEhallClient("JSESSIONID=synthetic-catalog", 5*time.Second)
	c.base, c.http.Transport = srv.URL, srv.Client().Transport
	return c
}

func TestCatalogClassQueryUsesAppContextFiltersAndReportedRange(t *testing.T) {
	opened := false
	c := catalogFake(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/jwapp/sys/kcbcx/*default/index.do" {
			opened = true
			_, _ = w.Write([]byte("班级课程表"))
			return
		}
		if !opened || r.Method != http.MethodPost {
			t.Error("query preceded app context or was not a read-only form POST")
		}
		_ = r.ParseForm()
		if path.Base(r.URL.Path) != "bjcx.do" || r.Form.Get("XNXQDM") != "2026-2027-1" || r.Form.Get("pageNumber") != "2" || r.Form.Get("pageSize") != "2" {
			t.Errorf("wrong class query: %s %v", r.URL.Path, r.Form)
		}
		var conditions []map[string]string
		_ = json.Unmarshal([]byte(r.Form.Get("querySetting")), &conditions)
		if len(conditions) != 4 || conditions[0]["name"] != "BJMC" || conditions[0]["value"] != "测试" || conditions[1]["value"] != "2026" {
			t.Errorf("filters not encoded: %v", conditions)
		}
		_, _ = w.Write([]byte(`{"code":"0","datas":{"bjcx":{"rows":[{"BJDM":"test-class-3","BJMC":"测试三班","NJ":"2026","YXMC":"测试学院","ZYDM_DISPLAY":"测试专业"}],"totalSize":3,"pageNumber":2,"pageSize":2}}}`))
	})
	out, err := readCatalogClasses(context.Background(), c, catalogQuery{Term: "2026-2027-1", Keyword: "测试", Grade: "2026级", Department: "测试学院", Major: "测试专业", Page: 2, PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 1 || out.Items[0].Name != "测试三班" || out.Page != 2 || out.Total == nil || *out.Total != 3 || out.Range.Complete || out.Range.HasNext || out.SourceURL != "https://ehall.szu.edu.cn/jwapp/sys/kcbcx/*default/index.do" || out.FetchedAt.IsZero() {
		t.Fatalf("lost row or provenance: %+v", out)
	}
}

func TestCatalogTermsUseOnlyValidSchoolParameters(t *testing.T) {
	c := catalogFake(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte("班级课程表"))
			return
		}
		_ = r.ParseForm()
		if r.Form.Get("ZCSDM") != "KBXNXQ" {
			t.Errorf("wrong term lookup: %v", r.Form)
		}
		_, _ = w.Write([]byte(catalogFixture("xtcscx", []map[string]any{{"CSZA": "2026-2027-1", "CSZB": "not-a-term"}}, nil)))
	})
	out, err := readCatalogTerms(context.Background(), c)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 1 || out.Items[0].ID != "2026-2027-1" || out.Range.Complete {
		t.Fatalf("invented historical terms or completeness: %+v", out)
	}
}

func TestCatalogTimetableIncludesAllFourKindsAndFailsForMissingKind(t *testing.T) {
	for _, broken := range []bool{false, true} {
		t.Run(map[bool]string{false: "complete", true: "missing-practice"}[broken], func(t *testing.T) {
			c := catalogFake(t, func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet {
					_, _ = w.Write([]byte("班级课程表"))
					return
				}
				_ = r.ParseForm()
				dataset := strings.TrimSuffix(path.Base(r.URL.Path), ".do")
				if dataset == "bjcx" {
					_, _ = w.Write([]byte(catalogFixture(dataset, []map[string]any{{"BJDM": "test-class", "BJMC": "测试班"}}, nil)))
					return
				}
				if dataset == "dqzc" {
					_, _ = w.Write([]byte(catalogFixture(dataset, []map[string]any{{"ZC": "3"}}, nil)))
					return
				}
				if r.Form.Get("XNXQDM") != "2026-2027-1" || r.Form.Get("BJDM") != "test-class" || r.Form.Get("SKZC") != "3" {
					t.Errorf("wrong timetable context: %s %v", dataset, r.Form)
				}
				if broken && dataset == "bjsjkcb" {
					_, _ = w.Write([]byte(`{"code":"0","datas":{}}`))
					return
				}
				_, _ = w.Write([]byte(catalogFixture(dataset, []map[string]any{{"KCH": "test-course", "KCM": "测试" + dataset, "SKJS": "教师甲,教师乙", "ZCMC": "1-8周", "SKXQ": "2", "KSJC": "3", "JSJC": "4", "JASMC": "测试教室"}}, nil)))
			})
			out, err := readCatalogTimetable(context.Background(), c, "2026-2027-1", "test-class")
			if broken {
				if err == nil || out != nil {
					t.Fatal("missing practice data became a successful empty section")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if len(out.Scheduled) != 1 || len(out.Adjustments) != 1 || len(out.Practicals) != 1 || len(out.Unarranged) != 1 || out.Scheduled[0].Weeks != "1-8周" || out.Scheduled[0].Location != "测试教室" || *out.Scheduled[0].StartSection != 3 {
				t.Fatalf("incorrect four-kind mapping: %+v", out)
			}
		})
	}
}

func TestCatalogProgramsPublishFilterAndDetailPagination(t *testing.T) {
	var detailPages []string
	c := catalogFake(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte("培养方案"))
			return
		}
		_ = r.ParseForm()
		dataset := strings.TrimSuffix(path.Base(r.URL.Path), ".do")
		switch dataset {
		case "qxpyfacx":
			if r.Form.Get("PYFADM") == "" {
				if !strings.Contains(r.Form.Get("querySetting"), `"FAZTDM"`) || !strings.Contains(r.Form.Get("querySetting"), `"99"`) {
					t.Error("unpublished plans were not excluded")
				}
			} else {
				var conditions []map[string]string
				_ = json.Unmarshal([]byte(r.Form.Get("querySetting")), &conditions)
				hasPublished, hasPlan := false, false
				for _, condition := range conditions {
					hasPublished = hasPublished || condition["name"] == "FAZTDM" && condition["builder"] == "equal" && condition["value"] == "99" && condition["linkOpt"] == "AND"
					hasPlan = hasPlan || condition["name"] == "PYFADM" && condition["builder"] == "equal" && condition["value"] == "test-plan" && condition["linkOpt"] == "AND"
				}
				if !hasPublished || !hasPlan {
					t.Errorf("detail lookup lacks published-and-plan conditions: %v", conditions)
				}
			}
			_, _ = w.Write([]byte(`{"code":"0","datas":{"qxpyfacx":{"rows":[{"PYFADM":"test-plan","PYFAMC":"测试培养方案","NJDM":"2026","ZSYQXF":"150","PYMB":"测试培养目标"}],"totalSize":1}}}`))
		case "kzcx":
			if r.Form.Get("PYFADM") != "test-plan" {
				t.Error("wrong plan context")
			}
			_, _ = w.Write([]byte(catalogFixture(dataset, []map[string]any{{"KZH": "test-module", "KZM": "测试模块", "ZSXDXF": "10"}}, nil)))
		case "kzkccx":
			detailPages = append(detailPages, r.Form.Get("pageNumber"))
			rows := []map[string]any{{"KZH": "test-module", "KCH": "test-course-1", "KCM": "测试课程一", "XF": "2", "XDXQ": "1"}}
			if r.Form.Get("pageNumber") == "2" {
				rows = []map[string]any{{"KZH": "test-module", "KCH": "test-course-2", "KCM": "测试课程二", "XF": "3"}}
			}
			b := catalogFixture(dataset, rows, func() *int { v := 2; return &v }())
			b = strings.Replace(b, `"rows":`, `"pageSize":1,"rows":`, 1)
			_, _ = w.Write([]byte(b))
		default:
			t.Errorf("unexpected route: %s", r.URL.Path)
			w.WriteHeader(500)
		}
	})
	list, err := readCatalogPrograms(context.Background(), c, catalogQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Items) != 1 || list.Items[0].Code != "test-plan" || !list.Range.Complete {
		t.Fatalf("incorrect list: %+v", list)
	}
	out, err := readCatalogProgram(context.Background(), c, "test-plan")
	if err != nil {
		t.Fatal(err)
	}
	if out.Detail.Objectives != "测试培养目标" || len(out.Modules) != 1 || len(out.Courses) != 2 || out.Courses[1].Name != "测试课程二" || !reflect.DeepEqual(detailPages, []string{"1", "2"}) {
		t.Fatalf("lost plan detail: %+v pages=%v", out, detailPages)
	}
	if out.Ranges["courses"].Page != 0 || out.Ranges["courses"].Returned != 2 || !out.Ranges["courses"].Complete {
		t.Fatalf("aggregate detail was labeled as one page: %+v", out.Ranges["courses"])
	}
}

func TestCatalogRejectsChangedStructuresAndPreservesSessionPermissionErrors(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
		want       error
	}{
		{"permission", "", 403, errSessionPermission},
		{"expired", "", 401, errSessionExpired},
		{"login-html", `<html>统一身份认证</html>`, 200, errSessionExpired},
		{"missing-dataset", `{"datas":{}}`, 200, nil},
		{"missing-rows", `{"datas":{"bjcx":{}}}`, 200, nil},
		{"unknown-row", `{"datas":{"bjcx":{"rows":[{"renamed":"unknown"}]}}}`, 200, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := catalogFake(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			})
			out, err := readCatalogClasses(context.Background(), c, catalogQuery{Term: "2026-2027-1", Page: 1, PageSize: 20})
			if err == nil || out != nil {
				t.Fatalf("invalid upstream became success: %+v %v", out, err)
			}
			if tc.want != nil && !errors.Is(err, tc.want) {
				t.Fatalf("lost original error classification: %v", err)
			}
		})
	}
}

func TestCatalogUnknownTotalDoesNotClaimFullDataset(t *testing.T) {
	c := catalogFake(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte("培养方案"))
			return
		}
		_, _ = w.Write([]byte(catalogFixture("qxpyfacx", []map[string]any{{"PYFADM": "test-plan", "PYFAMC": "测试方案"}}, nil)))
	})
	out, err := readCatalogPrograms(context.Background(), c, catalogQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if out.Total != nil || out.Range.Complete || out.Range.Note == "" || !out.Range.HasNext {
		t.Fatalf("unknown range misrepresented: %+v", out)
	}
}

func TestCatalogURLAllowlistIsExactAndNeverPermitsEnrollment(t *testing.T) {
	for _, p := range []string{"/jwapp/sys/kcbcx/*default/index.do", "/jwapp/sys/kcbcx/modules/bjkcb/bjcx.do", "/jwapp/sys/qxfacx/*default/index.do", "/jwapp/sys/qxfacx/modules/pyfacxepg/kzkccx.do"} {
		u, _ := url.Parse("https://ehall.szu.edu.cn" + p)
		if !ehallPathAllowed(p) || !casURLAllowed(u) {
			t.Errorf("missing read route: %s", p)
		}
	}
	for _, p := range []string{"/jwapp/sys/kcbcx/modules/bjkcb/delete.do", "/jwapp/sys/qxfacx/modules/pyfacxepg/save.do", "/jwapp/sys/xsxkapp/submit.do"} {
		u, _ := url.Parse("https://ehall.szu.edu.cn" + p)
		if ehallPathAllowed(p) || casURLAllowed(u) {
			t.Errorf("write or unknown route allowed: %s", p)
		}
	}
}

func TestCatalogHandlersRejectBadInputBeforeSchoolRead(t *testing.T) {
	s := &Server{}
	for _, tc := range []struct {
		handler http.HandlerFunc
		target  string
	}{
		{s.handleCatalogClasses, "/api/academic/catalog/classes?term=not-a-term"},
		{s.handleCatalogClasses, "/api/academic/catalog/classes?page=0"},
		{s.handleCatalogPrograms, "/api/academic/catalog/programs?page_size=1000"},
		{s.handleCatalogTimetable, "/api/academic/catalog/timetable?term=2026-2027-1"},
		{s.handleCatalogProgram, "/api/academic/catalog/program?plan_code="},
	} {
		w := httptest.NewRecorder()
		tc.handler(w, httptest.NewRequest(http.MethodGet, tc.target, nil))
		if w.Code != 400 {
			t.Errorf("invalid input returned %d: %s", w.Code, tc.target)
		}
	}
}

func TestCatalogBooleanCoreFlagAndEmptyPageRange(t *testing.T) {
	c := catalogFake(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte("培养方案"))
			return
		}
		dataset := strings.TrimSuffix(path.Base(r.URL.Path), ".do")
		switch dataset {
		case "qxpyfacx":
			_, _ = w.Write([]byte(catalogFixture(dataset, []map[string]any{{"PYFADM": "test-plan", "PYFAMC": "测试方案"}}, nil)))
		case "kzcx":
			_, _ = w.Write([]byte(catalogFixture(dataset, []map[string]any{}, nil)))
		case "kzkccx":
			_, _ = w.Write([]byte(catalogFixture(dataset, []map[string]any{{"KCH": "test-course", "KCM": "测试课程", "SFZGKC": true}}, nil)))
		}
	})
	out, err := readCatalogProgram(context.Background(), c, "test-plan")
	if err != nil {
		t.Fatal(err)
	}
	if out.Courses[0].Core == nil || !*out.Courses[0].Core {
		t.Fatalf("boolean core flag lost: %+v", out.Courses[0])
	}
}

func TestCatalogSessionValidationReadsOnlySelectedBusiness(t *testing.T) {
	for _, business := range []string{"catalog-timetable", "catalog-program"} {
		t.Run(business, func(t *testing.T) {
			var paths []string
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				paths = append(paths, r.URL.Path)
				if r.Method == http.MethodGet {
					_, _ = w.Write([]byte("学校查询"))
					return
				}
				dataset := strings.TrimSuffix(path.Base(r.URL.Path), ".do")
				rows := []map[string]any{}
				if dataset == "xtcscx" {
					rows = []map[string]any{{"CSZA": "2026-2027-1"}}
				}
				_, _ = w.Write([]byte(catalogFixture(dataset, rows, nil)))
			}))
			defer server.Close()
			previous := casTestEhall
			casTestEhall = server.URL
			t.Cleanup(func() { casTestEhall = previous })
			if err := validateBrowserSession(context.Background(), server.Client(), business); err != nil {
				t.Fatal(err)
			}
			if business == "catalog-program" {
				if !reflect.DeepEqual(paths, []string{"/jwapp/sys/qxfacx/*default/index.do", "/jwapp/sys/qxfacx/modules/pyfacxepg/qxpyfacx.do"}) {
					t.Fatalf("program import validated another business: %v", paths)
				}
			} else if !reflect.DeepEqual(paths, []string{"/jwapp/sys/kcbcx/*default/index.do", "/jwapp/sys/kcbcx/modules/bjkcb/xtcscx.do", "/jwapp/sys/kcbcx/modules/bjkcb/bjcx.do"}) {
				t.Fatalf("timetable import validated another business: %v", paths)
			}
		})
	}
}

func TestCatalogDetailRejectsExplicitUnpublishedStatus(t *testing.T) {
	for _, flags := range []map[string]any{{"FAZTDM": "10"}, {"SFFB": "0"}, {"SFFB": false}, {"FAZTDM": "99", "SFFB": 0}} {
		t.Run(fmt.Sprint(flags), func(t *testing.T) {
			c := catalogFake(t, func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet {
					_, _ = w.Write([]byte("培养方案"))
					return
				}
				dataset := strings.TrimSuffix(path.Base(r.URL.Path), ".do")
				rows := []map[string]any{}
				if dataset == "qxpyfacx" {
					row := map[string]any{"PYFADM": "test-plan", "PYFAMC": "测试方案"}
					for key, value := range flags {
						row[key] = value
					}
					rows = append(rows, row)
				}
				_, _ = w.Write([]byte(catalogFixture(dataset, rows, nil)))
			})
			if result, err := readCatalogProgram(context.Background(), c, "test-plan"); err == nil || result != nil {
				t.Fatalf("explicitly unpublished plan accepted: flags=%v", flags)
			}
		})
	}
}
