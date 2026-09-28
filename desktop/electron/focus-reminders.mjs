// 专注结束提醒的接线：focus-notifications.mjs 决定何时读存档、是否提醒，这里负责系统通知本身。
// 不再每 2 秒拉整份存档：只在需要提醒时读取，有进行中的专注时按结束时间定一次时，
// 主窗保存存档、提醒设置变化和宠物 30 秒刷新（复用同一份存档）时再看一眼。
import {createFocusNotifier,createFocusScheduler,FOCUS_RECHECK_MAX_MS} from './focus-notifications.mjs';

// 专注也可能在主窗以外开始（复用的便携版引擎、便携版为本机引擎打开的浏览器页），主窗看不到那次保存：
// 没有进行中的专注时也按 idleRecheckMs 复查一次。宠物可见时它的 30 秒刷新会顺延这次复查，不额外读取。
// icon 为 undefined 时不带 icon 键（macOS 用 .app 自己的图标）。onFailed 只有 macOS 接：通知没授权或发不出去时换个方式提醒；
// 没传时 failed 的处理与原来一字不差，Windows 的 toast 失败不会多出任何动作。
export function createFocusReminders({Notification,loadWorkspace,readSettings,saveSettings,isSupported,icon,onClick,onFailed,
  idleRecheckMs=FOCUS_RECHECK_MAX_MS,now,setTimer,clearTimer}){
  let focusNotifier=null,focusScheduler=null,focusNotification=null;
  function start(){
    focusNotifier=createFocusNotifier({
      loadWorkspace,readSettings,saveSettings,isSupported,now,
      notify:({duration})=>{
        focusNotification?.close();
        const notification=new Notification({title:'这一段专注完成了',body:`你设定的 ${duration} 分钟已经结束。点这里回到学习工具领取奖励。`,...(icon===undefined?{}:{icon})});
        focusNotification=notification;
        notification.on('click',()=>onClick());
        notification.on('close',()=>{if(focusNotification===notification)focusNotification=null;});
        notification.on('failed',()=>{if(focusNotification===notification)focusNotification=null;});
        if(typeof onFailed==='function')notification.on('failed',(_event,error)=>onFailed(error));
        notification.show();
      },
    });
    focusScheduler=createFocusScheduler({notifier:focusNotifier,loadWorkspace,readSettings,isSupported,idleRecheckMs,now,setTimer,clearTimer});
    void focusScheduler.start();
  }
  // 关闭提醒或开启勿扰时，已经弹出的通知一并收起。
  function settingsChanged(){
    const settings=readSettings();
    if((!settings.focusNotifications||settings.doNotDisturb)&&focusNotification)focusNotification.close();
    focusScheduler?.settingsChanged();
  }
  function stop(){focusScheduler?.stop();focusNotifier?.stop();focusNotification?.close();}
  return {start,settingsChanged,observe:snapshot=>focusScheduler?.observe(snapshot),workspaceSaved:()=>focusScheduler?.workspaceSaved(),stop};
}
