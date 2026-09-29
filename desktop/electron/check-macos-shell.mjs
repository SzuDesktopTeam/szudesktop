// macOS 外壳装配的纯逻辑检查：应用菜单模板与「页面」菜单登记、学校和飞书窗口交出的菜单、报错文案、主窗口的全屏关闭与激活、
// 启动失败文案、退出轨迹、冒烟里的 macOS 核对（checkMacRuntime 用假对象走通过与失败两条路；宠物冒烟藏主窗口前先等引导存好，指令超时时带上页面的回报），以及 POSIX 上按进程组清理引擎。
// 只用 Node 内置模块和 testdata 里的假对象，三个平台的 CI 都能跑；同时核对不传 platform（Windows 今天的调用方式）时文案和行为逐字不变。
// main.mjs 把这些接对了没有由 check-main-wiring.mjs 负责，真实 Electron 上的表现由 smoke-macos.mjs 和人工验收负责。
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {buildAppMenuTemplate,createPageMenuRegistry,PAGE_MENU_PLACEHOLDER} from './app-menu.mjs';
import {createSchoolWindows} from './school-window.mjs';
import {createFeishuWindow} from './feishu-window.mjs';
import {createOfficialWindows} from './official-windows.mjs';
import {createMainWindow} from './main-window.mjs';
import {createEngineMonitor} from './engine-monitor.mjs';
import {createQuitCoordinator} from './quit-coordinator.mjs';
import {createQuitTrace} from './smoke-report.mjs';
import {checkMacRuntime,menuRoles} from './smoke-macos.mjs';
import {checkPetRuntime,waitGuideSaved,listenPetReplies,describePetReplies,createPetCommands} from './smoke-pet.mjs';
import {startSidecar,stopSidecar,startupErrorText} from './sidecar.mjs';
import {FakeWebContents,fakeDialog,fakeNativeImage,fakeWindowClass,settle} from './testdata/fake-electron.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const EDIT_ROLES=['undo','redo','cut','copy','paste','pasteAndMatchStyle','delete','selectAll'];
const rolesOf=template=>{const roles=[];const walk=items=>{for(const item of items||[]){if(item.role)roles.push(item.role);walk(item.submenu);}};walk(template);return roles;};
const top=(template,label)=>template.find(item=>item.label===label);

// ───────────── 冒烟里关掉按遮挡隐藏：只在 macOS 且冒烟模式下，正常使用与 Windows 都不加这个开关 ─────────────
{
  const source=fs.readFileSync(path.join(here,'main.mjs'),'utf8');
  const lines=source.split('\n').filter(line=>line.includes('disable-backgrounding-occluded-windows'));
  assert.deepEqual(lines,["if(smoke.enabled&&mac)app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');"],
    'the occlusion switch is appended once, only in macOS smoke runs');
  assert.ok(source.indexOf(lines[0])<source.indexOf('app.whenReady()'),'Chromium switches must be appended before the app is ready');
}

// ───────────── 宠物冒烟先等欢迎引导的选择存好，再藏主窗口 ─────────────
// 引导的 close 事件要等主窗口画出下一帧才派发，随后页面不经写入锁保存「已看过引导」，保存返回后才切到伙伴小屋。
// 主窗口在页面处理完这次保存的回应之前就藏起的话，macOS 上藏起的页面在机器忙时要拖几百毫秒到几秒才处理它，
// 接着的宠物指令带着旧修订号保存、被引擎按冲突拒掉（DMG 冒烟偶发的「pet sleep menu did not save」）。
// 这里用假页面按真实顺序真的走一遍 checkPetRuntime 的开头：点引导后引擎先存下，页面过一阵才切路由；主窗口藏起那一刻两件事都必须已经发生。
// 页面脚本原文交给 vm 在假 document 上执行，所以删掉等待、只在注释里留着条件，或把等待挪到藏主窗口之后，这里都会失败。
{
  // saveMs 后引擎记下「已看过引导」，再过 routeMs 页面才处理完回应、切到伙伴小屋；routeMs 为 null 表示页面一直没处理完。
  function fakePage({onboarded,guideShown=!onboarded,saveMs=20,routeMs=150}){
    const page={engineOnboarded:onboarded,guideOpen:guideShown,hash:'#home',clicks:0};
    const garden={click(){
      page.clicks++;page.guideOpen=false;
      setTimeout(()=>{page.engineOnboarded=true;if(routeMs!==null)setTimeout(()=>{page.hash='#garden/pet';},routeMs);},saveMs);
    }};
    const guide={};
    const document={querySelector:selector=>{
      if(selector==='#guide[open]')return page.guideOpen?guide:null;
      // 引导里第一个按钮就是「去认识我的伙伴」（value="garden"）。
      if(selector==='#guide[open] button'||selector==='#guide[open] button[value="garden"]')return page.guideOpen?garden:null;
      return null;
    }};
    const context=vm.createContext({document,location:{get hash(){return page.hash;}},window:{szuDesktop:{petScale:()=>1}}});
    page.run=source=>vm.runInContext(source,context);
    return page;
  }
  // 从头跑 checkPetRuntime，到它第一次藏主窗口（mainWin.close）为止：记下那一刻的页面与引擎，然后中止。
  async function stateWhenMainHides(page){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'szu-pet-smoke-'));
    const stop=Error('main window hidden');
    let atHide=null;
    const mainContents=new FakeWebContents();mainContents.executeJavaScript=async source=>page.run(source);
    const mainWin={webContents:mainContents,isDestroyed:()=>false,isVisible:()=>true,
      close(){atHide={engineOnboarded:page.engineOnboarded,hash:page.hash,guideOpen:page.guideOpen,clicks:page.clicks};throw stop;}};
    const petContents=new FakeWebContents();petContents.executeJavaScript=async()=>true;
    const petWin={webContents:petContents,isDestroyed:()=>false,isVisible:()=>true,isAlwaysOnTop:()=>true,getBounds:()=>({x:0,y:0,width:260,height:320})};
    const realFetch=globalThis.fetch;
    globalThis.fetch=async()=>({ok:true,json:async()=>({revision:1,data:{preferences:{onboarded:page.engineOnboarded}}})});
    try{
      await assert.rejects(checkPetRuntime({mainWin,petWin,tray:{isDestroyed:()=>false},getMenu:()=>({items:[]}),getPetMenu:()=>null,
        getPetMouse:()=>({}),getPetHitLog:()=>[],screen:{},initialScale:1,userData:dir,evidenceDir:dir,baseUrl:'http://127.0.0.1:9',token:'test'}),
      error=>error===stop,'the pet smoke reaches the point where it hides the main window');
    }finally{globalThis.fetch=realFetch;fs.rmSync(dir,{recursive:true,force:true});}
    return atHide;
  }
  assert.deepEqual(await stateWhenMainHides(fakePage({onboarded:false})),{engineOnboarded:true,hash:'#garden/pet',guideOpen:false,clicks:1},
    'first open: the guide choice is saved and applied by the page before the main window hides');
  assert.deepEqual(await stateWhenMainHides(fakePage({onboarded:true})),{engineOnboarded:true,hash:'#home',guideOpen:false,clicks:0},
    'already onboarded (reopen, upgrade data, Windows installer smoke): no guide, nothing clicked, same path as before');
  // 失败的两条路用短等待直接调 waitGuideSaved，报错要说清卡在哪一步。
  const quick=async(read,message)=>{for(let i=0;i<40;i++){if(await read())return;await new Promise(r=>setTimeout(r,5));}throw Error(message);};
  const guideParts=page=>({main:async source=>page.run(source),onboarded:async()=>page.engineOnboarded,until:quick});
  await assert.rejects(waitGuideSaved(guideParts(fakePage({onboarded:false,guideShown:false}))),/^Error: first-run guide did not open$/);
  const unrouted=fakePage({onboarded:false,routeMs:null});
  await assert.rejects(waitGuideSaved(guideParts(unrouted)),/^Error: first-run guide choice was not saved before hiding the main window$/,
    'the engine has the save but the page has not applied it yet: keep waiting instead of hiding the main window');
  assert.equal(unrouted.engineOnboarded,true);

  // 页面对宠物指令的回报：只收 szu:pet-result，每个窗口只挂一个监听；报错里写明回报内容和点击后多久，没有回报也要说出来。
  const contents=new FakeWebContents();
  const log=listenPetReplies(contents);
  assert.equal(listenPetReplies(contents),log);
  assert.equal(contents.listenerCount('ipc-message'),1);
  contents.emit('ipc-message',{},'szu:desktop-settings-get');
  contents.emit('ipc-message',{},'szu:pet-result',{ok:false,message:'另一个窗口有新记录，已同步。本次操作尚未保存，请再试一次。'});
  assert.equal(log.length,1);
  assert.equal(describePetReplies(log,log[0].at-4230),'页面在点击后 4.2 秒回报失败：另一个窗口有新记录，已同步。本次操作尚未保存，请再试一次。');
  assert.equal(describePetReplies([{at:1300,ok:true,message:''}],1000),'页面在点击后 0.3 秒回报成功：（无文字）');
  assert.equal(describePetReplies([],1000,25000),'点击后 24.0 秒内页面没有回报结果');

  // 宠物菜单指令依次执行：页面回报上一项之前不点下一项（否则会被「正在保存或处理上一项操作」拒掉）；
  // 点已在陪伴的伙伴不发指令，也就不等回报；一直等不到回报时，报错写明是哪一项、点击后多久。
  const replies=[],clicks=[];
  const petCommand=createPetCommands({click:id=>clicks.push(id),replies,until:quick});
  await petCommand('sleep');
  const feed=petCommand('feed');
  await new Promise(r=>setTimeout(r,30));
  assert.deepEqual(clicks,['sleep'],'the next command waits until the page has reported the previous one');
  replies.push({at:Date.now(),ok:true,message:'晚安，荔宝'});
  await feed;
  assert.deepEqual(clicks,['sleep','feed']);
  replies.push({at:Date.now(),ok:true,message:'吃饱啦，谢谢你'});
  await petCommand('switchPet:0',{expectReply:false});
  await petCommand('garden');
  assert.deepEqual(clicks,['sleep','feed','switchPet:0','garden'],'a click on the current companion sends nothing, so nothing is awaited');
  await assert.rejects(petCommand('farm'),/^Error: main window did not report the result of garden；点击后 0\.\d 秒内页面没有回报结果$/);
  assert.deepEqual(clicks,['sleep','feed','switchPet:0','garden']);
  const answered=[];
  const conflicted=createPetCommands({click:()=>answered.push({at:Date.now(),ok:false,message:'另一个窗口有新记录，已同步。本次操作尚未保存，请再试一次。'}),replies:answered,until:quick});
  const afterSleep=await conflicted('sleep');
  await assert.rejects(afterSleep(()=>false,'pet sleep menu did not save'),
    /^Error: pet sleep menu did not save；页面在点击后 0\.0 秒回报失败：另一个窗口有新记录，已同步。本次操作尚未保存，请再试一次。$/);
}

// ───────────── 应用菜单模板：安装版与开发模式只差开发者工具；「页面」没有内容时置灰 ─────────────
{
  let opened=0;
  const packaged=buildAppMenuTemplate({version:'beta0.9.4',isPackaged:true,pageMenu:null,onOpenMain:()=>{opened++;}});
  const dev=buildAppMenuTemplate({version:'beta0.9.4',isPackaged:false,pageMenu:[],onOpenMain:()=>{}});
  assert.equal(packaged[0].role,'appMenu','the first menu is the application menu');
  assert.deepEqual(packaged.slice(1).map(item=>item.label),['编辑','页面','窗口']);
  for(const role of [...EDIT_ROLES,'hide','hideOthers','unhide','quit','about','windowMenu','minimize','close','front'])assert.ok(rolesOf(packaged).includes(role),role);
  for(const item of top(packaged,'编辑').submenu.filter(entry=>entry.role))assert.match(item.label,/^[一-鿿]/,'edit items are labelled in Chinese: '+item.role);
  assert.equal(rolesOf(packaged).includes('toggleDevTools'),false,'no developer tools in the installed app');
  assert.deepEqual(rolesOf(dev).filter(role=>role==='toggleDevTools'),['toggleDevTools'],'development keeps developer tools');
  assert.deepEqual(rolesOf(dev).filter(role=>role!=='toggleDevTools'),rolesOf(packaged),'otherwise both templates carry the same roles');
  assert.ok(packaged[0].submenu.some(item=>item.label==='版本 beta0.9.4'&&item.enabled===false),'the version is shown, not clickable');
  for(const template of [packaged,dev]){
    const pages=top(template,'页面').submenu;
    assert.deepEqual(pages.map(item=>item.label),PAGE_MENU_PLACEHOLDER,'the empty page menu lists what it would do');
    assert.ok(pages.every(item=>item.enabled===false),'and every item is greyed out');
  }
  top(packaged,'窗口').submenu.find(item=>item.label==='打开主窗口').click();
  assert.equal(opened,1,'打开主窗口 reaches onOpenMain');
  const withPage=buildAppMenuTemplate({isPackaged:true,pageMenu:[{label:'刷新',click(){}}],onOpenMain(){}});
  assert.deepEqual(top(withPage,'页面').submenu.map(item=>item.label),['刷新'],'a registered window menu replaces the placeholder');
  assert.equal(withPage[0].submenu.some(item=>/^版本/.test(item.label||'')),false,'no version item without a version');
}

// ───────────── 「页面」菜单登记：窗口关掉后通知重建、取不到；已销毁窗口的残留菜单项点了也不执行、不抛错 ─────────────
{
  const {FakeWindow}=fakeWindowClass();
  let changes=0;const clicks=[];
  const registry=createPageMenuRegistry({onChange:()=>{changes++;}});
  const win=new FakeWindow({}),other=new FakeWindow({});
  const submenu=[{label:'返回',click:()=>clicks.push('back')},{type:'separator'},{label:'更多',submenu:[{label:'刷新',click:()=>clicks.push('reload')}]}];
  registry.set(win,submenu);registry.set(win,submenu);
  assert.equal(win.listenerCount('closed'),1,'closed is registered once per window');
  assert.equal(registry.current(other),null,'windows without a page menu (the main window) grey it out');
  assert.equal(registry.current(null),null,'no focused window greys it out');
  const current=registry.current(win);
  assert.deepEqual(current.map(item=>item.label??item.type),['返回','separator','更多']);
  assert.equal(submenu[0].click===current[0].click,false,'clicks are wrapped, the window menu itself is untouched');
  current[0].click();current[2].submenu[0].click();
  assert.deepEqual(clicks,['back','reload']);
  // 主窗隐藏时关掉学校窗口：没有窗口获得焦点，菜单还来不及重建，用户点了残留的菜单项。
  win.destroyed=true;
  assert.doesNotThrow(()=>{current[0].click();current[2].submenu[0].click();});
  assert.deepEqual(clicks,['back','reload'],'a destroyed window ignores its leftover menu items');
  win.destroyed=false;win.destroy();
  assert.equal(changes,1,'closing a registered window asks main to rebuild the menu');
  assert.equal(registry.current(win),null);
  other.destroy();assert.equal(changes,1,'unregistered windows do not trigger rebuilds');
}

// ───────────── 学校与飞书窗口：onWindowMenu 拿到的就是 setMenu 用的那一份；报错文案只在 darwin 上改指向「页面」菜单 ─────────────
const token='0123456789abcdef'.repeat(4);
const profile=()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){},cookies:{get:async()=>[]},clearStorageData:async()=>{},clearCache:async()=>{}});
function officialWindowClass(){
  const windows=[];let loadResult=()=>Promise.resolve();
  class OfficialWindow extends EventEmitter {
    constructor(options){
      super();this.options=options;this.url='';this.destroyed=false;windows.push(this);
      this.webContents=Object.assign(new EventEmitter(),{setWindowOpenHandler(){},getURL:()=>this.url,reload(){},navigationHistory:{canGoBack:()=>false,canGoForward:()=>false}});
    }
    setMenu(menu){this.menu=menu;}
    loadURL(url){this.url=url;return loadResult(this,url);}
    show(){}focus(){}setTitle(){}
    isDestroyed(){return this.destroyed;}
    destroy(){this.destroyed=true;this.emit('closed');}close(){this.destroy();}
  }
  return {OfficialWindow,windows,setLoad:fn=>{loadResult=fn;}};
}
const aborted=()=>Object.assign(new Error('ERR_ABORTED (-3)'),{code:'ERR_ABORTED',errno:-3});
const redirectDuringLoad=target=>(win)=>{
  const event={isMainFrame:true,preventDefault(){}};
  win.webContents.emit('will-redirect',event,target);
  win.url='';
  return Promise.reject(aborted());
};
async function schoolErrors(platform){
  const {OfficialWindow,windows,setLoad}=officialWindowClass(),dialog=fakeDialog(),menus=[];
  const options={BrowserWindow:OfficialWindow,Menu:{buildFromTemplate:value=>value},dialog,session:{fromPartition:profile},shell:{openExternal:async()=>{}},
    fetch:async()=>({ok:true,json:async()=>({})}),...(platform?{platform,onWindowMenu:(win,submenu)=>menus.push({win,submenu})}:{})};
  const school=createSchoolWindows(()=>'http://127.0.0.1:1',()=>token,options);
  setLoad(()=>Promise.reject(Object.assign(new Error('ERR_NAME_NOT_RESOLVED (-105)'),{code:'ERR_NAME_NOT_RESOLVED',errno:-105})));
  await school.open('undergrad');await settle();
  setLoad(redirectDuringLoad('http://ehall.szu.edu.cn/jwapp/'));
  await school.open('graduate');await settle();
  return {messages:dialog.errors.map(error=>error.message),windows,menus};
}
{
  const plain=await schoolErrors();
  assert.deepEqual(plain.messages,['请检查校园网或 WebVPN；也可通过学校窗口菜单在系统浏览器中打开。\n错误代码：ERR_NAME_NOT_RESOLVED',
    '页面跳转到了应用内不允许打开的地址（http://ehall.szu.edu.cn），已停止加载。请检查校园网或 WebVPN；也可通过学校窗口菜单在系统浏览器中打开。'],
    'without a platform the school window errors keep the Windows wording');
  assert.deepEqual((await schoolErrors('win32')).messages,plain.messages,'win32 is the default wording');
  const mac=await schoolErrors('darwin');
  assert.deepEqual(mac.messages,['请检查校园网或 WebVPN；也可通过菜单栏的「页面」菜单在系统浏览器中打开。\n错误代码：ERR_NAME_NOT_RESOLVED',
    '页面跳转到了应用内不允许打开的地址（http://ehall.szu.edu.cn），已停止加载。请检查校园网或 WebVPN；也可通过菜单栏的「页面」菜单在系统浏览器中打开。']);
  for(const message of mac.messages)assert.doesNotMatch(message,/学校窗口菜单/);
  assert.equal(mac.menus.length,1,'the school window hands over its menu once');
  assert.equal(mac.menus[0].win,mac.windows[0]);
  assert.equal(mac.menus[0].submenu,mac.windows[0].menu[0].submenu,'the page menu is the same array the window menu uses');
  assert.deepEqual(mac.menus[0].submenu.map(item=>item.label??item.type),['返回','前进','刷新','在系统浏览器打开','separator','清除本次学校登录','关闭学校窗口']);
}
async function feishuErrors(platform){
  const {OfficialWindow,windows,setLoad}=officialWindowClass(),dialog=fakeDialog(),menus=[];
  const feishu=createFeishuWindow({BrowserWindow:OfficialWindow,Menu:{buildFromTemplate:value=>value},dialog,session:{fromPartition:profile},
    shell:{openExternal:async()=>{throw Error('no browser');}},...(platform?{platform,onWindowMenu:(win,submenu)=>menus.push({win,submenu})}:{})});
  setLoad(redirectDuringLoad('https://sso.example.edu.cn/login'));
  await feishu.open('https://course.feishu.cn/docx/SSO1');await settle();
  setLoad(()=>Promise.resolve());
  windows[0].webContents.emit('will-navigate',{preventDefault(){}},'https://external.example/paper');await settle();
  return {messages:dialog.errors.map(error=>error.message),windows,menus};
}
{
  const plain=await feishuErrors();
  assert.deepEqual(plain.messages,['页面跳转到了飞书官方域名以外的地址（https://sso.example.edu.cn），常见于学校或企业的单点登录，应用内的飞书窗口不会打开它。请通过窗口菜单在系统浏览器打开。',
    '请检查网络，或通过窗口菜单在系统浏览器打开。'],'without a platform the Feishu window errors keep the Windows wording');
  assert.deepEqual((await feishuErrors('win32')).messages,plain.messages);
  const mac=await feishuErrors('darwin');
  assert.deepEqual(mac.messages,['页面跳转到了飞书官方域名以外的地址（https://sso.example.edu.cn），常见于学校或企业的单点登录，应用内的飞书窗口不会打开它。请通过菜单栏的「页面」菜单在系统浏览器打开。',
    '请检查网络，或通过菜单栏的「页面」菜单在系统浏览器打开。']);
  for(const message of mac.messages)assert.doesNotMatch(message,/窗口菜单/);
  assert.equal(mac.menus[0].submenu,mac.windows[0].menu[0].submenu,'the Feishu page menu is the same array the window menu uses');
  assert.deepEqual(mac.menus[0].submenu.map(item=>item.label??item.type),['返回','刷新','在系统浏览器打开','separator','关闭飞书窗口']);
}
// official-windows：学校窗口打不开时的提示，以及 onWindowMenu、platform 原样转交给两个窗口。
async function officialError(platform){
  const dialog=fakeDialog(),menus=[];
  let fail=true;
  const {OfficialWindow}=officialWindowClass();
  class MaybeFailing extends OfficialWindow {constructor(options){if(fail)throw Error('window failed');super(options);}}
  const official=createOfficialWindows({BrowserWindow:MaybeFailing,Menu:{buildFromTemplate:value=>value},dialog,session:{fromPartition:profile},shell:{openExternal:async()=>{}},
    getBaseURL:()=>'http://127.0.0.1:1',getToken:()=>token,isQuitting:()=>false,reportSchoolCleanup:()=>false,
    ...(platform?{platform,onWindowMenu:(win,submenu)=>menus.push(submenu)}:{})});
  official.openExternal('https://ehall.szu.edu.cn/new/index.html');await settle();
  fail=false;
  official.openExternal('https://ehall.szu.edu.cn/new/index.html');official.openExternal('https://course.feishu.cn/docx/ROUTE1');await settle();
  return {messages:dialog.errors.map(error=>error.message),menus};
}
{
  const plain=await officialError();
  assert.deepEqual(plain.messages,['请检查校园网或 WebVPN；可通过学校窗口菜单在系统浏览器中打开。'],'official-windows keeps the Windows wording by default');
  assert.deepEqual((await officialError('win32')).messages,plain.messages);
  const mac=await officialError('darwin');
  assert.deepEqual(mac.messages,['请检查校园网或 WebVPN；可通过菜单栏的「页面」菜单在系统浏览器中打开。']);
  assert.equal(mac.menus.length,2,'both official windows receive onWindowMenu through official-windows');
  assert.deepEqual(plain.menus,[],'without onWindowMenu nothing is registered');
}

// ───────────── 主窗口：darwin 全屏时先退出全屏再隐藏；activateApp 只在 show 前调用；缺省时与原来一致 ─────────────
{
  const make=(options={})=>{
    const {FakeWindow}=fakeWindowClass(),events=[];
    const mainWindow=createMainWindow({BrowserWindow:FakeWindow,preload:'/app/preload.cjs',openExternal(){},onWorkspaceSaved(){},onRendererGone(){},
      canHideToTray:()=>true,isQuitting:()=>false,quit:()=>events.push('quit'),onSessionEnd(){},...options});
    const win=mainWindow.create('http://127.0.0.1:1');
    const close=()=>{const event={prevented:false,preventDefault(){this.prevented=true;}};win.emit('close',event);return event.prevented;};
    return {mainWindow,win,close,events};
  };
  const mac=make({platform:'darwin'});
  const order=[];
  mac.win.setFullScreen=function(value){order.push('setFullScreen:'+value);this.fullScreen=value;if(!value)setImmediate(()=>this.emit('leave-full-screen'));};
  mac.win.hide=function(){order.push('hide');this.visible=false;};
  mac.win.show();mac.win.fullScreen=true;
  assert.equal(mac.close(),true,'closing still keeps the app running');
  assert.deepEqual(order,['setFullScreen:false'],'leave full screen first; hiding now would leave an empty full-screen space');
  await settle();
  assert.deepEqual(order,['setFullScreen:false','hide'],'hide once the full-screen animation is over');
  order.length=0;mac.win.visible=true;
  assert.equal(mac.close(),true);assert.deepEqual(order,['hide'],'a normal window hides right away');
  // 全屏动画结束前窗口已被销毁（例如紧接着退出）：不再对它调用 hide。
  mac.win.fullScreen=true;order.length=0;mac.close();mac.win.destroy();await settle();
  assert.deepEqual(order,['setFullScreen:false'],'a destroyed window is not hidden');
  for(const options of [{},{platform:'win32'}]){
    const win32=make(options);
    win32.win.show();win32.win.fullScreen=true;
    assert.equal(win32.close(),true);
    assert.equal(win32.win.visible,false,'Windows hides directly');assert.equal(win32.win.fullScreen,true,'and never touches full screen');
  }
  let activations=0;const trail=[];
  const active=make({platform:'darwin',activateApp:()=>{activations++;trail.push('activate');}});
  const realShow=active.win.show.bind(active.win);active.win.show=()=>{trail.push('show');realShow();};
  active.mainWindow.show();
  assert.deepEqual(trail,['activate','show'],'the app is activated before the window is shown');
  active.mainWindow.command('pat');assert.equal(activations,1,'background pet commands do not activate the app');
  active.mainWindow.command('study');assert.equal(activations,2,'commands that need the page bring the app forward');
  const quiet=make();quiet.win.visible=false;quiet.mainWindow.show();assert.equal(quiet.win.visible,true,'without activateApp show works as before');
}

// ───────────── 引擎失联提示：activateApp 在弹框之前 ─────────────
{
  const trail=[];
  const dialog={async showMessageBox(){trail.push('dialog');return {response:1};}};
  const monitor=createEngineMonitor({app:{relaunch(){},quit(){trail.push('quit');}},dialog,getMainWindow:()=>null,isQuitting:()=>false,activateApp:()=>trail.push('activate')});
  await monitor.failed('后台引擎意外结束，请重新打开应用');
  assert.deepEqual(trail,['activate','dialog','quit']);
  const plain=createEngineMonitor({app:{relaunch(){},quit(){}},dialog:fakeDialog([1]),getMainWindow:()=>null,isQuitting:()=>false});
  await assert.doesNotReject(plain.failed('x'),'activateApp is optional');
}

// ───────────── 启动失败文案：darwin 换成活动监视器与「应用程序」；不传 platform 时逐字是 Windows 原文 ─────────────
{
  const reasoned=Object.assign(new Error('后台引擎启动失败：本机配置目录无法写入'),{reason:'本机配置目录无法写入'});
  const later=Object.assign(new Error('后台引擎启动超时（可能有旧的 szuDesktop 后台进程正在退出）'),{retryLater:true});
  const other=new Error('sidecar 提前退出，码 2');
  assert.equal(startupErrorText(later),'后台引擎启动超时（可能有旧的 szuDesktop 后台进程正在退出）。\n\n请稍等几秒再重新打开应用；若仍失败，请在任务管理器结束残留的 szudesktop 后台进程，或重启电脑后再试。');
  assert.equal(startupErrorText(other),'sidecar 提前退出，码 2。请重新打开应用；若仍失败，请重新安装。');
  for(const error of [reasoned,later,other])assert.equal(startupErrorText(error,{platform:'win32'}),startupErrorText(error),'win32 is the default wording');
  assert.equal(startupErrorText(reasoned,{platform:'darwin'}),startupErrorText(reasoned),'a reported reason reads the same everywhere');
  const macLater=startupErrorText(later,{platform:'darwin'}),macOther=startupErrorText(other,{platform:'darwin'});
  assert.match(macLater,/^后台引擎启动超时（可能有旧的 szuDesktop 后台进程正在退出）。\n\n请稍等几秒再重新打开应用；.*「活动监视器」/);
  assert.match(macOther,/^sidecar 提前退出，码 2。请重新打开应用；.*「应用程序」/);
  for(const text of [macLater,macOther])assert.doesNotMatch(text,/任务管理器|重新安装|电脑/);
}

// ───────────── 退出轨迹：不传 trace 时与原来一样；传入时按顺序记下每一步，trace 出错也不影响退出 ─────────────
{
  const flow=({trace,reply=true,responses=[]}={})=>{
    const events=[],dialog=fakeDialog(responses);
    const coordinator=createQuitCoordinator({app:{quit:()=>events.push('app.quit')},dialog,getMainWindow:()=>win,showMainWindow:()=>events.push('show'),
      closeWindows:async()=>events.push('close'),stopEngine:async()=>events.push('engine'),...(trace?{trace}:{})});
    const win={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,isCrashed:()=>false,
      send:(_channel,id)=>setImmediate(()=>coordinator.prepared({id,ok:reply,message:'磁盘已满'}))}};
    return {coordinator,events,dialog};
  };
  const plain=flow();
  plain.coordinator.beforeQuit({preventDefault(){}});await settle(10);
  assert.deepEqual(plain.events,['close','engine','app.quit'],'without trace the quit flow is unchanged');
  const trace=[];
  const traced=flow({trace:(event,detail)=>trace.push(detail?{event,...detail}:{event})});
  traced.coordinator.beforeQuit({preventDefault(){}});await settle(10);
  assert.deepEqual(traced.events,['close','engine','app.quit']);
  assert.deepEqual(trace,[{event:'before-quit'},{event:'prepare-sent',id:1},{event:'prepared',id:1,ok:true},{event:'confirmed',saved:true},
    {event:'windows-closed'},{event:'engine-stopped'}]);
  // 保存不住：先选「返回处理」（记下取消），再退出时选放弃修改。
  trace.length=0;
  const unsaved=flow({trace:(event,detail)=>trace.push(event+(detail&&'ok' in detail?':'+detail.ok:'')),reply:false,responses:[0,1]});
  unsaved.coordinator.beforeQuit({preventDefault(){}});await settle(10);
  unsaved.coordinator.beforeQuit({preventDefault(){}});await settle(10);
  assert.deepEqual(trace,['before-quit','prepare-sent','prepared:false','cancelled','before-quit','prepare-sent','prepared:false','confirmed','windows-closed','engine-stopped']);
  assert.deepEqual(unsaved.events,['show','show','close','engine','app.quit']);
  // 注销（Windows 的 session-end）也记一笔；trace 抛错不改变任何结果。
  const noisy=flow({trace:()=>{throw Error('disk full');}});
  noisy.coordinator.sessionEnd();noisy.coordinator.beforeQuit({preventDefault(){}});await settle(10);
  assert.deepEqual(noisy.events,['app.quit','close','engine','app.quit'],'a failing trace never blocks the quit');
  const ended=[];flow({trace:event=>ended.push(event)}).coordinator.sessionEnd();
  assert.deepEqual(ended,['session-end']);
}

// ───────────── createQuitTrace：只有冒烟模式加绝对路径才写 JSONL，其余情况是空操作 ─────────────
{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'szu-quit-trace-'));
  try{
    const file=path.join(dir,'trace','quit.jsonl'),report=path.join(dir,'report.json');
    const smoke={SZU_SMOKE_REPORT:report,SZUNET_CONFIG_DIR:dir};
    for(const env of [{},{SZU_SMOKE_QUIT_TRACE:file},{...smoke},{...smoke,SZU_SMOKE_QUIT_TRACE:'relative.jsonl'},{SZU_SMOKE_REPORT:'report.json',SZUNET_CONFIG_DIR:dir,SZU_SMOKE_QUIT_TRACE:file}]){
      createQuitTrace(env)('before-quit');
      assert.equal(fs.existsSync(file)||fs.existsSync(path.join(process.cwd(),'relative.jsonl')),false,JSON.stringify(Object.keys(env)));
    }
    const write=createQuitTrace({...smoke,SZU_SMOKE_QUIT_TRACE:file});
    write('before-quit');write('prepared',{id:1,ok:true});
    const lines=fs.readFileSync(file,'utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(lines.map(({at,...line})=>line),[{event:'before-quit'},{event:'prepared',id:1,ok:true}]);
    assert.ok(lines.every(line=>Number.isFinite(line.at)));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

// ───────────── 冒烟里的 macOS 核对：假对象分别走全部通过与全部不通过 ─────────────
// 真实 Menu 的 submenu 是带 items 的 Menu 对象，MenuItem.enabled 缺省为 true；这里按同样的形状包一层。
const asMenu=template=>({items:template.map(item=>({enabled:true,...item,...(Array.isArray(item.submenu)?{submenu:asMenu(item.submenu)}:{})}))});
function pageWindow(FakeWindow,{platform='darwin',text,url='http://127.0.0.1:5/'}){
  const win=new FakeWindow({show:true});
  const location={hash:'#home'};
  const context=vm.createContext({location,window:{szuDesktop:{platform}},
    document:{querySelector:selector=>selector==='#desktop-options'&&location.hash==='#settings/desktop'?{innerText:text}:null}});
  win.webContents.executeJavaScript=async source=>vm.runInContext(source,context);
  win.webContents.getURL=()=>url;
  return {win,location};
}
{
  const {FakeWindow}=fakeWindowClass(),{nativeImage}=fakeNativeImage();
  const app=Object.assign(new EventEmitter(),{isPackaged:true,dock:{getMenu:()=>({items:[{label:'隐藏宠物'},{label:'打开主窗口'}]}),isVisible:()=>true}});
  const {win:mainWin,location}=pageWindow(FakeWindow,{text:'登录 Mac 时启动\n请先把 szuDesktop 拖到「应用程序」文件夹，再从那里打开后开启。'});
  app.on('activate',()=>mainWin.show());
  const petWin=new FakeWindow({});petWin.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
  const menu=asMenu(buildAppMenuTemplate({version:'beta0.9.4',isPackaged:true,pageMenu:null,onOpenMain(){}}));
  assert.ok(menuRoles(menu).has('hideothers'),'roles are compared in lower case');
  const {checks,failures}=await checkMacRuntime({app,Menu:{getApplicationMenu:()=>menu},nativeImage,mainWin,showMain:()=>mainWin.show(),petWin,
    trayIcon:'/app/Contents/Resources/szudesktop-trayTemplate.png',loginItems:{supported:false},baseUrl:'http://127.0.0.1:5',wait:{activate:200,page:200}});
  assert.deepEqual(failures,{},'every check passes on a correctly wired app');
  assert.deepEqual(Object.keys(checks).sort(),['activateShowsMain','appMenuRoles','devToolsHidden','dockIconVisible','dockMenuWithoutQuit','loginItemsUnsupported',
    'pageMenuDisabled','petAllWorkspaces','rendererPlatform','settingsCopy','trayTemplate']);
  assert.ok(Object.values(checks).every(value=>value===true));
  assert.equal(mainWin.visible,true,'the main window is visible again afterwards');
  assert.equal(location.hash,'#home','the settings check returns to the home page');
}
{
  const {FakeWindow}=fakeWindowClass(),{nativeImage}=fakeNativeImage();
  // 什么都没接对：开发模板带开发者工具却号称已打包、缺了 hideOthers、「页面」可点、程序坞图标没了且菜单里有「退出」、
  // 没有 activate 监听、托盘还是 .ico、宠物不跨桌面、页面拿到 win32、设置页是 Windows 文案、登录项可用。
  const app=Object.assign(new EventEmitter(),{isPackaged:true,dock:{getMenu:()=>({items:[{label:'打开主窗口'},{label:'退出'}]}),isVisible:()=>false}});
  const template=buildAppMenuTemplate({isPackaged:false,pageMenu:[{label:'刷新',click(){}}],onOpenMain(){}});
  template[0].submenu=template[0].submenu.filter(item=>item.role!=='hideOthers');
  const shown=[];
  const {win:mainWin,location}=pageWindow(FakeWindow,{platform:'win32',text:'登录 Windows 时启动\n仅支持已安装的 Windows 版本。'});
  const petWin=new FakeWindow({});
  const {checks,failures}=await checkMacRuntime({app,Menu:{getApplicationMenu:()=>asMenu(template)},nativeImage,mainWin,showMain:()=>{shown.push('show');mainWin.show();},petWin,
    trayIcon:'/app/Contents/Resources/szudesktop.ico',loginItems:{supported:true},baseUrl:'http://127.0.0.1:5',wait:{activate:100,page:100}});
  assert.ok(Object.values(checks).every(value=>value===false),'every check reports its failure: '+JSON.stringify(checks));
  assert.deepEqual(Object.keys(failures).sort(),Object.keys(checks).sort(),'each failure carries a reason');
  assert.match(failures.appMenuRoles,/hideothers/);assert.match(failures.devToolsHidden,/安装版/);assert.match(failures.pageMenuDisabled,/刷新/);
  assert.match(failures.activateShowsMain,/activate/);assert.deepEqual(shown,['show'],'the main window is restored even when activate fails');
  assert.match(failures.trayTemplate,/模板图/);assert.match(failures.dockMenuWithoutQuit,/退出/);assert.match(failures.rendererPlatform,/win32/);
  assert.match(failures.settingsCopy,/登录 Mac 时启动/);assert.equal(location.hash,'#home');
  // 页面不在本机地址、图片读不出、宠物窗不在、开发模式的开发者工具：各给出自己的原因；抛错的核对也只记为不通过。
  const {win:away}=pageWindow(FakeWindow,{url:'https://example.com/',text:''});
  const odd=await checkMacRuntime({app:Object.assign(new EventEmitter(),{isPackaged:false,dock:{getMenu:()=>null,isVisible:()=>true}}),
    Menu:{getApplicationMenu:()=>asMenu(buildAppMenuTemplate({isPackaged:false,pageMenu:null,onOpenMain(){}}))},
    nativeImage:{createFromPath:file=>{if(!file)throw Error('boom');return {isEmpty:()=>true,isTemplateImage:()=>true};}},mainWin:away,showMain(){},petWin:null,
    trayIcon:'',loginItems:undefined,baseUrl:'http://127.0.0.1:5',wait:{activate:100,page:100}});
  assert.equal(odd.checks.appMenuRoles,true);
  assert.match(odd.failures.devToolsHidden,/开发模式/,'development keeps developer tools and says so');
  assert.equal(odd.failures.trayTemplate,'boom');assert.match(odd.failures.petAllWorkspaces,/宠物窗不在/);
  assert.match(odd.failures.dockMenuWithoutQuit,/为空/);assert.match(odd.failures.settingsCopy,/不在本机页面/);assert.equal(odd.checks.loginItemsUnsupported,false);
  // 登录项一行换了，但同一分区里还漏着 Windows 文案（「托盘」）：设置页核对仍不通过。
  const {win:mixed}=pageWindow(FakeWindow,{text:'登录 Mac 时启动\n关闭后可从托盘恢复，重启保留选择。\n请先把 szuDesktop 拖到「应用程序」文件夹，再从那里打开后开启。'});
  const leftover=await checkMacRuntime({app:Object.assign(new EventEmitter(),{isPackaged:true,dock:{getMenu:()=>null,isVisible:()=>true}}),
    Menu:{getApplicationMenu:()=>null},nativeImage,mainWin:mixed,showMain(){},petWin:null,trayIcon:'',loginItems:{supported:false},baseUrl:'http://127.0.0.1:5',wait:{activate:100,page:100}});
  assert.match(leftover.failures.settingsCopy,/Windows 文案/);
}

// ───────────── 仅 POSIX：引擎自成进程组，强制清理时它拉起的子进程一起结束 ─────────────
if(process.platform!=='win32'){
  const fixture=path.join(here,'testdata','fake-lifecycle.mjs');
  const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
  // 已被杀死、只是还没被回收的僵尸进程也算结束（CI 上孤儿进程的回收时机不由我们决定）。
  const gone=pid=>{if(!alive(pid))return true;try{return /^Z/.test(execFileSync('ps',['-o','stat=','-p',String(pid)],{encoding:'utf8'}).trim());}catch{return true;}};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'szu-sidecar-group-'));
  let handle;
  try{
    handle=await startSidecar({command:process.execPath,args:[fixture,'tree',dir]});
    const descendant=Number(fs.readFileSync(path.join(dir,'descendant.pid'),'utf8'));
    assert.equal(alive(descendant),true);
    assert.doesNotThrow(()=>process.kill(-handle.child.pid,0),'the engine leads its own process group');
    await stopSidecar(handle.child);
    assert.equal(alive(handle.child.pid),false);
    // 孙进程被 SIGKILL 后还要等系统回收（父进程已不在，由 launchd/init 收尸），最多等 3 秒。
    for(let i=0;i<60&&!gone(descendant);i++)await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(gone(descendant),true,'stopSidecar also ends the processes the engine started');
    // 进程组已经不在时退回只结束引擎本身，不抛错。
    await assert.doesNotReject(stopSidecar(handle.child));
  }finally{
    await handle?.stop().catch(()=>{});
    for(const name of ['parent.pid','descendant.pid']){
      const file=path.join(dir,name);
      if(fs.existsSync(file)){const pid=Number(fs.readFileSync(file,'utf8'));if(alive(pid))try{process.kill(pid,'SIGKILL');}catch{}}
    }
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

console.log('macOS shell: app menu and page-menu registry, window menus handed to the app menu, platform error wording (Windows unchanged), full-screen close, app activation, startup error text, quit trace, mac smoke checks'+(process.platform==='win32'?'':' and process-group cleanup')+' passed');
