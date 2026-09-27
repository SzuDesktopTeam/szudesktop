import {isFeishuDocumentURL,isFeishuPermissionAllowed,isOfficialFeishuURL} from './feishu-policy.mjs';
import {isSafeExternalUrl} from './external-url.mjs';
import {isNavigationAbort} from './window-policy.mjs';

// This is the official editor, not a token bridge. Its in-memory profile is
// separate from school windows, the local application and the user's CLI.
// electron 的 BrowserWindow/Menu/dialog/session/shell 由 main.mjs 注入（经 official-windows.mjs），检查脚本用假对象代替。
export function createFeishuWindow({BrowserWindow,Menu,dialog,session,shell}){
  let window=null,loading=null,lastTarget=null;
  const profile=session.fromPartition('szu-feishu-official',{cache:false});
  // 只给飞书官方页面放行复制和全屏，其余权限仍然拒绝。
  profile.setPermissionRequestHandler((wc,permission,done,details)=>done(isFeishuPermissionAllowed(permission,details?.requestingUrl,wc?.getURL?.())));
  profile.setPermissionCheckHandler((_wc,permission,requestingOrigin,details)=>isFeishuPermissionAllowed(permission,requestingOrigin,details?.embeddingOrigin));
  function showError(blocked){
    let origin='';try{origin=blocked?new URL(blocked).origin:'';}catch{}
    dialog.showErrorBox('飞书页面暂时无法打开',blocked
      ?`页面跳转到了飞书官方域名以外的地址${origin&&origin!=='null'?`（${origin}）`:''}，常见于学校或企业的单点登录，应用内的飞书窗口不会打开它。请通过窗口菜单在系统浏览器打开。`
      :'请检查网络，或通过窗口菜单在系统浏览器打开。');
  }
  function external(url){if(isSafeExternalUrl(url))void shell.openExternal(url).catch(()=>showError());}
  // 每次 loadURL 单独记录期间被拦下的重定向：只有不是我们自己拦截的 ERR_ABORTED 才是登录等正常跳转。
  function navigate(win,url){
    if(!isOfficialFeishuURL(url))return;
    const attempt={blocked:null};
    loading=attempt;lastTarget=url;
    const done=()=>{if(loading===attempt)loading=null;};
    void win.loadURL(url).then(done,error=>{
      done();
      if(attempt.blocked||!isNavigationAbort(error))showError(attempt.blocked);
    });
  }
  function ensureWindow(){
    if(window&&!window.isDestroyed())return window;
    const win=new BrowserWindow({width:1180,height:840,minWidth:520,minHeight:520,title:'课程共学 · 飞书官方页面',
      webPreferences:{session:profile,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    window=win;
    const wc=win.webContents;
    // Official login and document navigation stay here. External links use the
    // system browser; remote pages can never create a privileged child window.
    wc.on('will-navigate',(event,url)=>{if(!isOfficialFeishuURL(url)){event.preventDefault();external(url);}});
    // 拦下主框架的重定向也会让进行中的 loadURL 以 ERR_ABORTED 结束，记下来给出说明。
    wc.on('will-redirect',(event,url)=>{
      if(isOfficialFeishuURL(url))return;
      event.preventDefault();
      if(event.isMainFrame!==false&&loading)loading.blocked=url;
    });
    wc.setWindowOpenHandler(({url})=>{if(isOfficialFeishuURL(url))navigate(win,url);else external(url);return {action:'deny'};});
    wc.on('page-title-updated',event=>event.preventDefault());
    wc.on('did-navigate',(_event,url)=>{if(isOfficialFeishuURL(url))win.setTitle(new URL(url).hostname+' · 飞书官方页面');});
    win.on('closed',()=>{if(window===win)window=null;});
    win.setMenu(Menu.buildFromTemplate([{label:'课程共学',submenu:[
      {label:'返回',click:()=>{if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();}},
      {label:'刷新',accelerator:'CmdOrCtrl+R',click:()=>wc.reload()},
      // 加载被中止时窗口里可能还没有飞书地址，改开最近一次请求的课程文档。
      {label:'在系统浏览器打开',click:()=>{const current=wc.getURL(),url=isOfficialFeishuURL(current)?current:lastTarget;if(url)external(url);}},
      {type:'separator'},{label:'关闭飞书窗口',click:()=>win.close()},
    ]}]));
    return win;
  }
  async function open(url){
    if(!isFeishuDocumentURL(url))throw Error('请选择飞书或 Lark 官方课程文档链接');
    const win=ensureWindow();
    win.show();win.focus();
    if(win.webContents.getURL()!==url)navigate(win,url);
    return {ok:true};
  }
  async function shutdown(){
    if(window&&!window.isDestroyed())window.destroy();
    await profile.clearStorageData();
    await profile.clearCache();
  }
  return {open,shutdown};
}
