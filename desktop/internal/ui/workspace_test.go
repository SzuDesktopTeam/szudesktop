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
