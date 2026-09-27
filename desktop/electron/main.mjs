import {app, BrowserWindow, dialog, ipcMain, Menu, Notification, screen, session, shell, Tray} from 'electron';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {startSidecar,startupErrorText} from './sidecar.mjs';
import {launchUrl,redactToken,workspaceLoader} from './listen-url.mjs';
import {isTrustedSender} from './window-policy.mjs';
import {readPetSettings,writePetSettings} from './pet-settings.mjs';
import {APP_USER_MODEL_ID,readDesktopSettings,createLoginItemControl,isQuietStartup} from './desktop-settings.mjs';
import {appPaths,sidecarCommand} from './app-paths.mjs';
import {smokeMode,createSmokeRecorder} from './smoke-report.mjs';
import {createQuitCoordinator} from './quit-coordinator.mjs';
import {createMainWindow} from './main-window.mjs';
import {createEngineMonitor} from './engine-monitor.mjs';
import {createDesktopPreferences} from './desktop-preferences.mjs';
import {createFocusReminders} from './focus-reminders.mjs';
import {createPetController} from './pet-controller.mjs';
import {createTrayMenu} from './tray-menu.mjs';
import {createOfficialWindows} from './official-windows.mjs';
import {registerIpcRoutes} from './ipc-routes.mjs';

// 这里只负责组装：各模块的状态都在自己的工厂里，electron 的对象从这里注入，检查脚本用假对象测试各模块。
const here=path.dirname(fileURLToPath(import.meta.url));
const paths=appPaths({isPackaged:app.isPackaged,resourcesPath:process.resourcesPath,here,platform:process.platform});
// 菜单与主界面共用同一份庭院规则，包含离线成长；打包时直接复制源模块。
const gardenEngine=import(pathToFileURL(paths.gardenEngine).href);
// Installation smoke runs use their own profile and Go state, never the user's account.
const smoke=createSmokeRecorder(smokeMode(process.env));
if(smoke.enabled) app.setPath('userData',smoke.profile);
const userData=()=>app.getPath('userData');

let handle=null,startup=null,official=null;
const quit=createQuitCoordinator({app,dialog,getMainWindow:()=>mainWindow.get(),showMainWindow:()=>mainWindow.show(),
  waitForStartup:()=>startup,closeWindows,stopEngine});
const mainWindow=createMainWindow({BrowserWindow,preload:paths.mainPreload,smoke,isQuitting:quit.isQuitting,quit:()=>app.quit(),
  openExternal:url=>official.openExternal(url),onWorkspaceSaved:()=>focus.workspaceSaved(),
  onRendererGone:()=>void engine.failed('窗口进程意外结束，请重新打开应用'),
  canHideToTray:()=>tray.exists(),onSessionEnd:()=>quit.sessionEnd()});
const engine=createEngineMonitor({app,dialog,getMainWindow:()=>mainWindow.get(),isQuitting:quit.isQuitting});
const preferences=createDesktopPreferences({Notification,dialog,getUserData:userData,
  applyEffects:current=>{pet.applyPreferences(current);focus.settingsChanged();},
  refreshTray:()=>tray.refresh(),publish:result=>mainWindow.send('szu:desktop-settings',result)});
const loadWorkspace=workspaceLoader(()=>handle);
const focus=createFocusReminders({Notification,loadWorkspace,readSettings:preferences.current,saveSettings:preferences.save,
  isSupported:()=>!smoke.enabled&&Notification.isSupported(),icon:paths.icon,onClick:()=>mainWindow.command('study')});
const pet=createPetController({BrowserWindow,Menu,screen,dialog,platform:process.platform,html:paths.petHtml,preload:paths.petPreload,
  smoke,petShot:process.env.SZU_PET_SHOT,gardenEngine,loadWorkspace,readPreferences:preferences.current,changeSettings:preferences.change,
  saveSettings:(scale,position)=>writePetSettings(userData(),scale,position),isQuitting:quit.isQuitting,
  observeWorkspace:snapshot=>focus.observe(snapshot),dispatch:command=>mainWindow.command(command),
  refreshTray:()=>tray.refresh(),publishScale:scale=>mainWindow.send('szu:pet-scale',scale),quit:()=>app.quit()});
const tray=createTrayMenu({Tray,Menu,icon:paths.icon,readPreferences:preferences.current,petVisible:pet.isVisible,petSizeMenu:pet.sizeMenu,
  changeSettings:preferences.change,showMainWindow:()=>mainWindow.show(),quit:()=>app.quit(),recordError:smoke.record,debug:Boolean(process.env.SZU_PET_SHOT)});

async function startPet(){
  try{
    await pet.create();
    tray.create();
  }catch(e){
    // 宠物窗是增强功能，失败绝不能拖垮主界面。
    smoke.record('pet: '+e.message);
  }
}
// 退出第一步：停掉定时器与提醒，关掉所有窗口；渲染进程的事件流不能拖住后台引擎的优雅退出。
async function closeWindows(){
  engine.stop();
  focus.stop();
  pet.destroy();
  await official?.shutdown();
  tray.destroy();
  mainWindow.destroy();
}
// 退出第二步：停后台引擎（复用的便携版引擎属于别的启动器，handle.stop 不会停掉它）。
async function stopEngine(){
  try{if(handle)await handle.stop();}
  catch{if(!smoke.enabled)dialog.showErrorBox('后台服务未正常退出','请稍后重试；不要重复运行安装程序。');}
}
async function boot(){
  if(process.platform==='win32')app.setAppUserModelId(APP_USER_MODEL_ID);
  const savedPreferences=readDesktopSettings(userData());
  const loginItems=createLoginItemControl(app,{name:APP_USER_MODEL_ID});
  preferences.load(savedPreferences,loginItems);
  // 与启动引擎并行：升级换了安装目录时，把已登记的开机自启改指向当前程序。冒烟测试不碰真实注册表。
  const loginRepair=smoke.enabled?null:loginItems.repair().catch(()=>false);
  handle=await startSidecar(sidecarCommand(paths,{smoke:smoke.enabled,autoConnectCampus:preferences.current().autoConnectCampus,stderr:process.stderr}));
  await loginRepair;
  if(quit.isQuitting())return;
  official=createOfficialWindows({BrowserWindow,Menu,dialog,session,shell,getBaseURL:()=>handle.baseUrl,getToken:()=>handle.token,
    isQuitting:quit.isQuitting,reportSchoolCleanup:()=>!handle.owned&&!smoke.enabled});
  const mainWin=mainWindow.create(handle.baseUrl);
  engine.watch(handle);
  // 首次加载带一次性的 launch 凭据：Go 换成 HttpOnly Cookie 后 303 回到 /，页面此后的请求都自动带 Cookie。
  // loadURL 失败时的报错含完整地址，统一在启动失败的出口抹掉凭据。
  await mainWin.loadURL(launchUrl(handle));
  if(!isQuietStartup(process.argv))mainWin.show();
  pet.restore(readPetSettings(userData()));
  if(!quit.isQuitting())await startPet();
  // Quiet login still needs an accessible way back if the system tray failed.
  if(!quit.isQuitting()&&!tray.get())mainWin.show();
  if(!quit.isQuitting())focus.start();
  await smoke.writeReport({app,mainWin:mainWindow.get(),handle,petRuntime:()=>({petWin:pet.window(),tray:tray.get(),getMenu:tray.menu,screen,
    getPetMenu:pet.menu,getPetMouse:pet.mouse,getPetHitLog:pet.hitLog,initialScale:pet.scale(),userData:userData()})});
}

const gotLock=app.requestSingleInstanceLock();
if(!gotLock)app.quit();
else{
  registerIpcRoutes({ipcMain,app,quit,pet,preferences,getOfficial:()=>official,
    isTrusted:event=>isTrustedSender(event,mainWindow.get(),handle?.baseUrl)});
  app.on('second-instance',(_event,argv)=>{if(!isQuietStartup(argv))mainWindow.show();});
  app.whenReady().then(()=>{
    pet.watchDisplays();
    startup=boot();
    return startup;
  }).catch(async e=>{
    // 报错（例如 loadURL 的失败信息、页面地址）可能带着凭据：写进冒烟报告或错误框之前一律抹掉。
    const token=handle?.token;
    if(e instanceof Error)e.message=redactToken(e.message,token);
    if(smoke.enabled)await smoke.writeFailure(e,mainWindow.get(),token);
    // 后台引擎报告了具体原因（目录不可写等）或启动超时（旧进程仍在退出）时，重装解决不了，不再建议重装。
    else if(!quit.isQuitting())dialog.showErrorBox('szuDesktop 启动失败',startupErrorText(e));
    app.quit();
  });
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>quit.beforeQuit(event));
}
