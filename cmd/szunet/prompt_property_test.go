package main

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"testing"
)

// 性质测试：对随机的管道输入检查 readLine / promptCredentials 的不变量。
// 随机源用固定种子，失败时日志里有种子可复现；设置 SZU_PROPERTY_SEED 可换种子。

const propertyCases = 400

func propertyRand(t *testing.T) *rand.Rand {
	t.Helper()
	seed := int64(20260928)
	if s := os.Getenv("SZU_PROPERTY_SEED"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			seed = v
		}
	}
	t.Logf("随机种子 seed=%d（可用 SZU_PROPERTY_SEED 覆盖）", seed)
	return rand.New(rand.NewSource(seed))
}

// randomLine 生成一行不含换行符的内容：字母数字、空格、制表符、\r、汉字、常见密码符号都可能出现。
func randomLine(r *rand.Rand, min, max int) string {
	alphabet := []rune("abcXYZ0123456789 \t\r中文密码!@#$%^&*-_=+")
	n := min + r.Intn(max-min+1)
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteRune(alphabet[r.Intn(len(alphabet))])
	}
	return b.String()
}

// TestPropertyReadLineSplitsAnyPipedInput 性质：把 k 行用 \n 拼起来（末尾有没有换行都行），
// 连续 k 次 readLine 依次得到每一行去掉首尾空白的内容，第 k+1 次得到 io.EOF；
// 行内的 \r（Windows 换行）、制表符、汉字都不影响切分。
func TestPropertyReadLineSplitsAnyPipedInput(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		k := 1 + r.Intn(5)
		lines := make([]string, k)
		for j := range lines {
			lines[j] = randomLine(r, 0, 12)
		}
		trailing := r.Intn(2) == 0
		if !trailing && lines[k-1] == "" {
			// 没有末尾换行时最后一行必须有内容，否则它根本不存在。
			lines[k-1] = "x"
		}
		input := strings.Join(lines, "\n")
		if trailing {
			input += "\n"
		}
		in := bufio.NewReader(strings.NewReader(input))
		for j, line := range lines {
			got, err := readLine(in)
			if err != nil || got != strings.TrimSpace(line) {
				t.Fatalf("第 %d 例：第 %d 行读到 %q / %v，期望 %q（输入 %q）", i, j, got, err, strings.TrimSpace(line), input)
			}
		}
		if _, err := readLine(in); !errors.Is(err, io.EOF) {
			t.Fatalf("第 %d 例：读完所有行后应得到 EOF，实际 %v", i, err)
		}
	}
}

// TestPropertyPromptCredentialsReadsInOrderAndNeverEchoesPassword 性质：缺什么就按「账号、密码」
// 的顺序从同一个 reader 补什么，参数里已给的不再读；读到的值去掉首尾空白；终端里关了回显就
// 恰好还原一次并提示「输入时不显示」，关不了时如实说「无法隐藏」；输出里绝不出现密码。
func TestPropertyPromptCredentialsReadsInOrderAndNeverEchoesPassword(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		terminal := r.Intn(2) == 0
		var restored int
		withEcho(t, terminal, &restored)

		user := strings.TrimSpace(randomLine(r, 1, 8))
		pass := strings.TrimSpace(randomLine(r, 4, 12))
		// 太短的密码可能恰好是提示文案里的一个字（比如「码」），查「输出里有没有密码」就没意义了。
		if user == "" || len([]rune(pass)) < 4 {
			continue
		}
		givenUser, givenPass := r.Intn(2) == 0, r.Intn(2) == 0
		var input, wantUser, wantPass string
		if givenUser {
			wantUser = user
		} else {
			input += "  " + user + "\t\n"
			wantUser = user
		}
		if givenPass {
			wantPass = pass
		} else {
			input += pass + " \n"
			wantPass = pass
		}
		input += "剩下的不该被读走\n"
		in := bufio.NewReader(strings.NewReader(input))
		var out bytes.Buffer
		argUser, argPass := "", ""
		if givenUser {
			argUser = user
		}
		if givenPass {
			argPass = pass
		}
		gotUser, gotPass, err := promptCredentials(in, &out, argUser, argPass)
		if err != nil || gotUser != wantUser || gotPass != wantPass {
			t.Fatalf("第 %d 例：得到 %q / %q / %v，期望 %q / %q（输入 %q）", i, gotUser, gotPass, err, wantUser, wantPass, input)
		}
		if rest, _ := readLine(in); rest != "剩下的不该被读走" {
			t.Fatalf("第 %d 例：多读了一行，剩余 %q", i, rest)
		}
		if strings.Contains(out.String(), pass) {
			t.Fatalf("第 %d 例：提示输出里出现了密码：%q", i, out.String())
		}
		switch {
		case givenPass && (restored != 0 || strings.Contains(out.String(), "密码")):
			t.Fatalf("第 %d 例：密码已给却仍去读：restored=%d out=%q", i, restored, out.String())
		case !givenPass && terminal && (restored != 1 || !strings.Contains(out.String(), "输入时不显示")):
			t.Fatalf("第 %d 例：终端里读密码应关回显、还原一次并提示：restored=%d out=%q", i, restored, out.String())
		case !givenPass && !terminal && (restored != 0 || !strings.Contains(out.String(), "无法隐藏")):
			t.Fatalf("第 %d 例：关不了回显时要如实说明：out=%q", i, out.String())
		}
	}
}
