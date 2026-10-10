package portal

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSrunStatusUnknownBusinessErrorIsUnconfirmed(t *testing.T) {
	for _, code := range []string{"server_busy", "failed", "unexpected_error"} {
		t.Run(code, func(t *testing.T) {
			srv := fakeSrunPortal(t, "", `_({"error":"`+code+`"})`)
			st, err := NewSrunClient(srv.URL, "", "").Status()
			if err == nil || st != nil {
				t.Fatalf("unknown school error became confirmed offline: status=%+v err=%v", st, err)
			}
		})
	}
}

func TestAcIDDiscoveryRejectsForeignRedirects(t *testing.T) {
	for _, tc := range []struct{ name, location, body string }{
		{"absolute router", "http://router.login.invalid/?ac_id=99", ""},
		{"relative router", "/login?ac_id=99", ""},
		{"interception page", "", `<meta http-equiv="refresh" content="0;url=http://router.login.invalid/?ac_id=99">`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Location", tc.location)
				w.WriteHeader(http.StatusFound)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer router.Close()
			c := NewSrunClient(DefaultSrunHost, "", "")
			c.redirectProbes = []string{router.URL}
			if got := c.discoverAcIDFromRedirect(); got != "" {
				t.Fatalf("foreign redirect became trusted school ac_id %q", got)
			}
		})
	}
}

func TestNoCampusPortalNoteDoesNotClaimCampusAbsence(t *testing.T) {
	got := NoCampusPortalNote(&DetectResult{InternetOK: true})
	if got != "外网可用；校园网认证状态暂未确认" || strings.Contains(got, "校外") {
		t.Fatalf("connectivity overclaimed campus status: %q", got)
	}
}

func TestRejectedExitCacheIsNotReloadedOnNextChallenge(t *testing.T) {
	var logins []string
	srv := srunPortalByAcID(t, "12", &logins)
	c := NewSrunClient(srv.URL, "fixture", "not-real")
	c.redirectProbes = []string{gatewayRedirect(t, "12")}
	cached := "5"
	lookups := 0
	c.AcIDCacheLookup = func(ip string) string {
		if ip != "10.20.30.40" {
			t.Errorf("unexpected school IP %q", ip)
		}
		lookups++
		return cached
	}
	c.OnAcIDRejected = func(string) { cached = "" }
	c.OnAcIDResolved = func(id string) { cached = id }
	res, err := c.Login()
	if err != nil || !res.OK || strings.Join(logins, ",") != "5,12" || lookups != 2 || cached != "12" {
		t.Fatalf("rejected value was reused: result=%+v err=%v logins=%v lookups=%d cache=%q", res, err, logins, lookups, cached)
	}
}
