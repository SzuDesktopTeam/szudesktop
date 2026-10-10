package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

const logoutUnknownPortalEnv = "SZUNET_TEST_LOGOUT_UNKNOWN_PORTAL"

func TestLogoutUnknownZoneHelperProcess(t *testing.T) {
	host := os.Getenv(logoutUnknownPortalEnv)
	if host == "" {
		t.Skip("only runs in the logout regression subprocess")
	}
	probeNetwork = func() *portal.DetectResult {
		return &portal.DetectResult{
			Zone: portal.ZoneUnknown, Probed: true,
			TeachPortalOK: true, DormPortalOK: true,
		}
	}
	cmdLogout([]string{"--zone", "auto", "--host-teaching", host, "--host-dorm", host, "--ac-id", "12"})
}

func TestLogoutUnknownZoneReportsUnconfirmed(t *testing.T) {
	var requests int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requests, 1)
		http.NotFound(w, r)
	}))
	defer fake.Close()
	cmd := exec.Command(os.Args[0], "-test.run=^TestLogoutUnknownZoneHelperProcess$")
	cmd.Env = append(os.Environ(),
		logoutUnknownPortalEnv+"="+fake.URL,
		"SZUNET_CONFIG_DIR="+t.TempDir(),
		"SZUNET_USERNAME=123456",
		"SZUNET_PASSWORD=not-a-real-password",
	)
	out, err := cmd.CombinedOutput()
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) || exitErr.ExitCode() != 1 {
		t.Fatalf("unknown authentication zone must fail without logging out: err=%v output=%s", err, out)
	}
	want := "未能确认校园网认证区域，尚未执行注销。请手动指定 --zone teaching 或 --zone dorm"
	if !strings.Contains(string(out), want) || strings.Contains(string(out), "不在校园网内，没有可注销的会话") {
		t.Fatalf("unknown zone must report an unconfirmed region and manual options: %s", out)
	}
	if got := atomic.LoadInt32(&requests); got != 0 {
		t.Fatalf("unknown authentication zone sent %d portal requests", got)
	}
}
