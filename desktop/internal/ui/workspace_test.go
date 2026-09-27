package ui

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestWorkspaceLargeHistoryRoundTripAndLimit(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	s := New(Options{})
	// Maximum supported list sizes with valid field lengths and multibyte text.
	// A real Chinese study history can exceed the former 512 KiB limit.
	todos := make([]map[string]any, 500)
	for i := range todos {
		todos[i] = map[string]any{"id": fmt.Sprintf("todo-%d", i), "text": strings.Repeat("学", 120), "done": true, "rewarded": true, "date": "2026-09-27", "createdAt": 1790467200000, "completedAt": 1790468700000, "archived": true}
	}
	courses := make([]map[string]any, 300)
	for i := range courses {
		courses[i] = map[string]any{"name": strings.Repeat("课", 100), "credit": 3, "point": 4, "term": strings.Repeat("秋", 40), "code": strings.Repeat("码", 40), "level": "graduate", "grade": strings.Repeat("优", 20), "source": strings.Repeat("录", 30), "included": true}
	}
	history := make([]map[string]any, 365)
	for i := range history {
		history[i] = map[string]any{"startedAt": 1790467200000, "endedAt": 1790468700000, "minutes": 25, "todoId": fmt.Sprintf("todo-%d", i), "task": strings.Repeat("学", 120)}
	}
	data, err := json.Marshal(map[string]any{"schema": 3, "profile": map[string]string{"name": "测试同学", "college": "测试学院"}, "preferences": map[string]string{"studentLevel": "graduate", "noticeSource": "college-law"}, "todos": todos, "courses": courses, "game": map[string]any{"focusHistory": history}})
	if err != nil {
		t.Fatal(err)
	}
	body, err := json.Marshal(workspaceSnapshot{Version: 1, Data: data})
	if err != nil {
		t.Fatal(err)
	}
	if len(body) <= 512<<10 || len(body) >= workspaceMaxBytes {
		t.Fatalf("fixture should exercise expanded capacity: %d bytes", len(body))
	}
	if w := workspaceRequest(s, "POST", string(body)); w.Code != http.StatusOK {
		t.Fatalf("large valid save failed: %d %s", w.Code, w.Body.String())
	}
	stored, err := os.ReadFile(s.workspace.path)
	if err != nil {
		t.Fatal(err)
	}
	w := workspaceRequest(New(Options{}), "GET", "")
	var got workspaceSnapshot
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Revision != 1 || !bytes.Equal(got.Data, data) {
		t.Fatal("large history changed after restart")
	}
	for _, oversized := range []string{
		`{"version":1,"revision":1,"data":{"text":"` + strings.Repeat("x", workspaceMaxBytes) + `"}}`,
		`{"version":1,"revision":1,"data":{}}` + strings.Repeat(" ", workspaceMaxBytes),
	} {
		if w = workspaceRequest(s, "POST", oversized); w.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("oversized body not rejected: %d %s", w.Code, w.Body.String())
		}
		after, err := os.ReadFile(s.workspace.path)
		if err != nil || !bytes.Equal(stored, after) {
			t.Fatal("rejected save changed the prior history")
		}
	}
}

func workspaceRequest(s *Server, method, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(method, "http://127.0.0.1/api/workspace", strings.NewReader(body))
	s.handleWorkspace(w, r)
	return w
}
func TestWorkspaceRevisionAndRestart(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	s := New(Options{})
	w := workspaceRequest(s, "GET", "")
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	body := `{"version":1,"revision":0,"data":{"marker":"garden"}}`
	w = workspaceRequest(s, "POST", body)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	second := New(Options{})
	w = workspaceRequest(second, "GET", "")
	var got workspaceSnapshot
	json.Unmarshal(w.Body.Bytes(), &got)
	if got.Revision != 1 || !strings.Contains(string(got.Data), "garden") {
		t.Fatal(w.Body.String())
	}
	w = workspaceRequest(second, "POST", body)
	if w.Code != http.StatusConflict {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, bad := range []string{`{}`, `{"version":1,"revision":1,"data":null}`, `{"version":1,"revision":1,"data":{}} {}`} {
		if w = workspaceRequest(s, "POST", bad); w.Code != 400 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
func TestWorkspaceIndependentServersCannotOverwrite(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	servers := []*Server{New(Options{}), New(Options{})}
	codes := make(chan int, 2)
	var wg sync.WaitGroup
	for _, s := range servers {
		wg.Add(1)
		go func(s *Server) {
			defer wg.Done()
			codes <- workspaceRequest(s, "POST", `{"version":1,"revision":0,"data":{"garden":true}}`).Code
		}(s)
	}
	wg.Wait()
	close(codes)
	ok, conflict := 0, 0
	for code := range codes {
		if code == 200 {
			ok++
		}
		if code == 409 {
			conflict++
		}
	}
	if ok != 1 || conflict != 1 {
		t.Fatalf("ok %d conflict %d", ok, conflict)
	}
}
func TestWorkspaceCorruptionIsPreserved(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	p := filepath.Join(dir, "workspace-v1.json")
	os.WriteFile(p, []byte("broken"), 0600)
	w := workspaceRequest(New(Options{}), "POST", `{"version":1,"revision":0,"data":{}}`)
	if w.Code != 500 {
		t.Fatal(w.Code)
	}
	b, _ := os.ReadFile(p)
	if string(b) != "broken" {
		t.Fatal("corruption overwritten")
	}
}
func TestCredentialPrivacyByDefault(t *testing.T) {
	for _, url := range []string{"http://127.0.0.1/api/credential", "http://127.0.0.1/api/credential?reveal=0"} {
		if revealedUsername(httptest.NewRequest("GET", url, nil), "123456") != "" {
			t.Fatal("account revealed")
		}
	}
	if revealedUsername(httptest.NewRequest("GET", "http://127.0.0.1/api/credential?reveal=1", nil), "123456") != "123456" {
		t.Fatal("explicit reveal failed")
	}
}
func TestPartialCredentialsDoNotMix(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	s := New(Options{})
	if s.doLogin("123456", "", "auto", "").OK {
		t.Fatal("partial credentials accepted")
	}
	w := httptest.NewRecorder()
	s.handleLogout(w, httptest.NewRequest("POST", "/", strings.NewReader(`{"username":"123456"}`)))
	if !strings.Contains(w.Body.String(), "同时填写") {
		t.Fatal(w.Body.String())
	}
}

// 文件一旦被同步盘、杀软或磁盘错误弄坏，以前 GET 和 POST 都永久 500。
// 现在每次保存前留一份 .bak；主文件坏了就把它改名留存，用 .bak 恢复并告诉页面。
func TestWorkspaceRecoversFromLastGoodBackup(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	s := New(Options{})
	main := filepath.Join(dir, "workspace-v1.json")
	for i, body := range []string{`{"version":1,"revision":0,"data":{"n":1}}`, `{"version":1,"revision":1,"data":{"n":2}}`} {
		if w := workspaceRequest(s, "POST", body); w.Code != 200 {
			t.Fatalf("save %d: %d %s", i, w.Code, w.Body.String())
		}
	}
	backup, err := os.ReadFile(main + ".bak")
	if err != nil || !strings.Contains(string(backup), `"revision":1`) || !strings.Contains(string(backup), `"n":1`) {
		t.Fatalf("backup must hold the previous good save: %s %v", backup, err)
	}
	if err := os.WriteFile(main, []byte("broken{"), 0600); err != nil {
		t.Fatal(err)
	}
	w := workspaceRequest(New(Options{}), "GET", "")
	var got workspaceSnapshot
	if w.Code != 200 || w.Header().Get("X-SZU-Recovered") != "backup" || json.Unmarshal(w.Body.Bytes(), &got) != nil || got.Revision != 1 || string(got.Data) != `{"n":1}` {
		t.Fatalf("corrupt save must be restored from backup: %d %v %s", w.Code, w.Header(), w.Body.String())
	}
	kept, _ := filepath.Glob(main + ".corrupt-*")
	if len(kept) != 1 {
		t.Fatalf("corrupt file must be kept aside: %v", kept)
	}
	if b, _ := os.ReadFile(kept[0]); string(b) != "broken{" {
		t.Fatalf("corrupt file changed: %q", b)
	}
	if w = workspaceRequest(s, "GET", ""); w.Code != 200 || w.Header().Get("X-SZU-Recovered") != "" {
		t.Fatalf("recovery must happen once: %d %v", w.Code, w.Header())
	}
	if w = workspaceRequest(s, "POST", `{"version":1,"revision":1,"data":{"n":3}}`); w.Code != 200 {
		t.Fatalf("saving after recovery: %d %s", w.Code, w.Body.String())
	}

	// 两份都坏：照旧报错、不动原文件，并说明文件在哪。
	os.WriteFile(main, []byte("broken"), 0600)
	os.WriteFile(main+".bak", []byte("also broken"), 0600)
	w = workspaceRequest(s, "GET", "")
	if w.Code != 500 || !strings.Contains(w.Body.String(), "原文件已保留") || !strings.Contains(w.Body.String(), "workspace-v1.json") {
		t.Fatalf("unrecoverable save must explain where the file is: %d %s", w.Code, w.Body.String())
	}
	if b, _ := os.ReadFile(main); string(b) != "broken" {
		t.Fatal("unrecoverable save was modified")
	}

	// 更新版本写入的存档不算损坏，不能拿旧备份覆盖。
	newer := `{"version":2,"revision":9,"data":{"future":true}}`
	os.WriteFile(main, []byte(newer), 0600)
	os.WriteFile(main+".bak", backup, 0600)
	if w = workspaceRequest(s, "GET", ""); w.Code != 500 || !strings.Contains(w.Body.String(), "版本不兼容") {
		t.Fatalf("newer save must not be replaced: %d %s", w.Code, w.Body.String())
	}
	if b, _ := os.ReadFile(main); string(b) != newer {
		t.Fatal("newer save was overwritten by an old backup")
	}
}

// 运行中文件被弄坏后，先到的往往是自动保存的 POST：恢复在那次请求里发生，
// 备份比页面手里的旧，于是返回 409；页面随后重新读取时必须仍然拿到恢复提示，
// 否则只会看到“另一个窗口更新了存档”，内容悄悄退回了一版。
func TestWorkspaceRecoveryNoticeSurvivesAutosaveConflict(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	s := New(Options{})
	main := filepath.Join(dir, "workspace-v1.json")
	for i, body := range []string{`{"version":1,"revision":0,"data":{"n":1}}`, `{"version":1,"revision":1,"data":{"n":2}}`} {
		if w := workspaceRequest(s, "POST", body); w.Code != 200 {
			t.Fatalf("save %d: %d %s", i, w.Code, w.Body.String())
		}
	}
	os.WriteFile(main, []byte("broken{"), 0600)
	w := workspaceRequest(s, "POST", `{"version":1,"revision":2,"data":{"n":3}}`)
	if w.Code != http.StatusConflict || w.Header().Get("X-SZU-Recovered") != "backup" || !strings.Contains(w.Body.String(), "存档文件损坏，已恢复") {
		t.Fatalf("autosave after corruption must explain the recovery: %d %v %s", w.Code, w.Header(), w.Body.String())
	}
	w = workspaceRequest(s, "GET", "")
	if w.Code != 200 || w.Header().Get("X-SZU-Recovered") != "backup" || !strings.Contains(w.Body.String(), `"revision":1`) {
		t.Fatalf("reload after the conflict must still carry the recovery notice: %d %v %s", w.Code, w.Header(), w.Body.String())
	}
	if w = workspaceRequest(s, "GET", ""); w.Header().Get("X-SZU-Recovered") != "" {
		t.Fatal("recovery notice must be delivered only once")
	}
}

// 主文件不见了而备份还在（恢复中途断电、同步盘删了它）：不能当成第一次运行，
// 否则页面新建庭院、保存两次后 .bak 被覆盖，上一份好存档就永远找不回来了。
func TestWorkspaceMissingMainFileIsRestoredFromBackup(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	main := filepath.Join(dir, "workspace-v1.json")
	good := `{"version":1,"revision":4,"data":{"n":4}}`
	os.WriteFile(main+".bak", []byte(good), 0600)
	w := workspaceRequest(New(Options{}), "GET", "")
	if w.Code != 200 || w.Header().Get("X-SZU-Recovered") != "backup" || !strings.Contains(w.Body.String(), `"revision":4`) {
		t.Fatalf("missing save must come back from backup: %d %v %s", w.Code, w.Header(), w.Body.String())
	}
	if b, err := os.ReadFile(main); err != nil || string(b) != good {
		t.Fatalf("main file must be restored: %q %v", b, err)
	}

	// 备份在却读不出来：说清楚是恢复失败，不能说“没有可用的备份”，也不能当成第一次运行。
	os.Remove(main)
	os.Remove(main + ".bak")
	if err := os.Mkdir(main+".bak", 0700); err != nil {
		t.Fatal(err)
	}
	w = workspaceRequest(New(Options{}), "GET", "")
	if w.Code != 500 || !strings.Contains(w.Body.String(), "备份存在但没能恢复成主文件") || strings.Contains(w.Body.String(), "没有可用的备份") {
		t.Fatalf("restore failure needs its own message: %d %s", w.Code, w.Body.String())
	}
	if _, err := os.Stat(main); !os.IsNotExist(err) {
		t.Fatal("failed restore must not create a fresh save")
	}
}

// 更新的版本可能改了其他字段的类型；只要版本号更高就不算损坏，不能被旧备份顶掉。
func TestWorkspaceNewerSaveWithChangedFieldsIsNotReplaced(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	main := filepath.Join(dir, "workspace-v1.json")
	newer := `{"version":2,"revision":"r-9","data":[1,2]}`
	os.WriteFile(main, []byte(newer), 0600)
	os.WriteFile(main+".bak", []byte(`{"version":1,"revision":1,"data":{"n":1}}`), 0600)
	if w := workspaceRequest(New(Options{}), "GET", ""); w.Code != 500 || !strings.Contains(w.Body.String(), "版本不兼容") {
		t.Fatalf("newer save must be reported as incompatible: %d %s", w.Code, w.Body.String())
	}
	if b, _ := os.ReadFile(main); string(b) != newer {
		t.Fatal("newer save was overwritten by an old backup")
	}
	if kept, _ := filepath.Glob(main + ".corrupt-*"); len(kept) != 0 {
		t.Fatalf("newer save must not be moved aside as corrupt: %v", kept)
	}
}

func TestStaleTempFilesAreCleanedAtStartup(t *testing.T) {
	dir := t.TempDir()
	old := time.Now().Add(-time.Hour)
	names := map[string]bool{".workspace-1.tmp": false, ".notebook-2.tmp": false, ".workspace-fresh.tmp": true, "workspace-v1.json": true, ".other-3.tmp": true}
	for name := range names {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("x"), 0600); err != nil {
			t.Fatal(err)
		}
		if name != ".workspace-fresh.tmp" {
			os.Chtimes(path, old, old)
		}
	}
	cleanStaleTemps(dir, time.Now())
	for name, keep := range names {
		if _, err := os.Stat(filepath.Join(dir, name)); (err == nil) != keep {
			t.Errorf("%s kept=%v, want %v", name, err == nil, keep)
		}
	}
}
