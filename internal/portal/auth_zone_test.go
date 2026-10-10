package portal

import "testing"

func TestAuthenticationZoneSeparatesConnectivity(t *testing.T) {
	cases := []struct {
		name   string
		result DetectResult
		want   Zone
	}{
		{"Internet alone", DetectResult{Zone: ZoneOnline, InternetOK: true, Probed: true}, ZoneUnknown},
		{"online teaching", DetectResult{Zone: ZoneOnline, InternetOK: true, Probed: true, SrunUsable: true}, ZoneTeaching},
		{"online dorm", DetectResult{Zone: ZoneOnline, InternetOK: true, Probed: true, DormUsable: true}, ZoneDorm},
		{"both follow classification", DetectResult{Zone: ZoneOnline, InternetOK: true, Probed: true, SrunUsable: true, DormUsable: true}, ZoneDorm},
		{"offline teaching fingerprint", DetectResult{Zone: ZoneTeaching, Probed: true, SrunUsable: true}, ZoneTeaching},
		{"offline dorm fingerprint", DetectResult{Zone: ZoneDorm, Probed: true, DormUsable: true}, ZoneDorm},
		{"reachable teaching page is not a protocol", DetectResult{Zone: ZoneTeaching, Probed: true, TeachPortalOK: true}, ZoneUnknown},
		{"reachable dorm pages are not a protocol", DetectResult{Zone: ZoneDorm, Probed: true, DormPortalOK: true, TeachPortalOK: true}, ZoneUnknown},
		{"outside", DetectResult{Zone: ZoneOutside, Probed: true}, ZoneUnknown},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.result.AuthenticationZone(); got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}
