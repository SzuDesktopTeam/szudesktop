// 桌宠窗口：透明置顶的伙伴窗、它的菜单、缩放、拖动与点击穿透，以及每 30 秒按庭院存档刷新一次状态。
// 窗口状态都在这个工厂里；electron 的 BrowserWindow/Menu/screen/dialog 与存档读取、设置读写由 main.mjs 注入。
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {petWindowOptions,petPlatformOptions,petTopLevel,petWindowBounds,petScaleClamp,petPresetFor,petSay,petSpriteFor,activePetOf,isPetSender,petIgnoresMouse,petClickThroughSupported,pointInBounds,PET_SCALE_DEFAULT,PET_SCALE_PRESETS,PET_WIDTH,PET_HEIGHT} from './pet-policy.mjs';
import {PETS} from './pet-catalog.mjs';

export const PET_REFRESH_MS=30000;
// macOS 上同一次按压结束后这么久之内再次请求菜单，视为同一个手势的重复请求。
export const PET_MENU_REPEAT_MS=1000;
// activateApp 缺省什么也不做：宠物是不激活应用的面板，点它不该抢走前台应用的焦点；只有真机证实菜单弹不出来时才由 main 接上。
export function createPetController({BrowserWindow,Menu,screen,dialog,platform,html,preload,smoke,petShot,gardenEngine,loadWorkspace,
  readPreferences,changeSettings,saveSettings,isQuitting,observeWorkspace,dispatch,refreshTray,publishScale,quit,activateApp=()=>{},
  setInterval:repeat=setInterval,clearInterval:cancel=clearInterval,now=Date.now}){
  const mac=platform==='darwin';
  let petWin=null,petTimer=null,petGreeted=false,petHtmlUrl=null,petScale=PET_SCALE_DEFAULT;
  let petMenu=null,petGame=null,petPosition=null,petDrag=null,petHit=false,petMenuOpen=false,petIgnoring=null;
  // 只在 macOS 上使用的菜单手势记录：菜单是否正在打开、第几次按压、这次按压何时结束（null 表示还按着）、上次菜单属于哪次按压。
  let petMenuPending=false,petPress=0,petPressEnded=-Infinity,petMenuPress=null;

  function sendPet(channel,payload){
    if(petWin&&!petWin.isDestroyed())petWin.webContents.send(channel,payload);
  }
  // 透明宠物窗默认让点击穿过去；立绘报告指针进出、拖动和菜单状态变化时再切换。
  function syncPetMouse(){
    if(!petWin||petWin.isDestroyed()||!petClickThroughSupported(platform))return;
    petIgnoring=petIgnoresMouse({hit:petHit,dragging:Boolean(petDrag),menu:petMenuOpen});
    petWin.setIgnoreMouseEvents(petIgnoring,{forward:true});
  }
  // 拖动结束或菜单关闭时指针可能已在窗外，立绘收不到 pointerleave；以系统光标位置为准复位。
  function settlePetHit(){
    if(petWin&&!petWin.isDestroyed()&&!pointInBounds(screen.getCursorScreenPoint(),petWin.getBounds()))petHit=false;
  }
  // 从 sidecar 拉庭院存档，推导当前伙伴立绘并推给宠物窗。
  // 全程 try/catch：sidecar 短暂不可用不能拖垮主进程；读不到就如实不推，不伪造状态。
  // 宠物隐藏时不拉取，重新显示时由 applyPreferences 补推。
  async function pushPetState(){
    if(isQuitting()||!petWin||petWin.isDestroyed()||!petWin.isVisible())return;
    try{
      const snapshot=await loadWorkspace();
      observeWorkspace(snapshot);
      if(!snapshot.data)return;
      const {settle,normalize}=await gardenEngine;
      const workspace=settle(normalize(snapshot.data)),game=workspace.game;
      const pet=activePetOf(game);
      if(!pet)return;
      petGame=game;
      sendPet('pet:state',petSpriteFor(pet));
      sendPet('pet:action',{species:pet.species,mood:Number(pet.mood),energy:Number(pet.energy),sleeping:Boolean(pet.sleeping),focus:Boolean(game.focus&&game.focus.end>Date.now()),motion:workspace.preferences.motion!==false});
      if(!petGreeted){
        petGreeted=true;
        const name=pet.name||'伙伴';
        sendPet('pet:say',petSay(`我是${name}。点击我打开菜单，拖动我换个位置。`));
      }
    }catch{}
  }
  async function createPetWindow(){
    if(isQuitting())return;
    const {workArea}=petPosition?screen.getDisplayNearestPoint(petPosition):screen.getPrimaryDisplay();
    petHtmlUrl=pathToFileURL(html).href;
    petWin=new BrowserWindow({...petWindowOptions(workArea,petScale,petPosition),alwaysOnTop:readPreferences().petAlwaysOnTop,...petPlatformOptions(platform),
      webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    petWin.setMenuBarVisibility(false);
    // 应用菜单「窗口」一栏只列用户能切换的窗口，宠物不在其中。
    if(mac)petWin.excludedFromShownWindowsMenu=true;
    petHit=false;petMenuOpen=false;
    syncPetMouse();
    const pwc=petWin.webContents;
    smoke?.watch(pwc,{preload:'pet preload: ',console:'pet: '});
    // 宠物窗不加载任何远程内容：拦截一切导航与新窗请求。
    pwc.setWindowOpenHandler(()=>({action:'deny'}));
    pwc.on('will-navigate',event=>event.preventDefault());
    pwc.on('will-redirect',event=>event.preventDefault());
    petWin.on('closed',()=>{petWin=null;});
    // macOS 上 ⌘H、别的应用里的「隐藏其他」会把宠物随整个应用藏起来，设置却没变；菜单栏图标和程序坞菜单的
    // 「隐藏伙伴/显示伙伴」按窗口真实显隐重建，点一次「显示伙伴」就经 applyPreferences 的 showInactive 只把宠物带回来。
    if(mac){petWin.on('hide',()=>refreshTray());petWin.on('show',()=>refreshTray());}
    await petWin.loadFile(html);
    if(isQuitting()||!petWin||petWin.isDestroyed())return;
    petWin.setAlwaysOnTop(readPreferences().petAlwaysOnTop,petTopLevel(platform));
    // macOS：切换桌面或进入全屏应用时宠物跟着走。skipTransformProcessType 必须带上，
    // 否则 Electron 会把整个应用改成没有程序坞图标和应用菜单的后台进程。
    if(mac)petWin.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
    if(readPreferences().petVisible)petWin.showInactive();
    syncPetGeometry();
    // 首帧推送：立绘 + 招呼台词，随后每 ~30s 刷新一次。
    await pushPetState();
    if(petShot&&path.isAbsolute(petShot)){
      await pwc.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
      mkdirSync(path.dirname(petShot),{recursive:true});
      writeFileSync(petShot,(await pwc.capturePage()).toPNG());
    }
    if(!petTimer){petTimer=repeat(()=>void pushPetState(),PET_REFRESH_MS);petTimer.unref?.();}
  }
  // 应用缩放：归一化 → 持久化 → 重算窗口几何 → 推送渲染器 → 刷新托盘勾选 → 通知主窗滑杆。
  // 只走程序化 setBounds，绝不开原生 resizable（透明窗原生缩放在 Windows 上不可靠）。
  function applyPetScale(scale){
    const next=petScaleClamp(scale);
    if(petWin&&!petWin.isDestroyed()){
      const previous=petWin.getBounds(),{workArea}=screen.getDisplayMatching(previous);
      const size=petWindowBounds(workArea,next);
      const position={x:previous.x+(previous.width-size.width)/2,y:previous.y+previous.height-size.height};
      const bounds=petWindowBounds(workArea,next,position);
      saveSettings(next,{x:bounds.x,y:bounds.y});
      petScale=next;
      petWin.setBounds(bounds);
      syncPetGeometry();
    }else{
      saveSettings(next,petPosition);
      petScale=next;
    }
    refreshTray();
    publishScale(petScale);
    return petScale;
  }
  function syncPetGeometry(){
    if(!petWin||petWin.isDestroyed())return;
    const bounds=petWin.getBounds();
    petPosition={x:bounds.x,y:bounds.y};
    sendPet('pet:scale',Math.min(petScale,bounds.width/PET_WIDTH,bounds.height/PET_HEIGHT));
  }
  function changePetSize(scale){
    try{applyPetScale(scale);}catch{sendPet('pet:say','大小没有保存成功，请检查本机配置目录后再试。');}
  }
  // macOS 的 Control 点按会先后送来 pointerdown（左键）和 contextmenu，按压结束时又可能再请求一次菜单；
  // NSMenu 跟踪菜单期间还可能吞掉 pointerup，拖动状态就一直不结束、点击穿透也恢复不了。
  // 所以在 macOS 上：菜单打开中或正在打开时不再打开；同一次按压已经请求过菜单时，按压结束后 1 秒内的再次请求忽略。
  // 其他平台这些条件恒为假，行为与原来一致。
  function repeatedMenuGesture(){
    return petMenuOpen||petMenuPending||(petMenuPress===petPress&&(petPressEnded===null||now()-petPressEnded<PET_MENU_REPEAT_MS));
  }
  async function openPetMenu(){
    if(!petWin||petWin.isDestroyed()||isQuitting())return;
    if(mac){
      if(repeatedMenuGesture())return;
      // 在等待存档之前就记下，等待期间到达的第二次请求直接被挡住；此后到弹出菜单之间没有 await，不会再插进别的请求。
      petMenuPending=true;petMenuPress=petPress;
    }
    await pushPetState();
    petMenuPending=false;
    if(!petWin||petWin.isDestroyed()||isQuitting())return;
    const pet=activePetOf(petGame);
    const care=(label,command)=>({id:command,label,enabled:Boolean(pet),click:()=>dispatch(command)});
    petMenu=Menu.buildFromTemplate([
      {label:pet?`${pet.name} · Lv.${Math.min(20,1+Math.floor(pet.xp/50))}`:'伙伴状态读取中',enabled:false},
      ...(pet?[{label:`饱食 ${Math.round(pet.hunger)} · 心情 ${Math.round(pet.mood)} · 精力 ${Math.round(pet.energy)}`,enabled:false}]:[]),
      {type:'separator'},
      care('聊两句','chat'),care('摸摸头','pat'),care(`喂食${petGame?`（剩余 ${petGame.food} 份）`:''}`,'feed'),care('陪它玩','play'),care(pet?.sleeping?'叫醒伙伴':'让它睡一会','sleep'),
      {label:'切换伙伴',enabled:Boolean(pet),submenu:(petGame?.pets||[]).map((companion,index)=>({
        id:`switchPet:${index}`,label:companion.name+(PETS[companion.species]?.available?'':' · 老朋友'),type:'radio',checked:index===petGame.active,
        click:()=>{if(index!==petGame.active)dispatch(`switchPet:${index}`);},
      }))},
      {type:'separator'},
      {id:'garden',label:'看看庭院',click:()=>dispatch('garden')},
      {id:'farm',label:'照看农田',click:()=>dispatch('farm')},
      {id:'study',label:'学习与专注',click:()=>dispatch('study')},
      {label:`伙伴大小（${Math.round(petScale*100)}%）`,submenu:[
        {label:'缩小一点',enabled:petScale>0.4,click:()=>changePetSize(petScale-0.1)},
        {label:'放大一点',enabled:petScale<2,click:()=>changePetSize(petScale+0.1)},
        {type:'separator'},...petSizeMenu(),
        {label:'恢复默认大小',click:()=>changePetSize(1)},
      ]},
      {type:'separator'},
      {id:'home',label:'打开主窗口',click:()=>dispatch('home')},
      {label:'伙伴置顶',type:'checkbox',checked:readPreferences().petAlwaysOnTop,click:()=>changeSettings({petAlwaysOnTop:!readPreferences().petAlwaysOnTop})},
      {label:'隐藏伙伴',click:()=>changeSettings({petVisible:false})},
      {label:'退出应用',click:()=>quit()},
    ]);
    // 按压还没结束就要弹菜单（Control 点按、按住时按回车）：先把拖动收尾，菜单跟踪期间可能再也收不到 pointerup。
    if(mac&&petDrag){endPetDrag();petPressEnded=now();}
    petWin.setFocusable(true);
    petMenuOpen=true;syncPetMouse();
    if(mac)activateApp();
    petMenu.popup({window:petWin,callback:()=>{
      petMenuOpen=false;
      if(petWin&&!petWin.isDestroyed()){petWin.setFocusable(false);settlePetHit();syncPetMouse();}
    }});
  }
  // 宠物菜单和托盘共用的大小预设。
  function petSizeMenu(){
    const current=petPresetFor(petScale);
    return PET_SCALE_PRESETS.map(p=>({
      label:`${p.label}（${Math.round(p.scale*100)}%）`,
      type:'checkbox',
      checked:current===p.id,
      click:()=>{try{applyPetScale(p.scale);}catch{refreshTray();dialog.showErrorBox('未能保存伙伴大小','请检查本机配置目录是否可写，然后重试。');}},
    }));
  }
  // 桌面设置里宠物的部分：置顶、显示/隐藏。
  function applyPreferences(preferences){
    if(petWin&&!petWin.isDestroyed()){
      petWin.setAlwaysOnTop(preferences.petAlwaysOnTop,petTopLevel(platform));
      // 隐藏期间不刷新伙伴状态；重新显示时立刻补一次。
      if(preferences.petVisible){const hidden=!petWin.isVisible();petWin.showInactive();if(hidden)void pushPetState();}
      // 隐藏后立绘收不到 pointerleave：直接恢复点击穿透，再显示时不会整窗挡住下层。
      else{petWin.hide();petHit=false;syncPetMouse();}
    }else if(preferences.petVisible&&!isQuitting())void createPetWindow().then(refreshTray).catch(()=>{});
  }
  // DPI、分辨率或显示器增减后重算布局，并保持在可见位置。
  function watchDisplays(){
    const reposition=()=>{
      if(petWin&&!petWin.isDestroyed()){
        const {workArea}=screen.getDisplayMatching(petWin.getBounds());
        petWin.setBounds(petWindowBounds(workArea,petScale,petPosition));
        syncPetGeometry();
      }
    };
    screen.on('display-metrics-changed',reposition);
    screen.on('display-removed',reposition);
    screen.on('display-added',reposition);
  }
  // 立绘报告指针是否在自己身上（参数已由 ipc-routes 校验为布尔值）。
  // 记下最近的进出及当时是否仍忽略鼠标：真实光标的转发事件会紧跟着改写瞬时状态，检查只看发生过什么。
  let petHitLog=[];
  function setHit(inside){petHit=inside;syncPetMouse();petHitLog=[...petHitLog.slice(-19),{inside,ignoring:petIgnoring}];}
  // 拖动收尾：移动过才保存位置，然后按系统光标位置恢复点击穿透。
  function endPetDrag(){
    if(petDrag.moved){try{saveSettings(petScale,petPosition);}catch{sendPet('pet:say','位置没有保存成功，下次打开可能回到原处。');}}
    petDrag=null;settlePetHit();syncPetMouse();
  }
  function drag(phase,point){
    if(mac&&phase==='start'){petPress++;petPressEnded=null;}
    if(mac&&phase==='end')petPressEnded=now();
    if(phase==='start'){petDrag={cursor:point,bounds:petWin.getBounds(),moved:false};syncPetMouse();}
    else if(phase==='move'&&petDrag){
      const {workArea}=screen.getDisplayNearestPoint(point);
      const position={x:petDrag.bounds.x+point.x-petDrag.cursor.x,y:petDrag.bounds.y+point.y-petDrag.cursor.y};
      petWin.setBounds(petWindowBounds(workArea,petScale,position));
      petDrag.moved=true;syncPetGeometry();
    }else if(phase==='end'&&petDrag)endPetDrag();
  }
  // 主窗执行完宠物指令后的回执：先按存档刷新，再说结果、播放对应动作。
  async function showResult(result){
    await pushPetState();
    sendPet('pet:say',petSay(result.message));
    if(result.ok&&typeof result.action==='string')sendPet('pet:react',result.action);
  }
  function destroy(){
    cancel(petTimer);petTimer=null;
    if(petWin&&!petWin.isDestroyed())petWin.destroy();
  }
  return {
    create:createPetWindow,pushState:pushPetState,applyScale:applyPetScale,changeSize:changePetSize,
    stepScale:direction=>changePetSize(petScale+direction*0.1),openMenu:openPetMenu,sizeMenu:petSizeMenu,
    applyPreferences,watchDisplays,setHit,drag,showResult,destroy,
    // 主进程主动让宠物说一句（例如 macOS 上系统通知发不出去时）。
    say:text=>sendPet('pet:say',petSay(text)),
    // 启动时恢复上次保存的大小与位置。
    restore:({scale,position})=>{petScale=scale;petPosition=position||null;},
    isSender:event=>Boolean(petHtmlUrl)&&isPetSender(event,petWin,petHtmlUrl),
    isVisible:()=>Boolean(petWin&&!petWin.isDestroyed()&&petWin.isVisible()),
    scale:()=>petScale,window:()=>petWin,menu:()=>petMenu,mouse:()=>({hit:petHit,ignoring:petIgnoring}),hitLog:()=>petHitLog,
  };
}
