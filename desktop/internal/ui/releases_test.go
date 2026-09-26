package ui

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type releaseTransport func(*http.Request) (*http.Response, error)

func (f releaseTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func releaseClient(t *testing.T, endpoint, body string, status int) *http.Client {
	t.Helper()
	return &http.Client{Transport: releaseTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != endpoint || r.Method != http.MethodGet || r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL)
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
}

func TestReleaseChannels(t *testing.T) {
	body := `[{"tag_name":"beta0.9.10","prerelease":true,"published_at":"2026-09-27"},{"tag_name":"beta0.10.0","prerelease":true,"published_at":"2026-09-27"},{"tag_name":"v1.0.0","draft":true,"published_at":"2026-09-27"},{"tag_name":"../../evil","published_at":"2026-09-27","html_url":"https://evil.invalid"}]`
	result, err := fetchRelease(context.Background(), releaseClient(t, releasesAPI+"?per_page=100", body, 200), "beta")
	if err != nil || result.Version != "beta0.10.0" || !result.Prerelease || result.URL != releasesPage+"beta0.10.0" {
		t.Fatalf("wrong beta result: %+v %v", result, err)
	}
	body = `{"tag_name":"v1.0.0","published_at":"2026-09-27","html_url":"https://evil.invalid"}`
	result, err = fetchRelease(context.Background(), releaseClient(t, releasesAPI+"/latest", body, 200), "stable")
	if err != nil || result.Version != "v1.0.0" || result.Prerelease || result.URL != releasesPage+"v1.0.0" {
		t.Fatalf("wrong stable result: %+v %v", result, err)
	}
}

func TestReleaseMissingAndFailures(t *testing.T) {
	result, err := fetchRelease(context.Background(), releaseClient(t, releasesAPI+"/latest", `{}`, 404), "stable")
	if err != nil || result.Available || !strings.Contains(result.Message, "还没有正式版") {
		t.Fatalf("no stable release must be explicit: %+v %v", result, err)
	}
	for _, tc := range []struct {
		body   string
		status int
	}{{`invalid`, 200}, {`{"message":"private upstream content"}`, 403}, {`[{"tag_name":"unknown"}]`, 200}} {
		result, err = fetchRelease(context.Background(), releaseClient(t, releasesAPI+"?per_page=100", tc.body, tc.status), "beta")
		if err == nil || result.Available || strings.Contains(err.Error(), "private upstream") {
			t.Fatalf("must report a safe failure: %+v %v", result, err)
		}
	}
	w := httptest.NewRecorder()
	(&Server{}).handleReleases(w, httptest.NewRequest("GET", "/api/releases?channel=https://example.invalid", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid channel: %d", w.Code)
	}
}

func TestReleaseVersionComparison(t *testing.T) {
	beta, _ := releaseVersion("beta1.0.0")
	stable, _ := releaseVersion("v1.0.0")
	if !newerRelease(stable, beta) || newerRelease(beta, stable) {
		t.Fatal("stable must supersede beta of same version")
	}
}
