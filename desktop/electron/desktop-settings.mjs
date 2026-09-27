// Electron-only preferences. No account information or garden save is stored here.
import {readFileSync, writeFileSync, renameSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';

// autoConnectCampus 默认开启：安装版启动时用已记住的账号连接一次校园网（已在线时跳过）；用户可在设置中关闭。
export const DESKTOP_DEFAULTS = Object.freeze({focusNotifications:true,doNotDisturb:false,petVisible:true,petAlwaysOnTop:true,autoConnectCampus:true,lastNotifiedFocus:null});
const preferences = ['focusNotifications','doNotDisturb','petVisible','petAlwaysOnTop','autoConnectCampus'];
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
// 启动 sidecar 的参数：除非用户开启了“启动时自动连接校园网”，一律不自动登录；冒烟测试永远不登录。
// 设置在下次启动 sidecar 时生效。
export const sidecarArgs = ({smoke=false,autoConnectCampus=false}={}) => ['--no-open',...(smoke||autoConnectCampus!==true?['--no-auto-login']:[])];

// Windows 上开机自启的 Run 值和任务管理器里的启用状态（StartupApproved）都以 AppUserModelId 命名；
// main.mjs 启动时设置它，与 electron-builder.yml 的 appId 相同，卸载脚本按同名清理。
export const APP_USER_MODEL_ID='com.szudesktop.app';
export const RUN_KEY='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const STARTUP_APPROVED_KEY='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
// 只读查询单个注册表值：存在时返回 reg.exe 的输出，不存在或查询失败时返回 null。
// 路径按系统代码页输出，这里不解析路径，只用退出码和 ASCII 的类型与十六进制数据。
export function queryRegistryValue(key,name) {
  return new Promise(resolve=>execFile('reg',['query',key,'/v',name],{windowsHide:true,timeout:5000},(error,stdout)=>resolve(error?null:String(stdout))));
}
// StartupApproved 首字节为偶数（02/06）表示启用，奇数（03/07）表示在任务管理器里停用；没有这个值视为启用。
export function startupApprovedEnabled(output) {
  const match=/REG_BINARY\s+([0-9A-Fa-f]{2})/.exec(output||'');
  return !match||(parseInt(match[1],16)&1)===0;
}

// The OS is the source of truth. Reading never creates or rewrites a login item.
export function createLoginItemControl(app,{platform=process.platform,executable=process.execPath,name=APP_USER_MODEL_ID,query=queryRegistryValue}={}) {
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
    // 升级时换了安装目录：同名 Run 值仍指向已删除的旧程序，登录时启动不了，设置页也显示为关闭。
    // 只在确实登记过（同名值存在）而命令对不上时按当前程序重写一次，并保留任务管理器里的启用状态；
    // 从未开启自启的用户不会被登记。
    repair:async()=>{
      if(!supported||app.getLoginItemSettings(options).openAtLogin)return false;
      if(await query(RUN_KEY,name)===null)return false;
      const enabled=startupApprovedEnabled(await query(STARTUP_APPROVED_KEY,name));
      app.setLoginItemSettings({...options,openAtLogin:true,enabled});
      return true;
    },
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
