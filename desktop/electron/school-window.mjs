import {academicCookies,isSchoolURL,schoolTargets} from './school-policy.mjs';
import {isNavigationAbort} from './window-policy.mjs';

// No persist: prefix: school cookies/cache disappear when the app exits.
// getToken 返回 sidecar 交来的本次运行凭据：主进程调本机服务不经过页面 Cookie，要自己带请求头。
// electron 的 BrowserWindow/Menu/dialog/session/shell 由 main.mjs 注入（经 official-windows.mjs），检查脚本用假对象代替。
export function createSchoolWindows(getBaseURL,getToken,{BrowserWindow,Menu,dialog,session,shell,fetch:request=globalThis.fetch}){
  let window=null,imported=false,loading=null,lastTarget=null;
  const profile=session.fromPartition('szu-official',{cache:false});
  profile.setPermissionRequestHandler((_wc,_permission,done)=>done(false));
  profile.setPermissionCheckHandler(()=>false);
  async function local(endpoint,body,method='POST'){
    const response=await request(getBaseURL()+endpoint,{method,headers:{'Content-Type':'application/json','X-SZU-Token':getToken()},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(!response.ok)throw Error(result.message||result.error||'学校登录尚未完成，请在学校页面登录后重试');
    return result;
  }
  async function clear(){
    // Close remote pages first so their scripts cannot refresh a cleared session.
    if(window&&!window.isDestroyed())window.destroy();
    await profile.clearStorageData();
    await profile.clearCache();
    await local('/api/academic/browser-session?scope=all',undefined,'DELETE');
    imported=false;
    return {ok:true,message:'学校窗口和本次教务登录已清除'};
  }
  async function open(target){
    const url=schoolTargets[target]||target;
    if(!isSchoolURL(url))throw Error('不支持的学校页面');
    if(!window||window.isDestroyed()){
      window=new BrowserWindow({width:1100,height:820,minWidth:420,minHeight:520,title:'学校官方页面 · szuDesktop',
        webPreferences:{session:profile,contextIsolation:true,nodeIntegration:false,sandbox:true}});
      const win=window,wc=win.webContents;
      // The school keeps its own HTML/CSP and handles CAPTCHA, MFA and booking.
      wc.on('will-navigate',(event,url)=>{if(!isSchoolURL(url))event.preventDefault();});
      // 拦下主框架的重定向也会让进行中的 loadURL 以 ERR_ABORTED 结束，记下来，不能当成正常跳转静默。
      wc.on('will-redirect',(event,url)=>{
        if(isSchoolURL(url))return;
        event.preventDefault();
        if(event.isMainFrame!==false&&loading)loading.blocked=url;
      });
      wc.setWindowOpenHandler(({url})=>{if(isSchoolURL(url))void open(url).catch(showError);return {action:'deny'};});
      wc.on('page-title-updated',event=>event.preventDefault());
      wc.on('did-navigate',(_event,url)=>win.setTitle(new URL(url).hostname+' · 学校官方页面'));
      win.on('closed',()=>{if(window===win)window=null;});
      win.setMenu(Menu.buildFromTemplate([{label:'学校页面',submenu:[
        {label:'返回',click:()=>{if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();}},
        {label:'前进',click:()=>{if(wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();}},
        {label:'刷新',accelerator:'CmdOrCtrl+R',click:()=>wc.reload()},
        // 加载被中止时窗口里可能还没有学校地址，改开最近一次请求的学校页面。
        {label:'在系统浏览器打开',click:()=>{const current=wc.getURL(),url=isSchoolURL(current)?current:lastTarget;if(url)void shell.openExternal(url).catch(showError);}},
        {type:'separator'},
        {label:'清除本次学校登录',click:()=>void clear().catch(showError)},
        {label:'关闭学校窗口',click:()=>win.close()},
      ]}]));
    }
    window.show();window.focus();
    if(window.webContents.getURL()!==url)load(window,url);
    return {ok:true};
  }
  // 每次 loadURL 单独记录期间被拦下的重定向：只有不是我们自己拦截的 ERR_ABORTED 才是页面正常跳转。
  function load(win,url){
    const attempt={blocked:null};
    loading=attempt;lastTarget=url;
    const done=()=>{if(loading===attempt)loading=null;};
    void win.loadURL(url).then(done,error=>{
      done();
      if(attempt.blocked)showError(error,attempt.blocked);
      else if(!isNavigationAbort(error))showError(error);
    });
  }
  function showError(error,blocked){
    if(blocked){
      let origin='';try{origin=new URL(blocked).origin;}catch{}
      dialog.showErrorBox('学校页面暂时无法打开',`页面跳转到了应用内不允许打开的地址${origin&&origin!=='null'?`（${origin}）`:''}，已停止加载。请检查校园网或 WebVPN；也可通过学校窗口菜单在系统浏览器中打开。`);
      return;
    }
    const code=/^ERR_[A-Z_]+$/.test(error?.code||'')?`\n错误代码：${error.code}`:'';
    dialog.showErrorBox('学校页面暂时无法打开','请检查校园网或 WebVPN；也可通过学校窗口菜单在系统浏览器中打开。'+code);
  }
  async function sync(business){
    if(!Object.hasOwn(schoolTargets,business)||business==='booking')throw Error('请选择课表或成绩业务');
    const cookies=academicCookies(await profile.cookies.get({}));
    // An empty browser session also replaces the selected account. Let Go clear
    // its previous session before reporting that the user needs to log in.
    imported=true;
    return local('/api/academic/browser-session',{business,cookies});
  }
  function destroy(){if(window&&!window.isDestroyed())window.destroy();}
  async function shutdown(){destroy();if(imported)await local('/api/academic/browser-session',undefined,'DELETE');}
  return {open,sync,clear,destroy,shutdown};
}
