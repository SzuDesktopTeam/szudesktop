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
// macOS 还要求应用已在「应用程序」文件夹里：从 DMG 或下载目录直接运行时登记的是临时位置，拖走之后登录项就失效了。
export const loginItemSupported = (platform,packaged,inApplications=true) => (platform==='win32'||platform==='darwin'&&inApplications)&&packaged;
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
  if(platform==='darwin')return macLoginItemControl(app);
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

// macOS 的登录项由 Electron 经 SMAppService 登记（需要 macOS 13），用户在「系统设置 → 通用 → 登录项与扩展」里的开关才是准的
// （macOS 15 起叫这个名字，13、14 上叫「登录项」，按新名字找也能对上）：
// 登记了但还没被允许时 status 为 requires-approval，登记的程序已不在原处时为 not-found，这两种都不算开启。
// 只写 openAtLogin：不传 path 和参数，静默启动改由 wasOpenedAtLogin 判断（见 openedAtLogin）。
// 没有需要修复的旧登记，repair 恒为 false。hint 给设置页显示原因：不在「应用程序」里、等待用户在系统设置里允许。
function macLoginItemControl(app) {
  const inApplications=Boolean(app.isInApplicationsFolder?.());
  const supported=loginItemSupported('darwin',app.isPackaged,inApplications);
  const status=()=>app.getLoginItemSettings().status;
  const get=()=>{
    if(!supported)return false;
    const state=app.getLoginItemSettings();
    return Boolean(state.openAtLogin&&state.status!=='requires-approval'&&state.status!=='not-found');
  };
  return {
    supported,
    get,
    get hint(){
      if(!inApplications)return 'not-in-applications';
      return supported&&status()==='requires-approval'?'requires-approval':undefined;
    },
    repair:async()=>false,
    set:enabled=>{
      if(!supported)throw Error(app.isPackaged?'请先把 szuDesktop 拖到「应用程序」文件夹，再从那里打开后开启':'开发模式不支持登录时启动');
      if(typeof enabled!=='boolean')throw Error('自启开关格式不正确');
      app.setLoginItemSettings({openAtLogin:enabled});
      if(enabled&&status()==='requires-approval')throw Error('macOS 需要你在「系统设置 → 通用 → 登录项与扩展」里允许 szuDesktop，允许后才会在登录时启动');
      const actual=get();
      if(actual!==enabled)throw Error('系统没有应用这次登录时启动设置，请检查「系统设置 → 通用 → 登录项与扩展」');
      return actual;
    },
  };
}
// 本次启动是不是登录时由系统拉起的（只在 macOS 上判断；Windows 的静默自启仍看 --autostart 参数）。
// platform 不给时按今天的行为返回 false，由 main.mjs 显式传 process.platform。
export function openedAtLogin(app,platform) {
  return platform==='darwin'&&Boolean(app.getLoginItemSettings().wasOpenedAtLogin);
}
// 注销时勾选了「重新登录时重新打开窗口」：登录后系统恢复会再启动一次应用，与登录项同时到达，
// 表现为紧跟着的 second-instance 或 activate。登录拉起后 windowMs 内的第一次这样的请求不弹主窗，之后照常。
// 返回的判定函数为 true 表示这次请求应当忽略；Windows 上恒为 false。
export function createLoginReopenGuard({platform,openedAtLogin,now=Date.now,windowMs=15000}={}) {
  const started=now();let used=false;
  return ()=>{
    if(platform!=='darwin'||!openedAtLogin||used||now()-started>=windowMs)return false;
    used=true;
    return true;
  };
}
