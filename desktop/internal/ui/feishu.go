package ui

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Only these explicit user operations reach the locally installed official CLI.
// No executable, command, identity or token can be supplied by the web page.
type feishuService struct {
	mu         sync.Mutex
	run        func(context.Context, ...string) ([]byte, error)
	available  func() bool
	deviceCode string
	expires    time.Time
	loggingIn  bool
}

func newFeishuService() *feishuService {
	return &feishuService{run: runFeishuCLI, available: func() bool { return findFeishuCLI() != "" }}
}

func findFeishuCLI() string {
	name := "lark-cli"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	if p, err := exec.LookPath(name); err == nil {
		if real, err := filepath.EvalSymlinks(p); err == nil && filepath.Base(real) == "run.js" {
			p = filepath.Join(filepath.Dir(filepath.Dir(real)), "bin", name)
		}
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p
		}
	}
	// npm's Windows .cmd shim would require a shell. Use its native binary
	// instead, which also avoids the wrapper's automatic download behaviour.
	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		if !filepath.IsAbs(dir) {
			continue
		}
		p := filepath.Join(dir, "node_modules", "@larksuite", "cli", "bin", name)
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p
		}
	}
	return ""
}

type feishuOutput struct{ bytes.Buffer }

func (b *feishuOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 2<<20 {
		return 0, errors.New("飞书文档过大，请在官方页面查看")
	}
	return b.Buffer.Write(p)
}

func runFeishuCLI(ctx context.Context, args ...string) ([]byte, error) {
	path := findFeishuCLI()
	if path == "" {
		return nil, errors.New("尚未安装飞书 CLI，可先在官方文档中协作")
	}
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Dir, _ = os.UserHomeDir()
	cmd.Env = append(os.Environ(), "LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1", "LARKSUITE_CLI_NO_SKILLS_NOTIFIER=1")
	hideFeishuCommand(cmd)
	var out, failure feishuOutput
	cmd.Stdout, cmd.Stderr = &out, &failure
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, errors.New("飞书暂时没有响应，请完成授权或检查网络后再试")
		}
		var envelope struct {
			Error struct {
				Type    string `json:"type"`
				Subtype string `json:"subtype"`
			} `json:"error"`
		}
		_ = json.Unmarshal(failure.Bytes(), &envelope)
		switch envelope.Error.Type {
		case "authentication", "authorization":
			return nil, errors.New("飞书登录已失效或缺少文档权限，请连接账号并确认该文档已向你开放")
		case "configuration", "config":
			return nil, errors.New("本机飞书 CLI 尚未配置应用，请先完成官方 CLI 配置")
		default:
			return nil, errors.New("飞书操作未完成。请检查本机 CLI 配置、文档权限和网络；原笔记没有改变")
		}
	}
	return out.Bytes(), nil
}

type feishuStatus struct {
	OK        bool   `json:"ok"`
	Available bool   `json:"available"`
	Connected bool   `json:"connected"`
	Message   string `json:"message"`
	UserName  string `json:"userName,omitempty"`
}

func (f *feishuService) status(ctx context.Context) feishuStatus {
	s := feishuStatus{OK: true, Available: f.available()}
	if !s.Available {
		s.Message = "可在官方文档中共学；安装并配置飞书 CLI 后，还能把课程内容读进本机笔记。"
		return s
	}
	out, err := f.run(ctx, "auth", "status", "--json")
	if err != nil {
		s.Message = err.Error()
		return s
	}
	var status struct {
		Identities struct {
			User struct {
				Available bool   `json:"available"`
				UserName  string `json:"userName"`
			} `json:"user"`
		} `json:"identities"`
	}
	if json.Unmarshal(out, &status) != nil {
		s.Message = "暂时无法识别飞书登录状态，请检查 CLI 版本。"
		return s
	}
	s.Connected = status.Identities.User.Available
	if s.Connected {
		s.UserName = status.Identities.User.UserName
		s.Message = "已连接本机飞书用户身份，读取时会检查文档权限。"
	} else {
		s.Message = "已找到飞书 CLI。连接你的飞书账号后，可读取你有权限的课程文档。"
	}
	return s
}

func (s *Server) handleFeishuStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	writeJSON(w, s.feishu.status(ctx))
}

var feishuDocPath = regexp.MustCompile(`^/(?:docx|wiki)/[A-Za-z0-9]+/?$`)

func canonicalFeishuDocument(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || !feishuDocPath.MatchString(u.Path) || u.RawPath != "" {
		return "", errors.New("请填写完整的飞书文档或知识库 HTTPS 链接")
	}
	host := strings.ToLower(u.Hostname())
	if !strings.HasSuffix(host, ".feishu.cn") && !strings.HasSuffix(host, ".larksuite.com") && !strings.HasSuffix(host, ".larkoffice.com") {
		return "", errors.New("仅支持飞书或 Lark 官方文档链接")
	}
	u.Host = host
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}

func decodeFeishuBody(r *http.Request, v any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 8193))
	if err != nil || len(body) > 8192 {
		return errors.New("请求内容过大或无法读取")
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return errors.New("请求格式不正确")
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return errors.New("请求包含额外内容")
	}
	return nil
}

func (s *Server) handleFeishuDocument(w http.ResponseWriter, r *http.Request) {
	var request struct {
		URL string `json:"url"`
	}
	if err := decodeFeishuBody(r, &request); err != nil {
		writeAPIError(w, 400, err)
		return
	}
	source, err := canonicalFeishuDocument(request.URL)
	if err != nil {
		writeAPIError(w, 400, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
	defer cancel()
	out, err := s.feishu.run(ctx, "docs", "+fetch", "--as", "user", "--doc", source, "--doc-format", "markdown", "--json")
	if err != nil {
		writeAPIError(w, 502, err)
		return
	}
	var result struct {
		OK       bool   `json:"ok"`
		Identity string `json:"identity"`
		Data     struct {
			Document struct {
				Title   string  `json:"title"`
				Content *string `json:"content"`
			} `json:"document"`
		} `json:"data"`
	}
	if json.Unmarshal(out, &result) != nil || !result.OK || result.Identity != "user" || result.Data.Document.Content == nil {
		writeAPIError(w, 502, errors.New("飞书未返回可读取的正文，请在官方页面确认内容；本机笔记没有改变"))
		return
	}
	body := *result.Data.Document.Content
	title := result.Data.Document.Title
	if title == "" {
		for _, line := range strings.Split(body, "\n") {
			if strings.HasPrefix(line, "# ") {
				title = strings.TrimSpace(strings.TrimPrefix(line, "# "))
				break
			}
		}
	}
	if title == "" {
		title = "飞书课程笔记"
	}
	writeJSON(w, map[string]any{"ok": true, "title": title, "content": body, "sourceUrl": source})
}

func (s *Server) handleFeishuLogin(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Action string `json:"action"`
	}
	if err := decodeFeishuBody(r, &request); err != nil {
		writeAPIError(w, 400, err)
		return
	}
	if request.Action != "start" && request.Action != "finish" {
		writeAPIError(w, 400, errors.New("请选择连接账号或检查授权"))
		return
	}
	f := s.feishu
	f.mu.Lock()
	if f.loggingIn {
		f.mu.Unlock()
		writeAPIError(w, 409, errors.New("正在检查飞书授权，请稍候"))
		return
	}
	f.loggingIn = true
	code, expires := f.deviceCode, f.expires
	f.mu.Unlock()
	defer func() { f.mu.Lock(); f.loggingIn = false; f.mu.Unlock() }()
	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
	defer cancel()
	if request.Action == "start" {
		out, err := f.run(ctx, "auth", "login", "--scope", "docx:document:readonly wiki:wiki:readonly", "--no-wait", "--json")
		if err != nil {
			writeAPIError(w, 502, err)
			return
		}
		var result struct {
			DeviceCode string `json:"device_code"`
			URL        string `json:"verification_url"`
			ExpiresIn  int    `json:"expires_in"`
		}
		if json.Unmarshal(out, &result) != nil || result.DeviceCode == "" || result.ExpiresIn <= 0 {
			writeAPIError(w, 502, errors.New("没有取得飞书授权入口，请检查本机 CLI 配置"))
			return
		}
		u, err := url.Parse(result.URL)
		if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || !(strings.HasSuffix(u.Hostname(), ".feishu.cn") || strings.HasSuffix(u.Hostname(), ".larksuite.com") || strings.HasSuffix(u.Hostname(), ".larkoffice.com")) {
			writeAPIError(w, 502, errors.New("飞书授权地址不符合预期，请使用官方 CLI 完成登录"))
			return
		}
		f.mu.Lock()
		f.deviceCode = result.DeviceCode
		f.expires = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
		f.mu.Unlock()
		writeJSON(w, map[string]any{"ok": true, "verificationUrl": result.URL, "message": "请在飞书官方页面授权文档读取，完成后回来检查连接。"})
		return
	}
	if code == "" || time.Now().After(expires) {
		writeAPIError(w, 400, errors.New("这次授权已过期，请重新连接飞书账号"))
		return
	}
	if _, err := f.run(ctx, "auth", "login", "--device-code", code, "--json"); err != nil {
		writeAPIError(w, 502, err)
		return
	}
	f.mu.Lock()
	f.deviceCode = ""
	f.expires = time.Time{}
	f.mu.Unlock()
	writeJSON(w, f.status(ctx))
}
