// 桌面设置在主进程里的唯一副本：主窗设置页、托盘和宠物菜单都经这里修改，
// 改完依次同步到宠物窗与专注提醒（applyEffects）、托盘勾选（refreshTray）和主窗页面（publish）。
// 文件读写和字段校验在 desktop-settings.mjs；Notification、dialog 由 main.mjs 注入。
import {DESKTOP_DEFAULTS,validateDesktopPatch,writeDesktopSettings} from './desktop-settings.mjs';

export function createDesktopPreferences({Notification,dialog,getUserData,applyEffects,refreshTray,publish,write=writeDesktopSettings}){
  let desktopPreferences={...DESKTOP_DEFAULTS},loginItems=null;
  // 启动时载入已保存的偏好和开机自启控制；在此之前一律按默认值。
  function load(preferences,control){desktopPreferences=preferences;loginItems=control;}
  // macOS 的登录项控制会给出开不了的原因（不在「应用程序」里、等待系统设置里允许），设置页据此提示；没有原因时不带这个键。
  function desktopSettingsSnapshot(){
    const {lastNotifiedFocus,...preferences}=desktopPreferences;
    const hint=loginItems?.hint;
    return {...preferences,launchAtLogin:loginItems?.get()||false,launchAtLoginSupported:Boolean(loginItems?.supported),notificationsSupported:Notification.isSupported(),
      ...(hint?{launchAtLoginHint:hint}:{})};
  }
  function saveDesktopPreferences(value){
    desktopPreferences=write(getUserData(),value);
  }
  function applyDesktopSettings(value){
    const patch=validateDesktopPatch(value),{launchAtLogin,...preferences}=patch;
    if(Object.hasOwn(patch,'launchAtLogin'))loginItems.set(launchAtLogin);
    if(Object.keys(preferences).length)saveDesktopPreferences({...desktopPreferences,...preferences});
    applyEffects(desktopPreferences);
    refreshTray();
    const result=desktopSettingsSnapshot();
    publish(result);
    return result;
  }
  function changeDesktopSettings(patch){
    try{applyDesktopSettings(patch);}catch(error){refreshTray();dialog.showErrorBox('桌面设置未能保存',error.message);}
  }
  return {load,current:()=>desktopPreferences,snapshot:desktopSettingsSnapshot,save:saveDesktopPreferences,apply:applyDesktopSettings,change:changeDesktopSettings};
}
