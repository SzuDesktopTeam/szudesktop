//go:build !campusvpn

package ui

import (
	"errors"
	"net/http"
)

type vpnManager struct{}

func newVPNManager() *vpnManager { return &vpnManager{} }

// shutdown 与 recoverLeftover 与 campusvpn 构建对齐：发布版没有隧道，也不改系统代理。
func (m *vpnManager) shutdown()        {}
func (m *vpnManager) recoverLeftover() {}
func (s *Server) handleVPNStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"state": "unavailable", "state_label": "请使用官方 WebVPN", "experimental": false, "connected": false, "message": "当前发布版不包含实验 VPN 协议", "official_url": "https://webvpn.szu.edu.cn/"})
}
func unavailableVPN(w http.ResponseWriter, r *http.Request) {
	writeAPIError(w, 503, errors.New("此发布版不提供实验 VPN 隧道，请使用官方 WebVPN"))
}
func (s *Server) handleVPNConnect(w http.ResponseWriter, r *http.Request)    { unavailableVPN(w, r) }
func (s *Server) handleVPNAuth(w http.ResponseWriter, r *http.Request)       { unavailableVPN(w, r) }
func (s *Server) handleVPNDisconnect(w http.ResponseWriter, r *http.Request) { unavailableVPN(w, r) }
func (s *Server) handleVPNProxy(w http.ResponseWriter, r *http.Request)      { unavailableVPN(w, r) }
