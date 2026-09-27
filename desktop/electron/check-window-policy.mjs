import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {isAppUrl,isTrustedSender,contentSecurityPolicy} from './window-policy.mjs';
import {createQuitCoordinator,QUIT_SAVE_TIMEOUT_MS} from './quit-coordinator.mjs';
import {registerIpcRoutes,TRUSTED_INVOKE_CHANNELS} from './ipc-routes.mjs';
import {createMainWindow,FOREGROUND_COMMANDS} from './main-window.mjs';
import {FakeIpcMain,fakeDialog,fakeWindowClass,settle} from './testdata/fake-electron.mjs';
const base='http://127.0.0.1:45678';
assert.equal(isAppUrl(base+'/#garden',base),true);
// 主窗口首次加载带一次性 launch 参数的地址，Go 303 跳回 /：两者都必须仍算本应用页面（will-redirect 放行）。
for(const url of [base+'/?launch='+'0123456789abcdef'.repeat(4),base+'/',base+'/?smoke=backup#settings/data'])assert.equal(isAppUrl(url,base),true,url);
for(const url of ['https://szu.edu.cn', 'http://127.0.0.1:45679/', 'http://127.0.0.1.evil.test:45678/', 'file:///a', 'javascript:alert(1)', 'http://user@127.0.0.1:45678']) assert.equal(isAppUrl(url,base),false,url);
const frame={url:base+'/'},wc={mainFrame:frame},win={webContents:wc};
assert.equal(isTrustedSender({sender:wc,senderFrame:frame},win,base),true);
assert.equal(isTrustedSender({sender:wc,senderFrame:{url:base+'/' }},win,base),false);
assert.equal(isTrustedSender({sender:{},senderFrame:frame},win,base),false);
frame.url='https://szu.edu.cn/';
assert.equal(isTrustedSender({sender:wc,senderFrame:frame},win,base),false);
assert.match(contentSecurityPolicy,/script-src 'self';/);
assert.doesNotMatch(contentSecurityPolicy,/unsafe-eval/);
console.log('Window policy: local navigation, IPC sender and CSP checks passed');

/// 真实的 preload 与主进程退出协调（quit-coordinator + ipc-routes）直接对接，不启动 Electron、不读配置。
// 托盘退出必须等页面把笔记和棋局保存下来。
const renderer=new EventEmitter(),ipc=new FakeIpcMain();
let bridge,timer,crashed=false,sendCount=0,lastId=0;
const quitFrame={url:base+'/'};
const quitWC={mainFrame:quitFrame,isDestroyed:()=>false,isCrashed:()=>crashed,
  send:(channel,id)=>{sendCount++;lastId=id;renderer.emit(channel,{},id);}};
const quitWin={webContents:quitWC,isDestroyed:()=>false};
const ipcEvent={sender:quitWC,senderFrame:quitFrame};
renderer.send=(channel,payload)=>ipc.emit(channel,ipcEvent,payload);
renderer.invoke=async()=>{};
const appQuits=[];
const guard=createQuitCoordinator({app:{quit:()=>appQuits.push('quit')},dialog:fakeDialog(),getMainWindow:()=>quitWin,showMainWindow:()=>{},
  closeWindows:async()=>{},stopEngine:async()=>{},
  setTimer:(callback,milliseconds)=>{assert.equal(milliseconds,QUIT_SAVE_TIMEOUT_MS);timer={callback,active:true};return timer;},clearTimer:item=>{item.active=false;}});
assert.equal(QUIT_SAVE_TIMEOUT_MS,5000);
registerIpcRoutes({ipcMain:ipc,app:{quit(){}},quit:guard,pet:{},preferences:{},getOfficial:()=>null,isTrusted:event=>isTrustedSender(event,quitWin,base)});
vm.runInNewContext(readFileSync(new URL('./preload.cjs',import.meta.url),'utf8'),{
  require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}},ipcRenderer:renderer}),
});
assert.deepEqual(await guard.requestRendererSave(),{ok:true,message:'还有内容尚未保存'}); // No editor mounted during startup.
let complete;
bridge.onBeforeQuit(()=>new Promise(resolve=>{complete=resolve;}));
let settled=false;
const saving=guard.requestRendererSave().then(result=>{settled=true;return result;});
await Promise.resolve();assert.equal(settled,false);
const id=lastId;
ipc.emit('szu:quit-prepared',{sender:quitWC,senderFrame:{url:base+'/'}},{id,ok:true});
ipc.emit('szu:quit-prepared',ipcEvent,{id:id+1,ok:true});
ipc.emit('szu:quit-prepared',ipcEvent,{id,ok:'yes'});
await settle();assert.equal(settled,false,'forged frames, other ids and non-boolean replies are ignored');
complete();assert.equal((await saving).ok,true);assert.equal(timer.active,false,'the wait timer is cleared');
bridge.onBeforeQuit(async()=>{throw Error('磁盘已满');});
assert.deepEqual(await guard.requestRendererSave(),{ok:false,message:'磁盘已满'});
bridge.onBeforeQuit(()=>new Promise(()=>{}));
const stalled=guard.requestRendererSave(),stalledId=lastId;timer.callback();
const timedOut=await stalled;
assert.equal(timedOut.ok,false);assert.match(timedOut.message,/等待保存超时/);
// 超时后迟到的回执不会误放行下一次请求。
let nextSettled=false;
const next=guard.requestRendererSave().then(result=>{nextSettled=true;return result;});
ipc.emit('szu:quit-prepared',ipcEvent,{id:stalledId,ok:true});await settle();
assert.equal(nextSettled,false,'a late reply for an expired request is ignored');
ipc.emit('szu:quit-prepared',ipcEvent,{id:lastId,ok:true,message:'x'.repeat(500)});
assert.deepEqual(await next,{ok:true,message:'x'.repeat(240)},'reply messages are capped');
crashed=true;const beforeCrash=sendCount;assert.deepEqual(await guard.requestRendererSave(),{ok:true});assert.equal(sendCount,beforeCrash);
crashed=false;guard.sessionEnd();assert.deepEqual(appQuits,['quit'],'session end quits right away');
assert.deepEqual(await guard.requestRendererSave(),{ok:true});assert.equal(sendCount,beforeCrash);

// before-quit：先请页面保存，保存成功才依次关窗口、停引擎、放行退出；保存不住时先问用户。
{
  const events=[],dialog=fakeDialog([0,1]);
  let startupDone;
  const startup=new Promise((_resolve,reject)=>{startupDone=()=>reject(Error('启动失败'));});startup.catch(()=>{});
  const win={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,isCrashed:()=>false,
    send:(_channel,requestId)=>{events.push('save');setImmediate(()=>flow.prepared({id:requestId,ok:false,message:'磁盘已满'}));}}};
  const flow=createQuitCoordinator({app:{quit:()=>events.push('app.quit')},dialog,getMainWindow:()=>win,showMainWindow:()=>events.push('show'),
    waitForStartup:()=>startup,
    closeWindows:async()=>{assert.equal(flow.isQuitting(),true,'quitting is set before any window closes');events.push('close');},
    stopEngine:async()=>{events.push('engine');}});
  const quitEvent=()=>{const event={prevented:false,preventDefault(){this.prevented=true;}};flow.beforeQuit(event);return event;};
  assert.equal(quitEvent().prevented,true);quitEvent();
  await settle();assert.deepEqual(events,[],'shutdown waits for startup to settle, even when it failed');
  startupDone();await settle(10);
  assert.deepEqual(events,['save','show'],'repeated quit requests share one shutdown; unsaved content brings the window back');
  assert.equal(flow.isQuitting(),false);
  assert.equal(dialog.boxes.length,1);
  const {parent,options}=dialog.boxes[0];
  assert.equal(parent,win);
  // onBeforeQuit 同时保存笔记和 2048 棋局，拦下退出的提示不能只说笔记。
  assert.equal(options.title,'还有内容尚未保存');assert.equal(options.message,'先保存，再退出庭院');
  assert.match(options.detail,/^磁盘已满 返回后可重试保存或导出备份/);
  assert.deepEqual(options.buttons,['返回处理','放弃未保存修改并退出']);assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);
  for(const text of [options.title,options.message,options.detail])assert.doesNotMatch(text,/笔记尚未保存|先保存笔记|等待笔记保存/);
  // 选“返回处理”：什么都不关；下次退出重新保存、重新询问，这次选择放弃修改。
  events.length=0;
  quitEvent();await settle(10);
  assert.deepEqual(events,['save','show','close','engine','app.quit'],'discarding closes windows before stopping the engine, then quits');
  assert.equal(dialog.boxes.length,2);
  assert.equal(quitEvent().prevented,false,'once shut down, the real quit passes through');
  // 保存成功时不打扰用户。
  const quiet=[];
  const okWin={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,isCrashed:()=>false,send:(_channel,requestId)=>setImmediate(()=>smooth.prepared({id:requestId,ok:true}))}};
  const smooth=createQuitCoordinator({app:{quit:()=>quiet.push('app.quit')},dialog:fakeDialog(),getMainWindow:()=>okWin,showMainWindow:()=>quiet.push('show'),
    closeWindows:async()=>quiet.push('close'),stopEngine:async()=>quiet.push('engine')});
  smooth.beforeQuit({preventDefault(){}});await settle(10);
  assert.deepEqual(quiet,['close','engine','app.quit']);
}

// 主窗口：静默自启时从未显示，只有关掉 paintWhenInitiallyHidden，页面的 document.hidden 才为 true，前端才会暂停状态轮询。
{
  const {FakeWindow,windows}=fakeWindowClass(),opened=[],events=[];
  let quitting=false,trayAlive=true;
  const mainWindow=createMainWindow({BrowserWindow:FakeWindow,preload:'/app/preload.cjs',openExternal:url=>opened.push(url),
    onWorkspaceSaved:()=>events.push('saved'),onRendererGone:()=>events.push('gone'),canHideToTray:()=>trayAlive,isQuitting:()=>quitting,
    quit:()=>events.push('quit'),onSessionEnd:()=>events.push('session-end')});
  assert.equal(mainWindow.get(),null);
  const win=mainWindow.create(base);
  assert.equal(windows.length,1);assert.equal(mainWindow.get(),win);
  assert.equal(win.options.show,false);assert.equal(win.options.paintWhenInitiallyHidden,false);
  assert.deepEqual(win.options.webPreferences,{preload:'/app/preload.cjs',contextIsolation:true,nodeIntegration:false,sandbox:true});
  assert.equal(win.menuBar,false);
  const {session}=win.webContents;
  // 本机页面一律拒绝权限请求；CSP 只注入本应用的响应。
  let granted;session.permissionRequest(null,'media',value=>{granted=value;});assert.equal(granted,false);assert.equal(session.permissionCheck(),false);
  const headersFor=url=>{let result;session.headersReceived({url,responseHeaders:{'X-Test':['1']}},value=>{result=value.responseHeaders;});return result;};
  assert.deepEqual(headersFor(base+'/'),{'X-Test':['1'],'Content-Security-Policy':[contentSecurityPolicy]});
  assert.deepEqual(headersFor('https://szu.edu.cn/'),{'X-Test':['1']});
  // 主窗保存存档后通知专注提醒；别的请求不算。
  session.completed({method:'POST',statusCode:200,url:base+'/api/workspace'});
  session.completed({method:'GET',statusCode:200,url:base+'/api/workspace'});
  assert.deepEqual(events,['saved']);
  // 新窗口一律拒绝并交给外链分流；离开本应用的导航拦下并外开，重定向只拦不开。
  assert.deepEqual(win.webContents.openHandler({url:'https://course.feishu.cn/docx/A'}),{action:'deny'});
  const navigate=(name,url)=>{const event={prevented:false,preventDefault(){this.prevented=true;}};win.webContents.emit(name,event,url);return event.prevented;};
  assert.equal(navigate('will-navigate',base+'/#garden'),false);
  assert.equal(navigate('will-navigate','https://szu.edu.cn/'),true);
  assert.equal(navigate('will-redirect','https://evil.test/'),true);
  assert.equal(navigate('will-redirect',base+'/'),false);
  assert.deepEqual(opened,['https://course.feishu.cn/docx/A','https://szu.edu.cn/']);
  win.webContents.emit('render-process-gone');assert.equal(events.at(-1),'gone');
  // 关窗：有托盘就藏起来；没有托盘就退出；退出流程里放行。
  win.show();
  const close=()=>{const event={prevented:false,preventDefault(){this.prevented=true;}};win.emit('close',event);return event.prevented;};
  assert.equal(close(),true);assert.equal(win.visible,false);
  trayAlive=false;assert.equal(close(),false);assert.equal(events.at(-1),'quit');
  quitting=true;events.length=0;assert.equal(close(),false);assert.deepEqual(events,[]);
  win.emit('session-end');assert.deepEqual(events,['session-end']);
  // 宠物菜单指令：需要看页面的先把窗口带到前台，其余只转交页面。
  win.minimized=true;win.visible=false;
  mainWindow.command('pat');assert.equal(win.visible,false);assert.equal(win.webContents.last('szu:pet-command'),'pat');
  for(const command of FOREGROUND_COMMANDS){win.visible=false;mainWindow.command(command);assert.equal(win.visible,true,command);assert.equal(win.webContents.last('szu:pet-command'),command);}
  assert.equal(win.minimized,false);assert.equal(win.focused,true);
  mainWindow.send('szu:pet-scale',1.2);assert.equal(win.webContents.last('szu:pet-scale'),1.2);
  mainWindow.destroy();assert.equal(win.destroyed,true);assert.equal(mainWindow.get(),null,'closed clears the window');
  mainWindow.show();mainWindow.send('x',1);mainWindow.command('home');
}

// 所有 szu:* 通道先核对来源：伪造的来源一律拒绝，碰不到任何业务模块；pet:* 只认宠物窗。
{
  const ipc=new FakeIpcMain(),calls=[];let trusted=false,petSender=false;
  const record=name=>(...args)=>{calls.push([name,...args]);return name;};
  const school={open:record('school.open'),sync:record('school.sync'),clear:record('school.clear')},feishu={open:record('feishu.open')};
  const pet={scale:record('pet.scale'),applyScale:record('pet.applyScale'),showResult:async result=>{calls.push(['pet.showResult',result]);},
    isSender:()=>petSender,openMenu:async()=>{calls.push(['pet.openMenu']);},stepScale:record('pet.stepScale'),setHit:record('pet.setHit'),drag:record('pet.drag')};
  registerIpcRoutes({ipcMain:ipc,app:{quit:record('app.quit')},quit:{prepared:record('quit.prepared')},pet,
    preferences:{snapshot:record('preferences.snapshot'),apply:record('preferences.apply')},getOfficial:()=>({school,feishu}),
    isTrusted:()=>trusted,defer:fn=>fn()});
  assert.deepEqual([...ipc.handlers.keys()].sort(),[...TRUSTED_INVOKE_CHANNELS].sort(),'every invoke channel goes through the trusted gate');
  for(const channel of TRUSTED_INVOKE_CHANNELS)await assert.rejects(ipc.invoke(channel,{},'value'),/请求来源不匹配/,channel);
  ipc.emit('szu:quit-prepared',{},{id:1,ok:true});
  await ipc.emit('szu:pet-result',{},{ok:true,message:'好',action:'eat'});
  for(const [channel,...args] of [['pet:menu'],['pet:scale-step',1],['pet:hit',true],['pet:drag','start',{x:1,y:2}]])ipc.emit(channel,{},...args);
  assert.deepEqual(calls,[],'untrusted senders reach nothing');
  trusted=true;
  // 只把第一个参数交给业务模块，多余的参数丢掉。
  const routes=[['szu:quit',undefined,'app.quit',true],['szu:pet-scale-get',undefined,'pet.scale'],['szu:pet-scale-set',1.5,'pet.applyScale'],
    ['szu:desktop-settings-get',undefined,'preferences.snapshot'],['szu:desktop-settings-set',{doNotDisturb:true},'preferences.apply'],
    ['szu:school-open','undergrad','school.open'],['szu:school-sync','graduate','school.sync'],['szu:school-clear',undefined,'school.clear'],
    ['szu:feishu-open','https://course.feishu.cn/docx/A','feishu.open']];
  for(const [channel,value,target,result=target] of routes){
    calls.length=0;
    assert.equal(await ipc.invoke(channel,{},value,'extra'),result,channel);
    const noArgument=value===undefined&&target!=='school.clear';
    assert.deepEqual(calls,[noArgument?[target]:[target,value]],channel);
  }
  calls.length=0;
  ipc.emit('szu:quit-prepared',{},{id:3,ok:true});
  for(const bad of [null,{ok:'yes',message:'x'},{ok:true,message:3}])await ipc.emit('szu:pet-result',{},bad);
  await ipc.emit('szu:pet-result',{},{ok:true,message:'好',action:'eat'});
  assert.deepEqual(calls,[['quit.prepared',{id:3,ok:true}],['pet.showResult',{ok:true,message:'好',action:'eat'}]]);
  // 宠物窗通道只收宠物窗页面的消息，且参数必须是约定的类型。
  calls.length=0;
  for(const [channel,...args] of [['pet:menu'],['pet:scale-step',1],['pet:hit',true],['pet:drag','start',{x:1,y:2}]])ipc.emit(channel,{},...args);
  assert.deepEqual(calls,[],'pet channels ignore the main window');
  petSender=true;
  ipc.emit('pet:menu',{});
  for(const direction of [1,-1,2,'1',0.1])ipc.emit('pet:scale-step',{},direction);
  for(const inside of [true,false,'true',1,null])ipc.emit('pet:hit',{},inside);
  for(const point of [{x:1,y:2},{x:NaN,y:2},{x:1},null,'1,2'])ipc.emit('pet:drag',{},'move',point);
  assert.deepEqual(calls,[['pet.openMenu'],['pet.stepScale',1],['pet.stepScale',-1],['pet.setHit',true],['pet.setHit',false],['pet.drag','move',{x:1,y:2}]]);
}
console.log('Quit save, main window and IPC routes: persistence awaited, failure asked, forged replies rejected, bounded wait, crash/session shutdown, close order, hidden paint, CSP, navigation and trusted channels passed');
