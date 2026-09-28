package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/version"
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
	result, _, err := fetchRelease(context.Background(), releaseClient(t, releasesAPI+"?per_page=10", body, 200), "beta", "")
	if err != nil || result.Version != "beta0.10.0" || !result.Prerelease || result.URL != releasesPage+"beta0.10.0" {
		t.Fatalf("wrong beta result: %+v %v", result, err)
	}
	body = `{"tag_name":"v1.0.0","published_at":"2026-09-27","html_url":"https://evil.invalid"}`
	result, _, err = fetchRelease(context.Background(), releaseClient(t, releasesAPI+"/latest", body, 200), "stable", "")
	if err != nil || result.Version != "v1.0.0" || result.Prerelease || result.URL != releasesPage+"v1.0.0" {
		t.Fatalf("wrong stable result: %+v %v", result, err)
	}
}

func TestReleaseMissingAndFailures(t *testing.T) {
	result, _, err := fetchRelease(context.Background(), releaseClient(t, releasesAPI+"/latest", `{}`, 404), "stable", "")
	if err != nil || result.Available || !strings.Contains(result.Message, "还没有正式版") {
		t.Fatalf("no stable release must be explicit: %+v %v", result, err)
	}
	for _, tc := range []struct {
		body   string
		status int
	}{{`invalid`, 200}, {`{"message":"private upstream content"}`, 403}, {`[{"tag_name":"unknown"}]`, 200}, {``, 304}} {
		result, _, err = fetchRelease(context.Background(), releaseClient(t, releasesAPI+"?per_page=10", tc.body, tc.status), "beta", "")
		if err == nil || result.Available || strings.Contains(err.Error(), "private upstream") {
			t.Fatalf("must report a safe failure: %+v %v", result, err)
		}
	}
	w := httptest.NewRecorder()
	(&Server{}).handleReleases(w, httptest.NewRequest("GET", "/api/releases?channel=https://example.invalid", nil))
	var body struct {
		OK      *bool  `json:"ok"`
		Message string `json:"message"`
	}
	if w.Code != http.StatusBadRequest || json.Unmarshal(w.Body.Bytes(), &body) != nil || body.OK == nil || *body.OK || body.Message == "" {
		t.Fatalf("invalid channel must be a JSON API error: %d %s", w.Code, w.Body.String())
	}
}

// GitHub 对未认证请求按出口 IP 每小时只给 60 次，校园网 NAT 下很容易用完。
// 检查结果要在进程里缓存，过期后用 ETag 条件请求，304 时沿用旧结果。
func TestReleaseCheckCachesAndRevalidates(t *testing.T) {
	var requests []string
	status, etag := http.StatusOK, `W/"v1"`
	body := fmt.Sprintf(`[{"tag_name":%q,"prerelease":true,"published_at":"2026-09-27"}]`, version.Current)
	client := &http.Client{Transport: releaseTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != releasesAPI+"?per_page=10" {
			t.Fatalf("unexpected request: %s", r.URL)
		}
		requests = append(requests, r.Header.Get("If-None-Match"))
		header := make(http.Header)
		header.Set("ETag", etag)
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: header}, nil
	})}
	s := &Server{releases: releaseChecker{client: client}}
	get := func() (int, releaseInfo) {
		w := httptest.NewRecorder()
		s.handleReleases(w, httptest.NewRequest("GET", "/api/releases?channel=beta", nil))
		var info releaseInfo
		_ = json.Unmarshal(w.Body.Bytes(), &info)
		return w.Code, info
	}
	if code, info := get(); code != 200 || info.Version != version.Current {
		t.Fatalf("first check: %d %+v", code, info)
	}
	if code, info := get(); code != 200 || info.Version != version.Current || len(requests) != 1 {
		t.Fatalf("fresh result must come from memory: %d %+v requests=%q", code, info, requests)
	}
	expire := func() {
		s.releases.mu.Lock()
		entry := s.releases.entries["beta"]
		entry.at = time.Now().Add(-releaseCacheTTL - time.Second)
		s.releases.entries["beta"] = entry
		s.releases.mu.Unlock()
	}
	expire()
	status, body = http.StatusNotModified, ""
	if code, info := get(); code != 200 || info.Version != version.Current || info.Stale || len(requests) != 2 || requests[1] != `W/"v1"` {
		t.Fatalf("expired entry must revalidate with ETag: %d %+v requests=%q", code, info, requests)
	}
	// 额度用完时，给出这次运行里上一次成功的结果，而不是报错；
	// 但要标明是旧结果、是多久以前的，学生才不会以为刚刚查过。
	expire()
	status, body = http.StatusForbidden, `{"message":"API rate limit exceeded"}`
	if code, info := get(); code != 200 || info.Version != version.Current || len(requests) != 3 || !info.Stale || !strings.Contains(info.Message, "GitHub 暂时不可用，显示的是 15 分钟前的检查结果") {
		t.Fatalf("rate limit must fall back to the last good result and say it is stale: %d %+v", code, info)
	}
	if info := staleRelease(releaseInfo{Message: "所选渠道暂时没有公开版本。"}, 3*time.Hour); !strings.HasPrefix(info.Message, "GitHub 暂时不可用，显示的是 3 小时前") || !strings.HasSuffix(info.Message, "所选渠道暂时没有公开版本。") {
		t.Fatalf("stale note must keep the original message: %q", info.Message)
	}
	fresh := &Server{releases: releaseChecker{client: client}}
	w := httptest.NewRecorder()
	fresh.handleReleases(w, httptest.NewRequest("GET", "/api/releases?channel=beta", nil))
	if w.Code != http.StatusBadGateway || strings.Contains(w.Body.String(), "rate limit") || !strings.Contains(w.Body.String(), `"ok":false`) {
		t.Fatalf("uncached failure must be a safe JSON error: %d %s", w.Code, w.Body.String())
	}
}

func TestReleaseVersionComparison(t *testing.T) {
	beta, _ := releaseVersion("beta1.0.0")
	stable, _ := releaseVersion("v1.0.0")
	if !newerRelease(stable, beta) || newerRelease(beta, stable) {
		t.Fatal("stable must supersede beta of same version")
	}
}
