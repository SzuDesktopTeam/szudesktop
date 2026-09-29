package ui

// 本机存档（庭院 workspace、课程笔记 notebook）的“上一份好文件”备份与损坏恢复。
//
// 写盘本身是原子的（临时文件 + rename），但文件仍可能被外部因素弄坏：同步盘冲突、
// 杀软隔离后还原、磁盘错误、手动编辑。以前一旦读坏，GET 和 POST 都是 500，
// 庭院和笔记从此既读不了也存不了，普通学生很难自救。
//
// 现在每次写入前，把当前这份（刚读出来校验过，一定是好的）留作 <文件名>.bak。
// 主文件读坏而 .bak 完好时：坏文件改名为 <文件名>.corrupt-<unix纳秒> 原样保留，
// 用 .bak 恢复主文件，响应头带 X-SZU-Recovered: backup，页面据此提示用户。
// 主文件不见了而 .bak 还在（恢复中途断电、同步盘删了它）也按同样方式恢复。
// 所有备份都用不了时照旧报错，并说明坏文件在哪。
//
// 只有 .bak 一代不够：笔记每停笔 650 毫秒就自动保存，误删一段正文、或者规则 bug 写坏了数值，
// 再保存两次，.bak 里也只剩改坏之后的内容。所以每天第一次保存时，再把主文件按它最后写入那天的日期
// 另存为 <文件名>.bak-YYYY-MM-DD（那天结束时的样子），只留最近 dailyBackupKeep 个使用日；
// 需要时关掉程序，把它改名成主文件即可退回那一天。一天最多多写一次，不拖慢自动保存。
// 文件读坏时从新到旧找第一份能用的：先 .bak，再按日期从近到远（日期晚于今天的放到最后，见 dailyBackups）。

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

const recoveredHeader = "X-SZU-Recovered"

const (
	// dailyBackupKeep 是按天另存的备份最多留几份（按使用日算，不是自然日：几天没打开不会占名额）。
	dailyBackupKeep = 3
	dailyBackupDate = "2006-01-02"
)

var (
	// errStoreCorrupt 表示主文件损坏，而且没有可用的备份。
	errStoreCorrupt = errors.New("存档文件损坏")
	// errStoreIncompatible 表示文件由更新的版本写入。这不算损坏：
	// 不能拿旧备份把它覆盖掉，否则降级后再升级回来，新数据就找不回了。
	errStoreIncompatible = errors.New("存档由更新的版本写入")
)

// restoreError 表示备份完好，却没能把它换成主文件，多半是文件被杀软或同步盘占着。
// 这和“没有可用的备份”是两回事，不能混成同一句提示。
type restoreError struct{ err error }

func (e *restoreError) Error() string {
	return "备份存在但没能恢复成主文件：" + e.err.Error()
}
func (e *restoreError) Unwrap() error { return e.err }

// recoveryNotice 让“已从备份恢复”的提示一直保留到某次读取把它带给页面。
// 调用方须持有对应存档的锁。
//
// 恢复可能发生在自动保存的 POST/PUT 上：那次响应多半是修订号冲突（备份比页面手里的旧），
// 页面随后重新 GET，而这时文件已经恢复好了。只在恢复发生的那次响应里带头的话，
// 页面只会看到“另一个窗口更新了存档”，学生根本不知道存档坏过、内容退回了一版。
type recoveryNotice struct{ pending bool }

// apply 记下本次请求是否做过恢复，提示还没送达时给响应带上 X-SZU-Recovered。
// 页面只在读取时检查这个头，所以只有 GET 才算送达。返回提示是否仍在生效。
func (n *recoveryNotice) apply(w http.ResponseWriter, r *http.Request, recovered bool) bool {
	if recovered {
		n.pending = true
	}
	if !n.pending {
		return false
	}
	w.Header().Set(recoveredHeader, "backup")
	if r.Method == http.MethodGet {
		n.pending = false
	}
	return true
}

// storeFile 描述一份带 .bak 与按天备份的本机 JSON 存档。
type storeFile[T any] struct {
	path       string
	tmpPattern string                  // 临时文件名模式，启动时按它清理残留
	limit      int64                   // 最多读多少字节，<=0 表示不限
	empty      T                       // 文件不存在时返回的值
	parse      func([]byte) (T, error) // 损坏返回任意错误；新版本文件返回 errStoreIncompatible
	now        func() time.Time        // 判断“今天”用的时钟，nil 为 time.Now；测试里固定下来，跨午夜也不会多出一份备份
}

// load 读主文件。主文件损坏或缺失而有完好的备份时自动恢复，recovered 为 true。
// raw 是主文件（恢复后）的内容，文件不存在时为 nil，写入时用它生成备份。
func (f storeFile[T]) load() (value T, raw []byte, recovered bool, err error) {
	raw, err = f.read(f.path)
	missing := errors.Is(err, os.ErrNotExist)
	if err != nil && !missing {
		return f.empty, nil, false, err
	}
	if !missing {
		if value, err = f.parse(raw); err == nil {
			return value, raw, false, nil
		}
		if errors.Is(err, errStoreIncompatible) {
			return f.empty, nil, false, errStoreIncompatible
		}
	}
	// 从新到旧找第一份能用的备份。坏掉的跳过，试更早的一份；遇到读不出来或更新版本写入的就停下：
	// 那份可能比后面的都新，拿更旧的顶上去接着保存，它会被覆盖（.bak）或挤出保留名额（按天的备份）。
	for _, path := range f.backups() {
		backup, err := f.read(path)
		switch {
		case errors.Is(err, os.ErrNotExist):
			continue
		case missing && err != nil:
			// 备份在却读不出来。不能当成第一次运行：新存档保存两次就会把它覆盖掉。
			return f.empty, nil, false, &restoreError{err}
		case err != nil:
			return f.empty, nil, false, errStoreCorrupt
		}
		if value, err = f.parse(backup); err != nil {
			switch {
			case missing && errors.Is(err, errStoreIncompatible):
				return f.empty, nil, false, errStoreIncompatible
			case errors.Is(err, errStoreIncompatible):
				return f.empty, nil, false, errStoreCorrupt
			}
			continue
		}
		// 主文件缺失时同样要恢复：若按第一次运行处理，页面会新建一份存档，
		// 第二次保存就把 .bak 换成新内容，上一份好存档从此找不回来。
		if missing {
			err = writeFileAtomic(f.path, backup, f.tmpPattern)
		} else {
			err = f.restore(backup)
		}
		if err != nil {
			return f.empty, nil, false, &restoreError{err}
		}
		return value, backup, true, nil
	}
	if missing {
		return f.empty, nil, false, nil // 主文件没有，备份也没有或都坏了：第一次运行，或只能从头开始
	}
	return f.empty, nil, false, errStoreCorrupt
}

// save 先把 previous（当前主文件内容）留作 .bak（每天第一次还按日期另存一份），再原子写入 data。
// 备份写不进去不影响本次保存：旧的备份仍是更早的好存档。
func (f storeFile[T]) save(previous, data []byte) error {
	if previous != nil {
		f.keepDaily(previous)
		_ = writeFileAtomic(f.path+".bak", previous, f.tmpPattern)
	}
	return writeFileAtomic(f.path, data, f.tmpPattern)
}

// keepDaily 在主文件最后一次写入早于今天时，把它按那天的日期另存，并删掉超出份数的旧备份。
// 日期取主文件的修改时间而不是今天：文件名说的就是里面内容所属的那一天。
// 修改时间比今天还晚（时钟调快后又改回）时不另存，免得留下一份“未来”的备份；
// 以前已经留下的，dailyBackups 把它们排在最后，超出份数时先删。
func (f storeFile[T]) keepDaily(previous []byte) {
	info, err := os.Stat(f.path)
	if err != nil {
		return
	}
	day, today := info.ModTime().Local().Format(dailyBackupDate), f.clock().Local().Format(dailyBackupDate)
	if day >= today {
		return
	}
	if writeFileAtomic(f.path+".bak-"+day, previous, f.tmpPattern) != nil {
		return
	}
	if days := f.dailyBackups(); len(days) > dailyBackupKeep {
		for _, old := range days[dailyBackupKeep:] {
			_ = os.Remove(old)
		}
	}
}

// backups 按从新到旧的顺序列出可用来恢复的备份：先 .bak，再按天的备份。
func (f storeFile[T]) backups() []string {
	return append([]string{f.path + ".bak"}, f.dailyBackups()...)
}

// dailyBackups 列出按天的备份，日期近的在前，日期晚于今天的排在最后。不用 filepath.Glob：
// 用户目录里可能有 [ ] 这类会被当成通配符的字符。
//
// 日期晚于今天的，是时钟调快的那几天留下的：它们写在时钟改回之前，其实比今天以前的备份都旧。
// 按日期排在最前的话，它们会一直占着保留名额，以后每份真正的按天备份刚写下就被删掉，
// 读坏时也先拿它们顶上。排到最后：超出份数时先删它们，恢复时最后才试。
func (f storeFile[T]) dailyBackups() []string {
	dir, prefix := filepath.Dir(f.path), filepath.Base(f.path)+".bak-"
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	today := f.clock().Local().Format(dailyBackupDate)
	var days, future []string
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		date := strings.TrimPrefix(name, prefix)
		if _, err := time.Parse(dailyBackupDate, date); err != nil {
			continue
		}
		if date > today {
			future = append(future, filepath.Join(dir, name))
		} else {
			days = append(days, filepath.Join(dir, name))
		}
	}
	for _, list := range [][]string{days, future} {
		slices.Sort(list)
		slices.Reverse(list)
	}
	return append(days, future...)
}

func (f storeFile[T]) clock() time.Time {
	if f.now != nil {
		return f.now()
	}
	return time.Now()
}

func (f storeFile[T]) read(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var r io.Reader = file
	if f.limit > 0 {
		r = io.LimitReader(file, f.limit+1)
	}
	return io.ReadAll(r)
}

// restore 用备份内容替换损坏的主文件，坏文件改名留存。
// 先把备份写成落盘的临时文件，主文件缺席的窗口只剩两次 rename 之间。
func (f storeFile[T]) restore(backup []byte) error {
	tmp, err := writeTemp(f.path, backup, f.tmpPattern)
	if err != nil {
		return err
	}
	defer os.Remove(tmp)
	corrupt := fmt.Sprintf("%s.corrupt-%d", f.path, time.Now().UnixNano())
	if err = os.Rename(f.path, corrupt); err != nil {
		return err
	}
	if err = os.Rename(tmp, f.path); err != nil {
		// 换不上就把原文件放回去，保证“原文件已保留”这句话成立。
		_ = os.Rename(corrupt, f.path)
		return err
	}
	return nil
}

// writeFileAtomic 先写同目录临时文件并落盘，再 rename 覆盖目标。
func writeFileAtomic(path string, data []byte, tmpPattern string) error {
	tmp, err := writeTemp(path, data, tmpPattern)
	if err != nil {
		return err
	}
	defer os.Remove(tmp)
	return os.Rename(tmp, path)
}

// writeTemp 在 path 同目录写一个 0600 的临时文件并落盘，返回它的路径。
func writeTemp(path string, data []byte, tmpPattern string) (string, error) {
	f, err := os.CreateTemp(filepath.Dir(path), tmpPattern)
	if err != nil {
		return "", err
	}
	tmp := f.Name()
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	return tmp, nil
}
