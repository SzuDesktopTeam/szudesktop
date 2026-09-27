// 专注结束提醒的接线：focus-notifications.mjs 决定何时读存档、是否提醒，这里负责系统通知本身。
// 不再每 2 秒拉整份存档：只在需要提醒时读取，有进行中的专注时按结束时间定一次时，
// 主窗保存存档、提醒设置变化和宠物 30 秒刷新（复用同一份存档）时再看一眼。
import {createFocusNotifier,createFocusScheduler,FOCUS_RECHECK_MAX_MS} from './focus-notifications.mjs';

// 专注也可能在主窗以外开始（复用的便携版引擎、便携版为本机引擎打开的浏览器页），主窗看不到那次保存：
// 没有进行中的专注时也按 idleRecheckMs 复查一次。宠物可见时它的 30 秒刷新会顺延这次复查，不额外读取。
export function createFocusReminders({Notification,loadWorkspace,readSettings,saveSettings,isSupported,icon,onClick,
  idleRecheckMs=FOCUS_RECHECK_MAX_MS,now,setTimer,clearTimer}){
  let focusNotifier=null,focusScheduler=null,focusNotification=null;
  function start(){
    focusNotifier=createFocusNotifier({
      loadWorkspace,readSettings,saveSettings,isSupported,now,
      notify:({duration})=>{
        focusNotification?.close();
        const notification=new Notification({title:'这一段专注完成了',body:`你设定的 ${duration} 分钟已经结束。点这里回到学习工具领取奖励。`,icon});
        focusNotification=notification;
        notification.on('click',()=>onClick());
        notification.on('close',()=>{if(focusNotification===notification)focusNotification=null;});
        notification.on('failed',()=>{if(focusNotification===notification)focusNotification=null;});
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
