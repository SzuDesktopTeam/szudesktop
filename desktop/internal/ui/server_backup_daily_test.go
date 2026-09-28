package ui

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// 按天备份：只留一代 .bak 时，误删正文或规则 bug 写坏数值之后再保存两次，就再也找不回原样。
// 这里的存档都用模拟时钟 now；真实写盘的修改时间是此刻，所以每次写完都用 touch 拨到模拟时刻。

func dailyStore(dir string, now *time.Time) storeFile[workspaceSnapshot] {
	return storeFile[workspaceSnapshot]{
		path: filepath.Join(dir, "workspace-v1.json"), tmpPattern: ".workspace-*.tmp",
		empty: workspaceSnapshot{Version: 1, Data: json.RawMessage(`null`)}, parse: parseWorkspace,
		now: func() time.Time { return *now },
	}
}

func snapshotBytes(revision uint64, tag string) []byte {
	b, _ := json.Marshal(workspaceSnapshot{Version: 1, Revision: revision, Data: json.RawMessage(fmt.Sprintf(`{"tag":%q}`, tag))})
	return b
}

func touch(t *testing.T, path string, at time.Time) {
	t.Helper()
	if err := os.Chtimes(path, at, at); err != nil {
		t.Fatal(err)
	}
}

func day(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 9, 0, 0, 0, time.Local) }

func TestStoreFileKeepsDailyBackupsForRecentDays(t *testing.T) {
	dir := t.TempDir()
	now := day(2026, 9, 20)
	f := dailyStore(dir, &now)
	endOfDay := map[string][]byte{}
	revision := uint64(0)
	// 23、25、26 日没打开：按使用日留，几天没用不会把备份挤掉。
	for i, d := range []int{20, 21, 22, 24, 27, 28} {
		now = day(2026, 9, d)
		before := len(f.dailyBackups())
		for save := 0; save < 3; save++ {
			_, raw, _, err := f.load()
			if err != nil {
				t.Fatal(err)
			}
			revision++
			data := snapshotBytes(revision, fmt.Sprintf("9/%d #%d", d, save))
			if err := f.save(raw, data); err != nil {
				t.Fatal(err)
			}
			touch(t, f.path, now)
			endOfDay[now.Format(dailyBackupDate)] = data
			now = now.Add(time.Hour)
		}
		if got, want := len(f.dailyBackups()), min(i, dailyBackupKeep); got != want || (i > 0 && i <= dailyBackupKeep && got != before+1) {
			t.Fatalf("9/%d：一天最多新增一份按天备份，最多留 %d 份；现有 %d 份，期望 %d", d, dailyBackupKeep, got, want)
		}
	}
	want := []string{"2026-09-27", "2026-09-24", "2026-09-22"}
	got := f.dailyBackups()
	if len(got) != len(want) {
		t.Fatalf("应只留最近 %d 个使用日：%v", dailyBackupKeep, got)
	}
	for i, date := range want {
		if got[i] != f.path+".bak-"+date {
			t.Fatalf("第 %d 份应是 %s：%v", i, date, got)
		}
		if b, _ := os.ReadFile(got[i]); !bytes.Equal(b, endOfDay[date]) {
			t.Fatalf("%s 的备份应是那天最后保存的内容：%s", date, b)
		}
	}
	if b, _ := os.ReadFile(f.path + ".bak"); !strings.Contains(string(b), `9/28 #1`) {
		t.Fatalf(".bak 仍是上一次保存前的内容：%s", b)
	}

	// 时钟调快后又改回：主文件的修改时间比今天还晚，不能留下一份“未来”的备份。
	touch(t, f.path, now.AddDate(0, 0, 2))
	_, raw, _, _ := f.load()
	if err := f.save(raw, snapshotBytes(revision+1, "clock")); err != nil {
		t.Fatal(err)
	}
	if after := f.dailyBackups(); !slices.Equal(after, got) {
		t.Fatalf("修改时间在未来时不应另存：%v", after)
	}
}

// 时钟调快过几天，留下了日期在未来的按天备份。时钟改回后它们不能一直占着保留名额、
// 把之后真正的按天备份刚写下就挤掉；读坏时也要先试今天以前的那几份。
func TestStoreFileFutureDatedBackupsDoNotCrowdOutNewOnes(t *testing.T) {
	dir := t.TempDir()
	now := day(2026, 9, 29)
	f := dailyStore(dir, &now)
	for i, date := range []string{"2027-01-01", "2027-01-02", "2027-01-03"} {
		if err := os.WriteFile(f.path+".bak-"+date, snapshotBytes(uint64(100+i), "future"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(f.path, snapshotBytes(28, "9/28"), 0600); err != nil {
		t.Fatal(err)
	}
	touch(t, f.path, day(2026, 9, 28))
	saveOnce := func(revision uint64) {
		t.Helper()
		_, raw, _, err := f.load()
		if err != nil {
			t.Fatal(err)
		}
		if err := f.save(raw, snapshotBytes(revision, now.Format(dailyBackupDate))); err != nil {
			t.Fatal(err)
		}
		touch(t, f.path, now)
	}
	saveOnce(29)
	dated := func(dates ...string) []string {
		out := make([]string, len(dates))
		for i, date := range dates {
			out[i] = f.path + ".bak-" + date
		}
		return out
	}
	if got, want := f.dailyBackups(), dated("2026-09-28", "2027-01-03", "2027-01-02"); !slices.Equal(got, want) {
		t.Fatalf("9/28 的备份要留下并排在最前，超出份数时先删未来日期的：%v", got)
	}
	if b, _ := os.ReadFile(f.path + ".bak-2026-09-28"); !bytes.Equal(b, snapshotBytes(28, "9/28")) {
		t.Fatalf("9/28 的备份内容不对：%s", b)
	}

	// 主文件和 .bak 都坏：先用今天以前的那份，不拿未来日期的顶上。
	os.WriteFile(f.path, []byte("broken"), 0600)
	os.WriteFile(f.path+".bak", []byte("broken too"), 0600)
	if value, _, recovered, err := f.load(); err != nil || !recovered || value.Revision != 28 {
		t.Fatalf("应恢复到 9/28 的备份：修订号 %d recovered=%v err=%v", value.Revision, recovered, err)
	}
	touch(t, f.path, now)

	// 再用两天，未来日期的就全被真正的按天备份替换掉。
	for i, next := range []time.Time{day(2026, 9, 30), day(2026, 10, 1)} {
		now = next
		saveOnce(uint64(30 + i))
	}
	if got, want := f.dailyBackups(), dated("2026-09-30", "2026-09-29", "2026-09-28"); !slices.Equal(got, want) {
		t.Fatalf("应只留最近 %d 个使用日：%v", dailyBackupKeep, got)
	}
}

// 读坏时从新到旧找第一份能用的备份；读不出来或更新版本写入的备份会让查找停下，所有文件原样保留。
func TestStoreFileRecoversFromNewestUsableBackup(t *testing.T) {
	const unreadable = "<dir>"
	good := func(revision uint64) string { return string(snapshotBytes(revision, "good")) }
	bad, newer := "broken{", `{"version":2,"revision":"r","data":[1]}`
	cases := []struct {
		name      string
		main, bak string
		days      map[string]string
		extra     map[string]string // 名字不像按天备份的文件
		recovered uint64            // 期望恢复到的修订号，0 表示不恢复
		err       error
		fresh     bool // 期望按第一次运行处理
		restore   bool // 期望 restoreError
	}{
		{name: "主文件和 .bak 都坏：跳过坏掉的那天，用最近一份能用的", main: bad, bak: bad,
			days: map[string]string{"2026-09-28": bad, "2026-09-27": good(27), "2026-09-26": good(26)}, recovered: 27},
		{name: "主文件和 .bak 都不见：从按天的备份恢复", days: map[string]string{"2026-09-27": good(27), "2026-09-20": good(20)}, recovered: 27},
		{name: ".bak 完好时照旧用 .bak", main: bad, bak: good(30), days: map[string]string{"2026-09-27": good(27)}, recovered: 30},
		{name: "主文件不见、备份都坏：从头开始", bak: bad, days: map[string]string{"2026-09-27": bad}, fresh: true},
		{name: "主文件坏、备份都坏：报损坏", main: bad, bak: bad, days: map[string]string{"2026-09-27": bad}, err: errStoreCorrupt},
		{name: ".bak 读不出来：不拿更旧的顶上", main: bad, bak: unreadable, days: map[string]string{"2026-09-27": good(27)}, err: errStoreCorrupt},
		{name: "主文件不见、.bak 由更新版本写入：不拿更旧的顶上", bak: newer, days: map[string]string{"2026-09-27": good(27)}, err: errStoreIncompatible},
		{name: "最近一天的备份由更新版本写入：停下", main: bad, bak: bad, days: map[string]string{"2026-09-28": newer, "2026-09-27": good(27)}, err: errStoreCorrupt},
		{name: "主文件不见、最近一天的备份读不出来：说明是恢复失败", days: map[string]string{"2026-09-28": unreadable, "2026-09-27": good(27)}, restore: true},
		{name: "名字不像日期的文件不当备份", main: bad, bak: bad,
			extra: map[string]string{"workspace-v1.json.bak-old": good(9), "workspace-v1.json.bak-2026-13-01": good(9), "workspace-v1.json.bak-2026-09-27.tmp": good(9)}, err: errStoreCorrupt},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			now := day(2026, 9, 29)
			f := dailyStore(dir, &now)
			files := map[string]string{f.path: c.main, f.path + ".bak": c.bak}
			for date, content := range c.days {
				files[f.path+".bak-"+date] = content
			}
			for name, content := range c.extra {
				files[filepath.Join(dir, name)] = content
			}
			for path, content := range files {
				switch content {
				case "":
				case unreadable:
					if err := os.Mkdir(path, 0700); err != nil {
						t.Fatal(err)
					}
				default:
					if err := os.WriteFile(path, []byte(content), 0600); err != nil {
						t.Fatal(err)
					}
				}
			}
			value, raw, recovered, err := f.load()
			switch {
			case c.recovered != 0:
				if err != nil || !recovered || value.Revision != c.recovered || string(raw) != good(c.recovered) {
					t.Fatalf("应恢复到修订号 %d：%+v recovered=%v err=%v", c.recovered, value, recovered, err)
				}
				if b, _ := os.ReadFile(f.path); string(b) != good(c.recovered) {
					t.Fatalf("主文件应换成恢复的备份：%s", b)
				}
				delete(files, f.path)
			case c.fresh:
				if err != nil || recovered || raw != nil {
					t.Fatalf("应按第一次运行处理：recovered=%v raw=%q err=%v", recovered, raw, err)
				}
			case c.restore:
				if !errors.As(err, new(*restoreError)) {
					t.Fatalf("期望 restoreError，实际 %v", err)
				}
			default:
				if !errors.Is(err, c.err) {
					t.Fatalf("期望 %v，实际 %v（recovered=%v）", c.err, err, recovered)
				}
			}
			// 备份一个都不能动；没恢复时主文件也不能动。
			for path, content := range files {
				if content == "" || content == unreadable {
					if info, err := os.Stat(path); content == "" && err == nil || content == unreadable && (err != nil || !info.IsDir()) {
						t.Fatalf("%s 不应被创建或改动", filepath.Base(path))
					}
					continue
				}
				if b, _ := os.ReadFile(path); string(b) != content {
					t.Fatalf("%s 被改动：%s", filepath.Base(path), b)
				}
			}
		})
	}
}

// 性质：对任意「跨天保存、外部弄坏或删掉主文件 / .bak / 某天的备份、写入更新版本」的序列，
// load 的结果始终等于模型（先主文件，再 .bak，再按日期从近到远的第一份能用的备份），
// save 之后磁盘上的主文件、.bak 和按天备份也和模型一致：每个使用日结束时的样子各留一份，最多 dailyBackupKeep 份。
func TestPropertyStoreFileDailyBackups(t *testing.T) {
	r := propertyRand(t)
	cases := 0
	for round := 0; round < 20; round++ {
		dir := t.TempDir()
		now := day(2026, 9, 1)
		f := dailyStore(dir, &now)
		main, bak, mainAt := modelFile{}, modelFile{}, time.Time{} // mainAt：模型里主文件最后写入的时刻
		days := map[string]modelFile{}
		dayPath := func(date string) string { return f.path + ".bak-" + date }
		sameAsModel := func(where string) {
			t.Helper()
			for path, m := range map[string]modelFile{f.path: main, f.path + ".bak": bak} {
				if got, err := os.ReadFile(path); m.kind == fileMissing && err == nil || m.kind != fileMissing && !bytes.Equal(got, m.content) {
					t.Fatalf("%s：%s 与模型不一致", where, filepath.Base(path))
				}
			}
			onDisk := f.dailyBackups()
			want := slices.Sorted(maps.Keys(days))
			slices.Reverse(want)
			if len(onDisk) != len(want) {
				t.Fatalf("%s：按天备份应为 %v，实际 %v", where, want, onDisk)
			}
			for i, date := range want {
				if got, _ := os.ReadFile(onDisk[i]); onDisk[i] != dayPath(date) || !bytes.Equal(got, days[date].content) {
					t.Fatalf("%s：%s 与模型不一致", where, filepath.Base(onDisk[i]))
				}
			}
		}
		for step := 0; step < 14; step++ {
			cases++
			now = now.Add(time.Duration(r.Intn(4)) * 12 * time.Hour) // 同一天、第二天或隔一两天
			today := now.Format(dailyBackupDate)
			where := fmt.Sprintf("第 %d 轮第 %d 步（%s）", round, step, today)

			var expect *modelFile
			var expectErr error
			switch main.kind {
			case fileGood:
				expect = &main
			case fileIncompatible:
				expectErr = errStoreIncompatible
			default:
				order := []modelFile{bak}
				dates := slices.Sorted(maps.Keys(days))
				slices.Reverse(dates)
				for _, date := range dates {
					order = append(order, days[date])
				}
			search:
				for i := range order {
					switch order[i].kind {
					case fileGood:
						expect = &order[i]
						break search
					case fileIncompatible:
						expectErr = errStoreCorrupt
						if main.kind == fileMissing {
							expectErr = errStoreIncompatible
						}
						break search
					}
				}
				if expect == nil && expectErr == nil && main.kind == fileBad {
					expectErr = errStoreCorrupt
				}
			}
			value, raw, recovered, err := f.load()
			switch {
			case expectErr != nil:
				if !errors.Is(err, expectErr) {
					t.Fatalf("%s：期望 %v，实际 %v", where, expectErr, err)
				}
				sameAsModel(where + "（报错时不动文件）")
			case expect == nil:
				if err != nil || recovered || raw != nil {
					t.Fatalf("%s：应按第一次运行处理，err=%v recovered=%v", where, err, recovered)
				}
			default:
				wantRecovered := expect != &main
				if err != nil || recovered != wantRecovered || !bytes.Equal(raw, expect.content) || value.Revision != mustRevision(expect.content) {
					t.Fatalf("%s：err=%v recovered=%v（期望 %v）读到修订号 %d", where, err, recovered, wantRecovered, value.Revision)
				}
				if wantRecovered {
					main, mainAt = *expect, now
					touch(t, f.path, now)
				}
			}

			if err == nil {
				data := snapshotBytes(uint64(cases), randomCJK(r, 0, 6))
				if err := f.save(raw, data); err != nil {
					t.Fatalf("%s：保存失败 %v", where, err)
				}
				touch(t, f.path, now)
				if raw != nil {
					if mainDay := mainAt.Format(dailyBackupDate); mainDay < today {
						days[mainDay] = modelFile{kind: fileGood, content: raw}
						if dates := slices.Sorted(maps.Keys(days)); len(dates) > dailyBackupKeep {
							for _, old := range dates[:len(dates)-dailyBackupKeep] {
								delete(days, old)
							}
						}
					}
					bak = modelFile{kind: fileGood, content: raw}
				}
				main, mainAt = modelFile{kind: fileGood, content: data}, now
				sameAsModel(where + "（保存后）")
			}

			// 外部因素：同步盘冲突、杀软隔离、手动编辑、降级。
			someDay := ""
			if dates := slices.Sorted(maps.Keys(days)); len(dates) > 0 {
				someDay = dates[r.Intn(len(dates))]
			}
			switch r.Intn(11) {
			case 0, 1:
				main = modelFile{kind: fileBad, content: badContents(r)}
			case 2:
				main = modelFile{kind: fileMissing}
			case 3:
				bak = modelFile{kind: fileBad, content: badContents(r)}
			case 4:
				bak = modelFile{kind: fileMissing}
			case 5:
				main = modelFile{kind: fileIncompatible, content: []byte(newerWorkspace)}
			case 6:
				main = modelFile{kind: fileBad, content: badContents(r)}
				bak = modelFile{kind: fileBad, content: badContents(r)}
			case 7:
				if someDay != "" {
					days[someDay] = modelFile{kind: fileBad, content: badContents(r)}
				}
			case 8:
				if someDay != "" {
					delete(days, someDay)
					os.Remove(dayPath(someDay))
				}
			case 9:
				if someDay != "" && r.Intn(3) == 0 {
					days[someDay] = modelFile{kind: fileIncompatible, content: []byte(newerWorkspace)}
				}
			}
			writeModel(t, f.path, main)
			if main.kind == fileGood {
				touch(t, f.path, mainAt) // 重写同样的内容也会刷新修改时间，拨回模型里的时刻
			}
			writeModel(t, f.path+".bak", bak)
			for date, m := range days {
				writeModel(t, dayPath(date), m)
			}
		}
	}
	t.Logf("共检查 %d 次读取", cases)
}

const newerWorkspace = `{"version":2,"revision":"r","data":[1]}`

func mustRevision(b []byte) uint64 {
	v, _ := parseWorkspace(b)
	return v.Revision
}

// 从页面走一遍：前天写的笔记，今天误删了正文、自动保存了好几次，.bak 里已经没有原文，
// 按天的备份里还有；主文件和 .bak 都坏了时，自动恢复也会用上它。
func TestNotebookDailyBackupKeepsEarlierText(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	s := New(Options{})
	path := filepath.Join(dir, "notebook-v1.json")
	if w := notebookRequest(s, http.MethodPut, notebookBody(0, notebookFixture)); w.Code != 200 {
		t.Fatalf("first save: %d %s", w.Code, w.Body.String())
	}
	earlier := time.Now().AddDate(0, 0, -2)
	touch(t, path, earlier)
	erased := strings.Replace(notebookFixture, "保留原始正文。", "", 1)
	for revision := uint64(1); revision <= 3; revision++ {
		if w := notebookRequest(s, http.MethodPut, notebookBody(revision, erased)); w.Code != 200 {
			t.Fatalf("autosave %d: %d %s", revision, w.Code, w.Body.String())
		}
	}
	if b, _ := os.ReadFile(path + ".bak"); strings.Contains(string(b), "保留原始正文") {
		t.Fatal("fixture no longer shows the one-generation gap: .bak still has the erased text")
	}
	daily := path + ".bak-" + earlier.Format(dailyBackupDate)
	if b, err := os.ReadFile(daily); err != nil || !strings.Contains(string(b), "保留原始正文") || !strings.Contains(string(b), `"revision":1`) {
		t.Fatalf("the earlier day's notes must be kept in %s: %q %v", filepath.Base(daily), b, err)
	}
	os.WriteFile(path, []byte("broken"), 0600)
	os.WriteFile(path+".bak", []byte("broken too"), 0600)
	w := notebookRequest(New(Options{}), http.MethodGet, "")
	if w.Code != 200 || w.Header().Get("X-SZU-Recovered") != "backup" || !strings.Contains(w.Body.String(), "保留原始正文") {
		t.Fatalf("both latest copies broken: must restore the daily backup: %d %v %s", w.Code, w.Header(), w.Body.String())
	}
}

func TestWorkspaceDailyBackupThroughHandler(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	s := New(Options{})
	main := filepath.Join(dir, "workspace-v1.json")
	if w := workspaceRequest(s, "POST", `{"version":1,"revision":0,"data":{"n":1}}`); w.Code != 200 {
		t.Fatalf("first save: %d %s", w.Code, w.Body.String())
	}
	earlier := time.Now().AddDate(0, 0, -3)
	touch(t, main, earlier)
	for i, body := range []string{`{"version":1,"revision":1,"data":{"n":2}}`, `{"version":1,"revision":2,"data":{"n":3}}`} {
		if w := workspaceRequest(s, "POST", body); w.Code != 200 {
			t.Fatalf("save %d: %d %s", i, w.Code, w.Body.String())
		}
	}
	daily := main + ".bak-" + earlier.Format(dailyBackupDate)
	if b, err := os.ReadFile(daily); err != nil || !strings.Contains(string(b), `"n":1`) {
		t.Fatalf("the earlier day's save must be kept in %s: %q %v", filepath.Base(daily), b, err)
	}
	os.WriteFile(main, []byte("broken"), 0600)
	os.WriteFile(main+".bak", []byte("also broken"), 0600)
	w := workspaceRequest(New(Options{}), "GET", "")
	if w.Code != 200 || w.Header().Get("X-SZU-Recovered") != "backup" || !strings.Contains(w.Body.String(), `"n":1`) {
		t.Fatalf("both latest copies broken: must restore the daily backup: %d %v %s", w.Code, w.Header(), w.Body.String())
	}
	if kept, _ := filepath.Glob(main + ".corrupt-*"); len(kept) != 1 {
		t.Fatalf("the broken main file must be kept aside: %v", kept)
	}
}
