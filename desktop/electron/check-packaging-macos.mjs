// macOS 打包配置的静态检查：electron-builder.yml 的 mac / dmg / win 段、build-mac.mjs 的关键约定、afterExtract 许可钩子、
// package.json 与 Makefile 的入口，以及 DMG 用到的图标素材。只用 Node 内置模块，不装依赖、不打包，三个平台的 CI 都能跑。
// 为什么要有它：引擎放在哪、叫什么、谁来签，分散在 yml、build-mac.mjs 和 app-paths.mjs 三处，任何一处改了而另外两处没跟上，
// 包照样打得出来，装好后却找不到引擎或签名校验失败；这里把三处对在一起。真正打出来的包由 build-mac.mjs 的打后断言和 smoke_dmg.py 核对。
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {appPaths,MAC_TRAY_ICON_FILE} from './app-paths.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const read=file=>readFileSync(path.resolve(here,file),'utf8').replace(/\r\n/g,'\n');
const builder=read('electron-builder.yml');
const entries=builder.split('\n').filter(line=>!/^\s*#/.test(line)).join('\n')+'\n';
const buildMac=read('build-mac.mjs');
const buildWin=read('build.mjs');

// 取 yml 里某个键下面缩进更深的那一段（本仓库的 yml 只用两格缩进的映射和列表）。
function block(text,key,indent=''){
  const lines=text.split('\n');
  const start=lines.indexOf(indent+key+':');
  if(start<0)return null;
  const body=[];
  for(const line of lines.slice(start+1)){
    if(line.trim()&&!line.startsWith(indent+'  '))break;
    body.push(line);
  }
  return body.join('\n')+'\n';
}
const scalar=(text,key,indent)=>new RegExp(`^${indent}${key}: (.+)$`,'m').exec(text)?.[1];
const list=text=>[...text.matchAll(/^\s*- (.+)$/gm)].map(match=>match[1]);
const fileSets=text=>[...text.matchAll(/^\s*- from: (.+)\n\s+to: (.+)$/gm)].map(match=>({from:match[1],to:match[2]}));
const posix=file=>file.split(path.sep).join('/');

// ───────────── yml：引擎不在顶层；Windows 的在 win 段，文件名与 app-paths 解析的一致 ─────────────
const topResources=block(entries,'extraResources');
assert.ok(topResources,'electron-builder.yml has top-level extraResources');
assert.doesNotMatch(topResources,/szudesktop-(?:windows|darwin|engine)|dist\//,'no engine in top-level extraResources: it would land in every platform package');
assert.doesNotMatch(entries,/^\s*extraFiles:/m,'the macOS engine is injected per arch by build-mac.mjs, not listed in the yml');
const win=block(entries,'win');
assert.ok(win,'electron-builder.yml has a win section');
const winEngine=fileSets(block(win,'extraResources','  ')??'');
assert.deepEqual(winEngine,[{from:'../../dist/szudesktop-windows-amd64.exe',to:'szudesktop-windows-amd64.exe'}],'win.extraResources carries exactly the Windows engine');
const winPaths=appPaths({platform:'win32',isPackaged:true,resourcesPath:path.join(os.tmpdir(),'szuDesktop','resources'),here:path.join(os.tmpdir(),'szuDesktop','resources','app.asar')});
assert.equal(path.basename(winPaths.sidecar),winEngine[0].to,'the installed Windows app starts the engine the package ships');

// ───────────── yml 的 mac 段：dmg、ad-hoc、无硬化运行时、语言、签名排除覆盖引擎，托盘图与 app-paths 对上 ─────────────
const mac=block(entries,'mac');
assert.ok(mac,'electron-builder.yml has a mac section');
assert.equal(scalar(mac,'target','  '),'dmg');
assert.equal(scalar(mac,'identity','  '),"'-'",'ad-hoc signature (quoted, so YAML reads a string)');
assert.equal(scalar(mac,'hardenedRuntime','  '),'false');
assert.deepEqual(list(block(mac,'electronLanguages','  ')??''),['zh_CN','en'],'only the zh_CN and en .lproj directories are kept');
assert.equal(scalar(mac,'icon','  '),'../assets/szudesktop.icns');
assert.ok(existsSync(path.resolve(here,'../assets/szudesktop.icns')));
const signIgnore=list(block(mac,'signIgnore','  ')??'');
assert.ok(signIgnore.includes('/Contents/MacOS/szudesktop-engine$'),'osx-sign leaves the pre-signed engine alone');
const macResources=path.join(os.tmpdir(),'Applications','szuDesktop.app','Contents','Resources');
const macPaths=appPaths({platform:'darwin',isPackaged:true,resourcesPath:macResources,here:path.join(macResources,'app.asar')});
assert.equal(path.basename(macPaths.sidecar),'szudesktop-engine','the installed macOS app starts szudesktop-engine');
// electron-builder 用这些正则去匹配 .app 里每个文件的绝对路径：引擎命中，主程序和 Resources 里的同名文件都不命中。
const ignored=file=>signIgnore.some(pattern=>new RegExp(pattern).test(posix(file)));
assert.ok(ignored(macPaths.sidecar),'signIgnore matches the path app-paths resolves');
assert.ok(!ignored(path.join(macResources,'..','MacOS','szuDesktop'))&&!ignored(path.join(macResources,'szudesktop-engine')),'signIgnore does not skip the main executable');
const macTray=fileSets(block(mac,'extraResources','  ')??'');
for(const name of [MAC_TRAY_ICON_FILE,MAC_TRAY_ICON_FILE.replace(/\.png$/,'@2x.png')]){
  const entry=macTray.find(item=>item.to===name);
  assert.ok(entry,`mac.extraResources ships ${name} at the root of Contents/Resources`);
  assert.ok(existsSync(path.resolve(here,entry.from)),`${entry.from} exists`);
}
assert.equal(macPaths.trayIcon,path.join(macResources,MAC_TRAY_ICON_FILE),'the menu bar icon is read from where the package puts it');
assert.match(block(mac,'extendInfo','  ')??'',/^ {4}NSLocalNetworkUsageDescription: \S/m,'Info.plist explains the local network prompt');

// ───────────── yml 的 dmg 段：按芯片命名，不写自动更新信息 ─────────────
const dmg=block(entries,'dmg');
assert.ok(dmg,'electron-builder.yml has a dmg section');
assert.equal(scalar(dmg,'artifactName','  '),'szuDesktop-${version}-mac-${arch}.${ext}','the Intel DMG keeps its x64 suffix');
assert.equal(scalar(dmg,'writeUpdateInfo','  '),'false','no latest-mac.yml or blockmap');

// ───────────── build-mac.mjs：架构映射、引擎位置、签名开关、版本、钩子、hdiutil 重试 ─────────────
assert.match(buildMac,/const GO_ARCH=\{arm64:'arm64',x64:'amd64'\};/,'electron-builder x64 packs the Go amd64 engine');
assert.match(buildMac,/'szudesktop-darwin-'\+GO_ARCH\[arch\]/,'the engine comes from dist/szudesktop-darwin-<goArch> (build-macos.py output)');
const engineInApp=/const ENGINE_IN_APP='([^']+)';/.exec(buildMac)?.[1];
assert.equal(engineInApp,'MacOS/szudesktop-engine');
assert.match(buildMac,/mac:\{extraFiles:\[\{from:engine,to:ENGINE_IN_APP\}\]\}/,'the engine goes in through mac.extraFiles (relative to Contents)');
assert.equal(path.join(macResources,'..',...engineInApp.split('/')),macPaths.sidecar,'build-mac.mjs puts the engine where app-paths looks for it');
assert.match(buildMac,/extends:'file:'\+path\.join\(here,'electron-builder\.yml'\)/);
assert.match(buildMac,/import \{gardenEngineResources\} from '\.\/garden-engine-deps\.mjs';/,'the garden engine list is shared with build.mjs');
assert.match(buildMac,/extraResources:gardenEngine,/);
assert.match(buildMac,/afterExtract:path\.join\(here,'mac-electron-licenses\.cjs'\)/,'the license hook is wired only here');
assert.match(buildMac,/env:\{\.\.\.process\.env,CSC_FOR_PULL_REQUEST:'true'\}/,'PR builds are still ad-hoc signed');
assert.match(buildMac,/`--config\.buildVersion=\$\{semver\}`/,'CFBundleVersion is pinned to the semver');
assert.match(buildMac,/`--config\.extraMetadata\.version=\$\{semver\}`,`--config\.extraMetadata\.szuVersion=\$\{ver\}`/,'same version injection as build.mjs');
assert.match(buildMac,/'--mac','--'\+arch,'--publish','never'/);
assert.match(buildMac,/`szuDesktop-\$\{semver\}-mac-\$\{arch\}\.dmg`/,'build-mac.mjs looks for the name dmg.artifactName produces');
assert.match(buildMac,/`\$\{digest\}  \$\{path\.basename\(dmg\)\}\\n`,'ascii'/,'.sha256 is ASCII, LF, two spaces, bare file name');
const versionRule=source=>/if\(!(\/\^\(\?:beta\|v\)\?[^/]+\/)\.test\(ver\)\)/.exec(source)?.[1];
assert.ok(versionRule(buildWin),'build.mjs keeps its VERSION rule');
assert.equal(versionRule(buildMac),versionRule(buildWin),'build-mac.mjs accepts exactly the VERSION forms build.mjs accepts');
// 打后断言：少了哪一条，签名或引擎出错的包都可能照样发出去。
for(const [needle,why] of [
  ['Signature=adhoc','the app and the engine are verified as ad-hoc'],
  ["APP_ID='com.szudesktop.app'",'the app identifier is asserted'],
  ["ENGINE_ID='com.szudesktop.engine'",'the engine identifier is asserted'],
  ["['--verify','--deep','--strict',app]",'codesign --verify --deep --strict runs on the app'],
  ["'/usr/bin/vtool',['-show-build',packed]",'the engine minos is read with vtool'],
  ["versionAtLeast(minSystem,minos)",'LSMinimumSystemVersion is not below the engine minos'],
  ["readFileSync(packed).equals(readFileSync(engine))",'the packed engine is byte-identical to dist'],
  ["strayEngines(path.join(app,'Contents','Resources'))",'no engine is left in Contents/Resources'],
])assert.ok(buildMac.includes(needle),why);
// hdiutil 的瞬时失败重试：取出源码里的正则按字面量重建，核对它认哪些报错；其他错误必须立即失败。
const transient=/const TRANSIENT_DMG=\/(.+)\/([a-z]*);/.exec(buildMac);
assert.ok(transient,'build-mac.mjs defines the hdiutil retry pattern');
const retryable=new RegExp(transient[1],transient[2]);
// 每一行只含一种报错，删掉正则里任何一项都会有一行不再命中。
for(const line of ['hdiutil: attach failed - Resource busy','hdiutil: create failed - image not recognized','DMGError: Unable to create disk image: (null)','hdiutil: resize: failed. (-5341)','DMGError: Unable to shrink: (null)'])
  assert.ok(retryable.test(line),'retried: '+line);
for(const line of ['codesign failed with exit code 1','ENOENT: no such file or directory','DMGError: Unable to convert: image not recognized','Cannot find module electron-builder'])
  assert.ok(!retryable.test(line),'not retried: '+line);
assert.match(buildMac,/const RETRIES=2,RETRY_DELAY_MS=10000;/,'at most two retries, ten seconds apart');
assert.ok(buildMac.indexOf("if(process.platform!=='darwin')fail(")<buildMac.search(/execFileSync\(|runTee\(process|mkdtempSync\(/),'the platform check runs before anything is built');
// Windows 构建链不认识这些：build.mjs 与 yml 都不引用 macOS 的钩子。
assert.ok(!buildWin.includes('mac-electron-licenses')&&!/afterExtract/.test(entries),'the Windows package never runs the macOS license hook');

// 在非 macOS 上立即报错。放进临时目录里跑一份副本：那里没有 VERSION、没有 node_modules，即使平台判断被改坏，
// 多给的未知参数和缺失的 VERSION 也会让它在构建任何东西之前退出，检查本身绝不会真的去打包。
{
  const sandbox=mkdtempSync(path.join(os.tmpdir(),'szu-build-mac-'));
  try{
    const electronDir=path.join(sandbox,'desktop','electron');
    mkdirSync(electronDir,{recursive:true});
    for(const name of ['build-mac.mjs','garden-engine-deps.mjs'])copyFileSync(path.join(here,name),path.join(electronDir,name));
    const forcePlatform=new URL('./testdata/force-platform.mjs',import.meta.url).href;
    for(const platform of ['win32','linux']){
      const result=spawnSync(process.execPath,['--import',forcePlatform,path.join(electronDir,'build-mac.mjs'),'--not-an-option'],
        {cwd:sandbox,encoding:'utf8',timeout:30000,env:{...process.env,SZU_FORCE_PLATFORM:platform}});
      assert.equal(result.status,1,`build-mac.mjs exits with 1 on ${platform}: ${result.stderr}`);
      assert.match(result.stderr,/只能在 macOS 上打/,`and says why on ${platform}`);
    }
  }finally{rmSync(sandbox,{recursive:true,force:true});}
}

// ───────────── afterExtract 钩子：只在 darwin 上把 Electron 与 Chromium 的许可复制进 .app ─────────────
{
  const hookFile=path.join(here,'mac-electron-licenses.cjs');
  assert.ok(existsSync(hookFile),'mac-electron-licenses.cjs exists');
  const afterExtract=createRequire(import.meta.url)(hookFile);
  assert.equal(typeof afterExtract,'function','the hook module exports the function electron-builder calls');
  const out=mkdtempSync(path.join(os.tmpdir(),'szu-after-extract-'));
  try{
    const licenses=path.join(out,'Electron.app','Contents','Resources','licenses');
    mkdirSync(path.join(out,'Electron.app','Contents','Resources'),{recursive:true});
    writeFileSync(path.join(out,'LICENSE'),'Copyright (c) Electron contributors\n');
    writeFileSync(path.join(out,'LICENSES.chromium.html'),'<html>Chromium credits</html>\n');
    for(const electronPlatformName of ['win32','linux']){
      await afterExtract({appOutDir:out,electronPlatformName});
      assert.equal(existsSync(licenses),false,`${electronPlatformName} packages are left untouched`);
    }
    await afterExtract({appOutDir:out,electronPlatformName:'darwin',packager:{info:{framework:{distMacOsAppName:'Electron.app'}}}});
    assert.deepEqual(readFileSync(path.join(licenses,'LICENSE.electron.txt')),readFileSync(path.join(out,'LICENSE')),'Electron license copied under the Windows name');
    assert.deepEqual(readFileSync(path.join(licenses,'LICENSES.chromium.html')),readFileSync(path.join(out,'LICENSES.chromium.html')),'Chromium credits copied');
    // 源文件缺了就让打包失败，而不是出一个少了许可文件的 DMG。
    rmSync(path.join(out,'LICENSES.chromium.html'));
    await assert.rejects(afterExtract({appOutDir:out,electronPlatformName:'darwin'}),/ENOENT/);
  }finally{rmSync(out,{recursive:true,force:true});}
}

// ───────────── package.json 与 Makefile 的入口 ─────────────
const pkg=JSON.parse(read('package.json'));
assert.equal(pkg.scripts['dist:mac'],'node build-mac.mjs');
assert.equal(pkg.scripts.dist,'node build.mjs','the Windows entry is unchanged');
assert.equal(pkg.productName,'szuDesktop');
assert.equal(scalar(entries,'productName',''),'szuDesktop','build-mac.mjs looks for szuDesktop.app');
assert.match(buildMac,/const PRODUCT='szuDesktop';/);
assert.equal(scalar(entries,'appId',''),'com.szudesktop.app');
const makefile=readFileSync(path.resolve(here,'..','..','Makefile'),'utf8').replace(/\r\n/g,'\n');
const phony=/^\.PHONY: (.+)$/m.exec(makefile)?.[1].split(/\s+/)??[];
for(const target of ['desktop-mac','desktop-mac-dev'])assert.ok(phony.includes(target),target+' is .PHONY');
assert.match(makefile,/^desktop-mac:\n\t\$\(PYTHON\) desktop\/build-macos\.py && cd desktop\/electron && node build-mac\.mjs --skip-sidecar\n/m);
assert.match(makefile,/^desktop-mac-dev:\n\t\$\(PYTHON\) desktop\/build-macos\.py --dev\n/m);

// ───────────── 素材：菜单栏模板图 16 与 32 像素、带透明通道；应用图标是 icns ─────────────
for(const [name,size] of [[MAC_TRAY_ICON_FILE,16],[MAC_TRAY_ICON_FILE.replace(/\.png$/,'@2x.png'),32]]){
  const png=readFileSync(path.resolve(here,'..','assets',name));
  assert.deepEqual([...png.subarray(0,8)],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],name+' is a PNG');
  assert.equal(png.toString('latin1',12,16),'IHDR');
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[size,size],`${name} is ${size}x${size}`);
  assert.ok([4,6].includes(png[25]),name+' has an alpha channel (template images are drawn from alpha)');
}
const icns=readFileSync(path.resolve(here,'..','assets','szudesktop.icns'));
assert.equal(icns.toString('latin1',0,4),'icns','szudesktop.icns starts with the icns magic');
assert.equal(icns.readUInt32BE(4),icns.length,'and its header length matches the file');
console.log('macOS packaging: builder mac/dmg/win sections, engine location and signing agree with app-paths, build-mac.mjs contract and hdiutil retry, license hook, npm/make entries and icons passed');
