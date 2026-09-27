import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {APP_USER_MODEL_ID,loginItemOptions} from './desktop-settings.mjs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const builder=read('./electron-builder.yml');
const entries=builder.split('\n').filter(line=>!/^\s*#/.test(line)).join('\n');

// 界面只有简体中文：Chromium 语言包只留 zh-CN 和兜底的 en-US。
// electron-builder 26 在 removeUnusedLanguagesIfNeeded 里读取顶层 electronLanguages。
const languages=/^electronLanguages:\n((?: {2}- .+\n)+)/m.exec(entries);
assert.ok(languages,'electron-builder.yml must set top-level electronLanguages');
assert.deepEqual(languages[1].trim().split('\n').map(line=>line.replace(/^\s*-\s*/,'').trim()),['zh-CN','en-US']);

// 卸载清理开机自启：Run 值名是 AppUserModelId，main.mjs 把它设成与 appId 相同；
// 升级换目录时的修复也按同一个名字查询注册表。
const appId=/^appId: (\S+)$/m.exec(entries)?.[1];
assert.equal(appId,'com.szudesktop.app');
assert.equal(APP_USER_MODEL_ID,appId,'Run value name must match the installer APP_ID');
const main=read('./main.mjs');
assert.match(main,/app\.setAppUserModelId\(APP_USER_MODEL_ID\)/);
assert.match(main,/loginItems=createLoginItemControl\(app,\{name:APP_USER_MODEL_ID\}\)/,'the repair queries the same value name');
assert.ok(main.indexOf('app.setAppUserModelId(')<main.indexOf('loginItems=createLoginItemControl(app'),'AppUserModelId is set before any login item is written');
assert.equal(Object.hasOwn(loginItemOptions('C:/szuDesktop/szuDesktop.exe'),'name'),false,'login item keeps the default AppUserModelId value name');
assert.match(entries,/^nsis:\n(?: {2}.+\n)* {2}include: installer\.nsh\n/m,'NSIS include is wired into the nsis section');
assert.ok(existsSync(new URL('./installer.nsh',import.meta.url)));
const nsh=read('./installer.nsh');
const uninstall=/!macro customUnInstall\n([\s\S]*?)!macroend/.exec(nsh)?.[1];
assert.ok(uninstall,'installer.nsh defines customUnInstall');
const cleanup=/\$\{ifNot\} \$\{isUpdated\}\n([\s\S]*?)\$\{endIf\}/.exec(uninstall)?.[1];
assert.ok(cleanup,'upgrades keep the startup choice; only a real uninstall cleans up');
for(const key of ['Software\\Microsoft\\Windows\\CurrentVersion\\Run','Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run']){
  assert.ok(cleanup.includes(`DeleteRegValue HKCU "${key}" "\${APP_ID}"`),'uninstall removes '+key);
}
assert.doesNotMatch(nsh,/DeleteRegKey|HKLM|RMDir/,'uninstall cleanup only removes our own startup values');
// 安装包的 files 清单：从 package.json 的入口出发，沿静态 import、import('./…')、宠物页的脚本和 path.join(here,…) 引用的
// preload/页面走一遍，每个运行时要用的本地文件都必须列进 files（直接列出，或经 ../assets/garden 的 filter 映射到同一目录）。
// 主进程按职责拆成多个模块后，新增模块忘了进安装包会在这里失败，而不是装好后才启动不了。
const pkg=JSON.parse(read('./package.json'));
const filesSection=/^files:\n([\s\S]*?)^(?=\S)/m.exec(entries)?.[1];
assert.ok(filesSection,'electron-builder.yml lists files');
const directFiles=[...filesSection.matchAll(/^ {2}- ([\w.-]+)$/gm)].map(match=>match[1]);
const gardenFiles=/^ {2}- from: \.\.\/assets\/garden\n {4}to: \.\n {4}filter:\n((?: {6}- .+\n)+)/m.exec(filesSection)?.[1].trim().split('\n').map(line=>line.replace(/^\s*-\s*/,''));
assert.ok(gardenFiles?.length,'shared pet modules are mapped from ../assets/garden');
const packaged=new Map([...directFiles.map(name=>[name,new URL(name,import.meta.url)]),...gardenFiles.map(name=>[name,new URL('../assets/garden/'+name,import.meta.url)])]);
assert.equal(packaged.size,directFiles.length+gardenFiles.length,'a packaged name comes from exactly one place');
for(const [name,source] of packaged)assert.ok(existsSync(source),`${name} is listed but missing`);
const specifiers=source=>[...source.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"\n]+)['"]/g)].map(match=>match[1]);
const localReferences=source=>[
  ...specifiers(source).filter(specifier=>specifier.startsWith('./')).map(specifier=>specifier.slice(2)),
  ...[...source.matchAll(/path\.join\(here,'([\w.-]+)'\)/g)].map(match=>match[1]),
  ...[...source.matchAll(/\bsrc="\.\/([\w.-]+)"/g)].map(match=>match[1]),
];
const reached=new Set(),queue=[pkg.main];
while(queue.length){
  const name=queue.shift();
  if(reached.has(name))continue;
  reached.add(name);
  assert.ok(packaged.has(name),`${name} is used at runtime but missing from electron-builder.yml files`);
  if(!/\.(?:mjs|cjs|html)$/.test(name))continue;
  const source=readFileSync(packaged.get(name),'utf8');
  for(const specifier of specifiers(source))assert.ok(!specifier.startsWith('../'),`${name} imports ${specifier}; the package has no parent directory`);
  // 只有入口 main.mjs 直接 import electron；其余主进程模块由它注入，检查脚本才能用假对象导入它们。
  // 静态 import、import 'electron'、import('electron')、require('electron') 和 createRequire(...)('electron') 都算。
  if(name!==pkg.main&&name.endsWith('.mjs')){
    assert.ok(!specifiers(source).includes('electron')&&!/\(\s*['"]electron['"]\s*\)/.test(source),`${name} must receive electron from main.mjs`);
  }
  queue.push(...localReferences(source));
}
for(const name of ['app-paths.mjs','quit-coordinator.mjs','main-window.mjs','pet-controller.mjs','tray-menu.mjs','ipc-routes.mjs','official-windows.mjs','smoke-pet.mjs','preload.cjs','pet.html','pet-render.mjs','pet-preload.cjs','pet-player.mjs'])
  assert.ok(reached.has(name),`the runtime closure reaches ${name}`);
console.log('Packaging: Chinese/English Chromium locales, uninstall startup-entry cleanup and every runtime module listed in files passed');
