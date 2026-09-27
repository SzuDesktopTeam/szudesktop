package ui

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestFeishuDocumentURLAllowlist(t *testing.T) {
	for _, raw := range []string{
		"https://class.feishu.cn/docx/ABC123?from=share#heading",
		"https://class.larksuite.com/wiki/ABC123/",
		"https://class.larkoffice.com/docx/ABC123?from=share",
	} {
		got, err := canonicalFeishuDocument(raw)
		if err != nil || strings.ContainsAny(got, "?#") {
			t.Fatalf("valid document URL rejected: %q %v", got, err)
		}
	}
	for _, raw := range []string{
		"http://class.feishu.cn/docx/ABC123",
		"https://class.feishu.cn.attacker.test/docx/ABC123",
		"https://class.larkoffice.com.attacker.test/docx/ABC123",
		"https://class.larkoffice.com@attacker.test/docx/ABC123",
		"https://class.feishu.cn@attacker.test/docx/ABC123",
		"https://class.feishu.cn:443/docx/ABC123",
		"https://127.0.0.1/docx/ABC123",
		"https://class.feishu.cn/docx/%41BC123",
		"https://class.feishu.cn/base/ABC123",
		"--as=bot",
	} {
		if got, err := canonicalFeishuDocument(raw); err == nil {
			t.Fatalf("unsafe document URL accepted: %q", got)
		}
	}
}

func TestFeishuStatusRequiresUserIdentity(t *testing.T) {
	for _, tc := range []struct {
		response  string
		connected bool
	}{
		{`{"identities":{"bot":{"available":true},"user":{"available":false}}}`, false},
		{`{"identities":{"bot":{"available":true}}}`, false},
		{`{"identities":{"user":{"available":true,"userName":"测试同学"}}}`, true},
	} {
		f := &feishuService{available: func() bool { return true }, run: func(_ context.Context, args ...string) ([]byte, error) {
			if !reflect.DeepEqual(args, []string{"auth", "status", "--json"}) {
				t.Fatalf("unexpected status command: %v", args)
			}
			return []byte(tc.response), nil
		}}
		if got := f.status(context.Background()); got.Connected != tc.connected {
			t.Fatalf("status connected=%v, want %v", got.Connected, tc.connected)
		}
	}
}

func TestFeishuDocumentImportIsReadOnlyAndUserScoped(t *testing.T) {
	for _, tc := range []struct{ identity, host string }{{"user", "class.feishu.cn"}, {"user", "class.larkoffice.com"}, {"bot", "class.feishu.cn"}} {
		identity, source := tc.identity, "https://"+tc.host+"/docx/ABC123"
		s := &Server{feishu: &feishuService{run: func(_ context.Context, args ...string) ([]byte, error) {
			want := []string{"docs", "+fetch", "--as", "user", "--doc", source, "--doc-format", "markdown", "--json"}
			if !reflect.DeepEqual(args, want) {
				t.Fatalf("unexpected import command: %v", args)
			}
			return []byte(`{"ok":true,"identity":"` + identity + `","data":{"document":{"title":"课程","content":"# 课程\n原文"}},"token":"must-not-return"}`), nil
		}}}
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/api/feishu/document", strings.NewReader(`{"url":"`+source+`?from=share"}`))
		s.handleFeishuDocument(w, r)
		want := http.StatusOK
		if identity != "user" {
			want = http.StatusBadGateway
		}
		if w.Code != want || strings.Contains(w.Body.String(), "must-not-return") {
			t.Fatalf("unexpected import response: %d %s", w.Code, w.Body.String())
		}
	}
}

func TestFeishuLoginKeepsDeviceCodePrivateAndExpiresIt(t *testing.T) {
	calls := 0
	f := &feishuService{available: func() bool { return true }}
	f.run = func(_ context.Context, args ...string) ([]byte, error) {
		calls++
		switch calls {
		case 1:
			want := []string{"auth", "login", "--scope", "docx:document:readonly wiki:wiki:readonly", "--no-wait", "--json"}
			if !reflect.DeepEqual(args, want) {
				t.Fatalf("unexpected scope request: %v", args)
			}
			return []byte(`{"device_code":"private-device-code","verification_url":"https://accounts.feishu.cn/open-apis/authen/v1/device/verify?user_code=example","expires_in":600}`), nil
		case 2:
			if !reflect.DeepEqual(args, []string{"auth", "login", "--device-code", "private-device-code", "--json"}) {
				t.Fatalf("unexpected finish command: %v", args)
			}
			return []byte(`{"ok":true}`), nil
		default:
			return []byte(`{"identities":{"user":{"available":true}}}`), nil
		}
	}
	s := &Server{feishu: f}
	for _, action := range []string{"start", "finish"} {
		w := httptest.NewRecorder()
		s.handleFeishuLogin(w, httptest.NewRequest(http.MethodPost, "/api/feishu/login", strings.NewReader(`{"action":"`+action+`"}`)))
		if w.Code != 200 || strings.Contains(w.Body.String(), "private-device-code") {
			t.Fatalf("login leaked code or failed: %d %s", w.Code, w.Body.String())
		}
	}
	if f.deviceCode != "" || !f.expires.IsZero() || calls != 3 {
		t.Fatal("completed authorization remained pending")
	}
	f.deviceCode, f.expires = "expired-code", time.Now().Add(-time.Second)
	w := httptest.NewRecorder()
	s.handleFeishuLogin(w, httptest.NewRequest(http.MethodPost, "/api/feishu/login", strings.NewReader(`{"action":"finish"}`)))
	if w.Code != 400 || calls != 3 {
		t.Fatal("expired authorization was sent to CLI")
	}
}

func TestFeishuOutputAndRequestLimits(t *testing.T) {
	var out feishuOutput
	if _, err := out.Write([]byte(strings.Repeat("x", 2<<20))); err != nil {
		t.Fatal(err)
	}
	if _, err := out.Write([]byte("x")); err == nil || out.Len() != 2<<20 {
		t.Fatal("CLI output exceeded bound")
	}
	for _, body := range []string{
		`{"url":"https://class.feishu.cn/docx/ABC123"}` + strings.Repeat(" ", 8193) + `{}`,
		`{"url":"https://class.feishu.cn/docx/ABC123"} {}`,
	} {
		var request struct {
			URL string `json:"url"`
		}
		if err := decodeFeishuBody(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)), &request); err == nil {
			t.Fatal("oversized or trailing request was accepted")
		}
	}
}

func TestFeishuFindsNpmNativeBinaryWithoutShell(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PATH", dir)
	name := "lark-cli"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	native := filepath.Join(dir, "node_modules", "@larksuite", "cli", "bin", name)
	if err := os.MkdirAll(filepath.Dir(native), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(native, []byte("test placeholder; never executed"), 0700); err != nil {
		t.Fatal(err)
	}
	if got := findFeishuCLI(); got != native {
		t.Fatalf("native CLI not found: %q", got)
	}
}
