package portal

import (
	"context"
	"errors"
	"net"
	"net/http"
	"sync"
	"testing"
	"time"
)

func TestDetectionReturnsWhenDNSStalls(t *testing.T) {
	release := make(chan struct{})
	oldLookup, oldTransport := lookupIP, probeTransport
	lookupIP = func(ctx context.Context, _ string) ([]net.IP, error) {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-release:
			return nil, errors.New("test DNS lookup released")
		}
	}
	probeTransport = &http.Transport{
		DialContext: func(context.Context, string, string) (net.Conn, error) {
			return nil, errors.New("test probe offline")
		},
	}

	var workers sync.WaitGroup
	t.Cleanup(func() {
		close(release)
		workers.Wait()
		probeTransport.CloseIdleConnections()
		lookupIP, probeTransport = oldLookup, oldTransport
	})

	type detection struct {
		name   string
		result *DetectResult
	}
	results := make(chan detection, 2)
	for name, detect := range map[string]func() *DetectResult{
		"Detect": Detect,
		"Probe":  Probe,
	} {
		workers.Add(1)
		go func() {
			defer workers.Done()
			results <- detection{name, detect()}
		}()
	}

	deadline := time.NewTimer(6 * time.Second)
	defer deadline.Stop()
	for range 2 {
		select {
		case got := <-results:
			if got.result.SrunDNSOK || got.result.SrunDNSFakeIP {
				t.Errorf("%s reported a DNS answer for a stalled lookup: %+v", got.name, got.result)
			}
			if !got.result.Probed {
				t.Errorf("%s returned before completing the offline portal probes", got.name)
			}
		case <-deadline.C:
			t.Fatal("network detection did not finish within 6 seconds while DNS stalled")
		}
	}
}
