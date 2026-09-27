import assert from 'node:assert/strict';
import {schoolDate,teachingWeek,createAcademicUI} from './assets/garden/academic.mjs';
const terms=[{name:'秋季',start:'2026-08-28',end:'2027-01-22',week_start:'2026-08-30'}];
let count=0;const test=(name,f)=>{f();console.log('PASS',name);count++};
test('school timezone and Sunday boundary',()=>{
 assert.equal(schoolDate(Date.parse('2026-09-19T16:01:00Z')),'2026-09-20');
 assert.equal(teachingWeek(terms,'','2026-09-19').title,'第 3 周');
 assert.equal(teachingWeek(terms,'','2026-09-20').title,'第 4 周');
});
test('registration and holidays do not become week zero or week thirty',()=>{
 assert.equal(teachingWeek(terms,'','2026-08-28').title,'开学报到期间');
 assert.equal(teachingWeek(terms,'','2027-02-01').title,'当前不在已公布的学期内');
});
test('manual override retains its own start date',()=>{
 assert.equal(teachingWeek(terms,'2026-09-14','2026-09-20').title,'第 1 周');
 assert.equal(teachingWeek(terms,'2026-09-14','2026-09-13').title,'距离第 1 周还有 1 天');
});
// Refresh replaces only the summary, preserving an unsaved date edit in the form.
const elements={'academic-summary':{innerHTML:''}},button={disabled:false};
globalThis.document={getElementById:id=>elements[id],querySelector:()=>button};
let calls=[];
const ui=createAcademicUI({getState:()=>({semester:'2026-09-14'}),toast:()=>{},api:async path=>{calls.push(path);return {terms,stale:path.endsWith('refresh=1')?false:true,checked_at:new Date().toISOString()}}});
await ui.load();
test('first load refreshes stale calendar and preserves manual mode',()=>{
 assert.deepEqual(calls,['/api/campus/calendar','/api/campus/calendar?refresh=1']);
 assert.match(elements['academic-summary'].innerHTML,/手动日期/);
 assert.equal(button.disabled,false);
 assert.match(ui.card(),/value="2026-09-14"/);
});

let failFirst=true;
const recovering=createAcademicUI({getState:()=>({semester:''}),toast(){},api:async()=>{if(failFirst)throw Error('学校连接超时');return {terms,stale:false,checked_at:new Date().toISOString()}}});
await recovering.load();
test('first calendar failure ends the loading state and offers recovery',()=>{
 const html=recovering.card();
 assert.match(html,/暂时无法显示教学周/);assert.match(html,/读取失败/);assert.match(html,/学校连接超时/);
 assert.doesNotMatch(html,/正在读取校历…|>官方校历<|等待学校发布下一学期校历/);
 assert.equal(button.disabled,false);
});
failFirst=false;await recovering.load(true);
test('a retry restores official calendar status',()=>{
 assert.match(recovering.card(),/>官方校历</);assert.doesNotMatch(recovering.card(),/暂时无法显示教学周|读取失败|学校连接超时/);
});
failFirst=true;await recovering.load(true);
test('a failed refresh retains dates and labels the displayed calendar as cached',()=>{
 assert.match(recovering.card(),/>缓存校历</);assert.match(recovering.card(),/学校连接超时/);
 assert.doesNotMatch(recovering.card(),/正在读取校历…|暂时无法显示教学周/);
});
console.log(`${count} academic checks passed`);
