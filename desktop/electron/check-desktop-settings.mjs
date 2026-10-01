import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {tmpdir} from 'node:os';
import path,{join} from 'node:path';
import {EventEmitter} from 'node:events';
import {DESKTOP_DEFAULTS,readDesktopSettings,writeDesktopSettings,desktopSettingsPath,validateDesktopPatch,createLoginItemControl,isQuietStartup,sidecarArgs,
  APP_USER_MODEL_ID,RUN_KEY,queryRegistryValue,startupApprovedEnabled} from './desktop-settings.mjs';
import {TOKEN_HEADER,workspaceLoader} from './listen-url.mjs';
import {completedFocus,activeFocusEnd,createFocusNotifier,createFocusScheduler,isWorkspaceSave,FOCUS_RECHECK_MAX_MS,FOCUS_SAVE_SETTLE_MS} from './focus-notifications.mjs';
import {appPaths,sidecarCommand} from './app-paths.mjs';
import {createDesktopPreferences} from './desktop-preferences.mjs';
import {createFocusReminders} from './focus-reminders.mjs';
import {createPetController} from './pet-controller.mjs';
import {smokeMode,createSmokeRecorder,publishSmokeReport,SMOKE_ERROR_LIMIT} from './smoke-report.mjs';
import {createTrayMenu} from './tray-menu.mjs';
const currentVersion=readFileSync(new URL('../../internal/version/VERSION',import.meta.url),'utf8').trim();
import {FakeTray,fakeDialog,fakeMenu,fakeScreen,fakeWindowClass,settle} from './testdata/fake-electron.mjs';

const profile=mkdtempSync(join(tmpdir(),'szu-desktop-settings-'));
assert.deepEqual(readDesktopSettings(profile),DESKTOP_DEFAULTS);
let preferences={...DESKTOP_DEFAULTS,petVisible:false,petAlwaysOnTop:false};
writeDesktopSettings(profile,preferences);
assert.deepEqual(readDesktopSettings(profile),preferences,'hidden/not-on-top choices survive restart');
assert.equal(readDesktopSettings(profile).lastNotifiedFocus,null);
for(const patch of [null,[],{petVisible:'false'},{lastNotifiedFocus:'fake'},{notificationsSupported:true},{other:true}])assert.throws(()=>validateDesktopPatch(patch));
assert.deepEqual(validateDesktopPatch({focusNotifications:false,doNotDisturb:true,launchAtLogin:true}),{focusNotifications:false,doNotDisturb:true,launchAtLogin:true});

// 启动时自动连接校园网：默认开启，只接受布尔值，重启后保留；关闭时 sidecar 一律带 --no-auto-login。
assert.equal(DESKTOP_DEFAULTS.autoConnectCampus,true,'auto campus login is on by default and can be turned off');
assert.deepEqual(validateDesktopPatch({autoConnectCampus:true}),{autoConnectCampus:true});
assert.throws(()=>validateDesktopPatch({autoConnectCampus:'true'}));
writeDesktopSettings(profile,{...preferences,autoConnectCampus:false});
assert.equal(readDesktopSettings(profile).autoConnectCampus,false,'turning it off survives restart');
writeDesktopSettings(profile,{...preferences,autoConnectCampus:'yes'});
assert.equal(readDesktopSettings(profile).autoConnectCampus,true,'malformed value falls back to the default (on)');
// Only real booleans count: a "false" string, 0 or 1 are malformed and fall back to the defaults, never Boolean()-coerced.
writeDesktopSettings(profile,{...preferences,autoConnectCampus:'false',petVisible:0,doNotDisturb:1,focusNotifications:null});
assert.deepEqual(readDesktopSettings(profile),{...preferences,petVisible:true,doNotDisturb:false,focusNotifications:true,autoConnectCampus:true},'non-boolean values are not coerced');
writeDesktopSettings(profile,preferences);
assert.deepEqual(sidecarArgs(),['--no-open','--no-auto-login']);
assert.deepEqual(sidecarArgs({autoConnectCampus:false}),['--no-open','--no-auto-login']);
assert.deepEqual(sidecarArgs({autoConnectCampus:'true'}),['--no-open','--no-auto-login']);
assert.deepEqual(sidecarArgs({autoConnectCampus:true}),['--no-open']);
assert.deepEqual(sidecarArgs({smoke:true,autoConnectCampus:true}),['--no-open','--no-auto-login'],'smoke never logs in');

const calls=[];
let registered=false,approved=true;
const fakeApp={isPackaged:true,
  getLoginItemSettings:options=>{calls.push(['get',options]);return {openAtLogin:registered,executableWillLaunchAtLogin:registered&&approved};},
  setLoginItemSettings:options=>{calls.push(['set',options]);registered=options.openAtLogin;approved=options.enabled;},
};
const startup=createLoginItemControl(fakeApp,{platform:'win32',executable:'C:/szuDesktop/szuDesktop.exe'});
assert.equal(startup.get(),false);
assert.equal(calls.filter(([action])=>action==='set').length,0,'reading/startup must never opt the user in');
assert.equal(startup.set(true),true);
assert.deepEqual(calls.find(([action])=>action==='set')[1],{path:'C:/szuDesktop/szuDesktop.exe',args:['--autostart'],openAtLogin:true,enabled:true});
approved=false;
assert.equal(startup.get(),false,'Windows Task Manager disabling takes precedence over registration');
assert.equal(startup.set(false),false);
for(const app of [{...fakeApp,isPackaged:false},fakeApp]) {
  const platform=app.isPackaged?'linux':'win32';
  const unsupported=createLoginItemControl(app,{platform});
  assert.equal(unsupported.supported,false);assert.equal(unsupported.get(),false);assert.throws(()=>unsupported.set(true));
}
assert.equal(isQuietStartup(['app.exe','--autostart']),true);
assert.equal(isQuietStartup(['app.exe']),false);

let time=10_000,snapshot={data:{game:{focus:{end:time+100,duration:5}}}},supported=true;
const sent=[];
const options={loadWorkspace:async()=>snapshot,now:()=>time,readSettings:()=>readDesktopSettings(profile),
  saveSettings:value=>writeDesktopSettings(profile,value),isSupported:()=>supported,notify:completion=>sent.push(completion)};
let monitor=createFocusNotifier(options);
assert.equal(await monitor.check(),false,'not yet completed');
snapshot.data.game.focus=null;
time+=200;
assert.equal(await monitor.check(),false,'cancelled focus never reminds');
snapshot.data.game.focus={end:time,duration:5};
assert.equal(await monitor.check(),true,'completed while main window is absent still reminds');
assert.equal(await monitor.check(),false,'unclaimed completion only reminds once');
assert.equal(sent.length,1);
monitor=createFocusNotifier(options);
assert.equal(await monitor.check(),false,'restarting reads persisted completion deduplication');
assert.equal(sent.length,1);
assert.equal(readDesktopSettings(profile).petVisible,false,'notification record preserves pet preferences');
for(const muted of [{doNotDisturb:true},{focusNotifications:false}]) {
  writeDesktopSettings(profile,{...readDesktopSettings(profile),focusNotifications:true,doNotDisturb:false,...muted});
  snapshot.data.game.focus={end:++time,duration:25};
  assert.equal(await monitor.check(),false);
  writeDesktopSettings(profile,{...readDesktopSettings(profile),focusNotifications:true,doNotDisturb:false});
  assert.equal(await monitor.check(),false,'unmuting must not replay muted completions');
}
supported=false;
snapshot.data.game.focus={end:++time,duration:45};
assert.equal(await monitor.check(),false,'unsupported system must not call Notification');
supported=true;
assert.equal(await monitor.check(),false);
assert.equal(sent.length,1);
snapshot.data.game.focus=null;
assert.equal(await monitor.check(),false,'claimed completion is absent');
assert.equal(completedFocus({data:{game:{focus:{end:time,duration:NaN}}}},time),null);

let finishLoad;
const inFlight=createFocusNotifier({...options,loadWorkspace:()=>new Promise(resolve=>{finishLoad=resolve;})});
snapshot.data.game.focus={end:++time,duration:5};
const pending=inFlight.check();
assert.equal(await inFlight.check(),false,'slow requests do not overlap');
inFlight.stop();finishLoad(snapshot);
assert.equal(await pending,false,'shutdown suppresses pending completion');
assert.equal(sent.length,1);
const cannotPersist=createFocusNotifier({...options,saveSettings:()=>{throw Error('unwritable');}});
assert.equal(await cannotPersist.check(),false,'do not notify until deduplication is durably saved');
assert.equal(sent.length,1);
assert.equal(await createFocusNotifier({...options,loadWorkspace:async()=>{throw Error('offline');}}).check(),false);

// 调度：不再每 2 秒拉存档。静音时一次也不读；进行中的专注按结束时间定一次时（最长 1 分钟复查）；
// 主窗保存会合并成一次读取；静音期间结束的专注在重新打开提醒后只记为已处理。
{
  let clock=1_000_000,loads=0,loadFails=false,workspace={data:{game:{focus:null}}},settings={...DESKTOP_DEFAULTS};
  const timers=new Set(),notified=[];
  const setTimer=(fn,ms)=>{const t={fn,at:clock+ms,ms};timers.add(t);return t;};
  const clearTimer=t=>timers.delete(t);
  const advance=async ms=>{
    clock+=ms;
    for(const t of [...timers].sort((a,b)=>a.at-b.at))if(t.at<=clock&&timers.has(t)){timers.delete(t);t.fn();}
    for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  };
  const loadWorkspace=async()=>{loads++;if(loadFails)throw Error('busy');return structuredClone(workspace);};
  const notifier=createFocusNotifier({loadWorkspace,now:()=>clock,readSettings:()=>settings,saveSettings:value=>{settings=value;},
    isSupported:()=>true,notify:completion=>notified.push(completion)});
  const scheduler=createFocusScheduler({notifier,loadWorkspace,readSettings:()=>settings,isSupported:()=>true,now:()=>clock,setTimer,clearTimer});
  await scheduler.start();
  assert.equal(loads,1,'startup reads once');assert.equal(timers.size,0,'no focus, no timer');
  await advance(10*60_000);
  assert.equal(loads,1,'idle app never polls the workspace');

  // 开始 25 分钟专注：主窗保存后合并读取一次，随后最多每分钟复查一次，结束时提醒。
  workspace.data.game.focus={end:clock+25*60_000,duration:25};
  scheduler.workspaceSaved();scheduler.workspaceSaved();scheduler.workspaceSaved();
  await advance(FOCUS_SAVE_SETTLE_MS);
  assert.equal(loads,2,'bursty saves are coalesced into one read');
  assert.equal([...timers][0].ms,FOCUS_RECHECK_MAX_MS,'long focus rechecks at most once a minute');
  for(let i=0;i<30&&!notified.length;i++)await advance(FOCUS_RECHECK_MAX_MS);
  assert.equal(notified.length,1,'completion reminds once');
  assert.ok(loads<=2+26,'a 25-minute focus needs about one read per minute, not 750');
  assert.equal(timers.size,0,'finished focus leaves no timer behind');
  const afterFinish=loads;await advance(10*60_000);assert.equal(loads,afterFinish);

  // 快结束时按剩余时间定时，而不是固定间隔。
  workspace.data.game.focus={end:clock+20_000,duration:5};
  await scheduler.refresh();
  assert.ok([...timers][0].ms>20_000&&[...timers][0].ms<=21_000,'final timer follows the end time');

  // 勿扰：取消定时器且不再读取；其间结束的专注在关闭勿扰后只记为已处理。
  settings={...settings,doNotDisturb:true};scheduler.settingsChanged();
  assert.equal(timers.size,0,'muting cancels the reminder timer');
  const muted=loads;scheduler.workspaceSaved();await advance(5*60_000);
  assert.equal(loads,muted,'muted scheduler reads nothing');
  settings={...settings,doNotDisturb:false};scheduler.settingsChanged();await advance(0);
  assert.equal(loads,muted+1,'unmuting reads once');
  assert.equal(notified.length,1,'completion that ended while muted is not replayed');
  assert.equal(settings.lastNotifiedFocus,`${workspace.data.game.focus.end}:5`,'muted completion is consumed');

  // 静音后开始的新专注照常提醒；宠物刷新传入的存档也能安排定时。
  workspace.data.game.focus={end:clock+90_000,duration:1};
  scheduler.observe(structuredClone(workspace));
  assert.equal(timers.size,1);
  await advance(FOCUS_RECHECK_MAX_MS);await advance(FOCUS_RECHECK_MAX_MS);
  assert.equal(notified.length,2,'new focus after unmuting still reminds');

  // 读取失败时稍后重试，不会立刻反复请求。
  workspace.data.game.focus={end:clock+30_000,duration:1};loadFails=true;
  const failing=loads;await scheduler.refresh();
  assert.equal(loads,failing+1);assert.equal([...timers][0].ms,FOCUS_RECHECK_MAX_MS,'failed read retries after a minute');
  loadFails=false;await advance(FOCUS_RECHECK_MAX_MS);
  assert.equal(notified.length,3,'retry still delivers the completion');

  // 读取途中的新保存：读完后补读一次，不并发。
  let release;const slow=createFocusScheduler({notifier,readSettings:()=>settings,isSupported:()=>true,now:()=>clock,setTimer,clearTimer,
    loadWorkspace:()=>{loads++;return new Promise(resolve=>{release=()=>resolve(structuredClone(workspace));});}});
  const slowStart=loads;const first=slow.start();slow.refresh();slow.refresh();
  assert.equal(loads,slowStart+1,'no overlapping reads');
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads,slowStart+2,'one follow-up read for saves during the read');
  release();await first;

  // 关闭通知或系统不支持时启动即不读；退出后不再安排任何定时器。
  let reads=0;
  const quiet=createFocusScheduler({notifier,loadWorkspace:async()=>{reads++;return workspace;},readSettings:()=>({...settings,focusNotifications:false}),isSupported:()=>true,now:()=>clock,setTimer,clearTimer});
  await quiet.start();quiet.workspaceSaved();await advance(FOCUS_SAVE_SETTLE_MS);
  const unsupported=createFocusScheduler({notifier,loadWorkspace:async()=>{reads++;return workspace;},readSettings:()=>settings,isSupported:()=>false,now:()=>clock,setTimer,clearTimer});
  await unsupported.start();
  assert.equal(reads,0,'disabled or unsupported reminders never read the workspace');
  scheduler.stop();slow.stop();
  workspace.data.game.focus={end:clock+30_000,duration:1};
  scheduler.observe(workspace);scheduler.workspaceSaved();assert.equal(await scheduler.refresh(),false);
  assert.equal(timers.size,0,'stopped scheduler leaves no timers');
}
assert.equal(activeFocusEnd({data:{game:{focus:{end:2000,duration:5}}}},1000),2000);
assert.equal(activeFocusEnd({data:{game:{focus:{end:2000,duration:5}}}},2000),null);
assert.equal(activeFocusEnd({data:{game:{focus:{end:2000,duration:500}}}},1000),null);
const appBase='http://127.0.0.1:45678';
assert.equal(isWorkspaceSave({method:'POST',statusCode:200,url:appBase+'/api/workspace'},appBase),true);
for(const details of [{method:'GET',statusCode:200,url:appBase+'/api/workspace'},{method:'POST',statusCode:409,url:appBase+'/api/workspace'},
  {method:'POST',statusCode:200,url:appBase+'/api/notebook'},{method:'POST',statusCode:200,url:'http://127.0.0.1:1/api/workspace'},{method:'POST',statusCode:200,url:'not a url'},null])
  assert.equal(isWorkspaceSave(details,appBase),false,JSON.stringify(details));

writeFileSync(desktopSettingsPath(profile),'{broken');
assert.deepEqual(readDesktopSettings(profile),DESKTOP_DEFAULTS);
assert.equal(readFileSync(desktopSettingsPath(profile),'utf8'),'{broken','read must preserve corrupt settings');
// 启动 sidecar 的命令：安装版读注入的 szuVersion，开发时读仓库 VERSION；参数只来自 sidecarArgs。
{
  const resources=path.resolve('res'),asar=path.join(resources,'app.asar'),reads=[];
  const packaged=appPaths({isPackaged:true,resourcesPath:resources,here:asar,platform:'win32'});
  assert.deepEqual(sidecarCommand(packaged,{smoke:false,autoConnectCampus:true,stderr:process.stderr,read:file=>{reads.push(file);return JSON.stringify({szuVersion:currentVersion});}}),
    {command:path.join(resources,'szudesktop-windows-amd64.exe'),args:['--no-open'],expectedVersion:currentVersion,stderrTo:undefined},'installed builds keep stderr for the failure reason only');
  assert.deepEqual(reads,[path.join(asar,'package.json')]);
  assert.equal(packaged.icon,path.join(resources,'szudesktop.ico'));
  const dev=appPaths({isPackaged:false,resourcesPath:'',here:path.resolve('desktop','electron'),platform:'linux'});
  const devCommand=sidecarCommand(dev,{smoke:false,autoConnectCampus:false,stderr:process.stderr,read:file=>{assert.equal(file,path.resolve('internal','version','VERSION'));return currentVersion+'\n';}});
  assert.deepEqual(devCommand,{command:path.resolve('dist','szudesktop'),args:['--no-open','--no-auto-login'],expectedVersion:currentVersion,stderrTo:process.stderr});
  assert.deepEqual(sidecarCommand(dev,{smoke:true,autoConnectCampus:true,read:()=>'v1.2.3'}).args,['--no-open','--no-auto-login'],'smoke never logs in');
  for(const version of ['','dev','1.2',null])assert.throws(()=>sidecarCommand(packaged,{read:()=>JSON.stringify({szuVersion:version})}),/应用版本信息缺失，请重新安装当前版本/);
}

// 主进程读存档带 sidecar 交来的凭据；引擎未就绪或读取失败都抛错，由调用方降级。
{
  await assert.rejects(workspaceLoader(()=>null,async()=>assert.fail('no request before the engine is ready'))(),/本机引擎尚未就绪/);
  await assert.rejects(workspaceLoader(()=>({baseUrl:'http://127.0.0.1:1',token:'t'}),async()=>({ok:false}))(),/庭院存档暂时不可读/);
}

// 桌面设置的唯一副本：先改开机自启、再写文件，然后依次同步宠物窗与专注提醒、托盘和主窗页面；失败时提示并刷新托盘勾选。
{
  const events=[],written=[],dialog=fakeDialog();let loginOn=false;
  const loginItems={supported:true,get:()=>loginOn,set:value=>{events.push(['login',value]);loginOn=value;return value;}};
  const prefs=createDesktopPreferences({Notification:{isSupported:()=>true},dialog,getUserData:()=>'/profile',
    write:(dir,value)=>{written.push([dir,value]);return {...value};},
    applyEffects:current=>events.push(['effects',{...current}]),refreshTray:()=>events.push(['tray']),publish:result=>events.push(['publish',result])});
  assert.deepEqual(prefs.current(),DESKTOP_DEFAULTS,'defaults until startup loads the saved file');
  assert.equal(prefs.snapshot().launchAtLogin,false);
  prefs.load({...DESKTOP_DEFAULTS,lastNotifiedFocus:'1:5'},loginItems);
  const {lastNotifiedFocus:_hidden,...visible}=DESKTOP_DEFAULTS;
  assert.deepEqual(prefs.snapshot(),{...visible,launchAtLogin:false,launchAtLoginSupported:true,notificationsSupported:true},'the page never sees reminder bookkeeping');
  const result=prefs.apply({petVisible:false,launchAtLogin:true});
  assert.deepEqual(events.map(([name])=>name),['login','effects','tray','publish']);
  assert.deepEqual(written,[['/profile',{...DESKTOP_DEFAULTS,lastNotifiedFocus:'1:5',petVisible:false}]]);
  assert.equal(events[1][1].petVisible,false,'effects see the saved value');
  assert.equal(result.launchAtLogin,true);assert.equal(result.petVisible,false);assert.deepEqual(events.at(-1)[1],result);
  written.length=0;prefs.apply({launchAtLogin:false});assert.deepEqual(written,[],'launch at login lives in the OS, not the settings file');
  events.length=0;
  assert.throws(()=>prefs.apply({petVisible:'no'}));assert.deepEqual(events,[]);
  prefs.change({petVisible:'no'});
  assert.deepEqual(events,[['tray']],'a failed change re-syncs the tray checkboxes');assert.equal(dialog.errors[0].title,'桌面设置未能保存');
  prefs.save({...prefs.current(),lastNotifiedFocus:'9:1'});assert.equal(prefs.current().lastNotifiedFocus,'9:1');
}

// 宠物隐藏时不读存档，重新显示时立刻补读一次；隐藏同时恢复点击穿透。按 main.mjs 的方式把设置、宠物窗和存档读取接起来。
{
  const token='0123456789abcdef'.repeat(4);let reads=0;
  // 主进程读存档不经过页面 Cookie，必须带 sidecar 交来的凭据。
  const loadWorkspace=workspaceLoader(()=>({baseUrl:'http://127.0.0.1:1',token}),async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:1/api/workspace');
    assert.equal(options?.headers?.[TOKEN_HEADER],token,'pet refresh carries the session token');
    reads++;return {ok:true,json:async()=>({data:null})};
  });
  const {FakeWindow,windows}=fakeWindowClass(),{Menu}=fakeMenu();
  let pet=null,trays=0;
  const prefs=createDesktopPreferences({Notification:{isSupported:()=>true},dialog:fakeDialog(),getUserData:()=>'',write:(_dir,value)=>({...value}),
    applyEffects:current=>pet.applyPreferences(current),refreshTray:()=>{trays++;},publish(){}});
  prefs.load({...DESKTOP_DEFAULTS},{supported:false,get:()=>false,set(){}});
  pet=createPetController({BrowserWindow:FakeWindow,Menu,screen:fakeScreen(),dialog:fakeDialog(),platform:'win32',html:path.resolve('pet.html'),preload:'/pet-preload.cjs',
    gardenEngine:Promise.resolve({}),loadWorkspace,readPreferences:prefs.current,changeSettings:prefs.change,saveSettings(){},isQuitting:()=>false,
    observeWorkspace(){},dispatch(){},refreshTray:()=>{trays++;},publishScale(){},quit(){},setInterval:()=>({unref(){}}),clearInterval(){}});
  await pet.create();
  const petWin=windows[0];
  assert.equal(reads,1,'visible pet refreshes its state');
  pet.setHit(true);
  prefs.apply({petVisible:false});await settle();
  assert.equal(petWin.visible,false);
  assert.deepEqual(pet.mouse(),{hit:false,ignoring:true},'hiding drops the pointer-over state and restores click-through');
  await pet.pushState();await pet.pushState();
  assert.equal(reads,1,'hidden pet never reads the workspace');
  prefs.apply({petVisible:true});await settle();
  assert.equal(petWin.visible,true);assert.equal(reads,2,'showing again refreshes once right away');
  prefs.apply({petVisible:true});await settle();
  assert.equal(reads,2,'already visible: no extra read');
  prefs.apply({petAlwaysOnTop:false});assert.equal(petWin.alwaysOnTop,false);assert.equal(petWin.level,'screen-saver');
  // 宠物窗被关掉之后再选择显示：重新创建一个，并刷新托盘。
  petWin.destroy();const traysBefore=trays;
  prefs.apply({petVisible:true});await settle();
  assert.equal(windows.length,2);assert.equal(windows[1].alwaysOnTop,false);assert.ok(trays>=traysBefore+2,'tray refreshed after the new window is ready');
}

// 专注提醒的系统通知：结束时弹一次，点击回到学习页；关提醒或勿扰时收起已弹出的通知；退出时一并关闭，此后不再安排定时器。
{
  const created=[];
  class FakeNotification extends EventEmitter {
    static isSupported(){return true;}
    constructor(options){super();this.options=options;created.push(this);}
    show(){this.shown=true;}
    close(){this.closed=true;this.emit('close');}
  }
  let clock=2_000_000,loads=0,settings={...DESKTOP_DEFAULTS},workspace={data:{game:{focus:{end:clock+30_000,duration:25}}}};
  const timers=new Set(),clicks=[];
  const fire=async ms=>{clock+=ms;for(const t of [...timers].sort((a,b)=>a.at-b.at))if(t.at<=clock&&timers.has(t)){timers.delete(t);t.fn();}await settle();};
  const reminders=createFocusReminders({Notification:FakeNotification,loadWorkspace:async()=>{loads++;return structuredClone(workspace);},
    readSettings:()=>settings,saveSettings:value=>{settings=value;},isSupported:()=>true,icon:'/app/szudesktop.ico',onClick:()=>clicks.push('study'),
    now:()=>clock,setTimer:(fn,ms)=>{const t={fn,at:clock+ms,ms};timers.add(t);return t;},clearTimer:t=>timers.delete(t)});
  reminders.observe(workspace);reminders.workspaceSaved();reminders.settingsChanged();
  assert.equal(loads,0);assert.equal(timers.size,0,'nothing runs before startup finishes');
  reminders.start();await settle();
  assert.equal(loads,1,'startup reads once');assert.equal([...timers][0].ms,30_500,'timed to the focus end, not polled');
  await fire(31_000);
  assert.equal(created.length,1);
  const [first]=created;
  assert.deepEqual(first.options,{title:'这一段专注完成了',body:'你设定的 25 分钟已经结束。点这里回到学习工具领取奖励。',icon:'/app/szudesktop.ico'});
  assert.equal(first.shown,true);
  first.emit('click');assert.deepEqual(clicks,['study'],'clicking opens the study page');
  settings={...settings,doNotDisturb:true};reminders.settingsChanged();
  assert.equal(first.closed,true,'do not disturb dismisses the shown reminder');assert.equal(timers.size,0);
  settings={...settings,doNotDisturb:false};reminders.settingsChanged();await settle();
  assert.equal([...timers].at(-1).ms,FOCUS_RECHECK_MAX_MS,'idle recheck defaults to once a minute');
  // 宠物刷新传入的存档也能送出提醒；新的提醒替换旧的。
  clock+=1000;workspace={data:{game:{focus:{end:clock-1,duration:5}}}};
  reminders.observe(structuredClone(workspace));
  assert.equal(created.length,2);assert.equal(created[1].shown,true);
  reminders.stop();
  assert.equal(created[1].closed,true,'quitting dismisses the reminder');assert.equal(timers.size,0);
  reminders.workspaceSaved();reminders.observe(structuredClone(workspace));assert.equal(timers.size,0,'stopped reminders schedule nothing');
}

// 托盘菜单：勾选状态按当前设置重建，点击只提交设置补丁；托盘建不起来时交给冒烟记录。
{
  const {Menu,built}=fakeMenu(),patches=[];let visible=true,shown=0,quits=0,settings={...DESKTOP_DEFAULTS,doNotDisturb:true};
  const tray=createTrayMenu({Tray:FakeTray,Menu,icon:'/app/szudesktop.ico',readPreferences:()=>settings,petVisible:()=>visible,
    petSizeMenu:()=>[{label:'标准（100%）',type:'checkbox',checked:true}],changeSettings:patch=>patches.push(patch),showMainWindow:()=>{shown++;},quit:()=>{quits++;}});
  tray.refresh();assert.equal(built.length,0,'no tray yet: nothing to rebuild');assert.equal(tray.exists(),false);
  tray.create();
  const icon=tray.get();
  assert.equal(icon.icon,'/app/szudesktop.ico');assert.equal(icon.tooltip,'szuDesktop 荔枝庭院');assert.equal(tray.exists(),true);
  let menu=tray.menu();assert.equal(icon.menu,menu);
  assert.deepEqual(menu.items.map(item=>item.label??item.type),['隐藏宠物','宠物置顶','宠物大小','勿扰（暂停专注提醒）','打开主窗口','separator','退出']);
  assert.equal(menu.find('宠物置顶').checked,true);assert.equal(menu.find('勿扰（暂停专注提醒）').checked,true);
  assert.equal(menu.find('宠物大小').submenu[0].label,'标准（100%）');
  menu.find('隐藏宠物').click();menu.find('宠物置顶').click();menu.find('勿扰（暂停专注提醒）').click();
  assert.deepEqual(patches,[{petVisible:false},{petAlwaysOnTop:false},{doNotDisturb:false}]);
  visible=false;settings={...settings,doNotDisturb:false};tray.refresh();menu=tray.menu();
  assert.equal(menu.items[0].label,'显示宠物');assert.equal(menu.find('勿扰（暂停专注提醒）').checked,false);
  menu.items[0].click();assert.deepEqual(patches.at(-1),{petVisible:true});
  icon.emit('click');menu.find('打开主窗口').click();assert.equal(shown,2);
  menu.find('退出').click();assert.equal(quits,1);
  tray.destroy();assert.equal(icon.destroyed,true);assert.equal(tray.get(),null);assert.equal(tray.exists(),false);
  const failures=[];
  const broken=createTrayMenu({Tray:class{constructor(){throw Error('no tray host');}},Menu,icon:'x',readPreferences:()=>settings,petVisible:()=>true,petSizeMenu:()=>[],
    changeSettings(){},showMainWindow(){},quit(){},recordError:message=>{failures.push(message);return true;}});
  broken.create();assert.equal(broken.get(),null);assert.equal(broken.exists(),false);assert.deepEqual(failures,['tray: no tray host']);
}

// 冒烟模式只在两个绝对路径都给出时开启；报错最多记 10 条；启动失败的报告抹掉会话凭据。
{
  const dir=mkdtempSync(join(tmpdir(),'szu-smoke-report-')),report=join(dir,'report.json');
  assert.equal(smokeMode({}).enabled,false);
  assert.equal(smokeMode({SZU_SMOKE_REPORT:'report.json',SZUNET_CONFIG_DIR:dir}).enabled,false,'relative report path');
  assert.equal(smokeMode({SZU_SMOKE_REPORT:report,SZUNET_CONFIG_DIR:'cfg'}).enabled,false,'relative profile path');
  const mode=smokeMode({SZU_SMOKE_REPORT:report,SZUNET_CONFIG_DIR:dir,SZU_SMOKE_QUIT_AFTER_REPORT:'1'});
  assert.equal(mode.enabled,true);assert.equal(mode.profile,join(dir,'electron-profile'));assert.equal(mode.quitAfterReport,true);
  const publication=join(dir,'publication.json');let release;
  const pending=publishSmokeReport(publication,{completed:true},()=>new Promise(resolve=>{release=resolve;}));
  assert.equal(existsSync(publication),false,'native quit driver must not see success while the watchdog is alive');
  assert.equal(existsSync(publication+'.tmp'),true);
  release();await pending;
  assert.deepEqual(JSON.parse(readFileSync(publication,'utf8')),{completed:true});
  const worker=new Worker('setInterval(()=>{},1000)',{eval:true});worker.unref();
  await publishSmokeReport(join(dir,'worker-stopped.json'),{completed:true},()=>worker.terminate());
  assert.equal(worker.threadId,-1,'the real test worker is terminated before native drivers can quit');
  assert.equal(smokeMode({...mode,SZUNET_CONFIG_DIR:dir,SZU_SMOKE_REPORT:report,SZU_SMOKE_QUIT_TRACE:'relative.jsonl'}).quitTrace,null);
  assert.equal(smokeMode({SZUNET_CONFIG_DIR:dir,SZU_SMOKE_REPORT:report,SZU_SMOKE_QUIT_TRACE:join(dir,'quit.jsonl')}).quitTrace,join(dir,'quit.jsonl'));
  const off=createSmokeRecorder(smokeMode({})),offPage=new EventEmitter();
  assert.equal(off.record('x'),false);off.watch(offPage,{preload:'preload: ',console:''});assert.equal(offPage.listenerCount('console-message'),0);
  await off.writeReport({});
  const smoke=createSmokeRecorder(mode),page=new EventEmitter();
  smoke.watch(page,{preload:'pet preload: ',console:'pet: '});
  page.emit('preload-error',{},'/pet-preload.cjs',Error('boom'));
  page.emit('console-message',{level:'warning',message:'ignored'});page.emit('console-message',{level:'error',message:'bad'});
  assert.deepEqual(smoke.errors,['pet preload: boom','pet: bad']);
  for(let i=0;i<20;i++)smoke.record('error '+i);
  assert.equal(smoke.errors.length,SMOKE_ERROR_LIMIT);assert.equal(smoke.record('late'),false);
  const token='0123456789abcdef'.repeat(4);
  const mainWin={isDestroyed:()=>false,webContents:{executeJavaScript:async()=>({url:'http://127.0.0.1:1/?launch='+token})}};
  await smoke.writeFailure(Error('ERR_FAILED loading http://127.0.0.1:1/?launch='+token),mainWin,token);
  const written=readFileSync(report,'utf8');
  assert.equal(written.includes(token),false,'the failure report never carries the session token');assert.match(written,/<会话凭据>/);
  assert.equal(JSON.parse(written).consoleErrors.length,SMOKE_ERROR_LIMIT);
  await smoke.writeFailure(Error('x'),{isDestroyed:()=>false,webContents:{executeJavaScript:async()=>{throw Error('renderer gone');}}},token);
  assert.equal(JSON.parse(readFileSync(report,'utf8')).snapshotError,'renderer gone');
  rmSync(dir,{recursive:true,force:true});
}

// 装配顺序只能在 main.mjs 里看：读偏好早于启动 sidecar（自动连接校园网只看这个偏好）；开机自启修复与引擎并行，
// 冒烟测试不碰真实注册表；主窗首次加载一次性的 launch 地址；静默自启不显示主窗；启动失败的报告和错误框先抹掉凭据。
// IPC 来源校验、显示器监听、引擎监视和退出协调的接线由 check-main-wiring.mjs 导入 main.mjs 实际跑一遍。
const main=readFileSync(new URL('main.mjs',import.meta.url),'utf8');
assert.ok(main.indexOf('preferences.load(')>0&&main.indexOf('preferences.load(')<main.indexOf('startSidecar('),'preferences load before the sidecar starts');
assert.match(main,/sidecarCommand\(paths,\{smoke:smoke\.enabled,autoConnectCampus:preferences\.current\(\)\.autoConnectCampus,/);
assert.match(main,/const loginRepair=smoke\.enabled\?null:loginItems\.repair\(\)\.catch\(\(\)=>false\);\s*handle=await startSidecar\([^\n]*\);\s*await loginRepair;/);
assert.match(main,/await mainWin\.loadURL\(launchUrl\(handle\)\);/);
assert.match(main,/if\(!isQuietStartup\(process\.argv\)\)mainWin\.show\(\);/);
assert.match(main,/if\(e instanceof Error\)e\.message=redactToken\(e\.message,token\);\s*if\(smoke\.enabled\)await smoke\.writeFailure\(e,/);
assert.match(main,/if\(!quit\.isQuitting\(\)\)focus\.start\(\);/);
// 凭据不进任何日志；sidecar 参数只来自 sidecarArgs；主窗只加载 launch 地址。
const shellSources=[main,...['app-paths','smoke-report','quit-coordinator','main-window','engine-monitor','desktop-preferences','focus-reminders',
  'pet-controller','tray-menu','official-windows','ipc-routes'].map(name=>readFileSync(new URL(name+'.mjs',import.meta.url),'utf8'))].join('\n');
assert.doesNotMatch(shellSources,/console\.[a-z]+\([^)]*token/i);
assert.doesNotMatch(shellSources,/'--no-auto-login'/,'sidecar flags come from sidecarArgs only');
assert.doesNotMatch(shellSources,/loadURL\(handle\.baseUrl\)/);

// 宠物隐藏时没有 30 秒刷新：没有进行中的专注也每分钟复查一次，专注可能在便携版的浏览器页里开始；
// 宠物刷新传入存档会顺延这次复查，不额外读取；静音后一次也不读。
{
  let clock=5_000_000,loads=0,workspace={data:{game:{focus:null}}},settings={...DESKTOP_DEFAULTS};
  const timers=new Set(),notified=[];
  const setTimer=(fn,ms)=>{const t={fn,at:clock+ms,ms};timers.add(t);return t;};
  const clearTimer=t=>timers.delete(t);
  const advance=async ms=>{
    clock+=ms;
    for(const t of [...timers].sort((a,b)=>a.at-b.at))if(t.at<=clock&&timers.has(t)){timers.delete(t);t.fn();}
    for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  };
  const loadWorkspace=async()=>{loads++;return structuredClone(workspace);};
  const notifier=createFocusNotifier({loadWorkspace,now:()=>clock,readSettings:()=>settings,saveSettings:value=>{settings=value;},
    isSupported:()=>true,notify:completion=>notified.push(completion)});
  const scheduler=createFocusScheduler({notifier,loadWorkspace,readSettings:()=>settings,isSupported:()=>true,now:()=>clock,setTimer,clearTimer,idleRecheckMs:FOCUS_RECHECK_MAX_MS});
  await scheduler.start();assert.equal(loads,1);
  await advance(FOCUS_RECHECK_MAX_MS);assert.equal(loads,2,'reused engine rechecks once a minute while idle');
  for(let i=0;i<4;i++){await advance(30_000);scheduler.observe(structuredClone(workspace));}
  assert.equal(loads,2,'visible pet refreshes stand in for the idle recheck');
  workspace.data.game.focus={end:clock+90_000,duration:2};
  await advance(FOCUS_RECHECK_MAX_MS);assert.equal(loads,3,'idle recheck finds a focus started outside the main window');
  for(let i=0;i<3&&!notified.length;i++)await advance(FOCUS_RECHECK_MAX_MS);
  assert.equal(notified.length,1,'and reminds when it ends');
  settings={...settings,doNotDisturb:true};scheduler.settingsChanged();
  assert.equal(timers.size,0);
  const muted=loads;await advance(10*60_000);assert.equal(loads,muted,'muted: no idle reads');
  scheduler.stop();
}

// 升级换了安装目录：同名 Run 值还在而命令对不上时，按当前程序重写，并保留任务管理器里的启用状态。
{
  const writes=[],queries=[];let openAtLogin=false,runValue=null,approved=null;
  const app={isPackaged:true,getLoginItemSettings:()=>({openAtLogin,executableWillLaunchAtLogin:openAtLogin}),setLoginItemSettings:options=>{writes.push(options);}};
  const query=async(key,name)=>{queries.push([key,name]);return key===RUN_KEY?runValue:approved;};
  const control=createLoginItemControl(app,{platform:'win32',executable:'D:/新目录/szuDesktop.exe',name:APP_USER_MODEL_ID,query});
  assert.equal(await control.repair(),false,'never enabled: nothing to repair');
  assert.deepEqual(writes,[],'reading never opts the user in');
  assert.deepEqual(queries,[[RUN_KEY,APP_USER_MODEL_ID]]);
  runValue='\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    com.szudesktop.app    REG_SZ    "C:\\旧目录\\szuDesktop.exe" --autostart\r\n';
  approved='\r\n    com.szudesktop.app    REG_BINARY    030000004A7B1C2D3E4F5A01\r\n';
  assert.equal(await control.repair(),true);
  assert.deepEqual(writes.at(-1),{path:'D:/新目录/szuDesktop.exe',args:['--autostart'],openAtLogin:true,enabled:false},'a disabled entry stays disabled');
  approved=null;
  assert.equal(await control.repair(),true);assert.equal(writes.at(-1).enabled,true);
  openAtLogin=true;queries.length=0;
  assert.equal(await control.repair(),false,'already pointing at this program');assert.deepEqual(queries,[]);
  for(const unsupported of [createLoginItemControl({...app,isPackaged:false},{platform:'win32',query}),createLoginItemControl(app,{platform:'linux',query})])
    assert.equal(await unsupported.repair(),false);
}
for(const [output,enabled] of [[null,true],['',true],['REG_BINARY    020000000000000000000000',true],['REG_BINARY    06000000',true],['REG_BINARY    03000000D2',false],['REG_BINARY    07',false]])
  assert.equal(startupApprovedEnabled(output),enabled,String(output));
assert.equal(APP_USER_MODEL_ID,'com.szudesktop.app');
assert.equal(await queryRegistryValue(RUN_KEY,'szudesktop-check-value-that-does-not-exist'),null,'missing values (and hosts without reg.exe) read as absent');
console.log('Desktop settings: opt-in system startup and its upgrade repair, sidecar command, settings sync, tray menu, hidden-pet refresh, once-only background focus reminders and redacted smoke reports passed');
