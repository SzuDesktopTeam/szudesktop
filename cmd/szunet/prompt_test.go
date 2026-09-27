package main

import (
	"bufio"
	"bytes"
	"strings"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// withEcho 把「关回显」换成替身：terminal 为假时模拟管道输入。
func withEcho(t *testing.T, terminal bool, restored *int) {
	t.Helper()
	old := echoOff
	echoOff = func() (func(), error) {
		if !terminal {
			return nil, errNotTerminal
		}
		return func() { *restored++ }, nil
	}
	t.Cleanup(func() { echoOff = old })
}

// TestConfigSetReadsBothLinesFromPipe 回归：`printf '账号\n密码\n' | szunet config set`
// 以前永远报「账号和密码都不能为空」——账号和密码各建了一个 bufio.Reader，
// 第一个把两行一起吞进缓冲，第二个只能读到 EOF。
func TestConfigSetReadsBothLinesFromPipe(t *testing.T) {
	var restored int
	withEcho(t, false, &restored)

	in := bufio.NewReader(strings.NewReader("123456\nfakepass\n"))
	var out bytes.Buffer
	user, pass, err := promptCredentials(in, &out, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if user != "123456" || pass != "fakepass" {
		t.Fatalf("管道里的两行应该分别读成账号和密码，实际 %q / %q", user, pass)
	}
}

// 最后一行没有换行符（echo -n、文件末尾）也要读得到。
func TestConfigSetReadsLastLineWithoutNewline(t *testing.T) {
	var restored int
	withEcho(t, false, &restored)

	in := bufio.NewReader(strings.NewReader("123456\r\nfakepass"))
	user, pass, err := promptCredentials(in, &bytes.Buffer{}, "", "")
	if err != nil || user != "123456" || pass != "fakepass" {
		t.Fatalf("应该读到 123456 / fakepass，实际 %q / %q / %v", user, pass, err)
	}
}

// TestPasswordPromptTurnsEchoOffAndRestores 终端里输入密码时必须关回显，
// 读完必须还原；提示文案也不能再说「输入时会显示在屏幕上」。
func TestPasswordPromptTurnsEchoOffAndRestores(t *testing.T) {
	var restored int
	withEcho(t, true, &restored)

	in := bufio.NewReader(strings.NewReader("s3cret\n"))
	var out bytes.Buffer
	_, pass, err := promptCredentials(in, &out, "123456", "")
	if err != nil || pass != "s3cret" {
		t.Fatalf("应该读到密码，实际 %q / %v", pass, err)
	}
	if restored != 1 {
		t.Fatalf("读完密码要把回显还原一次，实际还原了 %d 次", restored)
	}
	if !strings.Contains(out.String(), "输入时不显示") || strings.Contains(out.String(), "s3cret") {
		t.Fatalf("提示或输出不对：%q", out.String())
	}
}

// TestPasswordPromptAdmitsWhenEchoCannotBeHidden mintty / Git Bash 这类仿终端里
// 关不了回显，提示就不能再说「输入时不显示」。所以提示要等关回显有了结果才打。
func TestPasswordPromptAdmitsWhenEchoCannotBeHidden(t *testing.T) {
	var out bytes.Buffer
	old := echoOff
	echoOff = func() (func(), error) {
		if out.Len() != 0 {
			t.Errorf("关回显之前就打了提示：%q", out.String())
		}
		return nil, errNotTerminal
	}
	t.Cleanup(func() { echoOff = old })

	_, pass, err := promptCredentials(bufio.NewReader(strings.NewReader("s3cret\n")), &out, "123456", "")
	if err != nil || pass != "s3cret" {
		t.Fatalf("应该读到密码，实际 %q / %v", pass, err)
	}
	if strings.Contains(out.String(), "不显示") || !strings.Contains(out.String(), "无法隐藏") {
		t.Fatalf("关不了回显时要如实说明，实际 %q", out.String())
	}
}

// TestCredentialHintsDoNotRecommendPasswordFlag 没存账号时的提示是新用户最先看到的，
// 不能再把人引到会留在 shell 历史里的 -p 上。
func TestCredentialHintsDoNotRecommendPasswordFlag(t *testing.T) {
	for _, msg := range []string{noCredentialsMessage, noSavedAccountHint} {
		if strings.Contains(msg, "-p") {
			t.Errorf("提示里仍在推荐 -p：%q", msg)
		}
		if !strings.Contains(msg, "szunet config set") {
			t.Errorf("提示要告诉用户用 config set 保存：%q", msg)
		}
	}
}

// TestCLINoteHintsPairWithNotes portal 的 Notes 不写命令行参数（桌面版也会显示），
// 命令行版在打印时自己补上 --zone / --ac-id / --ip 的具体做法。
func TestCLINoteHintsPairWithNotes(t *testing.T) {
	both := &portal.DetectResult{Probed: true, SrunUsable: true, DormUsable: true, SrunDNSOK: true}
	if got := strings.Join(cliNoteHints(both), " "); !strings.Contains(got, "--zone teaching") || !strings.Contains(got, "--ac-id") {
		t.Fatalf("两套指纹都有、未联网时要告诉命令行用户怎么改按教学区，实际 %q", got)
	}
	noDNS := &portal.DetectResult{Probed: true, InternetOK: true}
	if got := strings.Join(cliNoteHints(noDNS), " "); !strings.Contains(got, "--ip") || strings.Contains(got, "--zone") {
		t.Fatalf("域名解析失败时要提示 --ip，联网时不提 --zone，实际 %q", got)
	}
	if got := cliNoteHints(&portal.DetectResult{Probed: true, InternetOK: true, SrunDNSOK: true}); len(got) != 0 {
		t.Fatalf("一切正常时不用补充，实际 %q", got)
	}
	if cliNoteHints(nil) != nil {
		t.Fatal("没有探测结果时不用补充")
	}
}

func TestPasswordPromptReportsEmptyInput(t *testing.T) {
	var restored int
	withEcho(t, false, &restored)

	_, _, err := promptCredentials(bufio.NewReader(strings.NewReader("")), &bytes.Buffer{}, "", "")
	if err == nil {
		t.Fatal("标准输入是空的时候应该报错，而不是默默存一个空账号")
	}
}

// TestUsageNoLongerRecommendsPasswordFlag 用法里「推荐」的做法不能再是 -p：
// 命令行参数会留在 shell 历史和进程列表里。
func TestUsageNoLongerRecommendsPasswordFlag(t *testing.T) {
	src := usageText()
	for _, line := range strings.Split(src, "\n") {
		if strings.Contains(line, "config set") && strings.Contains(line, "-p ") {
			t.Fatalf("用法里仍在用 -p 传密码：%q", line)
		}
	}
	if !strings.Contains(src, "--password-stdin") {
		t.Fatal("用法里应该告诉脚本用户可以用 --password-stdin")
	}
}

// TestExplicitZoneSkipsProbe 指定了 --zone 就听用户的，不再白跑一遍完整探测：
// 校外或网络没就绪（开机自启很常见）时，那一轮探测要白等好几秒。
func TestExplicitZoneSkipsProbe(t *testing.T) {
	called := 0
	old := probeNetwork
	probeNetwork = func() *portal.DetectResult {
		called++
		return &portal.DetectResult{Zone: portal.ZoneOutside, Probed: true}
	}
	defer func() { probeNetwork = old }()

	for _, z := range []string{"teaching", "dorm"} {
		zone, det := probeForAuth(&options{zone: z})
		if det != nil || called != 0 {
			t.Fatalf("--zone %s 不该再探测（调用了 %d 次）", z, called)
		}
		if zone != explicitZone(&options{zone: z}) {
			t.Fatalf("--zone %s 应该原样采用，实际 %s", z, zone)
		}
	}

	if zone, det := probeForAuth(&options{zone: "auto"}); called != 1 || det == nil || zone != portal.ZoneUnknown {
		t.Fatalf("auto 时应该探测一次并按结果判区，实际 zone=%s called=%d", zone, called)
	}
}

// TestDetectSkipsAcIDOffSrun 不在深澜网络时 detect 不查 ac_id。
//
// 以前无论什么环境都会逐个猜 7 个编号、每个等 10 秒，校外实测要一分半，
// 最后给出一个标着「猜的」1。
func TestDetectSkipsAcIDOffSrun(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())

	id, src := acIDForDetect(&options{srunHost: "http://127.0.0.1:1"}, &portal.DetectResult{Probed: true})
	if id != "" || src != "" {
		t.Fatalf("没有深澜指纹时不该查 ac_id，实际 %q（%s）", id, src)
	}
	if got := describeAcID(id, src); !strings.Contains(got, "没查") {
		t.Fatalf("不查时要说明原因，实际 %q", got)
	}

	// 手填的照样显示，不需要联网。
	id, src = acIDForDetect(&options{acID: "12", srunHost: "http://127.0.0.1:1"}, &portal.DetectResult{Probed: true})
	if id != "12" || src != portal.AcIDSourceManual {
		t.Fatalf("手填的 ac_id 应该原样显示，实际 %q（%s）", id, src)
	}
}
