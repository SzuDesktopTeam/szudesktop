package ui

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

const schoolCalendarURL = "https://www.szu.edu.cn/xxgk/xl.htm"

type academicTerm struct {
	Name         string `json:"name"`
	Start        string `json:"start"`
	End          string `json:"end"`
	WeekStart    string `json:"week_start"`
	ClassesStart string `json:"classes_start"`
	Image        string `json:"image"`
}

type calendarResult struct {
	Terms       []academicTerm `json:"terms"`
	Images      []string       `json:"images"`
	ImageHashes []string       `json:"image_hashes,omitempty"`
	CheckedAt   time.Time      `json:"checked_at"`
	Source      string         `json:"source"`
	Stale       bool           `json:"stale"`
	Message     string         `json:"message,omitempty"`
}

// bundledCalendarHashes 是随包核实过的四张校历图片内容的 SHA-256，与 bundledCalendar
// 的 Images 一一对应（2026-09-27 从官方页面下载核对：文件名里的 CRC32 与字节数也与
// 内容一致）。有了它，学校没换图时首次刷新直接判为「已检查、未过期」，新机器不必
// 对同样的四张图跑 OCR。留成变量只为让测试能换成替身内容的哈希；
// TestBundledCalendarHashesMatchOfficialImages 在设置 SZU_ONLINE_TESTS=1 时联网复核。
var bundledCalendarHashes = []string{
	"b5a82e1ab8352cf902bc1b464adae4b6e8fb039f2b856651bdb2dc673cf32e35",
	"feb74028e4932698ff4421e68504d6301b35765972ae9be7a353ad50f82e1855",
	"272e0fa2873968f17ef9ebc8f6e1087185f4e3675cd00618430aa289078da63c",
	"a713d941e5d1f327c46bbed301d08c74bd0bb50008f8913d3496ff3f2a31c9ed",
}

// Dates and Sunday week boundaries visually checked against both official grids.
// This snapshot makes first launch useful offline; a failed refresh stays explicit.
func bundledCalendar() calendarResult {
	images := []string{
		"https://www.szu.edu.cn/__local/1/F8/00/9B90CC3ED3B321E2F55DFE6A653_03D5B7D4_4DB31.png",
		"https://www.szu.edu.cn/__local/C/9B/2C/71247060C10DF03836096D18ECA_8B9B2DDF_398DC.png",
		"https://www.szu.edu.cn/__local/0/DF/6D/FB22CB68D90B9A4FD8817F3DA71_94B43F98_2C7A0.png",
		"https://www.szu.edu.cn/__local/2/B1/AC/28B9110830A713D1459CD320A9C_A03128E3_209D3.png",
	}
	return calendarResult{Source: schoolCalendarURL, Images: images, ImageHashes: slices.Clone(bundledCalendarHashes), Stale: true,
		Message: "使用随应用核实的校历（2026-09-20），等待联网更新",
		Terms: []academicTerm{
			{"2026–2027 学年第一学期", "2026-08-28", "2027-01-22", "2026-08-30", "2026-08-31", images[0]},
			{"2025–2026 学年第二学期", "2026-03-04", "2026-07-17", "2026-03-08", "2026-03-09", images[2]},
		},
	}
}

var calendarImages = regexp.MustCompile(`(?is)<img\b[^>]*class=["'][^"']*img_vsb_content[^"']*["'][^>]*>`)
var calendarOriginal = regexp.MustCompile(`(?i)\borisrc=["']([^"']+)["']`)
var calendarTitle = regexp.MustCompile(`(20\d{2})[一—–-](20\d{2})学年第([一二])学期`)
var calendarRange = regexp.MustCompile(`学期为(20\d{2})年(\d{1,2})月(\d{1,2})日至(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日`)
var calendarClass = regexp.MustCompile(`开始上课[：:·]*(\d{1,2})月(\d{1,2})日`)
var calendarWeeks = regexp.MustCompile(`第一至十[七八九]周[（(](\d{1,2})月(\d{1,2})日`)

func parseCalendarImages(body string) []string {
	var images []string
	for _, tag := range calendarImages.FindAllString(body, 8) {
		m := calendarOriginal.FindStringSubmatch(tag)
		if len(m) != 2 {
			continue
		}
		u, err := url.Parse(m[1])
		if err != nil {
			continue
		}
		base, _ := url.Parse(schoolCalendarURL)
		u = base.ResolveReference(u)
		if u.Scheme != "https" || u.Host != base.Host || u.User != nil || !strings.HasPrefix(u.Path, "/__local/") {
			continue
		}
		if !slices.Contains(images, u.String()) {
			images = append(images, u.String())
		}
	}
	return images
}

func parseAcademicTerm(text, image string) (academicTerm, error) {
	text = strings.Join(strings.Fields(text), "")
	fail := errors.New("校历图片格式变化，未自动采用未经确认的日期")
	title, span := calendarTitle.FindStringSubmatch(text), calendarRange.FindStringSubmatch(text)
	if !strings.Contains(text, "校历说明") || len(title) == 0 || len(span) == 0 {
		return academicTerm{}, fail
	}
	year, _ := strconv.Atoi(title[1])
	next, _ := strconv.Atoi(title[2])
	if next != year+1 {
		return academicTerm{}, fail
	}
	if span[4] == "" {
		span[4] = span[1]
	}
	date := func(y, m, d string) (time.Time, error) {
		yy, _ := strconv.Atoi(y)
		mm, _ := strconv.Atoi(m)
		dd, _ := strconv.Atoi(d)
		return time.Parse("2006-01-02", fmt.Sprintf("%04d-%02d-%02d", yy, mm, dd))
	}
	start, e1 := date(span[1], span[2], span[3])
	end, e2 := date(span[4], span[5], span[6])
	if e1 != nil || e2 != nil || end.Sub(start) < 90*24*time.Hour || end.Sub(start) > 180*24*time.Hour || start.Year() < year || end.Year() > next {
		return academicTerm{}, fail
	}
	// Autumn notes distinguish freshmen from continuing students. Never use the
	// freshmen start date as the campus-wide first teaching week.
	section := text
	if i := strings.Index(text, "老生"); i >= 0 {
		section = text[i:]
	}
	classes := calendarClass.FindStringSubmatch(section)
	if len(classes) == 0 {
		classes = calendarWeeks.FindStringSubmatch(section)
	}
	if len(classes) == 0 {
		return academicTerm{}, fail
	}
	first, err := date(span[1], classes[1], classes[2])
	if err != nil || first.Weekday() != time.Monday || first.Before(start) || first.Sub(start) > 10*24*time.Hour {
		return academicTerm{}, fail
	}
	return academicTerm{title[1] + "–" + title[2] + " 学年第" + title[3] + "学期", start.Format("2006-01-02"), end.Format("2006-01-02"), first.AddDate(0, 0, -1).Format("2006-01-02"), first.Format("2006-01-02"), image}, nil
}

const (
	// calendarUnreadableRetry：本机认不出学校的新校历图片后，隔多久才再下载核对一次。
	// 同一组图片在同一台机器上再认一遍结果也一样，没必要每次打开面板都重下约 870KB。
	calendarUnreadableRetry = 6 * time.Hour
	// calendarRefreshBudget：一次刷新（下载 + 最多四次冷启动的 PowerShell OCR）的总时限。
	// 慢机器上四次 OCR 就要几十秒，刷新不跟着单个本地请求走，免得每次都超时重来。
	calendarRefreshBudget = 3 * time.Minute
)

// calendarResponseWait：本地请求最多等刷新这么久，留在渲染端 45 秒时限之内。
// 留成变量只为让测试缩短等待。
var calendarResponseWait = 35 * time.Second

// calendarService 的 mu 只保护字段读写：下载与 OCR 都在锁外（后台协程里），
// 刷新期间普通读取照常返回当前结果。同一时间只跑一次刷新（refreshing 非空时），
// 后来的刷新请求等它结束后拿同一份结果，所以 result 不会被两次刷新交错覆盖。
type calendarService struct {
	mu         sync.Mutex
	result     calendarResult
	path       string
	nextTry    time.Time
	refreshing chan struct{}
	// unreadable 记着本机认不出的那组图片；学校不换图就不再重跑 OCR。
	unreadable *calendarUnreadable
	// 测试注入点；生产环境为 fetchCalendar / recognizeCalendar。
	fetch     func(context.Context, string) ([]byte, error)
	recognize func(context.Context, []byte) (string, error)
}

func newCalendarService(dir string) *calendarService {
	s := &calendarService{result: bundledCalendar(), path: filepath.Join(dir, "calendar-v1.json"), fetch: fetchCalendar, recognize: recognizeCalendar}
	if b, err := os.ReadFile(s.path); err == nil {
		var cached calendarResult
		if json.Unmarshal(b, &cached) == nil && cached.Source == schoolCalendarURL && len(cached.Terms) > 0 && len(cached.Images) > 0 {
			s.result = cached
		}
	}
	return s
}

func fetchCalendar(ctx context.Context, address string) ([]byte, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	res, err := noticeClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("calendar HTTP %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, (6<<20)+1))
	if err != nil || len(b) > 6<<20 {
		return nil, errors.New("calendar download failed")
	}
	return b, nil
}

// hasCJKText 判断一段 OCR 输出里有没有汉字。
//
// 用户语言不是中文的 Windows 上，OcrEngine.TryCreateFromUserProfileLanguages()
// 会给出英文识别器，中文校历被读成拉丁乱码：输出里一个汉字都没有。这种输出
// 绝不能当成「没有校历说明的网格页」放过去，否则最后会被误报成学校改了校历格式。
func hasCJKText(text string) bool {
	return strings.ContainsFunc(text, func(r rune) bool { return r >= 0x4E00 && r <= 0x9FFF })
}

// calendarUnreadable 表示学校换了校历图片，但本机没能认出来（没有中文识别器、
// PowerShell 受限、版式变化等）。它带着那组图片的内容哈希：同一台机器对同样的
// 图片再认一遍结果也一样，服务记下它，学校不再换图就不重跑 OCR。
// 超时、取消这类偶发失败不算，不会被记下。
type calendarUnreadable struct {
	hashes []string
	err    error
}

func (e *calendarUnreadable) Error() string { return e.err.Error() }
func (e *calendarUnreadable) Unwrap() error { return e.err }

// calendarOCRFailure 把 PowerShell 识别失败翻成用户能照着处理的原因。
// stderr 里可能带本机临时路径和用户名，只用来归类，原文不进 JSON。
//
// 只认不随系统语言变化的标记：calendar-ocr.ps1 自己抛出的 SZU_OCR_*，以及报错里
// 的 FullyQualifiedErrorId。PowerShell 的报错正文会按系统语言翻译（中文系统上是
// GBK 编码的 CLIXML），按英文原文匹配在目标用户的机器上一条都对不上；报错回显的
// 脚本行也不能拿来归类——那一行因为任何原因失败都会被误判。
func calendarOCRFailure(ctxErr, err error, stderr []byte) error {
	switch {
	case errors.Is(ctxErr, context.DeadlineExceeded):
		return errors.New("本机识别校历超时，请稍后重试")
	case ctxErr != nil:
		return errors.New("校历识别已取消")
	case errors.Is(err, exec.ErrNotFound):
		return errors.New("本机找不到 Windows PowerShell，无法识别校历图片")
	}
	text := string(stderr)
	switch {
	case strings.Contains(text, "SZU_OCR_LANGUAGE_UNAVAILABLE"):
		return errors.New("本机没有可用的 OCR 识别语言，可在系统设置中添加「中文（简体）」语言后重新打开应用")
	// 受限语言模式（AppLocker / WDAC 等系统策略）：脚本第一步就会报出来；
	// 万一更早失败，FullyQualifiedErrorId 里也带着 ConstrainedLanguage。
	case strings.Contains(text, "SZU_OCR_BLOCKED_LANGUAGE_MODE") || strings.Contains(text, "ConstrainedLanguage"):
		return errors.New("本机 PowerShell 受系统策略限制，无法运行校历识别")
	case strings.Contains(text, "SZU_OCR_WINRT_UNAVAILABLE"):
		return errors.New("本机缺少 Windows OCR 组件，无法识别校历图片")
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return fmt.Errorf("本机 OCR 未能完成（PowerShell 退出码 %d）", exitErr.ExitCode())
	}
	return errors.New("本机 OCR 未能运行")
}

func refreshCalendar(ctx context.Context, previous calendarResult, known *calendarUnreadable, fetch func(context.Context, string) ([]byte, error), recognize func(context.Context, []byte) (string, error)) (calendarResult, error) {
	b, err := fetch(ctx, schoolCalendarURL)
	if err != nil {
		return previous, errors.New("学校校历暂时无法访问，保留上次校历")
	}
	images := parseCalendarImages(string(b))
	if len(images) == 0 {
		return previous, errors.New("官方校历页面结构变化，保留上次校历")
	}
	// Schools can overwrite an image without changing its URL. Hash the image
	// content on each daily check; only changed content needs local OCR.
	contents := make([][]byte, len(images))
	hashes := make([]string, len(images))
	for i, address := range images {
		contents[i], err = fetch(ctx, address)
		if err != nil {
			return previous, errors.New("校历图片未能完整下载，保留上次校历")
		}
		hashes[i] = fmt.Sprintf("%x", sha256.Sum256(contents[i]))
	}
	bundled := bundledCalendar()
	switch {
	case slices.Equal(images, previous.Images) && slices.Equal(hashes, previous.ImageHashes):
		// 与上次一致：已检查、未过期。
	case slices.Equal(images, bundled.Images) && slices.Equal(hashes, bundled.ImageHashes):
		// 学校页面上正是随包核实过的那几张图：直接用内置日期，不必本机 OCR。
		// 本机缓存比内置快照旧、或者本机认不出中文时，这样也能回到可用的日期。
		previous.Terms, previous.Images, previous.ImageHashes = bundled.Terms, images, hashes
	case known != nil && slices.Equal(hashes, known.hashes):
		// 这组图片本机已经认过、没认出来：不重跑 OCR，照实再报一次。
		return previous, known
	default:
		terms, err := recognizeCalendarTerms(ctx, images, contents, recognize)
		if err != nil {
			if ctx.Err() != nil {
				return previous, err
			}
			return previous, &calendarUnreadable{hashes: hashes, err: err}
		}
		previous.Terms, previous.Images, previous.ImageHashes = terms, images, hashes
	}
	previous.CheckedAt = time.Now().UTC()
	previous.Stale = false
	previous.Message = ""
	return previous, nil
}

// recognizeCalendarTerms 逐张识别更新过的校历图片，只采用说明页上写明的日期。
func recognizeCalendarTerms(ctx context.Context, images []string, contents [][]byte, recognize func(context.Context, []byte) (string, error)) ([]academicTerm, error) {
	var terms []academicTerm
	sawChinese := false
	// Official page pairs the explanatory sheet with its grid. OCR only adopts
	// explicit dates from the explanatory sheets, never guesses grid digits.
	for i, address := range images {
		text, err := recognize(ctx, contents[i])
		if err != nil {
			return nil, fmt.Errorf("学校更新了校历图片，但本机未能识别：%w", err)
		}
		if hasCJKText(text) {
			sawChinese = true
		}
		if !strings.Contains(strings.Join(strings.Fields(text), ""), "校历说明") {
			continue
		}
		term, err := parseAcademicTerm(text, address)
		if err != nil {
			return nil, err
		}
		terms = append(terms, term)
	}
	if len(terms) == 0 || len(terms)*2 != len(images) {
		// 一张汉字都没有 = 识别器语言不对（用户语言非中文的机器上，英文引擎把
		// 中文读成拉丁乱码）。这时如实说本机认不出中文，不报成学校改了格式。
		if !sawChinese {
			return nil, errors.New("学校更新了校历图片，但本机 OCR 未能识别中文；已保留上次校历，请查看官方校历或手动设置")
		}
		return nil, errors.New("新版校历未能完整识别，请查看官方校历或手动设置")
	}
	return terms, nil
}

func (s *Server) handleCalendar(w http.ResponseWriter, r *http.Request) {
	c := s.calendar
	c.mu.Lock()
	if r.URL.Query().Get("refresh") != "1" {
		result := c.result
		c.mu.Unlock()
		if time.Since(result.CheckedAt) > 24*time.Hour {
			result.Stale = true
		}
		writeJSON(w, result)
		return
	}
	running := c.refreshing
	if running == nil && time.Now().Before(c.nextTry) {
		result := c.result
		c.mu.Unlock()
		writeJSON(w, result)
		return
	}
	if running == nil {
		c.nextTry = time.Now().Add(time.Minute)
		running = make(chan struct{})
		c.refreshing = running
		go c.refresh(running)
	}
	c.mu.Unlock()

	// 等这次刷新（新开的或已在跑的）结束，拿同一份结果；等不到就先回当前结果，
	// 刷新在后台继续，下次打开面板时再取。
	timer := time.NewTimer(calendarResponseWait)
	defer timer.Stop()
	select {
	case <-running:
	case <-timer.C:
	case <-r.Context().Done():
		return
	}
	c.mu.Lock()
	result := c.result
	if c.refreshing != nil {
		result.Stale = true
		result.Message = "校历仍在后台核对，稍后再打开会显示结果"
	}
	c.mu.Unlock()
	writeJSON(w, result)
}

// refresh 在后台跑一次校历刷新，结束时提交结果并关闭 done。
// 下载、OCR 与写缓存都在锁外；refreshing 保证同一时间只有这一次在写。
func (c *calendarService) refresh(done chan struct{}) {
	c.mu.Lock()
	previous, known, fetch, recognize := c.result, c.unreadable, c.fetch, c.recognize
	c.mu.Unlock()

	var result calendarResult
	var err, saveErr error
	// 收尾放在 defer 里：这是后台协程，没有 net/http 替它兜住 panic。下载、解析或 OCR
	// 途中出了意外，也要当成一次失败提交、放开 refreshing 并关闭 done——否则整个
	// sidecar 会崩掉，或之后的刷新永远在等这一次。
	defer func() {
		if recover() != nil {
			result, err = calendarResult{}, errors.New("校历核对意外中断，已保留上次校历")
		}
		c.commit(result, err, saveErr)
		close(done)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), calendarRefreshBudget)
	defer cancel()
	result, err = refreshCalendar(ctx, previous, known, fetch, recognize)
	if err == nil {
		if saveErr = os.MkdirAll(filepath.Dir(c.path), 0700); saveErr == nil {
			b, _ := json.Marshal(result)
			saveErr = os.WriteFile(c.path, b, 0600)
		}
	}
}

// commit 在锁内落下一次刷新的结果，并放开 refreshing。
func (c *calendarService) commit(result calendarResult, err, saveErr error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var unreadable *calendarUnreadable
	if errors.As(err, &unreadable) {
		c.unreadable = unreadable
		c.nextTry = time.Now().Add(calendarUnreadableRetry)
	}
	if err != nil {
		c.result.Stale = true
		c.result.Message = err.Error()
	} else {
		c.unreadable = nil
		c.result = result
		if saveErr != nil {
			c.result.Message = "已更新，本机缓存未能保存；下次启动会重新查询"
		}
	}
	c.refreshing = nil
}
