// 安装版与开发目录下的文件位置，以及启动 sidecar 的命令行。
// 不 import electron：main.mjs 把 app.isPackaged、process.resourcesPath 等传进来，检查脚本可以直接调用。
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {sidecarArgs} from './desktop-settings.mjs';

// 安装版把庭院引擎入口复制成 resources/garden-engine.mjs（garden-engine-deps.mjs 的 GARDEN_ENGINE_RESOURCE）。
export const GARDEN_ENGINE_FILE='garden-engine.mjs';
export function appPaths({isPackaged,resourcesPath,here,platform}){
  const exe=platform==='win32'?'szudesktop-windows-amd64.exe':'szudesktop';
  return {
    isPackaged,
    // 菜单与主界面共用同一份庭院规则，包含离线成长；打包时直接复制源模块。
    gardenEngine:isPackaged?path.join(resourcesPath,GARDEN_ENGINE_FILE):path.resolve(here,'..','assets','garden','engine.mjs'),
    sidecar:isPackaged?path.join(resourcesPath,exe):path.resolve(here,'..','..','dist',exe),
    // 安装版的版本号由 build.mjs 注入 package.json 的 szuVersion；开发时读仓库唯一的 VERSION。
    version:isPackaged?path.join(here,'package.json'):path.resolve(here,'..','..','internal','version','VERSION'),
    // 托盘、专注提醒共用的图标；开发/打包路径解析方式与 sidecar 一致。
    icon:isPackaged?path.join(resourcesPath,'szudesktop.ico'):path.resolve(here,'..','assets','szudesktop.ico'),
    mainPreload:path.join(here,'preload.cjs'),
    petHtml:path.join(here,'pet.html'),
    petPreload:path.join(here,'pet-preload.cjs'),
  };
}
// 开发模式把 Go 的 stderr 转发到终端；安装版没有控制台，只在启动失败时取原因。
export function sidecarCommand(paths,{smoke,autoConnectCampus,stderr,read=file=>readFileSync(file,'utf8')}={}){
  const expectedVersion=paths.isPackaged?JSON.parse(read(paths.version)).szuVersion:read(paths.version).trim();
  if(typeof expectedVersion!=='string'||!/^(?:beta|v)?\d+\.\d+\.\d+$/.test(expectedVersion))throw Error('应用版本信息缺失，请重新安装当前版本');
  return {command:paths.sidecar,args:sidecarArgs({smoke,autoConnectCampus}),expectedVersion,stderrTo:paths.isPackaged?undefined:stderr};
}
