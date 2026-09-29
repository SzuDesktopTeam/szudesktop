package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/netpref"
)

// cliMainArgsEnv 让测试二进制在子进程里当成 szunet 本身跑一次，
// 这样能按用户真实敲的命令行（含 flag 解析和退出码）验证 login / logout。
const cliMainArgsEnv = "SZUNET_TEST_CLI_ARGS"

// TestCLIHelperProcess 不是测试本身：只有被下面的用例以子进程方式拉起时才会运行 main。
func TestCLIHelperProcess(t *testing.T) {
	raw := os.Getenv(cliMainArgsEnv)
	if raw == "" {
		t.Skip("只在子进程里运行")
	}
	os.Args = append([]string{"szunet"}, strings.Split(raw, "\x1f")...)
	main()
}

// fakeSrunGate 记下假门户收到的认证 / 注销请求。
type fakeSrunGate struct {
	mu    sync.Mutex
	calls []url.Values
}

func (g *fakeSrunGate) serve(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/cgi-bin/get_challenge":
		_, _ = w.Write([]byte(`_({"challenge":"0123456789abcdef","client_ip":"10.20.30.40","error":"ok"})`))
	case "/cgi-bin/srun_portal":
		g.mu.Lock()
		g.calls = append(g.calls, r.URL.Query())
		g.mu.Unlock()
		_, _ = w.Write([]byte(`_({"error":"ok","suc_msg":"login_ok"})`))
	case "/eportal/portal/logout":
		g.mu.Lock()
		g.calls = append(g.calls, r.URL.Query())
		g.mu.Unlock()
		_, _ = w.Write([]byte(`dr1003({"result":1,"msg":"注销成功"})`))
	default:
		// 门户入口页一律 404：以前 logout 自己重新定 ac_id，走到这里会一路退到兜底值 "1"。
		http.NotFound(w, r)
	}
}

func (g *fakeSrunGate) take() []url.Values {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := g.calls
	g.calls = nil
	return out
}

// runCLI 在子进程里跑一次 szunet，账号走环境变量，不碰钥匙串，也不进命令行参数。
func runCLI(t *testing.T, configDir string, args ...string) (string, error) {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestCLIHelperProcess$")
	cmd.Env = append(os.Environ(),
		cliMainArgsEnv+"="+strings.Join(args, "\x1f"),
		"SZUNET_CONFIG_DIR="+configDir,
		"SZUNET_USERNAME=123456",
		"SZUNET_PASSWORD=not-a-real-password",
	)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// `szunet logout` 必须和 `szunet login` 用同一套客户端设置：--ac-id、--ip，以及这张网缓存的 ac_id。
//
// 以前 logout 直接 new 一个裸客户端：--ip 被忽略（DNS 被代理抢走时 login 能成、logout 却失败），
// ac_id 也不看 --ac-id 和缓存，自己重新探测，门户入口 404 时退到兜底的 "1"。
// 教学区验收 R01 要「注销与重连」这一步，编号对不上就可能得出错误结论（O6）。
func TestLogoutReusesLoginClientSettings(t *testing.T) {
	gate := &fakeSrunGate{}
	srv := httptest.NewServer(http.HandlerFunc(gate.serve))
	defer srv.Close()
	port := srv.URL[strings.LastIndex(srv.URL, ":")+1:]
	// .invalid 保证解析不出来（RFC 6761）；只有照 --ip 直连才能到假门户。
	unresolvable := "http://szu-logout-test.invalid:" + port

	t.Run("--ip 与 --ac-id", func(t *testing.T) {
		dir := t.TempDir()
		for _, action := range []string{"login", "logout"} {
			out, err := runCLI(t, dir, action, "--zone", "teaching", "--host-teaching", unresolvable, "--ip", "127.0.0.1", "--ac-id", "12")
			if err != nil {
				t.Fatalf("%s 失败（%v）：\n%s", action, err, out)
			}
			calls := gate.take()
			if len(calls) != 1 || calls[0].Get("action") != action || calls[0].Get("ac_id") != "12" {
				t.Fatalf("%s 应该照 --ip 连到门户并带上 --ac-id 12，门户收到 %v\n%s", action, calls, out)
			}
		}
	})

	t.Run("这张网缓存的 ac_id", func(t *testing.T) {
		key := netpref.Egress()
		if key == "" {
			t.Skip("这台机器取不到网关或本机地址，没法按网缓存 ac_id")
		}
		dir := t.TempDir()
		t.Setenv("SZUNET_CONFIG_DIR", dir)
		prefs := netpref.Load()
		prefs.SetAcID(key, "7")
		if err := prefs.Save(); err != nil {
			t.Fatal(err)
		}
		out, err := runCLI(t, dir, "logout", "--zone", "teaching", "--host-teaching", srv.URL)
		if err != nil {
			t.Fatalf("logout 失败（%v）：\n%s", err, out)
		}
		calls := gate.take()
		if len(calls) != 1 || calls[0].Get("action") != "logout" || calls[0].Get("ac_id") != "7" {
			t.Fatalf("logout 应该和 login 一样先用这张网缓存的 ac_id 7，门户收到 %v\n%s", calls, out)
		}
	})

	t.Run("宿舍区 --ip", func(t *testing.T) {
		out, err := runCLI(t, t.TempDir(), "logout", "--zone", "dorm", "--host-dorm", unresolvable, "--ip", "127.0.0.1")
		if err != nil {
			t.Fatalf("宿舍区 logout 应该照 --ip 直连门户（%v）：\n%s", err, out)
		}
		if calls := gate.take(); len(calls) != 1 || calls[0].Get("user_account") != ",0,123456" {
			t.Fatalf("宿舍区 logout 没有发到门户：%v\n%s", calls, out)
		}
	})
}
