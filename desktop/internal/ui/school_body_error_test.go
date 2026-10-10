package ui

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"testing/iotest"
)

type schoolBodyRequest struct {
	name, finalHost, plain, oversized string
	call                              func(context.Context, http.RoundTripper) error
}

func schoolBodyRequests() []schoolBodyRequest {
	return []schoolBodyRequest{
		{"ehall", ehallHost, "读取学校系统响应失败，请检查网络后重试", "学校系统返回的内容异常大，已中止", func(ctx context.Context, transport http.RoundTripper) error {
			client := newEhallClient("JSESSIONID=private-cookie", 0)
			client.http.Transport = transport
			_, err := client.postFormContext(ctx, undergradScorePath, allRowsForm(1))
			return err
		}},
		{"研究生教务", ehallHost, "学校响应无法完整读取", "学校响应无法完整读取", func(ctx context.Context, transport http.RoundTripper) error {
			client := newAcademicClient()
			client.Transport = transport
			_, err := academicRequest(ctx, client, graduateProfilePath, nil)
			return err
		}},
		{"统一身份认证跳回ehall", ehallHost, "学校响应无法完整读取", "学校响应无法完整读取", func(ctx context.Context, transport http.RoundTripper) error {
			client := newCasClient()
			client.Transport = transport
			_, _, _, err := casDo(ctx, client, "https://"+casHost+"/authserver/login?service=private-service", nil, "")
			return err
		}},
	}
}

// CAS really follows a redirect here, so its response body belongs to ehall,
// not the authserver host where the request started.
func schoolBodyTransport(body func() io.ReadCloser) http.RoundTripper {
	return calendarTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Hostname() == casHost {
			return &http.Response{StatusCode: http.StatusFound, Header: http.Header{"Location": {"https://" + ehallHost + casServicePath + "?ticket=private-ticket"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: body(), Request: r}, nil
	})
}

func TestSchoolBodyReadErrorsExplainFakeIPTakeover(t *testing.T) {
	reset := &net.OpError{Op: "read", Net: "tcp", Err: errors.New("connection reset by peer: private-network-detail")}
	transport := schoolBodyTransport(func() io.ReadCloser { return io.NopCloser(iotest.ErrReader(reset)) })
	for _, tc := range schoolBodyRequests() {
		t.Run(tc.name, func(t *testing.T) {
			asked := withSchoolFakeIP(t, true)
			err := tc.call(context.Background(), transport)
			if err == nil || !strings.Contains(err.Error(), takeoverText) {
				t.Fatalf("正文读取被重置时没有给出代理提示：%v", err)
			}
			if len(*asked) != 1 || (*asked)[0] != tc.finalHost {
				t.Fatalf("应该检查最终响应所在的 %s，实际查了 %v", tc.finalHost, *asked)
			}
			if strings.Contains(err.Error(), "private-") || strings.Contains(err.Error(), "://") {
				t.Fatalf("报错泄露了请求或网络错误详情：%v", err)
			}

			withSchoolFakeIP(t, false)
			err = tc.call(context.Background(), transport)
			if err == nil || err.Error() != tc.plain {
				t.Fatalf("没有被接管时应给安全的读取失败提示 %q，实际 %v", tc.plain, err)
			}
		})
	}
}

type schoolBodyReadFunc func([]byte) (int, error)

func (f schoolBodyReadFunc) Read(b []byte) (int, error) { return f(b) }

func TestSchoolBodyReadCancellationDoesNotCheckDNS(t *testing.T) {
	for _, tc := range schoolBodyRequests() {
		t.Run(tc.name, func(t *testing.T) {
			asked := withSchoolFakeIP(t, true)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			transport := schoolBodyTransport(func() io.ReadCloser {
				return io.NopCloser(schoolBodyReadFunc(func([]byte) (int, error) {
					cancel()
					return 0, context.Canceled
				}))
			})
			err := tc.call(ctx, transport)
			if err == nil || strings.Contains(err.Error(), "代理软件接管") || len(*asked) != 0 {
				t.Fatalf("取消读取不应检查 DNS 或提示代理：%v（查了 %v）", err, *asked)
			}
			if tc.name == "ehall" && !errors.Is(err, context.Canceled) {
				t.Fatalf("取消读取应保留 context.Canceled：%v", err)
			}
		})
	}
}

func TestSchoolBodySizeLimitDoesNotCheckDNS(t *testing.T) {
	oversized := strings.Repeat("x", ehallMaxBody+1)
	transport := schoolBodyTransport(func() io.ReadCloser { return io.NopCloser(strings.NewReader(oversized)) })
	for _, tc := range schoolBodyRequests() {
		t.Run(tc.name, func(t *testing.T) {
			asked := withSchoolFakeIP(t, true)
			err := tc.call(context.Background(), transport)
			if err == nil || err.Error() != tc.oversized || len(*asked) != 0 {
				t.Fatalf("超大响应应保留原提示且不检查 DNS：%v（查了 %v）", err, *asked)
			}
		})
	}
}
