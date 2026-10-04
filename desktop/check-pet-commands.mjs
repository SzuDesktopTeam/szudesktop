import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {petReaction} from './assets/garden/pet-player.mjs';
import {act,activePet,createState,dayKey,normalize,settle} from './assets/garden/engine.mjs';
import {PET_SPRITES,petSprite} from './assets/garden/pet-catalog.mjs';
import {focusKey,restoreFocus} from './assets/garden/shell-repaint.mjs';
import {createWorkspaceCommit} from './assets/garden/workspace-commit.mjs';

const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
// 标记找不到或顺序变了就直接报出是哪一段，不能切出空串或错位的代码再去执行。
function section(start,end){const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from,'app.mjs 里找不到这一段：'+start);return source.slice(from,to)}
const handlers=section('async function run(',"document.addEventListener('click'");
const careSource=section('function renderPetCare(','function showGuide(');
const companionSource=section('const sprite=','const cat=')+section('const pageTips=','const pages=')+section('function paintCompanionDialog(','function render(){');
// commit() 来自 workspace-commit.mjs；按 app.mjs 的接线绑到 vm 上下文里的 state、revision 与 workspaceFailure。
function bindCommit(context){if(!('workspaceFailure' in context))context.workspaceFailure=null;context.commit=createWorkspaceCommit({api:(...args)=>context.api(...args),normalize:data=>context.normalize(data),read:()=>({failure:context.workspaceFailure,revision:context.revision}),setRevision:next=>{context.revision=next},setState:next=>{context.state=next},paint:()=>context.render(),byId:id=>context.document.getElementById(id)});return context}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture(){
 const results=[],toasts=[],writes=[],controls=[{disabled:false,isConnected:true}];
 const footer={portrait:{innerHTML:''},speaker:{textContent:''},tip:{textContent:''},attrs:{}};
 const dialog={querySelector:selector=>selector==='.companion-portrait'?footer.portrait:footer.speaker,setAttribute:(name,value)=>{footer.attrs[name]=value}};
 const context=vm.createContext({
  state:createState(),revision:1,workspaceReady:true,busy:false,exiting:false,page:'home',gardenTab:'pet',studyTab:'focus',
  act,activePet,normalize,petReaction,petSprite,PET_SPRITES,reactPet(){},render(){},clocks(){},schoolUI:{sync(){}},focusKey,restoreFocus,
  // 碰上存档锁时的等待用真计时器；上限缩短到 200 毫秒，免得每个用例都等满 3 秒（真实值由下面的检查核对）。
  setTimeout,PET_BUSY_WAIT_MS:200,
  $:selector=>selector==='.companion-dialog'?dialog:selector==='#companion-tip'?footer.tip:null,
  document:{querySelectorAll:selector=>selector==='#main form[id]'?[]:controls,activeElement:null,getElementById:()=>null},toast:message=>toasts.push(message),networkResult(){},
  navigate:async(page,tab)=>{context.page=page;if(page==='study'&&tab)context.studyTab=tab;if(page==='garden'&&tab)context.gardenTab=tab;return true},
  szuDesktop:{petResult:result=>results.push({...result})},
  api:async(path,body)=>{assert.equal(path,'/api/workspace');writes.push(body);return {revision:context.revision+1}},
 });
 vm.runInContext(companionSource+careSource+handlers,bindCommit(context));
 context.paintCompanionDialog();
 return {context,results,toasts,writes,controls,footer,command:command=>context.handlePetCommand(command)};
}
function assertCompanion(f,pet=activePet(f.context.state.game)){
 assert.equal(f.footer.speaker.textContent,pet.name);
 assert.equal(f.footer.attrs['aria-label'],pet.name+'的小提示');
 assert.ok(f.footer.portrait.innerHTML.includes(`href="#${petSprite(pet)}"`));
 assert.ok(f.footer.portrait.innerHTML.includes(`viewBox="${PET_SPRITES[petSprite(pet)]}"`));
 assert.doesNotMatch(f.footer.portrait.innerHTML,/data-animated-pet/,'the footer must not become the main animation target');
}
let checks=0;
async function check(name,work){await work();checks++;console.log('PASS',name)}
await check('hidden care acknowledgements keep their own request IDs across a busy overlap',async()=>{
 const f=fixture(),gate=deferred(),save=f.context.api;
 f.context.api=async(...args)=>{await gate.promise;return save(...args)};
 const first=f.command({command:'pat',requestId:41}),second=f.command({command:'feed',requestId:42});
 await new Promise(resolve=>setTimeout(resolve,60));
 assert.equal(f.results.length,0,'the overlapping care waits for the save lock instead of being refused');
 gate.resolve();await first;await second;
 assert.deepEqual(f.results.map(r=>[r.requestId,r.ok]),[[41,true],[42,true]]);
 assert.equal(f.writes.length,2,'each care saves exactly once, the second on top of the first');assert.equal(f.writes[1].revision,2);
});
await check('a care that cannot get the save lock in time is refused after a bounded wait',async()=>{
 assert.match(source,/\nconst PET_BUSY_WAIT_MS=3000;\n/,'照料最多等 3 秒存档锁');
 assert.match(readFileSync(new URL('./electron/main-window.mjs',import.meta.url),'utf8'),/finish\(id\);onTimeout\(id\);\},30000\)/,'主进程等回执的时间要远长于页面等锁的时间');
 const f=fixture(),started=Date.now();f.context.busy=true;
 await f.command({command:'pat',requestId:5});
 assert.ok(Date.now()-started>=f.context.PET_BUSY_WAIT_MS,'先等，不立刻拒绝');
 assert.deepEqual(f.results,[{ok:false,message:'正在保存或处理上一项操作，请稍后再试',requestId:5}]);assert.equal(f.writes.length,0);
});
// B2：Electron 44.5.1 为隐藏主窗口里的照料关掉后台节流时，页面先收到 visible，指令随后才到，回执后又变回 hidden。
// 把 app.mjs 的跨日刷新、可见性和焦点接线放进同一个 vm：clocks 只替身成刷新日期（clocks 调用 refreshDay 由 check-workspace-ui 核对），
// 时间与一秒以上的定时器手动推进，等存档锁的短轮询用真计时器。存档停在「昨天」、来访不足 7 天，正是跨日后第一次照料的情形。
function wakeFixture(){
 const f=fixture(),c=f.context,events={},later=[],polls=[];let offset=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[Date.now()+offset]))}static now(){return Date.now()+offset}}
 const today=dayKey(Clock.now()),yesterday=dayKey(Clock.now()-86400000);
 c.state.preferences.onboarded=true;c.state.game.daily.day=yesterday;c.state.game.journey.days=[yesterday];
 Object.assign(c,{Date:Clock,dayKey,settle,paintDay(){},visitAttemptDay:'',clockInterval:null,clocks:()=>c.refreshDay(),pollNetwork:(...args)=>polls.push(args),
  flushPuzzle:async()=>{},backgroundTitle(){},setInterval:()=>0,clearInterval(){},clearTimeout(){},
  setTimeout:(fn,ms)=>ms>=1000?later.push(fn):setTimeout(fn,ms),window:{addEventListener:(type,fn)=>{events['window:'+type]=fn}}});
 c.document.hidden=true;c.document.addEventListener=(type,fn)=>{events[type]=fn};
 vm.runInContext(section("let shownDay='';",'function stampVersion('),c);
 for(const pattern of [/^document\.addEventListener\('visibilitychange'[^\n]*$/m,/^window\.addEventListener\('focus'[^\n]*$/m]){const line=pattern.exec(source)?.[0];assert.ok(line,'app.mjs 里找不到 '+pattern);vm.runInContext(line,c)}
 const flush=()=>new Promise(resolve=>setTimeout(resolve,20));
 return {...f,today,polls,
  show(){c.document.hidden=false;events.visibilitychange()},hide(){c.document.hidden=true;events.visibilitychange()},focus(){events['window:focus']()},
  // 过了 ms 毫秒：到期的「回到窗口」检查和秒级时钟各走一次，再等后台写入落盘。
  async pass(ms){offset+=ms;for(const fn of later.splice(0))fn();c.clocks();await flush()},
  visited:()=>c.state.game.journey.days.includes(today)};
}
await check('a command wake neither records the day\'s visit nor forces a network probe',async()=>{
 const w=wakeFixture();w.show();
 assert.equal(w.writes.length,0,'被唤醒成 visible 的那一刻不记来访');
 await w.command({command:'feed',requestId:7});
 assert.deepEqual(w.results.map(r=>[r.requestId,r.ok]),[[7,true]],'跨日后第一次隐藏照料不被「正在保存」拒绝');
 await w.pass(5000);
 assert.equal(w.writes.length,1,'只有照料这一笔');assert.equal(w.visited(),false);assert.deepEqual(w.polls,[],'命令唤醒不探测网络');
 // 回执后变回 hidden；同学之后真的打开主窗口：可见一会儿后记下当天来访，按 25 秒间隔补一次网络状态。
 w.hide();w.show();await w.pass(500);assert.equal(w.visited(),false,'刚变为可见还不算');
 await w.pass(1500);assert.equal(w.writes.length,2);assert.equal(w.visited(),true);assert.deepEqual(w.polls,[[false,true]]);
 // 命令唤醒期间同学用托盘打开了主窗口（页面已经可见，只多一次焦点）：从这一刻起照常记来访。
 const v=wakeFixture();v.show();await v.command({command:'pat',requestId:8});await v.pass(5000);assert.equal(v.visited(),false);
 v.focus();await v.pass(1000);assert.equal(v.visited(),true);
});
await check('a hidden care waits out a visit that is already being saved, then saves on top of it',async()=>{
 const w=wakeFixture(),gate=deferred(),save=w.context.api;
 w.context.api=async(...args)=>{await gate.promise;return save(...args)};
 w.show();await w.pass(2000);assert.equal(w.context.busy,true,'同学回到窗口，当天来访正在写');
 const care=w.command({command:'feed',requestId:9});
 await new Promise(resolve=>setTimeout(resolve,60));assert.equal(w.results.length,0);
 gate.resolve();await care;
 assert.deepEqual(w.results.map(r=>[r.requestId,r.ok]),[[9,true]]);
 assert.equal(w.writes.length,2);assert.ok(w.writes[1].data.game.journey.days.includes(w.today),'照料存在来访之后，不覆盖它');
});
await check('care commands save through the shared engine before reporting success',async()=>{
 const f=fixture(),initial=f.context.state,gate=deferred();
 const save=f.context.api;f.context.api=async(...args)=>{await gate.promise;return save(...args)};
 const pending=f.command('feed');
 assert.equal(f.context.busy,true);assert.equal(f.results.length,0);assert.equal(f.context.state,initial);
 gate.resolve();await pending;
 assert.equal(f.context.state.game.food,initial.game.food-1);
 assert.ok(activePet(f.context.state.game).hunger>activePet(initial.game).hunger);
 assert.equal(f.writes[0].revision,1);assert.equal(f.context.revision,2);
 assert.deepEqual(f.results,[{ok:true,message:activePet(f.context.state.game).say,action:'eat'}]);
 assert.equal(f.context.busy,false);assert.equal(f.controls[0].disabled,false);
 for(const command of ['pat','play','sleep','sleep'])await f.command(command);
 assert.equal(f.writes.length,5);assert.ok(f.results.every(r=>r.ok));
 assert.equal(activePet(f.context.state.game).sleeping,false);
 assert.equal(f.results.at(-2).action,'sleep');assert.equal(f.results.at(-1).action,'wake');
});
await check('cooldown and unavailable food are real failures without extra writes',async()=>{
 const f=fixture();await f.command('pat');await f.command('pat');
 assert.equal(f.writes.length,1);assert.equal(f.results.at(-1).ok,false);assert.match(f.results.at(-1).message,/10 秒/);
 f.context.state.game.food=0;await f.command('feed');
 assert.equal(f.writes.length,1);assert.equal(f.results.at(-1).ok,false);
});
await check('failed saves keep the original state and send an error instead of a success bubble',async()=>{
 for(const command of ['feed','switchPet:1']){
 const f=fixture(),original=f.context.state;
 f.context.api=async()=>{throw Error('磁盘暂时无法写入')};await f.command(command);
 assert.equal(f.context.state,original);assert.equal(f.context.revision,1);
 assertCompanion(f,activePet(original.game));
 assert.deepEqual(f.results,[{ok:false,message:'磁盘暂时无法写入'}]);
 assert.deepEqual(f.toasts,['磁盘暂时无法写入']);assert.equal(f.context.busy,false);
 }
});
await check('a conflicting save refreshes the latest record without pretending to apply care',async()=>{
 const f=fixture(),latest=createState();latest.game.food=8;
 f.context.api=async(_path,body)=>{if(body)throw Object.assign(Error('conflict'),{code:409});return {revision:4,data:latest}};
 await f.command('feed');assert.equal(f.context.revision,4);assert.equal(f.context.state.game.food,8);
 assert.equal(f.results[0].ok,false);assert.match(f.results[0].message,/尚未保存/);
});
await check('busy, startup, and shutdown reject commands explicitly',async()=>{
 for(const changed of [{busy:true},{workspaceReady:false},{state:null},{exiting:true}]){
  const f=fixture();Object.assign(f.context,changed);await f.command('feed');
  assert.equal(f.writes.length,0);assert.equal(f.results.length,1);assert.equal(f.results[0].ok,false);
 }
});
await check('a failed workspace load does not present the placeholder pet as the real companion',async()=>{
 const f=fixture();vm.runInContext('workspaceFailure={message:"存档时间异常",raw:null}',f.context);f.context.paintCompanionDialog();
 assert.equal(f.footer.speaker.textContent,'小提示');assert.equal(f.footer.attrs['aria-label'],'庭院的小提示');
 assert.match(f.footer.tip.textContent,/伙伴们都还在原存档里/);assert.ok(!f.footer.portrait.innerHTML.includes(`href="#${petSprite(activePet(f.context.state.game))}"`),'页脚不画占位伙伴');
 vm.runInContext('workspaceFailure=null',f.context);f.context.paintCompanionDialog();assertCompanion(f);
});
await check('navigation selects the requested real page and the correct garden section',async()=>{
 const f=fixture();await f.command('farm');assert.equal(f.context.page,'garden');assert.equal(f.context.gardenTab,'farm');
 await f.command('garden');assert.equal(f.context.page,'garden');assert.equal(f.context.gardenTab,'pet');
 f.context.studyTab='grades';await f.command('study');assert.equal(f.context.page,'study');assert.equal(f.context.studyTab,'focus','专注通知与托盘学习入口必须回到专注分区');await f.command('home');assert.equal(f.context.page,'home');
 assert.equal(f.writes.length,0);assert.equal(f.results.length,4);assert.ok(f.results.every(r=>r.ok));
});
await check('the pet study command waits for notebook navigation and does not change its tab early',async()=>{
 const f=fixture(),gate=deferred(),requests=[];f.context.page='study';f.context.studyTab='notes';
 f.context.navigate=async(page,tab)=>{requests.push({page,tab});await gate.promise;f.context.page=page;f.context.studyTab=tab;return true};
 const pending=f.command('study');
 assert.equal(f.context.page,'study');assert.equal(f.context.studyTab,'notes','the note editor must remain the active subtab while saving');
 assert.equal(f.results.length,0,'cannot report that study opened while its save gate is pending');
 assert.deepEqual(requests,[{page:'study',tab:'focus'}]);gate.resolve();await pending;
 assert.equal(f.context.studyTab,'focus');assert.equal(f.results.length,1);assert.equal(f.results[0].ok,true);
});
await check('a blocked notebook navigation reports failure to the pet without changing the current tab',async()=>{
 const f=fixture();f.context.page='study';f.context.studyTab='notes';f.context.navigate=async()=>false;
 await f.command('study');assert.equal(f.context.page,'study');assert.equal(f.context.studyTab,'notes');
 assert.equal(f.results.length,1);assert.equal(f.results[0].ok,false);assert.equal(f.writes.length,0);
});
await check('pet selection saves the active companion and refuses invalid or stale choices',async()=>{
 const f=fixture(),before=f.context.state.game.pets[0],gate=deferred(),save=f.context.api;
 f.context.state.game.pets[1].name='栗子队长';
 f.context.api=async(...args)=>{await gate.promise;return save(...args)};
 const pending=f.command('switchPet:1');assertCompanion(f,before);
 gate.resolve();await pending;
 assert.equal(f.context.state.game.active,1);assert.equal(f.results[0].ok,true);
 assertCompanion(f);
 assert.equal(f.context.state.game.pets[0].xp,before.xp);assert.equal(f.writes.length,1);
 assert.equal(f.results[0].action,'greet');assert.equal(f.results[0].message,activePet(f.context.state.game).say);
 for(const command of ['switchPet:1','switchPet:7','switchPet:8','switchPet:12','switchPet:-1','switchPet:0.5','switchPet:01','switchPet:1e1','switchPet:1\n','switchPet:constructor'])await f.command(command);
 assert.equal(f.writes.length,1);assert.ok(f.results.slice(1).every(result=>!result.ok));
 assertCompanion(f);
 assert.equal(f.results[3].message,'没有这个伙伴','well-formed index 8 must reach the engine length check');
 assert.equal(f.results[4].message,'没有这个伙伴','multi-digit indexes must reach the engine length check');
});
await check('the preload bridge supports future indexes beyond seven but only existing pets can be selected',async()=>{
 const f=fixture();let bridge,listener,pending;
 const context=vm.createContext({require:()=>({
  contextBridge:{exposeInMainWorld:(_key,value)=>{bridge=value}},
  ipcRenderer:{on:(_channel,fn)=>{listener=fn},removeListener(){},send(){}},
 })});
 vm.runInContext(readFileSync(new URL('./electron/preload.cjs',import.meta.url),'utf8'),context);
 bridge.onPetCommand(command=>{pending=f.command(command)});
 // Simulate a future catalog with eleven records without altering today's registry.
 while(f.context.state.game.pets.length<11)f.context.state.game.pets.push({...f.context.state.game.pets[0],name:'未来伙伴'+f.context.state.game.pets.length});
 for(const index of [8,10]){
  listener({sender:'private'},'switchPet:'+index);await pending;
  assert.equal(f.context.state.game.active,index);assert.equal(f.results.at(-1).ok,true);
 }
 assert.equal(f.writes.length,2);
 listener({sender:'private'},'switchPet:11');await pending;
 assert.equal(f.results.at(-1).ok,false);assert.equal(f.results.at(-1).message,'没有这个伙伴');
 assert.equal(f.writes.length,2);assert.equal(f.context.state.game.active,10);
});
await check('pet selection refreshes the name field instead of keeping the previous companion draft',async()=>{
 const f=fixture();let replaced=false;
 const oldForm={id:'pet-name-form'},newForm={replaceWith(){replaced=true}};
 f.context.document.querySelectorAll=selector=>selector==='#main form[id]'?[oldForm]:f.controls;
 f.context.document.getElementById=()=>newForm;
 await f.command('switchPet:1');assert.equal(f.results[0].ok,true);assert.equal(replaced,false);
});
await check('a care conflict that changes companion cannot attach the previous name draft',async()=>{
 const f=fixture(),latest=createState();latest.game.active=2;let restored=false;
 f.context.page='garden';
 f.context.document.querySelectorAll=selector=>selector==='#main form[id]'?[{id:'pet-name-form'}]:f.controls;
 f.context.document.getElementById=()=>({replaceWith(){restored=true}});
 f.context.api=async(_path,body)=>{if(body)throw Object.assign(Error('conflict'),{code:409});return {revision:5,data:latest}};
 await f.command('feed');
 assert.equal(f.context.state.game.active,2);assert.equal(restored,false);assert.equal(f.results[0].ok,false);
 assertCompanion(f,activePet(latest.game));
});
await check('the command boundary cannot trigger arbitrary game actions or inherited property names',async()=>{
 const f=fixture();for(const command of ['gift','shutdown','constructor','__proto__',null])await f.command(command);
 assert.equal(f.writes.length,0);assert.equal(f.results.length,5);assert.ok(f.results.every(r=>!r.ok));
});
await check('care leaves unrelated pages and their unfinished inputs in place',async()=>{
 for(const page of ['settings','network','services','study']){
  const f=fixture(),field={value:'未提交内容',isConnected:true,selectionStart:2,selectionEnd:3};
  f.context.page=page;f.context.document.activeElement=field;
  f.context.render=()=>{throw Error('不应重绘与照料无关的页面')};
  await f.command('feed');
  assert.equal(f.results[0].ok,true);assert.equal(f.context.document.activeElement,field);
  await f.command('switchPet:3');assert.equal(f.results.at(-1).ok,true);assertCompanion(f);
  assert.equal(f.context.document.activeElement,field);
  assert.equal(field.value,'未提交内容');assert.equal(field.selectionStart,2);assert.equal(field.selectionEnd,3);
 }
});
await check('care keeps the original form node, latest draft, focus, and selection across a repaint',async()=>{
 for(const conflict of [false,true]){
  const f=fixture(),gate=deferred();let focusOptions;
  const input={value:'一半',isConnected:true,selectionStart:1,selectionEnd:2,selectionDirection:'backward',
   focus(options){focusOptions=options;f.context.document.activeElement=this},
   setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction},
  };
  const secret={get value(){throw Error('不应读取或复制密码值')}};
  const originalForm={id:'todo-form',input,secret};let currentForm=originalForm;
  f.context.document.activeElement=input;
  f.context.document.querySelectorAll=selector=>selector==='#main form[id]'?[currentForm]:f.controls;
  f.context.document.getElementById=()=>currentForm;
  f.context.render=()=>{
   input.isConnected=false;f.context.document.activeElement=null;
   currentForm={replaceWith(node){currentForm=node;input.isConnected=true}};
  };
  const save=f.context.api;
  f.context.api=async(path,body)=>{await gate.promise;if(conflict){if(body)throw Object.assign(Error('conflict'),{code:409});return {revision:5,data:createState()}}return save(path,body)};
  const pending=f.command('feed');
  input.value='等待时又写了几字';input.selectionStart=3;input.selectionEnd=5;
  gate.resolve();await pending;
  assert.equal(currentForm,originalForm);assert.equal(currentForm.input,input);assert.equal(currentForm.secret,secret);
  assert.equal(input.value,'等待时又写了几字');assert.equal(f.context.document.activeElement,input);
  assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectionDirection],[3,5,'backward']);
  assert.equal(focusOptions.preventScroll,true);assert.equal(f.results[0].ok,!conflict);
  assert.ok(f.writes.every(body=>!JSON.stringify(body).includes('等待时又写了几字')));
 }
});
await check('care preserves the expanded snack panel after saving or refreshing a conflict',async()=>{
 assert.match(source,/<details id="pet-care-details" class="care-details">/);
 for(const open of [true,false])for(const conflict of [false,true]){
  const f=fixture();f.context.page='garden';let panel={open};
  f.context.document.getElementById=id=>id==='pet-care-details'?panel:null;
  f.context.render=()=>{panel={open:false}};
  if(conflict)f.context.api=async(_path,body)=>{if(body)throw Object.assign(Error('conflict'),{code:409});return {revision:5,data:createState()}};
  await f.command('feed');
  assert.equal(panel.open,open);assert.equal(f.results[0].ok,!conflict);
 }
});
await check('shell size updates change existing controls without saving back',()=>{
 const field={value:'1'},label={textContent:'100%'};let received,saves=0;
 const context=vm.createContext({
  $:selector=>({'#pet-scale':field,'#pet-scale-value':label})[selector],
  szuDesktop:{onPetScale:callback=>{received=callback},setPetScale:()=>{saves++}},
 });
 vm.runInContext(section('function showPetScale(','function render(){'),context);
 const registration=source.match(/globalThis\.szuDesktop\?\.onPetScale\?\.\(showPetScale\);/);
 assert.ok(registration);vm.runInContext(registration[0],context);
 received(1.35);assert.equal(field.value,'1.35');assert.equal(label.textContent,'135%');assert.equal(saves,0);
 context.$=()=>null;received(0.4);assert.equal(saves,0);
});
await check('preload strips IPC events, filters command names, and restricts result payloads',()=>{
 let bridge,listener,removed;const sent=[];
 const context=vm.createContext({require:()=>({
  contextBridge:{exposeInMainWorld:(_key,value)=>{bridge=value}},
  ipcRenderer:{on:(channel,fn)=>{assert.ok(['szu:pet-command','szu:pet-scale','szu:prepare-quit'].includes(channel));listener=fn},removeListener:(...args)=>{removed=args},send:(...args)=>sent.push(args)},
 })});
 vm.runInContext(readFileSync(new URL('./electron/preload.cjs',import.meta.url),'utf8'),context);
 const calls=[],unsubscribe=bridge.onPetCommand((...args)=>calls.push(args));
 const allowed=['pat','feed','play','sleep','garden','farm','study','home','switchPet:0','switchPet:7','switchPet:8','switchPet:10'];
 for(const command of [...allowed,'switchPet:-1','switchPet:0.5','switchPet:01','switchPet:+1','switchPet:1e1','switchPet:1\n','switchPet:','switchPet:__proto__','quit',{}])listener({sender:'private'},command);
 assert.deepEqual(calls.map(args=>args[0]),allowed);assert.ok(calls.every(args=>args.length===1));
 listener({}, {command:'feed',requestId:41});
 assert.equal(calls.at(-1)[0].command,'feed');assert.equal(calls.at(-1)[0].requestId,41);
 const received=calls.length;
 for(const payload of [{command:'feed'}, {command:'feed',requestId:-1}, {command:'feed',requestId:1.5}, {command:'quit',requestId:42}])listener({},payload);
 assert.equal(calls.length,received);
 unsubscribe();assert.equal(removed[0],'szu:pet-command');assert.equal(removed[1],listener);
 bridge.petResult({ok:true,message:'好'.repeat(121),secret:'never forward'});
 bridge.petResult({ok:'true',message:'invalid'});bridge.petResult({ok:true,message:5});
 assert.equal(sent.length,1);assert.equal(sent[0][0],'szu:pet-result');assert.equal(sent[0][1].message.length,120);
 assert.deepEqual(Object.keys(sent[0][1]),['ok','message']);assert.equal(Object.isFrozen(bridge),true);
 bridge.petResult({ok:false,message:'busy',requestId:41,secret:'never forward'});
 assert.equal(sent[1][1].requestId,41);assert.deepEqual(Object.keys(sent[1][1]),['ok','message','requestId']);
 const scales=[],removeScale=bridge.onPetScale((...args)=>scales.push(args));
 for(const scale of [0.4,1.35,2,'1',Infinity,NaN,0.3,3])listener({sender:'private'},scale);
 assert.deepEqual(scales,[[0.4],[1.35],[2]]);removeScale();assert.equal(removed[0],'szu:pet-scale');assert.equal(removed[1],listener);
});
 console.log(`${checks} pet command checks passed`);
