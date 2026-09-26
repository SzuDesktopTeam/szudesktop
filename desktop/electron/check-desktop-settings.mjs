import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DESKTOP_DEFAULTS,readDesktopSettings,writeDesktopSettings,desktopSettingsPath,validateDesktopPatch,createLoginItemControl,isQuietStartup} from './desktop-settings.mjs';
import {completedFocus,createFocusNotifier} from './focus-notifications.mjs';

const profile=mkdtempSync(join(tmpdir(),'szu-desktop-settings-'));
assert.deepEqual(readDesktopSettings(profile),DESKTOP_DEFAULTS);
let preferences={...DESKTOP_DEFAULTS,petVisible:false,petAlwaysOnTop:false};
writeDesktopSettings(profile,preferences);
assert.deepEqual(readDesktopSettings(profile),preferences,'hidden/not-on-top choices survive restart');
assert.equal(readDesktopSettings(profile).lastNotifiedFocus,null);
for(const patch of [null,[],{petVisible:'false'},{lastNotifiedFocus:'fake'},{notificationsSupported:true},{other:true}])assert.throws(()=>validateDesktopPatch(patch));
assert.deepEqual(validateDesktopPatch({focusNotifications:false,doNotDisturb:true,launchAtLogin:true}),{focusNotifications:false,doNotDisturb:true,launchAtLogin:true});

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

writeFileSync(desktopSettingsPath(profile),'{broken');
assert.deepEqual(readDesktopSettings(profile),DESKTOP_DEFAULTS);
assert.equal(readFileSync(desktopSettingsPath(profile),'utf8'),'{broken','read must preserve corrupt settings');
const main=readFileSync(new URL('main.mjs',import.meta.url),'utf8');
for(const channel of ['get','set'])assert.match(main,new RegExp(`ipcMain\\.handle\\('szu:desktop-settings-${channel}'[\\s\\S]*?isTrustedSender\\(event,mainWin,handle\\?\\.baseUrl\\)`));
assert.match(main,/notification\.on\('click',\(\)=>dispatchPetCommand\('study'\)\)/);
assert.match(main,/if\(!isQuietStartup\(process\.argv\)\)mainWin\.show\(\)/);
console.log('Desktop settings: opt-in system startup, quiet launch, pet preferences and once-only background focus reminders passed');
