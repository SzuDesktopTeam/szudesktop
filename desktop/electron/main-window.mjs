// 主窗口：只显示本机引擎的页面并注入 CSP，外部地址一律交给 openExternal 分流；
// 关窗时有托盘就藏到托盘。BrowserWindow 由 main.mjs 注入，其余事件都转成回调。
import {contentSecurityPolicy,isAppUrl} from './window-policy.mjs';
import {isWorkspaceSave} from './focus-notifications.mjs';

// 这些宠物菜单指令要看页面，先把主窗口带到前台；其余（摸摸头、喂食等）在后台执行。
export const FOREGROUND_COMMANDS=['home','garden','farm','study'];
export function createMainWindow({BrowserWindow,preload,smoke,openExternal,onWorkspaceSaved,onRendererGone,canHideToTray,isQuitting,quit,onSessionEnd}){
  let mainWin=null;
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
    wc.on('render-process-gone',()=>onRendererGone());
    win.on('close',event=>{
      if(!isQuitting()&&canHideToTray()){event.preventDefault();win.hide();}
      else if(!isQuitting())quit();
    });
    win.on('closed',()=>{mainWin=null;});
    win.on('session-end',()=>onSessionEnd());
    return win;
  }
  function show(){
    if(mainWin&&!mainWin.isDestroyed()){
      if(mainWin.isMinimized())mainWin.restore();
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
    mainWin.webContents.send('szu:pet-command',name);
  }
  function destroy(){if(mainWin&&!mainWin.isDestroyed())mainWin.destroy();}
  return {create,get:()=>mainWin,show,send,command,destroy};
}
