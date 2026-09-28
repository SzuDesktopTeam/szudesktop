//go:build darwin

package ui

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

//go:embed calendar-ocr-darwin.js
var calendarOCRDarwin string

// calendarVisionEdges 是依次尝试的最长边（像素，0 为原图）。同一张说明页，Vision 在
// 不同尺寸下漏认的字不一样：实测 2381 像素的官方图在 2200、1600 和原图上都会丢掉
// 「学期为」的「为」，放大到 3000 才认全。只有说明页需要多试，网格页用第一遍。
var calendarVisionEdges = []int{2200, 1600, 3000, 0}

// runVisionPass 按给定的最长边认一遍图片，返回标准输出。失败时的 *exec.ExitError
// 带着 stderr，由 darwinOCRFailure 归类。留成变量只为让测试换成替身。
var runVisionPass = func(ctx context.Context, image string, maxEdge int) (string, error) {
	cmd := exec.CommandContext(ctx, "/usr/bin/osascript", "-l", "JavaScript", "-")
	cmd.Stdin = strings.NewReader(calendarOCRDarwin)
	cmd.Env = append(os.Environ(), "SZU_CALENDAR_IMAGE="+image, "SZU_CALENDAR_MAX_EDGE="+strconv.Itoa(maxEdge))
	out, err := cmd.Output()
	return string(out), err
}

func recognizeCalendar(ctx context.Context, image []byte) (string, error) {
	// 临时文件路径里带用户名，原始错误不往界面上送。CreateTemp 建出的文件就是 0600。
	errTemp := errors.New("本机无法写入临时文件，校历识别未能进行")
	f, err := os.CreateTemp("", "szudesktop-calendar-*.png")
	if err != nil {
		return "", errTemp
	}
	defer os.Remove(f.Name())
	_, err = f.Write(image)
	closeErr := f.Close()
	if err != nil || closeErr != nil {
		return "", errTemp
	}
	var text string
	for i, edge := range calendarVisionEdges {
		text, err = runVisionPass(ctx, f.Name(), edge)
		if err != nil {
			var stderr []byte
			var exitErr *exec.ExitError
			if errors.As(err, &exitErr) {
				stderr = exitErr.Stderr
			}
			return "", darwinOCRFailure(ctx.Err(), err, stderr)
		}
		// 网格页没有「校历说明」，本来就不从它取日期：第一遍的结果直接交回。
		// 说明页只采用共享的 parseAcademicTerm 认可的那一遍，规则与 Windows 完全相同。
		if !strings.Contains(strings.Join(strings.Fields(text), ""), "校历说明") {
			if i == 0 {
				return text, nil
			}
			continue
		}
		if _, err := parseAcademicTerm(text, ""); err == nil {
			return text, nil
		}
	}
	// 每种尺寸都没认全：交回最后一遍，由调用方如实报「未能完整识别」。
	return text, nil
}

// darwinOCRFailure 把 osascript / Vision 的失败翻成用户能照着处理的原因。
// stderr 里可能带本机临时路径和用户名，只用来归类，原文不进 JSON；
// 只认 calendar-ocr-darwin.js 自己抛出的 SZU_OCR_* 标记，不按随系统语言变化的报错正文归类。
func darwinOCRFailure(ctxErr, err error, stderr []byte) error {
	switch {
	case errors.Is(ctxErr, context.DeadlineExceeded):
		return errors.New("本机识别校历超时，请稍后重试")
	case ctxErr != nil:
		return errors.New("校历识别已取消")
	case errors.Is(err, exec.ErrNotFound) || errors.Is(err, fs.ErrNotExist):
		return errors.New("本机找不到系统自带的 osascript，无法识别校历图片")
	}
	text := string(stderr)
	switch {
	case strings.Contains(text, "SZU_OCR_LANGUAGE_UNAVAILABLE"):
		return errors.New("本机的文字识别不支持简体中文，无法识别校历图片")
	case strings.Contains(text, "SZU_OCR_FAILED"):
		return errors.New("本机文字识别（Vision）未能读取这张校历图片")
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return fmt.Errorf("本机 OCR 未能完成（osascript 退出码 %d）", exitErr.ExitCode())
	}
	return errors.New("本机 OCR 未能运行")
}
