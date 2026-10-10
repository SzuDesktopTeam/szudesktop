package netpref

import "testing"

func TestCampusKeyNormalizesPortalAndClient(t *testing.T) {
	for _, tc := range []struct {
		name, host, ip, want string
	}{
		{"http default port", "HTTP://NET.SZU.EDU.CN:80/srun_portal_pc?ac_id=12#login", "10.20.30.40", "http://net.szu.edu.cn|10.20.30.40"},
		{"https default port and userinfo", "https://user:password@NET.SZU.EDU.CN:443/path?x=1", "10.20.30.40", "https://net.szu.edu.cn|10.20.30.40"},
		{"no explicit port", "https://net.szu.edu.cn", "10.20.30.40", "https://net.szu.edu.cn|10.20.30.40"},
		{"nondefault port", "https://net.szu.edu.cn:8443/path", "10.20.30.40", "https://net.szu.edu.cn:8443|10.20.30.40"},
		{"port belongs to other scheme", "http://net.szu.edu.cn:443", "10.20.30.40", "http://net.szu.edu.cn:443|10.20.30.40"},
		{"another portal", "https://portal.szu.edu.cn", "10.20.30.40", "https://portal.szu.edu.cn|10.20.30.40"},
		{"another client", "https://net.szu.edu.cn", "10.20.30.41", "https://net.szu.edu.cn|10.20.30.41"},
		{"ipv6 client", "https://net.szu.edu.cn", "2001:0DB8:0000:0000:0000:0000:0000:0001", "https://net.szu.edu.cn|2001:db8::1"},
		{"mapped ipv4 client", "https://net.szu.edu.cn", "::ffff:10.20.30.40", "https://net.szu.edu.cn|10.20.30.40"},
		{"ipv6 portal", "http://[2001:db8::2]:80/path", "2001:db8::1", "http://[2001:db8::2]|2001:db8::1"},
		{"ipv6 portal nondefault port", "https://[2001:db8::2]:8443/path", "2001:db8::1", "https://[2001:db8::2]:8443|2001:db8::1"},
		{"surrounding whitespace", " https://NET.SZU.EDU.CN:443/path ", " 10.20.30.40 ", "https://net.szu.edu.cn|10.20.30.40"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := CampusKey(tc.host, tc.ip); got != tc.want {
				t.Fatalf("CampusKey(%q, %q) = %q, want %q", tc.host, tc.ip, got, tc.want)
			}
		})
	}
}

func TestCampusKeyRejectsInvalidInputs(t *testing.T) {
	for _, tc := range []struct{ name, host, ip string }{
		{"empty client", "https://net.szu.edu.cn", ""},
		{"invalid client", "https://net.szu.edu.cn", "not-an-ip"},
		{"client subnet", "https://net.szu.edu.cn", "10.20.30.40/24"},
		{"client with port", "https://net.szu.edu.cn", "10.20.30.40:80"},
		{"empty portal", "", "10.20.30.40"},
		{"relative portal", "net.szu.edu.cn/path", "10.20.30.40"},
		{"unsupported scheme", "ftp://net.szu.edu.cn", "10.20.30.40"},
		{"missing hostname", "https:///path", "10.20.30.40"},
		{"invalid url escape", "https://net.szu.edu.cn/%zz", "10.20.30.40"},
		{"invalid port", "https://net.szu.edu.cn:invalid", "10.20.30.40"},
		{"out of range port", "https://net.szu.edu.cn:65536", "10.20.30.40"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := CampusKey(tc.host, tc.ip); got != "" {
				t.Fatalf("CampusKey(%q, %q) = %q, want no cache key", tc.host, tc.ip, got)
			}
		})
	}
}
