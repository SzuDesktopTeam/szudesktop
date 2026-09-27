// main.mjs 的装配：把 electron 和 sidecar.mjs 换成假对象后真正导入 main.mjs，跑一遍启动、IPC 来源校验、
// 引擎失联提示和退出流程。各模块自己的行为在其它 check-*.mjs 里测；这里只看 main.mjs 有没有把它们接对。
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync, rmSync} from 'node:fs';
import module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {FakeIpcMain, FakeSession, FakeTray, fakeDialog, fakeMenu, fakeScreen, fakeWindowClass, settle} from './testdata/fake-electron.mjs';
import {TRUSTED_INVOKE_CHANNELS} from './ipc-routes.mjs';

assert.equal(typeof module.registerHooks,'function','check-main-wiring needs Node 22.15+ (module.registerHooks)');
const mainURL=new URL('./main.mjs',import.meta.url).href;
const sidecarURL=new URL('./sidecar.mjs',import.meta.url).href;
const FAKE_ELECTRON='szu-fake:electron',FAKE_SIDECAR='szu-fake:sidecar';
const ELECTRON_EXPORTS=['app','BrowserWindow','dialog','ipcMain','Menu','Notification','screen','session','shell','Tray'];
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
const log=[];
let ready;
const app=Object.assign(new EventEmitter(),{
  isPackaged:false,quits:0,relaunches:0,
  requestSingleInstanceLock:()=>true,
  whenReady:()=>new Promise(resolve=>{ready=resolve;}),
  setPath(){},getPath:()=>userData,
  setAppUserModelId(id){this.appUserModelId=id;},
  getLoginItemSettings:()=>({openAtLogin:false,executableWillLaunchAtLogin:false}),
  setLoginItemSettings(){},
  quit(){this.quits++;log.push('app.quit');},
  relaunch(){this.relaunches++;},
});
const {FakeWindow,windows}=fakeWindowClass();
const {Menu}=fakeMenu();
const screen=fakeScreen(),ipcMain=new FakeIpcMain(),dialog=fakeDialog([1]);
const trays=[];
class Tray extends FakeTray {constructor(icon){super(icon);trays.push(this);}}
class Notification extends EventEmitter {static isSupported(){return false;}show(){}close(){}}
const child=new EventEmitter();
const handle={baseUrl:'http://127.0.0.1:5',token:'0123456789abcdef'.repeat(4),owned:true,child,
  stop:async()=>{log.push('engine.stop:'+windows.map(win=>win.isDestroyed()).join(','));}};
const sidecarCalls=[];
globalThis.__szuFakeElectron={app,BrowserWindow:FakeWindow,dialog,ipcMain,Menu,Notification,screen,Tray,
  session:{fromPartition:()=>new FakeSession()},shell:{openExternal:async()=>{}},
  startSidecar:async command=>{sidecarCalls.push(command);return handle;}};
// 引擎与存档读取都不走网络：庭院存档暂时不可读，宠物和专注提醒按失败处理。
globalThis.fetch=async()=>({ok:false,json:async()=>({})});

await import(mainURL);
// 单实例锁拿到后就登记全部 IPC 入口和应用事件，早于 whenReady。
for(const channel of TRUSTED_INVOKE_CHANNELS)assert.ok(ipcMain.handlers.has(channel),channel+' is registered');
for(const channel of ['szu:quit-prepared','szu:pet-result','pet:menu','pet:scale-step','pet:hit','pet:drag'])assert.ok(ipcMain.listeners.has(channel),channel+' is registered');
for(const name of ['second-instance','window-all-closed','before-quit'])assert.equal(app.listenerCount(name),1,name+' is wired');
assert.equal(screen.listenerCount('display-metrics-changed'),0,'displays are watched only once the app is ready');

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
