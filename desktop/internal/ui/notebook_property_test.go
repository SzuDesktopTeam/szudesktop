package ui

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"reflect"
	"strings"
	"testing"
	"time"
)

// randomNotebookTime 生成 createdAt / updatedAt 的合法写法：毫秒整数或 RFC3339 字符串。
func randomNotebookTime(r *rand.Rand) any {
	ms := int64(1_600_000_000_000) + r.Int63n(300_000_000_000)
	if r.Intn(2) == 0 {
		return ms
	}
	return time.UnixMilli(ms).UTC().Format(time.RFC3339Nano)
}

// randomNotebookData 生成一份合法的笔记数据：课程 id 唯一、笔记 id 唯一、笔记要么不归课程
// 要么归到确实存在的课程；随手混进未来版本可能加的未知字段，它们必须原样保留。
func randomNotebookData(r *rand.Rand) map[string]any {
	courses := []any{}
	ids := []string{}
	for i := 0; i < r.Intn(4); i++ {
		id := fmt.Sprintf("c%d", i)
		ids = append(ids, id)
		course := map[string]any{"id": id, "name": randomCJK(r, 1, 6), "color": "#abcdef"}
		if r.Intn(2) == 0 {
			course["sharedUrl"] = "https://example.invalid/" + id
		}
		if r.Intn(3) == 0 {
			course["futureField"] = r.Intn(9)
		}
		courses = append(courses, course)
	}
	notes := []any{}
	for i := 0; i < r.Intn(6); i++ {
		note := map[string]any{"id": fmt.Sprintf("n%d", i), "courseId": "", "title": randomCJK(r, 0, 8), "body": randomCJK(r, 0, 40), "createdAt": randomNotebookTime(r), "updatedAt": randomNotebookTime(r)}
		if len(ids) > 0 && r.Intn(3) != 0 {
			note["courseId"] = ids[r.Intn(len(ids))]
		}
		switch r.Intn(3) {
		case 0:
			note["deletedAt"] = nil
		case 1:
			note["deletedAt"] = randomNotebookTime(r)
		}
		if r.Intn(3) == 0 {
			note["tags"] = []any{randomCJK(r, 1, 3)}
		}
		notes = append(notes, note)
	}
	prefs := map[string]any{}
	if r.Intn(2) == 0 {
		prefs["selectedNoteId"] = "n0"
	}
	if r.Intn(2) == 0 {
		prefs["selectedCourseId"] = ""
	}
	if r.Intn(2) == 0 {
		prefs["theme"] = map[string]any{"dark": true}
	}
	data := map[string]any{"courses": courses, "notes": notes, "preferences": prefs}
	if r.Intn(3) == 0 {
		data["editor"] = map[string]any{"font": 14}
	}
	return data
}

func semanticJSON(t *testing.T, raw []byte) any {
	t.Helper()
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("不是合法 JSON：%v\n%s", err, raw)
	}
	return v
}

// TestPropertyNotebookSnapshotRoundTrip 性质：任意合法笔记都能解码；修订号原样保留；data 经
// 解码 → 写盘格式 → 再解析后语义不变（未知字段、空标题、null 的 deletedAt 都保留）；
// 用 parseNotebookFile 读回和直接解码结果一致。
func TestPropertyNotebookSnapshotRoundTrip(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		data := randomNotebookData(r)
		revision := uint64(r.Intn(1000))
		body, _ := json.Marshal(map[string]any{"version": 1, "revision": revision, "data": data})
		snap, err := decodeNotebookSnapshot(bytes.NewReader(body))
		if err != nil {
			t.Fatalf("第 %d 例：合法笔记被拒：%v\n%s", i, err, body)
		}
		if snap.Version != 1 || snap.Revision != revision {
			t.Fatalf("第 %d 例：版本 / 修订号变了：%+v", i, snap)
		}
		wantData, _ := json.Marshal(data)
		if !reflect.DeepEqual(semanticJSON(t, snap.Data), semanticJSON(t, wantData)) {
			t.Fatalf("第 %d 例：data 语义变了\n期望 %s\n实际 %s", i, wantData, snap.Data)
		}
		stored, _ := json.Marshal(snap)
		again, err := parseNotebookFile(stored)
		if err != nil || again.Revision != revision || !reflect.DeepEqual(semanticJSON(t, again.Data), semanticJSON(t, wantData)) {
			t.Fatalf("第 %d 例：写盘格式读回后不一致：%v %+v", i, err, again)
		}
	}
}

// TestPropertyNotebookValidationRejectsEachBrokenInvariant 性质：从任意合法笔记出发，破坏任一条
// 约束（课程 id 重复 / 课程名空白 / 笔记指向不存在的课程 / 笔记 id 重复 / 标题缺失 / 时间非法 /
// 首选项类型不对 / 顶层多字段 / 缺修订号 / 尾随内容 / 更高版本）都必须被拒；更高版本要报
// errStoreIncompatible 而不是「损坏」。
func TestPropertyNotebookValidationRejectsEachBrokenInvariant(t *testing.T) {
	r := propertyRand(t)
	rejected := 0
	for i := 0; i < propertyCases; i++ {
		data := randomNotebookData(r)
		courses := data["courses"].([]any)
		notes := data["notes"].([]any)
		prefs := data["preferences"].(map[string]any)
		top := map[string]any{"version": 1, "revision": 3, "data": data}
		trailing := ""
		mutation := r.Intn(12)
		switch mutation {
		case 0:
			if len(courses) == 0 {
				continue
			}
			data["courses"] = append(courses, courses[0])
		case 1:
			if len(courses) == 0 {
				continue
			}
			courses[0].(map[string]any)["name"] = "  "
		case 2:
			if len(notes) == 0 {
				continue
			}
			notes[0].(map[string]any)["courseId"] = "ghost"
		case 3:
			if len(notes) == 0 {
				continue
			}
			data["notes"] = append(notes, notes[0])
		case 4:
			if len(notes) == 0 {
				continue
			}
			delete(notes[0].(map[string]any), "title")
		case 5:
			if len(notes) == 0 {
				continue
			}
			notes[0].(map[string]any)["createdAt"] = []any{-1, 1.5, "yesterday", nil, "2026-13-01T00:00:00Z"}[r.Intn(5)]
		case 6:
			if len(notes) == 0 {
				continue
			}
			notes[0].(map[string]any)["deletedAt"] = []any{-5, "soon", true}[r.Intn(3)]
		case 7:
			prefs["selectedNoteId"] = []any{nil, 7, true}[r.Intn(3)]
		case 8:
			top["extra"] = 1
		case 9:
			delete(top, "revision")
		case 10:
			trailing = " {}"
		case 11:
			top["version"] = 2
		}
		body, _ := json.Marshal(top)
		body = append(body, trailing...)
		if _, err := decodeNotebookSnapshot(bytes.NewReader(body)); err == nil {
			t.Fatalf("第 %d 例（变体 %d）：破坏约束后仍被接受：%s", i, mutation, body)
		}
		_, err := parseNotebookFile(body)
		if err == nil {
			t.Fatalf("第 %d 例（变体 %d）：parseNotebookFile 接受了坏文件：%s", i, mutation, body)
		}
		if isNewer := mutation == 11; errors.Is(err, errStoreIncompatible) != isNewer {
			t.Fatalf("第 %d 例（变体 %d）：更高版本应报 errStoreIncompatible、其余不该：%v", i, mutation, err)
		}
		rejected++
	}
	if rejected < propertyCases/2 {
		t.Fatalf("有效变体太少（%d），性质没有充分检验", rejected)
	}
	// 顶层是数组、null、超长都不能当成合法笔记。
	for _, raw := range []string{"[]", "null", `{"version":1,"revision":1,"data":null}`, strings.Repeat(" ", notebookMaxBytes+1)} {
		if _, err := parseNotebookFile([]byte(raw)); err == nil {
			t.Fatalf("%q 被当成合法笔记", raw[:min(len(raw), 40)])
		}
	}
}
