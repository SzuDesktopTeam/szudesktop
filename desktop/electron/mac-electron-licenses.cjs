// electron-builder 的 afterExtract 钩子，只由 build-mac.mjs 的临时配置接入（build.mjs 和 electron-builder.yml 都不引用它）。
// 为什么要有它：Windows 上 electron-builder 把 Electron 自带的 LICENSE 改名成 LICENSE.electron.txt，和 LICENSES.chromium.html
// 一起留在安装目录；macOS 上这两份文件解压在 .app 外面的输出目录里，DMG 只装 .app，用户拿到的包里就没有 Electron 与 Chromium 的许可。
// 这里趁 .app 还叫 Electron.app（改名、拷资源、签名都在这之后）把两份复制进 Contents/Resources/licenses，随外层签名一起封进去。
// 用 .cjs：electron-builder 先 require 钩子，package.json 的 "type":"module" 不影响这个扩展名。
const fs=require('node:fs');
const path=require('node:path');

module.exports=async function afterExtract(context){
  // 只管 macOS 的包；万一被别的平台的配置引用，也原样返回，不碰 Windows / Linux 的输出目录。
  if(context?.electronPlatformName!=='darwin')return;
  const appName=context.packager?.info?.framework?.distMacOsAppName||'Electron.app';
  const licenses=path.join(context.appOutDir,appName,'Contents','Resources','licenses');
  fs.mkdirSync(licenses,{recursive:true});
  // 缺文件就让打包失败，不出一个少了许可文件的 DMG。
  for(const [from,to] of [['LICENSE','LICENSE.electron.txt'],['LICENSES.chromium.html','LICENSES.chromium.html']]){
    fs.copyFileSync(path.join(context.appOutDir,from),path.join(licenses,to));
  }
};
