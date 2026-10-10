package ui

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/netpref"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

func TestAcIDCacheUsesSchoolObservedExit(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	ip := "10.20.30.40"
	var used []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cgi-bin/get_challenge":
			fmt.Fprintf(w, `_({"challenge":"0123456789abcdef","client_ip":%q,"error":"ok"})`, ip)
		case "/cgi-bin/srun_portal":
			used = append(used, r.URL.Query().Get("ac_id"))
			fmt.Fprint(w, `_({"error":"ok","suc_msg":"login_ok"})`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	prefs := netpref.Load()
	prefs.SetAcID(netpref.Egress(), "5") // legacy key must not win
	prefs.SetAcID(srv.URL+"|10.20.30.40", "12")
	prefs.SetAcID(srv.URL+"|10.20.30.41", "7")
	if err := prefs.Save(); err != nil {
		t.Fatal(err)
	}
	for i, want := range []string{"12", "7"} {
		if i == 1 {
			ip = "10.20.30.41"
		}
		c := portal.NewSrunClient(srv.URL, "fixture", "not-real")
		attachAcIDCache(c, true)
		res, err := c.Login()
		if err != nil || !res.OK || used[i] != want {
			t.Fatalf("exit %s used ac_id %v, want %s: result=%+v err=%v", ip, used, want, res, err)
		}
	}
}

func TestManualAcIDDoesNotWriteInvalidExitCache(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cgi-bin/get_challenge" {
			fmt.Fprint(w, `_({"challenge":"0123456789abcdef","client_ip":"invalid","error":"ok"})`)
		} else {
			fmt.Fprint(w, `_({"error":"ok","suc_msg":"login_ok"})`)
		}
	}))
	defer srv.Close()
	c := portal.NewSrunClient(srv.URL, "fixture", "not-real")
	c.AcID = "9"
	attachAcIDCache(c, false)
	res, err := c.Login()
	if err != nil || !res.OK {
		t.Fatalf("manual login: %+v %v", res, err)
	}
	if got := netpref.Load().AcID; len(got) != 0 {
		t.Fatalf("invalid school exit wrote cache: %v", got)
	}
}
