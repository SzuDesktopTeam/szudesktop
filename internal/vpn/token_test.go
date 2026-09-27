package vpn

import (
	"bytes"
	"strings"
	"testing"
)

// TestBuildTokenRejectsWrongLengths 守住「服务端返回长度一变就 panic」。
//
// 以前直接把 agent+TWFID 转成 *[48]byte：不足 48 字节会 panic，panic 发生在
// 连接请求的处理协程里，界面的「连接中」标记就没人复位了；超过 48 字节则
// 悄悄截断成一个错 token。
func TestBuildTokenRejectsWrongLengths(t *testing.T) {
	agent := strings.Repeat("a", 31) + "\x00"
	twf := "0123456789abcdef"

	token, err := buildToken(agent, twf)
	if err != nil {
		t.Fatalf("长度正确时不该报错：%v", err)
	}
	if !bytes.Equal(token[:], []byte(agent+twf)) {
		t.Fatalf("token 拼接不对：%q", token[:])
	}

	for _, bad := range []string{"", "short", twf + "x"} {
		if _, err := buildToken(agent, bad); err == nil {
			t.Errorf("TWFID 长度为 %d 时应该报错", len(bad))
		}
	}
	if _, err := buildToken("short", twf); err == nil {
		t.Error("ECAgent token 长度不对时应该报错")
	}
}

func TestAgentTokenFromSessionIDRejectsShortSessionID(t *testing.T) {
	if _, err := agentTokenFromSessionID(make([]byte, 15), 0); err == nil {
		t.Fatal("SessionId 不足 16 字节时应该报错，而不是切片越界 panic")
	}
	got, err := agentTokenFromSessionID(bytes.Repeat([]byte{0xab}, 32), 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 32 || !strings.HasSuffix(got, "\x00") {
		t.Fatalf("token 前半段应为 31 个十六进制字符加 \\x00，实际 %q", got)
	}
}

// TestEndpointOnRecvSwap 发流重连时会换回调，换掉之后旧回调不能再被调用。
func TestEndpointOnRecvSwap(t *testing.T) {
	var ep Endpoint
	var got []string
	ep.SetOnRecv(func(b []byte) { got = append(got, "旧:"+string(b)) })
	if fn := ep.onRecv.Load(); fn != nil {
		(*fn)([]byte("1"))
	}
	ep.SetOnRecv(func(b []byte) { got = append(got, "新:"+string(b)) })
	if fn := ep.onRecv.Load(); fn != nil {
		(*fn)([]byte("2"))
	}
	ep.SetOnRecv(nil)
	if fn := ep.onRecv.Load(); fn != nil {
		t.Fatal("摘除后不该还有回调")
	}
	if strings.Join(got, ",") != "旧:1,新:2" {
		t.Fatalf("回调切换不对：%v", got)
	}
}
