import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {networkSummaryHTML,networkTone,networkLoginHint,autoLoginHTML} from './assets/garden/network-status.mjs';
import {createApi} from './assets/garden/api-client.mjs';
import {createWorkspaceCommit} from './assets/garden/workspace-commit.mjs';
import {shouldPollNetwork,stampVersion} from './assets/garden/app-logic.mjs';

const connected={internet_ok:true,zone_label:'当前已联网',online_known:true,online:true,app_version:'beta9.9.9'};
assert.match(networkSummaryHTML(connected),/出口已在线/);
assert.match(networkSummaryHTML({...connected,online:false}),/未检测到在线会话/);
assert.match(networkSummaryHTML({...connected,online_known:false,online_error:'查询失败'}),/暂未查明：查询失败/);
assert.doesNotMatch(networkSummaryHTML({...connected,online_known:false}),/未检测到在线会话/);
console.log('PASS network reachability, authentication and unknown status remain distinct');

const app=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const refreshAt=app.indexOf('async function refresh(){'),refreshEnd=app.indexOf('\nlet networkCheckedAt=0;',refreshAt);
assert.ok(refreshAt>=0&&refreshEnd>refreshAt,'找不到 refresh()');
const refresh=app.slice(refreshAt,refreshEnd);
// 刷新逻辑写入的每个节点都必须真的出现在页面或模板里，不能再对着已删除的节点空转。
const declared=new Set([...(html+app).matchAll(/id="([\w-]+)"/g)].map(match=>match[1]));
const written=[...refresh.matchAll(/\$\('#([\w-]+)'\)/g)].map(match=>match[1]);
assert.ok(written.length>=2);
for(const id of written)assert.ok(declared.has(id),`refresh() 写入的 #${id} 不在 index.html 或页面模板里`);
assert.doesNotMatch(app,/network-badge|networkBadgeHTML/,'已删除的网络徽章不能再留死分支');
const meta={content:''};
const nodes={'#network-summary':{innerHTML:''},'#auto-login-result':{innerHTML:''},'#app-badge':{textContent:'非官方应用'},'#about-version':{textContent:''},'.network-login > summary small':{textContent:''}};
const pick=s=>{assert.ok(Object.hasOwn(nodes,s),'unexpected selector '+s);return nodes[s]};
// 版本写到页面上的逻辑在 app-logic.mjs；这里接上与 app.mjs 相同的 getVersion/setVersion。
const stampDocument={querySelector:s=>s==='meta[name=app-version]'?meta:pick(s),getElementById:()=>null};
const ctx=vm.createContext({networkSummaryHTML,networkLoginHint,autoLoginHTML,$:pick,appVersion:'',networkCheckedAt:0,api:async()=>connected,Date});
ctx.stampVersion=v=>stampVersion(v,{getVersion:()=>ctx.appVersion,setVersion:next=>{ctx.appVersion=next},document:stampDocument,cards:[]});
vm.runInContext('let net=null,saved=false,probing=false;'+refresh,ctx);
assert.equal(await vm.runInContext('refresh()',ctx),true);
assert.equal(meta.content,'beta9.9.9');
assert.equal(nodes['#app-badge'].textContent,'beta9.9.9 · 非官方应用');
assert.equal(nodes['#about-version'].textContent,'szuDesktop beta9.9.9 · 荔枝庭院');
assert.equal(vm.runInContext('appVersion',ctx),'beta9.9.9');
assert.match(nodes['#network-summary'].innerHTML,/出口已在线/);
assert.match(nodes['#network-summary'].innerHTML,/data-tone="success"/);
assert.equal(nodes['#auto-login-result'].innerHTML,'','没有尝试自动登录时不显示结果');
assert.match(nodes['.network-login > summary small'].textContent,/当前外网可用/);
ctx.api=async()=>({...connected,internet_ok:false});
await vm.runInContext('refresh()',ctx);
assert.match(nodes['.network-login > summary small'].textContent,/填写账号/);
assert.doesNotMatch(nodes['.network-login > summary small'].textContent,/外网可用/);
ctx.api=async()=>({internet_ok:true,zone_label:'当前已联网',online_known:true,online:true});
assert.equal(await vm.runInContext('refresh()',ctx),true);
assert.equal(nodes['#app-badge'].textContent,'beta9.9.9 · 非官方应用');
assert.equal(meta.content,'beta9.9.9');
console.log('PASS a status without app_version never blanks the displayed version');
ctx.api=async()=>({...connected,auto_login:{result:'failed',message:'<b>认证失败</b>：密码错误',at:1790000000}});
await vm.runInContext('refresh()',ctx);
assert.match(nodes['#auto-login-result'].innerHTML,/data-tone="warning"/);assert.match(nodes['#auto-login-result'].innerHTML,/启动时自动连接未成功/);
assert.match(nodes['#auto-login-result'].innerHTML,/&lt;b&gt;认证失败&lt;\/b&gt;：密码错误/);assert.doesNotMatch(nodes['#auto-login-result'].innerHTML,/<b>/);
ctx.api=async()=>{throw Error('服务已退出')};
assert.equal(await vm.runInContext('refresh()',ctx),false);
assert.match(nodes['#network-summary'].innerHTML,/服务已退出/);
assert.match(nodes['#network-summary'].innerHTML,/状态未确认/);
assert.match(nodes['#network-summary'].innerHTML,/data-tone="muted"/);
assert.doesNotMatch(nodes['#network-summary'].innerHTML,/data-tone="success"/);
assert.equal(nodes['#auto-login-result'].innerHTML,'','状态读取失败时不保留旧的启动结果');
assert.equal(vm.runInContext('net',ctx),null);
assert.match(nodes['.network-login > summary small'].textContent,/状态待确认/);
let click,work,message;
const pendingCtx=vm.createContext({busy:false,probing:true,officialUI:{click:async()=>false},schoolUI:{click:async()=>false},campusUI:{click:async()=>false},pianoUI:{click:async()=>false},document:{addEventListener:(_,handler)=>{click=handler}},run:fn=>{work=fn()},toast:t=>{message=t},refresh:()=>{throw Error('duplicate refresh')}});
vm.runInContext(app.slice(app.indexOf("document.addEventListener('click'"),app.indexOf("document.addEventListener('submit'")),pendingCtx);
click({target:{closest:()=>({dataset:{action:'refresh'}})},preventDefault:()=>{}});
await work;
assert.match(message,/正在刷新/);
assert.doesNotMatch(message,/失败|已刷新/);
console.log('PASS failed refresh clears previous online state and reports failure');

const authenticate=app.slice(app.indexOf('async function authenticate('),app.indexOf('\nasync function run('));
let refreshed=0;
const authCtx=vm.createContext({credentialInput:()=>({data:{username:'test',password:'test'},remember:false}),networkResult:()=>{},api:async()=>({ok:false,message:'当前出口已有会话'}),refresh:async()=>{refreshed++}});
vm.runInContext(authenticate,authCtx);
await vm.runInContext('authenticate()',authCtx);
assert.equal(refreshed,1);
console.log('PASS a login that did not verify credentials still refreshes outlet status');
const mixed=networkSummaryHTML({...connected,online_known:false,online_error:'<img src=x>'});
assert.match(mixed,/data-tone="success"/);assert.match(mixed,/data-tone="warning"/);
assert.match(mixed,/&lt;img src=x&gt;/);assert.doesNotMatch(mixed,/<img src=x>/);
assert.equal(networkTone({...connected,internet_ok:false}),'error');
const split=networkSummaryHTML({...connected,internet_ok:false});
assert.match(split,/data-tone="error"/);assert.match(split,/data-tone="success"/);
console.log('PASS independent colored states and escaped school error text');
const attemptAt=1790000000,attemptTime=new Date(attemptAt*1000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
assert.equal(autoLoginHTML(null),'');assert.equal(autoLoginHTML(connected),'');assert.equal(autoLoginHTML({auto_login:{result:'unknown'}}),'');
const autoOk=autoLoginHTML({auto_login:{result:'ok',message:'认证成功',at:attemptAt}});
assert.match(autoOk,/data-tone="success"/);assert.match(autoOk,/启动时已自动连接校园网/);assert.ok(autoOk.includes(attemptTime));
const autoSkipped=autoLoginHTML({auto_login:{result:'skipped',message:'本机已在线',at:attemptAt}});
assert.match(autoSkipped,/data-tone="muted"/);assert.match(autoSkipped,/未重复认证/);
const autoFailed=autoLoginHTML({auto_login:{result:'failed',message:'',at:0}});
assert.match(autoFailed,/data-tone="warning"/);assert.match(autoFailed,/重新登录/);
assert.match(app,/id="auto-login-result" class="auto-login-result">\$\{autoLoginHTML\(net\)\}/,'网络页必须显示启动时自动连接的结果');
console.log('PASS startup auto-connect results appear on the network page with escaped details');

// 轮询条件是 app-logic.mjs 的 shouldPollNetwork；这里照 app.mjs 的 pollNetwork 接线：真的探测时记下时间（refresh() 开头就是这样做的）。
assert.match(app,/function pollNetwork\(force=false,anyPage=false\)\{if\(shouldPollNetwork\(\{exiting,hidden:document\.hidden,page,force,anyPage,now:Date\.now\(\),checkedAt:networkCheckedAt\}\)\)void refresh\(\)\}/,'pollNetwork 必须把当前状态交给 shouldPollNetwork');
assert.match(refresh,/^async function refresh\(\)\{if\(probing\)return false;probing=true;networkCheckedAt=Date\.now\(\);/,'每次探测都先记下时间，轮询才不会重复探测');
let pollNow=1_000_000,refreshes=0;
const pollCtx={exiting:false,page:'home',document:{hidden:false},checkedAt:0,
 pollNetwork(force=false,anyPage=false){if(shouldPollNetwork({exiting:this.exiting,hidden:this.document.hidden,page:this.page,force,anyPage,now:pollNow,checkedAt:this.checkedAt})){refreshes++;this.checkedAt=pollNow}}};
pollCtx.pollNetwork();assert.equal(refreshes,1,'首页可见时立即探测一次');
pollNow+=10000;pollCtx.pollNetwork();assert.equal(refreshes,1,'刚探测过的状态不重复探测');
pollCtx.pollNetwork(true);assert.equal(refreshes,2,'回到可见时立即补一次');
pollNow+=30000;pollCtx.document.hidden=true;pollCtx.pollNetwork();pollCtx.pollNetwork(true);assert.equal(refreshes,2,'主窗口隐藏到托盘时不探测');
pollCtx.document.hidden=false;
for(const page of ['study','settings','services','garden']){pollCtx.page=page;pollCtx.pollNetwork(true)}
assert.equal(refreshes,2,'没有网络状态区域的页面不探测');
pollCtx.page='network';pollCtx.pollNetwork();assert.equal(refreshes,3);
pollCtx.page='study';pollNow+=5000;pollCtx.pollNetwork(true,true);assert.equal(refreshes,4,'窗口回到可见时不论在哪一页都立即补一次');
pollCtx.document.hidden=true;pollCtx.pollNetwork(true,true);assert.equal(refreshes,4,'窗口仍隐藏时不补');pollCtx.document.hidden=false;
pollCtx.exiting=true;pollNow+=60000;pollCtx.pollNetwork(true);pollCtx.pollNetwork(true,true);assert.equal(refreshes,4,'退出后不再探测');
// 接线：真实地执行应用末尾的事件注册与定时器，而不是只匹配源码字样。
const wiring=app.slice(app.indexOf("document.addEventListener('visibilitychange'"),app.indexOf('try{let snapshot=null;'));
const events={},timers=[],calls=[];
const wiringCtx=vm.createContext({document:{hidden:false,addEventListener:(type,fn)=>{events[type]=fn}},exiting:false,state:{},
 clocks:()=>calls.push('clocks'),pollNetwork:(...args)=>calls.push('poll:'+args.join(',')),flushPuzzle:async()=>{calls.push('flush')},academicUI:{load:()=>calls.push('calendar')},
 setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length}});
vm.runInContext(wiring,wiringCtx);
assert.deepEqual(timers.map(t=>t.ms).sort((a,b)=>a-b),[1000,30000,3600000]);
timers.find(t=>t.ms===30000).fn();assert.deepEqual(calls,['poll:'],'30 秒定时器走按页面过滤的 pollNetwork，不直接探测');
calls.length=0;wiringCtx.document.hidden=true;events.visibilitychange();assert.deepEqual(calls,['flush'],'隐藏时只存好棋局，不探测');
calls.length=0;wiringCtx.document.hidden=false;events.visibilitychange();assert.deepEqual(calls,['clocks','poll:true,true'],'回到可见时立即刷新一次网络状态');
assert.doesNotMatch(app,/setInterval\(refresh,/);
console.log('PASS status polling runs only while a visible page shows network state');

// api() 在 api-client.mjs 里：fetch、提示和计时器都注入替身。
assert.match(app,/const api=createApi\(\{toast\}\);/,'页面必须通过 createApi 取得 api()');
const apiToasts=[];let reply;
const apiCtx={fetch:async()=>reply()};
apiCtx.api=createApi({fetch:(...args)=>apiCtx.fetch(...args),toast:message=>apiToasts.push(message),setTimeout:()=>0});
reply=()=>new Response('写入凭据失败: Access is denied\n',{status:500,headers:{'Content-Type':'text/plain'}});
await assert.rejects(apiCtx.api('/api/credential',{username:'x',password:'y'}),error=>{assert.equal(error.message,'服务响应异常（HTTP 500）：写入凭据失败: Access is denied');assert.equal(error.code,500);return true});
reply=()=>new Response('<html><body><h1>502 Bad Gateway</h1></body></html>',{status:502});
await assert.rejects(apiCtx.api('/api/status'),error=>error.message==='服务响应异常（HTTP 502）：502 Bad Gateway');
reply=()=>new Response('x'.repeat(400),{status:403});
await assert.rejects(apiCtx.api('/api/status'),error=>error.message==='服务响应异常（HTTP 403）：'+'x'.repeat(120));
reply=()=>new Response('',{status:500});
await assert.rejects(apiCtx.api('/api/status'),error=>error.message==='服务响应异常（HTTP 500）');
reply=()=>new Response(JSON.stringify({message:'笔记不能超过 8 MiB'}),{status:413});
await assert.rejects(apiCtx.api('/api/notebook',{},'PUT'),error=>error.message==='笔记不能超过 8 MiB'&&error.code===413);
reply=()=>new Response(JSON.stringify({ok:true}),{status:200});
assert.equal(JSON.stringify(await apiCtx.api('/api/status')),'{"ok":true}');assert.deepEqual(apiToasts,[]);
reply=()=>new Response(JSON.stringify({revision:2,data:{}}),{status:200,headers:{'X-SZU-Recovered':'backup'}});
await apiCtx.api('/api/workspace');assert.equal(apiToasts.at(-1),'存档文件损坏，已恢复到上一次成功保存的版本');
await apiCtx.api('/api/notebook');assert.equal(apiToasts.at(-1),'存档文件损坏，已恢复到上一次成功保存的版本；笔记文件损坏，已恢复到上一次成功保存的版本');
await apiCtx.api('/api/status');assert.equal(apiToasts.length,2,'只有存档和笔记接口会提示恢复');
console.log('PASS non-JSON service errors keep their status and text; backup recovery is announced');

// 已经序列化好的请求体（字符串）原样发送，对象照旧序列化；带恢复头的结果和错误都标上 recovered。
const requests=[],recoveredHeader={'X-SZU-Recovered':'backup'};apiCtx.fetch=async(_path,init)=>{requests.push(init);return reply()};
reply=()=>new Response(JSON.stringify({revision:3}),{status:200});
const serialized='{"version":1,"revision":2,"data":{"notes":[]}}';
await apiCtx.api('/api/notebook',serialized,'PUT');assert.equal(requests.at(-1).body,serialized,'已经序列化的笔记原样发送，不再包一层');assert.equal(requests.at(-1).method,'PUT');assert.equal(requests.at(-1).headers['Content-Type'],'application/json');
await apiCtx.api('/api/workspace',{version:1,revision:2,data:{a:1}});assert.equal(requests.at(-1).body,'{"version":1,"revision":2,"data":{"a":1}}');assert.equal(requests.at(-1).method,'POST');
assert.equal((await apiCtx.api('/api/workspace')).recovered,undefined);
reply=()=>new Response(JSON.stringify({version:1,revision:2,data:{}}),{status:200,headers:recoveredHeader});
const marked=await apiCtx.api('/api/workspace');assert.equal(marked.recovered,true);assert.equal(JSON.stringify(marked),'{"version":1,"revision":2,"data":{}}','恢复标记不可枚举，不会随存档写回');
reply=()=>new Response(JSON.stringify({ok:false,message:'笔记文件损坏，已恢复到上一次成功保存的版本'}),{status:409,headers:recoveredHeader});
await assert.rejects(apiCtx.api('/api/notebook',serialized,'PUT'),error=>error.code===409&&error.recovered===true);
reply=()=>new Response(JSON.stringify({ok:false,message:'另一个窗口更新了笔记'}),{status:409});
await assert.rejects(apiCtx.api('/api/notebook',serialized,'PUT'),error=>error.code===409&&!error.recovered);
// commit 遇到 409：409 本身或冲突后重读的响应带恢复头时，要说存档已从备份恢复，而不是“另一个窗口有新记录”。
// commit() 在 workspace-commit.mjs；页面把 state、revision 和读档失败状态交给它读写。
assert.match(app,/\nconst commit=createWorkspaceCommit\(\{api,normalize,read:\(\)=>\(\{failure:workspaceFailure,revision\}\),setRevision:next=>\{revision=next\},setState:next=>\{state=next\},paint:\(\)=>render\(\),byId:id=>document\.getElementById\(id\)\}\);\n/,'页面的 commit() 必须来自 createWorkspaceCommit');
function commitFixture(replies,forms={}){
 const toasts=[],paints=[],ctx={revision:4,state:{before:true},workspaceFailure:null};
 ctx.commit=createWorkspaceCommit({api:createApi({fetch:async()=>replies.shift()(),toast:message=>toasts.push(message),setTimeout:()=>0}),normalize:data=>data,
  read:()=>({failure:ctx.workspaceFailure,revision:ctx.revision}),setRevision:next=>{ctx.revision=next},setState:next=>{ctx.state=next},paint:()=>paints.push('render'),byId:id=>forms[id]||null});
 return {ctx,toasts,paints};
}
const conflictReply=(headers={})=>()=>new Response(JSON.stringify({ok:false,message:'存档文件损坏，已恢复到上一次成功保存的版本，请重新加载后继续',revision:3}),{status:409,headers});
const latestReply=(headers={})=>()=>new Response(JSON.stringify({version:1,revision:3,data:{restored:true}}),{status:200,headers});
for(const [name,replies] of [['409 带恢复头',[conflictReply(recoveredHeader),latestReply(recoveredHeader)]],['只有重读带恢复头',[conflictReply(),latestReply(recoveredHeader)]]]){
 const f=commitFixture(replies);
 await assert.rejects(f.ctx.commit({next:true}),error=>{assert.equal(error.message,'存档文件损坏，已恢复到上一次成功保存的版本。本次操作尚未保存，请再试一次。',name);return true});
 assert.equal(f.ctx.revision,3,name);assert.equal(JSON.stringify(f.ctx.state),'{"restored":true}',name);assert.deepEqual(f.paints,['render'],name);
 assert.deepEqual(f.toasts,['存档文件损坏，已恢复到上一次成功保存的版本'],name+'：恢复提示只出现一次');
}
const plain=commitFixture([conflictReply(),latestReply()]);
await assert.rejects(plain.ctx.commit({next:true}),error=>{assert.equal(error.message,'另一个窗口有新记录，已同步。本次操作尚未保存，请再试一次。');return true});
assert.deepEqual(plain.toasts,[]);assert.equal(plain.ctx.revision,3);
// 冲突后把草稿填回表单；读档失败的降级状态下一律不写。
const todo={value:''},done={type:'checkbox',checked:false},form={elements:{namedItem:name=>({todo,done})[name]||null}};
const withDraft=commitFixture([conflictReply(),latestReply()],{'todo-form':form});
await assert.rejects(withDraft.ctx.commit({next:true},{formId:'todo-form',values:{todo:'还没提交的小事',done:1,missing:'x'}}),/另一个窗口有新记录/);
assert.equal(todo.value,'还没提交的小事');assert.equal(done.checked,true);
const blocked=commitFixture([]);blocked.ctx.workspaceFailure={message:'存档时间异常',raw:null};
await assert.rejects(blocked.ctx.commit({next:true}),/庭院存档暂时打不开/);assert.equal(blocked.ctx.revision,4);assert.deepEqual(blocked.paints,[]);
const saved=commitFixture([()=>new Response(JSON.stringify({revision:5}),{status:200})]),next={next:true},painted=[];
await saved.ctx.commit(next,undefined,()=>painted.push('custom'));assert.equal(saved.ctx.revision,5);assert.equal(saved.ctx.state,next);assert.deepEqual(painted,['custom']);assert.deepEqual(saved.paints,[]);
console.log('PASS pre-serialized bodies go out as-is; a conflict caused by a backup recovery is reported as one');
console.log('9 network UI checks passed');
