package ui

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

const releasesAPI = "https://api.github.com/repos/SzuDesktopTeam/szudesktop/releases"
const releasesPage = "https://github.com/SzuDesktopTeam/szudesktop/releases/tag/"

var releaseTag = regexp.MustCompile(`^(beta|v)?([0-9]+)\.([0-9]+)\.([0-9]+)$`)

type githubRelease struct {
	TagName     string `json:"tag_name"`
	Draft       bool   `json:"draft"`
	Prerelease  bool   `json:"prerelease"`
	PublishedAt string `json:"published_at"`
}

type releaseInfo struct {
	Channel     string `json:"channel"`
	Available   bool   `json:"available"`
	Version     string `json:"version,omitempty"`
	URL         string `json:"url,omitempty"`
	PublishedAt string `json:"published_at,omitempty"`
	Prerelease  bool   `json:"prerelease,omitempty"`
	Message     string `json:"message,omitempty"`
}

func releaseVersion(tag string) ([4]int, bool) {
	var version [4]int
	match := releaseTag.FindStringSubmatch(tag)
	if match == nil {
		return version, false
	}
	for i := 0; i < 3; i++ {
		value, err := strconv.Atoi(match[i+2])
		if err != nil {
			return version, false
		}
		version[i] = value
	}
	if match[1] != "beta" {
		version[3] = 1
	}
	return version, true
}

func newerRelease(a, b [4]int) bool {
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return false
}

// This endpoint only reads this project's public releases. It never uses a
// school client, session jar, user-supplied URL, or authenticated GitHub token.
func fetchRelease(ctx context.Context, client *http.Client, channel string) (releaseInfo, error) {
	result := releaseInfo{Channel: channel}
	if channel != "stable" && channel != "beta" {
		return result, errors.New("请选择正式版或测试版渠道")
	}
	endpoint := releasesAPI + "/latest"
	if channel == "beta" {
		endpoint = releasesAPI + "?per_page=100"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return result, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "szuDesktop-release-check")
	resp, err := client.Do(req)
	if err != nil {
		return result, errors.New("暂时无法连接 GitHub 发布服务，请检查网络后重试")
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound && channel == "stable" {
		result.Message = "目前还没有正式版，可选择测试版渠道查看公开版本。"
		return result, nil
	}
	if resp.StatusCode != http.StatusOK {
		return result, errors.New("GitHub 暂未提供版本信息，可能是连接受限或请求额度已用完，请稍后重试")
	}
	decoder := json.NewDecoder(io.LimitReader(resp.Body, 2<<20))
	var candidates []githubRelease
	if channel == "stable" {
		var item githubRelease
		err = decoder.Decode(&item)
		candidates = []githubRelease{item}
	} else {
		err = decoder.Decode(&candidates)
	}
	if err != nil {
		return result, errors.New("发布服务返回了无法识别的内容，请稍后重试")
	}
	var best [4]int
	for _, item := range candidates {
		value, valid := releaseVersion(item.TagName)
		if !valid || item.Draft || item.PublishedAt == "" || (channel == "stable" && (item.Prerelease || value[3] == 0)) {
			continue
		}
		if !result.Available || newerRelease(value, best) {
			best = value
			result.Available = true
			result.Version = item.TagName
			result.URL = releasesPage + item.TagName
			result.Prerelease = item.Prerelease || value[3] == 0
			result.PublishedAt = item.PublishedAt
		}
	}
	if !result.Available {
		if len(candidates) != 0 {
			return result, errors.New("发布列表中没有可识别的版本，请直接查看项目发布页")
		}
		result.Message = "所选渠道暂时没有公开版本。"
	}
	return result, nil
}

func (s *Server) handleReleases(w http.ResponseWriter, r *http.Request) {
	channel := r.URL.Query().Get("channel")
	if channel != "stable" && channel != "beta" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"message": "请选择正式版或测试版渠道"})
		return
	}
	client := &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	result, err := fetchRelease(r.Context(), client, channel)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		writeJSON(w, map[string]string{"message": err.Error()})
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, result)
}
