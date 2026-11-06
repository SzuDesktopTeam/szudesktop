package ui

import (
	"errors"
	"net/http"
)

// registerAPIRoutes 集中登记全部本机接口。
//
// 路由按业务域分段，server.go 只负责静态页面与组装。每条 /api 路由都必须
// 经过 protectAPI（仅 /api/health 与 /api/instance 例外），api_token_test.go
// 会扫描包内所有生产源码逐条核对，新增接口不用手工登记也躲不开凭据检查。
func (s *Server) registerAPIRoutes(mux *http.ServeMux) {
	// 没注册的 /api 路径也回统一的 JSON 错误：页面和本地服务版本对不上时最常见，
	// 否则会落进上面的静态文件服务，页面只拿到一句纯文本的 404。
	// 同样先查凭据：没有凭据的调用方分不出哪些接口存在。
	unknownAPI := s.protectAPI(func(w http.ResponseWriter, r *http.Request) {
		writeAPIError(w, http.StatusNotFound, errors.New("本地服务没有这个接口，可能是页面与服务版本不一致，请重新打开应用"))
	}, http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions)
	mux.HandleFunc("/api", unknownAPI)
	mux.HandleFunc("/api/", unknownAPI)
	// 本机存档、笔记、窗口与桌面集成。
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
	// 校园网认证、在线状态与网络诊断。
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
	// 校园公告、正文与校历。
	mux.HandleFunc("/api/campus/status", s.protectAPI(s.handleCampusStatus, http.MethodGet))
	mux.HandleFunc("/api/campus/notice-sources", s.protectAPI(s.handleCampusNoticeSources, http.MethodGet))
	mux.HandleFunc("/api/campus/notices", s.protectAPI(s.handleCampusNotices, http.MethodGet))
	mux.HandleFunc("/api/campus/notices/search", s.protectAPI(s.handleCampusNoticeSearch, http.MethodGet))
	mux.HandleFunc("/api/campus/notice", s.protectAPI(s.handleNoticeDetail, http.MethodGet))
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
	mux.HandleFunc("/api/academic/catalog/terms", s.protectAPI(s.handleCatalogTerms, http.MethodGet))
	mux.HandleFunc("/api/academic/catalog/classes", s.protectAPI(s.handleCatalogClasses, http.MethodGet))
	mux.HandleFunc("/api/academic/catalog/timetable", s.protectAPI(s.handleCatalogTimetable, http.MethodGet))
	mux.HandleFunc("/api/academic/catalog/programs", s.protectAPI(s.handleCatalogPrograms, http.MethodGet))
	mux.HandleFunc("/api/academic/catalog/program", s.protectAPI(s.handleCatalogProgram, http.MethodGet))
	// 统一身份认证（本科）应用内登录；与 /api/session 的粘 Cookie 是两套入口。
	mux.HandleFunc("/api/cas/session", s.protectAPI(s.handleCasSession, http.MethodGet, http.MethodDelete))
	mux.HandleFunc("/api/cas/challenge", s.protectAPI(s.handleCasChallenge, http.MethodPost))
	mux.HandleFunc("/api/cas/captcha", s.protectAPI(s.handleCasCaptcha, http.MethodGet))
	mux.HandleFunc("/api/cas/login", s.protectAPI(s.handleCasLogin, http.MethodPost))
	// 空间、场馆、图书馆、电费与琴房等查询和预约。
	mux.HandleFunc("/api/booking/rooms", s.protectAPI(s.handleBookingRooms, http.MethodGet))
	mux.HandleFunc("/api/booking/availability", s.protectAPI(s.handleBookingAvailability, http.MethodGet))
	// 提交预约：prepare 只核对并给一次性 token，commit 才真正写。
	// 两步之间会重新校验空位，避免替用户占一个已经被抢走的时段。
	mux.HandleFunc("/api/booking/session", s.protectAPI(s.handleBookingSession, http.MethodGet, http.MethodPost, http.MethodDelete))
	mux.HandleFunc("/api/booking/history", s.protectAPI(s.handleBookingHistory, http.MethodGet))
	mux.HandleFunc("/api/booking/prepare", s.protectAPI(s.handleBookingPrepare, http.MethodPost))
	mux.HandleFunc("/api/booking/commit", s.protectAPI(s.handleBookingCommit, http.MethodPost))
	// 体育场馆（ehall 的 qljfwapp），和社区空间是完全不同的另一套。
	mux.HandleFunc("/api/sport/venues", s.protectAPI(s.handleSportVenues, http.MethodGet))
	mux.HandleFunc("/api/sport/times", s.protectAPI(s.handleSportTimes, http.MethodGet))
	mux.HandleFunc("/api/sport/prepare", s.protectAPI(s.handleSportPrepare, http.MethodPost))
	mux.HandleFunc("/api/sport/commit", s.protectAPI(s.handleSportCommit, http.MethodPost))
	// 图书馆 OPAC：搜索匿名可用，借阅要 CAS（暂未接）。
	mux.HandleFunc("/api/library/search", s.protectAPI(s.handleLibrarySearch, http.MethodGet))
	mux.HandleFunc("/api/library/item", s.protectAPI(s.handleLibraryItem, http.MethodGet))
	mux.HandleFunc("/api/electricity/settings", s.protectAPI(s.electricity.handleSettings, http.MethodGet, http.MethodPost))
	mux.HandleFunc("/api/electricity/options", s.protectAPI(s.electricity.handleOptions, http.MethodGet))
	mux.HandleFunc("/api/electricity/query", s.protectAPI(s.electricity.handleQuery, http.MethodPost))
	mux.HandleFunc("/api/piano/status", s.protectAPI(s.handlePianoStatus, http.MethodGet))
	mux.HandleFunc("/api/piano/login", s.protectAPI(s.handlePianoLogin, http.MethodPost))
	mux.HandleFunc("/api/piano/logout", s.protectAPI(s.handlePianoLogout, http.MethodPost))
	mux.HandleFunc("/api/piano/rooms", s.protectAPI(s.handlePianoRooms, http.MethodGet))
	mux.HandleFunc("/api/piano/my", s.protectAPI(s.handlePianoMy, http.MethodGet))
}
