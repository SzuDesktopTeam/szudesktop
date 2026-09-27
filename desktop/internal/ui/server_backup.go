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
// 两份都坏时照旧报错，并说明坏文件在哪。

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const recoveredHeader = "X-SZU-Recovered"

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

// storeFile 描述一份带 .bak 备份的本机 JSON 存档。
type storeFile[T any] struct {
	path       string
	tmpPattern string                  // 临时文件名模式，启动时按它清理残留
	limit      int64                   // 最多读多少字节，<=0 表示不限
	empty      T                       // 文件不存在时返回的值
	parse      func([]byte) (T, error) // 损坏返回任意错误；新版本文件返回 errStoreIncompatible
}

// load 读主文件。主文件损坏或缺失而 .bak 完好时自动恢复，recovered 为 true。
// raw 是主文件（恢复后）的内容，文件不存在时为 nil，写入时用它生成 .bak。
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
	backup, err := f.read(f.path + ".bak")
	switch {
	case missing && errors.Is(err, os.ErrNotExist):
		return f.empty, nil, false, nil // 两份都没有：第一次运行
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
		case missing:
			return f.empty, nil, false, nil // 主文件没有、备份也坏了，只能从头开始
		}
		return f.empty, nil, false, errStoreCorrupt
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

// save 先把 previous（当前主文件内容）留作 .bak，再原子写入 data。
// 备份写不进去不影响本次保存：旧的 .bak 仍是一份更早的好存档。
func (f storeFile[T]) save(previous, data []byte) error {
	if previous != nil {
		_ = writeFileAtomic(f.path+".bak", previous, f.tmpPattern)
	}
	return writeFileAtomic(f.path, data, f.tmpPattern)
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
