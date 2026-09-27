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
	"testing/fstest"
)

const notebookFixture = `{"courses":[{"id":"c1","name":"计算机网络","color":"green","futureMetadata":{"semester":"秋"}}],"notes":[{"id":"n1","courseId":"c1","title":"第一讲","body":"# 网络分层\n保留原始正文。","createdAt":1790467200000,"updatedAt":1790467200000,"sourceUrl":"https://example.feishu.cn/docx/example"}],"preferences":{"selectedCourseId":"c1","selectedNoteId":"n1"},"editorVersion":"future"}`

func notebookRequest(s *Server, method, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	s.routes(mux, fstest.MapFS{})
	w := httptest.NewRecorder()
	r := httptest.NewRequest(method, "http://127.0.0.1:1234/api/notebook", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(w, r)
	return w
}

func notebookBody(revision uint64, data string) string {
	return fmt.Sprintf(`{"version":1,"revision":%d,"data":%s}`, revision, data)
}

func TestNotebookRoundTripAndIndependentStorage(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	s := New(Options{})
	w := notebookRequest(s, http.MethodGet, "")
	var snapshot notebookSnapshot
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &snapshot) != nil || snapshot.Version != 1 || snapshot.Revision != 0 || string(snapshot.Data) != "null" {
		t.Fatalf("initial notebook: %d %s", w.Code, w.Body.String())
	}
	if w = workspaceRequest(s, http.MethodPost, `{"version":1,"revision":0,"data":{"garden":"unchanged"}}`); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	workspaceBefore, err := os.ReadFile(s.workspace.path)
	if err != nil {
		t.Fatal(err)
	}
	if w = notebookRequest(s, http.MethodPut, notebookBody(0, notebookFixture)); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &snapshot); err != nil || snapshot.Revision != 1 || !bytes.Equal(snapshot.Data, []byte(notebookFixture)) {
		t.Fatalf("save did not preserve content and metadata: %s", w.Body.String())
	}
	second := New(Options{})
	w = notebookRequest(second, http.MethodGet, "")
	if err := json.Unmarshal(w.Body.Bytes(), &snapshot); w.Code != 200 || err != nil || snapshot.Revision != 1 || !bytes.Equal(snapshot.Data, []byte(notebookFixture)) {
		t.Fatalf("restart did not preserve notebook: %s", w.Body.String())
	}
	w = notebookRequest(second, http.MethodPut, notebookBody(0, notebookFixture))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), `"revision":1`) {
		t.Fatalf("stale save was accepted: %d %s", w.Code, w.Body.String())
	}
	workspaceAfter, err := os.ReadFile(s.workspace.path)
	if err != nil || !bytes.Equal(workspaceBefore, workspaceAfter) {
		t.Fatal("notebook save affected courtyard storage")
	}
}

func TestNotebookRejectsInvalidSavesWithoutChangingStoredNotes(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	s := New(Options{})
	if w := notebookRequest(s, http.MethodPut, notebookBody(0, notebookFixture)); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	before, _ := os.ReadFile(s.notebook.path)
	for _, body := range []string{
		`{}`,
		`{"version":1,"data":` + notebookFixture + `}`,
		notebookBody(1, `null`),
		notebookBody(1, `{}`),
		notebookBody(1, `{"courses":null,"notes":[],"preferences":{}}`),
		notebookBody(1, strings.Replace(notebookFixture, `"courseId":"c1"`, `"courseId":"missing"`, 1)),
		notebookBody(1, strings.Replace(notebookFixture, `"createdAt":1790467200000`, `"createdAt":null`, 1)),
		notebookBody(1, strings.Replace(notebookFixture, `"selectedNoteId":"n1"`, `"selectedNoteId":7`, 1)),
		notebookBody(1, notebookFixture) + `{}`,
	} {
		if w := notebookRequest(s, http.MethodPut, body); w.Code != http.StatusBadRequest {
			t.Fatalf("invalid save returned %d: %s", w.Code, w.Body.String())
		}
		after, err := os.ReadFile(s.notebook.path)
		if err != nil || !bytes.Equal(before, after) {
			t.Fatal("invalid save modified prior notes")
		}
	}
}

func TestNotebookIndependentWindowsUseRevisionLock(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	servers := []*Server{New(Options{}), New(Options{})}
	codes := make(chan int, 2)
	var wg sync.WaitGroup
	for _, s := range servers {
		wg.Add(1)
		go func(s *Server) {
			defer wg.Done()
			codes <- notebookRequest(s, http.MethodPut, notebookBody(0, notebookFixture)).Code
		}(s)
	}
	wg.Wait()
	close(codes)
	counts := make(map[int]int)
	for code := range codes {
		counts[code]++
	}
	if counts[http.StatusOK] != 1 || counts[http.StatusConflict] != 1 {
		t.Fatalf("simultaneous saves were not isolated: %v", counts)
	}
}

func TestNotebookCorruptFilesAreNeverOverwritten(t *testing.T) {
	for _, content := range []string{"broken", `{"version":1,"revision":3,"data":{}}`, `{"version":2,"revision":3,"data":` + notebookFixture + `}`} {
		t.Run(content[:6], func(t *testing.T) {
			dir := t.TempDir()
			t.Setenv("SZUNET_CONFIG_DIR", dir)
			path := filepath.Join(dir, "notebook-v1.json")
			if err := os.WriteFile(path, []byte(content), 0600); err != nil {
				t.Fatal(err)
			}
			s := New(Options{})
			for _, method := range []string{http.MethodGet, http.MethodPut} {
				if w := notebookRequest(s, method, notebookBody(3, notebookFixture)); w.Code != 500 {
					t.Fatalf("corruption returned %d: %s", w.Code, w.Body.String())
				}
			}
			after, _ := os.ReadFile(path)
			if string(after) != content {
				t.Fatal("corrupt file was overwritten")
			}
		})
	}
}

func TestNotebookRouteCapacityAndOriginGuard(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	s := New(Options{})
	// Exercise the registered route as well as the store: the shared API guard
	// otherwise limits bodies to 1 MiB before the notebook handler sees them.
	largeData := strings.Replace(notebookFixture, `保留原始正文。`, strings.Repeat("学", 400000), 1)
	if w := notebookRequest(s, http.MethodPut, notebookBody(0, largeData)); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	before, _ := os.ReadFile(s.notebook.path)
	for _, body := range []string{
		notebookBody(1, strings.Replace(notebookFixture, `保留原始正文。`, strings.Repeat("x", notebookMaxBytes), 1)),
		notebookBody(1, notebookFixture) + strings.Repeat(" ", notebookMaxBytes),
	} {
		if w := notebookRequest(s, http.MethodPut, body); w.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("oversized body returned %d: %s", w.Code, w.Body.String())
		}
	}
	mux := http.NewServeMux()
	s.routes(mux, fstest.MapFS{})
	for _, tc := range []struct {
		method, origin, contentType string
		want                        int
	}{
		{http.MethodPut, "https://example.com", "application/json", 403},
		{http.MethodGet, "http://127.0.0.1:5678", "", 403},
		{http.MethodPut, "", "text/plain", 415},
		{http.MethodPost, "", "application/json", 405},
	} {
		r := httptest.NewRequest(tc.method, "http://127.0.0.1:1234/api/notebook", strings.NewReader(notebookBody(1, notebookFixture)))
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Content-Type", tc.contentType)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != tc.want {
			t.Fatalf("guard: %s %s returned %d, want %d", tc.method, tc.origin, w.Code, tc.want)
		}
	}
	after, _ := os.ReadFile(s.notebook.path)
	if !bytes.Equal(before, after) {
		t.Fatal("rejected request changed notebook")
	}
}
