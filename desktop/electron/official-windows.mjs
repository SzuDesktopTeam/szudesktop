// 学校与飞书官方页面的接线：主窗里点开的外部地址按域名分流到各自隔离的窗口，其余安全链接交给系统浏览器；
// 退出时关闭两者并清掉会话。electron 对象由 main.mjs 注入，再原样交给两个窗口模块。
import {createSchoolWindows} from './school-window.mjs';
import {isSchoolURL} from './school-policy.mjs';
import {createFeishuWindow} from './feishu-window.mjs';
import {isFeishuDocumentURL} from './feishu-policy.mjs';
import {isSafeExternalUrl} from './external-url.mjs';

// reportSchoolCleanup：学校会话清不掉时是否提示用户（复用便携版的引擎时会话留在对方进程里；冒烟测试不弹框）。
// onWindowMenu、platform 原样交给两个窗口模块（macOS 上菜单项进应用菜单的「页面」一栏）；缺省时与 Windows 行为一致。
export function createOfficialWindows({BrowserWindow,Menu,dialog,session,shell,getBaseURL,getToken,isQuitting,reportSchoolCleanup,onWindowMenu,platform}){
  const electron={BrowserWindow,Menu,dialog,session,shell,onWindowMenu,platform};
  const schoolWindows=createSchoolWindows(getBaseURL,getToken,electron);
  const feishuWindow=createFeishuWindow(electron);
  function openExternal(url){
    if(isFeishuDocumentURL(url)){
      void feishuWindow.open(url).catch(()=>dialog.showErrorBox('飞书页面暂时无法打开','请检查网络，或在系统浏览器打开课程文档。'));
      return;
    }
    if(isSchoolURL(url)){
      void schoolWindows.open(url).catch(()=>dialog.showErrorBox('学校页面暂时无法打开',platform==='darwin'?'请检查校园网或 WebVPN；可通过菜单栏的「页面」菜单在系统浏览器中打开。'
        :'请检查校园网或 WebVPN；可通过学校窗口菜单在系统浏览器中打开。'));
      return;
    }
    if(isSafeExternalUrl(url)) void shell.openExternal(url).catch(()=>{
      if(!isQuitting())dialog.showErrorBox('未能打开浏览器','请检查系统默认浏览器设置后重试。');
    });
  }
  async function shutdown(){
    try{await schoolWindows.shutdown();}
    catch{if(reportSchoolCleanup())dialog.showErrorBox('学校登录未能清除','请在仍运行的便携版中清除学校登录，或退出该后台服务。');}
    try{await feishuWindow.shutdown();}catch{} // The session is memory-only and expires with Electron.
  }
  return {school:schoolWindows,feishu:feishuWindow,openExternal,shutdown};
}
