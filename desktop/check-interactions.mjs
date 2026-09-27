import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDesktopOptions} from './assets/garden/desktop-options.mjs';
import {todoView} from './assets/garden/productivity.mjs';
import {createReleaseUI} from './assets/garden/release-ui.mjs';
import {createFeedbackUI} from './assets/garden/feedback.mjs';
import {readRoute,routeHash} from './assets/garden/routes.mjs';
const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function run('),end=source.indexOf("document.addEventListener('submit'",start);
assert.ok(start>=0&&end>start);
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
  navigate:p=>{context.page=p},networkResult:()=>{},
 });
 vm.runInContext(source.slice(start,end),context);
 return {context,calls,toasts,controls,jobs,click(action,extra={}){click({target:{closest:()=>({dataset:{action,...extra}})},preventDefault(){}})}};
}
let count=0;async function check(name,fn){await fn();count++;console.log('PASS',name)}
function noteNavigationFixture(){
 const toasts=[],events=[],history=[],draft={value:'尚未落盘的课堂问题',selectionStart:2,selectionEnd:7};
 const notebook={draft},main={focus(){events.push('focus-main')}},gate={};
 gate.promise=new Promise((resolve,reject)=>{gate.resolve=()=>{gate.saved=true;resolve()};gate.reject=reject});
 const location={hash:'#study/notes'},methods=[];
 const writeHistory=method=>(_state,_unused,hash)=>{history.push(hash);methods.push(method);location.hash=hash};
 const context=vm.createContext({state:{},busy:false,page:'study',studyTab:'notes',serviceTab:'spaces',gardenTab:'pet',settingsTab:'appearance',readRoute,routeHash,location,pages:{home:'今日',study:'学习',garden:'庭院',services:'服务',settings:'设置'},
  document:{activeElement:draft,querySelector:selector=>selector==='[data-notebook]'?notebook:null},
  notebookUI:{leave:()=>{events.push('leave');return gate.promise}},
  history:{replaceState:writeHistory('replace'),pushState:writeHistory('push')},window:{scrollTo(){events.push('scroll')}},
  render(){assert.equal(gate.saved,true,'render must not run before the notebook save resolves');events.push('render')},
  $:selector=>{assert.equal(selector,'#main');return main},toast:message=>toasts.push(message),
 });
 const at=source.indexOf('let navigating=false;'),to=source.indexOf('let notifiedFocus=',at);
 assert.ok(at>=0&&to>at);vm.runInContext(source.slice(at,to),context);
 return {context,toasts,events,history,methods,draft,gate};
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
  const document={getElementById:id=>nodes[id]||null,querySelector:selector=>selector==='meta[name=app-version]'?meta:null};globalThis.document=document;
  const context=vm.createContext({appVersion:'',document,$:selector=>({'#app-badge':badge,'#about-version':about}[selector])});
  context.releaseUI=createReleaseUI({getVersion:()=>context.appVersion,api:async path=>{assert.equal(path,'/api/releases?channel=stable');return {available:true,version:'v0.8.1',url:'https://github.com/SzuDesktopTeam/szudesktop/releases/tag/v0.8.1'}}});
  context.feedbackUI=createFeedbackUI({getVersion:()=>context.appVersion,getMode:()=> 'electron',toast(){},clipboard:{writeText:async()=>{throw Error('clipboard unavailable')}}});
  context.releaseUI.change({target:{id:'release-channel',value:'stable'}});await context.releaseUI.click('release-check');await context.feedbackUI.click('feedback-copy');
  const at=source.indexOf('function stampVersion('),to=source.indexOf('\n',at);assert.ok(at>=0&&to>at);vm.runInContext(source.slice(at,to),context);
  context.stampVersion('beta0.8.0');
  assert.equal(meta.content,'beta0.8.0');assert.match(badge.textContent,/beta0.8.0/);assert.match(about.textContent,/beta0.8.0/);
  assert.match(nodes['release-panel'].outerHTML,/beta0.8.0/);assert.match(nodes['release-panel'].outerHTML,/value="stable" selected/);assert.match(nodes['release-panel'].outerHTML,/发现新版本/);
  assert.match(nodes['feedback-panel'].outerHTML,/szuDesktop beta0.8.0/);assert.match(nodes['feedback-panel'].outerHTML,/手动复制/);assert.equal(profile.value,'尚未保存的名字');
  nodes['release-panel'].outerHTML='same DOM';nodes['feedback-panel'].outerHTML='same feedback DOM';context.stampVersion('beta0.8.0');
  assert.equal(nodes['release-panel'].outerHTML,'same DOM');assert.equal(nodes['feedback-panel'].outerHTML,'same feedback DOM','周期状态响应不能无谓重挂设置卡片');
  delete nodes['release-panel'];delete nodes['feedback-panel'];context.stampVersion('beta0.8.1');assert.equal(context.appVersion,'beta0.8.1','卡片不在当前页时也能记录版本');
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
await check('startup retrieves the version without waiting for the campus network probe',async()=>{
 const at=source.lastIndexOf("try{const snapshot=await api('/api/workspace')");assert.ok(at>=0);
 for(const failHealth of [false,true]){
  const paths=[],health=deferred(),versions=[],events=[];
  const context=vm.createContext({api:async path=>{paths.push(path);if(path==='/api/workspace')return {revision:1,data:{preferences:{onboarded:true}}};if(path==='/api/credential')return {saved:false};assert.equal(path,'/api/health');await health.promise;if(failHealth)throw Error('暂不可用');return {app_version:'beta0.8.0'};},normalize:x=>x,render(){events.push('render')},refresh(){events.push('network-start');return new Promise(()=>{})},stampVersion:v=>versions.push(v),
   notebookUI:{load:async()=>{}},campusUI:{loadSession(){},loadCas(){},loadSources(){}},schoolUI:{load(){}},pianoUI:{load(){}},academicUI:{load(){}},$:()=>{assert.fail('健康信息失败不能让已加载的庭院报错')},revision:0,state:null,saved:false,workspaceReady:false});
  await vm.runInContext(`(async()=>{${source.slice(at)}})()`,context);
  assert.deepEqual(paths,['/api/workspace','/api/credential','/api/health']);assert.deepEqual(events,['render','network-start']);assert.equal(context.workspaceReady,true);assert.deepEqual(versions,[]);
  health.resolve();await tick();assert.deepEqual(versions,failHealth?[]:['beta0.8.0']);
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
 const from=source.indexOf('function exitHint(){'),to=source.indexOf('async function markOnboarded()',from);
 assert.ok(from>=0&&to>from);const context=vm.createContext({});vm.runInContext(source.slice(from,to),context);
 assert.match(vm.runInContext('exitHint()',context),/10 秒/);
 context.szuDesktop={shell:'electron'};
 const installed=vm.runInContext('exitHint()',context);assert.match(installed,/关闭主窗口/);assert.match(installed,/常驻/);assert.match(installed,/托盘/);assert.doesNotMatch(installed,/10 秒/);
 const guide=source.slice(source.indexOf('function showGuide(){'),from);
 assert.match(guide,/hint.textContent=exitHint\(\)/);
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
 const context=vm.createContext({$:selector=>nodes[selector]});
 const at=source.indexOf('async function confirm('),to=source.indexOf('function showGuide(',at);
 assert.ok(at>=0&&to>at);vm.runInContext(source.slice(at,to),context);
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
