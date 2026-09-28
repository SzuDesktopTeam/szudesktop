package ui

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"testing"
)

// fileKind 是模型里一份文件的状态。
type fileKind int

const (
	fileMissing fileKind = iota
	fileGood
	fileBad          // 解析不了
	fileIncompatible // 更新版本写入
)

type modelFile struct {
	kind    fileKind
	content []byte
}

// badContents 是各种「读坏了」的形态：截断、空、类型不对、版本号无效、随机字节。
func badContents(r *rand.Rand) []byte {
	switch r.Intn(6) {
	case 0:
		return []byte("broken{")
	case 1:
		return nil
	case 2:
		return []byte("[]")
	case 3:
		return []byte(`{"version":0,"revision":1,"data":{}}`)
	case 4:
		return []byte(`{"version":1,"revision":"x","data":{}}`)
	default:
		return []byte(randomBinary(r, 1, 40))
	}
}

// writeModel 把模型里的一份文件写到磁盘（缺失就删掉）。
func writeModel(t *testing.T, path string, f modelFile) {
	t.Helper()
	if f.kind == fileMissing {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			t.Fatal(err)
		}
		return
	}
	if err := os.WriteFile(path, f.content, 0600); err != nil {
		t.Fatal(err)
	}
}

// TestPropertyStoreFileRecoversLastGoodVersion 性质：对任意「保存、外部弄坏主文件 / 备份、删掉
// 主文件 / 备份、写入更新版本」的序列，load 的结果始终等于模型：主文件好就用主文件；主文件坏
// 或不见了而备份好，就恢复成备份并报 recovered，坏文件原样留成 .corrupt-*；两份都坏就报
// errStoreCorrupt 且不动文件；更新版本写入的报 errStoreIncompatible 且不动文件；
// 主文件不见、备份也坏时按第一次运行处理。每次 save 之后主文件是新内容、备份是上一份好内容。
func TestPropertyStoreFileRecoversLastGoodVersion(t *testing.T) {
	r := propertyRand(t)
	cases := 0
	// 30 轮 × 11 步 = 330 次读取；每步都真的落盘（fsync），Windows 上一次约 30 毫秒。
	for round := 0; round < 30; round++ {
		dir := t.TempDir()
		f := storeFile[workspaceSnapshot]{
			path: filepath.Join(dir, "workspace-v1.json"), tmpPattern: ".workspace-*.tmp",
			empty: workspaceSnapshot{Version: 1, Data: json.RawMessage(`null`)}, parse: parseWorkspace,
		}
		main, bak := modelFile{}, modelFile{}
		revision := uint64(0)
		corruptSeen := 0
		for step := 0; step < 11; step++ {
			cases++
			value, raw, recovered, err := f.load()
			expectRecovered := false
			var expectValue modelFile
			var expectErr error
			switch {
			case main.kind == fileGood:
				expectValue = main
			case main.kind == fileIncompatible:
				expectErr = errStoreIncompatible
			case main.kind == fileBad && bak.kind == fileGood:
				expectValue, expectRecovered = bak, true
			case main.kind == fileBad:
				expectErr = errStoreCorrupt
			case bak.kind == fileGood: // 主文件不见了
				expectValue, expectRecovered = bak, true
			case bak.kind == fileIncompatible:
				expectErr = errStoreIncompatible
			default: // 两份都没有，或备份也坏了：从头开始
			}
			where := fmt.Sprintf("第 %d 轮第 %d 步（主文件 %v，备份 %v）", round, step, main.kind, bak.kind)
			if expectErr != nil {
				if !errors.Is(err, expectErr) {
					t.Fatalf("%s：期望错误 %v，实际 %v", where, expectErr, err)
				}
				// 报错时不能动任何文件。
				if got, _ := os.ReadFile(f.path); main.kind != fileMissing && !bytes.Equal(got, main.content) {
					t.Fatalf("%s：报错时主文件被改动", where)
				}
				if got, _ := os.ReadFile(f.path + ".bak"); bak.kind != fileMissing && !bytes.Equal(got, bak.content) {
					t.Fatalf("%s：报错时备份被改动", where)
				}
			} else {
				if err != nil || recovered != expectRecovered {
					t.Fatalf("%s：err=%v recovered=%v，期望 recovered=%v", where, err, recovered, expectRecovered)
				}
				if expectValue.kind == fileGood {
					want, _ := parseWorkspace(expectValue.content)
					if value.Revision != want.Revision || !bytes.Equal(value.Data, want.Data) || !bytes.Equal(raw, expectValue.content) {
						t.Fatalf("%s：读到 %+v / %q，期望 %+v", where, value, raw, want)
					}
				} else if raw != nil || value.Revision != 0 || string(value.Data) != "null" {
					t.Fatalf("%s：第一次运行应得到空存档，实际 %+v / %q", where, value, raw)
				}
				if expectRecovered {
					if main.kind == fileBad {
						corruptSeen++
						kept, _ := filepath.Glob(f.path + ".corrupt-*")
						if len(kept) != corruptSeen {
							t.Fatalf("%s：坏文件应留存为 .corrupt-*，现有 %v", where, kept)
						}
						found := false
						for _, k := range kept {
							if b, _ := os.ReadFile(k); bytes.Equal(b, main.content) {
								found = true
							}
						}
						if !found {
							t.Fatalf("%s：留存的坏文件内容与原文件不一致", where)
						}
					}
					if got, _ := os.ReadFile(f.path); !bytes.Equal(got, bak.content) {
						t.Fatalf("%s：恢复后主文件应等于备份", where)
					}
					main = bak
				}
			}

			// 能读就保存一版新的：备份应变成刚读到的那份，主文件变成新内容。
			if err == nil {
				revision = value.Revision + 1
				data, _ := json.Marshal(workspaceSnapshot{Version: 1, Revision: revision, Data: json.RawMessage(fmt.Sprintf(`{"n":%d,"s":"%s"}`, step, randomCJK(r, 0, 6)))})
				if err := f.save(raw, data); err != nil {
					t.Fatalf("%s：保存失败 %v", where, err)
				}
				if raw != nil {
					bak = modelFile{kind: fileGood, content: raw}
				}
				main = modelFile{kind: fileGood, content: data}
				if got, _ := os.ReadFile(f.path); !bytes.Equal(got, data) {
					t.Fatalf("%s：保存后主文件不是新内容", where)
				}
				if bak.kind != fileMissing {
					if got, _ := os.ReadFile(f.path + ".bak"); !bytes.Equal(got, bak.content) {
						t.Fatalf("%s：保存后备份不是上一份好内容", where)
					}
				}
			}

			// 外部因素：同步盘冲突、杀软隔离、手动编辑、降级。
			switch r.Intn(9) {
			case 0, 1:
				main = modelFile{kind: fileBad, content: badContents(r)}
			case 2:
				main = modelFile{kind: fileMissing}
			case 3:
				bak = modelFile{kind: fileBad, content: badContents(r)}
			case 4:
				bak = modelFile{kind: fileMissing}
			case 5:
				main = modelFile{kind: fileIncompatible, content: []byte(`{"version":2,"revision":"r","data":[1]}`)}
			case 6:
				main = modelFile{kind: fileBad, content: badContents(r)}
				bak = modelFile{kind: fileBad, content: badContents(r)}
			}
			writeModel(t, f.path, main)
			writeModel(t, f.path+".bak", bak)
		}
	}
	t.Logf("共检查 %d 次读取", cases)
}
