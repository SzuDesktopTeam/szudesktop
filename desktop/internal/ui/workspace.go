package ui

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

const workspaceMaxBytes = 2 << 20

type workspaceSnapshot struct {
	Version  int             `json:"version"`
	Revision uint64          `json:"revision"`
	Data     json.RawMessage `json:"data"`
}
type workspaceStore struct {
	mu     sync.Mutex
	path   string
	notice recoveryNotice // 从备份恢复过、还没告诉页面
}

func newWorkspaceStore() *workspaceStore {
	dir := os.Getenv("SZUNET_CONFIG_DIR")
	if dir == "" {
		home, err := os.UserHomeDir()
		if err == nil {
			dir = filepath.Join(home, ".szunet")
		}
	}
	return &workspaceStore{path: filepath.Join(dir, "workspace-v1.json")}
}
func (s *workspaceStore) file() storeFile[workspaceSnapshot] {
	return storeFile[workspaceSnapshot]{
		path:       s.path,
		tmpPattern: ".workspace-*.tmp",
		empty:      workspaceSnapshot{Version: 1, Data: json.RawMessage(`null`)},
		parse:      parseWorkspace,
	}
}

func parseWorkspace(b []byte) (workspaceSnapshot, error) {
	var v workspaceSnapshot
	// 先只看版本号：更新的版本可能改了其他字段的类型，整份按 v1 解析会失败，
	// 被当成损坏改名、再拿旧备份顶上，降级保护就落空了。
	var head struct {
		Version int `json:"version"`
	}
	if json.Unmarshal(b, &head) == nil && head.Version > 1 {
		return v, errStoreIncompatible
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return v, err
	}
	if v.Version != 1 {
		return v, errors.New("存档版本号无效")
	}
	return v, nil
}

// load 读存档；主文件损坏而备份完好时自动恢复（recovered 为 true）。
func (s *workspaceStore) load() (current workspaceSnapshot, raw []byte, recovered bool, err error) {
	current, raw, recovered, err = s.file().load()
	switch {
	case errors.Is(err, errStoreIncompatible):
		err = errors.New("存档版本不兼容，原文件已保留")
	case errors.Is(err, errStoreCorrupt):
		err = fmt.Errorf("本机存档无法读取，也没有可用的备份；原文件已保留在 %s，请先备份该文件后再处理", s.path)
	case errors.As(err, new(*restoreError)):
		err = fmt.Errorf("本机存档读取失败，%v。现有文件都没有改动，请关闭占用 %s 的同步盘或杀毒软件后重试", err, filepath.Dir(s.path))
	}
	return current, raw, recovered, err
}

func (s *workspaceStore) read() (workspaceSnapshot, error) {
	current, _, _, err := s.load()
	return current, err
}
func (s *Server) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	s.workspace.mu.Lock()
	defer s.workspace.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.workspace.path), 0700); err != nil {
		writeAPIError(w, 500, err)
		return
	}
	unlock, err := lockWorkspace(s.workspace.path + ".lock")
	if err != nil {
		writeAPIError(w, 503, errors.New("存档正在被另一个窗口使用，请稍后重试"))
		return
	}
	defer unlock()
	current, raw, recovered, err := s.workspace.load()
	if err != nil {
		writeAPIError(w, 500, err)
		return
	}
	restored := s.workspace.notice.apply(w, r, recovered)
	if r.Method == http.MethodGet {
		writeJSON(w, current)
		return
	}
	var incoming workspaceSnapshot
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, workspaceMaxBytes))
	dec.DisallowUnknownFields()
	err = dec.Decode(&incoming)
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeAPIError(w, http.StatusRequestEntityTooLarge, errors.New("存档不能超过 2 MiB，原存档已保留"))
		return
	}
	if err != nil || incoming.Version != 1 || len(incoming.Data) == 0 || string(incoming.Data) == "null" {
		writeAPIError(w, 400, errors.New("存档格式不正确"))
		return
	}
	var trailing any
	if err = dec.Decode(&trailing); err != io.EOF {
		if errors.As(err, &tooLarge) {
			writeAPIError(w, http.StatusRequestEntityTooLarge, errors.New("存档不能超过 2 MiB，原存档已保留"))
			return
		}
		writeAPIError(w, 400, errors.New("存档不能包含额外内容"))
		return
	}
	if incoming.Revision != current.Revision {
		message := "另一个窗口更新了存档，请重新加载后继续"
		if restored {
			message = "存档文件损坏，已恢复到上一次成功保存的版本，请重新加载后继续"
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusConflict)
		writeJSON(w, map[string]any{"ok": false, "message": message, "revision": current.Revision})
		return
	}
	incoming.Revision++
	b, err := json.Marshal(incoming)
	if err != nil {
		writeAPIError(w, 400, err)
		return
	}
	if err = os.MkdirAll(filepath.Dir(s.workspace.path), 0700); err != nil {
		writeAPIError(w, 500, err)
		return
	}
	if err = s.workspace.file().save(raw, b); err != nil {
		writeAPIError(w, 500, errors.New("存档未写入，原存档保留，请检查磁盘空间或权限"))
		return
	}
	writeJSON(w, incoming)
}
func (s *Server) handleShutdown(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]bool{"ok": true})
	if s.shutdown != nil {
		go s.shutdown()
	}
}
