package ui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"sync"
	"time"
)

const releasesAPI = "https://api.github.com/repos/SzuDesktopTeam/szudesktop/releases"
const releasesPage = "https://github.com/SzuDesktopTeam/szudesktop/releases/tag/"

// 测试版渠道只看最近几个发布：列表按时间倒序，新版本一定在前面。
// 以前一次拉 100 个完整发布对象，响应迟早会超过下面的 2 MiB 上限而被截断。
const betaReleasesQuery = "?per_page=10"

// releaseCacheTTL 内重复检查直接用上次的结果。
//
// GitHub 对未认证请求按出口 IP 每小时只给 60 次，校园网里大家共用少数几个
// NAT 出口，额度很容易被别人用完。过期后带 If-None-Match 再问，
// 没有新版本时返回 304，不计入额度。
const releaseCacheTTL = 15 * time.Minute

// errReleaseNotModified 表示带着 ETag 问过，GitHub 说内容没变。
var errReleaseNotModified = errors.New("发布信息没有变化")

// releaseHTTPClient 在整个进程里复用，不再每次检查都新建连接。
var releaseHTTPClient = &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

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
	// Stale 为 true 表示这次没连上 GitHub，给出的是本次运行里更早一次的检查结果，
	// Message 会说明是多久以前的。
	Stale bool `json:"stale,omitempty"`
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
//
// etag 非空时带 If-None-Match 做条件请求；GitHub 返回 304 时得到 errReleaseNotModified。
// 第二个返回值是这次响应的 ETag，供下次条件请求使用。
func fetchRelease(ctx context.Context, client *http.Client, channel, etag string) (releaseInfo, string, error) {
	result := releaseInfo{Channel: channel}
	if channel != "stable" && channel != "beta" {
		return result, "", errors.New("请选择正式版或测试版渠道")
	}
	endpoint := releasesAPI + "/latest"
	if channel == "beta" {
		endpoint = releasesAPI + betaReleasesQuery
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return result, "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "szuDesktop-release-check")
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	resp, err := client.Do(req)
	if err != nil {
		return result, "", errors.New("暂时无法连接 GitHub 发布服务，请检查网络后重试")
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotModified && etag != "" {
		return result, etag, errReleaseNotModified
	}
	etag = resp.Header.Get("ETag")
	if resp.StatusCode == http.StatusNotFound && channel == "stable" {
		result.Message = "目前还没有正式版，可选择测试版渠道查看公开版本。"
		return result, etag, nil
	}
	if resp.StatusCode != http.StatusOK {
		return result, "", errors.New("GitHub 暂未提供版本信息，可能是连接受限或请求额度已用完，请稍后重试")
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
		return result, "", errors.New("发布服务返回了无法识别的内容，请稍后重试")
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
			return result, "", errors.New("发布列表中没有可识别的版本，请直接查看项目发布页")
		}
		result.Message = "所选渠道暂时没有公开版本。"
	}
	return result, etag, nil
}

type releaseEntry struct {
	info releaseInfo
	etag string
	at   time.Time
}

// releaseChecker 在内存里按渠道缓存检查结果。零值可用。
type releaseChecker struct {
	mu      sync.Mutex
	client  *http.Client // 测试注入；nil 时用 releaseHTTPClient
	entries map[string]releaseEntry
}

func (c *releaseChecker) check(ctx context.Context, channel string) (releaseInfo, error) {
	c.mu.Lock()
	cached, ok := c.entries[channel]
	client := c.client
	c.mu.Unlock()
	if ok && time.Since(cached.at) < releaseCacheTTL {
		return cached.info, nil
	}
	if client == nil {
		client = releaseHTTPClient
	}
	info, etag, err := fetchRelease(ctx, client, channel, cached.etag)
	if errors.Is(err, errReleaseNotModified) {
		info, err = cached.info, nil
	}
	if err != nil {
		if ok {
			// 额度用完或网络不通时，先给出这次运行里上一次成功拿到的结果，
			// 但要说清楚它是旧的：这期间发布的新版本不会出现在里面。
			return staleRelease(cached.info, time.Since(cached.at)), nil
		}
		return info, err
	}
	c.mu.Lock()
	if c.entries == nil {
		c.entries = make(map[string]releaseEntry)
	}
	c.entries[channel] = releaseEntry{info: info, etag: etag, at: time.Now()}
	c.mu.Unlock()
	return info, nil
}

// staleRelease 给沿用的旧结果标上 stale，并在 Message 里说明是多久以前查的。
func staleRelease(info releaseInfo, age time.Duration) releaseInfo {
	ago := fmt.Sprintf("%d 分钟", int(age.Minutes()))
	if age >= time.Hour {
		ago = fmt.Sprintf("%d 小时", int(age.Hours()))
	}
	note := "GitHub 暂时不可用，显示的是 " + ago + "前的检查结果。"
	info.Stale = true
	info.Message = note + info.Message
	return info
}

func (s *Server) handleReleases(w http.ResponseWriter, r *http.Request) {
	channel := r.URL.Query().Get("channel")
	if channel != "stable" && channel != "beta" {
		writeAPIError(w, http.StatusBadRequest, errors.New("请选择正式版或测试版渠道"))
		return
	}
	result, err := s.releases.check(r.Context(), channel)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, result)
}
