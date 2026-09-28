// macOS 打包：按芯片各出一个 ad-hoc 签名的 DMG（szuDesktop-<版本>-mac-arm64.dmg、-mac-x64.dmg），不公证、不做自动更新。
// 用法：node build-mac.mjs [--arm64] [--x64] [--skip-sidecar]（架构都不给时两个都打；CI 已单独编好并冒烟过引擎时加 --skip-sidecar）。
// 与 build.mjs 同一套版本规则和庭院引擎清单；build.mjs 只管 Windows，不改。
// 引擎不在 electron-builder.yml 里：每个架构写一份临时配置，把 dist 里对应架构、已由 build-macos.py 预签名的那份
// 用 mac.extraFiles 放进 Contents/MacOS/szudesktop-engine（yml 的 signIgnore 让外层签名不重签它），打完逐项断言再写 .sha256。
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gardenEngineResources} from './garden-engine-deps.mjs';

function fail(message,code=1){console.error('!! '+message);process.exit(code);}

// 签名要 codesign、DMG 要 hdiutil，都只有 macOS 上有；在别的平台上什么都不做，立即报错。
if(process.platform!=='darwin')fail('macOS 安装包只能在 macOS 上打（签名要用 codesign，DMG 要用 hdiutil）');

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,'..','..');
const release=path.join(here,'release');
// electron-builder 的架构名 → Go 的架构名（dist/szudesktop-darwin-<goArch> 由 build-macos.py 生成）。
const GO_ARCH={arm64:'arm64',x64:'amd64'};
// lipo 报出的 Mach-O 架构名：包里的主程序和引擎都必须是这一种，防止映射写反后 x64 包里装进 arm64 引擎。
const MACHO_ARCH={arm64:'arm64',x64:'x86_64'};
const PRODUCT='szuDesktop';
const APP_ID='com.szudesktop.app';
const ENGINE_ID='com.szudesktop.engine';
const ENGINE_IN_APP='MacOS/szudesktop-engine';
// hdiutil 偶发的瞬时失败（上一次挂载还没完全卸下、Spotlight 正在索引等）：同一架构整轮重打，最多再试 2 次，间隔 10 秒。
// 只认这几类（hdiutil 自己的报错和 dmgbuild 包装后的报错），其他错误立即失败，不拿重试掩盖真问题。
const TRANSIENT_DMG=/Resource busy|hdiutil: create failed|Unable to create disk image|hdiutil: resize|Unable to shrink/;
const RETRIES=2,RETRY_DELAY_MS=10000;

const usage='用法: node build-mac.mjs [--arm64] [--x64] [--skip-sidecar]';
const argv=process.argv.slice(2);
const unknown=argv.filter(arg=>!['--arm64','--x64','--skip-sidecar'].includes(arg));
if(unknown.length)fail(usage+'\n不认识的参数: '+unknown.join(' '),2);
const chosen=Object.keys(GO_ARCH).filter(arch=>argv.includes('--'+arch));
const arches=chosen.length?chosen:Object.keys(GO_ARCH);

// 单一来源版本号，规则与 build.mjs 相同：仓库里的 package.json 恒为 0.0.0，版本经 extraMetadata 注入；
// CFBundleVersion 用 --config.buildVersion 固定成同一个 semver，不让环境里的 BUILD_NUMBER 混进来。
const ver=readFileSync(path.join(repoRoot,'internal','version','VERSION'),'utf8').trim();
if(!/^(?:beta|v)?\d+\.\d+\.\d+$/.test(ver))fail('VERSION 必须是 betaX.Y.Z、vX.Y.Z 或 X.Y.Z');
const semver=ver.replace(/^(?:beta|v)/,'');

const run=(command,args)=>spawnSync(command,args,{encoding:'utf8'});
const sha256=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
// codesign -dv 把签名信息写在 stderr。
const signatureOf=file=>{const r=run('/usr/bin/codesign',['-dv',file]);if(r.status!==0)fail(`codesign -dv ${file} 失败：${r.stderr.trim()}`);return r.stderr;};
const archsOf=file=>run('/usr/bin/lipo',['-archs',file]).stdout.trim().split(/\s+/).filter(Boolean);
const versionAtLeast=(have,need)=>{
  const a=String(have).split('.').map(Number),b=String(need).split('.').map(Number);
  if(![...a,...b].every(Number.isInteger))fail(`无法比较系统版本号：${have} 与 ${need}`);
  for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d>0;}
  return true;
};
// Mach-O 与通用二进制的魔数（两种字节序）；Resources 里出现任何可执行代码都算引擎放错了位置。
const MACHO_MAGIC=new Set([0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe,0xbebafeca]);
const isMachO=file=>{const fd=openSync(file,'r');try{const head=Buffer.alloc(4);return readSync(fd,head,0,4,0)===4&&MACHO_MAGIC.has(head.readUInt32BE(0));}finally{closeSync(fd);}};
const ENGINE_NAME=/^szudesktop(?:-engine|-darwin-.+|-windows-.+\.exe)?$/i;
function strayEngines(dir){
  const found=[];
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())found.push(...strayEngines(file));
    else if(entry.isFile()&&(ENGINE_NAME.test(entry.name)||isMachO(file)))found.push(file);
  }
  return found;
}

// 边转发边留下输出的末尾：重试与否要看 electron-builder / dmgbuild 报的是不是 hdiutil 的瞬时错误。
function runTee(command,args,options){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{...options,stdio:['ignore','pipe','pipe']});
    let tail='';
    for(const [stream,sink] of [[child.stdout,process.stdout],[child.stderr,process.stderr]]){
      stream.setEncoding('utf8');
      stream.on('data',text=>{sink.write(text);tail=(tail+text).slice(-65536);});
    }
    child.on('error',reject);
    child.on('close',(code,signal)=>resolve({code,signal,output:tail}));
  });
}

// 1. 引擎（CI 已单独构建并冒烟时用 --skip-sidecar 复用同一份产物）。
if(!argv.includes('--skip-sidecar')){
  const python=process.env.PYTHON||'python3';
  execFileSync(python,[path.join(repoRoot,'desktop','build-macos.py'),...arches.flatMap(arch=>['--arch',GO_ARCH[arch]])],{cwd:repoRoot,stdio:'inherit'});
}
for(const arch of arches){
  const engine=path.join(repoRoot,'dist','szudesktop-darwin-'+GO_ARCH[arch]);
  if(!existsSync(engine))fail(`缺少 ${path.relative(repoRoot,engine)}：先运行 python3 desktop/build-macos.py --arch ${GO_ARCH[arch]}，或去掉 --skip-sidecar`);
}

// 2. 逐个架构打包并核对。不走 npx，用当前 node 跑本地装好的 electron-builder CLI（与 build.mjs 相同）。
//    子进程设 CSC_FOR_PULL_REQUEST=true：PR 构建里有 GITHUB_BASE_REF，electron-builder 默认会跳过签名，
//    而没签名的包带隔离属性时在 Apple 芯片上报「已损坏」。这里只做 ad-hoc 签名，不涉及任何证书或密钥。
const ebCli=path.join(here,'node_modules','electron-builder','cli.js');
const gardenEngine=gardenEngineResources();
console.log('庭院引擎打包清单：'+gardenEngine.map(item=>item.to).join('、'));
const outputs=[];
for(const arch of arches){
  const engine=path.join(repoRoot,'dist','szudesktop-darwin-'+GO_ARCH[arch]);
  // electron-builder 的输出目录：x64 是默认架构，不带后缀。
  const app=path.join(release,arch==='x64'?'mac':'mac-'+arch,PRODUCT+'.app');
  const dmg=path.join(release,`szuDesktop-${semver}-mac-${arch}.dmg`);
  // 先删本架构的旧产物：后面的断言核对的必须是这一次打出来的包。
  rmSync(path.dirname(app),{recursive:true,force:true});
  for(const file of [dmg,dmg+'.sha256',dmg+'.blockmap'])rmSync(file,{force:true});

  // 临时配置 extends electron-builder.yml；electron-builder 合并时把两边的 extraResources 拼接、mac 段逐键合并。
  const configDir=mkdtempSync(path.join(os.tmpdir(),'szu-electron-builder-mac-'));
  const config=path.join(configDir,'electron-builder.json');
  writeFileSync(config,JSON.stringify({
    extends:'file:'+path.join(here,'electron-builder.yml'),
    extraResources:gardenEngine,
    mac:{extraFiles:[{from:engine,to:ENGINE_IN_APP}]},
    afterExtract:path.join(here,'mac-electron-licenses.cjs'),
  },null,2));
  // 失败原因先记下、删完临时目录再退出：process.exit 不会执行 finally。
  let failure=null;
  try{
    for(let attempt=0;;attempt++){
      console.log(`\n>> electron-builder --mac --${arch}`+(attempt?`（第 ${attempt+1} 次）`:''));
      const result=await runTee(process.execPath,[ebCli,'--mac','--'+arch,'--publish','never','--config',config,
        `--config.extraMetadata.version=${semver}`,`--config.extraMetadata.szuVersion=${ver}`,`--config.buildVersion=${semver}`],
        {cwd:here,env:{...process.env,CSC_FOR_PULL_REQUEST:'true'}});
      if(result.code===0)break;
      const why=result.signal?`被信号 ${result.signal} 终止`:`退出码 ${result.code}`;
      if(attempt>=RETRIES||!TRANSIENT_DMG.test(result.output)){failure=`electron-builder --mac --${arch} 失败（${why}）`;break;}
      console.log(`!! hdiutil 瞬时失败（${why}），${RETRY_DELAY_MS/1000} 秒后重打 ${arch}`);
      await new Promise(resolve=>setTimeout(resolve,RETRY_DELAY_MS));
    }
  }finally{rmSync(configDir,{recursive:true,force:true});}
  if(failure)fail(failure);

  // 3. 打完断言：签名、引擎位置与字节、版本号、最低系统版本。
  console.log(`\n>> 核对 ${path.relative(here,app)}`);
  if(!existsSync(app))fail(`没有找到 ${app}`);
  if(!existsSync(dmg))fail(`没有找到 ${dmg}（dmg.artifactName 与这里的命名要一致）`);
  const packed=path.join(app,'Contents',ENGINE_IN_APP);
  if(!existsSync(packed))fail(`包里缺少 Contents/${ENGINE_IN_APP}`);
  if(!readFileSync(packed).equals(readFileSync(engine)))fail(`Contents/${ENGINE_IN_APP} 与 ${path.relative(repoRoot,engine)} 不一致：引擎被改写或重签了`);
  for(const file of [path.join(app,'Contents','MacOS',PRODUCT),packed]){
    const archs=archsOf(file);
    if(archs.join(' ')!==MACHO_ARCH[arch])fail(`${path.relative(app,file)} 应只含 ${MACHO_ARCH[arch]}，实际 ${archs.join(' ')||'无法读取'}`);
  }
  // identity '-' 在装有真实证书的机器上也可能匹配到证书，所以不信配置、只信结果。
  const appSignature=signatureOf(app),engineSignature=signatureOf(packed);
  if(!appSignature.includes('Signature=adhoc')||!appSignature.includes('Identifier='+APP_ID+'\n'))fail(`${PRODUCT}.app 的签名应为 ad-hoc、${APP_ID}：\n${appSignature}`);
  if(!engineSignature.includes('Signature=adhoc')||!engineSignature.includes('Identifier='+ENGINE_ID+'\n'))fail(`引擎的签名应为 ad-hoc、${ENGINE_ID}：\n${engineSignature}`);
  const verify=run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
  if(verify.status!==0)fail(`codesign --verify --deep --strict 未通过：\n${verify.stderr.trim()}`);
  const plist=path.join(app,'Contents','Info.plist');
  const info=key=>{const r=run('/usr/bin/plutil',['-extract',key,'raw','-o','-',plist]);if(r.status!==0)fail(`Info.plist 缺少 ${key}`);return r.stdout.trim();};
  for(const key of ['CFBundleShortVersionString','CFBundleVersion'])if(info(key)!==semver)fail(`Info.plist 的 ${key} 为 ${info(key)}，应为 ${semver}`);
  // 应用声明的最低系统版本不能低于引擎能运行的版本，否则老系统上能打开外壳、却起不来引擎。
  const minSystem=info('LSMinimumSystemVersion');
  const build=run('/usr/bin/vtool',['-show-build',packed]);
  const minos=/^\s*minos\s+(\S+)/m.exec(build.stdout)?.[1];
  if(build.status!==0||!minos)fail(`读不出引擎的 minos（vtool 需要 Xcode Command Line Tools）：${build.stderr.trim()}`);
  if(!versionAtLeast(minSystem,minos))fail(`LSMinimumSystemVersion ${minSystem} 低于引擎的 minos ${minos}`);
  const stray=strayEngines(path.join(app,'Contents','Resources'));
  if(stray.length)fail('Contents/Resources 里不应有引擎或其他可执行代码：\n'+stray.map(file=>'  '+path.relative(app,file)).join('\n'));
  console.log(`   签名 ad-hoc（${APP_ID} / ${ENGINE_ID}），引擎与 dist 一致，版本 ${semver}，最低 macOS ${minSystem}（引擎 ${minos}）`);

  // 4. 校验文件：ASCII、LF、两个空格，与 Windows 安装包的 .sha256 同一格式。
  const digest=sha256(dmg);
  writeFileSync(dmg+'.sha256',`${digest}  ${path.basename(dmg)}\n`,'ascii');
  outputs.push(`${path.basename(dmg)}  ${(statSync(dmg).size/1024/1024).toFixed(1)} MB  sha256 ${digest.slice(0,16)}`);
}
console.log('\n完成。DMG 在 desktop/electron/release/，版本 '+ver+'\n'+outputs.map(line=>'   '+line).join('\n'));
