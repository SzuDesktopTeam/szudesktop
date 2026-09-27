import {BrowserWindow,Menu,dialog,session,shell} from 'electron';
import {isFeishuDocumentURL,isOfficialFeishuURL} from './feishu-policy.mjs';
import {isSafeExternalUrl} from './external-url.mjs';

// This is the official editor, not a token bridge. Its in-memory profile is
// separate from school windows, the local application and the user's CLI.
export function createFeishuWindow(){
  let window=null;
  const profile=session.fromPartition('szu-feishu-official',{cache:false});
  profile.setPermissionRequestHandler((_wc,_permission,done)=>done(false));
  profile.setPermissionCheckHandler(()=>false);
  function showError(){dialog.showErrorBox('飞书页面暂时无法打开','请检查网络，或通过窗口菜单在系统浏览器打开。');}
  function external(url){if(isSafeExternalUrl(url))void shell.openExternal(url).catch(showError);}
  function navigate(win,url){if(isOfficialFeishuURL(url))void win.loadURL(url).catch(showError);}
  function ensureWindow(){
    if(window&&!window.isDestroyed())return window;
    const win=new BrowserWindow({width:1180,height:840,minWidth:520,minHeight:520,title:'课程共学 · 飞书官方页面',
      webPreferences:{session:profile,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    window=win;
    const wc=win.webContents;
    // Official login and document navigation stay here. External links use the
    // system browser; remote pages can never create a privileged child window.
    wc.on('will-navigate',(event,url)=>{if(!isOfficialFeishuURL(url)){event.preventDefault();external(url);}});
    wc.on('will-redirect',(event,url)=>{if(!isOfficialFeishuURL(url))event.preventDefault();});
    wc.setWindowOpenHandler(({url})=>{if(isOfficialFeishuURL(url))navigate(win,url);else external(url);return {action:'deny'};});
    wc.on('page-title-updated',event=>event.preventDefault());
    wc.on('did-navigate',(_event,url)=>{if(isOfficialFeishuURL(url))win.setTitle(new URL(url).hostname+' · 飞书官方页面');});
    win.on('closed',()=>{if(window===win)window=null;});
    win.setMenu(Menu.buildFromTemplate([{label:'课程共学',submenu:[
      {label:'返回',click:()=>{if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();}},
      {label:'刷新',accelerator:'CmdOrCtrl+R',click:()=>wc.reload()},
      {label:'在系统浏览器打开',click:()=>{const url=wc.getURL();if(isOfficialFeishuURL(url))external(url);}},
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
