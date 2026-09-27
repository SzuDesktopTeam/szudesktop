package portal

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// TestQueryOnlineDoesNotKeepConnectionsAlive 在线查询桌面端每 30 秒跑一次，
// 每个门户只发一个请求。以前每次都新建带保活的 Transport，空闲连接要挂到
// IdleConnTimeout 才关，下一次查询还得重新握手。现在两边共用一个不保活的
// 连接层：请求里必须带 Connection: close。
func TestQueryOnlineDoesNotKeepConnectionsAlive(t *testing.T) {
	var mu sync.Mutex
	seen := map[string]bool{}
	mux := http.NewServeMux()
	mux.HandleFunc("/cgi-bin/rad_user_info", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen["srun"] = r.Close
		mu.Unlock()
		_, _ = w.Write([]byte(`_({"error":"not_online"})`))
	})
	mux.HandleFunc("/eportal/portal/rad_user_info", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen["drcom"] = r.Close
		mu.Unlock()
		_, _ = w.Write([]byte(`dr1003({"result":0})`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	if _, err := QueryOnline(ZoneOnline, srv.URL, srv.URL, "123456", "pw"); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	for _, name := range []string{"srun", "drcom"} {
		closeReq, ok := seen[name]
		if !ok {
			t.Fatalf("%s 没有被查询", name)
		}
		if !closeReq {
			t.Errorf("%s 的在线查询不该保活连接", name)
		}
	}
}
