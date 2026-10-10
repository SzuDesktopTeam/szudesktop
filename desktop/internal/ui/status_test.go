package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

type statusTestStore struct {
	guardTestStore
	err error
}

func (s *statusTestStore) Load() (credential.Credentials, error) {
	return s.value, s.err
}

func TestStatusSeparatesSavedCredentialsFromPortalState(t *testing.T) {
	for _, tc := range []struct {
		name, body           string
		zone                 portal.Zone
		saved, known, online bool
		storeErr             error
	}{
		{"online without saved account", `dr1003({"result":1,"user_name":"private-test-account","online_ip":"10.20.30.41"})`, portal.ZoneDorm, false, true, true, credential.ErrNotFound},
		{"offline without saved account", `dr1003({"result":0})`, portal.ZoneDorm, false, true, false, credential.ErrNotFound},
		{"saved account unknown portal", `dr1003({})`, portal.ZoneDorm, true, false, false, nil},
		{"saved account offline portal", `dr1003({"result":0})`, portal.ZoneDorm, true, true, false, nil},
		{"outside campus", "", portal.ZoneOutside, true, false, false, nil},
		{"store unavailable but portal online", `dr1003({"result":1})`, portal.ZoneDorm, false, true, true, errors.New("private-store-detail")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if strings.Contains(r.URL.RawQuery, "private-test-account") || strings.Contains(r.URL.RawQuery, "test-password") {
					t.Error("status query must not send account credentials")
				}
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			store := &statusTestStore{err: tc.storeErr}
			if tc.saved {
				store.value = credential.Credentials{Username: "private-test-account", Password: "test-password"}
			}
			s := &Server{
				opts: Options{SrunHost: srv.URL, DrcomHost: srv.URL}, store: store,
				detect: func() *portal.DetectResult { return &portal.DetectResult{Zone: tc.zone, InternetOK: true} },
			}
			rec := httptest.NewRecorder()
			s.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
			var got statusResp
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.Saved != tc.saved || got.OnlineKnown != tc.known || got.Online != tc.online || !got.InternetOK {
				t.Fatalf("unexpected status: %+v", got)
			}
			if tc.zone == portal.ZoneOutside {
				if calls != 0 || got.OnlineError != "" {
					t.Fatalf("outside campus should remain unqueried: calls=%d status=%+v", calls, got)
				}
			} else if calls != 1 || (!tc.known && got.OnlineError == "") {
				t.Fatalf("portal query missing or failed silently: calls=%d status=%+v", calls, got)
			}
			if errors.Is(tc.storeErr, credential.ErrNotFound) && got.LastError != "" {
				t.Errorf("not saving credentials is not an error: %s", got.LastError)
			}
			// online_ip、username 从未赋值，已从接口删掉；账号和设备 IP 一律不回传给页面。
			var raw map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
				t.Fatal(err)
			}
			for _, key := range []string{"online_ip", "username"} {
				if _, ok := raw[key]; ok {
					t.Errorf("status still carries %s: %s", key, rec.Body.String())
				}
			}
			for _, private := range []string{"private-test-account", "test-password", "10.20.30.41", "private-store-detail", srv.URL} {
				if strings.Contains(rec.Body.String(), private) {
					t.Errorf("status revealed private value %q", private)
				}
			}
		})
	}
}

func TestStatusDoesNotCountCommandLineCredentialsAsSaved(t *testing.T) {
	s := &Server{
		opts:   Options{User: "temporary-test-user", Password: "temporary-test-password"},
		store:  &statusTestStore{err: credential.ErrNotFound},
		detect: func() *portal.DetectResult { return &portal.DetectResult{Zone: portal.ZoneOutside} },
	}
	rec := httptest.NewRecorder()
	s.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	var got statusResp
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Saved || got.LastError != "" {
		t.Fatalf("temporary account must not count as saved: %+v", got)
	}
}

// 校外时一次探测要十几秒。并发到达的 /api/status 只探一次，短时间内复用；
// 登录之后必须作废，页面紧接着刷新时要看到新状态。
func TestStatusSharesProbeAndRefreshesAfterLogin(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	var queries int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/eportal/portal/rad_user_info":
			atomic.AddInt32(&queries, 1)
			_, _ = w.Write([]byte(`dr1003({"result":0})`))
		case "/eportal/portal/login":
			_, _ = w.Write([]byte(`dr1003({"result":1,"msg":"认证成功"})`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer fake.Close()
	var detects int32
	s := New(Options{DrcomHost: fake.URL, SrunHost: fake.URL})
	s.store = &statusTestStore{err: credential.ErrNotFound}
	s.detect = func() *portal.DetectResult {
		atomic.AddInt32(&detects, 1)
		time.Sleep(50 * time.Millisecond)
		return &portal.DetectResult{Zone: portal.ZoneDorm}
	}
	status := func() statusResp {
		rec := httptest.NewRecorder()
		s.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
		var got statusResp
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Error(err)
		}
		return got
	}
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if got := status(); got.Zone != string(portal.ZoneDorm) || !got.OnlineKnown {
				t.Errorf("unexpected status: %+v", got)
			}
		}()
	}
	wg.Wait()
	if d, q := atomic.LoadInt32(&detects), atomic.LoadInt32(&queries); d != 1 || q != 1 {
		t.Fatalf("concurrent status requests probed %d times and queried %d times", d, q)
	}
	status()
	if d := atomic.LoadInt32(&detects); d != 1 {
		t.Fatalf("fresh result was not reused: %d probes", d)
	}
	if res := s.doLogin("123456", "not-real", "dorm", ""); !res.OK {
		t.Fatalf("login failed: %+v", res)
	}
	status()
	if d, q := atomic.LoadInt32(&detects), atomic.LoadInt32(&queries); d != 2 || q != 2 {
		t.Fatalf("status after login must probe again: detects=%d queries=%d", d, q)
	}
}

// 登录时如果还有一次探测在跑（校外要十几秒），登录后的刷新不能先陪它等完再自己探一遍：
// 直接另起一次新探测；旧探测晚到的过时结果也不能写回缓存。
func TestStatusAfterLoginDoesNotWaitForStaleProbe(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/eportal/portal/rad_user_info":
			_, _ = w.Write([]byte(`dr1003({"result":1,"uid":"123456"})`))
		case "/eportal/portal/login":
			_, _ = w.Write([]byte(`dr1003({"result":1,"msg":"认证成功"})`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer fake.Close()
	var detects int32
	entered, release := make(chan struct{}), make(chan struct{})
	var releaseOnce sync.Once
	defer releaseOnce.Do(func() { close(release) })
	s := New(Options{DrcomHost: fake.URL, SrunHost: fake.URL})
	s.store = &statusTestStore{err: credential.ErrNotFound}
	s.detect = func() *portal.DetectResult {
		if atomic.AddInt32(&detects, 1) == 1 {
			close(entered)
			<-release
			return &portal.DetectResult{Zone: portal.ZoneOutside}
		}
		return &portal.DetectResult{Zone: portal.ZoneDorm}
	}
	status := func() <-chan statusResp {
		out := make(chan statusResp, 1)
		go func() {
			rec := httptest.NewRecorder()
			s.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
			var got statusResp
			_ = json.Unmarshal(rec.Body.Bytes(), &got)
			out <- got
		}()
		return out
	}
	stale := status()
	<-entered
	if res := s.doLogin("123456", "not-real", "dorm", ""); !res.OK {
		t.Fatalf("login failed: %+v", res)
	}
	select {
	case got := <-status():
		if got.Zone != string(portal.ZoneDorm) {
			t.Fatalf("status after login must come from a fresh probe: %+v", got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("status after login waited for the stale in-flight probe")
	}
	releaseOnce.Do(func() { close(release) })
	if got := <-stale; got.Zone != string(portal.ZoneOutside) {
		t.Fatalf("the request that started the stale probe should still get its answer: %+v", got)
	}
	if got := <-status(); got.Zone != string(portal.ZoneDorm) {
		t.Fatalf("stale probe result must not overwrite the fresh cache: %+v", got)
	}
	if d := atomic.LoadInt32(&detects); d != 2 {
		t.Fatalf("expected the stale probe plus one fresh probe, got %d", d)
	}
}

func TestStatusForcedRefreshBypassesFreshCache(t *testing.T) {
	var queries, detects int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&queries, 1)
		_, _ = w.Write([]byte(`dr1003({"result":0})`))
	}))
	defer fake.Close()
	s := &Server{
		opts:  Options{DrcomHost: fake.URL, SrunHost: fake.URL},
		store: &statusTestStore{err: credential.ErrNotFound},
		detect: func() *portal.DetectResult {
			n := atomic.AddInt32(&detects, 1)
			return &portal.DetectResult{Zone: portal.ZoneDorm, InternetOK: n > 1}
		},
	}
	status := func(target string) statusResp {
		rec := httptest.NewRecorder()
		s.handleStatus(rec, httptest.NewRequest(http.MethodGet, target, nil))
		var got statusResp
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		return got
	}
	if got := status("/api/status"); got.InternetOK {
		t.Fatalf("unexpected initial status: %+v", got)
	}
	status("/api/status?refresh=0")
	if d, q := atomic.LoadInt32(&detects), atomic.LoadInt32(&queries); d != 1 || q != 1 {
		t.Fatalf("ordinary status must reuse the fresh cache: detects=%d queries=%d", d, q)
	}
	if got := status("/api/status?refresh=1"); !got.InternetOK {
		t.Fatalf("forced refresh returned the old cached status: %+v", got)
	}
	if got := status("/api/status"); !got.InternetOK {
		t.Fatalf("ordinary status did not reuse the refreshed result: %+v", got)
	}
	if d, q := atomic.LoadInt32(&detects), atomic.LoadInt32(&queries); d != 2 || q != 2 {
		t.Fatalf("expected one initial and one forced probe: detects=%d queries=%d", d, q)
	}
}

func TestStatusForcedRefreshReplacesInflightProbe(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`dr1003({"result":1})`))
	}))
	defer fake.Close()
	oldEntered, freshEntered := make(chan struct{}), make(chan struct{})
	releaseOld, releaseFresh := make(chan struct{}), make(chan struct{})
	var oldOnce, freshOnce sync.Once
	defer oldOnce.Do(func() { close(releaseOld) })
	defer freshOnce.Do(func() { close(releaseFresh) })
	var detects int32
	s := &Server{
		opts:  Options{DrcomHost: fake.URL, SrunHost: fake.URL},
		store: &statusTestStore{err: credential.ErrNotFound},
		detect: func() *portal.DetectResult {
			switch atomic.AddInt32(&detects, 1) {
			case 1:
				close(oldEntered)
				<-releaseOld
				return &portal.DetectResult{Zone: portal.ZoneOutside}
			case 2:
				close(freshEntered)
				<-releaseFresh
			}
			return &portal.DetectResult{Zone: portal.ZoneDorm, InternetOK: true}
		},
	}
	status := func(target string) <-chan *httptest.ResponseRecorder {
		out := make(chan *httptest.ResponseRecorder, 1)
		go func() {
			rec := httptest.NewRecorder()
			s.handleStatus(rec, httptest.NewRequest(http.MethodGet, target, nil))
			out <- rec
		}()
		return out
	}
	readStatus := func(out <-chan *httptest.ResponseRecorder) statusResp {
		select {
		case rec := <-out:
			var got statusResp
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			return got
		case <-time.After(time.Second):
			t.Fatal("status waited for a stale in-flight probe")
			return statusResp{}
		}
	}
	old := status("/api/status")
	<-oldEntered
	fresh := status("/api/status?refresh=1")
	select {
	case <-freshEntered:
	case <-time.After(time.Second):
		t.Fatal("forced refresh did not start a new probe while the old probe was running")
	}
	shared := status("/api/status")
	select {
	case <-shared:
		t.Fatal("ordinary status returned before the fresh probe finished")
	case <-time.After(50 * time.Millisecond):
	}
	freshOnce.Do(func() { close(releaseFresh) })
	for _, out := range []<-chan *httptest.ResponseRecorder{fresh, shared} {
		if got := readStatus(out); got.Zone != string(portal.ZoneDorm) || !got.InternetOK || !got.Online {
			t.Fatalf("status did not share the fresh probe: %+v", got)
		}
	}
	oldOnce.Do(func() { close(releaseOld) })
	if got := readStatus(old); got.Zone != string(portal.ZoneOutside) {
		t.Fatalf("the original request lost its own probe result: %+v", got)
	}
	if got := readStatus(status("/api/status")); got.Zone != string(portal.ZoneDorm) || !got.Online {
		t.Fatalf("stale probe overwrote the fresh cache: %+v", got)
	}
	if d := atomic.LoadInt32(&detects); d != 2 {
		t.Fatalf("ordinary requests must share the forced probe, got %d probes", d)
	}
}
