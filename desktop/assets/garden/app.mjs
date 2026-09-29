import {todoView,focusView,weeklyView,journeyView,exportGardenCard} from './productivity.mjs';
import {createReleaseUI} from './release-ui.mjs';
import {createFeedbackUI} from './feedback.mjs';
import {createDesktopOptions} from './desktop-options.mjs';
import {actionReward} from './rewards.mjs';
import {unverifiedBadge} from './labels.mjs';
import {networkSummaryHTML,networkLoginHint,autoLoginHTML,diagResultHTML,diagErrorHTML} from './network-status.mjs';
import {createServiceLog} from './diagnostic-report.mjs';
import {createSchoolUI} from './school.mjs';
import {createAcademicUI} from './academic.mjs';
import {createCampusUI} from './campus-ui.mjs';
import {createPianoUI} from './piano.mjs';
import {createSchoolWindowUI} from './school-window.mjs';
import {CROPS,DECOR,QUESTS,createState,normalize,settle,act,level,gardenLevel,dayKey,journeyKeepsakes,achievementList,activePet,petSprite,PETS,plotUnlockCost} from './engine.mjs';
// 宽松恢复 recoverSave 由庭院引擎提供；用命名空间读取，引擎暂未提供时页面也能照常加载。
import * as engine from './engine.mjs';
import {PET_SYMBOLS} from './pet-art.mjs';
import {PET_SPRITES} from './pet-catalog.mjs';
import {createPetPlayer,petReaction} from './pet-player.mjs';
import {petDetails,frameStrip} from './pet-details.mjs';
import {arcadeView,ordersView,bindArcade,paintArcade} from './arcade-ui.mjs';
import {movePuzzle} from './puzzle2048.mjs';
import {orderKeepsakes} from './garden-orders.mjs';
import {PROJECTS,reservedStock,sellableStock,nextProject,projectStatus} from './garden-loop.mjs';
import {projectView,projectStrip,projectScene} from './garden-loop-ui.mjs';
import {stickerShelfHTML} from './arcade-ui.mjs';
import {gardenNextStep,cropPurpose,readyOrders} from './garden-path.mjs';
import {cropIcon} from './garden-items.mjs';
import {homeSkinDetails,homeSkinPicker} from './home-skins.mjs';
import {campusRoomHeader,campusSceneLinks} from './campus-world.mjs';
import {createNotebookUI} from './notebook.mjs';
import {readRoute,routeHash} from './routes.mjs';
import {focusKey,restoreFocus,formEdited,refreshDraft} from './shell-repaint.mjs';
import {esc} from './html.mjs';
import {createApi} from './api-client.mjs';
import {createWorkspaceCommit} from './workspace-commit.mjs';
import {exitHint,countdown,remaining,shouldPollNetwork,autostartView,recordOnboarded,isReturningVisit,stampVersion as applyVersion,createConfirm} from './app-logic.mjs';
document.getElementById('pet-sprites').innerHTML=PET_SYMBOLS;
const $=s=>document.querySelector(s);
const pageIcons={home:'i-cottage',network:'i-crystal',services:'i-sign',garden:'i-water',study:'i-book',settings:'i-workbench'};
const gardenIcons={pet:'i-heart',farm:'i-seed',market:'i-chest',arcade:'i-medal',journal:'i-scroll'};
const actionIcons={pat:'i-heart',feed:'i-bread',play:'i-heart',sleep:'i-lantern',gift:'i-chest',buySeed:'i-seed',water:'i-water',plant:'i-seed',harvest:'i-chest',unlock:'i-pickaxe',buyFood:'i-bread',sell:'i-coin',decor:'i-flower',export:'i-chest',diagnose:'i-compass',refresh:'i-signal',reveal:'i-key',logout:'i-sign',focusStart:'i-clock',focusClaim:'i-coin',focusCancel:'i-clock',quest:'i-scroll',achievement:'i-medal',forget:'i-key',shutdown:'i-cottage',autostart:'i-signal'};
const pageTips={home:'欢迎回来。先做一件小事，再去看看田里的收成吧。',network:'WebVPN 用于访问学校网页，不会自动接通本机校园网。卡号默认不会显示。',services:'先找一处安静的自习空间，再看看学校的新通知吧。预约结果请在学校页面核对。',garden:'离开的时候我也会照顾好自己，作物成熟后会一直等你回来。',study:'把今天没弄懂的地方先记下来。书桌上的笔记会自动保存，想一起讨论就去共学文档。',settings:'你的庭院留在这台电脑里。换电脑前，记得带上一份导出的存档。'};
const pages={home:'今日',network:'校园网',services:'校园服务',garden:'荔枝庭院',study:'学习书屋',settings:'设置'};
const services=[
 ['常用','办事大厅','https://ehall.szu.edu.cn/','校园办事、业务申请与个人服务'],
 ['常用','官方 WebVPN','https://webvpn.szu.edu.cn/','校外访问校内资源，使用学校认证'],
 ['常用','深大邮箱','https://mail.szu.edu.cn/','收发邮件与校园通讯'],
 ['教与学','教务部','https://jwb.szu.edu.cn/','教学通知、选课与考试安排'],
 ['教与学','图书馆','https://www.lib.szu.edu.cn/','馆藏检索、数据库与入馆服务'],
 ['教与学','深大 AI 云','https://console.aicloud.szu.edu.cn/','学校 AI 服务入口'],
 ['校园资讯','深圳大学','https://www.szu.edu.cn/','学校主页与校园资讯'],
 ['校园资讯','深大新闻网','https://news.szu.edu.cn/','新闻、活动与校园故事'],
 ['校园资讯','信息中心','https://it.szu.edu.cn/','网络服务指南与支持'],
];
const initialRoute=readRoute(location.hash);
let state,revision=0,page=initialRoute.page,gardenTab=page==='garden'?initialRoute.tab:'pet',selectedCrop='radish',selectedPlot=0,busy=false,workspaceReady=false,net=null,saved=false,probing=false,appVersion='',toastTimer;
let studyTab=page==='study'?initialRoute.tab:'notes',serviceTab=page==='services'?initialRoute.tab:'spaces',settingsTab=page==='settings'?initialRoute.tab:'appearance',todoFilter='open';
let settingsProfileDraft=null;
const sprite=(id,cls='')=>`<svg class="sprite ${cls}" ${PET_SPRITES[id]?`viewBox="${PET_SPRITES[id]}"`:''} aria-hidden="true"><use href="#${id}"></use></svg>`;
const cat=g=>{const p=activePet(g);return sprite(petSprite(p)).replace('<svg ','<svg data-animated-pet ')};
let petPlayer=null,arcadeCleanup=null;
let homeScene=null,homeSceneHost=null,homeSceneMotion=null,homeSceneEpoch=0,homeSceneStill=false;
function mountHomeScenery(){
 const container=document.querySelector('[data-home-scene]');
 const motion=state.preferences.motion;
 // 业务页页头只有一扇 96px 高的装饰小窗，静态画一帧即可；首页大图保留动画。
 // 同一块画布在两处之间移动时只切换播放方式，不重建 WebGL。
 homeSceneStill=!!container?.classList?.contains('campus-room-scene');
 // Pet care and task saves repaint the page, but the same view keeps its canvas,
 // GPU resources and animation phase. Reattach before observer callbacks run.
 if(container&&homeSceneHost&&container.dataset.homeScene===homeSceneHost.dataset.homeScene&&motion===homeSceneMotion){
  if(container!==homeSceneHost)container.replaceWith(homeSceneHost);
  homeScene?.setMotion?.(motion&&!homeSceneStill);
  return;
 }
 const epoch=++homeSceneEpoch;
 homeScene?.destroy();homeScene=null;
 homeSceneHost=container;homeSceneMotion=motion;
 if(!container)return;
 import('./home-scene-renderer.mjs').then(module=>{
  if(epoch!==homeSceneEpoch||!container.isConnected)return;
  return module.mountHomeScene(container,{skin:container.dataset.homeScene,motion:motion&&!homeSceneStill});
 }).then(instance=>{
  if(!instance)return;
  if(epoch!==homeSceneEpoch||!container.isConnected){instance.destroy();return}
  homeScene=instance;instance.setMotion?.(motion&&!homeSceneStill);
 }).catch(()=>{
  if(epoch!==homeSceneEpoch||!container.isConnected)return;
  container.dataset.sceneState='fallback';
  container.querySelector('.scene-loading').textContent='这台设备暂时无法展开立体风景，先用像素校园陪你。';
 });
}
function mountGardenPlayers(){
 petPlayer?.destroy();petPlayer=null;arcadeCleanup?.();arcadeCleanup=null;
 mountHomeScenery();
 const portrait=document.querySelector('[data-animated-pet]');
 if(portrait)petPlayer=createPetPlayer(portrait,{pet:activePet(state.game),focus:!!state.game.focus&&state.game.focus.end>Date.now(),motion:state.preferences.motion});
 if(page==='garden'&&gardenTab==='arcade'){const unbind=bindArcade(document.getElementById('main'),{onMove:puzzleMove,onUndo:()=>puzzleAction('puzzleUndo'),onRestart:()=>puzzleAction('puzzleRestart'),onClaim:()=>puzzleAction('puzzleClaim'),reducedMotion:!state.preferences.motion});arcadeCleanup=()=>{unbind();void flushPuzzle().catch(e=>toast(e.message))}}
}
function reactPet(action,notifyDesktop=true,message=activePet(state.game).say){const pet=activePet(state.game),reaction=petReaction(action,pet);if(reaction)petPlayer?.play(reaction);if(reaction&&notifyDesktop)globalThis.szuDesktop?.petResult?.({ok:true,message,action:reaction})}
// 2048 走子先在本机生效，停手片刻后合并成一次保存；得到新贴纸或达成今日奖励条件时立即保存。
// 保存进行中继续按键照常生效；其他写入进行中时按键先排队，写完再走，不会被丢掉或弹提示。
let puzzleDirty=false,puzzleTimer=0,puzzleFlight=null,puzzleQueue=[],puzzlePumping=false;
function paintPuzzle(result){
 paintArcade(document.getElementById('main'),state.game,{result,reducedMotion:!state.preferences.motion});
 const purse=document.querySelector('.wallet');if(purse)purse.outerHTML=wallet(state.game);
 paintGardenPath();
 petPlayer?.setPet(activePet(state.game),{focus:!!state.game.focus&&state.game.focus.end>Date.now(),motion:state.preferences.motion});
}
function puzzleMove(direction){if(puzzleQueue.length<4)puzzleQueue.push(direction);void pumpPuzzle()}
async function pumpPuzzle(){
 if(puzzlePumping)return;
 puzzlePumping=true;
 try{
  while(puzzleQueue.length){
   if(!state||exiting||workspaceFailure||page!=='garden'||gardenTab!=='arcade'){puzzleQueue=[];break}
   // 其他写入完成时会用它提交的存档替换 state；期间的走子等它写完再应用。
   if(busy&&!puzzleFlight){await new Promise(resolve=>setTimeout(resolve,40));continue}
   const direction=puzzleQueue.shift();
   try{
    const result=movePuzzle(state.game.puzzle,direction);if(!result.changed)continue;
    const before=state.game.puzzle;state=act(state,{type:'puzzleMove',direction});
    paintPuzzle(result);puzzleDirty=true;
    schedulePuzzleSave(result.newMilestones.length||state.game.puzzle.qualifiedDay!==before.qualifiedDay?0:600);
    if(result.newMilestones.length){petPlayer?.play('celebrate');globalThis.szuDesktop?.petResult?.({ok:true,message:activePet(state.game).say,action:'celebrate'})}
    else if(result.over){petPlayer?.play('sad');globalThis.szuDesktop?.petResult?.({ok:true,message:activePet(state.game).say,action:'sad'})}
   }catch(e){toast(e.message)}
  }
 }finally{puzzlePumping=false}
}
function schedulePuzzleSave(delay){clearTimeout(puzzleTimer);puzzleTimer=setTimeout(()=>{puzzleTimer=0;flushPuzzle().catch(e=>toast(e.message))},delay)}
// wait=true 用于退出前：另一项写入占着存档锁时先等它写完再存走子，不能只排个计时器就返回。
async function flushPuzzle(wait=false){
 clearTimeout(puzzleTimer);puzzleTimer=0;
 if(puzzleFlight)return puzzleFlight;
 if(!puzzleDirty||!state)return;
 // 读档失败的降级状态下，任何写入都不能覆盖原存档，棋局也一样。
 if(workspaceFailure){puzzleDirty=false;puzzleQueue=[];throw Error('庭院存档暂时打不开，棋局没有保存')}
 if(busy){
  // 另一项写入正在进行：它提交的存档已含这些走子（期间的按键在排队），稍后再补存一次。
  if(!wait){schedulePuzzleSave(300);return}
  // 主进程最多等 5 秒，这里最多等 4 秒，超时就如实报告棋局尚未保存。
  const deadline=Date.now()+4000;
  while(busy&&!puzzleFlight){if(Date.now()>deadline)throw Error('上一项操作还在保存');await new Promise(resolve=>setTimeout(resolve,40))}
  return flushPuzzle(true);
 }
 busy=true;
 puzzleFlight=(async()=>{
  try{
   while(puzzleDirty){
    // act 每次都返回新对象，保存期间继续走子不会改动这份快照；新的走子由下一轮接着保存。
    puzzleDirty=false;const snapshot=state;
    try{revision=(await api('/api/workspace',{version:1,revision,data:snapshot})).revision}
    catch(e){
     puzzleDirty=true;if(e.code!==409)throw e;
     const latest=await api('/api/workspace');revision=latest.revision;state=normalize(latest.data);puzzleDirty=false;puzzleQueue=[];if(page==='garden'&&gardenTab==='arcade')paintPuzzle();else render();
     throw Error((e.recovered||latest.recovered?'存档文件损坏，已恢复到上一次成功保存的版本':'另一个窗口有新记录，已同步')+'。刚才的几步没有保存，可以接着玩。');
    }
   }
  }finally{busy=false;puzzleFlight=null}
 })();
 return puzzleFlight;
}
// 悔一步、重开和领奖以已保存的棋盘为准：先存好走子，再像其他操作一样立即写入。
async function puzzleAction(type){
 try{await flushPuzzle()}catch(e){toast(e.message);return}
 return run(async()=>{
  if(type==='puzzleRestart'&&!await confirm('重新开始这一局？','当前棋盘会换成新局。最高分、已收集贴纸和今日奖励记录都会保留。'))return;
  const before=state;
  await commit(act(state,{type}),undefined,()=>paintPuzzle());
  if(type==='puzzleClaim'){reactPet(type);const reward=actionReward(before,state,{type});if(reward)showReward(reward)}
 },false);
}
const btn=(text,action,extra='',cls='')=>{const icon=action==='navigate'?pageIcons[/data-page="([^"]+)"/.exec(extra)?.[1]]:action==='gardenTab'?gardenIcons[/data-tab="([^"]+)"/.exec(extra)?.[1]]:actionIcons[action];return `<button class="${cls}" data-action="${action}" ${extra}>${icon?sprite(icon,'item-icon'):''}${text}</button>`};
// 页头标题就是导航里的页名（见 campus-world.mjs 的 ROOMS），面包屑与之一致。
const head=(title,sub,right='')=>campusRoomHeader({page,title,description:sub,right,skin:state.preferences.homeSkin||'pixel',sprite});
const wallet=g=>`<div class="wallet"><span>${sprite('i-coin','item-icon')}荔枝币 <b>${Math.floor(g.coins)}</b></span><span>${sprite('i-bread','item-icon')}食物 <b>${g.food}</b></span><span>${sprite('i-heart','item-icon')}伙伴 Lv.${level(g)}</span></div>`;
function nextStepHTML(current=state){
 const step=gardenNextStep(current),attributes=Object.entries(step).filter(([k])=>['tab','page','crop','index','order','anchor'].includes(k)).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ');
 return `<section class="garden-next" aria-label="庭院下一步" data-step="${esc(JSON.stringify(step))}"><span class="next-icon" aria-hidden="true">${sprite(step.icon)}</span><div><strong>${esc(step.title)}</strong><p>${esc(step.detail)}</p></div>${btn(step.label,step.action,attributes,'primary')}</section>`;
}
function paintGardenPath(includeProjects=true){
 const current={...state,game:settle(state).game};
 document.querySelectorAll('.garden-next').forEach(el=>{if(el.dataset.step!==JSON.stringify(gardenNextStep(current))&&!el.contains(document.activeElement))el.outerHTML=nextStepHTML(current)});
 if(includeProjects)document.querySelectorAll('.garden-project-strip').forEach(el=>{if(!el.contains(document.activeElement))el.outerHTML=projectStrip(current.game,{cropIcon,sprite})});
}
async function routeGarden(data){
 if(busy){toast('正在保存或处理上一项操作，请稍后再试');return}
 const target=['pet','farm','market','arcade','journal'].includes(data.tab)?data.tab:'farm';
 const locked=CROPS[data.crop]&&CROPS[data.crop].level>gardenLevel(state.game);
 if(CROPS[data.crop]&&!locked)selectedCrop=data.crop;
 if(target==='farm'){
  const explicit=Number(data.index),same=state.game.plots.findIndex(p=>p&&p!=='locked'&&p.crop===selectedCrop&&p.ready<=Date.now()),empty=state.game.plots.findIndex(p=>p===null);
  selectedPlot=data.index!==undefined&&Number.isInteger(explicit)&&explicit>=0&&explicit<6?explicit:same>=0?same:empty>=0?empty:selectedPlot;
 }
 if(!await navigate('garden',target))return;
 if(locked)toast(`${CROPS[data.crop].name}在庭院 ${CROPS[data.crop].level} 级解锁；专注、照料和交付委托都能帮助伙伴成长。`);
 if(data.order){const order=[...document.querySelectorAll('[data-action="orderDeliver"]')].find(b=>b.dataset.id===data.order)?.closest('.order-note');order?.scrollIntoView({block:'center',behavior:'instant'});order?.classList.add('route-highlight')}
 if(data.anchor){const el=document.getElementById(data.anchor);el?.scrollIntoView({block:'start',behavior:'instant'})}
}
const serviceIcons={'办事大厅':'i-satchel','官方 WebVPN':'i-shield','深大邮箱':'i-mail','教务部':'i-quill','图书馆':'i-book','深大 AI 云':'i-cloud','深圳大学':'i-cottage','深大新闻网':'i-bell','信息中心':'i-compass'};
const links=list=>list.map(x=>`<a class="service" href="${x[2]}" target="_blank" rel="noopener noreferrer"><span class="arrow">↗</span><span class="service-fruit">${sprite(serviceIcons[x[1]])}</span><strong>${x[1]}</strong><small>${x[3]}</small></a>`).join('');
// 下面各个界面工厂都要用到 api() 和 confirm()，必须在它们之前创建。
const api=createApi({toast});
// 学校服务每次请求的结构摘要（不存响应内容），供「复制诊断报告」使用；只包给学校服务界面，存档、笔记和校园网请求不经过它。
const serviceLog=createServiceLog(),schoolApi=serviceLog.wrap(api);
const confirm=createConfirm($);
// 写庭院存档：带修订号提交，冲突时同步最新存档；读档失败的降级状态下拒绝写入（见 workspace-commit.mjs）。
const commit=createWorkspaceCommit({api,normalize,read:()=>({failure:workspaceFailure,revision}),setRevision:next=>{revision=next},setState:next=>{state=next},paint:()=>render(),byId:id=>document.getElementById(id)});
const notebookUI=createNotebookUI({api,toast,confirm,
 onTask:text=>notebookLearningAction({type:'todoAdd',text,id:crypto.randomUUID()}),
 onFocus:minutes=>notebookLearningAction({type:'focusStart',minutes}),
 onChange:()=>{const slot=document.querySelector('[data-home-notebook]');if(slot)slot.innerHTML=notebookUI.summaryHTML()}
});
// 棋局冲突时已同步、没有待存走子，不能因此拦下退出；真有走子没存上才报告。
globalThis.szuDesktop?.onBeforeQuit?.(()=>Promise.all([notebookUI.flush(),flushPuzzle(true).catch(e=>{if(puzzleDirty)throw Error('2048 棋局尚未保存：'+e.message)})]));
async function notebookLearningAction(action){
 if(busy)throw Error('上一项操作还在保存，请稍后再试');
 busy=true;
 try{
  await commit(act(state,action),undefined,()=>{paintCompanionDialog();clocks()});
  if(action.type==='focusStart')reactPet('focusStart');
 }finally{busy=false;clocks()}
}
const desktopUI=createDesktopOptions({toast});
const releaseUI=createReleaseUI({api,getVersion:()=>appVersion});
const feedbackUI=createFeedbackUI({getVersion:()=>appVersion,getMode:()=>globalThis.szuDesktop?.shell||'browser',toast,getDiagnostics:()=>({status:net,diag:lastDiag,services:serviceLog.entries()})});
const campusUI=createCampusUI({getState:()=>state,commit,toast,confirm,api:schoolApi,render,workspaceUnavailable:()=>!!workspaceFailure});
const schoolUI=createSchoolUI({api:schoolApi,toast});
const academicUI=createAcademicUI({getState:()=>state,api:schoolApi,toast});
const pianoUI=createPianoUI({api:schoolApi,toast,render});
const officialUI=createSchoolWindowUI({onSessionChanged:async()=>{schoolUI.reset();campusUI.resetSchoolData();await Promise.all([schoolUI.load(),campusUI.loadCas(),campusUI.loadSession()])}});
function toast(t){$('#toast').classList.remove('reward-toast');$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500)}
function showReward(reward,reply){const el=$('#toast');clearTimeout(toastTimer);el.classList.add('reward-toast','show');el.innerHTML=sprite(reward.levelUp?'i-medal':'i-chest','reward-icon')+`<div><strong>${esc(reward.title)}</strong><span>${reward.items.map(esc).join(' · ')}</span>${reply?`<span>${esc(reply)}</span>`:''}</div>`;toastTimer=setTimeout(()=>el.classList.remove('show'),5200)}
// 本机服务请求 api() 见 api-client.mjs：字符串请求体原样发送，存档或笔记从备份恢复时标记 recovered 并提示一次。
// 写庭院存档的 commit() 见 workspace-commit.mjs，在上面与 api() 一起创建。
// 读档失败时的降级状态 {message,raw}：网络、笔记等页面照常可用，写庭院存档一律拦下，直到恢复成功。
let workspaceFailure=null;
// 最近一次网络诊断的结果：诊断报告要带上它的结论。
let lastDiag=null;
// 本次打开时才新建的存档：第一次重启之前首页都按首访显示（见 isReturningVisit）。
let firstSession=false;
function renderPetCare(resetPetForm=false){
 paintCompanionDialog();
 // 照料只影响今日与庭院；其余页面保留原 DOM，避免打断正在填写的学校登录和设置。
 if(page!=='home'&&page!=='garden')return;
 const forms=[...document.querySelectorAll('#main form[id]')],focused=document.activeElement;
 // 首访当天伙伴栏默认展开；同学自己收起后，照料伙伴带来的重绘不能又把它展开。
 const careOpen=document.getElementById('pet-care-details')?.open,companionsOpen=document.getElementById('home-companions')?.open;
 const selection=typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd,focused.selectionDirection]:null;
 render();
 const careDetails=document.getElementById('pet-care-details');if(careDetails&&careOpen!==undefined)careDetails.open=careOpen;
 const companions=document.getElementById('home-companions');if(companions&&companionsOpen!==undefined)companions.open=companionsOpen;
 // 移回原表单节点，保留输入、文件选择和事件监听；不复制密码或把草稿放进存档。
 for(const form of forms){if(resetPetForm&&form.id==='pet-name-form')continue;const replacement=document.getElementById(form.id);if(replacement)replacement.replaceWith(form)}
 if(focused?.isConnected){focused.focus({preventScroll:true});if(selection)focused.setSelectionRange(...selection)}
}
// 引导里「密码怎么保管」默认是 Windows 原文（index.html 的 #guide-store-text），macOS 桌面版换成钥匙串。
// 「先专注 5 分钟」和首页主按钮一样真的开始 5 分钟，再打开专注页看计时：只跳过去的话，那页默认推的是 25 分钟，
// 和按钮上写的对不上（O3 前三分钟：选伙伴 → 专注 5 分钟 → 收萝卜）。已经在专注时只打开专注页。
function showGuide(){const d=$('#guide');if(!d||d.open)return;const hint=$('#exit-guide-text');if(hint)hint.textContent=exitHint();const store=$('#guide-store-text');if(store&&globalThis.szuDesktop?.platform==='darwin')store.textContent='校园网密码存进 macOS 钥匙串';d.returnValue='';d.showModal();d.addEventListener('close',async()=>{const choice=d.returnValue,route={garden:['garden','pet'],focus:['study','focus']}[choice];await markOnboarded();if(choice==='focus'&&!state.game.focus)await run(async()=>{await commit(act(state,{type:'focusStart',minutes:5}),undefined,()=>{});reactPet('focusStart')});if(route)navigate(...route)},{once:true})}
function markOnboarded(){return recordOnboarded(state,{commit,toast})}
function todoHTML(){return todoView(state,todoFilter)}
function companionRoster(g,compact=false){
 const draw=legacy=>g.pets.map((p,index)=>({p,index})).filter(({p})=>!PETS[p.species].available===legacy).map(({p,index})=>{
  const selected=index===g.active,attributes=`data-action="switchPet" data-index="${index}" aria-pressed="${selected}" ${selected?'disabled':''}`;
  return compact?`<button class="home-companion" ${attributes}>${sprite(petSprite(p))}<span>${esc(p.name)}</span><small>${selected?'在你身边':'换它陪我'}</small></button>`:`<button class="companion-choice" ${attributes}><span class="companion-portrait">${sprite(petSprite(p))}</span><span class="companion-caption"><strong>${esc(p.name)}</strong><small>${esc(PETS[p.species].description)}</small></span><span class="companion-selection">${selected?'正在陪伴':'换它陪我'}</span></button>`;
 }).join('');
 const old=draw(true),grid=compact?'home-roster':'companion-roster';
 return `<div class="${grid}" aria-label="选择陪伴伙伴">${draw(false)}</div>`+(old?`<details class="legacy-companions" ${PETS[activePet(g).species].available?'':'open'}><summary>老朋友 <span>以前的伙伴与成长都还在</span></summary><div class="${grid}">${old}</div></details>`:'');
}
function renderStudyProgress(){
 if(page!=='study'||studyTab!=='focus')return;
 const focus=document.querySelector('.focus-studio'),week=document.querySelector('.weekly-card');
 if(focus)focus.outerHTML=focusView(state);
 if(week)week.outerHTML=weeklyView(state);
}
function home(){
 const g=settle(state).game,pet=activePet(g),ready=g.plots.filter(p=>p&&p!=='locked'&&p.ready<=Date.now()).length;
 const skin=state.preferences.homeSkin||'pixel',scenery=homeSkinDetails(skin);
 const greeting=state.profile.name?esc(state.profile.name)+'，今天过得怎么样？':'你的校园小据点，随时欢迎回来';
 // 关掉引导不等于回访：首访当天（或第一次重启前）仍显示首访标题、展开伙伴栏，主按钮直接开始 5 分钟专注（选伙伴 → 专注 → 收萝卜）。
 const returning=isReturningVisit(state,{freshSession:firstSession});
 return `${homeSkinPicker(skin)}<section class="campus-home ${skin!=='pixel'?'is-scenic':''} ${returning?'returning-home':''}" aria-labelledby="home-title">
  <div class="home-letter"><p class="eyebrow">${greeting}</p><h1 id="home-title">${g.focus?'这一段时间，<br>留给眼前的事。':returning?'欢迎回来，<br>庭院在等你。':'在荔园，<br>过好每一天。'}</h1><p class="home-description">记下课堂里的想法，做完手边的小事。<br>${esc(pet.name)}会在这里，陪你慢慢来。</p><div class="actions">${g.focus?btn('继续我的专注 →','navigate','data-page="study" data-tab="focus"','primary'):returning?btn('去我的书桌 →','navigate','data-page="study" data-tab="notes"','primary'):btn('开始 5 分钟','focusStart','data-minutes="5"','primary')}</div><p class="home-local">${sprite('i-satchel','item-icon')}笔记和庭院，都好好收在本机</p><div class="home-day-summary" aria-label="我的日常记录"><button data-action="navigate" data-page="study" data-tab="focus"><strong>${state.todos.filter(t=>!t.done&&!t.archived).length}</strong><span>待办小事</span></button><button data-action="navigate" data-page="study" data-tab="focus"><strong>${g.stats.minutes}<small>分</small></strong><span>累计专注</span></button><button data-action="navigate" data-page="garden" data-tab="farm"><strong data-home-ready>${ready}</strong><span>等待收获</span></button></div></div>
  <div class="home-landscape">${skin!=='pixel'?`<div class="home-scene" data-home-scene="${skin}" role="img" aria-label="${scenery.description}"><p class="scene-loading" role="status">正在展开校园小景…</p></div>`:''}${projectScene(g,{surface:'home'})}${campusSceneLinks({sprite})}<div class="landscape-caption">${scenery.caption}</div><div class="home-pet-note"><strong>${esc(pet.name)}</strong><span>${pet.sleeping?'正在休息，陪你安静待一会儿':pet.say&&Date.now()-pet.saidAt<10000?esc(pet.say):skin==='pixel'?'点点我，今天也一起加油。':'点点我 · 摸摸头'}</span></div><button class="home-pet" data-action="pat" aria-label="摸摸${esc(pet.name)}">${cat(g)}</button><button class="home-harvest" data-action="navigate" data-page="garden" data-tab="farm">${cropIcon('radish')}<span><strong id="home-harvest-label">${ready?ready+' 块田可以收获':'去看看我的农田'}</strong><small>离线也会生长</small></span><span aria-hidden="true">→</span></button></div>
 </section>
 <div class="home-next-strip"><div data-home-notebook>${notebookUI.summaryHTML()}</div>
 ${nextStepHTML({...state,game:g})}</div>
 <details class="home-companions" id="home-companions" ${returning?'':'open'}><summary>今天谁陪你？ <span>${esc(pet.name)}在你身边</span></summary><div class="companions-heading"><span>今天，谁陪你？</span><small>${g.pets.length} 位伙伴 · 各自成长</small></div>${companionRoster(g,true)}</details>
 <div class="home-desk">
  <section class="card home-todos"><div class="card-head"><h2 class="icon-heading">${sprite('i-quill','heading-icon')}我的小事</h2><small>${state.todos.filter(t=>!t.done&&!t.archived).length} 件待完成</small></div>${todoHTML()}<p class="desk-footnote">完成一件小事，也会给伙伴带来成长。</p></section>
  <section class="card home-focus"><div class="focus-top">${sprite('i-mug')}<span>给自己一段安静的时间</span></div><h2>${g.focus?'这一段专注，留给自己。':'先专注 5 分钟吧。'}</h2><p>不必一下做很多。先把眼前这一件做好。</p><div class="focus-bottom">${g.focus?btn('查看当前专注 →','navigate','data-page="study" data-tab="focus"','primary'):btn('开始 5 分钟','focusStart','data-minutes="5"','primary')}<span>已积累 <strong>${g.stats.minutes}</strong> 分钟</span></div></section>
 </div>
 <section class="home-campus-tools" aria-labelledby="home-tools-title"><div class="home-section-heading"><h2 id="home-tools-title">校园里的事，也顺手办好</h2><span class="home-business-note">学校个人查询 ${unverifiedBadge()}</span></div><div class="home-shortcuts"><button data-action="navigate" data-page="study" data-tab="timetable">${sprite('i-book')}<span><strong>课表与成绩</strong><small>学习书屋 · 官方查询</small></span><span aria-hidden="true">→</span></button><button data-action="navigate" data-page="services">${sprite('i-sign')}<span><strong>找空间，看公告</strong><small>学校预约 · 分学院通知</small></span><span aria-hidden="true">→</span></button><button data-action="navigate" data-page="network">${sprite('i-crystal')}<span><strong>连接校园网</strong><small>连接状态 · 网络排障</small></span><span aria-hidden="true">→</span></button></div></section>
 <section class="home-connection" aria-label="网络状态"><div id="network-summary" class="network-summary">${networkSummaryHTML(net)}</div>${btn('连接详情 →','navigate','data-page="network"','quiet')}</section>`;
}
function network(){return head('校园网','先看看连接情况，需要时再登录。账号与密码留在本机。')+`<section class="card network-overview"><div class="network-overview-heading"><h2 class="icon-heading">${sprite('i-signal','heading-icon')}当前连接</h2><div class="actions">${btn('刷新状态','refresh')}${btn('运行网络诊断','diagnose','','quiet')}</div></div><div id="network-summary" class="network-summary">${networkSummaryHTML(net)}</div><div id="auto-login-result" class="auto-login-result">${autoLoginHTML(net)}</div><small>外网能用，不代表填写的账号已认证；仍可在下方登录或更换账号。</small><div id="diag-result" role="status"></div></section><div class="grid network-workspace"><details class="card network-login" ${net?.internet_ok?'':'open'}><summary><span>${sprite('i-key','heading-icon')}连接 / 更换账号</span><small>${networkLoginHint(net)}</small></summary><div class="network-login-body"><p id="credential-hint" class="notice">${saved?'本机已保存凭据。账号和密码都留空时，将使用已保存的凭据。':'还没有保存凭据。填写本次账号密码即可登录，是否保存由你选择。'}</p><form id="login-form" autocomplete="off"><label for="account">校园卡号</label><input id="account" name="username" placeholder="默认隐藏，不自动填入" autocomplete="off" inputmode="numeric"><label for="password">统一身份认证密码</label><input id="password" name="password" type="password" placeholder="仅本次使用，或留空使用已保存凭据" autocomplete="new-password"><label for="zone">所在区域</label><select id="zone" name="zone"><option value="auto">自动识别</option><option value="teaching">教学区 · 深澜</option><option value="dorm">宿舍区 · Dr.COM</option></select><div class="actions"><label><input type="checkbox" name="remember">认证成功后记住账号密码</label></div><details><summary>高级设置 · 仅在接入点识别失败时修改</summary><label for="acid">接入点编号</label><input id="acid" name="ac_id" inputmode="numeric" placeholder="自动识别"></details><div class="actions"><button class="primary" type="submit">${sprite('i-key','item-icon')}登录校园网</button>${btn('注销连接','logout')}${saved?btn('查看已保存卡号','reveal','','quiet'):''}</div><output id="saved-account" class="notice" hidden></output></form><div id="network-result" role="status" class="notice" hidden></div></div></details><aside class="network-offcampus"><section class="card"><h2 class="icon-heading tone-magic">${sprite('i-shield','heading-icon')}人在校外？</h2><p class="muted">在学校官方 WebVPN 页面完成认证后，可访问它支持的学校网页。此方式不会接通整机 VPN；应用内查询仍需对应服务可达。</p><a class="button" href="https://webvpn.szu.edu.cn/" target="_blank" rel="noopener noreferrer">${sprite('i-shield','item-icon')}打开官方 WebVPN ↗</a></section><section class="notice">本版默认不包含实验 VPN 协议，不修改系统代理。密码不会随庭院存档导出。</section></aside></div>`}
function sectionNav(items,selected,action,label){return `<div class="subnav workspace-tabs" aria-label="${label}">${Object.entries(items).map(([key,text])=>btn(text,action,`data-tab="${key}" aria-pressed="${selected===key}"`,selected===key?'active':'')).join('')}</div>`}
function servicesPage(){return head('校园服务','选一件想办的事，少绕几步。')+sectionNav({spaces:'学习空间',notices:'学校公告',directory:'常用入口',piano:'学院琴房'},serviceTab,'serviceTab','校园服务分区')+({spaces:()=>campusUI.services('spaces'),notices:()=>campusUI.services('notices'),piano:()=>pianoUI.section(),directory:()=>`<section class="card"><h2>学校常用入口</h2><label for="service-search" class="muted">查找服务</label><input id="service-search" type="search" placeholder="搜索教务、图书馆、邮箱…"><div id="service-results">${serviceResults('')}</div></section>`+campusUI.services('directory')})[serviceTab]()}
function serviceResults(q){const list=services.filter(x=>x.join(' ').toLowerCase().includes(q.toLowerCase()));return !list.length?'<p class="empty">没有匹配的入口，试试其他关键词。</p>':[...new Set(list.map(x=>x[0]))].map(group=>`<section class="service-group"><h2>${group}</h2><div class="service-grid">${links(list.filter(x=>x[0]===group))}</div></section>`).join('')}
function dailyBoard(g){
 const destinations={care:['gardenTab','data-tab="pet"'],plant:['gardenTab','data-tab="farm"'],harvest:['gardenTab','data-tab="farm"'],focus:['navigate','data-page="study" data-tab="focus"']};
 return `<section class="card daily-board"><p class="eyebrow">留一点小期待给今天</p><h2>${sprite('i-scroll','heading-icon')}庭院小计划</h2><p class="daily-intro">做喜欢的事，顺手攒一点奖励。</p><ul>${Object.entries(QUESTS).map(([id,q])=>{const claimed=g.daily.claimed.includes(id),done=g.daily[id]>=q.target;return `<li class="${claimed?'is-claimed':done?'is-ready':''}"><span class="daily-check" aria-hidden="true">${claimed?'✓':done?'!':'·'}</span><div><strong>${q.name}</strong><small>${Math.min(g.daily[id],q.target)} / ${q.target} · ${q.reward} 荔枝币</small></div>${claimed?btn('已领取','quest',`data-id="${id}" disabled`,'quiet'):done?btn('领取','quest',`data-id="${id}"`,'primary'):btn('去看看',...destinations[id],'quiet')}</li>`}).join('')}</ul><small class="daily-kind">每天更新，漏掉一天也没关系。</small></section>`;
}
function pet(g){const p=activePet(g),lv=level(g),unlocked=gardenLevel(g);return `<div class="pet-layout">
 <section class="card pet-living"><div class="card-head"><h2 class="icon-heading tone-rose">${sprite('i-heart','heading-icon')}${esc(p.name)}的小屋</h2><span class="badge" data-tone="rose">亲密度 ${Math.floor(p.bond)} / 100</span></div><div class="care-actions">${btn('摸摸头','pat')}${btn('喂食 ×1','feed')}${btn('一起备种','gardenRoute','data-tab="arcade"')}${btn(p.sleeping?'叫醒':'休息','sleep')}</div><div class="petroom">${projectScene(g,{surface:'room'})}<div class="window"></div><span class="pet-name">${p.sleeping?'晚安，做个好梦':'和你一起，慢慢长大'}</span><div class="room-shelf" aria-hidden="true">${sprite('i-book')}${sprite('i-mug')}</div>${g.equipped.includes('flower')?'<span class="flower"><img src="assets/garden/flora/berrybush.png" alt="窗边小花"></span>':''}${g.equipped.includes('lantern')?'<span class="lantern" aria-label="暖光灯笼"></span>':''}${cat(g)}${g.equipped.includes('scarf')?'<span class="scarf"></span>':''}</div>${p.say?`<p class="pet-say" role="status">${esc(p.say)}</p>`:''}<div class="meters">${[['hunger','饱食'],['energy','精力'],['mood','心情']].map(([k,n])=>`<div class="meter-line" data-meter="${k}"><span>${n}</span><div class="meter"><i style="width:${p[k]}%"></i></div><span>${Math.floor(p[k])}</span></div>`).join('')}</div><details id="pet-care-details" class="care-details"><summary>照料规则与农田点心</summary><p>摸摸间隔 10 秒；伙伴小桌随时可以玩，每日备种礼只领一次。每位伙伴每天前 3 次摸头获得成长，之后仍能开心互动。休息每小时恢复 30 点精力；离开几天也不会死亡。</p><div class="actions">${Object.entries(CROPS).map(([k,c])=>btn(`${c.name} ×${g.stock[k]}`,'feed',`data-crop="${k}" ${g.stock[k]?'':'disabled'}`)).join('')}</div><small>作物点心不消耗普通食物。</small></details></section>
 <aside class="pet-sidebar">${petDetails(p)}<section class="card growth-card"><div class="growth-heading">${sprite('i-medal')}<div><h2>一起长大的日子</h2><p>${esc(p.name)}的成长手记</p></div><strong>Lv.${lv}</strong></div><div class="growth-track"><span>${lv===20?'已到达最高等级':`距离下一级还差 ${50-p.xp%50} 点成长`}</span><small>${p.xp} 点累计成长</small></div><div class="meter"><i style="width:${lv===20?100:p.xp%50*2}%"></i></div><p class="growth-unlock">${unlocked<2?'下一份惊喜：2 级解锁蓝莓种子。':unlocked<3?'下一份惊喜：3 级解锁荔枝种子。':'蓝莓与荔枝都已解锁，去种点喜欢的吧。'}</p><form id="pet-name-form" class="inline-form"><input name="name" aria-label="伙伴名字" value="${esc(p.name)}" maxlength="12" required><button>改个名字</button></form></section>${dailyBoard(g)}</aside>
 <section class="card pet-roster-card"><div class="card-head"><h2>今天谁陪你？</h2><small>名字、成长与心情各自保留</small></div>${companionRoster(g)}</section>
 <section class="card keepsakes"><div class="card-head"><h2>庭院收藏 · 都留在这里</h2>${btn('翻开荔园拾光 →','gardenTab','data-tab="journal"','quiet')}</div>${[...journeyKeepsakes(g),...orderKeepsakes(g)].length?`<div class="keepsake-shelf">${[...journeyKeepsakes(g),...orderKeepsakes(g)].map(x=>`<span>${sprite(x.icon)}<strong>${esc(x.name)}</strong><small>${esc(x.storyTitle||'伙伴委托的纪念')}</small></span>`).join('')}</div>`:'<p class="muted">在「回忆与建设」收下第一份小记忆，把它带回小屋。</p>'}<div class="room-stickers"><h3>在伙伴小桌一起收集的贴纸</h3><ul class="arcade-stickers">${stickerShelfHTML(g,{cropIcon})}</ul></div></section>
 <details class="card garden-diary"><summary>${sprite('i-scroll','item-icon')}庭院日记 <span>${g.log.length?'最近：'+esc(g.log[0].text):'从今天开始，记一点小事'}</span></summary><ul class="log">${g.log.slice(0,8).map(x=>`<li><time>${new Date(x.time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>${esc(x.text)}</li>`).join('')}</ul></details></div>`}
function plotGrowth(p){return p==='locked'?'locked':!p?'empty':p.ready<=Date.now()?'ready':'growing'}
function plotContents(p,i){const growth=plotGrowth(p);return `<span class="soil ${growth}">${p==='locked'?'<img src="assets/garden/flora/tallgrass.png" alt=""><span aria-hidden="true">＋</span>':p?cropIcon(p.crop)+(p.watered?'<span class="watered-mark">已浇水</span>':''):'<span class="seed-dots" aria-hidden="true">· · ·</span>'}<span class="plot-number" aria-hidden="true">${i+1}</span></span><strong>${p==='locked'?'未开垦':p?CROPS[p.crop].name:'一块空地'}</strong><small ${p&&p!=='locked'?`data-ready="${p.ready}"`:''}>${p==='locked'?'可以开垦':p?remaining(p.ready):'可以播种'}</small>`}
function plotLabel(p,i){return `第 ${i+1} 块田，${p==='locked'?'未开垦':p?CROPS[p.crop].name+'，'+(plotGrowth(p)==='ready'?'可以收获':'生长中'):'空地，可以播种'}`}
function seedOptions(g){return Object.entries(CROPS).map(([k,c])=>`<option value="${k}" ${selectedCrop===k?'selected':''} ${gardenLevel(g)<c.level?'disabled':''}>${c.name} · ${g.seeds[k]} 颗${reservedStock(g)[k]?' · 心愿所需':''}${gardenLevel(g)<c.level?' · Lv.'+c.level+' 解锁':''}</option>`).join('')}
function farmDetails(g){const p=g.plots[selectedPlot];if(p==='locked'){const cost=plotUnlockCost(g);return `<p>这里还长着青草，开垦后就能播种。</p><p class="farm-cost">${sprite('i-coin','item-icon')}需要 ${cost} 荔枝币 · 现有 ${Math.floor(g.coins)} 币</p>`}if(!p)return `<p>这块地已经备好，可以播种。</p><p class="farm-crop-info">${cropIcon(selectedCrop)}${CROPS[selectedCrop].name} · ${CROPS[selectedCrop].time/60000} 分钟 · 收获 ${CROPS[selectedCrop].yield} 个</p>`;return `<p class="farm-growth-state" data-ready="${p.ready}">${remaining(p.ready)}</p><p>收获 ${CROPS[p.crop].yield} 个${CROPS[p.crop].name} · ${p.watered?'已浇过水':plotGrowth(p)==='ready'?'可以放入收获篮':'浇水可缩短剩余时间的 25%'}</p>`}
function farmAction(g){const p=g.plots[selectedPlot],extra=`data-index="${selectedPlot}"`;if(p==='locked'){const cost=plotUnlockCost(g);return btn(`开垦 · ${cost} 币${g.coins<cost?' · 不足':''}`,'unlock',`${extra} ${g.coins<cost?'disabled':''}`,'primary')}if(!p){const c=CROPS[selectedCrop];return gardenLevel(g)<c.level?btn('Lv.'+c.level+' 解锁这种种子','plant',extra+' disabled'):g.seeds[selectedCrop]>0?btn('种下'+c.name,'plant',extra,'primary'):btn('种子不足 · 去集市','gardenTab','data-tab="market"','primary')}return plotButton(p,selectedPlot)}
function plotButton(p,i){return p.ready<=Date.now()?btn('收获 ×'+CROPS[p.crop].yield,'harvest',`data-index="${i}"`,'primary'):btn(p.watered?'已浇水 · 等待生长':'浇水','water',`data-index="${i}" ${p.watered?'disabled':''}`,'primary')}
function harvestBasket(g){const ready=readyOrders(g);return `<section class="card harvest-basket"><h2>我的收获篮</h2><div>${Object.entries(CROPS).map(([k,c])=>`<span>${cropIcon(k)}<strong>${c.name}</strong><small>× ${g.stock[k]}</small></span>`).join('')}</div><p>${ready.length?`已有 ${ready.length} 份委托材料齐了，送过去让伙伴收下。`:'收成可以交付委托、准备庭院建设，或者给伙伴当点心。'}</p>${btn(ready.length?'把收成送给伙伴 →':'看看收成的去处 →','gardenRoute',`data-tab="market" ${ready[0]?`data-order="${esc(ready[0].id)}"`:''}`,ready.length?'primary':'quiet')}</section>`}

function farmCompanion(g){const p=activePet(g);return `<div class="farm-companion">${cat(g)}<div><strong>${esc(p.name)}${p.sleeping?'在田边打盹':'陪你照料小田'}</strong><p data-farm-pet-say>${esc(p.say||'先看看种子，再选一块空地。')}</p></div></div>`}
function farm(g){return `<div class="farm-layout"><section class="farm-main"><div class="farm-toolbar"><div><h2>湖畔的六块小田</h2><p>点一块田，在农具箱里照料它。</p></div><span class="farm-toolbar-icon" aria-hidden="true">${sprite('i-water')}</span></div><div class="farm-landscape">${projectScene(g,{surface:'farm'})}${farmCompanion(g)}<div class="farm-location">文山湖畔 · 我的小菜园</div><div class="plots" role="group" aria-label="选择要照料的农田">${g.plots.map((p,i)=>`<button type="button" class="plot" data-action="selectPlot" data-index="${i}" data-farm-plot="${i}" data-growth="${plotGrowth(p)}" aria-pressed="${selectedPlot===i}" aria-controls="farm-controls" aria-label="${plotLabel(p,i)}">${plotContents(p,i)}</button>`).join('')}</div><p class="farm-kind">成熟后不会枯萎，忙完再来收也没关系。</p></div><details class="farm-help"><summary>种植小贴士</summary><p>每块地浇水一次，缩短剩余时间的 25%。小萝卜 1 分钟成熟；收成先给伙伴交付委托、准备建设；多余的可以喂食或出售。荔枝币仅用于本机庭院，没有充值、提现或交易功能。</p></details></section>
 <section class="card farm-controls" id="farm-controls" aria-labelledby="farm-selected-title"><p class="eyebrow">${sprite('i-water','item-icon')}我的农具箱</p><h2 id="farm-selected-title" aria-live="polite">第 ${selectedPlot+1} 块田</h2><div id="farm-plot-details">${farmDetails(g)}</div><div class="seed-picker"><label for="seed-choice">下一次播种</label><select id="seed-choice">${seedOptions(g)}</select><small>每次播种消耗 1 颗种子</small><p class="farm-purpose">${esc(cropPurpose(g,selectedCrop))}</p>${btn('和伙伴一起备种 →','gardenRoute','data-tab="arcade"','quiet')}</div><div class="actions" id="farm-plot-actions" aria-live="polite">${farmAction(g)}</div></section>
 <aside class="farm-sidebar">${harvestBasket(g)}${dailyBoard(g)}</aside></div>`}
function renderFarmSelection(){
 if(page!=='garden'||gardenTab!=='farm')return;
 const g=settle(state).game;
 document.querySelectorAll('[data-farm-plot]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.farmPlot)===selectedPlot)));
 const title=document.getElementById('farm-selected-title'),details=document.getElementById('farm-plot-details'),actions=document.getElementById('farm-plot-actions');
 if(title)title.textContent='第 '+(selectedPlot+1)+' 块田';if(details)details.innerHTML=farmDetails(g);
 const purpose=document.querySelector('.farm-purpose');if(purpose)purpose.textContent=cropPurpose(g,selectedCrop);
 if(actions){const restoreFocus=actions.contains(document.activeElement);actions.innerHTML=farmAction(g);if(restoreFocus)actions.querySelector('button')?.focus({preventScroll:true})}
}
function renderFarmState(){
 if(page!=='garden'||gardenTab!=='farm')return;
 const g=settle(state).game;
 document.querySelectorAll('[data-farm-plot]').forEach(el=>{const i=Number(el.dataset.farmPlot),p=g.plots[i];el.dataset.growth=plotGrowth(p);el.setAttribute('aria-label',plotLabel(p,i));el.innerHTML=plotContents(p,i)});
 const seeds=document.getElementById('seed-choice');if(seeds)seeds.innerHTML=seedOptions(g);
 const money=document.querySelector('.garden-tools .wallet');if(money)money.outerHTML=wallet(g);
 const basket=document.querySelector('.harvest-basket');if(basket)basket.outerHTML=harvestBasket(g);
 document.querySelectorAll('.daily-board').forEach(el=>el.outerHTML=dailyBoard(g));
 const companion=document.querySelector('[data-farm-pet-say]');if(companion)companion.textContent=activePet(g).say;
 if(petPlayer)petPlayer.setPet(activePet(g),{focus:!!g.focus&&g.focus.end>Date.now(),motion:state.preferences.motion});
 renderFarmSelection();paintGardenPath();
}
function tickFarm(){
 if(busy||page!=='garden'||gardenTab!=='farm')return;
 let selectedMatured=false;
 document.querySelectorAll('[data-farm-plot]').forEach(el=>{const i=Number(el.dataset.farmPlot),p=state.game.plots[i];if(el.dataset.growth==='growing'&&plotGrowth(p)==='ready'){el.dataset.growth='ready';el.setAttribute('aria-label',plotLabel(p,i));const soil=el.querySelector('.soil');soil.classList.remove('growing');soil.classList.add('ready');if(i===selectedPlot)selectedMatured=true}});
 if(selectedMatured)renderFarmSelection();
}
function market(g){return ordersView(g,{cropIcon,crops:CROPS})+`<div class="grid"><section class="card" id="seed-shop"><h2>种子铺</h2>${Object.entries(CROPS).map(([k,c])=>`<div class="market-item">${cropIcon(k)}<div><strong>${c.name}</strong><small>${c.time/60000} 分钟 · 收获 ${c.yield} 个 · 持有 ${g.seeds[k]} 颗</small></div>${btn(gardenLevel(g)<c.level?'Lv.'+c.level+' 解锁':c.price+' 币 / 颗'+(g.coins<c.price?' · 不足':''),'buySeed',`data-crop="${k}" ${gardenLevel(g)<c.level||g.coins<c.price?'disabled':''}`)}</div>`).join('')}</section><section class="card"><h2>收成背包</h2>${Object.entries(CROPS).map(([k,c])=>`<div class="market-item">${cropIcon(k)}<div><strong>${c.name} ×${g.stock[k]}</strong><small>每个 ${c.sell} 币 · 为委托和下一项建设留 ${Math.min(g.stock[k],reservedStock(g)[k]||0)} 个</small></div>${btn('出售多余 ×'+sellableStock(g,k),'sellSurplus',`data-crop="${k}" ${sellableStock(g,k)?'':'disabled'}`)}</div>`).join('')}</section><section class="card"><h2>伙伴杂货</h2><div class="market-item">${cat(g)}<div><strong>伙伴食物</strong><small>每份补充 30 点饱食</small></div>${btn('8 币 / 份'+(g.coins<8?' · 不足':''),'buyFood',g.coins<8?'disabled':'')}</div><p class="notice">没有食物时，可以领取每日补给，或将收成直接喂给伙伴。</p></section><section class="card"><h2 class="icon-heading tone-rose">${sprite('i-lantern','heading-icon')}小屋装饰</h2>${Object.entries(DECOR).map(([k,d])=>`<div class="market-item"><div><strong>${d.name}</strong><small>${g.decor.includes(k)?g.equipped.includes(k)?'已摆放在小屋':'已经拥有，可随时摆放':'兑换后永久拥有'}</small></div>${btn(g.decor.includes(k)?g.equipped.includes(k)?'收起来':'摆出来':d.price+' 币'+(g.coins<d.price?' · 不足':''),'decor',`data-id="${k}" ${!g.decor.includes(k)&&g.coins<d.price?'disabled':''}`)}</div>`).join('')}</section></div>`}
function journal(g){return projectView(g,{cropIcon,sprite})+journeyView(g)+`<div class="journal-layout">${dailyBoard(g)}<section class="card milestone-board"><h2>${sprite('i-medal','heading-icon')}庭院纪念章</h2><p class="muted">这些小成就，记得你走过的每一步。</p><div class="milestone-grid">${achievementList(g).map(a=>`<article class="milestone ${a.done?'achieved':''}">${sprite('i-medal')}<strong>${a.name}</strong><small>${a.hint}</small>${btn(g.achievements.includes(a.id)?'已收藏':a.done?'收藏 · +30 币':'还在路上','achievement',`data-id="${a.id}" ${!a.done||g.achievements.includes(a.id)?'disabled':''}`,a.done&&!g.achievements.includes(a.id)?'primary':'quiet')}</article>`).join('')}</div></section><section class="card crop-collection"><div class="card-head"><h2>亲手收获的四季</h2><span class="badge">${g.discovered.length} / 4</span></div><div class="collection-grid">${Object.entries(CROPS).map(([k,c])=>`<article class="collection-item ${g.discovered.includes(k)?'discovered':''}"><div>${cropIcon(k)}</div><strong>${c.name}</strong><small>${g.discovered.includes(k)?'已收进图鉴':'等待第一次收获'}</small><span>${c.time/60000} 分钟成熟</span></article>`).join('')}</div><p class="garden-totals">种下 ${g.stats.planted} 份期待 · 收获 ${g.stats.harvest} 次 · 专注 ${g.stats.minutes} 分钟 · 完成 ${g.stats.tasks} 件小事</p></section></div>`}
function garden(){const g=settle(state).game;return head('荔枝庭院','把收成送给伙伴，把小小心愿建在湖边。',`<div class="garden-tools">${wallet(g)}${btn('导出庭院明信片','shareGarden','','quiet')}${btn(g.daily.gift?'今日补给已领取':'领取每日补给','gift',g.daily.gift?'disabled':'','primary')}</div>`)+`<div class="subnav" aria-label="庭院分区">${Object.entries({pet:'伙伴小屋',farm:'我的农田',market:'庭院集市',arcade:'伙伴小桌',journal:'回忆与建设'}).map(([k,t])=>btn(t,'gardenTab',`data-tab="${k}" aria-pressed="${gardenTab===k}"`,gardenTab===k?'active':'')).join('')}</div>${({pet,farm,market,arcade:g=>arcadeView(g,{petHTML:cat(g),cropIcon}),journal})[gardenTab](g)}<div class="garden-brief">${nextStepHTML({...state,game:g})}${['pet','farm'].includes(gardenTab)?projectStrip(g,{cropIcon,sprite}):''}</div>`}
function study(){
 const locked=!!workspaceFailure&&['focus','grades'].includes(studyTab),academic=!locked&&['timetable','grades'].includes(studyTab);
 return head('学习书屋','一本课程笔记，一段安静时间。学过的东西，在这里慢慢留下来。')
 +sectionNav({notes:'课程笔记',focus:'专注与小事',timetable:'我的课表',grades:'成绩与绩点'},studyTab,'studyTab','学习书屋分区')
 +(academic?`<div class="student-choice"><label for="student-level">我的培养层次</label><select id="student-level"><option value="undergrad" ${state.preferences.studentLevel==='undergrad'?'selected':''}>本科</option><option value="graduate" ${state.preferences.studentLevel==='graduate'?'selected':''}>研究生</option></select><small>${workspaceFailure?'庭院存档暂时打不开：这里的选择只在本次打开期间有效，学期按官方校历计算。':'记住入口偏好，不改变学校账号权限。'}</small></div>`:'')
 +(locked?workspaceFailureHTML():studyTab==='notes'?notebookUI.view():studyTab==='focus'?`<div class="focus-layout">${focusView(state)}<section class="card"><div class="card-head"><h2>我的小事</h2><small>一步一步来</small></div>${todoHTML()}</section>${weeklyView(state)}</div>`:studyTab==='timetable'?officialUI.card(false,state.preferences.studentLevel)+`<div class="grid">${academicUI.card()}${state.preferences.studentLevel==='graduate'?schoolUI.loginCard():''}${schoolUI.timetableCard(state.preferences.studentLevel)}</div>`:officialUI.card(false,state.preferences.studentLevel+'-scores')+campusUI.grades());
}
function settings(){
 const installed=globalThis.szuDesktop?.shell==='electron';
 // macOS 桌面版：菜单栏图标代替托盘，右键多了触控板和 Control 点按两种手势；触控板一次滑动会连跳好几档，所以不写「每次调整 10%」。
 // 这里就地判断而不导入 platform.mjs：检查脚本会把本函数单独放进 vm 里运行。
 const mac=globalThis.szuDesktop?.platform==='darwin';
 const appearance=`<div class="settings-layout"><section class="card settings-scenery"><h2 class="icon-heading">${sprite('i-flower','heading-icon')}窗外的风景</h2><p class="muted">选一处喜欢的风景。庭院、书屋和每一扇小窗会一起换装。</p>${homeSkinPicker(state.preferences.homeSkin||'pixel').replace('<details class="home-skin-picker">','<details class="home-skin-picker" open>')}</section><section class="card"><h2 class="icon-heading tone-magic">${sprite('i-quill','heading-icon')}个人展示</h2><form id="profile-form"><label for="display-name">昵称</label><input id="display-name" name="name" maxlength="20" placeholder="留空也很好" value="${esc(state.profile.name)}"><label for="college">学院</label><input id="college" name="college" maxlength="40" value="${esc(state.profile.college)}" placeholder="例如：法学院" aria-describedby="college-hint"><small id="college-hint">填学院全称，「学校公告」会直接显示这个学院的通知。只保存在本机。</small><label for="theme">庭院光线</label><select id="theme" name="theme"><option value="day" ${state.preferences.theme==='day'?'selected':''}>暖阳</option><option value="night" ${state.preferences.theme==='night'?'selected':''}>暮色</option></select><div class="actions"><label><input type="checkbox" name="motion" ${state.preferences.motion?'checked':''}>开启动画（伙伴与庭院风景）</label></div><div class="actions"><button class="primary">保存设置</button></div></form></section></div>`;
 const desktop=desktopUI.card()+(installed?`<section class="card"><h2 class="icon-heading tone-info">${sprite('i-heart','heading-icon')}桌面伙伴</h2><label for="pet-scale">伙伴大小</label><input id="pet-scale" type="range" min="0.4" max="2" step="0.05" value="1"><p id="pet-scale-value" class="muted">100%</p><p class="muted">${mac?'点击或右键（触控板双指轻点，或按住 Control 点按）伙伴可打开菜单，摸摸、喂食、陪玩和休息都会保存到同一份庭院存档。拖动伙伴可以移动位置；悬停时滚动鼠标滚轮，或在触控板上双指上下滑动，可调整大小，也可以用滑杆在 40–200% 之间细调。':'点击或右键伙伴可打开菜单，摸摸、喂食、陪玩和休息都会保存到同一份庭院存档。拖动伙伴可以移动位置，悬停时滚轮每次调整 10%；也可以用滑杆在 40–200% 之间细调。'}</p><p class="muted">菜单还能打开农田、学习书屋与今日，${mac?'菜单栏图标':'托盘'}里也可快速切换大小。</p></section>`:`<section class="card"><h2 class="icon-heading tone-info">${sprite('i-signal','heading-icon')}开机自启</h2><p id="autostart-state" class="muted">正在读取…</p><p class="muted">登录 Windows 时静默启动并自动连接一次校园网。需要界面时，再双击程序打开。</p><div class="actions">${btn('读取中…','autostart')}</div><small>可在这里或 Windows 的「启动应用」中关闭。</small></section>`);
 // 读档失败时只把存档卡换成恢复说明；从备份恢复、课程笔记备份和删除凭据都与庭院存档无关，照常可用。
 const data=`${workspaceFailure?workspaceFailureHTML():''}<div class="settings-layout"><section class="card"><h2 class="icon-heading tone-warning">${sprite('i-satchel','heading-icon')}存档与备份</h2><p class="muted">${workspaceFailure?'庭院存档暂时打不开，可以用以前导出的备份替换它。课程笔记独立保存，照常可以备份。':'庭院、待办、绩点和个人展示都保存在本机。更新程序不会清空存档。课程笔记独立保存，请另外导出笔记备份。导出文件不包含校园网账号密码。'}</p><div class="actions">${workspaceFailure?'':btn('导出庭院与待办','export')}${btn('备份课程笔记','notebookBackup','','quiet')}</div><label for="import-file">从备份恢复</label><input id="import-file" type="file" accept="application/json,.json"><small>这里导入会替换庭院、待办与绩点，不会替换课程笔记；确认前会校验文件。</small><p class="notice">${mac?'存档默认位于 ~/.szunet/workspace-v1.json（在 Finder 中按 ⌘⇧. 可显示隐藏文件夹）。':'存档默认位于用户目录下的 .szunet / workspace-v1.json。'}换电脑前，请先导出存档。</p></section><section class="card"><h2 class="icon-heading tone-success">${sprite('i-shield','heading-icon')}账号隐私</h2><p>${saved?'本机已保存校园网凭据。默认不显示卡号。':'本机没有保存校园网凭据。'}</p><p class="muted">${mac?'macOS 把密码存进系统钥匙串（Keychain）。':'Windows 使用系统 DPAPI 保护密码。'}查看卡号需要在校园网页主动点击，不会出现在首页或导出的存档里。</p>${btn('删除已保存凭据','forget',saved?'':'disabled','danger')}</section></div>`;
 // 功能状态只留 README 功能表一个来源，这里只放一句话和链接，免得两处各写一份又对不上。
 const about=`<div class="settings-layout">${releaseUI.card()}${feedbackUI.card()}<section class="card settings-about"><h2 class="icon-heading">${sprite('i-cottage','heading-icon')}关于荔枝庭院</h2><p><strong id="about-version">szuDesktop ${appVersion||'版本未知'}</strong></p><p class="muted">学生自制的校园生活工具，与深圳大学官方无关。把学校里的小事安顿好，也给每天留一点好玩的时间。</p><p class="muted">各项功能现在是可用、测试中还是部分可用，以 <a href="https://github.com/SzuDesktopTeam/szudesktop#%E5%8A%9F%E8%83%BD" target="_blank" rel="noopener noreferrer">README 的功能表 ↗</a> 为准。</p><div class="actions">${btn('退出应用','shutdown','','danger')}</div><small>${exitHint()}</small></section></div>`;
 return head('设置','收好回忆，让这里更像自己。')
 +sectionNav({appearance:'风景与偏好',desktop:'桌面陪伴',data:'存档与隐私',about:'关于与更新'},settingsTab,'settingsTab','设置分区')
 +(workspaceFailure&&settingsTab==='appearance'?workspaceFailureHTML():({appearance,desktop,data,about})[settingsTab]);
}
function loadPetScale(){
 const input=$('#pet-scale');if(!input||!globalThis.szuDesktop?.setPetScale)return;
 const show=showPetScale;
 globalThis.szuDesktop.petScale().then(show).catch(()=>toast('暂时无法读取伙伴大小'));
 input.addEventListener('input',()=>{const out=$('#pet-scale-value');if(out)out.textContent=Math.round(Number(input.value)*100)+'%'});
 input.addEventListener('change',async()=>{
  input.disabled=true;
  try{show(await globalThis.szuDesktop.setPetScale(Number(input.value)));}
  catch{toast('伙伴大小没有保存，请检查本机配置目录后重试');try{show(await globalThis.szuDesktop.petScale())}catch{}}
  finally{input.disabled=false}
 });
}
function showPetScale(scale){const input=$('#pet-scale');if(input)input.value=String(scale);const out=$('#pet-scale-value');if(out)out.textContent=Math.round(scale*100)+'%'}
function paintCompanionDialog(){
 const dialog=$('.companion-dialog');
 // 读档失败时伙伴都还在原存档里，不拿占位状态里的默认伙伴冒充。
 if(workspaceFailure){dialog.querySelector('.companion-portrait').innerHTML=sprite('i-scroll');dialog.querySelector('.speaker').textContent='小提示';dialog.setAttribute('aria-label','庭院的小提示');$('#companion-tip').textContent='庭院存档暂时打不开。伙伴们都还在原存档里，恢复后就会回来。';return}
 const pet=activePet(state.game);
 dialog.querySelector('.companion-portrait').innerHTML=sprite(petSprite(pet));
 dialog.querySelector('.speaker').textContent=pet.name;
 dialog.setAttribute('aria-label',pet.name+'的小提示');
 $('#companion-tip').textContent=pageTips[page];
}
function render(){if(!state)return;document.body.dataset.theme=state.preferences.theme;document.body.dataset.page=page;document.body.dataset.studyTab=studyTab;document.body.dataset.homeSkin=state.preferences.homeSkin||'pixel';document.body.dataset.motion=state.preferences.motion?'on':'off';$('#today').innerHTML=sprite('i-calendar','item-icon')+new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});$('#nav').innerHTML=Object.entries(pages).map(([k,v])=>`<button data-action="navigate" data-page="${k}" ${k===page?'aria-current="page"':''}>${sprite(pageIcons[k])}<span>${v}</span></button>`).join('');paintCompanionDialog();const notebook=page==='study'&&studyTab==='notes'?document.querySelector('[data-notebook]'):null;const focused=document.activeElement,spot=focusKey(focused);$('#main').innerHTML=pageHTML();if(page==='settings'&&settingsTab==='appearance'&&settingsProfileDraft){const fresh=document.getElementById('profile-form');refreshDraft(settingsProfileDraft,fresh);fresh?.replaceWith(settingsProfileDraft)}if(notebook){document.querySelector('[data-notebook]')?.replaceWith(notebook);if(focused&&notebook.contains(focused))focused.focus({preventScroll:true})}if(page==='study'&&studyTab==='notes')notebookUI.mount(document.getElementById('main'));if(page==='services'&&serviceTab==='notices')void campusUI.enterNotices();if(page==='settings'&&settingsTab==='desktop'){if(globalThis.szuDesktop?.shell!=='electron')loadAutostart();loadPetScale();desktopUI.load();}clocks();mountGardenPlayers();restoreFocus(spot)}
// 单页渲染兜底：任何页面函数抛异常，都换成一页可读的提示，而不是让 #main 保持空白、
// 也不打断 clocks() 等后续刷新。存档与其它页面不受影响。
function pageHTML(){try{if(workspaceFailure&&(page==='home'||page==='garden'))return workspaceFailureHTML();return ({home,network,services:servicesPage,garden,study,settings})[page]()}catch(e){return `<section class="card"><h1>这个页面没能显示</h1><p class="notice error">${esc(e&&e.message||'渲染异常')}</p><p>你的存档和其他页面不受影响。可以切换到别的页面，或重新打开程序。</p><button data-action="navigate" data-page="home">回到今日</button></section>`}}
// 读档失败时依赖庭院存档的页面显示这张卡片；页头、分区和其他页面照常可用。
function workspaceFailureHTML(){const hasRaw=workspaceFailure.raw!==null&&workspaceFailure.raw!==undefined,mac=globalThis.szuDesktop?.platform==='darwin';return `<section class="card workspace-failure" id="workspace-failure"><h1>庭院存档暂时打不开</h1><p class="notice error">${esc(workspaceFailure.message)}</p><p>原存档文件不会被覆盖。校园网、课程笔记、校园服务和桌面设置不依赖这份存档，可以照常使用。</p>${hasRaw?`<p class="muted">宽松恢复会尽量保留能读懂的伙伴、作物、待办和设置，其余恢复为初始值，再保存为本机存档。恢复前建议先导出原始存档。</p><div class="actions">${btn('导出原始存档','workspaceExportRaw','','quiet')}${btn('尝试宽松恢复','workspaceRecover','','primary')}</div>`:mac?'<p class="muted">存档默认位于 ~/.szunet/workspace-v1.json（在 Finder 中按 ⌘⇧. 可显示隐藏文件夹）。可以先备份这个文件，再重新读取。</p>':'<p class="muted">存档默认位于用户目录下的 .szunet / workspace-v1.json。可以先备份这个文件，再重新读取。</p>'}<div class="actions">${btn('重新读取','reload','','quiet')}${page==='settings'&&settingsTab==='data'?'':btn('从备份恢复','navigate','data-page="settings" data-tab="data"')}${btn('去连接校园网','navigate','data-page="network"')}${btn('打开课程笔记','navigate','data-page="study" data-tab="notes"')}</div></section>`}
function enterWorkspaceFailure(error,raw){
 workspaceFailure={message:error?.message||'存档读取失败',raw:raw??null};
 // 占位状态只用于渲染不依赖存档的页面；commit 会拒绝写入，不会覆盖原存档。
 state=createState();state.preferences.onboarded=true;
}
async function recoverWorkspace(){
 const failure=workspaceFailure;if(!failure||failure.raw===null)return;
 if(typeof engine.recoverSave!=='function'){toast('当前版本还不能宽松恢复这份存档。请先导出原始存档，更新应用后再试。');return}
 if(!await confirm('尝试宽松恢复存档？','会尽量保留能读懂的伙伴、作物、待办和设置，其余恢复为初始值，并保存为本机存档。建议先导出原始存档。')||workspaceFailure!==failure)return;
 // 写盘前再用 normalize 校验：校验不过就不写，免得覆盖原存档后下次启动仍然打不开。
 let next;try{next=normalize(engine.recoverSave(structuredClone(failure.raw),Date.now()))}catch(e){throw Error('宽松恢复没有成功：'+(e.message||'存档无法读取'))}
 await replaceFailedWorkspace(next,'已按能读懂的内容恢复存档，并保存到本机');
}
// 降级状态下用一份已通过 normalize 校验的存档替换打不开的原存档：解除写入拦截，走正常保存。
// 保存失败时回到降级状态；若冲突时同步到了另一个窗口已恢复好的有效存档，就直接沿用它。
async function replaceFailedWorkspace(next,done){
 const failure=workspaceFailure,placeholder=state;
 workspaceFailure=null;
 try{await commit(next,undefined,()=>{})}
 catch(e){if(state===placeholder){workspaceFailure=failure;throw e}done='另一个窗口已经恢复了存档，已同步到最新记录'}
 workspaceReady=true;settingsProfileDraft=null;render();toast(done);
}
let navigating=false;
function currentRoute(){return {page,tab:({study:studyTab,services:serviceTab,garden:gardenTab,settings:settingsTab})[page]}}
async function navigate(p,tab,{historyMode='push'}={}){
 if(!pages[p])return false;
 if(navigating){toast('正在保存笔记并切换页面，请稍候');return false}
 const target=readRoute('#'+p+'/'+(tab||({study:studyTab,services:serviceTab,garden:gardenTab,settings:settingsTab})[p]||''));
 const same=routeHash(currentRoute())===routeHash(target);
 if(same&&target.page==='settings'){history.replaceState(null,'',routeHash(target));window.scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});return true}
 navigating=true;
 try{
  if(document.querySelector('[data-notebook]'))await leaveNotebook();
  // 只有真正改过的个人展示表单才留作草稿；原样离开时，回来按最新存档重新渲染。
  if(page==='settings'&&settingsTab==='appearance'){const form=document.getElementById('profile-form');if(form)settingsProfileDraft=formEdited(form)?form:null}
  if(target.page==='study')studyTab=target.tab;
  if(target.page==='services')serviceTab=target.tab;
  if(target.page==='garden')gardenTab=target.tab;
  if(target.page==='settings')settingsTab=target.tab;
  page=target.page;history[historyMode==='replace'||same?'replaceState':'pushState'](null,'',routeHash(target));render();window.scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});pollNetwork();return true;
 }catch(e){if(historyMode==='replace')history.replaceState(null,'',routeHash(currentRoute()));toast(e.message||'笔记还未保存，请先导出草稿或重试。');return false}
 finally{navigating=false}
}
// 离开笔记页前先保存。离线、服务无响应或多窗口冲突时留在书桌上等待重试或处理；
// 体积超限这类重试也不会成功的错误，确认后放行：未保存的修改留在书桌草稿里，不把人困在笔记页。
// 专心书写由 notebookUI.leave() 不论成败自己收起，这里不再绕过它直接改 body 的类。
async function leaveNotebook(){
 try{await notebookUI.leave()}
 catch(e){
  if(!e.code||e.code===409)throw e;
  const reason=String(e.message||'笔记没能保存').replace(/[。.]$/,'');
  if(!await confirm('笔记还没能保存，仍要离开书桌？',reason+'。未保存的修改会留在书桌上；关闭应用前，请回到书桌导出笔记备份，或删去部分内容后再保存。'))throw e;
 }
}
async function followHashRoute(){
 if(!state)return;
 if(location.hash==='#main'){history.replaceState(null,'',routeHash(currentRoute()));return}
 if(busy||navigating){history.replaceState(null,'',routeHash(currentRoute()));toast('正在保存或处理上一项操作，请稍后再切换页面');return}
 const target=readRoute(location.hash);
 await navigate(target.page,target.tab,{historyMode:'replace'});
}
let notifiedFocus=0,visitAttemptDay='';
function clocks(){if(!state||exiting)return;
 refreshDay();
 if(!busy&&(page==='home'||page==='garden'))paintGardenPath(false);
 const focus=state.game.focus,bar=$('#activity-bar');bar.hidden=!focus;
 if(page==='home'){
  const note=document.querySelector('.home-pet-note');
  if(note){const pet=activePet(state.game),recent=pet.say&&Date.now()-pet.saidAt<10000;
   note.classList.toggle('is-quiet',!pet.sleeping&&!recent);
   const text=pet.sleeping?'正在休息，陪你安静待一会儿':recent?pet.say:state.preferences.homeSkin==='pixel'?'点点我，今天也一起加油。':'点点我 · 摸摸头';
   const line=note.querySelector('span');if(line.textContent!==text)line.textContent=text;
  }
 }
 const harvest=$('#home-harvest-label');if(harvest){const ready=state.game.plots.filter(p=>p&&p!=='locked'&&p.ready<=Date.now()).length;harvest.textContent=ready?ready+' 块田可以收获':'去看看我的农田';const count=document.querySelector('[data-home-ready]');if(count)count.textContent=String(ready);}
 if(focus){const done=Date.now()>=focus.end;$('#activity-text').textContent=done?'本次专注已完成，可以领取奖励':'专注中 · '+countdown(focus.end);document.title=(done?'专注完成':countdown(focus.end))+' · szuDesktop';if(done&&notifiedFocus!==focus.end){notifiedFocus=focus.end;toast('专注完成啦，回到学习书屋领取奖励吧。')}}else{document.title='szuDesktop · 荔枝庭院'}
 if(!busy&&page==='garden'&&gardenTab==='pet'){
  const pet=activePet(settle(state).game);
  for(const [action,label,last,delay] of [['pat','摸摸头',pet.lastPat,10000],['play','陪它玩',pet.lastPlay,30000]]){const button=document.querySelector('[data-action='+action+']');if(!button)continue;const seconds=Math.max(0,Math.ceil((last+delay-Date.now())/1000)),unavailable=action==='play'&&(pet.sleeping||pet.energy<25);button.disabled=seconds>0||unavailable;button.innerHTML=sprite(actionIcons[action],'item-icon')+esc(seconds>0?label+' · '+seconds+' 秒':unavailable?(pet.sleeping?'休息中':'精力不足'):label)}
 }
document.querySelectorAll('[data-ready]').forEach(el=>el.textContent=remaining(Number(el.dataset.ready)));tickFarm();if($('#focus-clock')){const f=state.game.focus;$('#focus-clock').textContent=f?countdown(f.end):'25:00';if($('#focus-claim'))$('#focus-claim').disabled=Date.now()<f.end}}
function paintDay(previousDay){
 const now=Date.now(),g=settle(state,now).game;
 document.querySelectorAll('.todo-state').forEach(el=>el.outerHTML=todoView(state,todoFilter,now,false));
 const date=document.getElementById('todo-date');if(previousDay&&date&&date.value===date.defaultValue){date.value=dayKey(now);date.defaultValue=date.value}
 const week=document.querySelector('.weekly-card');if(week)week.outerHTML=weeklyView(state,now);
 const today=document.getElementById('today');if(today)today.innerHTML=sprite('i-calendar','item-icon')+new Date(now).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
 document.querySelectorAll('.daily-board').forEach(el=>el.outerHTML=dailyBoard(g));
 document.querySelectorAll('[data-action="gift"]').forEach(el=>{el.disabled=g.daily.gift;el.innerHTML=sprite('i-chest','item-icon')+(g.daily.gift?'今日补给已领取':'领取每日补给')});
 // New orders also change the inventory reserved for them. The market has no
 // draft forms, so repaint its cards together instead of leaving stale sale quantities.
 if(page==='garden'&&gardenTab==='market')render();
 if(page==='garden'&&gardenTab==='arcade')paintArcade(document.getElementById('main'),g,{reducedMotion:!state.preferences.motion});
 if(page==='garden'&&gardenTab==='journal'){const el=document.querySelector('.journey-card');if(el)el.outerHTML=journeyView(g)}
}
// 界面上次按哪一天刷新。只在日期真正变化时刷新一次：时钟往回校正后，存档里的日期
// 可能暂时领先本机日期，这时不能每秒结算并重绘整页。
let shownDay='';
function refreshDay(){
 if(!state||busy)return;
 const now=Date.now(),day=dayKey(now),rolled=day>state.game.daily.day;
 if(rolled||shownDay&&shownDay!==day){const previousDay=shownDay||state.game.daily.day;if(rolled)state=settle(state,now);paintDay(previousDay)}
 shownDay=day;
 if(workspaceReady&&visitAttemptDay!==day&&state.game.journey.days.length<7&&!state.game.journey.days.includes(day)){visitAttemptDay=day;void run(()=>commit(act(state,{type:'visit'},now),undefined,paintDay),false);}
}
function stampVersion(v){applyVersion(v,{getVersion:()=>appVersion,setVersion:next=>{appVersion=next},document,cards:[['release-panel',releaseUI],['feedback-panel',feedbackUI]]})}
let autostartState=null;
async function loadAutostart(){try{autostartState=await api('/api/autostart')}catch(e){autostartState={supported:true,detail:'读不到开机自启状态：'+e.message,error:e.message}}paintAutostart()}
function paintAutostart(){const el=$('#autostart-state');if(!el)return;const view=autostartView(autostartState,globalThis.szuDesktop?.shell==='electron');el.textContent=view.text;const button=document.querySelector('[data-action=autostart]');if(button){button.disabled=view.disabled;button.innerHTML=sprite('i-signal','item-icon')+view.label}}
async function refresh(){if(probing)return false;probing=true;networkCheckedAt=Date.now();try{net=await api('/api/status');saved=net.saved;stampVersion(net.app_version);if($('#network-summary'))$('#network-summary').innerHTML=networkSummaryHTML(net);if($('#auto-login-result'))$('#auto-login-result').innerHTML=autoLoginHTML(net);return true}catch(e){net=null;if($('#network-summary'))$('#network-summary').innerHTML=networkSummaryHTML(null,e.message);if($('#auto-login-result'))$('#auto-login-result').innerHTML='';return false}finally{probing=false;const hint=$('.network-login > summary small');if(hint)hint.textContent=networkLoginHint(net)}}
// 每次 /api/status 都会探测外网和校园门户，所以只在窗口可见、且当前页面显示网络状态时轮询；
// 切到这两个页面时补一次，窗口回到可见时不论在哪一页都立即补一次（anyPage）。
let networkCheckedAt=0;
function pollNetwork(force=false,anyPage=false){if(shouldPollNetwork({exiting,hidden:document.hidden,page,force,anyPage,now:Date.now(),checkedAt:networkCheckedAt}))void refresh()}
function networkResult(message,error=false,pending=false){const e=$('#network-result');if(e){e.hidden=false;e.textContent=message;e.classList.toggle('error',error);e.dataset.tone=pending?'info':error?'error':'success'}else toast(message)}
function credentialInput(){const f=$('#login-form'),data=Object.fromEntries(new FormData(f));data.username=data.username.trim();if(!!data.username!==!!data.password)throw Error('本次填写账号时，请同时填写对应密码；使用已保存凭据请将两项都留空');return {data,remember:!!data.remember}}
async function authenticate(logout=false){const {data,remember}=credentialInput();networkResult(logout?'正在注销…':'正在认证，请稍候…',false,true);const response=await api(logout?'/api/logout':'/api/login',{username:data.username.trim(),password:data.password,zone:data.zone,ac_id:data.ac_id});networkResult(response.message,!response.ok);if(response.ok){if(!logout&&remember&&data.username&&data.password){try{await api('/api/credential',{username:data.username.trim(),password:data.password});saved=true;networkResult(response.message+'；凭据已安全保存。')}catch(e){networkResult('认证已成功，但保存凭据失败：'+e.message,true)}}$('#account').value='';$('#password').value=''}await refresh()}
async function run(work,disableControls=true){if(busy){toast('正在保存或处理上一项操作，请稍后再试');return}busy=true;const spot=focusKey(document.activeElement),controls=disableControls?[...document.querySelectorAll('#main button, #main select, #main input[type=file]')].map(b=>[b,b.disabled]):[];controls.forEach(([b])=>b.disabled=true);try{await work()}catch(e){toast(e.message);if(page==='network')networkResult(e.message,true)}finally{busy=false;controls.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled});schoolUI.sync();clocks();restoreFocus(spot)}}
// 只有下列公开查询可在后台等待；写操作仍共用 run() 的存档锁。
async function runRead(work){if(busy){toast('正在保存或处理上一项操作，请稍后再试');return}try{await work()}catch(e){toast(e.message)}}
function petActionMessage(action){const pet=activePet(state.game);return {pat:'摸摸头，它很开心',feed:'吃饱啦，谢谢你',play:'玩得很开心！',chat:pet.say,petSignature:pet.say,sleep:pet.sleeping?'晚安，'+pet.name:pet.name+'醒来啦',switchPet:pet.name+'来陪你啦'}[action]}
async function handlePetCommand(command){
 const care=['pat','feed','play','sleep','chat'],destinations={garden:'伙伴小屋已打开',farm:'我的农田已打开',study:'学习书屋已打开',home:'已回到今日'};
 const choice=typeof command==='string'&&/^switchPet:(?:0|[1-9]\d*)$/.test(command)?Number(command.slice(10)):null;
 const result=(ok,message,action)=>globalThis.szuDesktop?.petResult?.({ok,message,...(action?{action}:{})});
 if(choice===null&&!care.includes(command)&&!Object.hasOwn(destinations,command)){result(false,'暂不支持这个伙伴操作');return}
 if(!workspaceReady||!state||exiting){result(false,'庭院还没有准备好，请稍后再试');return}
 if(busy){result(false,'正在保存或处理上一项操作，请稍后再试');return}
 const previousIndex=state.game.active,previousSpecies=activePet(state.game).species;
 await run(async()=>{
  try{
   if(choice!==null||care.includes(command)){const action=choice!==null?{type:'switchPet',index:choice}:{type:command};await commit(act(state,action),undefined,()=>renderPetCare(choice!==null||state.game.active!==previousIndex||activePet(state.game).species!==previousSpecies));const message=petActionMessage(action.type);reactPet(action.type,false);toast(message);result(true,activePet(state.game).say,petReaction(action.type,activePet(state.game)))}
   else{const opened=await navigate(command==='farm'?'garden':command,({garden:'pet',farm:'farm',study:'focus'})[command]);result(opened,opened?destinations[command]:'笔记尚未保存，请回到书桌重试或导出草稿')}
  }catch(e){result(false,e.message||'这次操作没有保存，请稍后再试');throw e}
 },false);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]:not([data-animated-pet])');if(!b)return;const a=b.dataset.action;if(a==='petPreview'){const region=document.getElementById('pet-animation-frames');if(region)region.innerHTML=frameStrip(activePet(state.game).species,b.dataset.clip);document.querySelectorAll('[data-action=petPreview]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));petPlayer?.play(b.dataset.clip);return}if(a==='gardenRoute'){void routeGarden(b.dataset);return}if(a==='showGuide'){showGuide();return}if(a==='reload'){location.reload();return}if(a==='viewCampus'){$('#campus-view').showModal();return}if(busy){toast('正在保存或处理上一项操作，请稍后再试');return}if(a==='notebookResume'){run(async()=>{await notebookUI.resumeLatest();await navigate('study','notes')});return}if(a==='navigate'){void navigate(b.dataset.page,b.dataset.page==='study'?(b.dataset.tab||'notes'):b.dataset.tab);return}if(['studyTab','serviceTab','gardenTab','settingsTab'].includes(a)){void navigate(({studyTab:'study',serviceTab:'services',gardenTab:'garden',settingsTab:'settings'})[a],b.dataset.tab);return}if(a==='selectPlot'){if(!busy){selectedPlot=Number(b.dataset.index);renderFarmSelection()}return}if(a==='todoFilter'){if(!busy){const spot=focusKey(document.activeElement);todoFilter=b.dataset.filter;document.querySelectorAll('.todo-state').forEach(el=>el.outerHTML=todoView(state,todoFilter,Date.now(),false));restoreFocus(spot)}return}e.preventDefault();const runner=['booking-rooms','booking-query','booking-rules','notice-read','notice-sources','calendar-refresh','piano-rooms','piano-my','piano-next','piano-prev','release-check'].includes(a)?runRead:run;runner(async()=>{
 if(a==='todoEditOpen'){const t=state.todos.find(t=>t.id===b.dataset.id);if(!t)return;const f=document.getElementById('todo-edit-form');f.elements.todoId.value=t.id;f.elements.text.value=t.text;f.elements.date.value=t.date||'';document.getElementById('todo-editor').showModal();return}
 if(a==='closeTodoEdit'){document.getElementById('todo-editor').close();return}
 if(a==='shareGarden'){const card=await exportGardenCard(state),dialog=$('#garden-share'),image=dialog.querySelector('img'),download=dialog.querySelector('a');image.src=card.url;download.href=card.url;download.download=card.filename;dialog.onclose=()=>{URL.revokeObjectURL(card.url);image.removeAttribute('src');download.removeAttribute('href')};dialog.showModal();return}
 if(a==='todoDelete'&&!await confirm('删除这件小事？','删除后不会保留这条记录；想整理清单也可以使用归档。'))return;
 if(a==='release-check'&&await releaseUI.click(a,b))return;
 if((a==='feedback-copy'||a==='feedback-report')&&await feedbackUI.click(a,b))return;
 if(await officialUI.click(a,b))return;
 if(await schoolUI.click(a,b))return;
 if(await campusUI.click(a,b))return;
 if(await pianoUI.click(a,b))return;
 if(a==='homeSkin'){if(!['pixel','lake','bookshop','terrace'].includes(b.dataset.skin)||b.dataset.skin===state.preferences.homeSkin)return;const next=structuredClone(state);next.preferences.homeSkin=b.dataset.skin;await commit(next,undefined,()=>{if(page==='home'||page==='garden')renderPetCare();else{const forms=[...document.querySelectorAll('#main form[id]')];render();for(const form of forms)document.getElementById(form.id)?.replaceWith(form)}document.getElementById('home-skin-summary')?.focus({preventScroll:true})});return}
 if(a==='calendar-refresh'){await academicUI.load(true);return}
 if(a==='calendar-auto'){const next=structuredClone(state);next.semester='';await commit(next);await academicUI.load();toast('已恢复官方校历');return}
 if(a==='refresh'){if(probing){toast('正在刷新网络状态，请稍候');return}toast(await refresh()?'网络状态已刷新':'网络状态刷新失败，请稍后重试');return}
 if(a==='logout'){await authenticate(true);return}
 if(a==='reveal'){const output=$('#saved-account');if(!output.hidden){output.hidden=true;output.textContent='';b.textContent='查看已保存卡号'}else{const d=await api('/api/credential?reveal=1');output.textContent='已保存卡号：'+(d.username||'未保存');output.hidden=false;b.textContent='隐藏卡号'}return}
 if(a==='diagnose'){const el=$('#diag-result');el.className='notice';el.dataset.tone='info';el.textContent='正在检查网络与校园门户…';let d;try{d=await api('/api/diag')}catch(e){el.dataset.tone='error';el.innerHTML=diagErrorHTML(e.message);throw e}lastDiag=d;el.dataset.tone=d.internet_ok?'info':'warning';el.innerHTML=diagResultHTML(d);return}
 if(a==='notebookBackup'){await notebookUI.backup();return}
 if(a==='workspaceExportRaw'){const raw=workspaceFailure?.raw;if(raw===null||raw===undefined)return;const blob=new Blob([JSON.stringify(raw,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='szudesktop-workspace-raw-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('已导出原始存档，内容未做任何改动');return}
 if(a==='workspaceRecover'){await recoverWorkspace();return}
 if(a==='export'){const snapshot=await api('/api/workspace'),backup=normalize(snapshot.data);const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='szudesktop-garden-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('已导出庭院与学习记录，不含账号密码');return}
 if(a==='autostart'){if(!autostartState?.supported||autostartState.error)return;if(globalThis.szuDesktop?.shell==='electron'&&!autostartState.enabled){toast('安装版暂不支持开机自启');paintAutostart();return}const on=!(autostartState&&autostartState.enabled);try{autostartState=await api('/api/autostart',{enabled:on});toast(autostartState.detail||(on?'已打开开机自启':'已关掉开机自启'))}catch(e){toast(e.message)}paintAutostart();return}
 if(a==='forget'){if(await confirm('删除保存的凭据？','删除后需要重新填写校园账号和密码。庭院与学习记录不受影响。')){await api('/api/credential',undefined,'DELETE');saved=false;render();toast('已删除保存的凭据')}return}
 if(a==='shutdown'){if(await confirm('退出 szuDesktop？','已保存的记录会保留，下次打开可继续使用。')){await notebookUI.leave();if(globalThis.szuDesktop?.shell==='electron'){await globalThis.szuDesktop.quit();return}await api('/api/shutdown',{});$('#main').innerHTML='<section class="card"><h1>庭院已经收好。</h1><p>应用已退出，可以关闭这个窗口了。下次见！</p></section>';exiting=true;windowStream?.close();clearInterval(clockInterval);clearInterval(networkInterval);clearInterval(calendarInterval);$('#activity-bar').hidden=true;document.title='szuDesktop · 已退出';window.close()}return}
 if(a==='courseDelete'){const next=structuredClone(state);next.courses.splice(Number(b.dataset.index),1);await commit(next);toast('课程已移除');return}
 if(a==='focusCancel'&&!await confirm('结束本次专注？','提前结束不会获得本次奖励。'))return;
 const action={type:a,id:b.dataset.id,index:Number(b.dataset.index),crop:b.dataset.crop,minutes:Number(b.dataset.minutes)};if(a==='plant')action.crop=selectedCrop;if(a==='todoArchive')action.archived=b.dataset.archived==='true';if(a==='focusStart')action.todoId=document.getElementById('focus-task')?.value||'';
 const beforeAction=state,previousIndex=state.game.active,previousSpecies=activePet(state.game).species;
 const recipientSpecies=a==='orderDeliver'?state.game.orders.offers.find(order=>order.id===action.id)?.pet:null;
 const preserveForms=['switchPet','pat','feed','play','sleep','chat','petSignature'].includes(a)||(a==='focusStart'&&page==='home')||(page==='garden'&&['gift','quest','achievement'].includes(a));
 await commit(act(state,action),undefined,page==='garden'&&gardenTab==='farm'&&['plant','water','harvest','unlock'].includes(a)?renderFarmState:page==='study'&&['focusStart','focusClaim','focusCancel'].includes(a)?renderStudyProgress:preserveForms?()=>renderPetCare(a==='switchPet'||state.game.active!==previousIndex||activePet(state.game).species!==previousSpecies):render);const recipient=recipientSpecies?state.game.pets.find(pet=>pet.species===recipientSpecies):null;const reply=recipient?recipient.name+'：'+recipient.say:undefined;if((a!=='todoToggle'||state.todos.find(t=>t.id===action.id)?.done)&&!(a==='decor'&&beforeAction.game.decor.includes(action.id)))reactPet(a,true,reply);toast(reply||petActionMessage(a)||({orderDeliver:'委托已交付，伙伴收到你的收成啦',gift:'今日补给已收入背包',harvest:'收成已放入背包，去集市看看吧',plant:'种好啦，离线也会继续生长',water:'浇水完成，成长加快了',quest:'目标奖励已领取',achievement:'新的纪念章已收藏',focusClaim:'专注完成，奖励已领取',buySeed:'种子已放入背包',buyFood:'食物已放入背包',sell:'出售完成，荔枝币已到账',sellSurplus:'多余收成已售出，心愿材料仍留在篮子里',decor:'小屋装饰已更新',todoToggle:'待办已更新',todoDelete:'待办已删除',todoArchive:'归档已更新',todoArchiveDone:'已完成的小事已归档',journeyClaim:'小记忆已放进回忆册'})[a]||'已保存');const reward=actionReward(beforeAction,state,action);if(reward)showReward(reward,reply);
})});
document.addEventListener('submit',e=>{if(e.target.method==='dialog'||e.target.closest('[data-notebook]'))return;e.preventDefault();const f=e.target,d=Object.fromEntries(new FormData(f));run(async()=>{if(await schoolUI.submit(f,d))return;if(await campusUI.submit(f,d))return;if(f.id==='login-form'){await authenticate();return}let next=structuredClone(state);if(f.id==='todo-form')next=act(state,{type:'todoAdd',text:d.todo,date:d.date,id:crypto.randomUUID()});else if(f.id==='todo-edit-form')next=act(state,{type:'todoEdit',id:d.todoId,text:d.text,date:d.date});else if(f.id==='focus-form')next=act(state,{type:'focusStart',minutes:Number(d.minutes),todoId:document.getElementById('focus-task')?.value||''});else if(f.id==='pet-name-form')next=act(state,{type:'rename',name:d.name});else if(f.id==='profile-form'){next.profile={name:d.name.trim(),college:d.college.trim()};next.preferences={...next.preferences,theme:d.theme,motion:!!d.motion}}else if(f.id==='semester-form')next.semester=d.semester;else if(f.id==='course-form'){const credit=Number(d.credit),point=Number(d.point);if(!Number.isFinite(credit)||credit<=0||credit>100||!Number.isFinite(point)||point<0||point>5)throw Error('请填写有效学分和 0–5 的课程绩点');if(next.courses.length>=300)throw Error('最多保存 300 门课程');next.courses.push({name:d.name,credit,point,level:d.level,term:d.term||'',included:true,source:'手动录入'})}else return;await commit(next,{formId:f.id,values:{...d,...(f.id==='profile-form'?{motion:!!d.motion}:{})}},f.id==='focus-form'?renderStudyProgress:f.id==='profile-form'?()=>{if(state===next)settingsProfileDraft=null;render()}:render);if(f.id==='focus-form')reactPet('focusStart');if(f.id==='profile-form')globalThis.szuDesktop?.petResult?.({ok:true,message:''});if(f.id==='todo-edit-form')document.getElementById('todo-editor').close();toast('已保存到本机')})});
document.addEventListener('input',e=>{campusUI.input(e);if(e.target.id==='service-search')$('#service-results').innerHTML=serviceResults(e.target.value)});
document.addEventListener('change',e=>{if(e.target.id==='release-channel'){releaseUI.change(e);return}if(e.target.dataset.desktopSetting){void desktopUI.change(e);return}if(e.target.id==='student-level'){if(workspaceFailure){state.preferences.studentLevel=e.target.value==='graduate'?'graduate':'undergrad';render();return}run(async()=>{const next=structuredClone(state);next.preferences.studentLevel=e.target.value;await commit(next);toast('已记住培养层次')});return}if(e.target.id==='feed-source'){run(()=>campusUI.change(e));return}if(['booking-room','booking-date'].includes(e.target.id)){runRead(()=>campusUI.change(e));return}if(['grade-level','grade-file','grade-filter-level','grade-filter-term'].includes(e.target.id)){if(!busy)run(()=>campusUI.change(e));return}if(e.target.id==='seed-choice'){if(busy)return;selectedCrop=e.target.value;renderFarmSelection();return}if(e.target.id==='import-file'){const file=e.target.files[0];if(!file)return;run(async()=>{if(file.size>2*1024*1024)throw Error('文件太大，请选择本应用导出的 JSON 存档');let next;try{next=normalize(JSON.parse(await file.text()))}catch(err){throw Error('无法导入：'+err.message)}if(await confirm('恢复这份备份？',workspaceFailure?'打不开的原存档会被这份备份替换，建议先导出原始存档或另存 workspace-v1.json。账号密码和课程笔记不受影响。':'当前庭院、待办和学习记录将被替换。建议先导出当前存档。账号密码不受影响。')){if(workspaceFailure){await replaceFailedWorkspace(next,'存档已恢复');return}await commit(next,undefined,()=>{if(state===next)settingsProfileDraft=null;render()});toast('存档已恢复')}else e.target.value=''})}});
let exiting=false;
globalThis.szuDesktop?.onPetCommand?.(handlePetCommand);
globalThis.szuDesktop?.onPetScale?.(showPetScale);
let windowID=crypto.randomUUID(),windowStream;
function connectWindow(){if(exiting)return;windowStream?.close();windowStream=new EventSource('/api/window-stream?id='+encodeURIComponent(windowID))}
window.addEventListener('pagehide',()=>windowStream?.close());
window.addEventListener('hashchange',followHashRoute);
window.addEventListener('pageshow',e=>{if(e.persisted){windowID=crypto.randomUUID();connectWindow()}});
connectWindow();
document.addEventListener('visibilitychange',()=>{if(!document.hidden){clocks();pollNetwork(true,true)}else void flushPuzzle().catch(()=>{})});
const clockInterval=setInterval(clocks,1000),networkInterval=setInterval(()=>pollNetwork(),30000),calendarInterval=setInterval(()=>{if(!exiting&&state)academicUI.load()},3600000);
try{let snapshot=null;try{snapshot=await api('/api/workspace');revision=snapshot.revision;state=snapshot.data?normalize(snapshot.data):createState()}catch(e){if(!snapshot&&!e.code)throw e;enterWorkspaceFailure(e,snapshot?.data)}try{saved=(await api('/api/credential')).saved}catch{}if(!workspaceFailure&&!snapshot.data){firstSession=true;const initial=state;await commit(state).catch(e=>{if(state!==initial)return;if(!e.code)throw e;enterWorkspaceFailure(e,null)})}if(workspaceFailure||snapshot.data)render();workspaceReady=!workspaceFailure;void notebookUI.load();api('/api/health').then(v=>stampVersion(v.app_version)).catch(()=>{});pollNetwork(true);if(workspaceReady&&!state.preferences.onboarded)showGuide();campusUI.loadSession();campusUI.loadCas();campusUI.loadSources();schoolUI.load();pianoUI.load();academicUI.load()}catch(e){$('#main').innerHTML=`<section class="card"><h1>暂时没能打开庭院</h1><p class="notice error">${esc(e.message)}</p><p>原有存档不会被覆盖。请重新打开程序后再试。</p><button data-action="reload">重新读取</button></section>`}
