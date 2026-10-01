// 主窗口：只显示本机引擎的页面并注入 CSP，外部地址一律交给 openExternal 分流；
// 关窗时有托盘就藏到托盘。BrowserWindow 由 main.mjs 注入，其余事件都转成回调。
import {contentSecurityPolicy,isAppUrl} from './window-policy.mjs';
import {isWorkspaceSave} from './focus-notifications.mjs';

// 这些宠物菜单指令要看页面，先把主窗口带到前台；其余（摸摸头、喂食等）在后台执行。
export const FOREGROUND_COMMANDS=['home','garden','farm','study'];
// A hidden renderer still owns care saves. Wake it only until that request's
// acknowledgement; unrelated replies and duplicate clicks must not end a save.
export function createCommandWake({setThrottling,onTimeout=()=>{},schedule=setTimeout,cancel=clearTimeout}){
  let nextId=0;
  const pending=new Map();
  function finish(id){
    if(!pending.has(id))return;
    cancel(pending.get(id));pending.delete(id);
    if(!pending.size)setThrottling(true);
  }
  return {
    begin(){
      const id=++nextId;
      if(!pending.size)setThrottling(false);
      const timer=schedule(()=>{if(!pending.has(id))return;finish(id);onTimeout(id);},30000);timer.unref?.();
      pending.set(id,timer);return id;
    },
    finish,
    clear(){for(const id of [...pending.keys()])finish(id);},
  };
}
// activateApp：用户主动要看主窗口时先把整个应用带到前台（macOS 上菜单栏图标、程序坞菜单不会激活应用，只 show 窗口可能被别的应用挡住）；
// platform：macOS 全屏时关窗要先退出全屏。两者缺省时与 Windows 行为一致。
export function createMainWindow({BrowserWindow,preload,smoke,openExternal,onWorkspaceSaved,onRendererGone,canHideToTray,isQuitting,quit,onSessionEnd,
  activateApp=()=>{},platform,onCommandTimeout=()=>{}}){
  const mac=platform==='darwin';
  let mainWin=null;
  const wake=createCommandWake({onTimeout:onCommandTimeout,setThrottling:allowed=>{
    if(mainWin&&!mainWin.isDestroyed()&&!mainWin.webContents.isDestroyed())mainWin.webContents.setBackgroundThrottling(allowed);
  }});
  function create(baseUrl){
    // paintWhenInitiallyHidden:false：静默自启时窗口从未显示，页面里的 document.hidden 才是 true，
    // 前端据此暂停 30 秒一次的状态轮询；默认值会让隐藏的窗口照样按可见渲染。
    const win=new BrowserWindow({width:1200,height:820,minWidth:380,minHeight:480,show:false,paintWhenInitiallyHidden:false,title:'szuDesktop',
      webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    mainWin=win;
    win.setMenuBarVisibility(false);
    const wc=win.webContents;
    smoke?.watch(wc,{preload:'preload: ',console:''});
    wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    wc.session.setPermissionCheckHandler(()=>false);
    wc.session.webRequest.onHeadersReceived((details,callback)=>{
      const headers={...details.responseHeaders};
      if(isAppUrl(details.url,baseUrl))headers['Content-Security-Policy']=[contentSecurityPolicy];
      callback({responseHeaders:headers});
    });
    // 主窗保存存档（开始、取消或领取专注都在这里写）后，专注提醒按需重新读一次。
    wc.session.webRequest.onCompleted(details=>{if(isWorkspaceSave(details,baseUrl))onWorkspaceSaved();});
    wc.setWindowOpenHandler(({url})=>{openExternal(url);return {action:'deny'};});
    wc.on('will-navigate',(event,url)=>{if(!isAppUrl(url,baseUrl)){event.preventDefault();openExternal(url);}});
    wc.on('will-redirect',(event,url)=>{if(!isAppUrl(url,baseUrl))event.preventDefault();});
    wc.on('render-process-gone',()=>{wake.clear();onRendererGone();});
    win.on('close',event=>{
      if(!isQuitting()&&canHideToTray()){
        event.preventDefault();
        // macOS 全屏窗口直接 hide 会留下一块空的全屏桌面：先退出全屏，动画结束后再藏起来。
        if(mac&&win.isFullScreen()){win.once('leave-full-screen',()=>{if(!win.isDestroyed())win.hide();});win.setFullScreen(false);}
        else win.hide();
      }
      else if(!isQuitting())quit();
    });
    win.on('closed',()=>{wake.clear();mainWin=null;});
    win.on('session-end',()=>onSessionEnd());
    return win;
  }
  function show(){
    if(mainWin&&!mainWin.isDestroyed()){
      if(mainWin.isMinimized())mainWin.restore();
      activateApp();
      mainWin.show();mainWin.focus();
    }
  }
  function send(channel,payload){
    if(mainWin&&!mainWin.isDestroyed())mainWin.webContents.send(channel,payload);
  }
  // 宠物菜单和专注提醒的指令交给页面执行。
  function command(name){
    if(!mainWin||mainWin.isDestroyed())return;
    if(FOREGROUND_COMMANDS.includes(name))show();
    const requestId=mainWin.isVisible()?null:wake.begin();
    mainWin.webContents.send('szu:pet-command',requestId?{command:name,requestId}:name);
  }
  function destroy(){if(mainWin&&!mainWin.isDestroyed())mainWin.destroy();}
  return {create,get:()=>mainWin,show,send,command,commandFinished:result=>wake.finish(result?.requestId),destroy};
}
