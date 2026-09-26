import assert from 'node:assert/strict';
import {createNoticesUI} from './assets/garden/notices.mjs';
globalThis.document={getElementById:()=>({innerHTML:''})};
const sources=[{id:'undergrad',name:'教务部',url:'https://jwb.szu.edu.cn/index/jwtz.htm',group:'university',readable:true},{id:'college-fe',name:'教育学部',url:'https://fe.szu.edu.cn/xbzx/tzgg.htm',group:'college',readable:true},{id:'college-law',name:'法学院',url:'https://law.szu.edu.cn/xwjc/xygg.htm',group:'college',readable:true},{id:'college-csse',name:'计算机与软件学院',url:'https://csse.szu.edu.cn/',group:'college',readable:false,note:'暂未接入，请在学院官网查看。'}];
const response=id=>({source:sources.find(s=>s.id===id).name,items:[{title:id+' 公告 <script>',date:'2026-09-20',url:sources.find(s=>s.id===id).url}],fetched_at:'2026-09-20T12:00:00Z',stale:false});
let mode='normal',calls=[],pending=new Map(),count=0;
const ui=createNoticesUI({api:async path=>{calls.push(path);if(path.endsWith('/notice-sources'))return {sources};const id=new URL('http://localhost'+path).searchParams.get('source');if(mode==='defer')return new Promise(resolve=>pending.set(id,resolve));if(mode==='fail')throw Error('学校网站暂时无法读取');return response(id)}});
const choose=id=>ui.change({target:{id:'feed-source',value:id}});
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
async function check(name,f){await f();count++;console.log('PASS',name)}
await check('catalog groups university and college sources with their actual official links',async()=>{await ui.load();assert.match(ui.card(),/全校通知/);assert.match(ui.card(),/学院与学部/);assert.match(ui.card(),/计算机与软件学院 · 官网查看/)});
await check('choosing a college automatically reads its feed and escapes titles',async()=>{await choose('college-fe');assert.match(calls.at(-1),/source=college-fe/);assert.match(ui.card(),/教育学部 · 读取于/);assert.match(ui.card(),/&lt;script&gt;/);assert.match(ui.card(),/https:\/\/fe.szu.edu.cn\/xbzx\/tzgg.htm/)});
await check('unsupported college clears old notices and presents its official page without a fake read action',async()=>{const before=calls.length;await choose('college-csse');assert.equal(calls.length,before);assert.match(ui.card(),/打开学院官网/);assert.doesNotMatch(ui.card(),/教育学部 · 读取于|data-action="notice-read"/)});
await check('late response from a previous college never overwrites the selected feed',async()=>{mode='defer';await choose('college-fe');await choose('college-law');pending.get('college-law')(response('college-law'));await nextTurn();pending.get('college-fe')(response('college-fe'));await nextTurn();assert.match(ui.card(),/法学院 · 读取于/);assert.doesNotMatch(ui.card(),/教育学部 · 读取于/);mode='normal'});
await check('failed college change cannot keep a previous college feed under the new heading',async()=>{mode='fail';await choose('college-fe');assert.match(ui.card(),/学校网站暂时无法读取/);assert.doesNotMatch(ui.card(),/法学院 · 读取于/)});
await check('saved source restores on a new UI instance and changes persist',async()=>{
 let preferred='college-law';const config={api:async path=>path.endsWith('/notice-sources')?{sources}:response(preferred),getSource:()=>preferred,setSource:async value=>{preferred=value}};
 const first=createNoticesUI(config);await first.load();assert.match(first.card(),/value="college-law" selected/);
 await first.change({target:{id:'feed-source',value:'college-fe'}});assert.equal(preferred,'college-fe');
 const reopened=createNoticesUI(config);await reopened.load();assert.match(reopened.card(),/value="college-fe" selected/);
 preferred='removed-college';const removed=createNoticesUI(config);await removed.load();assert.match(removed.card(),/value="undergrad" selected/);
});
await check('preference write failure stays visible while the selected feed remains usable',async()=>{
 const failed=createNoticesUI({api:async path=>path.endsWith('/notice-sources')?{sources}:response('college-law'),setSource:async()=>{throw Error('save failed')}});await failed.load();await failed.change({target:{id:'feed-source',value:'college-law'}});assert.match(failed.card(),/学院选择未能保存/);assert.match(failed.card(),/法学院 · 读取于/);
});
await check('source changes await preference saving but release the caller before the school responds',async()=>{
 let saveFinished,feedFinished,returned=false,savedSource='undergrad';
 const isolated=createNoticesUI({api:path=>path.endsWith('/notice-sources')?Promise.resolve({sources}):new Promise(resolve=>{feedFinished=resolve}),setSource:value=>new Promise(resolve=>{saveFinished=()=>{savedSource=value;resolve()}})});
 await isolated.load();
 const change=isolated.change({target:{id:'feed-source',value:'college-law'}}).then(value=>{returned=true;return value});
 await nextTurn();
 assert.equal(returned,false,'the local preference write must remain awaited');
 assert.equal(feedFinished,undefined,'school reading starts only after saving the choice');
 saveFinished();await nextTurn();
 assert.equal(savedSource,'college-law');
 assert.equal(returned,true,'an unresolved school request must not retain the global write lock');
 assert.equal(await change,true);
 assert.equal(typeof feedFinished,'function');
 assert.match(isolated.card(),/正在读取法学院的公开公告/);
 feedFinished(response('college-law'));await nextTurn();
 assert.match(isolated.card(),/法学院 · 读取于/);
});
console.log(`${count} notice checks passed`);
