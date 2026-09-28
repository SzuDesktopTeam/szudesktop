//go:build darwin

package ui

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"io/fs"
	"os"
	"os/exec"
	"slices"
	"strings"
	"testing"
	"time"
)

const (
	darwinCalendarNote   = "深圳大学2025-2026学年第二学期校历说明\n一、2025-2026学年第二学期为2026年3月4日至7月17日\n3. 开始上课： 3月9日（星期一）"
	darwinCalendarMissed = "深圳大学2025-2026学年第二学期校历说明\n一、2025-2026学年第二学期2026年3月4日至7月17日\n3. 开始上课： 3月9日（星期一）"
)

// fakeVisionPasses 把 runVisionPass 换成按尺寸取结果的替身，记下每次请求的尺寸，
// 并核对临时图片只有本人可读、内容就是传进来的图片。
func fakeVisionPasses(t *testing.T, want []byte, results map[int]string) *[]int {
	t.Helper()
	old := runVisionPass
	t.Cleanup(func() { runVisionPass = old })
	var edges []int
	runVisionPass = func(_ context.Context, path string, edge int) (string, error) {
		edges = append(edges, edge)
		info, err := os.Stat(path)
		if err != nil || info.Mode().Perm() != 0o600 {
			t.Errorf("临时图片应为 0600：%v %v", info, err)
		}
		if got, _ := os.ReadFile(path); !bytes.Equal(got, want) {
			t.Error("临时图片内容与下载的不一致")
		}
		return results[edge], nil
	}
	return &edges
}

func TestCalendarDarwinVisionPassSelection(t *testing.T) {
	img := []byte("calendar image bytes")
	for _, row := range []struct {
		name    string
		results map[int]string
		edges   []int
		want    string
	}{
		{"网格页只认一遍", map[int]string{2200: "28 29 30 31", 1600: darwinCalendarNote}, []int{2200}, "28 29 30 31"},
		{"说明页第一遍就认全", map[int]string{2200: darwinCalendarNote}, []int{2200}, darwinCalendarNote},
		{"说明页放大后才认全", map[int]string{2200: darwinCalendarMissed, 1600: darwinCalendarMissed, 3000: darwinCalendarNote}, []int{2200, 1600, 3000}, darwinCalendarNote},
		{"中途一遍没认出说明也继续", map[int]string{2200: darwinCalendarMissed, 1600: "乱码", 3000: darwinCalendarMissed, 0: darwinCalendarNote}, []int{2200, 1600, 3000, 0}, darwinCalendarNote},
		{"都不认可时交回最后一遍", map[int]string{2200: darwinCalendarMissed, 1600: darwinCalendarMissed, 3000: darwinCalendarMissed, 0: darwinCalendarMissed + "\n原图"}, []int{2200, 1600, 3000, 0}, darwinCalendarMissed + "\n原图"},
	} {
		t.Run(row.name, func(t *testing.T) {
			edges := fakeVisionPasses(t, img, row.results)
			got, err := recognizeCalendar(context.Background(), img)
			if err != nil || got != row.want || !slices.Equal(*edges, row.edges) {
				t.Fatalf("结果 %q %v，尺寸 %v，应为 %q 尺寸 %v", got, err, *edges, row.want, row.edges)
			}
		})
	}
	// 选出来的说明页经共享规则得到的日期，与 Windows 认出同一张图时一致。
	old := runVisionPass
	t.Cleanup(func() { runVisionPass = old })
	var edges []int
	runVisionPass = func(_ context.Context, path string, edge int) (string, error) {
		edges = append(edges, edge)
		if b, _ := os.ReadFile(path); string(b) == "grid" {
			return "28 29 30 31", nil
		}
		return map[int]string{2200: darwinCalendarMissed, 1600: darwinCalendarMissed, 3000: darwinCalendarNote}[edge], nil
	}
	terms, err := recognizeCalendarTerms(context.Background(), []string{"note", "grid"}, [][]byte{[]byte("note"), []byte("grid")}, recognizeCalendar)
	if err != nil || len(terms) != 1 || terms[0].Image != "note" || terms[0].ClassesStart != "2026-03-09" || terms[0].End != "2026-07-17" || !slices.Equal(edges, []int{2200, 1600, 3000, 2200}) {
		t.Fatalf("%+v %v（尺寸 %v）", terms, err, edges)
	}
}

// 识别失败要说出能照着处理的原因：不提 PowerShell 或 Windows，不带 stderr 原文（可能有用户名路径）。
func TestCalendarDarwinVisionFailureMessages(t *testing.T) {
	exit := &exec.ExitError{}
	for _, row := range []struct {
		ctxErr, err  error
		stderr, want string
	}{
		{context.DeadlineExceeded, exit, "", "超时"},
		{context.Canceled, exit, "", "已取消"},
		{nil, exec.ErrNotFound, "", "osascript"},
		{nil, &fs.PathError{Op: "fork/exec", Path: "/usr/bin/osascript", Err: fs.ErrNotExist}, "", "osascript"},
		{nil, exit, "execution error: Error: Error: SZU_OCR_LANGUAGE_UNAVAILABLE (-2700) /Users/secret-name/x", "简体中文"},
		{nil, exit, "execution error: Error: Error: SZU_OCR_FAILED (-2700)", "Vision"},
		{nil, exit, "执行错误：/Users/secret-name/Library 不可读", "osascript 退出码"},
		{nil, errors.New("boom /Users/secret-name"), "", "未能运行"},
	} {
		got := darwinOCRFailure(row.ctxErr, row.err, []byte(row.stderr)).Error()
		if !strings.Contains(got, row.want) || strings.Contains(got, "secret-name") || strings.Contains(got, "PowerShell") || strings.Contains(got, "Windows") || strings.Contains(got, "exit status") {
			t.Fatalf("%q -> %q", row.stderr, got)
		}
	}
	// 替身让第一遍就失败：recognizeCalendar 交出归好类的原因，不再试别的尺寸。
	old := runVisionPass
	t.Cleanup(func() { runVisionPass = old })
	calls := 0
	runVisionPass = func(context.Context, string, int) (string, error) {
		calls++
		return "", &exec.ExitError{Stderr: []byte("SZU_OCR_LANGUAGE_UNAVAILABLE")}
	}
	if _, err := recognizeCalendar(context.Background(), []byte("x")); err == nil || !strings.Contains(err.Error(), "简体中文") || calls != 1 {
		t.Fatalf("%v（调用 %d 次）", err, calls)
	}
}

// Go 端认的每个标记都必须由脚本自己抛出；图片路径和尺寸只经环境变量传入。
func TestCalendarDarwinScriptContract(t *testing.T) {
	for _, token := range []string{"SZU_OCR_LANGUAGE_UNAVAILABLE", "SZU_OCR_FAILED"} {
		if !strings.Contains(calendarOCRDarwin, "throw new Error('"+token+"')") {
			t.Fatalf("脚本应抛出 %s", token)
		}
	}
	for _, name := range []string{"SZU_CALENDAR_IMAGE", "SZU_CALENDAR_MAX_EDGE", "zh-Hans", "VNRecognizeTextRequest"} {
		if !strings.Contains(calendarOCRDarwin, name) {
			t.Fatalf("脚本缺少 %s", name)
		}
	}
}

// 真实跑一遍脚本（不联网）：空白图片各尺寸都能认完、没有文字；读不了的文件报 SZU_OCR_FAILED。
// 这一步守着 JXA 脚本本身能在 CI 的 macOS 上被 osascript 解析和执行。
func TestCalendarDarwinVisionScriptRuns(t *testing.T) {
	blank := image.NewRGBA(image.Rect(0, 0, 120, 80))
	for i := range blank.Pix {
		blank.Pix[i] = 0xff
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, blank); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	text, err := recognizeCalendar(ctx, buf.Bytes())
	if err != nil || strings.TrimSpace(text) != "" {
		t.Fatalf("空白图片：%q %v", text, err)
	}
	if text, err := runVisionPass(ctx, "/nonexistent/szudesktop-calendar.png", 0); err == nil || !strings.Contains(darwinOCRFailure(ctx.Err(), err, exitStderr(err)).Error(), "Vision") {
		t.Fatalf("读不了的文件应报 Vision 失败：%q %v", text, err)
	}
}

func exitStderr(err error) []byte {
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.Stderr
	}
	return nil
}

// 联网复核：用学校官方页面上的四张校历图真实跑 Vision，认出的学期与随包核实的日期一致。
// 默认跳过，设置 SZU_ONLINE_TESTS=1 时运行。
func TestCalendarVisionOnlineMatchesBundled(t *testing.T) {
	if os.Getenv("SZU_ONLINE_TESTS") != "1" {
		t.Skip("设置 SZU_ONLINE_TESTS=1 才联网用真实校历图片核对 Vision 识别")
	}
	ctx, cancel := context.WithTimeout(context.Background(), calendarRefreshBudget)
	defer cancel()
	b := bundledCalendar()
	contents := make([][]byte, len(b.Images))
	for i, address := range b.Images {
		var err error
		if contents[i], err = fetchCalendar(ctx, address); err != nil {
			t.Fatal(address, err)
		}
	}
	terms, err := recognizeCalendarTerms(ctx, b.Images, contents, recognizeCalendar)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(terms, b.Terms) {
		t.Fatalf("Vision 认出的学期与内置校历不一致：\n%+v\n%+v", terms, b.Terms)
	}
}
