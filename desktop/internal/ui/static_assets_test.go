package ui

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
)

func TestEmbeddedModulesIgnoreSystemMIMEOverride(t *testing.T) {
	// Windows applications can register .mjs or .css as text/plain in HKCR.
	// Browsers reject that MIME type for ES modules and stylesheets even when
	// the file content is valid, leaving a blank or unstyled page.
	for _, tc := range []struct{ ext, path, body, want string }{
		{".mjs", "garden/app.mjs", "export const ready = true;", "text/javascript"},
		{".css", "garden/style.css", "body{margin:0}", "text/css"},
	} {
		original := mime.TypeByExtension(tc.ext)
		if err := mime.AddExtensionType(tc.ext, "text/plain"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := mime.AddExtensionType(tc.ext, original); err != nil {
				t.Error(err)
			}
		})
		static := fstest.MapFS{tc.path: {Data: []byte(tc.body)}}
		mux := http.NewServeMux()
		(&Server{}).routes(mux, static)
		for _, path := range []string{"/assets/" + tc.path, "/" + tc.path} {
			t.Run(path, func(t *testing.T) {
				response := httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
				if response.Code != http.StatusOK || response.Body.String() != tc.body {
					t.Fatalf("static asset: %d %q", response.Code, response.Body.String())
				}
				kind, _, err := mime.ParseMediaType(response.Header().Get("Content-Type"))
				if err != nil || (kind != tc.want && !(tc.ext == ".mjs" && kind == "application/javascript")) {
					t.Fatalf("%s MIME must not depend on the Windows registry: %q (%v)", tc.ext, response.Header().Get("Content-Type"), err)
				}
				if response.Header().Get("X-Content-Type-Options") != "nosniff" {
					t.Fatal("static assets must disable MIME sniffing")
				}
			})
		}
	}
}

// 便携版由 Go 直接把页面交给浏览器，没有 Electron 注入的 CSP。
// Go 端的策略必须与 window-policy.mjs 逐条一致，并额外禁止被别的网站嵌进 iframe。
func TestIndexCarriesElectronCSPAndFrameProtection(t *testing.T) {
	source, err := os.ReadFile(filepath.Join("..", "..", "electron", "window-policy.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	block := regexp.MustCompile(`(?s)contentSecurityPolicy\s*=\s*\[(.*?)\]\.join\('; '\)`).FindSubmatch(source)
	if block == nil {
		t.Fatal("window-policy.mjs no longer defines contentSecurityPolicy as a joined list")
	}
	var directives []string
	for _, m := range regexp.MustCompile(`"([^"]+)"`).FindAllSubmatch(block[1], -1) {
		directives = append(directives, string(m[1]))
	}
	want := strings.Join(append(directives, "frame-ancestors 'none'"), "; ")
	if indexCSP != want {
		t.Fatalf("Go CSP drifted from Electron:\n go: %s\nwant: %s", indexCSP, want)
	}

	mux := http.NewServeMux()
	(&Server{}).routes(mux, fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}})
	for _, path := range []string{"/", "/index.html"} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		h := response.Header()
		if response.Code != http.StatusOK || h.Get("Content-Security-Policy") != indexCSP || h.Get("X-Frame-Options") != "DENY" || h.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("%s: %d %v", path, response.Code, h)
		}
	}
}
