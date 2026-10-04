// macOS 集成模块的纯逻辑检查：路径、菜单栏图标与程序坞菜单、宠物窗（层级、跨桌面、Control 点按保护）、登录项与登录恢复保护、
// 设置快照的提示、专注通知。只用 Node 内置模块和 testdata/fake-electron.mjs 的假对象，三个平台的 CI 都能跑；
// 同时核对 win32（以及不传 platform 的默认值）与今天的行为一致。真实 Electron 上的表现由 smoke-macos.mjs 和人工验收负责。
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {appPaths,MAC_TRAY_ICON_FILE} from './app-paths.mjs';
import {createTrayMenu} from './tray-menu.mjs';
import {petWindowOptions,petPlatformOptions,petTopLevel,PET_SAY_MAX} from './pet-policy.mjs';
import {createPetController,PET_MENU_REPEAT_MS} from './pet-controller.mjs';
import {DESKTOP_DEFAULTS,loginItemSupported,createLoginItemControl,openedAtLogin,createLoginReopenGuard} from './desktop-settings.mjs';
import {createDesktopPreferences} from './desktop-preferences.mjs';
import {createFocusReminders} from './focus-reminders.mjs';
import {FakeTray,fakeDialog,fakeMenu,fakeScreen,fakeWindowClass,settle} from './testdata/fake-electron.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));

// 共用假对象缺的 macOS 方法在这里补：跨桌面显示、忽略双击。
function macWindowClass(){
  const {FakeWindow,windows}=fakeWindowClass();
  class MacWindow extends FakeWindow {
    setVisibleOnAllWorkspaces(value,options){this.allWorkspaces={value,options};}
    isVisibleOnAllWorkspaces(){return Boolean(this.allWorkspaces?.value);}
  }
  return {FakeWindow:MacWindow,windows};
}
class MacTray extends FakeTray {setIgnoreDoubleClickEvents(value){this.ignoreDoubleClick=value;}}

// ───────────── appPaths：macOS 安装版的引擎在 Contents/MacOS，菜单栏用模板图，通知不带图标 ─────────────
{
  const contents=path.resolve('szuDesktop.app','Contents'),resources=path.join(contents,'Resources'),asar=path.join(resources,'app.asar');
  const mac=appPaths({isPackaged:true,resourcesPath:resources,here:asar,platform:'darwin'});
  assert.equal(mac.platform,'darwin');
  assert.equal(mac.sidecar,path.join(contents,'MacOS','szudesktop-engine'),'the packaged engine is nested code in Contents/MacOS');
  assert.ok(mac.sidecar.endsWith(path.join('MacOS','szudesktop-engine')));
  assert.equal(mac.trayIcon,path.join(resources,MAC_TRAY_ICON_FILE));
  assert.equal(mac.notificationIcon,undefined,'macOS notifications use the app icon');
  assert.equal(MAC_TRAY_ICON_FILE,'szudesktop-trayTemplate.png','the Template suffix makes macOS tint the icon for the menu bar');
  const macDev=appPaths({isPackaged:false,resourcesPath:'',here,platform:'darwin'});
  assert.equal(macDev.sidecar,path.resolve(here,'..','..','dist','szudesktop'),'development runs dist/szudesktop from build-macos.py --dev');
  assert.equal(macDev.trayIcon,path.resolve(here,'..','assets',MAC_TRAY_ICON_FILE));
  assert.equal(macDev.notificationIcon,undefined);
  // 提交进仓库的素材：两张模板图的 PNG 头里宽高是 16 和 32，icns 以魔数开头。
  const png=file=>{const bytes=readFileSync(file);assert.equal(bytes.toString('latin1',1,4),'PNG');return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),colorType:bytes[25]};};
  assert.deepEqual(png(macDev.trayIcon),{width:16,height:16,colorType:6});
  assert.deepEqual(png(macDev.trayIcon.replace(/\.png$/,'@2x.png')),{width:32,height:32,colorType:6});
  assert.equal(readFileSync(path.resolve(here,'..','assets','szudesktop.icns')).toString('latin1',0,4),'icns');
  // win32 与 linux：原有字段和今天一样，新字段等于原来的 .ico。
  const win=appPaths({isPackaged:true,resourcesPath:resources,here:asar,platform:'win32'});
  assert.equal(win.sidecar,path.join(resources,'szudesktop-windows-amd64.exe'));
  assert.equal(win.icon,path.join(resources,'szudesktop.ico'));
  assert.equal(win.trayIcon,win.icon);assert.equal(win.notificationIcon,win.icon);assert.equal(win.platform,'win32');
  const winDev=appPaths({isPackaged:false,resourcesPath:'',here,platform:'win32'});
  assert.equal(winDev.sidecar,path.resolve(here,'..','..','dist','szudesktop-windows-amd64.exe'));
  assert.equal(winDev.icon,path.resolve(here,'..','assets','szudesktop.ico'));assert.equal(winDev.trayIcon,winDev.icon);
  const linux=appPaths({isPackaged:true,resourcesPath:resources,here:asar,platform:'linux'});
  assert.equal(linux.sidecar,path.join(resources,'szudesktop'));assert.equal(linux.icon,path.join(resources,'szudesktop.ico'));
  assert.equal(linux.trayIcon,linux.icon);assert.equal(linux.notificationIcon,linux.icon);
  const linuxDev=appPaths({isPackaged:false,resourcesPath:'',here,platform:'linux'});
  assert.equal(linuxDev.sidecar,path.resolve(here,'..','..','dist','szudesktop'));
  for(const paths of [mac,macDev,win,winDev,linux,linuxDev])for(const key of ['gardenEngine','version','mainPreload','petHtml','petPreload'])
    assert.equal(paths[key],appPaths({isPackaged:paths.isPackaged,resourcesPath:paths.isPackaged?resources:'',here:paths.isPackaged?asar:here,platform:'win32'})[key],key+' does not depend on the platform');
}

// ───────────── 菜单栏图标：macOS 先确认图片在、单击只弹菜单、忽略双击，程序坞菜单复用去掉「退出」的同一组菜单项 ─────────────
{
  const trayOptions=(overrides={})=>{
    const state={shown:0,quits:0,patches:[],dock:[],trays:[],exists:[],failures:[],visible:true,settings:{...DESKTOP_DEFAULTS}};
    const {Menu,built}=fakeMenu();
    class Tray extends MacTray {constructor(icon){super(icon);state.trays.push(this);}}
    const tray=createTrayMenu({Tray,Menu,icon:'/app/tray.png',readPreferences:()=>state.settings,petVisible:()=>state.visible,
      petSizeMenu:()=>[{label:'标准（100%）',type:'checkbox',checked:true}],changeSettings:patch=>state.patches.push(patch),
      showMainWindow:()=>{state.shown++;},quit:()=>{state.quits++;},recordError:message=>{state.failures.push(message);return true;},
      exists:file=>{state.exists.push(file);return true;},setDockMenu:menu=>state.dock.push(menu),...overrides});
    return {tray,state,built};
  };
  const labels=menu=>menu.items.map(item=>item.label??item.type);
  const trayLabels=['隐藏伙伴','伙伴置顶','伙伴大小','勿扰（暂停专注提醒）','打开主窗口','separator','退出'];
  {
    const {tray,state}=trayOptions({platform:'darwin'});
    tray.create();
    const icon=tray.get();
    assert.deepEqual(state.exists,['/app/tray.png'],'the template image is checked before creating the menu bar icon');
    assert.equal(icon.ignoreDoubleClick,true);
    assert.equal(icon.listenerCount('click'),0,'clicking the menu bar icon only opens its menu');
    assert.deepEqual(labels(tray.menu()),trayLabels,'the menu bar icon keeps the full menu, including quit');
    assert.equal(state.dock.length,1);
    assert.deepEqual(labels(state.dock[0]),trayLabels.slice(0,5),'the Dock menu has the same items without quit (macOS adds its own)');
    state.dock[0].find('打开主窗口').click();state.dock[0].find('隐藏伙伴').click();
    assert.equal(state.shown,1);assert.deepEqual(state.patches,[{petVisible:false}]);
    state.visible=false;state.settings={...state.settings,doNotDisturb:true};tray.refresh();
    assert.equal(state.dock.length,2,'the Dock menu is rebuilt with the tray menu');
    assert.equal(state.dock[1].items[0].label,'显示伙伴');assert.equal(state.dock[1].find('勿扰（暂停专注提醒）').checked,true);
    tray.menu().find('退出').click();assert.equal(state.quits,1);
    assert.equal(tray.exists(),true);
  }
  {
    // 图片不在：不建托盘（关主窗即退出的兜底生效），原因交给冒烟记录。默认用 existsSync 检查真实文件。
    const {tray,state}=trayOptions({platform:'darwin',exists:undefined,icon:path.resolve(here,'no-such-trayTemplate.png')});
    tray.create();
    assert.equal(tray.get(),null);assert.equal(tray.exists(),false);assert.equal(state.trays.length,0);
    assert.equal(state.failures.length,1);assert.match(state.failures[0],/^tray: 找不到菜单栏图标/);
    const real=trayOptions({platform:'darwin',exists:undefined,icon:appPaths({isPackaged:false,resourcesPath:'',here,platform:'darwin'}).trayIcon});
    real.tray.create();assert.ok(real.tray.get(),'the committed template image exists');
  }
  for(const platform of ['win32',undefined]){
    const {tray,state}=trayOptions({platform});
    tray.create();
    const icon=tray.get();
    assert.deepEqual(state.exists,[],'Windows never checks the file first');
    assert.equal(icon.ignoreDoubleClick,undefined);assert.equal(icon.listenerCount('click'),1);
    icon.emit('click');assert.equal(state.shown,1,'Windows: clicking the tray icon opens the main window');
    assert.deepEqual(labels(tray.menu()),trayLabels);
    tray.refresh();assert.deepEqual(state.dock,[],'no Dock menu outside macOS');
  }
}

// ───────────── 宠物窗：选项、层级与跨桌面显示 ─────────────
const wa={x:0,y:0,width:1920,height:1080};
assert.deepEqual(petPlatformOptions('darwin'),{type:'panel',hiddenInMissionControl:true,acceptFirstMouse:true,roundedCorners:false});
for(const platform of ['win32','linux',undefined])assert.deepEqual(petPlatformOptions(platform),{},String(platform));
assert.equal(petTopLevel('darwin'),'floating');
for(const platform of ['win32','linux',undefined])assert.equal(petTopLevel(platform),'screen-saver',String(platform));
assert.deepEqual(petWindowOptions(wa),{width:260,height:320,x:1636,y:736,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,
  resizable:false,focusable:false,hasShadow:false,show:false,title:'szuDesktop 桌面伙伴'},'petWindowOptions is the same on every platform');

// 与 main.mjs 一样不传 activateApp；需要观察它时由用例自己传。
function petHarness(platform,overrides={}){
  const {FakeWindow,windows}=macWindowClass(),{Menu,built}=fakeMenu(),screen=fakeScreen(wa),saved=[];
  let clock=1_000_000;
  const pet=createPetController({BrowserWindow:FakeWindow,Menu,screen,dialog:fakeDialog(),platform,html:path.resolve('pet-check','pet.html'),preload:'/pet-preload.cjs',
    gardenEngine:Promise.resolve({}),loadWorkspace:async()=>({data:null}),readPreferences:()=>({petVisible:true,petAlwaysOnTop:true}),
    changeSettings(){},saveSettings:(scale,position)=>saved.push({scale,position}),isQuitting:()=>false,observeWorkspace(){},
    dispatch(){},refreshTray(){},publishScale(){},quit(){},setInterval:()=>({unref(){}}),clearInterval(){},now:()=>clock,...overrides});
  const popups=()=>built.flatMap(menu=>menu.popups);
  return {pet,windows,saved,popups,screen,tick:ms=>{clock+=ms;}};
}
{
  const {pet,windows}=petHarness('darwin');
  await pet.create();
  const petWin=windows[0];
  for(const [key,value] of Object.entries(petPlatformOptions('darwin')))assert.equal(petWin.options[key],value,key);
  assert.equal(petWin.options.focusable,false);assert.equal(petWin.options.transparent,true);
  assert.equal(petWin.level,'floating','macOS keeps the pet below menus');
  assert.deepEqual(petWin.allWorkspaces,{value:true,options:{visibleOnFullScreen:true,skipTransformProcessType:true}},'follows Spaces and full-screen apps without turning into a UI element');
  assert.equal(petWin.isVisibleOnAllWorkspaces(),true);
  assert.equal(petWin.excludedFromShownWindowsMenu,true,'the pet is not listed in the Window menu');
  pet.applyPreferences({petVisible:true,petAlwaysOnTop:false});
  assert.equal(petWin.level,'floating');assert.equal(petWin.alwaysOnTop,false);
  pet.say('荔'.repeat(80));
  assert.equal(petWin.webContents.last('pet:say'),'荔'.repeat(PET_SAY_MAX),'say keeps the 60-character cap');
}
{
  const {pet,windows}=petHarness('win32');
  await pet.create();
  const petWin=windows[0];
  for(const key of Object.keys(petPlatformOptions('darwin')))assert.equal(Object.hasOwn(petWin.options,key),false,key+' is macOS-only');
  assert.equal(petWin.level,'screen-saver');assert.equal(petWin.allWorkspaces,undefined);assert.notEqual(petWin.excludedFromShownWindowsMenu,true);
  pet.applyPreferences({petVisible:true,petAlwaysOnTop:false});assert.equal(petWin.level,'screen-saver');
}
// ⌘H 或别的应用里的「隐藏其他」把宠物随应用一起藏起来时设置不变：macOS 按窗口真实显隐重建菜单栏图标与程序坞菜单，
// 「隐藏伙伴/显示伙伴」不再与实际相反；Windows 没有应用级隐藏，不加这两个监听。
for(const platform of ['darwin','win32']){
  let refreshed=0;
  const {pet,windows}=petHarness(platform,{refreshTray:()=>{refreshed++;}});
  await pet.create();
  const petWin=windows[0],before=refreshed;
  assert.equal(petWin.listenerCount('hide'),platform==='darwin'?1:0,platform);
  assert.equal(petWin.listenerCount('show'),platform==='darwin'?1:0,platform);
  petWin.visible=false;petWin.emit('hide');
  assert.equal(pet.isVisible(),false);
  assert.equal(refreshed-before,platform==='darwin'?1:0,platform+': app hidden, tray label follows');
  petWin.visible=true;petWin.emit('show');
  assert.equal(refreshed-before,platform==='darwin'?2:0,platform+': app shown again, tray label follows');
}

// ───────────── 宠物菜单手势：macOS 的 Control 点按与菜单跟踪 ─────────────
{
  // Control 点按：pointerdown 开始按压 → contextmenu 请求菜单 → 按压结束 → pointerup 又请求一次。只弹一次，拖动已收尾。
  const {pet,windows,saved,popups,tick}=petHarness('darwin');
  await pet.create();
  const petWin=windows[0],box=petWin.getBounds(),inside={x:box.x+100,y:box.y+100};
  pet.drag('start',inside);
  await pet.openMenu();
  assert.equal(popups().length,1);
  assert.equal(petWin.mouse.at(-1).ignore,false,'menu open keeps clicks');
  pet.drag('move',{x:inside.x-40,y:inside.y-40});
  assert.deepEqual(petWin.getBounds(),box,'the drag ended before the menu opened: later moves do nothing');
  tick(50);pet.drag('end',inside);
  await pet.openMenu();
  assert.equal(popups().length,1,'a second request while the menu is open is ignored');
  popups()[0].callback();
  assert.equal(petWin.mouse.at(-1).ignore,true,'menu closed with nothing held: click-through again');
  tick(PET_MENU_REPEAT_MS-1);await pet.openMenu();
  assert.equal(popups().length,1,'the same press asking again within a second is ignored');
  assert.deepEqual(saved,[],'the pet never moved, so no position is saved');
  // 等待存档期间到达的第二次请求：正在打开也算打开中。
  tick(PET_MENU_REPEAT_MS);
  await Promise.all([pet.openMenu(),pet.openMenu()]);
  assert.equal(popups().length,2,'requests racing the workspace read open one menu');
  // 菜单打开中又开始一次新按压：仍然不弹第二个。
  pet.drag('start',inside);pet.drag('end',inside);await pet.openMenu();
  assert.equal(popups().length,2);
  popups()[1].callback();
}
{
  // 菜单跟踪吞掉 pointerup：结束由 lostpointercapture 补发；1 秒后用键盘打开菜单仍然可以。
  const {pet,windows,popups,tick}=petHarness('darwin');
  await pet.create();
  const box=windows[0].getBounds(),inside={x:box.x+60,y:box.y+60};
  pet.drag('start',inside);await pet.openMenu();popups()[0].callback();
  tick(300);pet.drag('end',inside);
  tick(PET_MENU_REPEAT_MS);await pet.openMenu();
  assert.equal(popups().length,2,'a keyboard request a second after the press ends opens the menu');
  popups()[1].callback();
  // 新的一次点按（按下、松开、请求菜单）照常打开。
  pet.drag('start',inside);pet.drag('end',inside);await pet.openMenu();
  assert.equal(popups().length,3,'a new press is a new gesture');
}
{
  // 按住拖动途中请求菜单：移动过就保存位置，而且只保存一次。
  const {pet,windows,saved}=petHarness('darwin');
  await pet.create();
  const box=windows[0].getBounds(),inside={x:box.x+60,y:box.y+60};
  pet.drag('start',inside);pet.drag('move',{x:inside.x-30,y:inside.y-20});
  await pet.openMenu();
  assert.equal(saved.length,1,'a moved pet saves its position when the menu interrupts the drag');
  pet.drag('end',{x:inside.x-30,y:inside.y-20});
  assert.equal(saved.length,1,'the late pointer end does not save again');
}
// activateApp 缺省是空操作（main 不接）；接上时只在 macOS 上、弹菜单之前调用一次。
for(const platform of ['darwin','win32']){
  const calls=[];
  const harness=petHarness(platform,{activateApp:()=>calls.push(harness.popups().length)});
  await harness.pet.create();await harness.pet.openMenu();
  assert.equal(harness.popups().length,1);
  assert.deepEqual(calls,platform==='darwin'?[0]:[],platform+': activateApp before the popup on macOS only');
}
{
  // win32：同一序列弹两次，拖动不会被菜单打断，与今天一致。
  const activations=[];
  const {pet,windows,saved,popups,tick}=petHarness('win32',{activateApp:()=>activations.push(1)});
  await pet.create();
  const petWin=windows[0],box=petWin.getBounds(),inside={x:box.x+100,y:box.y+100};
  pet.drag('start',inside);await pet.openMenu();
  pet.drag('move',{x:inside.x-40,y:inside.y-20});
  assert.notDeepEqual(petWin.getBounds(),box,'Windows keeps the drag alive while the menu opens');
  tick(10);pet.drag('end',{x:inside.x-40,y:inside.y-20});await pet.openMenu();
  assert.equal(popups().length,2,'Windows opens the menu for both requests, as before');
  assert.equal(saved.length,1);assert.deepEqual(activations,[]);
}

// ───────────── 登录项：macOS 由 SMAppService 登记，按原因提示；Windows 文案不变 ─────────────
function macApp({packaged=true,inApplications=true,status='not-registered',approve=true,wasOpenedAtLogin=false}={}){
  const calls=[];let state={openAtLogin:status==='enabled',status,wasOpenedAtLogin};
  return {calls,isPackaged:packaged,isInApplicationsFolder:()=>inApplications,
    getLoginItemSettings:(...args)=>{calls.push(['get',...args]);return {...state};},
    setLoginItemSettings:options=>{
      calls.push(['set',options]);
      state=!options.openAtLogin?{...state,openAtLogin:false,status:'not-registered'}
        :approve?{...state,openAtLogin:true,status:'enabled'}:{...state,openAtLogin:false,status:'requires-approval'};
    },
    setState(next){state={...state,...next};}};
}
const sets=app=>app.calls.filter(([action])=>action==='set').map(([,options])=>options);
assert.equal(loginItemSupported('darwin',true,true),true);
assert.equal(Boolean(loginItemSupported('darwin',true,false)),false);assert.equal(Boolean(loginItemSupported('darwin',false,true)),false);
assert.equal(Boolean(loginItemSupported('darwin',true)),true,'inApplications defaults to true');
assert.equal(loginItemSupported('win32',true),true);assert.equal(loginItemSupported('win32',true,false),true,'Windows ignores the Applications folder');
assert.equal(loginItemSupported('win32',false),false);assert.equal(loginItemSupported('linux',true),false);
{
  const app=macApp();
  const control=createLoginItemControl(app,{platform:'darwin'});
  assert.equal(control.supported,true);assert.equal(control.get(),false);assert.equal(control.hint,undefined);
  assert.equal(await control.repair(),false);assert.deepEqual(sets(app),[],'reading and repair never register a login item');
  assert.equal(control.set(true),true);
  assert.deepEqual(sets(app),[{openAtLogin:true}],'macOS registers the app itself: no path or --autostart');
  assert.equal(control.get(),true);assert.equal(control.hint,undefined);
  assert.throws(()=>control.set('yes'),/自启开关格式不正确/);
  assert.equal(control.set(false),false);assert.deepEqual(sets(app).at(-1),{openAtLogin:false});
  app.setState({openAtLogin:true,status:'not-found'});assert.equal(control.get(),false,'a registration pointing at a missing app is off');
  app.setState({openAtLogin:true,status:'requires-approval'});assert.equal(control.get(),false,'waiting for approval is off');
  assert.equal(control.hint,'requires-approval');
}
{
  const app=macApp({approve:false});
  const control=createLoginItemControl(app,{platform:'darwin'});
  assert.throws(()=>control.set(true),error=>/系统设置 → 通用 → 登录项与扩展/.test(error.message)&&!/Windows/.test(error.message));
  assert.equal(control.hint,'requires-approval');assert.equal(control.get(),false);
}
{
  const app=macApp({inApplications:false});
  const control=createLoginItemControl(app,{platform:'darwin'});
  assert.equal(control.supported,false);assert.equal(control.get(),false);assert.equal(control.hint,'not-in-applications');
  assert.throws(()=>control.set(true),error=>error.message==='请先把 szuDesktop 拖到「应用程序」文件夹，再从那里打开后开启');
  assert.equal(await control.repair(),false);assert.deepEqual(sets(app),[]);
  const dev=macApp({packaged:false,inApplications:false});
  const devControl=createLoginItemControl(dev,{platform:'darwin'});
  assert.equal(devControl.supported,false);assert.equal(devControl.hint,'not-in-applications');
  assert.throws(()=>devControl.set(true),error=>error.message==='开发模式不支持登录时启动');
  assert.deepEqual(sets(dev),[]);
}
{
  const windows=createLoginItemControl({isPackaged:false,getLoginItemSettings:()=>assert.fail('unsupported Windows never reads'),setLoginItemSettings:()=>assert.fail()},{platform:'win32'});
  assert.throws(()=>windows.set(true),error=>error.message==='开机自启仅支持已安装的 Windows 桌面版');
  assert.equal('hint' in windows,false,'Windows login control has no hint');
}
{
  assert.equal(openedAtLogin(macApp({wasOpenedAtLogin:true}),'darwin'),true);
  assert.equal(openedAtLogin(macApp(),'darwin'),false);
  const app=macApp({wasOpenedAtLogin:true});
  assert.equal(openedAtLogin(app,'win32'),false);assert.equal(openedAtLogin(app),false,'no platform: today\'s behavior');
  assert.deepEqual(app.calls,[],'Windows never asks');
}

// ───────────── 登录恢复保护：登录拉起后 15 秒内只拦一次 ─────────────
{
  let clock=0;const now=()=>clock;
  const guard=createLoginReopenGuard({platform:'darwin',openedAtLogin:true,now});
  clock=2000;assert.equal(guard(),true,'the restore relaunch right after login does not pop the main window');
  assert.equal(guard(),false,'only once');
  clock=0;const late=createLoginReopenGuard({platform:'darwin',openedAtLogin:true,now});
  clock=15_000;assert.equal(late(),false,'after 15 seconds a click on the Dock always opens the window');
  clock=0;const custom=createLoginReopenGuard({platform:'darwin',openedAtLogin:true,now,windowMs:100});
  clock=99;assert.equal(custom(),true);
  assert.equal(createLoginReopenGuard({platform:'darwin',openedAtLogin:false,now})(),false,'a normal launch is never guarded');
  const win=createLoginReopenGuard({platform:'win32',openedAtLogin:true,now});
  clock=1;for(let i=0;i<3;i++)assert.equal(win(),false,'Windows never guards');
  assert.equal(createLoginReopenGuard()(),false,'no options: never guards');
}

// ───────────── 设置快照：只有 macOS 的登录项给出原因时才带 launchAtLoginHint ─────────────
{
  const snapshot=control=>{
    const dialog=fakeDialog();
    const prefs=createDesktopPreferences({Notification:{isSupported:()=>true},dialog,getUserData:()=>'',write:(_dir,value)=>({...value}),
      applyEffects(){},refreshTray(){},publish(){}});
    prefs.load({...DESKTOP_DEFAULTS},control);
    return {prefs,dialog,value:prefs.snapshot()};
  };
  const outside=snapshot(createLoginItemControl(macApp({inApplications:false}),{platform:'darwin'}));
  assert.equal(outside.value.launchAtLoginHint,'not-in-applications');assert.equal(outside.value.launchAtLoginSupported,false);
  outside.prefs.change({launchAtLogin:true});
  assert.equal(outside.dialog.errors[0].title,'桌面设置未能保存');assert.match(outside.dialog.errors[0].message,/应用程序/);
  assert.doesNotMatch(outside.dialog.errors[0].message,/Windows/);
  const waiting=macApp();waiting.setState({status:'requires-approval'});
  assert.equal(snapshot(createLoginItemControl(waiting,{platform:'darwin'})).value.launchAtLoginHint,'requires-approval');
  const enabled=snapshot(createLoginItemControl(macApp({status:'enabled'}),{platform:'darwin'})).value;
  assert.equal(Object.hasOwn(enabled,'launchAtLoginHint'),false,'nothing to explain: no hint key');assert.equal(enabled.launchAtLogin,true);
  const win=snapshot(createLoginItemControl({isPackaged:true,getLoginItemSettings:()=>({openAtLogin:false,executableWillLaunchAtLogin:false}),setLoginItemSettings(){}},{platform:'win32'})).value;
  assert.equal(Object.hasOwn(win,'launchAtLoginHint'),false,'Windows snapshots are unchanged');
  const {lastNotifiedFocus:_hidden,...visible}=DESKTOP_DEFAULTS;
  assert.deepEqual(win,{...visible,launchAtLogin:false,launchAtLoginSupported:true,notificationsSupported:true});
}

// ───────────── 专注通知：macOS 不带 icon，onFailed 只在传入时多挂一个 failed 监听 ─────────────
{
  const run=async options=>{
    const created=[];
    class FakeNotification extends EventEmitter {
      static isSupported(){return true;}
      constructor(value){super();this.options=value;created.push(this);}
      show(){this.shown=true;}
      close(){this.closed=true;this.emit('close');}
    }
    let clock=5_000_000,settings={...DESKTOP_DEFAULTS};
    const reminders=createFocusReminders({Notification:FakeNotification,loadWorkspace:async()=>({data:{game:{focus:null}}}),
      readSettings:()=>settings,saveSettings:value=>{settings=value;},isSupported:()=>true,onClick(){},
      now:()=>clock,setTimer:()=>({}),clearTimer(){},...options});
    reminders.start();await settle();
    clock+=1000;reminders.observe({data:{game:{focus:{end:clock-1,duration:5}}}});
    assert.equal(created.length,1);
    return {notification:created[0],reminders};
  };
  {
    const {notification,reminders}=await run({icon:undefined});
    assert.equal(Object.hasOwn(notification.options,'icon'),false,'no icon key when the platform has no notification icon');
    assert.equal(notification.listenerCount('failed'),1,'without onFailed the failed handling is unchanged');
    notification.emit('failed',{},'denied');
    reminders.stop();assert.equal(notification.closed,undefined,'a failed notification is only forgotten, nothing else happens');
  }
  {
    const failures=[];
    const {notification,reminders}=await run({icon:'/app/szudesktop.ico',onFailed:error=>failures.push(error)});
    assert.equal(notification.options.icon,'/app/szudesktop.ico');
    assert.equal(notification.listenerCount('failed'),2);
    notification.emit('failed',{},'Notifications are not allowed');
    assert.deepEqual(failures,['Notifications are not allowed']);
    reminders.stop();
  }
  for(const onFailed of [undefined,null,'pet.say'])assert.equal((await run({icon:'/app/szudesktop.ico',onFailed})).notification.listenerCount('failed'),1,String(onFailed));
}

// 素材存在性：打包配置和 build-mac.mjs 依赖这些文件名。
for(const name of ['szudesktop.icns','szudesktop-trayTemplate.png','szudesktop-trayTemplate@2x.png'])
  assert.ok(existsSync(path.resolve(here,'..','assets',name)),name);
console.log('macOS integration: app paths, menu bar icon and Dock menu, pet panel level and Control-click guard, login items and login-restore guard, settings hint and notifications passed (win32 unchanged)');
