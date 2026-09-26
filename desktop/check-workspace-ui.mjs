import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CROPS,DECOR,createState,level,gardenLevel,normalize,settle,dayKey,act,activePet} from './assets/garden/engine.mjs';
import {todoView,focusView,weeklyView} from './assets/garden/productivity.mjs';
import {ordersView} from './assets/garden/arcade-ui.mjs';
import {reservedStock,sellableStock} from './assets/garden/garden-loop.mjs';
import {cropPurpose,readyOrders} from './assets/garden/garden-path.mjs';
import {projectScene} from './assets/garden/garden-loop-ui.mjs';

// Exercise the actual page handlers with an isolated DOM and workspace API.
const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
function section(start,end){
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert.ok(from>=0&&to>from,'page handler was not found');
 return source.slice(from,to);
}
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS',name)}

function sceneFixture(){
 let current=null;
 const mounts=[],nodes=new Map(),state=createState();state.preferences.homeSkin='lake';
 const context=vm.createContext({
  state,page:'home',revision:1,pages:{home:'今日',garden:'庭院'},pageIcons:{},Date,
  sprite:()=>'',pageHTML:()=>'',paintCompanionDialog(){},clocks(){},
  document:{body:{dataset:{}},querySelector:()=>current},
  api:async()=>({revision:2}),
  loadSceneRenderer:async()=>({mountHomeScene(host,options){
   const instance={host,options,destroyed:0,destroy(){this.destroyed++}};
   host.canvas={};mounts.push(instance);return instance;
  }}),
 });
 const main={set innerHTML(_html){
  if(current)current.isConnected=false;
  current=context.page==='home'&&context.state.preferences.homeSkin!=='pixel'?{
   dataset:{homeScene:context.state.preferences.homeSkin},isConnected:true,
   querySelector:()=>({textContent:''}),
   replaceWith(host){this.isConnected=false;host.isConnected=true;current=host},
  }:null;
 }};
 context.$=selector=>selector==='#main'?main:nodes.get(selector)||nodes.set(selector,{}).get(selector);
 context.mountGardenPlayers=()=>context.mountHomeScenery();
 vm.runInContext(section('let homeScene=','function mountGardenPlayers(').replace("import('./home-scene-renderer.mjs')",'loadSceneRenderer()')+
  section('async function commit(','function renderPetCare(')+section('function render(){','function pageHTML('),context);
 return {context,mounts,host:()=>current,render(skin=context.state.preferences.homeSkin,page='home'){
  context.state.preferences.homeSkin=skin;context.page=page;context.render();
 }};
}
const sceneTick=()=>new Promise(resolve=>setImmediate(resolve));
await check('home repaints and successful task saves keep the same scene and canvas',async()=>{
 const f=sceneFixture();f.render();await sceneTick();const host=f.host(),canvas=host.canvas;
 for(let i=0;i<3;i++)f.render();
 assert.equal(f.host(),host);assert.equal(f.host().canvas,canvas);assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].destroyed,0);
 const next=structuredClone(f.context.state);next.todos.push({text:'读完这一章'});
 let release;f.context.api=()=>new Promise(resolve=>{release=resolve});
 const save=f.context.commit(next);assert.equal(f.context.state.todos.length,0);assert.equal(f.host(),host);
 release({revision:2});await save;await sceneTick();
 assert.equal(f.context.state.todos.length,1);assert.equal(f.host(),host);assert.equal(f.host().canvas,canvas);assert.equal(f.mounts.length,1);
});
await check('skin, motion and page changes release the old scene while returning mounts a fresh one',async()=>{
 const f=sceneFixture();f.render();await sceneTick();const first=f.host();
 f.render('bookshop');await sceneTick();assert.equal(f.mounts[0].destroyed,1);assert.notEqual(f.host(),first);assert.equal(f.mounts.length,2);
 f.context.state.preferences.motion=false;f.render();await sceneTick();
 assert.equal(f.mounts[1].destroyed,1);assert.equal(f.mounts[2].options.motion,false);
 f.render('bookshop','garden');assert.equal(f.host(),null);assert.equal(f.mounts[2].destroyed,1);
 f.render('bookshop');await sceneTick();assert.equal(f.mounts.length,4);
 f.render('pixel');assert.equal(f.host(),null);assert.equal(f.mounts[3].destroyed,1);
});
await check('pending scene imports and late mounts cannot revive a replaced view',async()=>{
 const f=sceneFixture(),imports=[];const loader=f.context.loadSceneRenderer;
 f.context.loadSceneRenderer=()=>new Promise(resolve=>imports.push(resolve));
 f.render('lake');f.render('bookshop');f.render('pixel');
 for(const resolve of imports)resolve(await loader());await sceneTick();
 assert.equal(f.mounts.length,0);assert.equal(f.host(),null);
 let finish;const late={destroyed:0,destroy(){this.destroyed++}};
 f.context.loadSceneRenderer=async()=>({mountHomeScene:()=>new Promise(resolve=>{finish=resolve})});
 f.render('lake');await sceneTick();f.render('pixel');finish(late);await sceneTick();assert.equal(late.destroyed,1);
 // A repaint while import is pending must reuse the connected host too.
 let imported;f.context.loadSceneRenderer=()=>new Promise(resolve=>{imported=resolve});
 f.render('lake');const waiting=f.host();f.render('lake');assert.equal(f.host(),waiting);
 imported(await loader());await sceneTick();assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].host,waiting);
});

function farmFixture(){
 let now=new Date(2026,8,27,12).getTime(),requests=0;const handlers={},nodes=new Map(),readyLabels=[];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const state=createState(now),seeds={value:'radish',innerHTML:'',isConnected:true,disabled:false},title={textContent:''};
 const details={innerHTML:''},actions={writes:0,current:null,contains(node){return node===this.current},querySelector(){return this.current},set innerHTML(value){this.html=value;this.writes++;if(this.current)this.current.isConnected=false;this.current={isConnected:true,disabled:/disabled/.test(value),focus(){context.document.activeElement=this}}},get innerHTML(){return this.html||''}};
 const plots=state.game.plots.map((p,i)=>{const classes=new Set(),el={dataset:{farmPlot:String(i),growth:''},attrs:{},disabled:false,isConnected:true,html:'',ready:{dataset:{},textContent:''},soil:{classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)}},setAttribute(name,value){this.attrs[name]=value},querySelector(){return this.soil},set innerHTML(value){this.html=value;classes.clear();for(const c of /class="soil ([^"]+)"/.exec(value)?.[1].split(' ')||[])classes.add(c);const due=/data-ready="(\d+)"/.exec(value);this.ready.dataset.ready=due?due[1]:''},get innerHTML(){return this.html}};readyLabels.push(el.ready);return el});
 for(const [id,node] of Object.entries({'farm-selected-title':title,'farm-plot-details':details,'farm-plot-actions':actions,'seed-choice':seeds}))nodes.set(id,node);
 const money={outerHTML:''},basket={outerHTML:''},daily={outerHTML:''},activity={hidden:true};
 const context=vm.createContext({state,CROPS,Date:Clock,gardenLevel,reservedStock,cropPurpose,readyOrders,projectScene,selectedCrop:'radish',selectedPlot:0,petPlayer:null,page:'garden',gardenTab:'farm',busy:false,revision:1,settle:s=>settle(s,now),act:(s,a)=>act(s,a,now),activePet,normalize,structuredClone,
  document:{activeElement:seeds,title:'',getElementById:id=>nodes.get(id)||null,querySelector:selector=>({'.garden-tools .wallet':money,'.harvest-basket':basket,'#activity-bar':activity}[selector]||null),querySelectorAll:selector=>selector==='[data-farm-plot]'?plots:selector==='.daily-board'?[daily]:selector==='[data-ready]'?readyLabels.filter(x=>x.dataset.ready):selector==='#main button, #main select, #main input[type=file]'?[...plots,seeds,actions.current].filter(Boolean):[],addEventListener:(name,fn)=>{handlers[name]=fn}},
  btn:(text,action,extra='')=>`<button data-action="${action}" ${extra}>${text}</button>`,sprite:()=>'',cat:()=>'<svg data-animated-pet></svg>',cropIcon:key=>`<svg data-crop-icon="${key}"></svg>`,dailyBoard:g=>`daily:${g.daily.plant}/${g.daily.harvest}`,wallet:g=>`coins:${g.coins}`,
  render(){assert.fail('田块交互不应重绘整个页面')},renderPetCare(){assert.fail('田块交互不应重绘旁边表单')},exiting:false,refreshDay(){},paintGardenPath(){},toast(){},petActionMessage:()=>'',reactPet(){},actionReward:()=>null,
  schoolUI:{click:async()=>false,sync(){}},officialUI:{click:async()=>false},campusUI:{click:async()=>false},pianoUI:{click:async()=>false},
  api:async(path,data)=>{assert.equal(path,'/api/workspace');assert.ok(data?.data);requests++;return {revision:requests+1}},
 });
 context.$=selector=>context.document.querySelector(selector);
 vm.runInContext(section('const $=','const pageIcons=')+section('function plotGrowth(','function market(')+section('function countdown(','function stampVersion(')+section('async function commit(','function renderPetCare(')+section('async function run(','// 只有下列公开查询')+section('function clocks(){','function paintDay('),context);
 vm.runInContext(section("document.addEventListener('click'","document.addEventListener('submit'")+section("document.addEventListener('change'",'let exiting='),context);
 context.renderFarmState();
 return {context,plots,seeds,title,details,actions,money,basket,now:()=>now,advanceTo:t=>{now=t},requests:()=>requests,
  click(action,index){handlers.click({target:{closest:()=>({dataset:{action,index:String(index)}})},preventDefault(){}})},
  changeCrop(value){seeds.value=value;handlers.change({target:{id:'seed-choice',value,dataset:{}}})}};
}
const farmTick=()=>new Promise(resolve=>setImmediate(resolve));
await check('six scene plots are keyboard buttons and share one operation panel',()=>{
 const f=farmFixture(),html=f.context.farm(f.context.state.game),field=html.slice(html.indexOf('<div class="plots"'),html.indexOf('<p class="farm-kind"'));
 assert.equal((field.match(/<button type="button"/g)||[]).length,6);assert.equal((field.match(/data-action="selectPlot"/g)||[]).length,6);
 assert.equal((field.match(/aria-pressed="true"/g)||[]).length,1);assert.equal((field.match(/aria-controls="farm-controls"/g)||[]).length,6);
 assert.doesNotMatch(field,/data-action="(?:plant|water|harvest|unlock)"/);assert.equal((html.match(/id="seed-choice"/g)||[]).length,1);assert.equal((html.match(/id="farm-plot-actions"/g)||[]).length,1);
 assert.match(html,/data-action="water" data-index="0"/);
});
await check('selecting a plot and changing seeds keep the scene, selected input and nearby drafts',()=>{
 const f=farmFixture();f.context.state.game.seeds.radish=0;f.click('selectPlot',1);
 assert.equal(f.context.selectedPlot,1);assert.equal(f.plots[1].attrs['aria-pressed'],'true');assert.equal(f.plots[0].attrs['aria-pressed'],'false');assert.match(f.actions.innerHTML,/种子不足.*去集市/);
 const scene=f.plots.map(el=>el.innerHTML),detailsBefore=f.details.innerHTML;
 f.changeCrop('strawberry');assert.equal(f.context.selectedCrop,'strawberry');assert.match(f.actions.innerHTML,/data-action="plant" data-index="1"/);assert.match(f.actions.innerHTML,/种下草莓/);assert.notEqual(f.details.innerHTML,detailsBefore);
 assert.deepEqual(f.plots.map(el=>el.innerHTML),scene,'换种子不应重挂场景');assert.equal(f.context.document.activeElement,f.seeds);assert.equal(f.seeds.value,'strawberry');assert.equal(f.requests(),0);
 f.context.busy=true;f.click('selectPlot',2);assert.equal(f.context.selectedPlot,1);f.changeCrop('radish');assert.equal(f.context.selectedCrop,'strawberry','写操作中不能更改播种选择');
});
await check('the selected locked plot shows the actual opening cost and spends on that plot only',async()=>{
 const f=farmFixture();f.click('selectPlot',3);assert.match(f.details.innerHTML,/需要 60 荔枝币/);assert.match(f.actions.innerHTML,/data-action="unlock" data-index="3" disabled/);
 f.context.state.game.coins=60;f.context.renderFarmSelection();assert.doesNotMatch(f.actions.innerHTML,/disabled/);f.click('unlock',3);await farmTick();
 assert.equal(f.requests(),1);assert.equal(f.context.state.game.plots[3],null);assert.equal(f.context.state.game.plots[4],'locked');assert.equal(f.context.state.game.coins,0);assert.equal(f.money.outerHTML,'coins:0');assert.match(f.actions.innerHTML,/data-action="plant" data-index="3"/);
 f.click('selectPlot',4);assert.match(f.details.innerHTML,/需要 90 荔枝币/);assert.match(f.actions.innerHTML,/90 币 · 不足/);
});
await check('planting, watering, clock maturity and harvesting update the chosen panel without remounting seeds',async()=>{
 const f=farmFixture();f.click('selectPlot',1);f.changeCrop('strawberry');const seedCount=f.context.state.game.seeds.strawberry;
 f.click('plant',1);await farmTick();assert.equal(f.context.state.game.seeds.strawberry,seedCount-1);assert.equal(f.context.state.game.plots[1].crop,'strawberry');assert.match(f.actions.innerHTML,/data-action="water" data-index="1"/);
 assert.match(f.seeds.innerHTML,new RegExp('草莓 · '+(seedCount-1)+' 颗'));assert.equal(f.seeds.value,'strawberry');assert.equal(f.plots[1].dataset.growth,'growing');
 const beforeWater=f.context.state.game.plots[1].ready;f.advanceTo(f.now()+1000);f.click('water',1);await farmTick();const ready=f.context.state.game.plots[1].ready;
 assert.ok(ready<beforeWater);assert.match(f.actions.innerHTML,/disabled>已浇水/);assert.equal(f.plots[1].dataset.growth,'growing');
 f.changeCrop('radish');f.context.document.activeElement=f.seeds;const writes=f.actions.writes;f.advanceTo(ready);f.context.clocks();
 assert.equal(f.plots[1].dataset.growth,'ready');assert.ok(f.plots[1].soil.classList.contains('ready'));assert.ok(!f.plots[1].soil.classList.contains('growing'));
 assert.match(f.plots[1].ready.textContent,/成熟啦/);assert.match(f.details.innerHTML,/成熟啦/);assert.match(f.plots[1].attrs['aria-label'],/可以收获/);assert.match(f.actions.innerHTML,/data-action="harvest" data-index="1"/);
 assert.equal(f.context.document.activeElement,f.seeds);assert.equal(f.seeds.value,'radish');assert.equal(f.actions.writes,writes+1);f.context.clocks();assert.equal(f.actions.writes,writes+1,'成熟后的时钟不应每秒重挂操作按钮');
 f.click('harvest',1);await farmTick();assert.equal(f.context.state.game.plots[1],null);assert.equal(f.context.state.game.stock.strawberry,2);assert.match(f.basket.outerHTML,/草莓<\/strong><small>× 2/);assert.match(f.actions.innerHTML,/种下小萝卜/);assert.equal(f.requests(),3);assert.equal(f.plots[1].attrs['aria-pressed'],'true');
});

function exportFixture(api){
 let click,pending,blob;
 const local=createState();
 const context=vm.createContext({
  state:local,revision:1,createState,normalize,Blob,Date,
  api,toast:()=>{},setTimeout:()=>{},render:()=>{},
  officialUI:{click:async()=>false},schoolUI:{click:async()=>false},campusUI:{click:async()=>false},pianoUI:{click:async()=>false},run:work=>{pending=work()},
  document:{addEventListener:(_,handler)=>{click=handler},createElement:()=>({click:()=>{}})},
  URL:{createObjectURL:value=>{blob=value;return 'blob:workspace-test'},revokeObjectURL:()=>{}},
 });
 vm.runInContext(section("document.addEventListener('click'","document.addEventListener('submit'"),context);
 return {
  async download(){
   click({target:{closest:()=>({dataset:{action:'export'}})},preventDefault:()=>{}});
   await pending;
   return JSON.parse(await blob.text());
  },
  hasDownload:()=>!!blob,
 };
}
await check('backup includes the latest save from another window',async()=>{
 const latest=createState();latest.todos.push({id:'new-task',text:'另一窗口已保存的待办',done:false,rewarded:false,date:'',createdAt:0,completedAt:0,archived:false});
 let reads=0;
 const fixture=exportFixture(async path=>{assert.equal(path,'/api/workspace');reads++;return {version:1,revision:2,data:latest}});
 const backup=await fixture.download();
 assert.equal(reads,1);assert.deepEqual(backup.todos,latest.todos);
});
await check('failed workspace reads do not silently export stale data',async()=>{
 const fixture=exportFixture(async()=>{throw Error('workspace unavailable')});
 await assert.rejects(()=>fixture.download(),/workspace unavailable/);
 assert.equal(fixture.hasDownload(),false);
});
await check('onboarding flag is explicit and survives a save round trip',()=>{
 const fresh=createState();
 assert.equal(fresh.preferences.onboarded,false,'新存档必须还没看过引导');
 const round=JSON.parse(JSON.stringify(fresh));round.preferences.onboarded=true;
 assert.equal(normalize(round,Date.now()).preferences.onboarded,true);
 const junk=JSON.parse(JSON.stringify(fresh));junk.preferences.onboarded='yes';
 assert.equal(normalize(junk,Date.now()).preferences.onboarded,false,'truthy 字符串不能当成已看过引导');
});

await check('dismissing the guide records it once and keeps other preferences',async()=>{
 const local=createState();local.preferences.theme='night';local.preferences.motion=false;
 const committed=[],toasts=[];
 const context=vm.createContext({state:local,structuredClone,toast:m=>toasts.push(m)});
 context.commit=async next=>{committed.push(next);context.state=next};
 vm.runInContext(section('function showGuide(','function todoHTML('),context);
 await vm.runInContext('markOnboarded()',context);
 assert.equal(committed.length,1);
 assert.equal(committed[0].preferences.onboarded,true);
 assert.equal(committed[0].preferences.theme,'night','记录引导状态不能顺手改掉用户选的庭院光线');
 assert.equal(committed[0].preferences.motion,false);
 assert.equal(toasts.length,0);
 await vm.runInContext('markOnboarded()',context);
 assert.equal(committed.length,1,'已经看过引导就不该再写一次存档');
});

await check('a failed onboarding save is reported, not swallowed',async()=>{
 const local=createState();const toasts=[];
 const context=vm.createContext({state:local,structuredClone,toast:m=>toasts.push(m),commit:async()=>{throw Error('另一个窗口更新了存档')}});
 vm.runInContext(section('function showGuide(','function todoHTML('),context);
 await vm.runInContext('markOnboarded()',context);
 assert.equal(toasts.length,1,'存档没写成功却不告诉用户，下次打开会莫名再弹一次');
 assert.match(toasts[0],/另一个窗口更新了存档/);
});

await check('first run opens the guide, settings save keeps the flag',()=>{
 assert.match(source,/if\(!state\.preferences\.onboarded\)showGuide\(\)/,'启动时没有按存档状态决定是否展示引导');
 assert.match(source,/next\.preferences=\{\.\.\.next\.preferences,theme:d\.theme,motion:!!d\.motion\}/,'保存设置会把「已看过引导」丢掉，用户每次打开都会被再教一遍');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(html,/<dialog id="guide"><form method="dialog">/);
 assert.match(html,/数据只在本机/);
 assert.match(html,/Esc 关掉/,'必须写明可以跳过，否则用户以为每次打开都会弹');
});

await check('midnight refresh updates daily cards without replacing drafts and writes one visit',async()=>{
 const before=new Date(2026,8,27,23,59).getTime(),now=new Date(2026,8,28,0,1).getTime();
 const current=createState(before);current.game.daily.gift=true;
 current.todos=[{id:'yesterday',text:'昨天计划的小事',done:false,archived:false,date:'2026-09-27',createdAt:before,completedAt:0}];
 current.game.focusHistory=[{endedAt:new Date(2026,8,21,12).getTime(),minutes:5,task:'滚出七日窗口的旧专注'},{endedAt:before,minutes:25,task:'最近完成的专注'}];
 const field={value:'跨日仍未提交的草稿',selectionStart:3,selectionEnd:6},form={id:'todo-form',field};
 const today={innerHTML:''},board={outerHTML:''},gift={disabled:true,innerHTML:''},todoState={outerHTML:''},week={outerHTML:''};
 const plannedDate={value:'2026-09-27',defaultValue:'2026-09-27'};
 const writes=[];let pending;
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const context=vm.createContext({state:current,busy:false,workspaceReady:true,visitAttemptDay:'',page:'study',gardenTab:'pet',todoFilter:'open',Date:Clock,settle,dayKey,act,todoView,weeklyView,
  sprite:()=>'',dailyBoard:g=>`daily:${g.daily.day}:${g.daily.gift}`,
  document:{activeElement:field,getElementById:id=>id==='today'?today:id==='todo-form'?form:id==='todo-date'?plannedDate:null,
   querySelectorAll:selector=>selector==='.daily-board'?[board]:selector==='[data-action="gift"]'?[gift]:selector==='.todo-state'?[todoState]:[],querySelector:selector=>selector==='.weekly-card'?week:null},
  render:()=>{throw Error('跨日刷新不得重建整个页面')},
 });
 context.commit=async(next,_draft,paint)=>{writes.push(next);context.state=next;paint()};
 context.run=work=>{pending=work();return pending};
 vm.runInContext(section('function paintDay(','function countdown('),context);
 context.refreshDay();await pending;
 assert.equal(context.state.game.daily.day,'2026-09-28');assert.equal(gift.disabled,false);assert.match(gift.innerHTML,/领取每日补给/);
 assert.equal(board.outerHTML,'daily:2026-09-28:false');assert.match(today.innerHTML,/9月28日/);
 assert.equal(plannedDate.value,'2026-09-28');assert.equal(plannedDate.defaultValue,'2026-09-28','没有改过的计划日期随新一天更新');
 assert.match(todoState.outerHTML,/尚未完成 · 2026-09-27/);assert.doesNotMatch(todoState.outerHTML,/<form|id="todo-text"/,'仅替换清单状态，不替换草稿表单');
 assert.match(week.outerHTML,/<strong>25<\/strong> 分钟专注/);assert.doesNotMatch(week.outerHTML,/滚出七日窗口的旧专注/);
 assert.equal(context.document.activeElement,field);assert.equal(context.document.getElementById('todo-form'),form);
 assert.equal(field.value,'跨日仍未提交的草稿');assert.deepEqual([field.selectionStart,field.selectionEnd],[3,6]);
 assert.equal(writes.length,1);assert.ok(writes[0].game.journey.days.includes('2026-09-28'));
 context.refreshDay();await pending;assert.equal(writes.length,1,'秒级时钟不得反复写入同一天来访');
 context.state=current;context.busy=true;context.refreshDay();
 assert.equal(context.state,current);assert.equal(writes.length,1,'正在写存档时不应与跨日刷新竞争');
 for(const chosen of ['2026-09-30','']){plannedDate.value=chosen;plannedDate.defaultValue='2026-09-27';context.paintDay('2026-09-27');assert.equal(plannedDate.value,chosen,'用户改过或清空的日期不能被跨日更新覆盖');}
 assert.match(source,/function clocks\(\)\{[^]*?refreshDay\(\)/);
 assert.match(source,/addEventListener\('visibilitychange',[^]*?if\(!document\.hidden\)clocks\(\)/);
});

await check('midnight refreshes order reservations and sale quantities while retaining the arcade board',()=>{
 const before=new Date(2026,8,27,23,59).getTime(),now=new Date(2026,8,28,0,1).getTime();
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 for(const tab of ['market','arcade']){
  const current=settle(createState(before),before);current.preferences.motion=false;
  // Keep the first offer deliverable so its real submit ID identifies the day;
  // an unfilled offer now routes to its missing crop instead of a disabled ID.
  current.game.stock.radish=10;
  current.game.puzzle.qualifiedDay='2026-09-27';current.game.puzzle.earnedDay='2026-09-27';
  current.game.orders.completed=current.game.orders.offers.map(order=>order.id);current.game.orders.total=3;
  const orderCard={outerHTML:ordersView(current.game,{crops:CROPS})},board={id:'existing-board',listeners:{keydown:()=>{}}},paints=[];
  const main={board,set innerHTML(_value){assert.fail('跨日不得重挂整个游戏角或棋盘')}};
  let marketMarkup='',marketRenders=0;
  const context=vm.createContext({state:current,busy:false,workspaceReady:false,visitAttemptDay:'',page:'garden',gardenTab:tab,todoFilter:'open',Date:Clock,settle,dayKey,CROPS,DECOR,ordersView,gardenLevel,reservedStock,sellableStock,cropIcon:()=>'',sprite:()=>'',cat:()=>'',esc:String,
   btn:(text,action,extra='')=>`<button data-action="${action}" ${extra}>${text}</button>`,
   document:{activeElement:board,getElementById:id=>id==='main'?main:null,querySelector:selector=>selector==='.garden-orders'?orderCard:null,querySelectorAll:()=>[]},
   paintArcade:(root,game,options)=>paints.push({root,game,options}),
   render(){assert.equal(tab,'market','跨日不能重建游戏角');marketRenders++;marketMarkup=context.market(context.state.game)},mountGardenPlayers(){assert.fail('跨日不能重新绑定棋盘')},
  });
  vm.runInContext(section('function market(','function journal('),context);
  marketMarkup=context.market(current.game);
  assert.match(marketMarkup,/出售多余 ×6/,'昨天的委托全部完成时只预留建设材料');
  vm.runInContext(section('function paintDay(','function countdown('),context);
  context.refreshDay();
  assert.equal(context.state.game.daily.day,'2026-09-28');assert.equal(context.state.game.orders.day,'2026-09-28');
  if(tab==='market'){
   assert.match(marketMarkup,/data-id="2026-09-28:0"/);assert.doesNotMatch(marketMarkup,/data-id="2026-09-27:/);
   assert.match(marketMarkup,/今日 <b>0 \/ 3<\/b>/);assert.equal(paints.length,0);assert.equal(marketRenders,1);
   const game=context.state.game,reserved=Math.min(game.stock.radish,reservedStock(game).radish),sale=sellableStock(game,'radish');
   assert.ok(sale<6,'新委托会预留更多萝卜');
   assert.match(marketMarkup,new RegExp(`为委托和下一项建设留 ${reserved} 个`));
   assert.match(marketMarkup,new RegExp(`data-action="sellSurplus" data-crop="radish" ${sale?'':'disabled'}>出售多余 ×${sale}`));
  }else{
   assert.equal(paints.length,1);assert.equal(paints[0].root,main);assert.equal(paints[0].game.daily.day,'2026-09-28');
   assert.equal(paints[0].game.puzzle.earnedDay,'2026-09-27','旧领奖日期不能被改成今天，画面需按新的一天重新判断');
   assert.equal(paints[0].options.reducedMotion,true);assert.equal(main.board,board);assert.equal(context.document.activeElement,board);
   assert.equal(typeof board.listeners.keydown,'function');assert.match(orderCard.outerHTML,/data-id="2026-09-27:0"/,'未展示的集市无需重画');
  }
  context.refreshDay();assert.equal(paints.length,tab==='arcade'?1:0,'当天的秒级时钟不得重复重画棋盘');assert.equal(marketRenders,tab==='market'?1:0,'当天的秒级时钟不得反复重绘集市');
 }
});

await check('study sections display only their requested tools and honor student level',()=>{
 const context=vm.createContext({state:createState(),studyTab:'focus',head:()=>'',sectionNav:()=>'',focusView:()=>'<section id="focus-only"></section>',
  todoHTML:()=>'<form id="todo-only"></form>',weeklyView:()=>'<section id="week-only"></section>',
  officialUI:{card:()=>'<section id="official-only"></section>'},academicUI:{card:()=>'<section id="calendar-only"></section>'},
  schoolUI:{loginCard:()=>'<section id="graduate-login-only"></section>',timetableCard:level=>`<section id="timetable-${level}"></section>`},
  campusUI:{grades:()=>'<section id="grades-only"></section>'}});
 vm.runInContext(section('function study(){','function settings(){'),context);
 let html=context.study();assert.match(html,/focus-only/);assert.match(html,/todo-only/);assert.match(html,/week-only/);
 assert.doesNotMatch(html,/official-only|calendar-only|timetable-|grades-only|id="student-level"/);
 context.studyTab='timetable';html=context.study();
 assert.match(html,/timetable-undergrad/);assert.match(html,/calendar-only/);assert.match(html,/id="student-level"/);
 assert.doesNotMatch(html,/graduate-login-only|focus-only|todo-only|week-only|grades-only/);
 context.state.preferences.studentLevel='graduate';html=context.study();assert.match(html,/graduate-login-only/);assert.match(html,/timetable-graduate/);
 context.studyTab='grades';html=context.study();assert.match(html,/grades-only/);assert.match(html,/id="student-level"/);
 assert.doesNotMatch(html,/calendar-only|timetable-graduate|graduate-login-only|focus-only|todo-only|week-only/);
});

await check('campus service sections do not mount unrelated forms or booking tools',()=>{
 const context=vm.createContext({serviceTab:'spaces',head:()=>'',sectionNav:()=>'',serviceResults:()=>'<div id="directory-links-only"></div>',
  officialUI:{card:()=>'<section id="official-only"></section>'},campusUI:{services:section=>`<section id="${section}-only">${section==='directory'?'<div id="directory-phones-only"></div>':''}</section>`},
  pianoUI:{section:()=>'<section id="piano-only"></section>'}});
 vm.runInContext(section('function servicesPage(){','function serviceResults('),context);
 for(const selected of ['spaces','notices','directory','piano']){
  context.serviceTab=selected;const html=context.servicesPage();assert.ok(html.includes(`id="${selected}-only"`));
  for(const other of ['spaces','notices','directory','piano'].filter(x=>x!==selected))assert.ok(!html.includes(`id="${other}-only"`));
  if(selected==='spaces')assert.match(html,/official-only/);else assert.doesNotMatch(html,/official-only/);
  if(selected==='directory'){assert.match(html,/directory-links-only/);assert.match(html,/directory-phones-only/)}else assert.doesNotMatch(html,/directory-links-only|directory-phones-only/);
 }
});

function formFixture(){
 const listeners={},nodes=new Map(),writes=[],messages=[],reactions=[];
 const draft={value:'还没添加的想法',isConnected:true,selectionStart:2,selectionEnd:5};
 const date={value:'2026-09-30'},todoForm={id:'todo-form',elements:{todo:draft,date}};
 const focusPanel={outerHTML:''},weekPanel={outerHTML:''};
 let pending,fullRenders=0;
 nodes.set('todo-form',todoForm);nodes.set('todo-text',draft);nodes.set('todo-date',date);nodes.set('focus-task',{value:''});
 const context=vm.createContext({
  state:createState(),revision:1,busy:false,page:'study',studyTab:'focus',gardenTab:'pet',act,activePet,normalize,structuredClone,
  focusView,weeklyView,actionReward:()=>null,petActionMessage:()=>'',reactPet(action){reactions.push({action,revision:context.revision})},confirm:async()=>true,
  schoolUI:{click:async()=>false,submit:async()=>false},campusUI:{click:async()=>false,submit:async()=>false},officialUI:{click:async()=>false},pianoUI:{click:async()=>false},
  toast:message=>messages.push(message),
  document:{activeElement:draft,addEventListener:(name,callback)=>{listeners[name]=callback},getElementById:id=>nodes.get(id)||null,
   querySelector:selector=>selector==='.focus-studio'?focusPanel:selector==='.weekly-card'?weekPanel:null},
  FormData:class {constructor(form){return new Map(Object.entries(form.elements).filter(([,value])=>typeof value==='object'&&(value.type!=='checkbox'||value.checked)).map(([name,field])=>[name,field.value]));}},
  render:()=>{fullRenders++;draft.value='';},
 });
 context.run=work=>{pending=work();return pending;};
 context.api=async(path,body)=>{assert.equal(path,'/api/workspace');writes.push(body);return {revision:context.revision+1};};
 vm.runInContext(section('async function commit(','function renderPetCare('),context);
 vm.runInContext(section('function renderStudyProgress(){','function home(){'),context);
 vm.runInContext(section("document.addEventListener('click'","document.addEventListener('input'"),context);
 return {context,nodes,writes,messages,reactions,draft,date,todoForm,focusPanel,weekPanel,get fullRenders(){return fullRenders},
  click:(action,extra={})=>{listeners.click({target:{closest:()=>({dataset:{action,...extra}})},preventDefault(){}});return pending;},
  submit:form=>{listeners.submit({target:form,preventDefault(){}});return pending;},
 };
}

await check('editing a todo uses a non-clobbering identifier and saves through the real handlers',async()=>{
 const markup=readFileSync(new URL('./index.html',import.meta.url),'utf8').match(/<form id="todo-edit-form">[\s\S]*?<\/form>/)?.[0];
 assert.ok(markup);assert.doesNotMatch(markup,/\bname="id"/,'名为 id 的表单项会覆盖 form.id，导致提交分支失配');
 const f=formFixture(),elements={};
 for(const input of markup.matchAll(/<input\b[^>]*\bname="([^"]+)"[^>]*>/g))elements[input[1]]={value:''};
 elements.namedItem=name=>elements[name]||null;
 const form={id:'todo-edit-form',elements};
 // HTMLFormElement exposes named inputs as properties, including built-in names.
 for(const [name,field] of Object.entries(elements))if(typeof field==='object')form[name]=field;
 let opened=0,closed=0;
 f.nodes.set('todo-edit-form',form);f.nodes.set('todo-editor',{showModal(){opened++;},close(){closed++;}});
 f.context.state.todos=[{id:'edit-me',text:'旧的内容',date:'2026-09-27',createdAt:0,completedAt:0,done:false,rewarded:false,archived:false}];
 await f.click('todoEditOpen',{id:'edit-me'});
 assert.equal(opened,1);assert.equal(form.id,'todo-edit-form');assert.equal(elements.todoId.value,'edit-me');assert.equal(elements.text.value,'旧的内容');
 elements.text.value='修改后的内容';elements.date.value='2026-09-30';
 await f.submit(form);
 assert.equal(f.writes.length,1);assert.equal(f.context.state.todos[0].id,'edit-me');assert.equal(f.context.state.todos[0].text,'修改后的内容');
 assert.equal(f.context.state.todos[0].date,'2026-09-30');assert.equal(closed,1);assert.equal(f.context.revision,2);
 assert.match(f.messages.at(-1),/已保存/);
});

await check('focus start, custom start, claim and cancel preserve the adjacent todo draft',async()=>{
 for(const action of ['focusStart','focusClaim','focusCancel','customStart']){
  const f=formFixture();
  if(action==='focusClaim'||action==='focusCancel')f.context.state.game.focus={end:Date.now()+(action==='focusClaim'?-1:60000),duration:5};
  let release;const gate=new Promise(resolve=>{release=resolve}),save=f.context.api;
  f.context.api=async(...args)=>{await gate;return save(...args);};
  const pending=action==='customStart'?f.submit({id:'focus-form',elements:{minutes:{value:'7'}}}):f.click(action,{minutes:'5'});
  // The user keeps typing while the save is pending; preserve the latest draft.
  f.draft.value='等待时又补了一行';f.draft.selectionStart=4;f.draft.selectionEnd=7;
  assert.equal(f.reactions.length,0,'pending saves do not notify the desktop pet');
  release();await pending;
  assert.equal(f.writes.length,1,action);assert.equal(f.fullRenders,0,action+' should update focus/history without repainting the todo form');
  assert.equal(f.nodes.get('todo-form'),f.todoForm);assert.equal(f.draft.value,'等待时又补了一行');assert.equal(f.date.value,'2026-09-30');
  assert.equal(f.context.document.activeElement,f.draft);assert.deepEqual([f.draft.selectionStart,f.draft.selectionEnd],[4,7]);
  assert.ok(!JSON.stringify(f.writes).includes('等待时又补了一行'),'unsaved draft must not leak into the workspace save');
  assert.match(f.focusPanel.outerHTML,/focus-studio/);assert.match(f.weekPanel.outerHTML,/weekly-card/);
  assert.equal(Boolean(f.context.state.game.focus),action==='focusStart'||action==='customStart');
  assert.deepEqual(f.reactions,[{action:action==='customStart'?'focusStart':action,revision:2}],'all focus paths notify the pet immediately after saving');
  if(action==='customStart')assert.equal(f.context.state.game.focus.duration,7);
 }
});

await check('saving the animation preference immediately syncs the desktop pet only after the save',async()=>{
 const f=formFixture(),notifications=[];
 f.context.szuDesktop={petResult:result=>notifications.push({result,motion:f.context.state.preferences.motion,revision:f.context.revision})};
 let release;const gate=new Promise(resolve=>{release=resolve}),save=f.context.api;
 f.context.api=async(...args)=>{await gate;return save(...args)};
 const form={id:'profile-form',elements:{name:{value:'庭院同学'},college:{value:'深大'},theme:{value:'night'},motion:{type:'checkbox',checked:false,value:'on'}}};
 const pending=f.submit(form);
 await farmTick();assert.equal(notifications.length,0,'pending settings must not reach the pet');
 release();await pending;
 assert.equal(f.writes.length,1);assert.equal(f.context.state.preferences.motion,false);assert.equal(f.context.state.preferences.theme,'night');
 assert.equal(notifications.length,1);assert.deepEqual(JSON.parse(JSON.stringify(notifications[0])),{result:{ok:true,message:''},motion:false,revision:2});
 assert.equal(f.fullRenders,1);assert.match(f.messages.at(-1),/已保存/);
});

await check('failed animation preference saves do not tell the desktop pet they succeeded',async()=>{
 const f=formFixture(),notifications=[];
 f.context.szuDesktop={petResult:result=>notifications.push(result)};
 f.context.api=async()=>{throw Error('workspace write failed')};
 const originalMotion=f.context.state.preferences.motion;
 const form={id:'profile-form',elements:{name:{value:'庭院同学'},college:{value:''},theme:{value:'day'},motion:{type:'checkbox',checked:!originalMotion,value:'on'}}};
 await assert.rejects(()=>f.submit(form),/workspace write failed/);
 assert.equal(notifications.length,0);assert.equal(f.context.state.preferences.motion,originalMotion);assert.equal(f.fullRenders,0);assert.equal(f.messages.length,0);
});
console.log(`${checks} workspace UI checks passed`);
