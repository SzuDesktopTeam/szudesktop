package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestWorkspaceRouteUsesExpandedLimit(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	s := New(Options{})
	mux := http.NewServeMux()
	s.routes(mux, fstest.MapFS{})
	send := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "http://127.0.0.1/api/workspace", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	// Pretty-printed backups may exceed the common API limit without exceeding
	// the workspace limit; route middleware must not reject them first.
	if w := send(`{"version":1,"revision":0,"data":{"schema":3}}` + strings.Repeat(" ", (1<<20)+50000)); w.Code != http.StatusOK {
		t.Fatalf("valid workspace rejected by outer middleware: %d %s", w.Code, w.Body.String())
	}
	if w := send(`{"version":1,"revision":1,"data":{"schema":3}}` + strings.Repeat(" ", workspaceMaxBytes)); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized workspace accepted: %d", w.Code)
	}
	got, err := s.workspace.read()
	if err != nil || got.Revision != 1 {
		t.Fatalf("rejected request modified save: revision %d, %v", got.Revision, err)
	}
}
