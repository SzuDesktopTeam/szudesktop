package portal

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Redirect the probe sockets to a local server, preserving the requested host.
// No public endpoint or current proxy/network configuration is changed.
func localInternetProbes(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	srv := httptest.NewServer(handler)
	previous := probeTransport
	transport := &http.Transport{
		DisableKeepAlives: true,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, srv.Listener.Addr().String())
		},
	}
	probeTransport = transport
	t.Cleanup(func() {
		srv.Close()
		transport.CloseIdleConnections()
		probeTransport = previous
	})
}

func TestInternetProbeSurvivesSingleProviderFailure(t *testing.T) {
	localInternetProbes(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Host == "www.msftconnecttest.com" && r.URL.Path == "/connecttest.txt" {
			_, _ = io.WriteString(w, "Microsoft Connect Test")
			return
		}
		http.Error(w, "blocked by router", http.StatusForbidden)
	})
	if !internetReachable() {
		t.Fatal("one blocked probe must not hide an independently verified Internet connection")
	}
}

func TestInternetProbeDoesNotFollowCaptiveRedirect(t *testing.T) {
	localInternetProbes(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/login" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.Redirect(w, r, "http://portal.invalid/login", http.StatusFound)
	})
	if internetReachable() {
		t.Fatal("a captive portal redirect is not a successful Internet probe")
	}
}

func TestInternetProbeRejectsUnexpectedContent(t *testing.T) {
	localInternetProbes(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "Please sign in to this network")
	})
	if internetReachable() {
		t.Fatal("a reachable HTML or login page does not verify Internet access")
	}
}

func TestInternetProbeHealthyPathCancelsStalledPeer(t *testing.T) {
	started, canceled := make(chan struct{}), make(chan struct{})
	localInternetProbes(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Host == "connect.rom.miui.com" {
			close(started)
			<-r.Context().Done()
			close(canceled)
			return
		}
		<-started
		_, _ = io.WriteString(w, "Microsoft Connect Test")
	})
	before := time.Now()
	if !internetReachable() {
		t.Fatal("a healthy independent probe should succeed")
	}
	if time.Since(before) > time.Second {
		t.Fatal("a healthy probe waited for the failed path's timeout")
	}
	select {
	case <-canceled:
	case <-time.After(time.Second):
		t.Fatal("the unused probe remained active after success")
	}
}
