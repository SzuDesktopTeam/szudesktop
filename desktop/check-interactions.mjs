import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDesktopOptions} from './assets/garden/desktop-options.mjs';
import {todoView} from './assets/garden/productivity.mjs';
import {createReleaseUI} from './assets/garden/release-ui.mjs';
import {createFeedbackUI} from './assets/garden/feedback.mjs';
import {readRoute,routeHash} from './assets/garden/routes.mjs';
import {act,createState} from './assets/garden/engine.mjs';
import {focusKey,restoreFocus,refreshDraft} from './assets/garden/shell-repaint.mjs';
import {exitHint,stampVersion,createConfirm} from './assets/garden/app-logic.mjs';
import {createWorkspaceCommit} from './assets/garden/workspace-commit.mjs';
const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function run('),end=source.indexOf("document.addEventListener('submit'",start);
assert.ok(start>=0&&end>start);
// commit() 来自 workspace-commit.mjs；按 app.mjs 的接线绑到 vm 上下文里的 state、revision 与 workspaceFailure。
function bindCommit(context){if(!('workspaceFailure' in context))context.workspaceFailure=null;context.commit=createWorkspaceCommit({api:(...args)=>context.api(...args),normalize:data=>context.normalize(data),read:()=>({failure:context.workspaceFailure,revision:context.revision}),setRevision:next=>{context.revision=next},setState:next=>{context.state=next},paint:()=>context.render(),byId:id=>context.document.getElementById(id)});return context}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture(){
 const calls=[],toasts=[],jobs=new Map(),controls=[{disabled:false,isConnected:true}];let click;
 const context=vm.createContext({
  busy:false,page:'services',state:null,notebookUI:{leave:async()=>{}},
  document:{querySelectorAll:()=>controls,addEventListener:(_,fn)=>{click=fn}},
  schoolUI:{click:async()=>false,sync:()=>{}},
  officialUI:{click:async()=>false},
  campusUI:{click:async action=>{calls.push(action);if(jobs.has(action))await jobs.get(action).promise;return true}},
  pianoUI:{click:async()=>false},
  academicUI:{load:async()=>{}},toast:message=>toasts.push(message),clocks:()=>{},
  navigate:p=>{context.page=p},networkResult:()=>{},focusKey,restoreFocus,
 });
 vm.runInContext(source.slice(start,end),context);
 return {context,calls,toasts,controls,jobs,click(action,extra={}){click({target:{closest:()=>({dataset:{action,...extra}})},preventDefault(){}})}};
}
let count=0;async function check(name,fn){await fn();count++;console.log('PASS',name)}
function noteNavigationFixture(){
 const toasts=[],events=[],history=[],polls=[],draft={value:'尚未落盘的课堂问题',selectionStart:2,selectionEnd:7};
 const notebook={draft},main={focus(){events.push('focus-main')}},gate={};
 gate.promise=new Promise((resolve,reject)=>{gate.resolve=()=>{gate.saved=true;resolve()};gate.reject=reject});
 const location={hash:'#study/notes'},methods=[];
 const writeHistory=method=>(_state,_unused,hash)=>{history.push(hash);methods.push(method);location.hash=hash};
 const context=vm.createContext({state:{},busy:false,page:'study',studyTab:'notes',serviceTab:'spaces',gardenTab:'pet',settingsTab:'appearance',readRoute,routeHash,location,pages:{home:'今日',study:'学习',garden:'庭院',services:'服务',settings:'设置'},
  document:{activeElement:draft,querySelector:selector=>selector==='[data-notebook]'?notebook:null},
  notebookUI:{leave:()=>{events.push('leave');return gate.promise}},
  history:{replaceState:writeHistory('replace'),pushState:writeHistory('push')},window:{scrollTo(){events.push('scroll')}},
  render(){assert.equal(gate.saved,true,'render must not run before the notebook save resolves');events.push('render')},
  $:selector=>{assert.equal(selector,'#main');return main},toast:message=>toasts.push(message),pollNetwork(){polls.push(context.page)},
 });
 const at=source.indexOf('let navigating=false;'),to=source.indexOf('let notifiedFocus=',at);
 assert.ok(at>=0&&to>at);vm.runInContext(source.slice(at,to),context);
 return {context,toasts,events,history,methods,draft,gate,polls};
}
await check('all room links survive refresh, accept older page links and reject unknown sections',()=>{
 for(const [page,tabs] of Object.entries({study:['notes','focus','timetable','grades'],services:['spaces','notices','directory','piano'],garden:['pet','farm','market','arcade','journal'],settings:['appearance','desktop','data','about']})){
  assert.deepEqual(readRoute('#'+page),{page,tab:tabs[0]});
  for(const tab of tabs)assert.deepEqual(readRoute(routeHash({page,tab})),{page,tab});
  assert.deepEqual(readRoute('#'+page+'/missing'),{page,tab:tabs[0]});
 }
 assert.deepEqual(readRoute('#unknown'),{page:'home',tab:undefined});
 assert.equal(routeHash({page:'home'}),'#home');
});
await check('leaving course notes waits for the real navigation save gate before changing page or history',async()=>{
 const f=noteNavigationFixture(),pending=f.context.navigate('home');
 await tick();assert.equal(f.context.page,'study');assert.equal(f.context.studyTab,'notes');assert.deepEqual(f.history,[]);assert.deepEqual(f.events,['leave']);
 assert.equal(await f.context.navigate('garden'),false,'a second click must not bypass the pending save');
 assert.match(f.toasts.at(-1),/正在保存笔记并切换页面/,'重复导航需解释等待原因');
 assert.equal(f.draft.value,'尚未落盘的课堂问题');assert.equal(f.context.document.activeElement,f.draft);
 f.gate.resolve();assert.equal(await pending,true);assert.equal(f.context.page,'home');assert.deepEqual(f.history,['#home']);assert.deepEqual(f.events,['leave','render','scroll','focus-main']);
 assert.deepEqual(f.polls,['home'],'切到新页面后按页面补一次网络状态；失败或被拦下的导航不探测');
});
await check('failed note saves keep the original page, subtab and local draft, then allow a retry',async()=>{
 const f=noteNavigationFixture(),pending=f.context.navigate('study','focus');
 f.gate.reject(Error('笔记保存失败，请保留草稿'));assert.equal(await pending,false);
 assert.equal(f.context.page,'study');assert.equal(f.context.studyTab,'notes');assert.deepEqual(f.history,[]);assert.deepEqual(f.events,['leave']);
 assert.equal(f.draft.value,'尚未落盘的课堂问题');assert.deepEqual([f.draft.selectionStart,f.draft.selectionEnd],[2,7]);assert.equal(f.context.document.activeElement,f.draft);assert.deepEqual(f.toasts,['笔记保存失败，请保留草稿']);
 f.context.notebookUI.leave=async()=>{f.gate.saved=true;f.events.push('leave-retry')};
 assert.equal(await f.context.navigate('study','focus'),true);assert.equal(f.context.studyTab,'focus');assert.deepEqual(f.history,['#study/focus']);
});
await check('switching from notes to another study tool also waits before replacing the editor',async()=>{
 const f=noteNavigationFixture(),pending=f.context.navigate('study','grades');
 assert.equal(f.context.studyTab,'notes');assert.equal(f.events.includes('render'),false);
 f.gate.resolve();assert.equal(await pending,true);assert.equal(f.context.page,'study');assert.equal(f.context.studyTab,'grades');assert.equal(f.events.filter(x=>x==='render').length,1);
});
await check('room section changes record history, return to the top and focus the new content',async()=>{
 const f=noteNavigationFixture();f.gate.resolve();f.context.document.querySelector=()=>null;
 for(const [page,tab] of [['services','notices'],['services','directory'],['garden','farm'],['garden','market'],['settings','data']]){
  assert.equal(await f.context.navigate(page,tab),true);
  assert.equal(f.context.location.hash,'#'+page+'/'+tab);
  assert.deepEqual(f.events.slice(-3),['render','scroll','focus-main']);
 }
 assert.deepEqual(f.methods,['push','push','push','push','push']);
 assert.equal(f.context.settingsTab,'data');
 await f.context.navigate('settings','data');assert.equal(f.methods.at(-1),'replace','clicking the current section must not duplicate browser history');
});
await check('back navigation uses the same notebook save gate and restores the address on failure',async()=>{
 const f=noteNavigationFixture();f.context.location.hash='#garden/farm';
 const pending=f.context.followHashRoute();await tick();
 assert.equal(f.context.page,'study');assert.equal(f.context.studyTab,'notes');assert.deepEqual(f.events,['leave']);
 f.gate.reject(Error('请保留笔记草稿'));await pending;
 assert.equal(f.context.page,'study');assert.equal(f.context.gardenTab,'pet');assert.equal(f.context.location.hash,'#study/notes');
 assert.equal(f.draft.value,'尚未落盘的课堂问题');assert.deepEqual(f.methods,['replace']);
 f.context.notebookUI.leave=async()=>{f.gate.saved=true};f.context.location.hash='#garden/farm';
 await f.context.followHashRoute();assert.equal(f.context.page,'garden');assert.equal(f.context.gardenTab,'farm');assert.equal(f.context.location.hash,'#garden/farm');
 assert.deepEqual(f.methods,['replace','replace'],'following back/forward must not push another entry');
});
await check('a busy write cannot be bypassed by changing the address hash',async()=>{
 const f=noteNavigationFixture();f.context.busy=true;f.context.location.hash='#settings/data';
 await f.context.followHashRoute();assert.equal(f.context.page,'study');assert.equal(f.context.location.hash,'#study/notes');assert.deepEqual(f.events,[]);assert.match(f.toasts.at(-1),/正在保存/);
});
await check('skip to main keeps native anchor focus and scroll without leaving the current room',async()=>{
 const index=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(index,/href="#main"[^>]*>跳到正文/);
 for(const busy of [false,true]){
  const f=noteNavigationFixture(),main={id:'main',scrollTop:137};
  f.context.busy=busy;f.context.document.activeElement=main;f.context.location.hash='#main';
  await f.context.followHashRoute();
  assert.equal(f.context.page,'study');assert.equal(f.context.studyTab,'notes');assert.equal(f.context.location.hash,'#study/notes');
  assert.equal(f.context.document.activeElement,main);assert.equal(main.scrollTop,137);
  assert.deepEqual(f.events,[],'skip link must not save notes, repaint or override the native scroll');
  assert.deepEqual(f.toasts,[]);assert.deepEqual(f.methods,['replace']);
 }
});
await check('all section buttons use navigation instead of replacing the page directly',()=>{
 const f=fixture(),routes=[];f.context.navigate=(page,tab)=>routes.push([page,tab]);f.context.render=()=>assert.fail('sections must use the shared navigation gate');
 for(const [action,page,tab] of [['studyTab','study','grades'],['serviceTab','services','notices'],['gardenTab','garden','farm'],['settingsTab','settings','about']]){
  f.click(action,{tab});assert.deepEqual(routes.at(-1),[page,tab]);
 }
});
await check('continue latest note waits for selection and save before navigating to notes',async()=>{
 const f=fixture(),pending=deferred(),events=[];f.context.page='home';
 f.context.notebookUI.resumeLatest=async()=>{events.push('resume');await pending.promise;events.push('ready')};
 f.context.navigate=async(page,tab)=>{events.push('navigate');assert.equal(page,'study');assert.equal(tab,'notes');f.context.page=page};
 f.click('notebookResume');await tick();
 assert.deepEqual(events,['resume']);assert.equal(f.context.page,'home');assert.equal(f.context.busy,true);assert.equal(f.controls[0].disabled,true);
 pending.resolve();await tick();
 assert.deepEqual(events,['resume','ready','navigate']);assert.equal(f.context.page,'study');assert.equal(f.context.busy,false);assert.equal(f.controls[0].disabled,false);
});
await check('continue latest note reports load or save errors without leaving the original page',async()=>{
 const f=fixture();f.context.page='home';let navigations=0;
 f.context.notebookUI.resumeLatest=async()=>{throw Error('笔记暂时无法保存，请保留草稿')};
 f.context.navigate=()=>{navigations++};f.click('notebookResume');await tick();
 assert.equal(navigations,0);assert.equal(f.context.page,'home');assert.deepEqual(f.toasts,['笔记暂时无法保存，请保留草稿']);
 assert.equal(f.context.busy,false);assert.equal(f.controls[0].disabled,false);
});
await check('settings notebook backup waits for the export and stays on settings',async()=>{
 const f=fixture(),pending=deferred();let backups=0,navigations=0;f.context.page='settings';
 f.context.campusUI.click=async()=>false;
 f.context.notebookUI.backup=async()=>{backups++;await pending.promise};f.context.navigate=()=>{navigations++};
 f.click('notebookBackup');await tick();
 assert.equal(backups,1);assert.equal(navigations,0);assert.equal(f.context.page,'settings');assert.equal(f.context.busy,true);
 pending.resolve();await tick();assert.equal(f.context.busy,false);assert.equal(f.controls[0].disabled,false);assert.equal(navigations,0);assert.deepEqual(f.toasts,[]);
});
await check('settings notebook backup exposes export errors and leaves settings available',async()=>{
 const f=fixture();let navigations=0;f.context.page='settings';f.context.campusUI.click=async()=>false;
 f.context.notebookUI.backup=async()=>{throw Error('笔记本还未读取，暂时无法导出')};f.context.navigate=()=>{navigations++};
 f.click('notebookBackup');await tick();
 assert.equal(navigations,0);assert.equal(f.context.page,'settings');assert.deepEqual(f.toasts,['笔记本还未读取，暂时无法导出']);
 assert.equal(f.context.busy,false);assert.equal(f.controls[0].disabled,false);
});
await check('a pending public venue query allows navigation and a separate write',async()=>{
 const f=fixture(),pending=deferred();f.jobs.set('booking-rooms',pending);
 f.click('booking-rooms');await tick();
 f.click('navigate',{page:'garden'});
 assert.equal(f.context.page,'garden','场地请求等待期间必须允许切页');
 assert.equal(f.controls[0].disabled,false,'公共查询不应禁用其他卡片');
 f.click('campus-reminder-delete');await tick();
 assert.ok(f.calls.includes('campus-reminder-delete'),'只读请求不占用存档写锁');
 pending.resolve();await tick();
});
await check('write actions still serialize and public action names cannot bypass that lock',async()=>{
 const f=fixture(),pending=deferred();f.jobs.set('campus-session-save',pending);
 f.click('campus-session-save');await tick();
 f.click('campus-session-clear');f.click('booking-rooms');f.click('navigate',{page:'home'});await tick();
 assert.deepEqual(f.calls,['campus-session-save']);assert.equal(f.context.page,'services');
 assert.equal(f.toasts.length,3,'被写锁阻止的按钮和导航都应显示反馈');
 assert.ok(f.toasts.every(message=>message.includes('正在保存或处理上一项操作')));
 assert.equal(f.context.busy,true);pending.resolve();await tick();assert.equal(f.context.busy,false);
});
await check('remembering a notice source is serialized as a preference write',async()=>{
 const f=fixture(),pending=deferred();let change;const changed=[];
 f.context.document.addEventListener=(name,handler)=>{assert.equal(name,'change');change=handler;};
 f.context.campusUI.change=async event=>{changed.push(event.target.value);await pending.promise;};
 const at=source.indexOf("document.addEventListener('change'"),to=source.indexOf('let exiting=',at);
 assert.ok(at>=0&&to>at);vm.runInContext(source.slice(at,to),f.context);
 f.context.busy=true;change({target:{id:'feed-source',value:'college-math',dataset:{}}});await tick();
 assert.deepEqual(changed,[],'已有写操作时，来源偏好不能绕过存档锁');
 f.context.busy=false;change({target:{id:'feed-source',value:'college-cmse',dataset:{}}});await tick();
 assert.equal(f.context.busy,true);assert.deepEqual(changed,['college-cmse']);
 f.click('campus-session-clear');f.click('navigate',{page:'home'});await tick();
 assert.deepEqual(f.calls,[]);assert.equal(f.context.page,'services','偏好仍在保存时不离开当前页面');
 pending.resolve();await tick();assert.equal(f.context.busy,false);assert.equal(f.controls[0].disabled,false);
});
await check('public lookup errors do not prevent the next action',async()=>{
 const f=fixture();f.context.campusUI.click=async()=>{throw Error('学校暂时无响应')};
 f.click('notice-read');await tick();assert.deepEqual(f.toasts,['学校暂时无响应']);
 f.click('navigate',{page:'home'});assert.equal(f.context.page,'home');assert.equal(f.context.busy,false);
});
await check('todo filters refresh the list while retaining adjacent form drafts and focus',()=>{
 for(const page of ['home','study']){
  const f=fixture(),panel={outerHTML:''},draft={value:'还没提交的小事',selectionStart:2,selectionEnd:5},date={value:'2026-10-02'},focusTask={value:'task-1'};
  Object.assign(f.context,{page,todoView,todoFilter:'open',state:{todos:[{id:'open',text:'待做事项',done:false,date:''},{id:'done',text:'已完成事项',done:true,date:''},{id:'archive',text:'已归档事项',done:true,archived:true,date:''}]},render(){assert.fail('筛选不能重绘整个页面')},renderPetCare(){assert.fail('筛选不能重绘旁边表单')}});
  f.context.document.querySelectorAll=selector=>selector==='.todo-state'?[panel]:f.controls;
  f.context.document.activeElement=draft;
  for(const filter of ['done','archive','open']){
   f.click('todoFilter',{filter});assert.equal(f.context.todoFilter,filter);
   assert.match(panel.outerHTML,new RegExp({done:'已完成事项',archive:'已归档事项',open:'待做事项'}[filter]));
   assert.doesNotMatch(panel.outerHTML,/<form|id="todo-text"|id="todo-date"/);
   assert.equal(f.context.document.activeElement,draft);assert.deepEqual(draft,{value:'还没提交的小事',selectionStart:2,selectionEnd:5});
   assert.equal(date.value,'2026-10-02');assert.equal(focusTask.value,'task-1');
  }
  const prior=panel.outerHTML;f.context.busy=true;f.click('todoFilter',{filter:'done'});
  assert.equal(f.context.todoFilter,'open');assert.equal(panel.outerHTML,prior,'保存中不能绕过写锁更换筛选');
 }
});
await check('a newly discovered app version refreshes only its cards and preserves their own state',async()=>{
 const previousDocument=globalThis.document,nodes={'release-panel':{outerHTML:''},'feedback-panel':{outerHTML:''}},profile={value:'尚未保存的名字'},meta={},badge={},about={};
 try{
  const document={getElementById:id=>nodes[id]||null,querySelector:selector=>({'meta[name=app-version]':meta,'#app-badge':badge,'#about-version':about}[selector]||null)};globalThis.document=document;
  const context={appVersion:''};
  context.releaseUI=createReleaseUI({getVersion:()=>context.appVersion,api:async path=>{assert.equal(path,'/api/releases?channel=stable');return {available:true,version:'v0.8.1',url:'https://github.com/SzuDesktopTeam/szudesktop/releases/tag/v0.8.1'}}});
  context.feedbackUI=createFeedbackUI({getVersion:()=>context.appVersion,getMode:()=> 'electron',toast(){},clipboard:{writeText:async()=>{throw Error('clipboard unavailable')}}});
  context.releaseUI.change({target:{id:'release-channel',value:'stable'}});await context.releaseUI.click('release-check');await context.feedbackUI.click('feedback-copy');
  // 与 app.mjs 的 stampVersion 相同的接线：版本存在 appVersion，两张设置卡片按 id 重挂。
  assert.ok(source.includes("function stampVersion(v){applyVersion(v,{getVersion:()=>appVersion,setVersion:next=>{appVersion=next},document,cards:[['release-panel',releaseUI],['feedback-panel',feedbackUI]]})}"),'stampVersion 的接线变了，同步这里');
  context.stampVersion=v=>stampVersion(v,{getVersion:()=>context.appVersion,setVersion:next=>{context.appVersion=next},document,cards:[['release-panel',context.releaseUI],['feedback-panel',context.feedbackUI]]});
  context.stampVersion('beta0.8.0');
  assert.equal(meta.content,'beta0.8.0');assert.match(badge.textContent,/beta0.8.0/);assert.match(about.textContent,/beta0.8.0/);
  assert.match(nodes['release-panel'].outerHTML,/beta0.8.0/);assert.match(nodes['release-panel'].outerHTML,/value="stable" selected/);assert.match(nodes['release-panel'].outerHTML,/发现新版本/);
  assert.match(nodes['feedback-panel'].outerHTML,/szuDesktop beta0.8.0/);assert.match(nodes['feedback-panel'].outerHTML,/手动复制/);assert.equal(profile.value,'尚未保存的名字');
  nodes['release-panel'].outerHTML='same DOM';nodes['feedback-panel'].outerHTML='same feedback DOM';context.stampVersion('beta0.8.0');
  assert.equal(nodes['release-panel'].outerHTML,'same DOM');assert.equal(nodes['feedback-panel'].outerHTML,'same feedback DOM','周期状态响应不能无谓重挂设置卡片');
  delete nodes['release-panel'];delete nodes['feedback-panel'];context.stampVersion('beta0.8.1');assert.equal(context.appVersion,'beta0.8.1','卡片不在当前页时也能记录版本');
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
const startupAt=source.lastIndexOf("try{let snapshot=null;try{snapshot=await api('/api/workspace')");
const failureHelpers=source.slice(source.indexOf('function enterWorkspaceFailure('),source.indexOf('async function recoverWorkspace('));
function startupContext(extra){
 const context=vm.createContext({normalize:x=>x,createState,stampVersion(){},notebookUI:{load:async()=>{}},campusUI:{loadSession(){},loadCas(){},loadSources(){}},schoolUI:{load(){}},pianoUI:{load(){}},academicUI:{load(){}},
  $:()=>{assert.fail('读档结果必须交给页面渲染，不能只剩一张错误卡片')},revision:0,state:null,saved:false,workspaceReady:false,workspaceFailure:null,...extra});
 vm.runInContext(failureHelpers,context);return context;
}
await check('startup retrieves the version without waiting for the campus network probe',async()=>{
 assert.ok(startupAt>=0);
 for(const failHealth of [false,true]){
  const paths=[],health=deferred(),versions=[],events=[];
  const context=startupContext({api:async path=>{paths.push(path);if(path==='/api/workspace')return {revision:1,data:{preferences:{onboarded:true}}};if(path==='/api/credential')return {saved:false};assert.equal(path,'/api/health');await health.promise;if(failHealth)throw Error('暂不可用');return {app_version:'beta0.8.0'};},render(){events.push('render')},pollNetwork(force){events.push('network-start:'+force)},stampVersion:v=>versions.push(v)});
  await vm.runInContext(`(async()=>{${source.slice(startupAt)}})()`,context);
  assert.deepEqual(paths,['/api/workspace','/api/credential','/api/health']);assert.deepEqual(events,['render','network-start:true']);assert.equal(context.workspaceReady,true);assert.deepEqual(versions,[]);
  health.resolve();await tick();assert.deepEqual(versions,failHealth?[]:['beta0.8.0']);
 }
});
await check('a save that cannot be read keeps the network, notes and settings shell usable without writing',async()=>{
 const raw={schema:1,preferences:{onboarded:false},game:{last:Date.now()+5*86400000}};
 for(const failure of ['normalize','server','first-save']){
  const events=[],writes=[];
  const context=startupContext({
   api:async path=>{if(path==='/api/workspace'){if(failure==='server'){const e=Error('本机存档无法读取，原文件已保留');e.code=500;throw e}return {revision:3,data:failure==='first-save'?null:raw}}if(path==='/api/credential')return {saved:true};return {}},
   normalize:()=>{throw Error('存档时间异常')},render(){events.push('render')},pollNetwork(){events.push('network')},showGuide:()=>assert.fail('读档失败时不能弹出新手引导'),
   commit:async next=>{writes.push(next);const e=Error('写入失败：磁盘已满');e.code=500;throw e},notebookUI:{load:async()=>{events.push('notes')}},
  });
  if(failure==='first-save')context.createState=()=>createState();
  await vm.runInContext(`(async()=>{${source.slice(startupAt)}})()`,context);
  assert.equal(context.workspaceReady,false,failure);assert.equal(context.saved,true,'凭据状态与存档无关，照常读取');
  assert.match(context.workspaceFailure.message,{normalize:/存档时间异常/,server:/原文件已保留/,'first-save':/磁盘已满/}[failure]);
  assert.equal(context.workspaceFailure.raw,failure==='normalize'?raw:null,'只有真正读到的原始存档才能导出或宽松恢复');
  assert.deepEqual(events,['render','notes','network'],'外壳、笔记和网络状态照常启动');
  assert.equal(writes.length,failure==='first-save'?1:0,'读不懂的存档绝不能被占位状态覆盖');
  assert.equal(context.state.preferences.onboarded,true,'占位状态不会触发引导或保存引导进度');
 }
 const synced=createState();synced.preferences.onboarded=true;
 const context=startupContext({api:async path=>path==='/api/workspace'?{revision:1,data:null}:path==='/api/credential'?{saved:false}:{},render(){},pollNetwork(){},
  commit:async()=>{context.state=synced;throw Error('另一个窗口有新记录，已同步。本次操作尚未保存，请再试一次。')}});
 await vm.runInContext(`(async()=>{${source.slice(startupAt)}})()`,context);
 assert.equal(context.workspaceFailure,null,'首次保存遇到另一窗口已建好的存档时，沿用同步到的存档');assert.equal(context.workspaceReady,true);assert.equal(context.state,synced);
 // 服务无响应（没有状态码）不是存档坏了：保留整页错误，不能声称网络和笔记等页面照常可用。
 for(const stage of ['read','first-save']){
  const main={innerHTML:''},offline=()=>Error('本机服务暂时无响应，请确认程序仍在运行；未保存的操作不会显示为成功');
  const context=startupContext({api:async path=>{if(path==='/api/workspace'){if(stage==='read')throw offline();return {revision:1,data:null}}return {saved:false}},
   commit:async()=>{throw offline()},render:()=>assert.fail('服务不可达时不渲染降级外壳'),pollNetwork(){},esc:String,$:selector=>{assert.equal(selector,'#main');return main}});
  await vm.runInContext(`(async()=>{${source.slice(startupAt)}})()`,context);
  assert.equal(context.workspaceFailure,null,stage);assert.equal(context.workspaceReady,false);
  assert.match(main.innerHTML,/暂时没能打开庭院[^]*本机服务暂时无响应[^]*重新读取/);assert.doesNotMatch(main.innerHTML,/照常使用/);
 }
});
await check('a failed load blocks every save until a lenient recovery writes through the normal save path',async()=>{
 const writes=[],toasts=[],renders=[];let recoverSave=null,answer=true;
 const raw={schema:1,profile:{name:'原来的昵称'},game:{last:Date.now()+5*86400000}};
 const context=vm.createContext({state:createState(),revision:3,workspaceReady:false,settingsProfileDraft:{id:'profile-form'},structuredClone,
  api:async(path,body)=>{assert.equal(path,'/api/workspace');writes.push(body);return {revision:body.revision+1}},
  render(){renders.push('render')},toast:message=>toasts.push(message),confirm:async()=>answer,
  // 与真实 normalize 一样：读不懂的存档直接抛错。
  normalize:x=>{if(!x?.profile)throw Error('伙伴列表为空');return x},
  engine:{get recoverSave(){return recoverSave}},
 });
 bindCommit(context);vm.runInContext(source.slice(source.indexOf('async function recoverWorkspace('),source.indexOf('let navigating=false;')),context);
 vm.runInContext('workspaceFailure={message:"存档时间异常",raw:'+JSON.stringify(raw)+'}',context);
 await assert.rejects(context.commit(createState()),/庭院存档暂时打不开/);assert.equal(writes.length,0,'降级期间任何写入都不能覆盖原存档');
 await context.recoverWorkspace();assert.match(toasts.at(-1),/还不能宽松恢复/);assert.equal(writes.length,0);
 recoverSave=()=>{throw Error('伙伴列表为空')};
 await assert.rejects(context.recoverWorkspace(),/宽松恢复没有成功：伙伴列表为空/);assert.equal(writes.length,0);
 recoverSave=()=>({schema:1});
 await assert.rejects(context.recoverWorkspace(),/宽松恢复没有成功：伙伴列表为空/,'恢复结果先经 normalize 校验');assert.equal(writes.length,0,'校验不过就不写盘，不能覆盖原存档');
 answer=false;recoverSave=input=>({...createState(),profile:{name:input.profile.name,college:''}});
 await context.recoverWorkspace();assert.equal(writes.length,0,'取消确认时不写入');
 answer=true;const api=context.api;context.api=async()=>{throw Error('写入失败')};
 await assert.rejects(context.recoverWorkspace(),/写入失败/);assert.match(vm.runInContext('workspaceFailure.message',context),/存档时间异常/,'保存失败时仍停留在降级状态');
 context.api=api;await context.recoverWorkspace();
 assert.equal(writes.length,1);assert.equal(writes[0].revision,3);assert.equal(writes[0].data.profile.name,'原来的昵称');
 assert.equal(vm.runInContext('workspaceFailure',context),null);assert.equal(context.workspaceReady,true);assert.equal(context.revision,4);
 assert.equal(context.state.profile.name,'原来的昵称');assert.equal(context.settingsProfileDraft,null);assert.deepEqual(renders,['render']);assert.match(toasts.at(-1),/已按能读懂的内容恢复存档/);
 assert.match(source,/import \* as engine from '\.\/engine\.mjs'/,'recoverSave 必须经命名空间读取，引擎缺少导出时页面仍能加载');
 // 冲突：另一个窗口已经写好有效存档时沿用它；另一个窗口的存档同样读不懂时仍停留在降级状态。
 for(const other of [{profile:{name:'另一个窗口恢复的'},game:{}},{schema:1}]){
  const placeholder=createState();context.state=placeholder;context.workspaceReady=false;renders.length=0;
  vm.runInContext('workspaceFailure={message:"存档时间异常",raw:'+JSON.stringify(raw)+'}',context);
  context.api=async(path,body)=>{if(body){const e=Error('conflict');e.code=409;throw e}return {revision:8,data:other}};
  const valid=!!other.profile;
  if(valid){await context.recoverWorkspace();assert.equal(context.state,other);assert.equal(vm.runInContext('workspaceFailure',context),null);assert.equal(context.workspaceReady,true);assert.deepEqual(renders,['render']);assert.match(toasts.at(-1),/另一个窗口已经恢复了存档/)}
  else{await assert.rejects(context.recoverWorkspace(),/伙伴列表为空/);assert.equal(context.state,placeholder);assert.match(vm.runInContext('workspaceFailure.message',context),/存档时间异常/);assert.equal(context.workspaceReady,false);assert.deepEqual(renders,[])}
  assert.equal(context.revision,8,'冲突后按服务端最新修订号继续');
 }
});
await check('importing a backup is a way out of a failed load, and the study level only lasts for this session',async()=>{
 const writes=[],toasts=[],renders=[],backup={profile:{name:'备份里的昵称'},game:{},preferences:{studentLevel:'graduate'}};let handler,fail=false;
 const context=vm.createContext({state:createState(),revision:5,workspaceReady:false,settingsProfileDraft:null,structuredClone,JSON,
  api:async(path,body)=>{assert.equal(path,'/api/workspace');writes.push(body);if(fail){const e=Error('存档未写入，原存档保留');e.code=500;throw e}return {revision:body.revision+1}},
  render(){renders.push('render')},toast:message=>toasts.push(message),confirm:async()=>true,normalize:x=>{if(!x?.profile)throw Error('不是本应用的存档');return x},
  run:async work=>{try{await work()}catch(e){toasts.push(e.message)}},campusUI:{input(){}},
  document:{addEventListener:(type,fn)=>{if(type==='change')handler=fn}},
 });
 bindCommit(context);vm.runInContext(source.slice(source.indexOf('async function replaceFailedWorkspace('),source.indexOf('let navigating=false;'))+source.slice(source.indexOf("document.addEventListener('change'"),source.indexOf('let exiting=false;')),context);
 vm.runInContext('workspaceFailure={message:"存档时间异常",raw:null}',context);
 const placeholder=context.state;
 handler({target:{id:'student-level',value:'graduate',dataset:{}}});
 assert.equal(context.state.preferences.studentLevel,'graduate','降级时仍可切换培养层次查看课表');assert.equal(writes.length,0,'这个选择不写入存档');assert.deepEqual(renders,['render']);
 const importFile=text=>({target:{id:'import-file',value:'backup.json',dataset:{},files:[{size:text.length,text:async()=>text}]}});
 handler(importFile('{"schema":1}'));await tick();assert.match(toasts.at(-1),/无法导入：不是本应用的存档/);assert.equal(writes.length,0);
 fail=true;handler(importFile(JSON.stringify(backup)));await tick();await tick();
 assert.equal(writes.length,1);assert.match(toasts.at(-1),/存档未写入/);assert.equal(context.state,placeholder);assert.match(vm.runInContext('workspaceFailure.message',context),/存档时间异常/,'写入失败时仍停留在降级状态');
 fail=false;handler(importFile(JSON.stringify(backup)));await tick();await tick();
 assert.equal(writes.length,2);assert.equal(writes[1].revision,5);assert.equal(writes[1].data.profile.name,'备份里的昵称');
 assert.equal(vm.runInContext('workspaceFailure',context),null,'导入通过校验的备份后解除降级');assert.equal(context.workspaceReady,true);assert.equal(context.state.profile.name,'备份里的昵称');assert.equal(toasts.at(-1),'存档已恢复');
});
await check('leaving notes offers a way out of saves that retrying cannot fix, but keeps outages and conflicts on the desk',async()=>{
 for(const [code,confirmed,left] of [[413,true,true],[413,false,false],[400,true,true],[409,true,false],[undefined,true,false]]){
  const f=noteNavigationFixture(),asked=[],classes=new Set(['note-writing-focus']);f.context.confirm=async(title,text)=>{asked.push(title+'|'+text);f.gate.saved=confirmed;return confirmed};
  f.context.document.body={classList:{remove:name=>classes.delete(name)}};
  const pending=f.context.navigate('home'),error=Error('笔记不能超过 8 MiB');if(code)error.code=code;f.gate.reject(error);
  assert.equal(await pending,left,String(code));assert.equal(f.context.page,left?'home':'study');
  assert.equal(asked.length,code&&code!==409?1:0,'只有重试也无法成功的错误才询问是否离开');
  if(asked.length){assert.match(asked[0],/仍要离开书桌[^]*笔记不能超过 8 MiB。未保存的修改会留在书桌上[^]*导出笔记备份/);assert.doesNotMatch(asked[0],/回收站/,'这个版本还没有清空回收站的入口，不能让用户去找')}
  assert.ok(classes.has('note-writing-focus'),'专心书写由 notebook.leave() 在 finally 里收起（见 check-notebook），app 不再绕过它直接改 body 的类');
  if(left){assert.deepEqual(f.history,['#home']);assert.deepEqual(f.polls,['home'])}
  else{assert.deepEqual(f.toasts,['笔记不能超过 8 MiB']);assert.deepEqual(f.history,[]);assert.equal(f.draft.value,'尚未落盘的课堂问题')}
 }
});
await check('Electron exit uses its shell bridge and never shuts down a shared Go service',async()=>{
 const f=fixture();let quits=0,shutdowns=0;
 f.context.campusUI.click=async()=>false;f.context.confirm=async()=>true;
 f.context.szuDesktop={shell:'electron',quit:async()=>{quits++}};
 f.context.api=async()=>{shutdowns++};
 f.click('shutdown');await tick();
 assert.equal(quits,1);assert.equal(shutdowns,0);assert.deepEqual(f.toasts,[]);
});
await check('portable exit keeps the existing service shutdown behavior',async()=>{
 const f=fixture(),paths=[];
 f.context.campusUI.click=async()=>false;f.context.confirm=async()=>true;
 f.context.api=async path=>{paths.push(path)};f.context.$=()=>({});
 f.context.windowStream=null;f.context.clearInterval=()=>{};
 f.context.clockInterval=1;f.context.networkInterval=2;f.context.calendarInterval=3;
 f.context.window={close(){}};f.context.exiting=false;
 f.click('shutdown');await tick();
 assert.deepEqual(paths,['/api/shutdown']);assert.equal(f.context.exiting,true);assert.deepEqual(f.toasts,[]);
});
await check('onboarding and settings explain the active shell exit behavior',()=>{
 const previousShell=globalThis.szuDesktop;
 try{
  delete globalThis.szuDesktop;assert.match(exitHint(),/10 秒/);
  // 不传参数时读当前外壳，和页面里 exitHint() 的用法一致。
  globalThis.szuDesktop={shell:'electron'};
  for(const installed of [exitHint(),exitHint('electron')]){assert.match(installed,/关闭主窗口/);assert.match(installed,/常驻/);assert.match(installed,/托盘/);assert.doesNotMatch(installed,/10 秒/)}
 }finally{if(previousShell===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=previousShell}
 assert.match(source,/import \{exitHint,[^}]*\} from '\.\/app-logic\.mjs';/);
 assert.match(source,/\nfunction showGuide\(\)\{[^\n]*hint\.textContent=exitHint\(\)/);
 const settings=source.slice(source.indexOf('function settings(){'),source.indexOf('function render(){'));
 assert.ok(settings.includes('${exitHint()}'));
});
await check('load failure retry works without an inline script under Electron CSP',()=>{
 const f=fixture();let reloads=0;f.context.location={reload(){reloads++}};
 f.click('reload');assert.equal(reloads,1);
 assert.doesNotMatch(source,/onclick=/);assert.match(source,/data-action="reload"/);
});
await check('the pet size slider only exists under the Electron shell and round-trips through the bridge',()=>{
 const from=source.indexOf('function settings(){'),to=source.indexOf('function render(){',from);
 assert.ok(from>=0&&to>from);
 const settings=source.slice(from,to);
 // 浏览器模式（无 szuDesktop）绝不渲染滑杆。
 assert.match(settings,/globalThis\.szuDesktop\?\.shell==='electron'/);
 assert.match(settings,/id="pet-scale"/);
 assert.match(settings,/id="pet-scale-value"/);
 assert.match(settings,/type="range"/);
 assert.match(settings,/min="0\.4"/);
 assert.match(settings,/max="2"/);
 // 滑杆的读写必须落在桥接函数上，而不是自己写一份状态。
 const wire=source.slice(source.indexOf('function loadPetScale(){'),source.indexOf('function render(){'));
 assert.match(wire,/petScale\(\)\.then/,'必须先从主进程读回当前值');
 assert.match(wire,/setPetScale\(Number\(input\.value\)\)/,'必须把显示值交给桥接函数');
 assert.match(wire,/szuDesktop\?\.setPetScale/,'浏览器模式下不得接线');
});
await check('the unified-auth login lives in the app and never keeps the password',()=>{
 const ui=readFileSync(new URL('./assets/garden/campus-ui.mjs',import.meta.url),'utf8');
 // 表单与三个端点都要在。
 assert.match(ui,/id="cas-login-form"/);
 assert.match(ui,/id="cas-username"/);
 assert.match(ui,/id="cas-password"/);
 assert.match(ui,/\/api\/cas\/challenge/);
 assert.match(ui,/\/api\/cas\/login/);
 assert.match(ui,/\/api\/cas\/session/);
 // 密码用完必须清掉输入框和 values，不能留在页面上。
 assert.match(ui,/values\.password=''/);
 assert.match(ui,/pwd\.value=''/);
 // 明文字密码绝不能进日志或 URL。
 assert.doesNotMatch(ui,/console\.log\([^)]*password/i);
 assert.doesNotMatch(ui,/toast\([^)]*password/i);
 // 会话失效时要同时刷新两条入口的状态，不能只刷新粘 Cookie 那个。
 assert.match(ui,/if\(e\.code===401\)\{sessionErr=e\.message;casLogged=false;/);
 // 登出 CAS 后要能回落到 Cookie，所以不能让cas-clear 顺手把 Cookie 也删了。
 assert.match(ui,/a==='cas-clear'[\s\S]{0,400}?\/api\/cas\/session/);
 assert.doesNotMatch(ui.slice(ui.indexOf("a==='cas-clear'"),ui.indexOf("a==='online-score'")),/\/api\/session/,{},'DELETE');
});
await check('Escape on a reopened confirmation cannot reuse the previous OK result',async()=>{
 let close;
 const dialog={returnValue:'',showModal(){},addEventListener(name,callback,options){assert.equal(name,'close');assert.equal(options.once,true);close=callback;}};
 const nodes={'#confirm':dialog,'#confirm-title':{textContent:''},'#confirm-text':{textContent:''}};
 const context={confirm:createConfirm(selector=>nodes[selector])};
 assert.match(source,/\nconst confirm=createConfirm\(\$\);\n/,'页面的 confirm() 必须来自 createConfirm');
 const accepted=context.confirm('第一次确认','确认本次操作');dialog.returnValue='ok';close();assert.equal(await accepted,true);
 const dismissed=context.confirm('第二次确认','按 Esc 取消');
 assert.equal(dialog.returnValue,'','打开确认框必须清除上一次返回值');
 close();assert.equal(await dismissed,false,'原生 Esc 不会为 returnValue 设置新值，仍必须视为取消');
 assert.equal(nodes['#confirm-title'].textContent,'第二次确认');
});
await check('desktop preference failures remain retryable even when the status reread also fails',async()=>{
 const previousDocument=globalThis.document,previousShell=globalThis.szuDesktop;
 const messages=[],status={textContent:''},input={dataset:{desktopSetting:'petVisible'},checked:false,disabled:false,isConnected:true};
 try{
  globalThis.document={getElementById:id=>id==='desktop-options-status'?status:null};
  globalThis.szuDesktop={desktopSettings:async()=>{throw Error('读取失败')},setDesktopSettings:async()=>{throw Error('写入失败')}};
  const ui=createDesktopOptions({toast:message=>messages.push(message)});
  assert.equal(await ui.change({target:input}),true);
  assert.equal(input.disabled,false,'不能提示重试却把开关永远禁用');
  assert.match(messages.join(' '),/没有保存成功/);assert.doesNotMatch(messages.join(' '),/偏好已保存/);
  assert.match(status.textContent,/读取失败/);
 }finally{
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousShell===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=previousShell;
 }
});

// 最小 DOM：只实现 shell-repaint 和被测重绘路径用到的接口（含一个够用的 HTML 解析），
// 用来验证整块重绘后焦点能回到等价控件。
function fakeDocument(){
 const doc={activeElement:null},listeners={};
 // 按逗号或空白切分选择器，但跳过引号和方括号里的内容。
 const split=(text,separator)=>{const parts=[];let current='',depth=0,quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){current+=c;if(c==='\\')current+=text[++i];else if(c==='"')quoted=false;continue}if(c==='"')quoted=true;else if(c==='[')depth++;else if(c===']')depth--;else if(!depth&&separator.test(c)){if(current.trim())parts.push(current.trim());current='';continue}current+=c}if(current.trim())parts.push(current.trim());return parts};
 const matchPart=(el,part)=>{
  const m=/^([a-z][\w-]*)?(?:#([\w-]+))?((?:\.[\w-]+)*)((?:\[[\w-]+=(?:"(?:[^"\\]|\\.)*"|[\w-]+)\])*)$/.exec(part);if(!m)throw Error('unsupported selector '+part);
  if(m[1]&&el.localName!==m[1])return false;if(m[2]&&el.id!==m[2])return false;
  for(const name of m[3].split('.').filter(Boolean))if(!(el.getAttribute('class')||'').split(/\s+/).includes(name))return false;
  for(const [,name,quoted,bare] of m[4].matchAll(/\[([\w-]+)=(?:"((?:[^"\\]|\\.)*)"|([\w-]+))\]/g))if(el.getAttribute(name)!==(quoted===undefined?bare:quoted.replace(/\\(.)/g,'$1')))return false;
  return true;
 };
 // 支持并列（a, b）和后代（#main button）两种组合。
 const matches=(el,selector)=>split(selector,/,/).some(group=>{const parts=split(group,/\s/),last=parts.pop();if(!matchPart(el,last))return false;let node=el.parentElement;for(const part of parts.reverse()){while(node&&!matchPart(node,part))node=node.parentElement;if(!node)return false;node=node.parentElement}return true});
 const blurLost=()=>{if(!doc.activeElement?.isConnected)doc.activeElement=doc.body};
 const dataName=key=>'data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
 class Element{
  constructor(tag,attrs={},children=[]){this.ownerDocument=doc;this.localName=tag;this.attrs=new Map(Object.entries(attrs).map(([k,v])=>[k,String(v)]));this.off='disabled' in attrs;this.nodes=[];this.parentElement=null;children.forEach(child=>this.append(child))}
  get children(){return this.nodes.filter(node=>typeof node!=='string')}
  get id(){return this.attrs.get('id')||''}
  get attributes(){return [...this.attrs].map(([name,value])=>({name,value}))}
  get textContent(){return this.nodes.map(node=>typeof node==='string'?node:node.textContent).join('')}
  get dataset(){return new Proxy({},{get:(_,key)=>this.getAttribute(dataName(key))??undefined,set:(_,key,value)=>{this.setAttribute(dataName(key),value);return true}})}
  // 与 Chrome 一致：禁用正拥有焦点的控件时，焦点落回 body。
  get disabled(){return this.off}
  set disabled(value){this.off=!!value;if(value&&doc.activeElement===this)doc.activeElement=doc.body}
  getAttribute(name){return this.attrs.has(name)?this.attrs.get(name):null}
  hasAttribute(name){return this.attrs.has(name)}
  setAttribute(name,value){this.attrs.set(name,String(value))}
  get tabIndex(){return this.attrs.has('tabindex')?Number(this.attrs.get('tabindex')):['button','input','select','summary'].includes(this.localName)?0:-1}
  append(child){if(typeof child!=='string')child.parentElement=this;this.nodes.push(child)}
  get isConnected(){let node=this;while(node.parentElement)node=node.parentElement;return node===doc.documentElement}
  contains(el){for(let node=el;node;node=node.parentElement)if(node===this)return true;return false}
  *all(){for(const child of this.children){yield child;yield* child.all()}}
  matches(selector){return matches(this,selector)}
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null}
  querySelectorAll(selector){return [...this.all()].filter(el=>el.matches(selector))}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  focus(){if(!this.disabled&&this.isConnected&&(this.tabIndex>=0||this.hasAttribute('tabindex')))doc.activeElement=this}
  // innerHTML / outerHTML 替换：旧节点离开文档，焦点随之落回 body。
  replace(...nodes){this.children.forEach(child=>{child.parentElement=null});this.nodes=[];nodes.forEach(node=>this.append(node));blurLost()}
  set innerHTML(html){this.replace(...parse(html))}
  set outerHTML(html){const parent=this.parentElement,nodes=parse(html);nodes.forEach(node=>{if(typeof node!=='string')node.parentElement=parent});parent.nodes.splice(parent.nodes.indexOf(this),1,...nodes);this.parentElement=null;blurLost()}
 }
 const entity=text=>text.replace(/&(quot|amp|lt|gt|#39);/g,(_,name)=>({quot:'"',amp:'&',lt:'<',gt:'>','#39':"'"})[name]);
 const VOID=new Set(['input','img','br','hr','meta','link','source']);
 function parse(html){
  const root=new Element('template');let current=root;
  for(const [,close,tag,attrs,selfClosing,text] of String(html).matchAll(/<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi)){
   if(close){current=current.parentElement||root;continue}
   if(tag){const el=new Element(tag.toLowerCase(),Object.fromEntries([...attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(([,name,value])=>[name,entity(value??'')])));current.append(el);if(!VOID.has(el.localName)&&!selfClosing)current=el;continue}
   if(text.trim())current.append(entity(text));
  }
  const nodes=root.nodes;nodes.forEach(node=>{if(typeof node!=='string')node.parentElement=null});return nodes;
 }
 const h=(tag,attrs,...children)=>new Element(tag,attrs,children);
 doc.body=h('body',{});doc.documentElement=h('html',{},doc.body);doc.activeElement=doc.body;
 doc.querySelectorAll=selector=>doc.documentElement.querySelectorAll(selector);
 doc.querySelector=selector=>doc.documentElement.querySelector(selector);
 doc.getElementById=id=>doc.documentElement.querySelector(`[id="${id}"]`);
 doc.addEventListener=(type,fn)=>{listeners[type]=fn};
 const main=h('main',{id:'main',tabindex:'-1'});doc.body.append(main);
 return {doc,main,h,listeners};
}
await check('whole-page repaints return keyboard focus to the equivalent control instead of the page start',()=>{
 const {doc,main,h}=fakeDocument();
 const board=({claimed=false,pets=2,todo=true}={})=>[
  h('section',{class:'card daily-board'},h('h2',{},'庭院小计划'),h('button',{'data-action':'quest','data-id':'care',...(claimed?{disabled:''}:{})},'领取')),
  h('section',{class:'card'},h('h2',{},'伙伴'),...Array.from({length:pets},(_,i)=>h('button',{'data-action':'pat','data-tone':i?'warm':'cool'},'摸摸头'))),
  ...(todo?[h('form',{id:'todo-form'},h('input',{id:'todo-text',name:'todo'}),h('button',{'data-action':'todoToggle','data-id':'task-1'},'完成'))]:[]),
 ];
 main.replace(...board());
 main.querySelectorAll('[data-action="pat"]')[1].focus();
 let spot=focusKey(doc.activeElement);main.replace(...board());assert.equal(doc.activeElement,doc.body,'fixture must lose focus like innerHTML');
 assert.equal(restoreFocus(spot),true);assert.equal(doc.activeElement,main.querySelectorAll('[data-action="pat"]')[1],'同类按钮按原来的序号找回，data-tone 等状态属性不参与定位');
 main.querySelector('[id="todo-text"]').focus();spot=focusKey(doc.activeElement);main.replace(...board());restoreFocus(spot);assert.equal(doc.activeElement.id,'todo-text');
 main.querySelector('[data-action="todoToggle"]').focus();spot=focusKey(doc.activeElement);main.replace(...board());restoreFocus(spot);assert.equal(doc.activeElement.getAttribute('data-id'),'task-1');
 main.querySelector('[data-action="quest"]').focus();spot=focusKey(doc.activeElement);main.replace(...board({claimed:true}));
 assert.equal(restoreFocus(spot),true);const heading=main.querySelector('h2');assert.equal(doc.activeElement,heading,'控件被禁用时退回所在卡片标题');assert.equal(heading.getAttribute('tabindex'),'-1');
 main.querySelector('[data-action="todoToggle"]').focus();spot=focusKey(doc.activeElement);main.replace(...board({todo:false}));
 restoreFocus(spot);assert.equal(doc.activeElement,main,'整块区域都消失时退回 #main，而不是 body');
 main.querySelector('[data-action="pat"]').focus();spot=focusKey(doc.activeElement);main.replace(...board());
 const outside=h('button',{'data-action':'navigate'});doc.body.append(outside);outside.focus();
 assert.equal(restoreFocus(spot),false,'焦点已经被移到别处时不抢回');assert.equal(doc.activeElement,outside);
 const quotedId='读 "第 3 章" \\ 做笔记',quoted=()=>h('button',{'data-action':'todoToggle','data-id':quotedId});
 main.replace(quoted());main.querySelector('[data-action="todoToggle"]').focus();spot=focusKey(doc.activeElement);main.replace(quoted());
 assert.equal(restoreFocus(spot),true);assert.equal(doc.activeElement.getAttribute('data-id'),quotedId,'待办文字里的引号和反斜杠不会破坏定位');
 assert.equal(focusKey(outside),null,'#main 以外的焦点不参与');assert.equal(focusKey(null),null);assert.equal(focusKey({value:'草稿'}),null,'非 DOM 对象安全返回 null');
 assert.equal(restoreFocus(null),false);
 // 没有 id 的卡片按标题认：前面增减了卡片、序号错位时，不能把焦点送到另一张不相干卡片的标题上。
 const shelf=({inserted=false,delivered=false,orders=true}={})=>[
  ...(inserted?[h('section',{class:'card'},h('h2',{},'新的贴纸'),h('button',{'data-action':'gardenTab','data-tab':'arcade'},'去看看'))]:[]),
  ...(orders?[h('section',{class:'card'},h('h2',{},'伙伴委托'),...(delivered?[]:[h('button',{'data-action':'orderDeliver','data-id':'o1'},'交付')]))]:[]),
  h('section',{class:'card'},h('h2',{},'种子铺'),h('button',{'data-action':'buySeed','data-crop':'radish'},'买种子')),
 ];
 main.replace(...shelf());main.querySelector('[data-action="orderDeliver"]').focus();spot=focusKey(doc.activeElement);
 main.replace(...shelf({inserted:true,delivered:true}));assert.equal(restoreFocus(spot),true);
 assert.equal(doc.activeElement.textContent,'伙伴委托','前面插入新卡片后，仍按标题回到原来的卡片');
 main.replace(...shelf());main.querySelector('[data-action="orderDeliver"]').focus();spot=focusKey(doc.activeElement);
 main.replace(...shelf({inserted:true,orders:false}));restoreFocus(spot);
 assert.equal(doc.activeElement,main,'原来的卡片整张消失时退回 #main，不跳到占了同一序号的卡片');
});
await check('run() returns focus to the same control after disabling controls and repainting #main',async()=>{
 const {doc,main}=fakeDocument(),toasts=[];
 const card='<section class="card"><h2>庭院小计划</h2><button data-action="quest" data-id="care">领取</button><button data-action="quest" data-id="plant">领取</button></section>';
 main.innerHTML=card;
 const context=vm.createContext({busy:false,page:'garden',document:doc,toast:message=>toasts.push(message),networkResult(){},schoolUI:{sync(){}},clocks(){},focusKey,restoreFocus});
 vm.runInContext(source.slice(source.indexOf('async function run('),source.indexOf('// 只有下列公开查询')),context);
 const second=()=>main.querySelectorAll('[data-action="quest"]')[1];
 const button=second();button.focus();
 await context.run(async()=>{assert.equal(doc.activeElement,doc.body,'禁用控件时焦点离开按钮，与 Chrome 一致')});
 assert.equal(doc.activeElement,button,'不重绘时回到同一个按钮');assert.equal(button.disabled,false);
 await context.run(async()=>{main.innerHTML=card});
 assert.notEqual(second(),button,'#main 确实被整块替换');assert.equal(doc.activeElement,second());assert.equal(second().getAttribute('data-id'),'plant');
 await context.run(async()=>{main.innerHTML=card;throw Error('没有保存')});
 assert.equal(doc.activeElement,second(),'失败提示后也不丢焦点');assert.deepEqual(toasts,['没有保存']);
});
await check('render() replaces #main and puts focus back on the equivalent control',()=>{
 const {doc,main}=fakeDocument();let html='';
 const context=vm.createContext({state:createState(),page:'home',studyTab:'notes',serviceTab:'spaces',settingsTab:'appearance',settingsProfileDraft:null,pages:{home:'今日'},pageIcons:{},Date,document:doc,
  $:selector=>selector==='#main'?main:{},sprite:()=>'',paintCompanionDialog(){},pageHTML:()=>html,clocks(){},mountGardenPlayers(){},focusKey,restoreFocus,refreshDraft,
 });
 vm.runInContext(source.slice(source.indexOf('function render(){'),source.indexOf('// 单页渲染兜底')),context);
 const board=count=>`<section class="card"><h2>伙伴</h2>${'<button data-action="pat" data-tone="warm">摸摸头</button>'.repeat(count)}</section><form id="todo-form"><input id="todo-text" name="todo"></form>`;
 html=board(2);context.render();const before=main.querySelectorAll('[data-action="pat"]')[1];before.focus();
 context.render();assert.notEqual(main.querySelectorAll('[data-action="pat"]')[1],before);assert.equal(doc.activeElement,main.querySelectorAll('[data-action="pat"]')[1]);
 main.querySelector('[id="todo-text"]').focus();context.render();assert.equal(doc.activeElement.id,'todo-text');
 html='<section class="card"><h2>换了一页</h2></section>';context.render();assert.equal(doc.activeElement,main,'控件和所在区域都不在时退回 #main');
 assert.equal(doc.body.dataset.page,'home');
});
await check('switching todo filters keeps focus on the chosen filter button',()=>{
 const {doc,main,listeners}=fakeDocument();let state=createState();
 for(const [id,text] of [['t1','读 "第 3 章"'],['t2','交作业']])state=act(state,{type:'todoAdd',text,id});
 main.innerHTML=`<section class="card home-todos"><h2>我的小事</h2>${todoView(state,'open',Date.now(),false)}</section>`;
 const context=vm.createContext({busy:false,page:'home',state,todoFilter:'open',todoView,document:doc,focusKey,restoreFocus,toast(){},notebookUI:{},schoolUI:{sync(){}}});
 vm.runInContext(source.slice(start,end),context);
 const pick=filter=>main.querySelector(`[data-action="todoFilter"][data-filter="${filter}"]`),done=pick('done');done.focus();
 listeners.click({target:{closest:()=>done},preventDefault(){}});
 assert.equal(context.todoFilter,'done');assert.notEqual(pick('done'),done,'清单被整块替换');
 assert.equal(doc.activeElement,pick('done'),'焦点留在刚选中的分类上');assert.equal(pick('done').getAttribute('aria-pressed'),'true');
});
await check('desktop preference switches keep keyboard focus after the list repaints',async()=>{
 const {doc,main}=fakeDocument(),previousDocument=globalThis.document,previousShell=globalThis.szuDesktop,toasts=[];
 let settings={autoConnectCampus:false,launchAtLogin:false,launchAtLoginSupported:true,notificationsSupported:true};
 try{
  globalThis.document=doc;
  globalThis.szuDesktop={desktopSettings:async()=>settings,setDesktopSettings:async patch=>{settings={...settings,...patch};return settings}};
  const ui=createDesktopOptions({toast:message=>toasts.push(message)});main.innerHTML=ui.card();await ui.load();
  const input=main.querySelector('[data-desktop-setting="autoConnectCampus"]');input.focus();input.checked=true;
  await ui.change({target:input});
  const now=main.querySelector('[data-desktop-setting="autoConnectCampus"]');
  assert.notEqual(now,input,'开关列表确实被重绘');assert.equal(doc.activeElement,now,'焦点回到同一个开关');assert.equal(settings.autoConnectCampus,true);assert.deepEqual(toasts,['桌面偏好已保存']);
 }finally{
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousShell===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=previousShell;
 }
});
await check('checking for updates returns focus to the check button after the card is replaced',async()=>{
 const {doc,main}=fakeDocument(),previousDocument=globalThis.document,job=deferred();
 try{
  globalThis.document=doc;
  const ui=createReleaseUI({api:()=>job.promise,getVersion:()=>'beta0.9.3'});
  main.innerHTML=`<div class="settings-layout">${ui.card()}</div>`;
  const button=main.querySelector('[data-action="release-check"]');button.focus();
  const pending=ui.click('release-check');
  const during=main.querySelector('[data-action="release-check"]');
  assert.equal(during.disabled,true);assert.equal(doc.activeElement.textContent,'版本与更新','检查期间按钮被禁用，焦点先停在卡片标题上');
  job.resolve({version:'beta0.9.3',url:'https://github.com/SzuDesktopTeam/szudesktop/releases',prerelease:true});await pending;
  const after=main.querySelector('[data-action="release-check"]');
  assert.notEqual(after,button);assert.equal(after.disabled,false);assert.equal(doc.activeElement,after,'检查结束后回到「检查更新」按钮');
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
await check('the campus auto-connect switch is opt-in, explained and listed before launch at login',async()=>{
 const previousDocument=globalThis.document,previousShell=globalThis.szuDesktop,host={innerHTML:''};
 try{
  globalThis.document={getElementById:id=>id==='desktop-options'?host:null};
  globalThis.szuDesktop={desktopSettings:async()=>({autoConnectCampus:false,launchAtLogin:false,launchAtLoginSupported:true,notificationsSupported:true})};
  const ui=createDesktopOptions({toast(){}});const html=ui.card();
  const auto=html.indexOf('data-desktop-setting="autoConnectCampus"'),launch=html.indexOf('data-desktop-setting="launchAtLogin"');
  assert.ok(auto>0&&launch>auto,'自动连接开关放在开机启动之前');
  assert.match(html,/启动时自动连接校园网/);assert.match(html,/使用已记住的账号；本机已在线时跳过，下次启动生效。/);
  await ui.load();assert.match(host.innerHTML,/data-desktop-setting="autoConnectCampus"/);assert.doesNotMatch(host.innerHTML,/data-desktop-setting="autoConnectCampus" checked/,'默认不自动连接');
 }finally{
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousShell===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=previousShell;
 }
});
await check('same-farm navigation repaints a newly selected target without adding history',async()=>{
 const f=noteNavigationFixture();f.gate.resolve();f.context.page='garden';f.context.gardenTab='farm';f.context.selectedPlot=0;
 f.context.location.hash='#garden/farm';f.context.document.querySelector=()=>null;
 const rendered=[];f.context.render=()=>rendered.push(f.context.selectedPlot);
 f.context.selectedPlot=4;
 assert.equal(await f.context.navigate('garden','farm'),true);
 assert.deepEqual(rendered,[4],'routeGarden updates the target before navigating, so the current farm must repaint');
 assert.deepEqual(f.methods,['replace']);assert.equal(f.context.location.hash,'#garden/farm');
});
console.log(`${count} interaction checks passed`);
