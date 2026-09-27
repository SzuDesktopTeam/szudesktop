package ui

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCalendarDates(t *testing.T) {
	for _, tc := range []struct{ text, week, end string }{
		{"深圳大学2026一2027学年第一学期校历说明 学期为2026年8月28日至2027年1月22日 新生开始上课：9月28日 老生 开始上课：8月31日", "2026-08-30", "2027-01-22"},
		{"深圳大学2025一2026学年第二学期校历说明 学期为2026年3月4日至7月17日 开始上课： 本科生上课周数： 第 一 至 十 七 周（3月9日、7月3日）", "2026-03-08", "2026-07-17"},
	} {
		got, err := parseAcademicTerm(tc.text, "official-image")
		if err != nil || got.WeekStart != tc.week || got.End != tc.end {
			t.Fatalf("%+v %v", got, err)
		}
	}
	for _, text := range []string{
		"深圳大学2026一2027学年第一学期校历说明 学期为2026年8月28日至2027年1月22日 开始上课：9月28日",
		"深圳大学2026一2027学年第一学期校历说明 学期为2026年8月28日至2027年1月22日 老生 开始上课：8月32日",
		"深圳大学2026一2027学年第一学期校历说明 学期为2026年8月28日至2027年1月22日 老生 开始上课：8月30日",
		"深圳大学2026一2027学年第一学期校历说明 学期为2026年8月28日至2027年1月22日 未提供上课日期",
	} {
		if _, err := parseAcademicTerm(text, ""); err == nil {
			t.Fatal("adopted ambiguous date", text)
		}
	}
}

func TestCalendarImages(t *testing.T) {
	html := `<img class="img_vsb_content" orisrc="/__local/a.png"><img orisrc="https://evil.example/a.png" class="img_vsb_content"><img src="logo.png"><img orisrc="/__local/a.png" class="img_vsb_content"><img class="img_vsb_content" orisrc="//evil.example/a.png">`
	got := parseCalendarImages(html)
	if len(got) != 1 || got[0] != "https://www.szu.edu.cn/__local/a.png" {
		t.Fatal(got)
	}
}

type calendarTransport func(*http.Request) (*http.Response, error)

func (f calendarTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCalendarUpdateAndOffline(t *testing.T) {
	previous := bundledCalendar()
	content := "version one"
	fetch := func(_ context.Context, address string) ([]byte, error) {
		if address != schoolCalendarURL {
			return []byte(content), nil
		}
		body := ""
		for _, image := range previous.Images {
			body += `<img class="img_vsb_content" orisrc="` + image + `">`
		}
		return []byte(body), nil
	}
	calls := 0
	recognize := func(_ context.Context, b []byte) (string, error) {
		calls++
		switch (calls - 1) % 4 {
		case 0:
			return "深圳大学2026一2027学年第一学期校历说明 学期为2026年8月28日至2027年1月22日 老生 开始上课：8月31日", nil
		case 2:
			return "深圳大学2025一2026学年第二学期校历说明 学期为2026年3月4日至7月17日 开始上课：3月9日", nil
		default:
			return "校历网格", nil
		}
	}
	got, err := refreshCalendar(context.Background(), previous, nil, fetch, recognize)
	if err != nil || got.Stale || time.Since(got.CheckedAt) > time.Minute || calls != 4 {
		t.Fatalf("%+v %v OCR=%d", got, err, calls)
	}
	got, err = refreshCalendar(context.Background(), got, nil, fetch, recognize)
	if err != nil || calls != 4 {
		t.Fatal("unchanged content must not repeat OCR", err, calls)
	}
	content = "version two, same image URL"
	got, err = refreshCalendar(context.Background(), got, nil, fetch, recognize)
	if err != nil || calls != 8 {
		t.Fatal("same-URL replacement was missed", err, calls)
	}
	offline := func(context.Context, string) ([]byte, error) { return nil, errors.New("offline") }
	kept, err := refreshCalendar(context.Background(), got, nil, offline, recognize)
	if err == nil || kept.Terms[0].WeekStart != got.Terms[0].WeekStart {
		t.Fatal("lost cached dates")
	}
	content = "unrecognizable replacement"
	failed := func(context.Context, []byte) (string, error) { return "", errors.New("OCR unavailable") }
	kept, err = refreshCalendar(context.Background(), got, nil, fetch, failed)
	if err == nil || kept.ImageHashes[0] != got.ImageHashes[0] {
		t.Fatal("failed OCR adopted new content")
	}
}

// calendarPage 拼出校历页的 img 列表，供取数替身按 previous.Images 返回。
func calendarPage(images []string) string {
	body := ""
	for _, image := range images {
		body += `<img class="img_vsb_content" orisrc="` + image + `">`
	}
	return body
}

// 复现 issue #9：用户语言不是中文的 Windows 上，TryCreateFromUserProfileLanguages()
// 给出英文识别器，中文校历被读成拉丁乱码。四张图一个汉字都没有，却逐张被当成
// 「没有校历说明的网格页」跳过，最后误报成「学校改了校历格式」——把本机的语言
// 环境问题指向了错误的方向。
func TestCalendarOCRWithoutChineseReportsHonestly(t *testing.T) {
	previous := bundledCalendar()
	content := "garbage"
	fetch := func(_ context.Context, address string) ([]byte, error) {
		if address != schoolCalendarURL {
			return []byte(content), nil
		}
		return []byte(calendarPage(previous.Images)), nil
	}
	garbage := "OCR languages: en-US\n2026-2027 2026 28 2027 22 E\nJEJ (3 h 9 5 h 29 H"
	recognize := func(context.Context, []byte) (string, error) { return garbage, nil }

	got, err := refreshCalendar(context.Background(), previous, nil, fetch, recognize)
	if err == nil {
		t.Fatal("全是拉丁乱码时必须报错，不能当成新版校历收下")
	}
	if !strings.Contains(err.Error(), "未能识别中文") {
		t.Fatalf("要如实指出本机 OCR 认不出中文，不能报成学校改了格式：%v", err)
	}
	if !slices.Equal(got.ImageHashes, previous.ImageHashes) {
		t.Fatal("识别失败必须保留上一次的校历")
	}
}

// 防线不能误伤现在能用的机器：网格页可能全是数字、一个汉字都没有，只要说明页
// 认出了中文，就要照常成功，不能因为某张图没有汉字就中断整个刷新。
func TestCalendarOCRGridWithoutChineseStillSucceeds(t *testing.T) {
	previous := bundledCalendar()
	content := "mixed"
	fetch := func(_ context.Context, address string) ([]byte, error) {
		if address != schoolCalendarURL {
			return []byte(content), nil
		}
		return []byte(calendarPage(previous.Images)), nil
	}
	calls := 0
	recognize := func(_ context.Context, b []byte) (string, error) {
		calls++
		switch (calls - 1) % 4 {
		case 0:
			return "深圳大学2026一2027学年第一学期校历说明 学期为2026年8月28日至2027年1月22日 老生 开始上课：8月31日", nil
		case 2:
			return "深圳大学2025一2026学年第二学期校历说明 学期为2026年3月4日至7月17日 开始上课：3月9日", nil
		default:
			return "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18", nil
		}
	}
	got, err := refreshCalendar(context.Background(), previous, nil, fetch, recognize)
	if err != nil || got.Stale || len(got.Terms) != 2 {
		t.Fatalf("说明页有汉字、网格页没有时必须照常成功：%+v %v", got, err)
	}
}

func TestHasCJKText(t *testing.T) {
	for _, text := range []string{
		"深圳大学2026一2027学年第一学期校历说明",
		"校历网格",
		"2026-08-30 学年第一学期",
	} {
		if !hasCJKText(text) {
			t.Fatalf("含汉字却判成没有：%q", text)
		}
	}
	for _, text := range []string{
		"",
		"OCR languages: en-US",
		"2026-2027 2026 28 2027 22 E",
		"JEJ (3 h 9 5 h 29 H",
		"1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18",
	} {
		if hasCJKText(text) {
			t.Fatalf("没有汉字却判成有：%q", text)
		}
	}
}

// 内置快照必须带上每张图的内容哈希，否则新机器首次刷新一定判成「图片变了」，
// 对同样的四张图跑一遍 OCR。
func TestBundledCalendarCarriesImageHashes(t *testing.T) {
	b := bundledCalendar()
	if len(b.ImageHashes) != len(b.Images) || len(b.Images) != 4 {
		t.Fatalf("内置校历缺少图片哈希：%d 张图 %d 个哈希", len(b.Images), len(b.ImageHashes))
	}
	for _, h := range b.ImageHashes {
		if len(h) != 64 || strings.Trim(h, "0123456789abcdef") != "" {
			t.Fatalf("哈希格式不对：%q", h)
		}
	}
	b.ImageHashes[0] = "changed"
	if bundledCalendar().ImageHashes[0] == "changed" {
		t.Fatal("bundledCalendar 返回的哈希切片不能与包级变量共用底层数组")
	}
}

// 联网复核：内置哈希与学校官方页面上的图片一致。默认跳过，设置 SZU_ONLINE_TESTS=1 时运行。
func TestBundledCalendarHashesMatchOfficialImages(t *testing.T) {
	if os.Getenv("SZU_ONLINE_TESTS") != "1" {
		t.Skip("设置 SZU_ONLINE_TESTS=1 才联网核对内置校历图片")
	}
	b := bundledCalendar()
	for i, address := range b.Images {
		content, err := fetchCalendar(t.Context(), address)
		if err != nil {
			t.Fatal(address, err)
		}
		if got := fmt.Sprintf("%x", sha256.Sum256(content)); got != b.ImageHashes[i] {
			t.Fatalf("%s 的内容与内置哈希不一致：%s", address, got)
		}
	}
}

// useFakeBundledCalendar 把内置哈希换成替身内容的哈希，返回按图片地址取内容的函数。
func useFakeBundledCalendar(t *testing.T) func(context.Context, string) ([]byte, error) {
	t.Helper()
	old := bundledCalendarHashes
	t.Cleanup(func() { bundledCalendarHashes = old })
	images := bundledCalendar().Images
	hashes := make([]string, len(images))
	for i, image := range images {
		hashes[i] = fmt.Sprintf("%x", sha256.Sum256([]byte("official "+image)))
	}
	bundledCalendarHashes = hashes
	return func(_ context.Context, address string) ([]byte, error) {
		if address == schoolCalendarURL {
			return []byte(calendarPage(images)), nil
		}
		return []byte("official " + address), nil
	}
}

// 学校页面上正是随包核实过的那几张图时，首次刷新不跑 OCR，直接判为已检查；
// 本机缓存比内置快照旧、而本机又认不出中文时，也要回到内置日期，而不是一直过期。
func TestBundledCalendarImagesSkipOCR(t *testing.T) {
	fetch := useFakeBundledCalendar(t)
	calls := 0
	recognize := func(context.Context, []byte) (string, error) {
		calls++
		return "", errors.New("OCR language pack unavailable")
	}
	got, err := refreshCalendar(context.Background(), bundledCalendar(), nil, fetch, recognize)
	if err != nil || got.Stale || got.Message != "" || calls != 0 {
		t.Fatalf("图片未变却跑了 OCR 或没有通过检查：%+v %v OCR=%d", got, err, calls)
	}
	older := bundledCalendar()
	older.Images = []string{"https://www.szu.edu.cn/__local/old-a.png", "https://www.szu.edu.cn/__local/old-b.png"}
	older.ImageHashes = []string{"a", "b"}
	older.Terms = []academicTerm{{Name: "旧学期", WeekStart: "2025-08-31"}}
	got, err = refreshCalendar(context.Background(), older, nil, fetch, recognize)
	if err != nil || got.Stale || calls != 0 || !slices.Equal(got.Terms, bundledCalendar().Terms) {
		t.Fatalf("学校页面与内置快照一致时应直接采用内置日期：%+v %v OCR=%d", got.Terms, err, calls)
	}
}

// 本机认不出的那组图片要记下来：学校不换图就不再重跑 OCR，并照实再报一次；
// 学校换了图才重新识别。超时这类偶发失败不能被当成「认不出」记下。
func TestCalendarUnreadableIsRememberedPerImageSet(t *testing.T) {
	previous := bundledCalendar()
	content := "replaced"
	fetch := func(_ context.Context, address string) ([]byte, error) {
		if address == schoolCalendarURL {
			return []byte(calendarPage(previous.Images)), nil
		}
		return []byte(content + address), nil
	}
	calls := 0
	garbage := func(context.Context, []byte) (string, error) { calls++; return "JEJ (3 h 9 5 h 29 H", nil }
	_, err := refreshCalendar(context.Background(), previous, nil, fetch, garbage)
	var unreadable *calendarUnreadable
	if !errors.As(err, &unreadable) || calls != 4 || !strings.Contains(err.Error(), "未能识别中文") {
		t.Fatalf("认不出中文时要给出可记忆的明确错误：%v OCR=%d", err, calls)
	}
	kept, err := refreshCalendar(context.Background(), previous, unreadable, fetch, garbage)
	if err != unreadable || calls != 4 || !slices.Equal(kept.ImageHashes, previous.ImageHashes) {
		t.Fatalf("同一组图片不该重跑 OCR：%v OCR=%d", err, calls)
	}
	content = "replaced again"
	if _, err = refreshCalendar(context.Background(), previous, unreadable, fetch, garbage); calls != 8 {
		t.Fatalf("学校换了图就要重新识别：%v OCR=%d", err, calls)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	cancelled := func(ctx context.Context, _ []byte) (string, error) {
		return "", calendarOCRFailure(ctx.Err(), ctx.Err(), nil)
	}
	fetchAnyway := func(_ context.Context, address string) ([]byte, error) { return fetch(context.Background(), address) }
	_, err = refreshCalendar(ctx, previous, nil, fetchAnyway, cancelled)
	if err == nil || errors.As(err, &unreadable) {
		t.Fatalf("取消或超时不能被记成本机认不出：%v", err)
	}
}

// 以下两段 stderr 是在 zh-CN Windows 11 的 Windows PowerShell 5.1 上，按 recognizeCalendar
// 同样的 -EncodedCommand 方式实测抓到的原始字节：受限语言模式下 [Console]::OutputEncoding
// 还没设上，报错是 GBK 编码的 CLIXML，正文是中文。
//
// calendarCLMStderrOld 是旧脚本（没有前置语言模式检查）在第 3 行就失败的输出，只能靠
// FullyQualifiedErrorId 认出来；calendarCLMStderr 是现在的脚本第一步就抛出的固定标记。
const calendarCLMStderrOld = "#< CLIXML\r\n<Objs Version=\"1.1.0.1\" xmlns=\"http://schemas.microsoft.com/powershell/2004/04\">" +
	"<S S=\"Error\">\xce\xde\xb7\xa8\xb4\xb4\xbd\xa8\xc0\xe0\xd0\xcd\xa1\xa3\xb4\xcb\xd3\xef\xd1\xd4\xc4\xa3\xca\xbd\xbd\xf6\xd6\xa7\xb3\xd6\xba\xcb\xd0\xc4\xc0\xe0\xd0\xcd\xa1\xa3_x000D__x000A_</S>" +
	"<S S=\"Error\">\xcb\xf9\xd4\xda\xce\xbb\xd6\xc3 \xd0\xd0:3 \xd7\xd6\xb7\xfb: 1_x000D__x000A_</S>" +
	"<S S=\"Error\">+ [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)_x000D__x000A_</S>" +
	"<S S=\"Error\">+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~_x000D__x000A_</S>" +
	"<S S=\"Error\">    + CategoryInfo          : InvalidOperation: (:) []\xa3\xacParentContainsErrorRecordException_x000D__x000A_</S>" +
	"<S S=\"Error\">    + FullyQualifiedErrorId : CannotCreateTypeConstrainedLanguage_x000D__x000A_</S>" +
	"<S S=\"Error\"> _x000D__x000A_</S></Objs>"

const calendarCLMStderr = "#< CLIXML\r\n<Objs Version=\"1.1.0.1\" xmlns=\"http://schemas.microsoft.com/powershell/2004/04\">" +
	"<S S=\"Error\">SZU_OCR_BLOCKED_LANGUAGE_MODE_x000D__x000A_</S>" +
	"<S S=\"Error\">\xcb\xf9\xd4\xda\xce\xbb\xd6\xc3 \xd0\xd0:5 \xd7\xd6\xb7\xfb: 68_x000D__x000A_</S>" +
	"<S S=\"Error\">+ ... nguageMode -ne 'FullLanguage'){throw 'SZU_OCR_BLOCKED_LANGUAGE_MODE'}_x000D__x000A_</S>" +
	"<S S=\"Error\">+                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~_x000D__x000A_</S>" +
	"<S S=\"Error\">    + CategoryInfo          : OperationStopped: (SZU_OCR_BLOCKED_LANGUAGE_MODE:String) [], RuntimeException_x000D__x000A_</S>" +
	"<S S=\"Error\">    + FullyQualifiedErrorId : SZU_OCR_BLOCKED_LANGUAGE_MODE_x000D__x000A_</S>" +
	"<S S=\"Error\"> _x000D__x000A_</S></Objs>"

// OCR 失败要说出真实原因，不能只剩「exit status 1」；stderr 原文（可能带用户名路径）不进消息。
// 归类只看不随系统语言变化的标记，中文系统上的真实输出也要认得出。
func TestCalendarOCRFailureMessages(t *testing.T) {
	exit := &exec.ExitError{}
	for _, row := range []struct {
		ctxErr, err  error
		stderr, want string
	}{
		{context.DeadlineExceeded, exit, "", "超时"},
		{nil, exec.ErrNotFound, "", "找不到 Windows PowerShell"},
		{nil, exit, "SZU_OCR_LANGUAGE_UNAVAILABLE\r\n所在位置 C:\\Users\\secret-name\\AppData\\Local\\Temp\\x.ps1", "中文（简体）"},
		{nil, exit, calendarCLMStderr, "系统策略"},
		{nil, exit, calendarCLMStderrOld, "系统策略"},
		{nil, exit, `<S S="Error">SZU_OCR_WINRT_UNAVAILABLE_x000D__x000A_</S><S S="Error">+ if($null -eq $asTask){throw 'SZU_OCR_WINRT_UNAVAILABLE'}_x000D__x000A_</S>`, "OCR 组件"},
		// 回显的脚本行里出现 WindowsRuntime / Windows.Media.Ocr，不等于缺组件：
		// 那一行可能因为任何原因失败。英文原文同理，不再按字面归类。
		{nil, exit, `<S S="Error">使用“0”个参数调用“Wait”时发生异常:“发生一个或多个错误。”_x000D__x000A_</S><S S="Error">+ Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Media.Ocr.OcrEngine]_x000D__x000A_</S><S S="Error">    + FullyQualifiedErrorId : AggregateException_x000D__x000A_</S>`, "PowerShell 退出码"},
		{nil, exit, "Unable to find type [Windows.Media.Ocr.OcrEngine]. Definition of new types is not supported in this language mode.", "PowerShell 退出码"},
		{nil, exit, "something else at C:\\Users\\secret-name", "PowerShell 退出码"},
	} {
		got := calendarOCRFailure(row.ctxErr, row.err, []byte(row.stderr)).Error()
		if !strings.Contains(got, row.want) || strings.Contains(got, "secret-name") || strings.Contains(got, "exit status") {
			t.Fatalf("%q -> %q", row.stderr, got)
		}
	}
}

// Go 端认的每个标记都必须由脚本自己抛出，且只出现在抛出它的那一行；语言模式检查要在
// 脚本碰任何 .NET 类型之前（受限语言模式下第一处类型操作就会失败）。
func TestCalendarOCRScriptThrowsInvariantTokens(t *testing.T) {
	b, err := os.ReadFile("calendar-ocr.ps1")
	if err != nil {
		t.Fatal(err)
	}
	script := string(b)
	for _, token := range []string{"SZU_OCR_BLOCKED_LANGUAGE_MODE", "SZU_OCR_WINRT_UNAVAILABLE", "SZU_OCR_LANGUAGE_UNAVAILABLE"} {
		if strings.Count(script, token) != 1 || !strings.Contains(script, "throw '"+token+"'") {
			t.Fatalf("%s 应由脚本恰好抛出一次", token)
		}
	}
	check, firstType := strings.Index(script, "LanguageMode -ne 'FullLanguage'"), strings.Index(script, "[Console]::")
	if check < 0 || firstType < 0 || check > firstType {
		t.Fatal("语言模式检查必须在脚本第一次使用 .NET 类型之前")
	}
	// 回显的脚本行不能让 FullyQualifiedErrorId 的后备匹配误中。
	if strings.Contains(script, "ConstrainedLanguage") {
		t.Fatal("脚本正文不能出现 ConstrainedLanguage")
	}
}

// 刷新（下载 + OCR）期间，普通读取不能排在锁后面；并发的第二次刷新等同一次结果，
// 不重复下载。本机认不出时放慢下一次检查，且再检查时不重跑 OCR。
func TestHandleCalendarRefreshRunsOutsideLock(t *testing.T) {
	c := newCalendarService(t.TempDir())
	entered, release := make(chan struct{}), make(chan struct{})
	var mu sync.Mutex
	pageHits, ocrCalls := 0, 0
	c.fetch = func(_ context.Context, address string) ([]byte, error) {
		if address != schoolCalendarURL {
			return []byte("changed " + address), nil
		}
		mu.Lock()
		pageHits++
		first := pageHits == 1
		mu.Unlock()
		if first {
			close(entered)
			<-release
		}
		return []byte(calendarPage(bundledCalendar().Images)), nil
	}
	c.recognize = func(context.Context, []byte) (string, error) {
		mu.Lock()
		ocrCalls++
		mu.Unlock()
		return "garbage", nil
	}
	s := &Server{calendar: c}
	get := func(query string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		s.handleCalendar(w, httptest.NewRequest(http.MethodGet, "/api/campus/calendar"+query, nil))
		return w
	}
	first, second := make(chan *httptest.ResponseRecorder), make(chan *httptest.ResponseRecorder)
	go func() { first <- get("?refresh=1") }()
	<-entered
	go func() { second <- get("?refresh=1") }()
	plain := make(chan *httptest.ResponseRecorder)
	go func() { plain <- get("") }()
	select {
	case w := <-plain:
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"terms"`) {
			t.Fatal(w.Code, w.Body.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("刷新期间普通读取被锁住了")
	}
	// 第二个刷新无论是挂在进行中的那次上，还是在它结束后撞上节流，都只能拿到同一份结果。
	close(release)
	a, b := <-first, <-second
	if a.Body.String() != b.Body.String() || !strings.Contains(a.Body.String(), "未能识别中文") {
		t.Fatalf("并发刷新应拿到同一份结果：\n%s\n%s", a.Body.String(), b.Body.String())
	}
	mu.Lock()
	hits, calls := pageHits, ocrCalls
	mu.Unlock()
	if hits != 1 || calls != 4 {
		t.Fatalf("并发刷新重复下载或识别：page=%d OCR=%d", hits, calls)
	}
	c.mu.Lock()
	backoff := time.Until(c.nextTry)
	c.nextTry = time.Time{}
	c.mu.Unlock()
	if backoff < time.Hour {
		t.Fatalf("本机认不出时应放慢检查，实际只等 %v", backoff)
	}
	w := get("?refresh=1")
	mu.Lock()
	hits, calls = pageHits, ocrCalls
	mu.Unlock()
	if !strings.Contains(w.Body.String(), `"stale":true`) || calls != 4 || hits != 2 {
		t.Fatalf("同一组图片再次检查时不该重跑 OCR：page=%d OCR=%d %s", hits, calls, w.Body.String())
	}
}

// 慢机器上识别要几十秒：本地请求等不到就先回当前结果并说明仍在核对，刷新在后台
// 继续，不因为请求超时而作废重来；下一次请求拿到识别完的结果。
func TestHandleCalendarSlowRefreshContinuesInBackground(t *testing.T) {
	old := calendarResponseWait
	calendarResponseWait = 50 * time.Millisecond
	t.Cleanup(func() { calendarResponseWait = old })
	fetch := useFakeBundledCalendar(t)
	c := newCalendarService(t.TempDir())
	release := make(chan struct{})
	var once sync.Once
	pageHits := 0
	c.fetch = func(ctx context.Context, address string) ([]byte, error) {
		if address == schoolCalendarURL {
			pageHits++
			once.Do(func() { <-release })
		}
		return fetch(ctx, address)
	}
	s := &Server{calendar: c}
	get := func() string {
		w := httptest.NewRecorder()
		s.handleCalendar(w, httptest.NewRequest(http.MethodGet, "/api/campus/calendar?refresh=1", nil))
		return w.Body.String()
	}
	if body := get(); !strings.Contains(body, "后台核对") || !strings.Contains(body, `"stale":true`) {
		t.Fatal(body)
	}
	close(release)
	deadline := time.Now().Add(5 * time.Second)
	for {
		c.mu.Lock()
		running := c.refreshing != nil
		c.mu.Unlock()
		if !running {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("后台刷新没有结束")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if body := get(); !strings.Contains(body, `"stale":false`) || pageHits != 1 {
		t.Fatalf("后台刷新的结果没有被下一次请求拿到：page=%d %s", pageHits, body)
	}
}

// 后台刷新没有 net/http 兜底：途中 panic 不能带崩整个进程，也不能让 refreshing
// 一直挂着——之后的刷新还要照常进行。
func TestCalendarRefreshSurvivesPanic(t *testing.T) {
	fetch := useFakeBundledCalendar(t)
	c := newCalendarService(t.TempDir())
	panicked := false
	c.fetch = func(ctx context.Context, address string) ([]byte, error) {
		if !panicked {
			panicked = true
			panic("unexpected page")
		}
		return fetch(ctx, address)
	}
	s := &Server{calendar: c}
	get := func() string {
		w := httptest.NewRecorder()
		s.handleCalendar(w, httptest.NewRequest(http.MethodGet, "/api/campus/calendar?refresh=1", nil))
		return w.Body.String()
	}
	if body := get(); !strings.Contains(body, "意外中断") || !strings.Contains(body, `"stale":true`) {
		t.Fatal(body)
	}
	c.mu.Lock()
	running := c.refreshing
	c.nextTry = time.Time{}
	c.mu.Unlock()
	if running != nil {
		t.Fatal("panic 之后 refreshing 没有放开")
	}
	if body := get(); !strings.Contains(body, `"stale":false`) {
		t.Fatalf("panic 之后的刷新没有照常进行：%s", body)
	}
}
