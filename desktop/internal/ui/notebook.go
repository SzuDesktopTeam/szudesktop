package ui

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const notebookMaxBytes = 8 << 20

type notebookSnapshot struct {
	Version  int             `json:"version"`
	Revision uint64          `json:"revision"`
	Data     json.RawMessage `json:"data"`
}

type notebookStore struct {
	mu     sync.Mutex
	path   string
	notice recoveryNotice // 从备份恢复过、还没告诉页面
}

func newNotebookStore(dir string) *notebookStore {
	return &notebookStore{path: filepath.Join(dir, "notebook-v1.json")}
}

// Validate known fields without re-encoding data, so optional source metadata
// and future editor fields survive a round trip unchanged.
func validateNotebookData(raw json.RawMessage) error {
	var data struct {
		Courses []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Color     string `json:"color"`
			SharedURL string `json:"sharedUrl"`
		} `json:"courses"`
		Notes []struct {
			ID        string          `json:"id"`
			CourseID  string          `json:"courseId"`
			Title     *string         `json:"title"`
			Body      *string         `json:"body"`
			CreatedAt json.RawMessage `json:"createdAt"`
			UpdatedAt json.RawMessage `json:"updatedAt"`
			DeletedAt json.RawMessage `json:"deletedAt"`
		} `json:"notes"`
		Preferences map[string]json.RawMessage `json:"preferences"`
	}
	invalid := errors.New("笔记格式不正确，请检查课程与笔记内容")
	if err := json.Unmarshal(raw, &data); err != nil || data.Courses == nil || data.Notes == nil || data.Preferences == nil {
		return invalid
	}
	courses := make(map[string]bool, len(data.Courses))
	for _, course := range data.Courses {
		if strings.TrimSpace(course.ID) == "" || strings.TrimSpace(course.Name) == "" || courses[course.ID] {
			return invalid
		}
		courses[course.ID] = true
	}
	notes := make(map[string]bool, len(data.Notes))
	for _, note := range data.Notes {
		if strings.TrimSpace(note.ID) == "" || notes[note.ID] || (note.CourseID != "" && !courses[note.CourseID]) || note.Title == nil || note.Body == nil {
			return invalid
		}
		if !validNotebookTime(note.CreatedAt) || !validNotebookTime(note.UpdatedAt) {
			return invalid
		}
		if len(note.DeletedAt) > 0 && !bytes.Equal(bytes.TrimSpace(note.DeletedAt), []byte("null")) && !validNotebookTime(note.DeletedAt) {
			return invalid
		}
		notes[note.ID] = true
	}
	for _, key := range []string{"selectedNoteId", "selectedCourseId"} {
		if raw, ok := data.Preferences[key]; ok {
			var value string
			if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) || json.Unmarshal(raw, &value) != nil {
				return invalid
			}
		}
	}
	return nil
}

func validNotebookTime(raw json.RawMessage) bool {
	var milliseconds uint64
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return false
	}
	if json.Unmarshal(raw, &milliseconds) == nil {
		return true
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}

func decodeNotebookSnapshot(r io.Reader) (notebookSnapshot, error) {
	var input struct {
		Version  int             `json:"version"`
		Revision *uint64         `json:"revision"`
		Data     json.RawMessage `json:"data"`
	}
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&input); err != nil {
		return notebookSnapshot{}, err
	}
	var trailing any
	if err := dec.Decode(&trailing); err != io.EOF {
		if err == nil {
			err = errors.New("笔记不能包含额外内容")
		}
		return notebookSnapshot{}, err
	}
	if input.Version != 1 || input.Revision == nil {
		return notebookSnapshot{}, errors.New("笔记版本或修订号不正确")
	}
	if err := validateNotebookData(input.Data); err != nil {
		return notebookSnapshot{}, err
	}
	return notebookSnapshot{Version: 1, Revision: *input.Revision, Data: input.Data}, nil
}

func (s *notebookStore) file() storeFile[notebookSnapshot] {
	return storeFile[notebookSnapshot]{
		path:       s.path,
		tmpPattern: ".notebook-*.tmp",
		limit:      notebookMaxBytes,
		empty:      notebookSnapshot{Version: 1, Data: json.RawMessage(`null`)},
		parse:      parseNotebookFile,
	}
}

func parseNotebookFile(b []byte) (notebookSnapshot, error) {
	if len(b) > notebookMaxBytes {
		return notebookSnapshot{}, errors.New("笔记存档超过大小上限")
	}
	var head struct {
		Version int `json:"version"`
	}
	if json.Unmarshal(b, &head) == nil && head.Version > 1 {
		return notebookSnapshot{}, errStoreIncompatible
	}
	return decodeNotebookSnapshot(bytes.NewReader(b))
}

// load 读笔记；主文件损坏而备份完好时自动恢复（recovered 为 true）。
func (s *notebookStore) load() (current notebookSnapshot, raw []byte, recovered bool, err error) {
	current, raw, recovered, err = s.file().load()
	switch {
	case errors.Is(err, errStoreIncompatible):
		err = errors.New("笔记存档由更新的版本写入，当前版本无法读取，原文件已保留")
	case errors.Is(err, errStoreCorrupt):
		err = fmt.Errorf("笔记存档无法读取，也没有可用的备份；原文件已保留在 %s，请先备份该文件后再处理", s.path)
	case errors.As(err, new(*restoreError)):
		err = fmt.Errorf("笔记存档读取失败，%v。现有文件都没有改动，请关闭占用 %s 的同步盘或杀毒软件后重试", err, filepath.Dir(s.path))
	}
	return current, raw, recovered, err
}

func (s *Server) handleNotebook(w http.ResponseWriter, r *http.Request) {
	s.notebook.mu.Lock()
	defer s.notebook.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.notebook.path), 0700); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}
	unlock, err := lockWorkspace(s.notebook.path + ".lock")
	if err != nil {
		writeAPIError(w, http.StatusServiceUnavailable, errors.New("笔记正在被另一个窗口使用，请稍后重试"))
		return
	}
	defer unlock()
	current, raw, recovered, err := s.notebook.load()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}
	restored := s.notebook.notice.apply(w, r, recovered)
	if r.Method == http.MethodGet {
		writeJSON(w, current)
		return
	}
	incoming, err := decodeNotebookSnapshot(http.MaxBytesReader(w, r.Body, notebookMaxBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeAPIError(w, http.StatusRequestEntityTooLarge, errors.New("笔记不能超过 8 MiB，原笔记已保留"))
		} else {
			writeAPIError(w, http.StatusBadRequest, errors.New("笔记格式不正确，原笔记已保留"))
		}
		return
	}
	if incoming.Revision != current.Revision {
		message := "另一个窗口更新了笔记，请先导出当前内容，再重新载入"
		if restored {
			message = "笔记文件损坏，已恢复到上一次成功保存的版本；请先导出当前内容，再重新载入"
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusConflict)
		writeJSON(w, map[string]any{"ok": false, "message": message, "revision": current.Revision})
		return
	}
	if incoming.Revision == ^uint64(0) {
		writeAPIError(w, http.StatusConflict, errors.New("笔记修订号已达到上限，原笔记已保留"))
		return
	}
	incoming.Revision++
	b, err := json.Marshal(incoming)
	if err != nil || len(b) > notebookMaxBytes {
		writeAPIError(w, http.StatusRequestEntityTooLarge, errors.New("笔记不能超过 8 MiB，原笔记已保留"))
		return
	}
	if err = s.notebook.file().save(raw, b); err != nil {
		writeAPIError(w, http.StatusInternalServerError, errors.New("笔记未写入，原文件已保留，请检查磁盘空间或权限"))
		return
	}
	writeJSON(w, incoming)
}
