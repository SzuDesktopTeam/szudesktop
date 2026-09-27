import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CROPS,DECOR,createState,level,gardenLevel,normalize,settle,dayKey,act,activePet} from './assets/garden/engine.mjs';
import {todoView,focusView,weeklyView} from './assets/garden/productivity.mjs';
import {ordersView} from './assets/garden/arcade-ui.mjs';
import {movePuzzle} from './assets/garden/puzzle2048.mjs';
import {reservedStock,sellableStock} from './assets/garden/garden-loop.mjs';
import {cropPurpose,readyOrders} from './assets/garden/garden-path.mjs';
import {projectScene} from './assets/garden/garden-loop-ui.mjs';
import {homeSkinPicker} from './assets/garden/home-skins.mjs';
import {createReleaseUI} from './assets/garden/release-ui.mjs';
import {createFeedbackUI} from './assets/garden/feedback.mjs';
import {readRoute,routeHash} from './assets/garden/routes.mjs';
import {countdown,remaining,recordOnboarded} from './assets/garden/app-logic.mjs';
import {createWorkspaceCommit} from './assets/garden/workspace-commit.mjs';
import {focusKey,restoreFocus,formEdited,refreshDraft} from './assets/garden/shell-repaint.mjs';
import {esc} from './assets/garden/html.mjs';

// Exercise the actual page handlers with an isolated DOM and workspace API.
const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
function section(start,end){
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert.ok(from>=0&&to>from,'page handler was not found');
 return source.slice(from,to);
}
// commit() 来自 workspace-commit.mjs；按 app.mjs 的接线绑到 vm 上下文里的 state、revision 与 workspaceFailure。
function bindCommit(context){if(!('workspaceFailure' in context))context.workspaceFailure=null;context.commit=createWorkspaceCommit({api:(...args)=>context.api(...args),normalize:data=>context.normalize(data),read:()=>({failure:context.workspaceFailure,revision:context.revision}),setRevision:next=>{context.revision=next},setState:next=>{context.state=next},paint:()=>context.render(),byId:id=>context.document.getElementById(id)});return context}
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS',name)}

await check('home harvest counter and invitation update together as a crop matures without repainting drafts',()=>{
 let now=new Date(2026,8,27,12).getTime();
 class Clock extends Date{static now(){return now}}
 const state=createState(now),counter={textContent:''},harvest={textContent:''},bar={},draft={value:'还没提交的小事'};
 const context=vm.createContext({state,page:'home',busy:false,exiting:false,Date:Clock,refreshDay(){},paintGardenPath(){},tickFarm(){},
  document:{activeElement:draft,querySelector:selector=>selector==='[data-home-ready]'?counter:null,querySelectorAll:()=>[]},
  $:selector=>({'#home-harvest-label':harvest,'#activity-bar':bar}[selector]),
 });
 vm.runInContext(section('function clocks(){','function paintDay('),context);
 context.clocks();assert.equal(counter.textContent,'0');assert.match(harvest.textContent,/去看看/);
 now=state.game.plots[0].ready;context.clocks();
 assert.equal(counter.textContent,'1');assert.match(harvest.textContent,/1 块田可以收获/);
 assert.equal(context.document.activeElement,draft);assert.equal(draft.value,'还没提交的小事');
 state.game.plots[0]=null;context.clocks();assert.equal(counter.textContent,'0');assert.match(harvest.textContent,/去看看/);
});

function sceneFixture(){
 let current=null;
 const mounts=[],nodes=new Map(),state=createState();state.preferences.homeSkin='lake';
 const context=vm.createContext({
  state,page:'home',studyTab:'focus',serviceTab:'spaces',revision:1,pages:{home:'今日',garden:'庭院',study:'学习',services:'校园服务'},pageIcons:{},Date,
  sprite:()=>'',pageHTML:()=>'',paintCompanionDialog(){},clocks(){},focusKey,restoreFocus,refreshDraft,
  document:{body:{dataset:{}},activeElement:null,querySelector:selector=>selector==='[data-home-scene]'?current:null},
  api:async()=>({revision:2}),
  loadSceneRenderer:async()=>({mountHomeScene(host,options){
   const instance={host,options,destroyed:0,destroy(){this.destroyed++}};
   host.canvas={};mounts.push(instance);return instance;
  }}),
 });
 const main={set innerHTML(_html){
  if(current)current.isConnected=false;
  // Every room now has the same live campus window, not just the home page.
  current=context.state.preferences.homeSkin!=='pixel'?{
   dataset:{homeScene:context.state.preferences.homeSkin},isConnected:true,
   querySelector:()=>({textContent:''}),
   replaceWith(host){this.isConnected=false;host.isConnected=true;current=host},
  }:null;
 }};
 context.$=selector=>selector==='#main'?main:nodes.get(selector)||nodes.set(selector,{}).get(selector);
 context.mountGardenPlayers=()=>context.mountHomeScenery();
 vm.runInContext(section('let homeScene=','function mountGardenPlayers(').replace("import('./home-scene-renderer.mjs')",'loadSceneRenderer()')+
  section('function render(){','function pageHTML('),bindCommit(context));
 return {context,mounts,host:()=>current,render(skin=context.state.preferences.homeSkin,page='home'){
  context.state.preferences.homeSkin=skin;context.page=page;context.render();
 }};
}
const sceneTick=()=>new Promise(resolve=>setImmediate(resolve));
await check('page repaints reattach the actual notebook editor with draft, selection and scroll intact',()=>{
 const state=createState(),nodes=new Map(),focusCalls=[],mounts=[];
 let noteHost,visibleNotebook;
 const body={dataset:{}},editor={value:'第一段还没保存\n第二段继续写',selectionStart:3,selectionEnd:9,selectionDirection:'backward',scrollTop:67,
  get isConnected(){return noteHost.isConnected},focus(options){assert.ok(this.isConnected);focusCalls.push(options);context.document.activeElement=this}};
 noteHost={isConnected:true,contains:el=>el===editor};visibleNotebook=noteHost;
 const main={set innerHTML(_html){
  visibleNotebook.isConnected=false;context.document.activeElement=body;
  visibleNotebook={isConnected:true,contains:()=>false,replaceWith(original){this.isConnected=false;original.isConnected=true;visibleNotebook=original}};
 }};
 const context=vm.createContext({state,page:'study',studyTab:'notes',serviceTab:'spaces',pages:{study:'学习书屋'},pageIcons:{},Date,
  sprite:()=>'',pageHTML:()=>'<section data-notebook>new placeholder</section>',paintCompanionDialog(){},clocks(){},mountGardenPlayers(){},focusKey,restoreFocus,refreshDraft,
  notebookUI:{mount(root){assert.equal(root,main);mounts.push(visibleNotebook)}},
  document:{body,activeElement:editor,querySelector:selector=>selector==='[data-notebook]'?visibleNotebook:null,getElementById:id=>id==='main'?main:null},
  $:selector=>selector==='#main'?main:nodes.get(selector)||nodes.set(selector,{}).get(selector),
 });
 vm.runInContext(section('function render(){','function pageHTML('),context);
 for(let i=0;i<3;i++)context.render();
 assert.equal(visibleNotebook,noteHost,'must reattach the original notebook, not reconstruct it from saved text');
 assert.equal(context.document.activeElement,editor);assert.equal(editor.value,'第一段还没保存\n第二段继续写');
 assert.deepEqual([editor.selectionStart,editor.selectionEnd,editor.selectionDirection,editor.scrollTop],[3,9,'backward',67]);
 assert.equal(mounts.length,3);assert.ok(mounts.every(host=>host===noteHost));
 assert.equal(focusCalls.length,3);assert.ok(focusCalls.every(options=>options.preventScroll===true));
});
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
await check('room rendering enters notices only when the notice tab is visible',()=>{
 const f=sceneFixture();let entered=0;f.context.campusUI={enterNotices(){entered++}};
 f.render('pixel','services');assert.equal(entered,0);
 f.context.serviceTab='notices';f.render('pixel','services');assert.equal(entered,1);
 f.render('pixel','home');assert.equal(entered,1);
 f.context.serviceTab='spaces';f.render('pixel','services');assert.equal(entered,1);
});
await check('moving between rooms reuses the campus canvas; skin, motion and pixel changes release it',async()=>{
 const f=sceneFixture();f.render();await sceneTick();const first=f.host();
 f.render('bookshop');await sceneTick();assert.equal(f.mounts[0].destroyed,1);assert.notEqual(f.host(),first);assert.equal(f.mounts.length,2);
 f.context.state.preferences.motion=false;f.render();await sceneTick();
 assert.equal(f.mounts[1].destroyed,1);assert.equal(f.mounts[2].options.motion,false);
 const room=f.host(),canvas=room.canvas;
 for(const page of ['garden','study','services','home']){
  f.render('bookshop',page);await sceneTick();assert.equal(f.host(),room);assert.equal(f.host().canvas,canvas);assert.equal(f.mounts[2].destroyed,0);assert.equal(f.mounts.length,3);
 }
 f.render('pixel','study');assert.equal(f.host(),null);assert.equal(f.mounts[2].destroyed,1);
 f.render('bookshop','study');await sceneTick();assert.equal(f.mounts.length,4);assert.notEqual(f.host(),room);
});
await check('business-page header windows draw a still frame while the homepage keeps its motion',async()=>{
 const f=sceneFixture(),calls=[];
 // 页头小窗由 campusRoomHeader 输出 .campus-room-scene；首页大图没有这个类名。
 const make=still=>({dataset:{homeScene:'lake'},isConnected:true,classList:{contains:name=>still&&name==='campus-room-scene'},querySelector:()=>({textContent:''}),replaceWith(host){this.isConnected=false;host.isConnected=true;hosts.current=host}});
 const hosts={current:make(true)};f.context.document.querySelector=selector=>selector==='[data-home-scene]'?hosts.current:null;
 f.context.page='study';f.context.mountHomeScenery();await sceneTick();
 assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].options.motion,false,'页头小窗只画静帧');
 f.mounts[0].setMotion=value=>calls.push(value);
 hosts.current=make(false);f.context.page='home';f.context.mountHomeScenery();
 assert.equal(f.mounts.length,1,'同一块画布移到首页，不重建 WebGL');assert.deepEqual(calls,[true],'回到首页恢复动画');
 hosts.current=make(true);f.context.page='settings';f.context.mountHomeScenery();assert.deepEqual(calls,[true,false]);
 f.context.state.preferences.motion=false;hosts.current=make(false);f.context.mountHomeScenery();await sceneTick();
 assert.equal(f.mounts.length,2);assert.equal(f.mounts[1].options.motion,false,'关闭动画时首页也只画静帧');
});
// 用假 WebGL、假场景和假帧循环执行真实的 mountHomeScene：去掉 import，导出改成普通函数。
async function sceneRenderer(options){
 const text=readFileSync(new URL('./assets/garden/home-scene-renderer.mjs',import.meta.url),'utf8');
 const body=text.replace(/^import .*$/gm,'').replace('export async function mountHomeScene','async function mountHomeScene');
 const shadows=[],frames=new Map(),vec=()=>({set(){return this},copy(){return this},addScaledVector(){return this},sub:()=>({length:()=>1}),setScalar(){}});
 let resized=null,frameId=0;
 const renderer={shadowMap:{},setPixelRatio(){},dispose(){},forceContextLoss(){}};
 const uniforms=()=>new Proxy({},{get:(target,key)=>target[key]??={value:{set(){}}}});
 class Light{constructor(){this.position=vec();this.target={position:vec()};this.shadow={mapSize:vec(),camera:{},dispose(){}}}}
 const context=vm.createContext({
  THREE:{WebGLRenderer:function(){return renderer},SRGBColorSpace:'srgb',NoToneMapping:0,PCFShadowMap:1,Scene:class{add(){}traverse(){}clear(){}},
   PerspectiveCamera:class{constructor(){this.position=vec();this.far=240}lookAt(){}updateProjectionMatrix(){}},Vector3:function(){return vec()},Fog:class{},DirectionalLight:Light,HemisphereLight:Light},
  // 与 three.js 一致：带着 needsUpdate 渲染一帧后，阴影贴图重画一次并清掉标记。
  Pipeline:class{constructor(){this.ink={mat:{uniforms:uniforms()}};this.size={x:320,y:96}}setSize(){}render(){shadows.push(!!renderer.shadowMap.needsUpdate);renderer.shadowMap.needsUpdate=false}dispose(){}},
  buildSky:()=>({dome:{position:vec(),material:{uniforms:uniforms()}},clouds:{position:vec(),scale:vec()}}),PAL:{},setOutlineResolution(){},
  buildCampusScene:()=>({camera:{target:[0,0,0],position:[0,4,12]},lighting:{},update(){}}),
  document:{hidden:false,createElement:()=>({style:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}}),addEventListener(){},removeEventListener(){}},
  matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),performance:{now:()=>0},
  ResizeObserver:class{constructor(fn){resized=fn}observe(){}disconnect(){}},IntersectionObserver:class{observe(){}disconnect(){}},
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id),
 });
 const mount=vm.runInContext(body+'\nmountHomeScene',context);
 const container={isConnected:true,dataset:{},append(){},querySelector:()=>null,getBoundingClientRect:()=>({width:320,height:96})};
 const scene=await mount(container,options);
 const frame=now=>{const [id,fn]=[...frames].at(-1)||[];if(!fn)return false;frames.delete(id);fn(now);return true};
 return {scene,renderer,shadows,frames,frame,resize:()=>resized(),container};
}
await check('the scene draws its static shadow map once per mount or resize, not on every animated frame',async()=>{
 const home=await sceneRenderer({skin:'lake',motion:true});
 assert.equal(home.renderer.shadowMap.autoUpdate,false,'静止的阴影不能每帧重画');
 assert.deepEqual(home.shadows,[true],'挂载后第一帧画出阴影');assert.equal(home.container.dataset.sceneMode,'animated');
 for(const now of [100,200,300])assert.equal(home.frame(now),true,'首页大图保持动画帧循环');
 assert.deepEqual(home.shadows,[true,false,false,false],'动画帧不重画阴影贴图');
 home.resize();assert.deepEqual(home.shadows.slice(-1),[true],'尺寸变化后重画一次阴影');
 home.frame(400);home.frame(500);assert.deepEqual(home.shadows.slice(-2),[false,false]);
 home.scene.destroy();assert.equal(home.frames.size,0,'销毁后不再排帧');
 const header=await sceneRenderer({skin:'lake',motion:false});
 assert.deepEqual(header.shadows,[true]);assert.equal(header.frames.size,0,'页头小窗只画一帧静图，不排动画帧');assert.equal(header.container.dataset.sceneMode,'still');
 header.scene.setMotion(true);assert.equal(header.frames.size,1,'同一块画布移到首页时恢复动画');assert.equal(header.container.dataset.sceneMode,'animated');
 header.scene.setMotion(false);assert.equal(header.frames.size,0,'移回页头小窗时停止排帧');assert.deepEqual(header.shadows,[true,false,false]);
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
 const context=vm.createContext({state,CROPS,Date:Clock,esc,gardenLevel,reservedStock,cropPurpose,readyOrders,projectScene,selectedCrop:'radish',selectedPlot:0,petPlayer:null,page:'garden',gardenTab:'farm',busy:false,revision:1,settle:s=>settle(s,now),act:(s,a)=>act(s,a,now),activePet,normalize,structuredClone,
  document:{activeElement:seeds,title:'',getElementById:id=>nodes.get(id)||null,querySelector:selector=>({'.garden-tools .wallet':money,'.harvest-basket':basket,'#activity-bar':activity}[selector]||null),querySelectorAll:selector=>selector==='[data-farm-plot]'?plots:selector==='.daily-board'?[daily]:selector==='[data-ready]'?readyLabels.filter(x=>x.dataset.ready):selector==='#main button, #main select, #main input[type=file]'?[...plots,seeds,actions.current].filter(Boolean):[],addEventListener:(name,fn)=>{handlers[name]=fn}},
  btn:(text,action,extra='')=>`<button data-action="${action}" ${extra}>${text}</button>`,sprite:()=>'',cat:()=>'<svg data-animated-pet></svg>',cropIcon:key=>`<svg data-crop-icon="${key}"></svg>`,dailyBoard:g=>`daily:${g.daily.plant}/${g.daily.harvest}`,wallet:g=>`coins:${g.coins}`,
  render(){assert.fail('田块交互不应重绘整个页面')},renderPetCare(){assert.fail('田块交互不应重绘旁边表单')},exiting:false,refreshDay(){},paintGardenPath(){},toast(){},petActionMessage:()=>'',reactPet(){},actionReward:()=>null,
  schoolUI:{click:async()=>false,sync(){}},officialUI:{click:async()=>false},campusUI:{click:async()=>false},pianoUI:{click:async()=>false},focusKey,restoreFocus,
  api:async(path,data)=>{assert.equal(path,'/api/workspace');assert.ok(data?.data);requests++;return {revision:requests+1}},
 });
 context.$=selector=>context.document.querySelector(selector);
 // 倒计时文字来自 app-logic.mjs，按这里的测试时钟计算。
 Object.assign(context,{countdown:end=>countdown(end,now),remaining:end=>remaining(end,now)});
 vm.runInContext(section('const $=','const pageIcons=')+section('function plotGrowth(','function market(')+section('async function run(','// 只有下列公开查询')+section('function clocks(){','function paintDay('),bindCommit(context));
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
  state:local,revision:1,busy:false,createState,normalize,Blob,Date,
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
 const context={state:local};
 const commit=async next=>{committed.push(next);context.state=next},markOnboarded=()=>recordOnboarded(context.state,{commit,toast:m=>toasts.push(m)});
 assert.match(source,/\nfunction markOnboarded\(\)\{return recordOnboarded\(state,\{commit,toast\}\)\}\n/,'页面记录引导状态必须走 recordOnboarded');
 await markOnboarded();
 assert.equal(committed.length,1);
 assert.equal(committed[0].preferences.onboarded,true);
 assert.equal(committed[0].preferences.theme,'night','记录引导状态不能顺手改掉用户选的庭院光线');
 assert.equal(committed[0].preferences.motion,false);
 assert.equal(toasts.length,0);
 await markOnboarded();
 assert.equal(committed.length,1,'已经看过引导就不该再写一次存档');
});

await check('a failed onboarding save is reported, not swallowed',async()=>{
 const local=createState();const toasts=[];
 await recordOnboarded(local,{toast:m=>toasts.push(m),commit:async()=>{throw Error('另一个窗口更新了存档')}});
 assert.equal(toasts.length,1,'存档没写成功却不告诉用户，下次打开会莫名再弹一次');
 assert.match(toasts[0],/另一个窗口更新了存档/);
});

await check('first run opens the guide, settings save keeps the flag',()=>{
 assert.match(source,/if\(workspaceReady&&!state\.preferences\.onboarded\)showGuide\(\)/,'启动时没有按存档状态决定是否展示引导；读档失败时不展示');
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
 vm.runInContext(section('function paintDay(','function stampVersion('),context);
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
 assert.match(source,/addEventListener\('visibilitychange',\(\)=>\{if\(!document\.hidden\)\{clocks\(\)/);
});

await check('a clock corrected back across midnight repaints once instead of every second',()=>{
 const ahead=new Date(2026,8,28,0,30).getTime();let now=new Date(2026,8,27,23,58).getTime();
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const current=settle(createState(ahead),ahead);let paints=0,renders=0;
 const context=vm.createContext({state:current,busy:false,workspaceReady:false,visitAttemptDay:'',page:'garden',gardenTab:'market',todoFilter:'open',Date:Clock,settle,dayKey,todoView,weeklyView,sprite:()=>'',dailyBoard:()=>'',
  document:{getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null},render(){renders++},paintArcade(){paints++},
 });
 vm.runInContext(section('function paintDay(','function stampVersion('),context);
 for(let i=0;i<5;i++){context.refreshDay();now+=1000}
 assert.equal(context.state.game.daily.day,'2026-09-28','存档日期不会倒退');assert.equal(renders,0,'时钟校正后不能每秒整页重绘集市');
 now=new Date(2026,8,28,0,1).getTime();context.refreshDay();assert.equal(renders,1,'本机日期真正变化时刷新一次');
 for(let i=0;i<5;i++){now+=1000;context.refreshDay()}assert.equal(renders,1);
 now=new Date(2026,8,29,0,1).getTime();context.refreshDay();assert.equal(context.state.game.daily.day,'2026-09-29');assert.equal(renders,2);
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
  vm.runInContext(section('function paintDay(','function stampVersion('),context);
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
  campusUI:{grades:()=>'<section id="grades-only"></section>'},workspaceFailure:null,workspaceFailureHTML:()=>'<section id="recovery-only"></section>',notebookUI:{view:()=>'<section id="notes-only"></section>'}});
 vm.runInContext(section('function study(){','function settings(){'),context);
 let html=context.study();assert.match(html,/focus-only/);assert.match(html,/todo-only/);assert.match(html,/week-only/);
 assert.doesNotMatch(html,/official-only|calendar-only|timetable-|grades-only|id="student-level"/);
 context.studyTab='timetable';html=context.study();
 assert.match(html,/timetable-undergrad/);assert.match(html,/calendar-only/);assert.match(html,/id="student-level"/);
 assert.doesNotMatch(html,/graduate-login-only|focus-only|todo-only|week-only|grades-only/);
 context.state.preferences.studentLevel='graduate';html=context.study();assert.match(html,/graduate-login-only/);assert.match(html,/timetable-graduate/);
 context.studyTab='grades';html=context.study();assert.match(html,/grades-only/);assert.match(html,/id="student-level"/);
 assert.doesNotMatch(html,/calendar-only|timetable-graduate|graduate-login-only|focus-only|todo-only|week-only/);
 context.workspaceFailure={message:'存档时间异常',raw:{}};
 for(const tab of ['focus','grades']){context.studyTab=tab;html=context.study();assert.match(html,/recovery-only/);assert.doesNotMatch(html,/focus-only|todo-only|grades-only|id="student-level"/,tab+' 依赖庭院存档，读档失败时不能显示占位数据')}
 context.studyTab='notes';assert.match(context.study(),/notes-only/,'课程笔记不依赖庭院存档');
 context.studyTab='timetable';html=context.study();assert.match(html,/timetable-graduate/);
 assert.match(html,/id="student-level"[^]*只在本次打开期间有效[^]*学期按官方校历计算/,'占位状态里的培养层次和学期不能冒充已保存的设置');
});

await check('campus service sections do not mount unrelated forms or booking tools',()=>{
 const context=vm.createContext({serviceTab:'spaces',head:()=>'',sectionNav:()=>'',serviceResults:()=>'<div id="directory-links-only"></div>',
  officialUI:{card:()=>'<section id="official-only"></section>'},campusUI:{services:section=>`<section id="${section}-only">${section==='directory'?'<div id="directory-phones-only"></div>':''}</section>`},
  pianoUI:{section:()=>'<section id="piano-only"></section>'}});
 vm.runInContext(section('function servicesPage(){','function serviceResults('),context);
 for(const selected of ['spaces','notices','directory','piano']){
  context.serviceTab=selected;const html=context.servicesPage();assert.ok(html.includes(`id="${selected}-only"`));
  for(const other of ['spaces','notices','directory','piano'].filter(x=>x!==selected))assert.ok(!html.includes(`id="${other}-only"`));
  assert.doesNotMatch(html,/official-only/,'学校登录入口已整合进对应业务，不再重复挂通用卡片');
  if(selected==='directory'){assert.match(html,/directory-links-only/);assert.match(html,/directory-phones-only/)}else assert.doesNotMatch(html,/directory-links-only|directory-phones-only/);
 }
});

await check('settings sections retain appearance, desktop controls, both backups and update tools in their own rooms',()=>{
 const context=vm.createContext({state:createState(),saved:true,appVersion:'beta0.9.3',settingsTab:'appearance',head:()=>'',sprite:()=>'',esc:String,homeSkinPicker,
  btn:(text,action,extra='',cls='')=>`<button class="${cls}" data-action="${action}" ${extra}>${text}</button>`,
  desktopUI:{card:()=>'<section id="desktop-options"></section>'},
  releaseUI:createReleaseUI({getVersion:()=> 'beta0.9.3',api:()=>assert.fail('rendering settings must not check updates automatically')}),
  feedbackUI:createFeedbackUI({getVersion:()=> 'beta0.9.3',getMode:()=> 'browser',toast(){}}),exitHint:()=> '退出方式',
  workspaceFailure:null,workspaceFailureHTML:()=>'<section id="recovery-only"></section>',
 });
 vm.runInContext(section('function sectionNav(','function servicesPage(')+section('function settings(){','function loadPetScale(){'),context);
 for(const [tab,required] of Object.entries({
  appearance:[/class="home-skin-picker" open/,/id="profile-form"/,/id="theme"/],
  desktop:[/id="autostart-state"/,/data-action="autostart"/],
  data:[/data-action="export"/,/data-action="notebookBackup"/,/id="import-file"/,/data-action="forget"/],
  about:[/id="release-panel"/,/data-action="release-check"/,/id="feedback-panel"/,/data-action="feedback-copy"/,/data-action="shutdown"/,/beta0.9.3/],
 })){
  context.settingsTab=tab;const html=context.settings();
  assert.match(html,new RegExp(`data-tab="${tab}" aria-pressed="true"`));
  for(const pattern of required)assert.match(html,pattern,`${tab} must keep ${pattern}`);
  if(tab!=='appearance')assert.doesNotMatch(html,/id="profile-form"/);
  if(tab!=='data')assert.doesNotMatch(html,/id="import-file"|data-action="notebookBackup"/);
  if(tab!=='about')assert.doesNotMatch(html,/id="release-panel"|id="feedback-panel"|data-action="shutdown"/);
  if(tab!=='desktop')assert.doesNotMatch(html,/id="autostart-state"|id="pet-scale"/);
 }
 context.settingsTab='desktop';context.szuDesktop={shell:'electron'};
 const installed=context.settings();assert.match(installed,/id="desktop-options"/);assert.match(installed,/id="pet-scale"/);assert.doesNotMatch(installed,/id="autostart-state"/,'installed Windows startup is owned by the Electron desktop preferences');
 context.workspaceFailure={message:'存档时间异常',raw:{}};
 for(const tab of ['appearance','data','desktop','about']){
  context.settingsTab=tab;const html=context.settings();assert.match(html,new RegExp(`data-tab="${tab}" aria-pressed="true"`),'读档失败时仍能切换设置分区');
  if(tab==='appearance'){assert.match(html,/recovery-only/);assert.doesNotMatch(html,/id="profile-form"/)}
  else if(tab==='data'){
   assert.match(html,/recovery-only/);
   // 删除凭据、备份笔记与从备份恢复都与庭院存档无关，读档失败时仍要可用；导出存档则由恢复卡的“导出原始存档”代替。
   for(const pattern of [/data-action="forget"/,/data-action="notebookBackup"/,/id="import-file"/])assert.match(html,pattern,`读档失败时 data 分区仍要保留 ${pattern}`);
   assert.doesNotMatch(html,/data-action="export"/);assert.match(html,/可以用以前导出的备份替换它/);
  }
  else assert.doesNotMatch(html,/recovery-only/);
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
 bindCommit(context);
 vm.runInContext(section('function renderStudyProgress(){','function home(){'),context);
 vm.runInContext(section("document.addEventListener('click'","document.addEventListener('input'"),context);
 return {context,nodes,writes,messages,reactions,draft,date,todoForm,focusPanel,weekPanel,get fullRenders(){return fullRenders},
  click:(action,extra={})=>{listeners.click({target:{closest:()=>({dataset:{action,...extra}})},preventDefault(){}});return pending;},
  submit:form=>{form.closest=()=>null;listeners.submit({target:form,preventDefault(){}});return pending;},
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

function profileForm(values){
 const field=(name,value,defaultValue=value)=>({name,value,defaultValue});
 return {id:'profile-form',elements:[field('name',values.name,values.savedName??values.name),field('college',values.college,values.savedCollege??values.college),{name:'motion',type:'checkbox',checked:values.motion,defaultChecked:values.savedMotion??values.motion}]};
}
await check('settings navigation keeps the original unsaved profile form in memory and same-room clicks do not repaint',async()=>{
 const state=createState(),nodes=new Map(),form=profileForm({name:'还没保存的昵称',savedName:'',college:'一段草稿',savedCollege:'',motion:false,savedMotion:true});
 const savedProfile=structuredClone(state.profile);let visible=form,repaints=0;
 const main={focus(){},set innerHTML(_html){repaints++;visible=context.page==='settings'&&context.settingsTab==='appearance'?{replaceWith(original){visible=original}}:null}};
 const context=vm.createContext({state,page:'settings',settingsTab:'appearance',studyTab:'notes',serviceTab:'spaces',gardenTab:'pet',settingsProfileDraft:null,busy:false,
  pages:{settings:'设置',home:'今日'},pageIcons:{},readRoute,routeHash,Date,sprite:()=>'',pageHTML:()=>'',paintCompanionDialog(){},clocks(){},focusKey,restoreFocus,formEdited,refreshDraft,pollNetwork(){},mountGardenPlayers(){},
  notebookUI:{leave:()=>assert.fail('settings navigation must not trigger the notebook save gate')},
  desktopUI:{load(){}},loadAutostart(){},loadPetScale(){},window:{scrollTo(){}},history:{replaceState(){},pushState(){}},
  document:{body:{dataset:{}},activeElement:null,querySelector:()=>null,getElementById:id=>id==='profile-form'?visible:null},
  $:selector=>selector==='#main'?main:nodes.get(selector)||nodes.set(selector,{}).get(selector),toast:message=>assert.fail(message),
 });
 vm.runInContext(section('function render(){','function pageHTML(')+section('let navigating=false;','let notifiedFocus='),context);
 await context.navigate('settings','appearance');assert.equal(repaints,0);assert.equal(visible,form);
 for(const tab of ['desktop','data','about']){
  await context.navigate('settings',tab);assert.equal(visible,null);assert.equal(context.settingsProfileDraft,form);
  await context.navigate('settings','appearance');assert.equal(visible,form);
 }
 await context.navigate('home');await context.navigate('settings','appearance');assert.equal(visible,form);
 assert.deepEqual(form.elements.map(field=>field.value??field.checked),['还没保存的昵称','一段草稿',false]);
 assert.deepEqual(state.profile,savedProfile,'changing rooms must not silently save the profile draft');
});
await check('an untouched profile form is not kept as a draft, and a kept draft picks up newer saved fields',async()=>{
 const state=createState();state.profile.name='窗口 A';
 let visible=profileForm({name:'窗口 A',college:'',motion:true}),fresh=null;
 const main={focus(){},set innerHTML(_html){visible=context.page==='settings'&&context.settingsTab==='appearance'?(fresh={...profileForm({name:context.state.profile.name,college:context.state.profile.college,motion:context.state.preferences.motion}),replaceWith(original){visible=original}}):null;if(fresh)fresh.elements.namedItem=name=>fresh.elements.find(field=>field.name===name)}};
 const context=vm.createContext({state,page:'settings',settingsTab:'appearance',studyTab:'notes',serviceTab:'spaces',gardenTab:'pet',settingsProfileDraft:null,busy:false,
  pages:{settings:'设置',home:'今日'},pageIcons:{},readRoute,routeHash,Date,sprite:()=>'',pageHTML:()=>'',paintCompanionDialog(){},clocks(){},focusKey,restoreFocus,formEdited,refreshDraft,pollNetwork(){},mountGardenPlayers(){},
  notebookUI:{leave:()=>assert.fail('settings navigation must not trigger the notebook save gate')},desktopUI:{load(){}},loadAutostart(){},loadPetScale(){},window:{scrollTo(){}},history:{replaceState(){},pushState(){}},
  document:{body:{dataset:{}},activeElement:null,querySelector:()=>null,getElementById:id=>id==='profile-form'?visible:null},
  $:selector=>selector==='#main'?main:{},toast:message=>assert.fail(message),
 });
 vm.runInContext(section('function render(){','function pageHTML(')+section('let navigating=false;','let notifiedFocus='),context);
 await context.navigate('home');assert.equal(context.settingsProfileDraft,null,'原样离开的表单不能留作草稿');
 context.state=structuredClone(state);context.state.profile.name='窗口 B';
 await context.navigate('settings','appearance');assert.equal(visible.elements[0].value,'窗口 B','回来时按另一个窗口保存的最新昵称显示');
 visible.elements[1].value='只改了学院';await context.navigate('home');assert.ok(context.settingsProfileDraft,'改过的表单留作草稿');
 context.state=structuredClone(context.state);context.state.profile.name='窗口 C';context.state.preferences.motion=false;
 await context.navigate('settings','appearance');
 assert.equal(visible,context.settingsProfileDraft,'回来时仍是原来的表单节点');
 assert.deepEqual(visible.elements.map(field=>field.value??field.checked),['窗口 C','只改了学院',false],'没改过的字段跟随最新存档，改过的学院保持草稿');
 assert.equal(visible.elements[0].defaultValue,'窗口 C');assert.equal(visible.elements[2].defaultChecked,false);
});
await check('saving a profile clears its in-memory form only after the write succeeds',async()=>{
 const f=formFixture(),form={id:'profile-form',elements:{name:{value:'  新名字  '},college:{value:'  新学院  '},theme:{value:'night'},motion:{type:'checkbox',checked:false,value:'on'}}};
 f.context.page='settings';f.context.settingsTab='appearance';f.context.settingsProfileDraft=form;
 const previous=structuredClone(f.context.state.profile),save=f.context.api;
 f.context.api=async()=>{throw Error('写入失败')};await assert.rejects(f.submit(form),/写入失败/);
 assert.equal(f.context.settingsProfileDraft,form);assert.deepEqual(f.context.state.profile,previous);assert.equal(f.fullRenders,0);
 f.context.api=save;await f.submit(form);
 assert.equal(f.context.settingsProfileDraft,null);assert.equal(f.context.state.profile.name,'新名字');assert.equal(f.context.state.profile.college,'新学院');
 assert.equal(f.context.state.preferences.theme,'night');assert.equal(f.context.state.preferences.motion,false);assert.equal(f.fullRenders,1);
});
function puzzleFixture(values=[2,2,4]){
 const state=createState();state.game.puzzle.board=[...values,...Array(16-values.length).fill(0)];
 const writes=[],paints=[],toasts=[],timers=[];let reply=null;
 const context=vm.createContext({state,revision:1,busy:false,exiting:false,page:'garden',gardenTab:'arcade',act,movePuzzle,normalize,activePet,structuredClone,
  petPlayer:null,paintGardenPath(){},wallet:()=>'',actionReward:()=>null,reactPet(){},showReward(){},confirm:async()=>true,toast:message=>toasts.push(message),
  paintArcade:(_root,game,options)=>paints.push({moves:game.puzzle.moves,animated:!!options.result}),
  document:{activeElement:null,getElementById:()=>({}),querySelector:()=>null,querySelectorAll:()=>[]},
  schoolUI:{sync(){}},clocks(){},networkResult(){},focusKey,restoreFocus,
  // 其他写入期间的排队轮询用真实计时；合并保存的延迟由测试手动触发。
  setTimeout:(fn,delay)=>{if(delay===40)return setTimeout(fn,0);timers.push({fn,delay});return timers.length},clearTimeout:id=>{if(timers[id-1])timers[id-1].cleared=true},
  api:async(path,body)=>{assert.equal(path,'/api/workspace');if(body)writes.push({revision:body.revision,moves:body.data.game.puzzle.moves,board:[...body.data.game.puzzle.board]});if(reply)return reply(body);return {revision:(body?.revision??0)+1}},
 });
 vm.runInContext(section('// 2048 走子先在本机生效','const btn=(text')+section('async function run(','// 只有下列公开查询'),bindCommit(context));
 const move=()=>{const direction=['left','right','up','down'].find(d=>movePuzzle(context.state.game.puzzle,d).changed);assert.ok(direction);context.puzzleMove(direction);return direction};
 const fire=async()=>{const due=timers.filter(timer=>!timer.cleared&&!timer.fired);due.forEach(timer=>{timer.fired=true;timer.fn()});await farmTick();await farmTick()};
 return {context,writes,paints,toasts,timers,move,fire,setReply:fn=>{reply=fn}};
}
await check('2048 moves apply at once and coalesce into one save after the player pauses',async()=>{
 const f=puzzleFixture();
 for(let i=0;i<3;i++)f.move();
 assert.equal(f.context.state.game.puzzle.moves,3,'每一步立即在本机生效');assert.deepEqual(f.paints.map(p=>p.moves),[1,2,3]);assert.ok(f.paints.every(p=>p.animated));
 assert.equal(f.writes.length,0,'走子时不逐步写盘');assert.equal(f.context.busy,false,'走子不占用存档写锁');
 assert.deepEqual(f.timers.filter(t=>!t.cleared).map(t=>t.delay),[600],'停手后只保留一次合并保存');
 await f.fire();
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].moves,3);assert.equal(f.writes[0].revision,1);assert.equal(f.context.revision,2);assert.equal(f.context.busy,false);
 assert.deepEqual(f.toasts,[]);
});
await check('keys pressed during a puzzle save still move, then save with the new revision',async()=>{
 const f=puzzleFixture();let release;f.setReply(body=>new Promise(resolve=>{release=()=>resolve({revision:body.revision+1})}));
 f.move();await f.fire();assert.equal(f.writes.length,1);assert.equal(f.context.busy,true,'保存进行中占用写锁，其他写入不会并发');
 f.move();f.move();assert.equal(f.context.state.game.puzzle.moves,3,'保存中的按键照常生效，不被丢弃');assert.deepEqual(f.toasts,[],'不弹“正在保存”提示');
 f.setReply(null);release();await farmTick();await farmTick();
 assert.equal(f.writes.length,2);assert.equal(f.writes[1].moves,3);assert.equal(f.writes[1].revision,2,'第二次保存使用第一次返回的修订号');
 assert.equal(f.context.revision,3);assert.equal(f.context.busy,false);
});
await check('keys pressed while another save runs wait for it instead of being dropped',async()=>{
 const f=puzzleFixture();f.context.busy=true;
 f.move();f.move();assert.equal(f.context.state.game.puzzle.moves,0,'其他写入完成前不改动它将替换的存档');
 f.context.busy=false;await new Promise(resolve=>setTimeout(resolve,20));await farmTick();
 assert.equal(f.context.state.game.puzzle.moves,2,'写入结束后排队的按键依次生效');assert.deepEqual(f.toasts,[]);
});
await check('a puzzle save conflict syncs the latest workspace and keeps revisions consistent',async()=>{
 const f=puzzleFixture(),latest=createState();latest.game.coins=321;
 f.move();f.move();
 f.setReply(body=>{if(body){const e=Error('conflict');e.code=409;throw e}return {revision:9,data:latest}});
 await f.fire();
 assert.equal(f.context.revision,9);assert.equal(f.context.state.game.coins,321);assert.equal(f.context.state.game.puzzle.moves,0);
 assert.match(f.toasts.at(-1),/另一个窗口有新记录，已同步/);assert.equal(f.context.busy,false);
 f.setReply(null);f.move();await f.fire();assert.equal(f.writes.at(-1).revision,9,'同步后的下一次保存基于最新修订号');
});
await check('a puzzle save conflict caused by a backup recovery says the file was restored, not another window',async()=>{
 // 409 本身带恢复标记，或只有冲突后重读的结果带（api() 以不可枚举属性标出），两种都要如实说明。
 for(const where of ['conflict','reload']){
  const f=puzzleFixture(),latest=createState();latest.game.coins=77;f.move();
  f.setReply(body=>{if(body){const e=Error('存档文件损坏，已恢复到上一次成功保存的版本，请重新加载后继续');e.code=409;if(where==='conflict')e.recovered=true;throw e}
   const result={revision:4,data:latest};if(where==='reload')Object.defineProperty(result,'recovered',{value:true});return result});
  await f.fire();
  assert.equal(f.toasts.at(-1),'存档文件损坏，已恢复到上一次成功保存的版本。刚才的几步没有保存，可以接着玩。',where);
  assert.equal(f.context.revision,4);assert.equal(f.context.state.game.coins,77);assert.equal(f.context.busy,false);
 }
});
await check('a new sticker saves immediately and claiming first saves pending moves',async()=>{
 const f=puzzleFixture([64,64]);f.context.puzzleMove('left');
 assert.equal(f.timers.at(-1).delay,0,'得到新贴纸或奖励资格时立即保存');await f.fire();assert.equal(f.writes.length,1);
 const g=puzzleFixture();g.move();const claim=g.context.puzzleAction('puzzleUndo');await claim;
 assert.equal(g.writes.length,2,'先存好走子，再写入悔一步');assert.equal(g.writes[0].moves,1);assert.equal(g.writes[1].revision,2);
});
await check('leaving the arcade saves pending moves right away',async()=>{
 const f=puzzleFixture();let unbound=0;
 Object.assign(f.context,{arcadeCleanup:null,mountHomeScenery(){},createPetPlayer:()=>assert.fail('测试页面没有伙伴头像'),bindArcade:(_root,handlers)=>{assert.equal(handlers.onMove,f.context.puzzleMove);return ()=>{unbound++}}});
 vm.runInContext(section('function mountGardenPlayers(','function reactPet('),f.context);
 f.context.mountGardenPlayers();f.move();f.move();assert.equal(f.writes.length,0);
 f.context.gardenTab='pet';f.context.mountGardenPlayers();await farmTick();
 assert.equal(unbound,1);assert.equal(f.writes.length,1,'离开伙伴小桌时立即存好走子，不等合并延迟');assert.equal(f.writes[0].moves,2);
});
// 退出回调就是应用注册给 Electron 的那一段；preload 会把它抛出的消息交给主进程的退出确认框。
function quitHook(f){let quit=null;f.context.szuDesktop={onBeforeQuit:fn=>{quit=fn}};f.context.notebookUI={flush:async()=>{}};vm.runInContext(section('// 棋局冲突时已同步','async function notebookLearningAction('),f.context);assert.equal(typeof quit,'function');return quit}
await check('quitting saves pending 2048 moves and blocks the exit only when moves really stay unsaved',async()=>{
 let f=puzzleFixture(),quit=quitHook(f);
 f.move();f.move();await quit();assert.equal(f.writes.length,1,'退出前存好合并中的走子');assert.equal(f.writes[0].moves,2);
 f.move();f.setReply(body=>{if(body){const e=Error('conflict');e.code=409;throw e}return {revision:9,data:createState()}});
 await quit();assert.equal(f.context.revision,9,'冲突时已同步最新存档、没有待存走子，不能拦下退出');
 f.setReply(()=>{throw Error('本机服务暂时无响应')});f.move();
 await assert.rejects(quit(),/2048 棋局尚未保存：本机服务暂时无响应/,'走子确实没存上时如实说明是棋局');
 f=puzzleFixture();quit=quitHook(f);f.move();f.context.busy=true;
 const pending=quit();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.writes.length,0,'另一项写入进行中时先等它写完');
 f.context.busy=false;await pending;assert.equal(f.writes.length,1,'等到写锁后再存走子，不会悄悄丢掉');assert.equal(f.writes[0].moves,1);
 f=puzzleFixture();quit=quitHook(f);f.move();f.context.busy=true;let clock=0;f.context.Date={now:()=>clock+=1000};
 await assert.rejects(quit(),/2048 棋局尚未保存：上一项操作还在保存/,'等不到写锁时在主进程超时前如实报告');assert.equal(f.writes.length,0);
});
await check('a degraded workspace never lets the puzzle write over the unreadable save',async()=>{
 const f=puzzleFixture(),quit=quitHook(f);f.move();
 vm.runInContext('workspaceFailure={message:"存档时间异常",raw:null}',f.context);
 await assert.rejects(f.context.flushPuzzle(),/庭院存档暂时打不开，棋局没有保存/);assert.equal(f.writes.length,0);
 const moves=f.context.state.game.puzzle.moves;for(const direction of ['left','right','up','down'])f.context.puzzleMove(direction);
 assert.equal(f.context.state.game.puzzle.moves,moves,'降级时不再应用走子');
 await quit();assert.equal(f.writes.length,0,'没有待存走子，退出不被拦下');
});
console.log(`${checks} workspace UI checks passed`);
