package ui

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
)

// Only the isolated Electron school profile supplies these cookies. They never
// pass through the garden renderer, logs, credentials store, or workspace file.
type browserCookie struct {
	Name  string `json:"name"`
	Value string `json:"value"`
	Path  string `json:"path"`
}

func setBrowserCookies(client *http.Client, cookies []browserCookie) error {
	if len(cookies) == 0 || len(cookies) > 64 {
		return errors.New("请先在应用内的学校页面完成登录")
	}
	root, _ := url.Parse(ehallBaseURL)
	var total int
	for _, item := range cookies {
		total += len(item.Name) + len(item.Value) + len(item.Path)
		cookie := &http.Cookie{Name: item.Name, Value: item.Value, Path: item.Path, Secure: true, HttpOnly: true}
		if total > 32768 || cookie.Valid() != nil {
			return errors.New("学校登录状态格式异常，请重新登录")
		}
		client.Jar.SetCookies(root, []*http.Cookie{cookie})
	}
	return nil
}

func validateBrowserSession(ctx context.Context, client *http.Client, business string) error {
	if business == "graduate" {
		_, err := readGraduateProfile(ctx, client)
		return err
	}
	if business == "undergrad" {
		return validateUndergradSession(ctx, client)
	}
	path, dataset := undergradTermPath, "dqxnxq"
	if business != "undergrad" {
		level := "undergrad"
		if business == "graduate-scores" {
			level = "graduate"
		}
		app, _ := selectScoreApp(level)
		path, dataset = app.Path, app.Dataset
	}
	b, err := casRequest(ctx, client, ehallBaseURL+path, allRowsForm(1), ehallBaseURL+"/")
	if err != nil {
		return err
	}
	_, err = ehallRows(b, dataset)
	return err
}

func validateUndergradSession(ctx context.Context, client *http.Client) error {
	b, err := casRequest(ctx, client, ehallRoot()+undergradTermPath, url.Values{}, casServiceTarget())
	if err != nil {
		return err
	}
	rows, err := ehallRows(b, "dqxnxq")
	if err != nil {
		return err
	}
	if len(rows) != 1 || !validTermPattern.MatchString(str(rows[0], "DM")) {
		return errors.New("学校未返回有效学期，请在学校页面核对")
	}
	form := allRowsForm(500)
	form.Set("XNXQDM", str(rows[0], "DM"))
	b, err = casRequest(ctx, client, ehallRoot()+undergradTimetablePath, form, casServiceTarget())
	if err != nil {
		return err
	}
	_, err = parseUndergradTimetable(b)
	return err
}

func (s *Server) handleBrowserSession(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodDelete {
		s.cas.mu.Lock()
		s.cas.reset()
		s.cas.mu.Unlock()
		s.academic.mu.Lock()
		s.academic.reset()
		s.academic.mu.Unlock()
		if r.URL.Query().Get("scope") == "all" {
			if err := s.sessionStore().Delete(); err != nil {
				writeAPIError(w, 503, err)
				return
			}
		}
		writeJSON(w, map[string]bool{"ok": true})
		return
	}
	var in struct {
		Business string          `json:"business"`
		Cookies  []browserCookie `json:"cookies"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 65536)).Decode(&in) != nil {
		writeAPIError(w, 400, errors.New("学校登录状态格式不正确"))
		return
	}
	if in.Business != "undergrad" && in.Business != "graduate" && in.Business != "undergrad-scores" && in.Business != "graduate-scores" {
		writeAPIError(w, 400, errors.New("请选择课表或成绩业务"))
		return
	}
	// Clear the selected account before anything else. Failed replacement must
	// not leave a previous person's authenticated state available to the UI,
	// including when the browser has no cookies after logout or failed login.
	//
	// 两次学校请求（最长约 25 秒）不持锁：先在锁内复位并记下 gen，锁外校验，
	// 回到锁内 gen 没变才落下新会话。这样同步期间 /api/cas/session、成绩、课表
	// 和退出时的 DELETE 都不用排队；途中被清除或替换时，这次结果直接作废。
	graduate := in.Business == "graduate"
	a, c := s.academic, s.cas
	var started uint64
	if graduate {
		a.mu.Lock()
		a.reset()
		started = a.gen
		a.mu.Unlock()
	} else {
		c.mu.Lock()
		c.reset()
		started = c.gen
		c.mu.Unlock()
	}
	client := newCasClient()
	if graduate {
		client = newAcademicClient()
	}
	if err := setBrowserCookies(client, in.Cookies); err != nil {
		writeAPIError(w, 400, err)
		return
	}
	err := validateBrowserSession(r.Context(), client, in.Business)
	var superseded bool
	if graduate {
		a.mu.Lock()
		if superseded = a.gen != started; err == nil && !superseded {
			a.client, a.authenticated = client, true
		}
		a.mu.Unlock()
	} else {
		c.mu.Lock()
		if superseded = c.gen != started; err == nil && !superseded {
			c.client, c.authenticated = client, true
		}
		c.mu.Unlock()
	}
	switch {
	case superseded:
		client.CloseIdleConnections()
		writeAPIError(w, 409, errBrowserSessionSuperseded)
	case err != nil:
		client.CloseIdleConnections()
		if graduate {
			writeAcademicError(w, err)
		} else {
			writeCasError(w, err)
		}
	default:
		writeJSON(w, map[string]any{"ok": true, "authenticated": true, "business": in.Business,
			"message": "所选业务已通过学校查询验证，可以返回课表或成绩卡片读取；登录仅保留到退出应用"})
	}
}

// errBrowserSessionSuperseded：校验途中这条学校登录被清除或被别的登录替换。
var errBrowserSessionSuperseded = errors.New("读取途中学校登录状态被清除或替换，请回到学校页面重新读取")
