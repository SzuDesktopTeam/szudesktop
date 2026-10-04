// Package ui 把 szuDesktop 的页面和本地服务打包在一起。
//
// 页面本身是纯静态的 HTML（desktop/ 目录），用 go:embed 编译进二进制。
// 这样发出去就是一个文件：没有安装包、没有运行时依赖、没有外部资源。
// 页面里的「一键登录」通过本机回环地址上的 HTTP 接口驱动 szunet 内核。
package ui

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"github.com/SzuDesktopTeam/szudesktop/internal/diagnose"
	"github.com/SzuDesktopTeam/szudesktop/internal/netpref"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
	"github.com/SzuDesktopTeam/szudesktop/internal/version"
)

// 页面和字体全部嵌进来。embed 的路径相对本包目录，
// 所以 assets/ 必须和这个文件放在一起（desktop/internal/ui/assets）。
// 同步方式：改完 desktop/index.html 后跑一次 desktop/sync-assets.py。
//
//go:embed all:assets
var assetsFS embed.FS

// Options 是起服务时可调的开关。
type Options struct {
	Addr          string // 监听地址，默认 127.0.0.1:0（随机端口）
	User          string // 覆盖保存的账号
	Password      string // 覆盖保存的密码
	AutoLogin     bool   // 启动后自动登录一次
	SrunHost      string
	DrcomHost     string
	CampusBackend string // 未来校内后端的固定 HTTPS 地址
	NoOpen        bool   // 不自动开浏览器
	Zone          string // auto / teaching / dorm；自动判错时允许手动指定
	AcID          string // 深澜接入点编号；留空则按出口自动发现并缓存
}

// Server 是本地服务。
type Server struct {
	opts         Options
	store        credential.Store
	ehallFactory func(string) *ehallClient // test injection; nil in production
	// 开机自启的真实实现会改注册表，测试必须注入替身，见 autostart.go。
	autostartTest *autostartBackend
	session       credential.SessionStore // 学校系统（ehall）登录状态；与校园网凭据分开存
	vpn           *vpnManager
	campus        *campusGateway
	calendar      *calendarService
	academic      *academicService
	cas           *casService
	booking       *bookingService
	piano         *pianoService
	probe         func() *portal.DetectResult
	detect        func() *portal.DetectResult
	diagnose      func(user, pass, srunHost, drcomHost string) *diagnose.Report // 测试注入；nil 时用 diagnose.Run
	systemProxy   func() *diagnose.SystemProxy                                  // 测试注入；nil 时用 diagnose.ReadSystemProxy
	workspace     *workspaceStore
	notebook      *notebookStore
	feishu        *feishuService
	shutdown      func()
	instance      *desktopInstance
	apiToken      string // 本次运行的调用方凭据，见 api_guard.go；不进任何接口的返回
	windows       *windowSessions
	netState      networkStateCache // /api/status 的网络探测短时缓存
	releases      releaseChecker    // 检查更新的结果缓存

	mu        sync.Mutex
	lastErr   string
	lastZone  portal.Zone
	autoLogin *autoLoginResult // 启动时自动连接校园网的结果；没尝试过为 nil
}

// New 创建一个还没开始监听的 Server。
func New(opts Options) *Server {
	if opts.SrunHost == "" {
		opts.SrunHost = portal.DefaultSrunHost
	}
	if opts.DrcomHost == "" {
		opts.DrcomHost = portal.DefaultDrcomHost
	}
	if opts.Zone == "" {
		opts.Zone = "auto"
	}
	campus, err := newCampusGateway(opts.CampusBackend)
	if err != nil {
		campus = &campusGateway{}
	}
	workspace := newWorkspaceStore()
	return &Server{opts: opts, store: credential.Default(), vpn: newVPNManager(), campus: campus, calendar: newCalendarService(filepath.Dir(workspace.path)), academic: newAcademicService(), cas: newCasService(), booking: newBookingService(), piano: newPianoService(), probe: portal.Probe, detect: portal.Detect, workspace: workspace, notebook: newNotebookStore(filepath.Dir(workspace.path)), feishu: newFeishuService(), windows: newWindowSessions(), apiToken: newAPIToken()}
}

func parseZone(raw string) (portal.Zone, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "teaching", "srun":
		return portal.ZoneTeaching, true
	case "dorm", "dormitory", "drcom":
		return portal.ZoneDorm, true
	default:
		return portal.ZoneUnknown, false
	}
}

// selectedZone 用于状态显示：默认显示探测结果，启动参数可覆盖。
func (s *Server) selectedZone(detected portal.Zone) portal.Zone {
	if zone, ok := parseZone(s.opts.Zone); ok {
		return zone
	}
	return detected
}

// loginZone 用于认证操作：页面本次选择优先，其次启动参数，最后才自动探测。
//
// ⚠️ 这里必须用 portal.Probe() 而不是 portal.Detect()。
// Detect() 在"能上外网"时会提前返回，Zone=online，于是登录会被判成
// 「已经能上外网，不用再认证」而直接跳过——可是掉线重连恰恰要的就是认证。
// Probe() 会把门户和指纹跑完，能真实回答"我该用哪套协议"。
func (s *Server) loginZone(requested string) portal.Zone {
	if zone, ok := parseZone(requested); ok {
		return zone
	}
	if zone, ok := parseZone(s.opts.Zone); ok {
		return zone
	}
	return s.probe().AuthenticationZone()
}

// creds 按「命令行参数 > 已保存的凭据」的顺序取账号密码。
func (s *Server) creds() (string, string, error) {
	user, pass := s.opts.User, s.opts.Password
	if user != "" && pass != "" {
		return user, pass, nil
	}
	c, err := s.store.Load()
	if err != nil {
		return "", "", fmt.Errorf("还没有保存账号密码。请在应用的校园网页填写校园卡号和密码；勾选记住后，认证成功才会安全保存")
	}
	if user == "" {
		user = c.Username
	}
	if pass == "" {
		pass = c.Password
	}
	return user, pass, nil
}

// Run 起服务，顺便按需自动登录，然后在浏览器里打开页面。
func (s *Server) Run() error {
	instance, existing, err := acquireInstance(filepath.Dir(s.workspace.path), !s.opts.NoOpen)
	if err != nil {
		return err
	}
	if existing {
		// 复用启动器把正在运行那份服务的地址和凭据交给外壳；凭据来自已校验过的实例记录。
		announce(startupOutput, "已复用", instance.URL, instance.Token)
		return nil
	}
	s.instance = instance
	s.apiToken = instance.Token
	defer instance.close()
	cleanStaleTemps(filepath.Dir(s.workspace.path), time.Now())
	// 上次异常退出留下的系统代理，只有拿到单实例锁之后才能动。
	s.vpn.recoverLeftover()

	addr := s.opts.Addr
	if addr == "" {
		addr = "127.0.0.1:0"
	}
	host, _, parseErr := net.SplitHostPort(addr)
	ip := net.ParseIP(host)
	if parseErr != nil || ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("桌面服务只允许监听本机回环 IP，例如 127.0.0.1:0")
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("端口被占用或没有权限: %w", err)
	}

	defer ln.Close()
	sub, err := fs.Sub(assetsFS, "assets")
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	s.routes(mux, sub)

	url := "http://" + ln.Addr().String()
	if err := instance.publish(url); err != nil {
		return err
	}
	// 协议行一发出，外壳就可能用 SIGTERM 结束引擎：在那之前先接住 SIGTERM 等信号，
	// 等下面的排空路径建好再走它（Windows 为空实现），见 server_signal_unix.go。
	shutdownReady := make(chan struct{})
	stopSignals := notifyShutdownSignals(func() { <-shutdownReady; s.shutdown() })
	defer stopSignals()
	announce(startupOutput, "已启动", url, s.apiToken)

	if s.opts.AutoLogin {
		go func() {
			time.Sleep(300 * time.Millisecond) // 先让服务起来，再打日志
			s.runAutoLogin()
		}()
	}

	if !s.opts.NoOpen {
		go func() {
			time.Sleep(200 * time.Millisecond)
			if err := openBrowser(s.launchURL(url)); err != nil {
				// 不在这句错误里重复凭据：它只出现在上面那行协议行里。
				fmt.Printf("浏览器没打开（%v）。请在浏览器打开 %s/?launch= 并接上上面「szuDesktop 会话」一行的值\n", err, url)
			}
		}()
	}

	// 请求的 context 都派生自 requests，Shutdown 一开始就取消它：
	// 窗口心跳是长连接，不主动结束的话，排空会一直等到超时。
	requests, cancelRequests := context.WithCancel(context.Background())
	defer cancelRequests()
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, BaseContext: func(net.Listener) context.Context { return requests }}
	srv.RegisterOnShutdown(cancelRequests)
	stopped := make(chan struct{})
	var stopOnce sync.Once
	s.shutdown = func() {
		// /api/shutdown 和“窗口全关”可能同时触发，只关一次。
		stopOnce.Do(func() {
			defer close(stopped)
			time.Sleep(150 * time.Millisecond) // 先让 /api/shutdown 的响应发出去
			s.vpn.shutdown()
			ctx, cancel := context.WithTimeout(context.Background(), shutdownDrain)
			defer cancel()
			_ = srv.Shutdown(ctx)
		})
	}
	close(shutdownReady)
	done := make(chan struct{})
	defer close(done)
	go s.watchWindows(done)
	err = srv.Serve(ln)
	if err == http.ErrServerClosed {
		// Serve 在 Shutdown 刚开始时就返回了。必须等排空结束再退出，
		// 否则正在写的存档、正在进行的登录会随进程退出被直接掐断。
		<-stopped
		return nil
	}
	return err
}

// startupOutput 是协议行的去处；测试替换它来检查 Run 交给外壳的内容。
var startupOutput io.Writer = os.Stdout

// announce 写出两行协议行：地址，以及本次运行的调用方凭据。
//
// Electron 外壳（listen-url.mjs）只认完整的行，两行都到齐才算就绪；凭据只经过这条
// 父进程独占的标准输出管道，外壳读完只留在内存里，不写日志、不进错误框。
// 便携版是 Windows GUI 程序，双击运行时没有控制台，这两行不会显示在任何地方。
func announce(w io.Writer, verb, url, token string) {
	// 一次写出两行，外壳不会读到地址之后迟迟等不到凭据。
	_, _ = fmt.Fprintf(w, "szuDesktop %s: %s\nszuDesktop 会话: %s\n", verb, url, token)
}

// shutdownDrain 是退出时等待进行中请求的上限。
// Electron 发出退出请求后只等 2 秒就强杀，要赶在那之前自己收尾（释放实例锁、删发现文件）。
const shutdownDrain = 1500 * time.Millisecond

// cleanStaleTemps 清掉异常退出时残留的存档、笔记临时文件。
// 调用时已经拿到单实例锁，没有别的进程在写；仍只删一分钟以前的，留足余地。
func cleanStaleTemps(dir string, now time.Time) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		name := entry.Name()
		if !entry.Type().IsRegular() || !strings.HasSuffix(name, ".tmp") || !(strings.HasPrefix(name, ".workspace-") || strings.HasPrefix(name, ".notebook-")) {
			continue
		}
		if info, err := entry.Info(); err == nil && now.Sub(info.ModTime()) > time.Minute {
			_ = os.Remove(filepath.Join(dir, name))
		}
	}
}

// indexCSP 与 Electron 注入的策略（desktop/electron/window-policy.mjs）逐条一致，
// 另加 frame-ancestors 'none'。便携版用浏览器打开本机页面时没有 Electron 兜底：
// 页面既要有 script-src 'self' 这道防线，也不能被别的网站放进 iframe 诱导点击。
// static_assets_test 会对照 window-policy.mjs，两边改一边另一边会报错。
const indexCSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; " +
	"base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'self'; frame-ancestors 'none'"

// staticTypes 固定内嵌资源的 MIME，不查系统注册表。
//
// Go 的 mime 包在 Windows 上会用 HKCR\.<ext> 的 Content Type 覆盖内置表（只对 .js 例外）。
// 某台机器把 .mjs 或 .css 注册成 text/plain 时，Chromium 会按严格 MIME 拒绝模块和样式表，
// 整页白屏或没有样式，而且只在个别用户机器上出现，很难排查。
var staticTypes = map[string]string{
	".css":   "text/css; charset=utf-8",
	".mjs":   "text/javascript; charset=utf-8",
	".js":    "text/javascript; charset=utf-8",
	".json":  "application/json",
	".png":   "image/png",
	".jpg":   "image/jpeg",
	".jpeg":  "image/jpeg",
	".webp":  "image/webp",
	".svg":   "image/svg+xml",
	".ico":   "image/x-icon",
	".woff2": "font/woff2",
	".txt":   "text/plain; charset=utf-8",
}

// staticCacheControl 用在首页和内嵌的静态资源上：不让浏览器把它们写进磁盘缓存。
//
// 本地服务默认每次启动换一个随机端口，缓存按「协议+主机+端口」分，上次写下的
// 两兆多资源这次一条也命中不了，只是每次启动白写一遍磁盘（O14）。资源本来就在
// 本进程内存里（go:embed），走回环地址重新取几乎没有代价。/api 的响应由 guardAPI
// 另设 no-store。
const staticCacheControl = "no-store"

// routes 注册路由。
//
// ⚠️ 静态资源这条规则别动，改了会踩一个很隐蔽的坑。
//
// 同一个页面有两种打开方式，对相对路径的解析基准不一样：
//
//  1. 双击页面（file://）：基准是 desktop/ 目录，旁边就躺着 assets/，
//     所以页面里写 assets/art/m1.png 是对的。
//  2. 起服务访问 http://127.0.0.1:PORT/：二进制里嵌的根已经是 assets/ 那一层了
//     （上面 fs.Sub 把前缀剥了），再收到 /assets/art/m1.png 会去找
//     assets/assets/art/m1.png —— 404。
//
// 症状特别难看：本地开页面一切正常，一跑起来满屏破图，但浏览器控制台
// 一句错都不报，看着像"图坏了"。这次就是这么找了两小时的。
//
// 解法：/assets/ 前缀在服务端统一剥掉再交给静态服务，两条路都通，
// 页面里那套相对路径一个字符都不用改。
func (s *Server) routes(mux *http.ServeMux, static fs.FS) {
	staticFiles := http.FileServer(http.FS(static))
	fileServer := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if kind, ok := staticTypes[strings.ToLower(path.Ext(r.URL.Path))]; ok {
			w.Header().Set("Content-Type", kind)
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", staticCacheControl)
		staticFiles.ServeHTTP(w, r)
	})

	// /assets/xxx -> 剥掉前缀 -> 当 xxx 处理
	// 剥完 r.URL.Path 就是 assets 里那一层的路径，正好对上 embed 的根
	assetsPrefix := http.StripPrefix("/assets", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "" {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	}))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		switch {
		case p == "/" || p == "/index.html":
			// 首页和静态资源本身不需要凭据；带 launch 参数的首次打开在这里换成会话 Cookie。
			if r.Method == http.MethodGet && r.URL.Query().Has(launchParam) && s.acceptLaunch(w, r) {
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", staticCacheControl)
			w.Header().Set("Content-Security-Policy", indexCSP)
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			data, err := fs.ReadFile(static, "index.html")
			if err != nil {
				http.Error(w, "页面没有嵌进来: "+err.Error(), 500)
				return
			}
			_, _ = w.Write(data)
			return
		case p == "/assets" || strings.HasPrefix(p, "/assets/"):
			assetsPrefix.ServeHTTP(w, r)
			return
		}
		fileServer.ServeHTTP(w, r)
	})

	// 没注册的 /api 路径也回统一的 JSON 错误：页面和本地服务版本对不上时最常见，
	// 否则会落进上面的静态文件服务，页面只拿到一句纯文本的 404。
	// 同样先查凭据：没有凭据的调用方分不出哪些接口存在。
	unknownAPI := s.protectAPI(func(w http.ResponseWriter, r *http.Request) {
		writeAPIError(w, http.StatusNotFound, errors.New("本地服务没有这个接口，可能是页面与服务版本不一致，请重新打开应用"))
	}, http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions)
	mux.HandleFunc("/api", unknownAPI)
	mux.HandleFunc("/api/", unknownAPI)
	mux.HandleFunc("/api/workspace", s.protectAPI(s.handleWorkspace, http.MethodGet, http.MethodPost))
	mux.HandleFunc("/api/notebook", s.protectAPI(s.handleNotebook, http.MethodGet, http.MethodPut))
	mux.HandleFunc("/api/feishu/status", s.protectAPI(s.handleFeishuStatus, http.MethodGet))
	mux.HandleFunc("/api/feishu/login", s.protectAPI(s.handleFeishuLogin, http.MethodPost))
	mux.HandleFunc("/api/feishu/document", s.protectAPI(s.handleFeishuDocument, http.MethodPost))
	mux.HandleFunc("/api/shutdown", s.protectAPI(s.handleShutdown, http.MethodPost))
	mux.HandleFunc("/api/window", s.protectAPI(s.handleWindow, http.MethodPost))
	mux.HandleFunc("/api/window-stream", s.protectAPI(s.handleWindowStream, http.MethodGet))
	// 只有这两个接口不要求请求头或 Cookie 里的凭据，原因见 publicAPI。
	mux.HandleFunc("/api/instance", publicAPI(s.handleInstance, http.MethodPost))
	mux.HandleFunc("/api/health", publicAPI(s.handleHealth, http.MethodGet))
	mux.HandleFunc("/api/status", s.protectAPI(s.handleStatus, http.MethodGet))
	mux.HandleFunc("/api/releases", s.protectAPI(s.handleReleases, http.MethodGet))
	mux.HandleFunc("/api/login", s.protectAPI(s.handleLogin, http.MethodPost))
	mux.HandleFunc("/api/logout", s.protectAPI(s.handleLogout, http.MethodPost))
	mux.HandleFunc("/api/diag", s.protectAPI(s.handleDiag, http.MethodGet))
	mux.HandleFunc("/api/credential", s.protectAPI(s.handleCredential, http.MethodGet, http.MethodPost, http.MethodDelete))
	mux.HandleFunc("/api/autostart", s.protectAPI(s.handleAutostart, http.MethodGet, http.MethodPost))
	mux.HandleFunc("/api/vpn/status", s.protectAPI(s.handleVPNStatus, http.MethodGet))
	mux.HandleFunc("/api/vpn/connect", s.protectAPI(s.handleVPNConnect, http.MethodPost))
	mux.HandleFunc("/api/vpn/auth", s.protectAPI(s.handleVPNAuth, http.MethodPost))
	mux.HandleFunc("/api/vpn/disconnect", s.protectAPI(s.handleVPNDisconnect, http.MethodPost))
	mux.HandleFunc("/api/vpn/proxy", s.protectAPI(s.handleVPNProxy, http.MethodPost))
	mux.HandleFunc("/api/campus/status", s.protectAPI(s.handleCampusStatus, http.MethodGet))
	mux.HandleFunc("/api/campus/notice-sources", s.protectAPI(s.handleCampusNoticeSources, http.MethodGet))
	mux.HandleFunc("/api/campus/notices", s.protectAPI(s.handleCampusNotices, http.MethodGet))
	mux.HandleFunc("/api/campus/calendar", s.protectAPI(s.handleCalendar, http.MethodGet))
	// 学校系统（ehall）会话与个人业务。
	// 会话本身是敏感凭据，读写都走 POST/DELETE，状态查询只回报长度不回报内容。
	mux.HandleFunc("/api/session", s.protectAPI(s.handleSession, http.MethodGet, http.MethodPost, http.MethodDelete))
	mux.HandleFunc("/api/session/check", s.protectAPI(s.handleSessionCheck, http.MethodPost))
	mux.HandleFunc("/api/scores", s.protectAPI(s.handleScores, http.MethodGet))
	mux.HandleFunc("/api/academic/session", s.protectAPI(s.handleAcademicSession, http.MethodGet, http.MethodDelete))
	mux.HandleFunc("/api/academic/browser-session", s.protectAPI(s.handleBrowserSession, http.MethodPost, http.MethodDelete))
	mux.HandleFunc("/api/academic/challenge", s.protectAPI(s.handleAcademicChallenge, http.MethodPost))
	mux.HandleFunc("/api/academic/captcha", s.protectAPI(s.handleAcademicCaptcha, http.MethodGet))
	mux.HandleFunc("/api/academic/login", s.protectAPI(s.handleAcademicLogin, http.MethodPost))
	mux.HandleFunc("/api/academic/timetable", s.protectAPI(s.handleTimetable, http.MethodGet))
	mux.HandleFunc("/api/academic/undergrad/timetable", s.protectAPI(s.handleUndergradTimetable, http.MethodGet))
	// 统一身份认证（本科）应用内登录；与 /api/session 的粘 Cookie 是两套入口。
	mux.HandleFunc("/api/cas/session", s.protectAPI(s.handleCasSession, http.MethodGet, http.MethodDelete))
	mux.HandleFunc("/api/cas/challenge", s.protectAPI(s.handleCasChallenge, http.MethodPost))
	mux.HandleFunc("/api/cas/captcha", s.protectAPI(s.handleCasCaptcha, http.MethodGet))
	mux.HandleFunc("/api/cas/login", s.protectAPI(s.handleCasLogin, http.MethodPost))
	mux.HandleFunc("/api/booking/rooms", s.protectAPI(s.handleBookingRooms, http.MethodGet))
	mux.HandleFunc("/api/booking/availability", s.protectAPI(s.handleBookingAvailability, http.MethodGet))
	mux.HandleFunc("/api/piano/status", s.protectAPI(s.handlePianoStatus, http.MethodGet))
	mux.HandleFunc("/api/piano/login", s.protectAPI(s.handlePianoLogin, http.MethodPost))
	mux.HandleFunc("/api/piano/logout", s.protectAPI(s.handlePianoLogout, http.MethodPost))
	mux.HandleFunc("/api/piano/rooms", s.protectAPI(s.handlePianoRooms, http.MethodGet))
	mux.HandleFunc("/api/piano/my", s.protectAPI(s.handlePianoMy, http.MethodGet))
}

/* ---------- 接口 ---------- */

// handleHealth reports local server readiness without network or credential I/O.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"ok": true, "app": "szuDesktop", "app_version": version.Current})
}

type statusResp struct {
	AppVersion  string   `json:"app_version"` // 页面顶栏与关于页的版本号来自这里，不再各写一份
	Zone        string   `json:"zone"`
	ZoneLabel   string   `json:"zone_label"`
	InternetOK  bool     `json:"internet_ok"`
	Online      bool     `json:"online"`
	OnlineKnown bool     `json:"online_known"`
	OnlineError string   `json:"online_error"`
	OnlineState string   `json:"online_state"`          // 校园认证这一栏属于哪种情况，取值见 onlineState* 常量
	OnlineNote  string   `json:"online_note"`           // 中性状态下给人看的说明，其余状态为空
	OnlineZone  string   `json:"online_zone,omitempty"` // 确认在线的那套门户的区域（teaching / dorm），没确认在线时省略
	Saved       bool     `json:"saved"`                 // 有没有存过凭据
	StoreDesc   string   `json:"store_desc"`            // 凭据存在哪
	LastError   string   `json:"last_error"`
	Advices     []string `json:"advices"`
	// AutoLogin 是这次启动时自动连接校园网的结果；没有尝试时省略。
	AutoLogin *autoLoginResult `json:"auto_login,omitempty"`
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	creds, credErr := s.store.Load()

	netState := s.networkState()
	det, zone := netState.det, netState.zone
	out := statusResp{
		AppVersion: version.Current,
		Zone:       string(zone),
		// 已联网时 zone 只是 online，zone_label 以前固定写「已联网」（F12）。门户确认在线时
		// 换成那套门户的区域；zone 本身仍是判区结果，页面按它走的逻辑不受影响。
		ZoneLabel:  portal.DisplayZone(zone, netState.online).Label(),
		OnlineZone: string(netState.online.ConfirmedZone()),
		InternetOK: det.InternetOK,
		StoreDesc:  s.store.Describe(),
	}
	out.Saved = credErr == nil && creds.Username != "" && creds.Password != ""
	if credErr != nil && !errors.Is(credErr, credential.ErrNotFound) {
		out.LastError = "暂时无法读取已保存的校园网账号，请检查本机凭据存储"
	}
	// 门户按请求出口查询认证状态，与本机有没有保存账号无关。
	// 账号和设备 IP 默认不向页面回传；查询失败也不等于明确离线。
	switch {
	case portal.NoCampusPortal(zone, det, netState.onlineErr):
		// 外网正常、没判到教学区或宿舍区，门户又查不到：人在校外（或家里、手机热点）时
		// 本来就是这样。以前这里也写成「暂时无法确认」，页面常驻一条琥珀色的「请运行诊断」，
		// 在家安装的新生会去排查一个根本不存在的问题（O7）。判据和说明（学校域名被 Fake-IP
		// 接管时带上代理提示）与命令行 status 共用 portal 里的那一份。
		out.OnlineState = onlineStateNoPortal
		out.OnlineNote = portal.NoCampusPortalNote(det)
	case netState.onlineErr != nil:
		// 判定在教学区或宿舍区时查不到才是真问题，保留警告和诊断引导。
		out.OnlineState = onlineStateUnconfirmed
		out.OnlineError = "暂时无法确认校园网认证状态，请稍后刷新或运行网络诊断"
	case netState.online != nil:
		out.OnlineKnown = true
		out.Online = netState.online.Online
		out.OnlineState = onlineStateOffline
		if out.Online {
			out.OnlineState = onlineStateOnline
		}
	default:
		out.OnlineState = onlineStateNotQueried
	}

	s.mu.Lock()
	if s.lastErr != "" {
		out.LastError = s.lastErr
	}
	if s.autoLogin != nil {
		result := *s.autoLogin
		out.AutoLogin = &result
	}
	out.Advices = detectAdvices(det)
	s.mu.Unlock()

	writeJSON(w, out)
}

// /api/status 的 online_state 取值。页面按它决定校园认证那一栏的样式，不再从
// online_known / online_error 的组合去猜。
const (
	onlineStateOnline      = "online"           // 门户确认这个出口在线
	onlineStateOffline     = "offline"          // 门户确认这个出口没有在线会话
	onlineStateNoPortal    = "no_campus_portal" // 中性：外网正常，没判到校园网区域，门户也查不到
	onlineStateUnconfirmed = "unconfirmed"      // 警告：判定在教学区或宿舍区，门户却查不到，online_error 有说明
	onlineStateNotQueried  = "not_queried"      // 校外不通或判不出区，没有查询门户
)

// noCampusPortalNote 是中性说明的字面量。接口实际返回的是 portal.NoCampusPortalNote（命令行同一句），
// 这里留一份字面量，是因为页面在旧版接口没有 online_note 时兜底用同一句，check-network-ui.mjs
// 按这一行核对；与 portal 的一致由 TestStatusNoCampusPortalNoteMatchesPortal 锁住。
const noCampusPortalNote = "外网正常；没有检测到校园网认证页面（不在校园网内时属正常）"

type loginResp struct {
	OK      bool   `json:"ok"`
	Zone    string `json:"zone"`
	Message string `json:"message"`
	// 下面两个只是给界面显示"这次用哪个接入点登录的"，用户不需要懂，
	// 但报错时能看到，方便一眼判断是不是编号认错了。
	AcID        string `json:"ac_id,omitempty"`
	AcIDTrusted bool   `json:"ac_id_trusted"`
}

// credRequest 是登录/注销请求里可选的临时账号。
//
// 页面上没勾「记住」时，把账号密码随请求带来，用这一次就丢、不落盘。
// 勾选保存由页面在认证成功后另调 credential 接口，避免把输错的密码存进去。
type credRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Zone     string `json:"zone,omitempty"`
	// AcID 是深澜的接入点编号。留空表示"你自动判断"；
	// 只有界面上出现 ac_id / ac-type 报错、且自动判断一直不对时才由用户指定。
	AcID string `json:"ac_id,omitempty"`
}

// readCredRequest 从请求体里读临时账号。请求体为空也允许（表示用已保存的）。
func readCredRequest(r *http.Request) credRequest {
	var req credRequest
	if r.Body == nil {
		return req
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	return req
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	req := readCredRequest(r)
	res := s.doLogin(req.Username, req.Password, req.Zone, req.AcID)
	writeJSON(w, loginResp{
		OK:          res.OK,
		Message:     res.Message,
		AcID:        res.AcID,
		AcIDTrusted: res.AcIDSource != "" && res.AcIDSource != string(portal.AcIDSourceGuess),
	})
}

// doLogin 登录一次。user/pass 是本次专用的临时账号，留空就用保存的凭据。
// requestedZone 留空/auto 时自动识别，teaching/dorm 时强制走对应协议。
// acID 留空时按"这次填的 > 上次这张网成功的 > 现场探测"的顺序自动定，
// 确认对了还会记下来，所以正常情况下用户根本不需要知道有这个东西。
func (s *Server) doLogin(user, pass, requestedZone, acID string) portal.Result {
	if (user == "") != (pass == "") {
		return s.remember("请同时填写本次账号和密码，或将两项都留空使用已保存凭据")
	}
	if user == "" || pass == "" {
		savedUser, savedPass, err := s.creds()
		if err != nil {
			return s.remember(err.Error())
		}
		if user == "" {
			user = savedUser
		}
		if pass == "" {
			pass = savedPass
		}
	}

	zone := s.loginZone(requestedZone)
	s.mu.Lock()
	s.lastZone = zone
	s.mu.Unlock()

	switch zone {
	case portal.ZoneTeaching, portal.ZoneDorm:
		// 无论成败，认证状态都可能变了：让页面紧接着的刷新重新探测。
		defer s.invalidateNetworkState()
		return s.loginWithProtocol(zone, user, pass, acID)

	default:
		return s.remember("未能确认校园网认证区域，尚未验证账号密码。请确认已连接校园网，或手动选择教学区 / 宿舍区。外网可用不代表账号认证成功")
	}
}

// loginWithProtocol 按指定区域真打一次认证请求。教学区和宿舍区各一套协议。
// acID 是界面上"实在连不上才手动指定"的接入点编号，留空走自动。
func (s *Server) loginWithProtocol(zone portal.Zone, user, pass, acID string) portal.Result {
	switch zone {
	case portal.ZoneTeaching:
		c := portal.NewSrunClient(s.opts.SrunHost, user, pass)
		// 优先级：界面这次填的 > 启动参数 > 自动发现（含上次这张网缓存下来的）。
		manual := acID
		if manual == "" {
			manual = s.opts.AcID
		}
		if manual != "" {
			c.AcID = manual
		}
		attachAcIDCache(c, manual == "")
		res, err := c.Login()
		if err != nil {
			return s.remember(portalErrorMessage("认证", err, pass))
		}
		if !res.OK {
			return s.remember(scrubSecret(res.Message, pass))
		}
		s.clearErr()
		return *res

	case portal.ZoneDorm:
		res, err := portal.NewDrcomClient(s.opts.DrcomHost, user, pass).Login()
		if err != nil {
			// 宿舍区的登录地址里就有明文密码，错误文本一个字都不能透传。
			return s.remember(portalErrorMessage("认证", err, pass))
		}
		if !res.OK {
			return s.remember(scrubSecret(res.Message, pass))
		}
		s.clearErr()
		return *res
	}
	return s.remember("未能确认校园网认证区域，尚未验证账号密码。请确认已连接校园网，或手动选择教学区 / 宿舍区。外网可用不代表账号认证成功")
}

// attachAcIDCache 让客户端复用上次这张网成功的 ac_id，成功后写回缓存。
//
// ac_id 不是固定值：同一台笔记本插不同墙口、走有线还是路由器，
// 接入点编号都可能变（教学区常见 1，接路由器后见过 12）。
// 拿错就会报 Unknow ac-type。这里按"出口标识"分网缓存，
// 换网后缓存命中不了，客户端会自动重新发现；
// 同一个网关后面换了接入点、缓存值被服务端拒掉时，客户端会通知这里
// 把这张网的缓存从磁盘上删掉，免得下次登录还先拿错值去撞一次。
//
// useCache 为 false 时说明用户手动指定了 ac_id，那就别用缓存覆盖他的选择，
// 但成功之后仍要记下来。
func attachAcIDCache(c *portal.SrunClient, useCache bool) {
	prefs := netpref.Load()
	key := netpref.Egress()

	if useCache {
		if id := prefs.AcIDFor(key); id != "" {
			c.SetLastAcID(id)
		}
	}
	c.OnAcIDResolved = func(id string) {
		prefs.SetAcID(key, id)
		_ = prefs.Save()
	}
	c.OnAcIDRejected = func(string) {
		prefs.DeleteAcID(key)
		_ = prefs.Save()
	}
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	req := readCredRequest(r)
	user, pass := req.Username, req.Password
	if (user == "") != (pass == "") {
		writeJSON(w, loginResp{OK: false, Message: "请同时填写本次账号和密码，或将两项都留空使用已保存凭据"})
		return
	}
	if user == "" || pass == "" {
		savedUser, savedPass, err := s.creds()
		if err != nil {
			writeJSON(w, loginResp{OK: false, Message: err.Error()})
			return
		}
		if user == "" {
			user = savedUser
		}
		if pass == "" {
			pass = savedPass
		}
	}
	zone := s.loginZone(req.Zone)
	var res *portal.Result
	var e error
	switch zone {
	case portal.ZoneTeaching:
		// ac_id 与登录同一口径：界面这次填的 > 启动参数 > 这张网上次成功的缓存 > 现场探测。
		// 以前注销每次都重新探测，既多发外网请求，也可能和登录用的编号对不上。
		c := portal.NewSrunClient(s.opts.SrunHost, user, pass)
		manual := req.AcID
		if manual == "" {
			manual = s.opts.AcID
		}
		if manual != "" {
			c.AcID = manual
		}
		attachAcIDCache(c, manual == "")
		res, e = c.Logout()
	case portal.ZoneDorm:
		res, e = portal.NewDrcomClient(s.opts.DrcomHost, user, pass).Logout()
	default:
		writeJSON(w, loginResp{OK: false, Message: "不在校园网里，没有可注销的会话"})
		return
	}
	s.invalidateNetworkState()
	if e != nil {
		writeJSON(w, loginResp{OK: false, Message: portalErrorMessage("注销", e, pass)})
		return
	}
	writeJSON(w, loginResp{OK: res.OK, Zone: string(zone), Message: scrubSecret(res.Message, pass)})
}

type diagResp struct {
	Zone        string   `json:"zone"`
	ZoneLabel   string   `json:"zone_label"`
	InternetOK  bool     `json:"internet_ok"`
	Probed      bool     `json:"probed"` // 门户/指纹到底跑没跑过
	DormPortal  bool     `json:"dorm_portal_ok"`
	TeachPortal bool     `json:"teaching_portal_ok"`
	DNSOK       bool     `json:"dns_ok"`
	DNSFakeIP   bool     `json:"dns_fake_ip"` // net.szu.edu.cn 解析进了代理的 Fake-IP 段，提示已写进 Advices
	Online      *bool    `json:"online,omitempty"`
	Advices     []string `json:"advices"`
	Notes       []string `json:"notes"`

	// AcID / AcIDTrusted 是深澜认证要用的接入点编号。
	//
	// 这东西跟着"插哪个墙口 / 走哪条线路"变，拿错会报 Unknow ac-type，
	// 是校内登录失败最常见的原因。界面上要能看到它，排查才不用猜，
	// 所以同一个值也写成一句话放进 Advices（页面会原样显示）。
	// Trusted 为 false 表示只是从门户页面猜的，未必是你真正所在的接入点。
	AcID        string `json:"ac_id,omitempty"`
	AcIDTrusted bool   `json:"ac_id_trusted"`

	// SystemProxy 是系统代理的开关（manual / pac），只读、不带地址；这个平台读不到时省略。
	SystemProxy *diagnose.SystemProxy `json:"system_proxy,omitempty"`
}

func (s *Server) handleDiag(w http.ResponseWriter, r *http.Request) {
	user, pass, _ := s.creds()
	run := s.diagnose
	if run == nil {
		run = diagnose.Run
	}
	rep := run(user, pass, s.opts.SrunHost, s.opts.DrcomHost)

	out := diagResp{
		Zone:        string(rep.Detect.Zone),
		ZoneLabel:   rep.Detect.Zone.Label(),
		InternetOK:  rep.Detect.InternetOK,
		Probed:      rep.Detect.Probed,
		DormPortal:  rep.Detect.DormPortalOK,
		TeachPortal: rep.Detect.TeachPortalOK,
		DNSOK:       rep.Detect.SrunDNSOK,
		DNSFakeIP:   rep.Detect.SrunDNSFakeIP,
		Advices:     rep.Advices,
		Notes:       rep.Detect.Notes,
	}
	if rep.Online != nil {
		on := rep.Online.Online
		out.Online = &on
	}
	// 系统代理开着时浏览器和学校页面都先过代理，现场复测要求先关代理，诊断报告里要看得出关没关。
	// 门户探测本身一律绕开代理（见 portal.noProxyClient），所以只报开关、不进建议。
	readProxy := s.systemProxy
	if readProxy == nil {
		readProxy = diagnose.ReadSystemProxy
	}
	out.SystemProxy = readProxy()

	// 顺带把接入点编号算出来，写进页面会显示的建议里。
	//
	// 只在深澜指纹明确时才查：宿舍区走的是另一套协议，没有 ac_id 这回事，
	// 白跑一轮探测只会拖慢诊断。取值口径与登录一致：先看启动参数，
	// 再看这张网上次成功的缓存（命中就不再发请求），最后才现场探测。
	if rep.Detect.SrunUsable {
		c := portal.NewSrunClient(s.opts.SrunHost, user, pass)
		if s.opts.AcID != "" {
			c.AcID = s.opts.AcID
		} else if id := netpref.Load().AcIDFor(netpref.Egress()); id != "" {
			c.SetLastAcID(id)
		}
		id, source := c.ResolveAcIDWithSource()
		out.AcID = id
		out.AcIDTrusted = source != portal.AcIDSourceGuess
		out.Advices = append(out.Advices, acIDAdvice(id, source))
	}

	writeJSON(w, out)
}

// acIDAdvice 把接入点编号和它的来历说成一句话。
// “Unknow ac-type”是校内登录失败最常见的原因，诊断结果里看得到这个值，
// 才知道高级设置里该不该手动指定、填什么。
func acIDAdvice(id string, source portal.AcIDSource) string {
	lead := "教学区接入点编号（ac_id）：" + id
	switch source {
	case portal.AcIDSourceManual:
		return lead + "，来自启动参数"
	case portal.AcIDSourceCache:
		return lead + "，来自这张网上次认证成功的记录"
	case portal.AcIDSourceRedirect:
		return lead + "，由校园网网关下发，可信"
	default:
		return lead + "，只是从门户页面推测的；若登录报 ac_id / ac-type 错误，可在高级设置里手动指定"
	}
}

type credReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleCredential(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		c, err := s.store.Load()
		if err != nil {
			writeJSON(w, map[string]any{"saved": false, "store_desc": s.store.Describe()})
			return
		}
		writeJSON(w, map[string]any{
			"saved":      true,
			"username":   revealedUsername(r, c.Username),
			"store_desc": s.store.Describe(),
		})

	case http.MethodPost:
		var req credReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeAPIError(w, http.StatusBadRequest, errors.New("请求格式不对"))
			return
		}
		if req.Username == "" || req.Password == "" {
			writeAPIError(w, http.StatusBadRequest, errors.New("账号和密码都不能空"))
			return
		}
		// 真实原因（例如系统安全存储不可用、配置目录没有权限）要让用户看到，
		// 笼统的“请重新打开应用”解决不了这类问题。
		if err := s.store.Save(credential.Credentials{Username: req.Username, Password: req.Password}); err != nil {
			writeAPIError(w, http.StatusInternalServerError, errors.New(scrubSecret(err.Error(), req.Password)))
			return
		}
		s.clearErr()
		writeJSON(w, map[string]any{"ok": true, "store_desc": s.store.Describe()})

	case http.MethodDelete:
		if err := s.store.Delete(); err != nil {
			writeAPIError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, map[string]any{"ok": true})

	default:
		writeAPIError(w, http.StatusMethodNotAllowed, errors.New("不支持的方法"))
	}
}

/* ---------- 保持在线 ---------- */

// startKeepAlive 开常驻监控。
// keepLoop 删掉了：以前这里有个每 30 秒轮询、掉线自动补登的常驻任务。
// 明确不再做后台自动重连——要不要登录，由人在页面上的登录页决定。

/* ---------- 小工具 ---------- */

func (s *Server) remember(msg string) portal.Result {
	s.mu.Lock()
	s.lastErr = msg
	s.mu.Unlock()
	return portal.Result{OK: false, Message: msg}
}

func (s *Server) clearErr() {
	s.mu.Lock()
	s.lastErr = ""
	s.mu.Unlock()
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

// detectAdvices 只根据网络侧的探测结果给建议，不查账号。
func detectAdvices(det *portal.DetectResult) []string {
	switch det.Zone {
	case portal.ZoneOnline:
		return []string{"当前能正常上外网，不用做任何事"}
	case portal.ZoneTeaching:
		return []string{"你在教学区，走深澜认证。账号是 6 位校园卡号，密码是统一身份认证密码"}
	case portal.ZoneDorm:
		return []string{"你在宿舍区，走 Dr.COM 认证。先去自助服务确认套餐没到期"}
	default:
		return []string{"两个认证门户都连不上，先确认是不是在校外"}
	}
}

// openBrowser 打开界面。
//
// Windows 上优先找 Edge/Chrome 用 --app 模式开：那是一个没有地址栏、
// 没有标签页、任务栏用自己的图标、单独一个窗口的形态 —— 看起来就是个
// 桌面客户端，而不是"开了个网页"。这是普通浏览器窗口和客户端观感
// 差距最大的一步，比改任何 CSS 都管用。
//
// 找不到 Chromium 系浏览器（或启动失败）就退回 rundll32 走默认浏览器，
// 功能不受影响，只是又变回"一个网页"。
//
// 传进来的是 launchURL：带一次性的 launch 参数，首页收到后换成会话 Cookie 并跳回 /。
// 测试替换这个变量，不真的打开浏览器。
var openBrowser = openSystemBrowser

func openSystemBrowser(url string) error {
	switch runtime.GOOS {
	case "windows":
		// --app: 无边框客户端窗口；--start-maximized: 一屏放下全部界面
		for _, dir := range []string{
			os.Getenv("ProgramFiles(x86)"),
			os.Getenv("ProgramFiles"),
			os.Getenv("LocalAppData"), // Chrome 有时装在用户目录
		} {
			if dir == "" {
				continue
			}
			for _, exe := range []string{
				filepath.Join(dir, `Microsoft\Edge\Application\msedge.exe`),
				filepath.Join(dir, `Google\Chrome\Application\chrome.exe`),
			} {
				if _, err := os.Stat(exe); err != nil {
					continue
				}
				cmd := exec.Command(exe, "--app="+url, "--start-maximized")
				if err := cmd.Start(); err == nil {
					return nil
				}
			}
		}
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

func revealedUsername(r *http.Request, username string) string {
	if r.URL.Query().Get("reveal") == "1" {
		return username
	}
	return ""
}
