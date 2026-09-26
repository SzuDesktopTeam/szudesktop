// Electron-only preferences. No account information or garden save is stored here.
import {readFileSync, writeFileSync, renameSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

export const DESKTOP_DEFAULTS = Object.freeze({focusNotifications:true,doNotDisturb:false,petVisible:true,petAlwaysOnTop:true,lastNotifiedFocus:null});
const preferences = ['focusNotifications','doNotDisturb','petVisible','petAlwaysOnTop'];
export const desktopSettingsPath = userData => join(userData,'desktop-settings.json');

function normalize(raw) {
  const result={...DESKTOP_DEFAULTS};
  for(const key of preferences) if(typeof raw?.[key]==='boolean')result[key]=raw[key];
  if(typeof raw?.lastNotifiedFocus==='string'&&raw.lastNotifiedFocus.length<=80)result.lastNotifiedFocus=raw.lastNotifiedFocus;
  return result;
}
export function readDesktopSettings(userData) {
  try {
    const raw=JSON.parse(readFileSync(desktopSettingsPath(userData),'utf8'));
    return raw?.version===1?normalize(raw):{...DESKTOP_DEFAULTS};
  } catch {return {...DESKTOP_DEFAULTS};}
}
export function writeDesktopSettings(userData,value) {
  const settings=normalize(value),file=desktopSettingsPath(userData);
  mkdirSync(userData,{recursive:true});
  writeFileSync(file+'.tmp',JSON.stringify({version:1,...settings},null,2));
  renameSync(file+'.tmp',file);
  return settings;
}
export function validateDesktopPatch(patch) {
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('桌面设置格式不正确');
  for(const [key,value] of Object.entries(patch)) {
    if(![...preferences,'launchAtLogin'].includes(key)||typeof value!=='boolean')throw Error('桌面设置只能修改已提供的开关');
  }
  return {...patch};
}
export const loginItemSupported = (platform,packaged) => platform==='win32'&&packaged;
export const loginItemOptions = executable => ({path:executable,args:['--autostart']});
export const isQuietStartup = argv => argv.includes('--autostart');

// The OS is the source of truth. Reading never creates or rewrites a login item.
export function createLoginItemControl(app,{platform=process.platform,executable=process.execPath}={}) {
  const supported=loginItemSupported(platform,app.isPackaged);
  const options=loginItemOptions(executable);
  const get=()=>{
    if(!supported)return false;
    const state=app.getLoginItemSettings(options);
    return Boolean(state.openAtLogin&&state.executableWillLaunchAtLogin);
  };
  return {
    supported,
    get,
    set:enabled=>{
      if(!supported)throw Error('开机自启仅支持已安装的 Windows 桌面版');
      if(typeof enabled!=='boolean')throw Error('自启开关格式不正确');
      app.setLoginItemSettings({...options,openAtLogin:enabled,enabled});
      const actual=get();
      if(actual!==enabled)throw Error('系统没有应用这次自启设置，请检查 Windows 启动应用设置');
      return actual;
    },
  };
}
