import assert from 'node:assert/strict';
import {createElectricityUI} from './assets/garden/electricity.mjs';

let panel={innerHTML:''};
globalThis.document={getElementById:id=>id==='electricity-panel'?panel:null};
const pending=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const result={room:'A01',remaining_kwh:0,total_used_kwh:18.5,total_purchased_kwh:18.5,recorded_at:'2026-10-24 23:59:00',records:[]};
let queryWait=null;
const calls=[];
const api=async(path,data,method)=>{calls.push({path,data,method});if(path==='/api/electricity/settings')return {configured:true};if(path.startsWith('/api/electricity/options'))return {client:'zone-a',campuses:[{value:'zone-a',name:'甲校区'},{value:'zone-b',name:'乙校区'}],buildings:[{value:'1001',name:'第一栋'}]};if(path==='/api/electricity/query')return queryWait?queryWait.promise:result;throw Error('unexpected request')};
const ui=createElectricityUI({api});
await ui.click('electricity-options');
assert.match(ui.section(),/甲校区/);
assert.match(ui.section(),/第一栋/);
await ui.change({target:{id:'electricity-building',value:'1001'}});
ui.input({target:{id:'electricity-room',value:'A01'}});
await ui.click('electricity-query');
assert.match(ui.section(),/0(?:\.0+)?\s*(?:<[^>]+>\s*)*kWh/,'zero remains a real result');
assert.match(ui.section(),/2026-10-24 23:59:00/);
assert.match(ui.section(),/累计/);
assert.doesNotMatch(ui.section(),/剩余(?:电量|余额)[^<]*(?:元|CNY)/);

queryWait=pending();
const request=ui.click('electricity-query');
ui.input({target:{id:'electricity-room',value:'B02'}});
queryWait.resolve(result);await request;
assert.doesNotMatch(ui.section(),/2026-10-24 23:59:00/,'edited input invalidates in-flight results');
assert.doesNotMatch(ui.section(),/>A01</,'old room data is not displayed');

const manual=createElectricityUI({api:async path=>{if(path==='/api/electricity/settings')return {configured:true};throw Error('宿舍电量系统暂时连不上，请连接校园网后重试')}});
await manual.click('electricity-options');
assert.match(manual.section(),/校区值/);
assert.match(manual.section(),/楼栋值/);
assert.match(manual.section(),/暂时连不上/);
manual.input({target:{id:'electricity-manual-client',value:'zone-a'}});
manual.input({target:{id:'electricity-manual-building',value:'1001'}});
manual.input({target:{id:'electricity-room',value:'A01'}});
assert.match(manual.section(),/electricity-query/);

const empty=createElectricityUI({api:async(path)=>path==='/api/electricity/query'?{...result,remaining_kwh:null,total_used_kwh:null,total_purchased_kwh:null,recorded_at:'',records:[]}:path==='/api/electricity/settings'?{configured:true}:{client:'zone-a',campuses:[{value:'zone-a',name:'甲校区'}],buildings:[{value:'1001',name:'第一栋'}]}});
await empty.click('electricity-options');await empty.change({target:{id:'electricity-building',value:'1001'}});empty.input({target:{id:'electricity-room',value:'A01'}});await empty.click('electricity-query');
assert.match(empty.section(),/没有记录/);
assert.doesNotMatch(empty.section(),/>0\s*kWh/);
assert.ok(calls.find(c=>c.path==='/api/electricity/query'&&c.data.building_id==='1001'&&!('entry_url' in c.data)));

const menuWait=pending();
const switching=createElectricityUI({api:async path=>path==='/api/electricity/settings'?{configured:true}:path.includes('zone-b')?menuWait.promise:{client:'zone-a',campuses:[{value:'zone-a',name:'甲校区'},{value:'zone-b',name:'乙校区'}],buildings:[{value:'1001',name:'第一栋'}]}});
await switching.click('electricity-options');
const switchRequest=switching.change({target:{id:'electricity-client',value:'zone-b'}});
assert.doesNotMatch(switching.section(),/第一栋/,'changing campus clears buildings from the old campus before waiting');
menuWait.resolve({client:'zone-b',campuses:[{value:'zone-a',name:'甲校区'},{value:'zone-b',name:'乙校区'}],buildings:[{value:'2002',name:'第二栋'}]});await switchRequest;
assert.match(switching.section(),/第二栋/);

const settingsWait=pending();
const configRaceCalls=[];
const configRace=createElectricityUI({api:async(path,data,method)=>{
 configRaceCalls.push({path,data,method});
 if(path==='/api/electricity/settings'&&method==='POST')return {configured:true};
 if(path==='/api/electricity/settings')return settingsWait.promise;
 throw Error('stale menu request should not run');
}});
const oldSettings=configRace.click('electricity-options');
configRace.input({target:{id:'electricity-entry',value:'https://service.szu.edu.cn/cgcSims/'}});
await configRace.click('electricity-save');
settingsWait.resolve({configured:false});await oldSettings;
assert.match(configRace.section(),/更换本机电量入口/,'late old settings cannot overwrite a newly saved entry');
assert.match(configRace.section(),/入口已保存在这台电脑/,'late old settings cannot overwrite the save message');
assert.ok(!configRaceCalls.some(call=>call.path.startsWith('/api/electricity/options')),'superseded load must stop before requesting menus');

const reviewFailures=[];
async function reviewCheck(name,run){try{await run()}catch(e){reviewFailures.push(name+': '+e.message.split('\n')[0])}}
const menuA={client:'zone-a',campuses:[{value:'zone-a',name:'甲校区'},{value:'zone-b',name:'乙校区'}],buildings:[{value:'1001',name:'第一栋'},{value:'1002',name:'第二栋'}]};
await reviewCheck('refresh preserves chosen building and first load requires explicit selection',async()=>{
 let failed=false,queries=[];
 const refresh=createElectricityUI({api:async(path,data)=>path==='/api/electricity/settings'?{configured:true}:path==='/api/electricity/query'?(queries.push(data),result):failed?Promise.reject(Error('菜单暂时无法读取')):menuA});
 await refresh.click('electricity-options');
 assert.doesNotMatch(refresh.section(),/value="100[12]" selected/,'first load must not silently choose a building');
 refresh.input({target:{id:'electricity-room',value:'A01'}});await refresh.click('electricity-query');
 assert.equal(queries.length,0,'query requires explicit building selection');
 await refresh.change({target:{id:'electricity-building',value:'1002'}});
 await refresh.click('electricity-options');
 assert.match(refresh.section(),/value="1002" selected/,'same-campus refresh preserves the chosen second building');
 await refresh.click('electricity-query');assert.equal(queries.at(-1).building_id,'1002');
 failed=true;await refresh.click('electricity-options');
 assert.match(refresh.section(),/id="electricity-manual-building"[^>]*value="1002"/,'failed refresh preserves the previous building value for review');
 assert.match(refresh.section(),/id="electricity-room"[^>]*value="A01"/);
 await refresh.change({target:{id:'electricity-client',value:'zone-b'}});
 assert.doesNotMatch(refresh.section(),/value="1002"/,'failed campus switch cannot relabel the old building');
});
await reviewCheck('room and date edits do not discard pending new-campus menus',async()=>{
 const wait=pending();let sent;
 const edit=createElectricityUI({api:async(path,data)=>path==='/api/electricity/settings'?{configured:true}:path==='/api/electricity/query'?(sent=data,result):path.includes('zone-b')?wait.promise:menuA});
 await edit.click('electricity-options');
 const changing=edit.change({target:{id:'electricity-client',value:'zone-b'}});
 edit.input({target:{id:'electricity-room',value:'B02'}});edit.input({target:{id:'electricity-from',value:'2026-10-20'}});
 wait.resolve({...menuA,client:'zone-b',buildings:[{value:'2002',name:'乙区楼栋'}]});await changing;
 assert.match(edit.section(),/乙区楼栋/,'unrelated input edits must not discard the menu response');
 await edit.change({target:{id:'electricity-building',value:'2002'}});await edit.click('electricity-query');
 assert.equal(sent.client,'zone-b');assert.equal(sent.building_id,'2002');assert.equal(sent.room,'B02');assert.equal(sent.from,'2026-10-20');
});
await reviewCheck('enter reads saved configuration once and then loads configured menus',async()=>{
 const wait=pending(),requests=[];
 const enter=createElectricityUI({api:async path=>{requests.push(path);return path==='/api/electricity/settings'?wait.promise:menuA}});
 const first=enter.enter(),second=enter.enter();
 assert.deepEqual(requests,['/api/electricity/settings'],'repeated entry while pending must not duplicate requests');
 wait.resolve({configured:true});await Promise.all([first,second]);await enter.enter();await enter.load();
 assert.deepEqual(requests,['/api/electricity/settings','/api/electricity/options']);assert.match(enter.section(),/更换本机电量入口/);assert.match(enter.section(),/第一栋/);
});
await reviewCheck('enter only prompts when no local entry is configured',async()=>{
 const requests=[];const enter=createElectricityUI({api:async path=>{requests.push(path);return {configured:false}}});
 await enter.enter();await enter.enter();assert.deepEqual(requests,['/api/electricity/settings']);assert.match(enter.section(),/请先设置/);
});
assert.equal(reviewFailures.length,0,reviewFailures.join('\n'));
console.log('PASS electricity menus, readings, stale settings/results, explicit building selection and one-time entry');
