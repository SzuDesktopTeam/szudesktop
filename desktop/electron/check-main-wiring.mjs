// main.mjs 的装配：把 electron 和 sidecar.mjs 换成假对象后真正导入 main.mjs，跑一遍启动、IPC 来源校验、
// 引擎失联提示和退出流程。各模块自己的行为在其它 check-*.mjs 里测；这里只看 main.mjs 有没有把它们接对。
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {FakeIpcMain, FakeSession, FakeTray, fakeDialog, fakeMenu, fakeNativeImage, fakeScreen, fakeWindowClass, settle} from './testdata/fake-electron.mjs';
import {TRUSTED_INVOKE_CHANNELS} from './ipc-routes.mjs';

assert.equal(typeof module.registerHooks,'function','check-main-wiring needs Node 22.15+ (module.registerHooks)');
const mainURL=new URL('./main.mjs',import.meta.url).href;
const sidecarURL=new URL('./sidecar.mjs',import.meta.url).href;
const FAKE_ELECTRON='szu-fake:electron',FAKE_SIDECAR='szu-fake:sidecar';
const ELECTRON_EXPORTS=['app','BrowserWindow','dialog','ipcMain','Menu','Notification','screen','session','shell','Tray','nativeImage'];
module.registerHooks({
  resolve(specifier,context,next){
    if(specifier==='electron')return {url:FAKE_ELECTRON,shortCircuit:true};
    if(specifier==='./sidecar.mjs'&&context.parentURL===mainURL)return {url:FAKE_SIDECAR,shortCircuit:true};
    return next(specifier,context);
  },
  load(url,context,next){
    if(url===FAKE_ELECTRON)return {format:'module',shortCircuit:true,
      source:ELECTRON_EXPORTS.map(name=>`export const ${name}=globalThis.__szuFakeElectron.${name};`).join('\n')};
    // 只替换 startSidecar，启动失败文案仍用真实实现。
    if(url===FAKE_SIDECAR)return {format:'module',shortCircuit:true,
      source:`export {startupErrorText} from ${JSON.stringify(sidecarURL)};export const startSidecar=(...args)=>globalThis.__szuFakeElectron.startSidecar(...args);`};
    return next(url,context);
  },
});

const userData=mkdtempSync(path.join(os.tmpdir(),'szu-main-wiring-'));
for(const name of ['SZU_SMOKE_REPORT','SZU_PET_SHOT'])delete process.env[name];
// 本文件末尾会在子进程里按 darwin、win32 各跑一遍（SZU_WIRING_CHILD=1，process.platform 由 testdata/force-platform.mjs 改写）；
// SZU_WIRING_OPENED_AT_LOGIN=1 时假装本次是登录项拉起的。
const childRun=process.env.SZU_WIRING_CHILD==='1',openedAtLoginRun=process.env.SZU_WIRING_OPENED_AT_LOGIN==='1';
const log=[];
let ready;
const app=Object.assign(new EventEmitter(),{
  isPackaged:false,quits:0,relaunches:0,focuses:0,
  requestSingleInstanceLock:()=>true,
  whenReady:()=>new Promise(resolve=>{ready=resolve;}),
  setPath(){},getPath:()=>userData,
  setAppUserModelId(id){this.appUserModelId=id;},
  getLoginItemSettings:()=>({openAtLogin:false,executableWillLaunchAtLogin:false,status:'not-registered',wasOpenedAtLogin:openedAtLoginRun}),
  setLoginItemSettings(){},
  quit(){this.quits++;log.push('app.quit');},
  relaunch(){this.relaunches++;},
  // 以下只有 macOS 的装配会用到：激活应用、是否在「应用程序」里、关于面板、程序坞菜单与弹跳。
  focus(){this.focuses++;},
  isInApplicationsFolder:()=>false,
  setAboutPanelOptions(options){this.aboutPanel=options;},
  dock:{menus:[],bounces:[],setMenu(menu){this.menus.push(menu);},getMenu(){return this.menus.at(-1)??null;},bounce(type){this.bounces.push(type);return 1;},isVisible:()=>true},
});
const {FakeWindow,windows}=fakeWindowClass();
const {Menu,built:builtMenus,applied:appliedMenus}=fakeMenu();
const {nativeImage}=fakeNativeImage();
const screen=fakeScreen(),ipcMain=new FakeIpcMain(),dialog=fakeDialog([1]);
const trays=[];
class Tray extends FakeTray {constructor(icon){super(icon);trays.push(this);}}
// 子进程模拟里系统支持通知，用来核对各平台给专注通知接的 failed 处理；宿主上的这一遍与原来一样不支持。
const notifications=[];
class Notification extends EventEmitter {static isSupported(){return childRun;}constructor(options){super();this.options=options;notifications.push(this);}show(){}close(){}}
const child=new EventEmitter();
const handle={baseUrl:'http://127.0.0.1:5',token:'0123456789abcdef'.repeat(4),owned:true,child,
  stop:async()=>{log.push('engine.stop:'+windows.map(win=>win.isDestroyed()).join(','));}};
const sidecarCalls=[];
globalThis.__szuFakeElectron={app,BrowserWindow:FakeWindow,dialog,ipcMain,Menu,Notification,screen,Tray,nativeImage,
  session:{fromPartition:()=>new FakeSession()},shell:{openExternal:async()=>{}},
  startSidecar:async command=>{sidecarCalls.push(command);return handle;}};
// 引擎与存档读取都不走网络：庭院存档暂时不可读，宠物和专注提醒按失败处理。
globalThis.fetch=async()=>({ok:false,json:async()=>({})});
// 子进程模拟里存档读得到，且有一段早已结束、还没提醒过的专注：启动后专注提醒会真的发出一条通知。
if(childRun)globalThis.fetch=async url=>String(url).endsWith('/api/workspace')?{ok:true,json:async()=>({data:{game:{focus:{end:1,duration:1}}}})}:{ok:false,json:async()=>({})};

await import(mainURL);
// 单实例锁拿到后就登记全部 IPC 入口和应用事件，早于 whenReady。
for(const channel of TRUSTED_INVOKE_CHANNELS)assert.ok(ipcMain.handlers.has(channel),channel+' is registered');
for(const channel of ['szu:quit-prepared','szu:pet-result','pet:menu','pet:scale-step','pet:hit','pet:drag'])assert.ok(ipcMain.listeners.has(channel),channel+' is registered');
for(const name of ['second-instance','window-all-closed','before-quit'])assert.equal(app.listenerCount(name),1,name+' is wired');
assert.equal(screen.listenerCount('display-metrics-changed'),0,'displays are watched only once the app is ready');

// 登录项拉起（macOS 的 wasOpenedAtLogin）：启动时不弹主窗；注销时勾了「重新打开窗口」，登录后系统恢复又启动一次，
// 这紧跟着的第一次 second-instance 不弹主窗，之后的照常弹出。这一遍到此为止，不再跑下面按普通启动写的断言。
if(openedAtLoginRun){
  assert.equal(process.platform,'darwin','only macOS reads wasOpenedAtLogin');
  ready();
  await settle(20);
  const [loginMain]=windows;
  assert.ok(loginMain&&!loginMain.destroyed,'boot still creates the main window');
  assert.equal(loginMain.visible,false,'opened at login: the main window stays hidden');
  assert.equal(trays.length,1,'the menu bar icon is the way back');
  app.emit('second-instance',{},['szuDesktop']);
  assert.equal(loginMain.visible,false,'the session-restore relaunch right after login does not pop the window');
  app.emit('second-instance',{},['szuDesktop']);
  assert.equal(loginMain.visible,true,'a later launch shows the window');
  rmSync(userData,{recursive:true,force:true});
  console.log('Main wiring (simulated darwin, opened at login): quiet start and the one-time reopen guard are wired through main.mjs');
  process.exit(0);
}

ready();
await settle(20);
assert.equal(screen.listenerCount('display-metrics-changed'),1,'whenReady wires pet.watchDisplays');
assert.deepEqual(dialog.errors,[],'boot finishes without a startup error');
assert.equal(sidecarCalls.length,1,'boot starts the sidecar once');
assert.equal(app.appUserModelId===undefined,process.platform!=='win32');
const [mainWin,petWin]=windows;
assert.ok(mainWin&&petWin,'boot opens the main window and the pet window');
assert.match(mainWin.loaded[0],/^http:\/\/127\.0\.0\.1:5\/\?launch=/,'the main window loads the one-time launch address');
assert.equal(mainWin.visible,true);
assert.equal(trays.length,1,'the tray is created after the pet');
assert.equal(child.listenerCount('exit'),1,'boot wires engine.watch(handle)');

// szu:* 只认主窗口里本机页面的主 frame：isTrusted 必须接到 isTrustedSender(主窗口, handle.baseUrl)。
const wc=mainWin.webContents;
wc.mainFrame.url=handle.baseUrl+'/';
const trusted={sender:wc,senderFrame:wc.mainFrame};
petWin.webContents.mainFrame.url=handle.baseUrl+'/';
// 别的窗口、主窗口里的子 frame、主 frame 已离开本机页面：三种来源都要拒绝。
const forged=[
  ()=>({sender:petWin.webContents,senderFrame:petWin.webContents.mainFrame}),
  ()=>({sender:wc,senderFrame:{url:handle.baseUrl+'/'}}),
  ()=>{wc.mainFrame.url='https://example.com/';return trusted;},
];
for(const make of forged)for(const channel of ['szu:desktop-settings-get','szu:pet-scale-get','szu:feishu-open']){
  await assert.rejects(ipcMain.invoke(channel,make(),'https://example.com/'),/请求来源不匹配/,channel+' rejects a forged sender');
  wc.mainFrame.url=handle.baseUrl+'/';
}
assert.equal(typeof (await ipcMain.invoke('szu:desktop-settings-get',trusted)),'object','the main page reads desktop settings');
assert.equal(typeof (await ipcMain.invoke('szu:pet-scale-get',trusted)),'number');

// 自己启动的引擎退出：只提示一次；选“退出”不重开。
child.emit('exit',1);
await settle();
assert.equal(dialog.boxes.length,1);
assert.match(dialog.boxes[0].options.title,/引擎已停止/);
assert.equal(dialog.boxes[0].parent,mainWin,'the engine dialog is attached to the main window');
assert.equal(app.relaunches,0);

// 平台分支的接线：宿主是 macOS 或 Windows 时按真实平台跑，其余平台由末尾的子进程模拟覆盖。
const mainSource=readFileSync(new URL('./main.mjs',import.meta.url),'utf8');
const countSays=()=>petWin.webContents.sent.filter(([channel])=>channel==='pet:say').length;
const firstNotification=async()=>{for(let i=0;i<50&&!notifications.length;i++)await settle();return notifications[0];};
if(process.platform==='darwin'){
  // 应用菜单：编辑菜单各角色让 ⌘C/⌘V 可用，隐藏与退出按 macOS 惯例放在应用名菜单里。
  const appMenu=appliedMenus.at(-1),roles=new Set();
  const walk=items=>{for(const item of items||[]){if(item.role)roles.add(item.role);walk(item.submenu);}};
  assert.ok(appMenu,'macOS sets an application menu');walk(appMenu.items);
  for(const role of ['undo','redo','cut','copy','paste','pasteAndMatchStyle','delete','selectAll','hide','hideOthers','unhide','quit'])assert.ok(roles.has(role),'application menu has '+role);
  assert.equal(app.aboutPanel?.applicationName,'szuDesktop');
  // 程序坞：点图标（activate）把藏起来的主窗口找回来；引擎报错前已把应用带到前台。
  assert.ok(app.focuses>=1,'the engine failure dialog activates the app first');
  assert.equal(app.listenerCount('activate'),1,'activate is wired once');
  mainWin.hide();app.emit('activate',{},false);
  assert.equal(mainWin.visible,true,'activate shows the hidden main window');
  mainWin.hide();app.emit('second-instance',{},['szuDesktop']);
  assert.equal(mainWin.visible,true,'a normal second launch still shows the main window');
  // 菜单栏模板图、宠物的层级与跨桌面显示、去掉「退出」的程序坞菜单。
  assert.match(trays[0].icon,/szudesktop-trayTemplate\.png$/);
  assert.equal(petWin.level,'floating','the pet stays below menus on macOS');
  assert.equal(petWin.isVisibleOnAllWorkspaces(),true);
  assert.ok(app.dock.getMenu()?.items.length,'the Dock menu reuses the tray items');
  assert.equal(app.dock.getMenu().items.some(item=>item.label==='退出'),false,'macOS adds its own Quit to the Dock menu');
  // 注销和 ⌘Q 都走 before-quit 的保存握手（下面的退出流程在 darwin 上同样核对 szu:prepare-quit），不监听 powerMonitor。
  assert.doesNotMatch(mainSource,/powerMonitor/,'main.mjs must not listen to powerMonitor on any platform');
  // 点宠物弹菜单不激活应用：前台的浏览器等应用不该因此丢失焦点。
  const focusesBefore=app.focuses,popupsBefore=builtMenus.reduce((sum,menu)=>sum+menu.popups.length,0);
  const petFrame=petWin.webContents.mainFrame,petFrameUrl=petFrame.url;
  petFrame.url=pathToFileURL(path.join(path.dirname(fileURLToPath(mainURL)),'pet.html')).href;
  ipcMain.emit('pet:menu',{sender:petWin.webContents,senderFrame:petFrame});
  await settle(20);
  petFrame.url=petFrameUrl;
  assert.equal(builtMenus.reduce((sum,menu)=>sum+menu.popups.length,0),popupsBefore+1,'the pet menu pops up');
  assert.equal(app.focuses,focusesBefore,'the pet menu does not call app.focus');
  // 专注通知：不带 icon（用 .app 的图标）；发不出去时换成宠物气泡和程序坞弹跳。
  if(childRun){
    const notification=await firstNotification();
    assert.ok(notification,'the finished focus sends a reminder');
    assert.equal(Object.hasOwn(notification.options,'icon'),false,'macOS notifications use the app icon');
    assert.equal(notification.listenerCount('failed'),2,'macOS adds onFailed after the original failed handler');
    const says=countSays();
    notification.emit('failed',{},'Notification permission denied');
    assert.equal(countSays(),says+1,'a failed reminder becomes a pet bubble');
    assert.deepEqual(app.dock.bounces,['informational']);
  }
}
if(process.platform==='win32'){
  // Windows 不建应用菜单、不注册 activate、从不激活应用，托盘仍用 .ico，宠物仍在 screen-saver 层。
  assert.equal(appliedMenus.length,0,'Windows never calls Menu.setApplicationMenu');
  assert.equal(app.listenerCount('activate'),0,'Windows has no activate listener');
  assert.equal(app.appUserModelId,'com.szudesktop.app');
  assert.match(trays[0].icon,/szudesktop\.ico$/);
  assert.equal(petWin.level,'screen-saver');
  mainWin.hide();app.emit('second-instance',{},['szuDesktop.exe']);
  assert.equal(mainWin.visible,true,'a second launch shows the main window right away');
  assert.equal(app.focuses,0,'Windows never calls app.focus');
  assert.deepEqual([app.dock.menus.length,app.dock.bounces.length],[0,0],'Windows never touches the Dock');
  // 专注通知：仍带 .ico；failed 只有原来那一个处理，toast 失败后没有任何别的动作。
  if(childRun){
    const notification=await firstNotification();
    assert.ok(notification,'the finished focus sends a reminder');
    assert.match(notification.options.icon,/szudesktop\.ico$/);
    assert.equal(notification.listenerCount('failed'),1,'Windows keeps the single original failed handler');
    const says=countSays();
    notification.emit('failed',{},'toast failed');
    await settle();
    assert.equal(countSays(),says,'a failed Windows toast does not make the pet speak');
    assert.deepEqual(app.dock.bounces,[]);
  }
}

// before-quit 必须交给退出协调：先请主窗保存，伪造来源的回执不算数；确认后先关全部窗口和托盘，再停引擎，最后放行。
log.length=0;
let prevented=0;
app.emit('before-quit',{preventDefault:()=>prevented++});
await settle();
assert.equal(prevented,1,'the first quit waits for the renderer');
const request=wc.last('szu:prepare-quit');
assert.equal(typeof request,'number','before-quit asks the main page to save notes and 2048');
ipcMain.emit('szu:quit-prepared',forged[0](),{id:request,ok:true});
await settle();
assert.equal(log.length,0,'a forged save receipt does not release the quit');
ipcMain.emit('szu:quit-prepared',trusted,{id:request,ok:true});
await settle(20);
assert.deepEqual(log,['engine.stop:true,true','app.quit'],'windows close before the engine stops, then the quit proceeds');
assert.equal(trays[0].destroyed,true,'the tray is removed on quit');
app.emit('before-quit',{preventDefault:()=>prevented++});
assert.equal(prevented,1,'the released quit is not intercepted again');

rmSync(userData,{recursive:true,force:true});
console.log('Main wiring: IPC sender checks, display watch, engine watch and coordinated quit are wired through main.mjs');

// 在子进程里把 main.mjs 按 darwin（普通启动、登录项拉起）和 win32 各装配一遍。--import 用由 import.meta.url 推出的 file URL：
// run-checks 以仓库根为工作目录时也能找到，Windows 的盘符路径也不会被当成 URL 协议。模拟只证明接线，平台行为本身看各平台 CI 的实跑与冒烟。
if(!childRun){
  const forcePlatform=new URL('./testdata/force-platform.mjs',import.meta.url).href;
  for(const [platform,extra,label] of [['darwin',{},'darwin'],['darwin',{SZU_WIRING_OPENED_AT_LOGIN:'1'},'darwin opened at login'],['win32',{},'win32']]){
    const result=spawnSync(process.execPath,['--import',forcePlatform,fileURLToPath(import.meta.url)],
      // 模拟 win32 时 os.tmpdir() 改读 TEMP/TMP：把宿主的临时目录交过去，别落到不存在的 %SystemRoot%\temp。
      {env:{...process.env,TEMP:os.tmpdir(),TMP:os.tmpdir(),SZU_WIRING_CHILD:'1',SZU_FORCE_PLATFORM:platform,...extra},stdio:'inherit',timeout:120000,windowsHide:true});
    assert.equal(result.status,0,`simulated ${label} wiring failed`+(result.error?`: ${result.error.message}`:''));
  }
  console.log('Main wiring: simulated darwin (normal and opened at login) and win32 runs passed');
}
