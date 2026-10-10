package portal

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type contextLoginClient interface {
	LoginContext(context.Context) (*Result, error)
}

func TestLoginContextRejectsCanceledOperations(t *testing.T) {
	for _, protocol := range []string{"srun", "drcom"} {
		for _, expired := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/expired=%v", protocol, expired), func(t *testing.T) {
				var requests atomic.Int32
				srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					requests.Add(1)
					switch r.URL.Path {
					case "/cgi-bin/get_challenge":
						fmt.Fprint(w, `_({"challenge":"0123456789abcdef","client_ip":"10.20.30.40","error":"ok"})`)
					case "/cgi-bin/srun_portal":
						fmt.Fprint(w, `_({"error":"ok","suc_msg":"login_ok"})`)
					case "/eportal/portal/login":
						fmt.Fprint(w, `dr1003({"result":1,"msg":"认证成功"})`)
					default:
						http.NotFound(w, r)
					}
				}))
				defer srv.Close()
				var client contextLoginClient
				if protocol == "srun" {
					c := NewSrunClient(srv.URL, "123456", "test-password")
					c.AcID = "12"
					client = c
				} else {
					client = NewDrcomClient(srv.URL, "123456", "test-password")
				}
				ctx, cancel := context.WithCancel(context.Background())
				if expired {
					cancel()
					ctx, cancel = context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
				} else {
					cancel()
				}
				defer cancel()
				if _, err := client.LoginContext(ctx); !errors.Is(err, ctx.Err()) {
					t.Errorf("login error = %v, want %v", err, ctx.Err())
				}
				if got := requests.Load(); got != 0 {
					t.Errorf("canceled login started %d requests", got)
				}
			})
		}
	}
}

func TestLoginContextCancelsEveryNetworkStage(t *testing.T) {
	for _, tc := range []struct {
		name     string
		blocked  string
		started  int
		wantAuth int32
		drcom    bool
	}{
		{"challenge", "/cgi-bin/get_challenge", 1, 0, false},
		{"redirect", "/gateway/", 2, 0, false},
		{"portal-guess", "/srun_portal_pc", 1, 0, false},
		{"authentication", "/cgi-bin/srun_portal", 1, 1, false},
		{"online-status", "/cgi-bin/rad_user_info", 1, 1, false},
		{"drcom-authentication", "/eportal/portal/login", 1, 1, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			release := make(chan struct{})
			entered := make(chan struct{}, 16)
			var authRequests, guessRequests atomic.Int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/cgi-bin/srun_portal" || r.URL.Path == "/eportal/portal/login" {
					authRequests.Add(1)
				}
				if r.URL.Path == "/srun_portal_pc" {
					guessRequests.Add(1)
				}
				if strings.HasPrefix(r.URL.Path, tc.blocked) {
					entered <- struct{}{}
					w.WriteHeader(http.StatusOK)
					w.(http.Flusher).Flush()
					select {
					case <-r.Context().Done():
					case <-release:
					}
					return
				}
				switch r.URL.Path {
				case "/cgi-bin/get_challenge":
					fmt.Fprint(w, `_({"challenge":"0123456789abcdef","client_ip":"10.20.30.40","error":"ok"})`)
				case "/srun_portal_pc":
					fmt.Fprintf(w, `CONFIG = { acid: "%s" };`, r.URL.Query().Get("ac_id"))
				case "/cgi-bin/srun_portal":
					if tc.name == "online-status" {
						fmt.Fprint(w, `_({"error":"ok","suc_msg":"ip_already_online_error"})`)
					} else {
						fmt.Fprint(w, `_({"error":"ok","suc_msg":"login_ok"})`)
					}
				default:
					http.NotFound(w, r)
				}
			}))
			t.Cleanup(srv.Close)
			var client contextLoginClient
			if tc.drcom {
				client = NewDrcomClient(srv.URL, "123456", "test-password")
			} else {
				c := NewSrunClient(srv.URL, "123456", "test-password")
				c.AcID = "12"
				c.redirectProbes = nil
				if tc.name == "redirect" {
					c.AcID = ""
					c.redirectProbes = []string{srv.URL + "/gateway/one", srv.URL + "/gateway/two"}
				} else if tc.name == "portal-guess" {
					c.AcID = ""
				}
				client = c
			}
			done := make(chan struct{})
			result := make(chan error, 1)
			go func() {
				defer close(done)
				_, err := client.LoginContext(ctx)
				result <- err
			}()
			t.Cleanup(func() {
				cancel()
				close(release)
				<-done
			})
			for range tc.started {
				select {
				case <-entered:
				case <-time.After(2 * time.Second):
					t.Fatal("login did not reach the requested network stage")
				}
			}
			cancel()
			select {
			case err := <-result:
				if !errors.Is(err, context.Canceled) {
					t.Errorf("login error = %v, want context.Canceled", err)
				}
			case <-time.After(time.Second):
				t.Fatal("login kept waiting after parent cancellation")
			}
			if got := authRequests.Load(); got != tc.wantAuth {
				t.Errorf("authentication requests = %d, want %d", got, tc.wantAuth)
			}
			if tc.name == "portal-guess" && guessRequests.Load() != 1 {
				t.Errorf("canceled discovery started later candidates: %d requests", guessRequests.Load())
			}
		})
	}
}

func TestSrunLoginContextStopsRejectedCacheRetry(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var challenges, authRequests atomic.Int32
	var logins []string
	srv := srunPortalByAcID(t, "12", &logins)
	c := NewSrunClient(srv.URL, "123456", "test-password")
	c.SetLastAcID("5")
	c.redirectProbes = nil
	c.OnAcIDRejected = func(string) { cancel() }
	base := c.http.Transport
	c.http.Transport = loginContextTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cgi-bin/get_challenge" {
			challenges.Add(1)
		} else if r.URL.Path == "/cgi-bin/srun_portal" {
			authRequests.Add(1)
		}
		return base.RoundTrip(r)
	})
	if _, err := c.LoginContext(ctx); !errors.Is(err, context.Canceled) {
		t.Errorf("login error = %v, want context.Canceled", err)
	}
	if challenges.Load() != 1 || authRequests.Load() != 1 {
		t.Errorf("retry continued after cancellation: challenges=%d auth=%d", challenges.Load(), authRequests.Load())
	}
}

type loginContextTransport func(*http.Request) (*http.Response, error)

func (f loginContextTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
