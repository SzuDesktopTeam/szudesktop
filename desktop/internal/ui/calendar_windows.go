//go:build windows

package ui

import (
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"unicode/utf16"
)

//go:embed calendar-ocr.ps1
var calendarOCR string

func recognizeCalendar(ctx context.Context, image []byte) (string, error) {
	// 临时文件路径里带用户名，原始错误不往界面上送。
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
	words := utf16.Encode([]rune(calendarOCR))
	encoded := make([]byte, len(words)*2)
	for i, w := range words {
		binary.LittleEndian.PutUint16(encoded[i*2:], w)
	}
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.StdEncoding.EncodeToString(encoded))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	cmd.Env = append(os.Environ(), "SZU_CALENDAR_IMAGE="+f.Name())
	out, err := cmd.Output()
	if err != nil {
		// Output 会把 stderr 收进 ExitError：拿它归类出真实原因，而不是只报「exit status 1」。
		var stderr []byte
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			stderr = exitErr.Stderr
		}
		return "", calendarOCRFailure(ctx.Err(), err, stderr)
	}
	return strings.TrimPrefix(string(out), "\ufeff"), nil
}
