// 安装包冒烟模式：只在 SZU_SMOKE_REPORT 与 SZUNET_CONFIG_DIR 都是绝对路径时开启，使用独立的配置目录，
// 从不碰用户的账号。这里收集页面和宠物窗的报错，界面就绪后跑 smoke-pet.mjs 的真实交互，
// 把结果或失败现场写进报告；失败报告写盘前抹掉会话凭据。
import {appendFileSync,mkdirSync,renameSync,writeFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {redactToken} from './listen-url.mjs';

export const SMOKE_ERROR_LIMIT=10;
export function smokeMode(env){
  const report=env.SZU_SMOKE_REPORT;
  const enabled=Boolean(report&&path.isAbsolute(report)&&env.SZUNET_CONFIG_DIR&&path.isAbsolute(env.SZUNET_CONFIG_DIR));
  return {enabled,report,profile:enabled?path.join(env.SZUNET_CONFIG_DIR,'electron-profile'):null,
    screenshot:env.SZU_SMOKE_SCREENSHOT,quitAfterReport:env.SZU_SMOKE_QUIT_AFTER_REPORT==='1',
    quitTrace:enabled&&env.SZU_SMOKE_QUIT_TRACE&&path.isAbsolute(env.SZU_SMOKE_QUIT_TRACE)?env.SZU_SMOKE_QUIT_TRACE:null};
}
export async function publishSmokeReport(report,payload,stopWatchdog){
  mkdirSync(path.dirname(report),{recursive:true});
  writeFileSync(report+'.tmp',JSON.stringify(payload,null,2));
  // External native drivers may send quit immediately after this rename.
  // Terminate the test worker first, so it cannot delay exit or overwrite success.
  await stopWatchdog();
  renameSync(report+'.tmp',report);
}
// 退出轨迹：只有冒烟模式开启、且 SZU_SMOKE_QUIT_TRACE 是绝对路径时，才把退出协调走过的每一步按行追加成 JSONL，
// 供 macOS 冒烟核对真实的 quit Apple Event 也走了保存握手；其余情况（包括 Windows 冒烟，它不设这个变量）什么也不做。
export function createQuitTrace(env){
  const file=env.SZU_SMOKE_QUIT_TRACE;
  if(!smokeMode(env).enabled||!file||!path.isAbsolute(file))return ()=>{};
  return (event,detail)=>{
    try{mkdirSync(path.dirname(file),{recursive:true});appendFileSync(file,JSON.stringify({event,...detail,at:Date.now()})+'\n');}catch{}
  };
}
export function createSmokeRecorder({enabled=false,report=null,profile=null,screenshot=null,quitAfterReport=false,quitTrace=null}={}){
  const errors=[];
  let watchdog=null,heartbeat=null,stopping=null;
  const stopWatchdog=()=>{
    if(!stopping){clearInterval(heartbeat);stopping=watchdog?watchdog.terminate():Promise.resolve();}
    return stopping;
  };
  // 看门狗：独立线程每秒检查主进程心跳。主进程事件循环卡住超过 20 秒时，定时器和超时都不会触发，
  // 以前只表现为“报告没出现”；这里由看门狗直接写失败报告，带上当时的冒烟阶段。
  if(enabled&&report){
    const beat=new Int32Array(new SharedArrayBuffer(4));
    const stageFile=path.join(path.dirname(report),'pet-progress.json');
    watchdog=new Worker(`const {workerData:{beat,report,stageFile}}=require('node:worker_threads');const fs=require('node:fs');
let last=Atomics.load(beat,0),same=0;
setInterval(()=>{const now=Atomics.load(beat,0);if(now!==last){last=now;same=0;return;}if(++same<20)return;
let stage=null;try{stage=JSON.parse(fs.readFileSync(stageFile,'utf8')).stage}catch{}
try{fs.writeFileSync(report+'.tmp',JSON.stringify({error:'Electron 主进程事件循环卡住超过 20 秒',stage},null,2));fs.renameSync(report+'.tmp',report)}catch{}
process.exit(0)},1000);`,{eval:true,workerData:{beat,report,stageFile}});
    watchdog.unref();
    heartbeat=setInterval(()=>Atomics.add(beat,0,1),500);heartbeat.unref?.();
  }
  const wantsShot=()=>Boolean(screenshot&&path.isAbsolute(screenshot));
  // 只在冒烟模式下记录，最多 10 条；返回是否记下，调用方据此决定要不要另外打印。
  function record(message){
    if(!enabled||errors.length>=SMOKE_ERROR_LIMIT)return false;
    errors.push(message);
    return true;
  }
  function watch(webContents,{preload,console:consoleLabel}){
    if(!enabled)return;
    webContents.on('preload-error',(_event,_file,error)=>{record(preload+error.message);});
    webContents.on('console-message',details=>{if(details.level==='error')record(consoleLabel+details.message);});
  }
  // petRuntime 在界面就绪之后才取值：宠物窗、托盘和当前缩放以那一刻为准。
  // macRuntime 只在 macOS 上取值：应用菜单、程序坞、菜单栏图标等真实 Electron 上的核对见 smoke-macos.mjs，结果写进报告的 mac 字段。
  async function writeReport({app,mainWin,handle,petRuntime,macRuntime}){
    if(!enabled)return;
    const deadline=Date.now()+15000;
    let rendered=false;
    while(Date.now()<deadline){
      rendered=await mainWin.webContents.executeJavaScript(`Boolean(document.querySelector('#nav [data-action="navigate"]') && document.querySelector('#main #network-summary') && window.szuDesktop?.shell === 'electron')`);
      if(rendered)break;
      await new Promise(r=>setTimeout(r,100));
    }
    if(!rendered)throw Error('安装版主界面或隔离接口没有就绪');
    const response=await fetch(handle.baseUrl+'/api/health',{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('安装版引擎健康检查失败');
    const status=await response.json();
    const {checkPetRuntime}=await import('./smoke-pet.mjs');
    const pet=await checkPetRuntime({mainWin,...petRuntime(),evidenceDir:path.dirname(report),baseUrl:handle.baseUrl,token:handle.token});
    // 每项核对都是 true/false，没通过的原因另放在 macFailures；核对本身抛错时按启动失败写失败报告。
    let mac={};
    if(process.platform==='darwin'){
      const {checkMacRuntime}=await import('./smoke-macos.mjs');
      const {checks,failures}=await checkMacRuntime(macRuntime());
      mac={mac:checks,macFailures:failures};
    }
    if(errors.length)throw Error(errors.join('; '));
    if(wantsShot()){
      await mainWin.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
      const shot=await mainWin.webContents.capturePage();
      writeFileSync(screenshot,shot.toPNG());
    }
    if(quitTrace&&path.isAbsolute(quitTrace)){
      const note=(event,details={})=>{try{appendFileSync(quitTrace,JSON.stringify({event,...details,at:Date.now()})+'\n');}catch{}};
      app.once('will-quit',()=>note('will-quit'));
      app.once('quit',(_event,exitCode)=>note('quit',{exitCode}));
    }
    await publishSmokeReport(report,{version:status.app_version,packageVersion:app.getVersion(),electron:process.versions.electron,
      appPid:process.pid,sidecarPid:handle.owned?handle.child.pid:null,owned:handle.owned,
      baseUrl:handle.baseUrl,title:mainWin.getTitle(),rendered,pet,platform:process.platform,arch:process.arch,...mac},stopWatchdog);
    if(quitAfterReport)app.quit();
  }
  // 启动失败：尽量带上页面现场，整份报告写盘前抹掉会话凭据（页面地址、loadURL 的报错都可能含有它）。
  // 失败现场：先把原始错误写进报告，再尽量补充页面信息。隐藏的窗口上 executeJavaScript / capturePage
  // 可能永远不返回（以前原始错误因此被吞掉，只剩“报告没出现”），所以补充信息每步限 5 秒。
  async function writeFailure(error,mainWin,token){
    const failure={error:error.message,consoleErrors:errors};
    const save=()=>{mkdirSync(path.dirname(report),{recursive:true});writeFileSync(report+'.tmp',redactToken(JSON.stringify(failure,null,2),token));renameSync(report+'.tmp',report);};
    save();
    const within=(promise,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(label+' 5 秒未返回')),5000))]);
    try{
      if(mainWin&&!mainWin.isDestroyed()){
        if(typeof mainWin.isVisible==='function')failure.mainVisible=mainWin.isVisible();
        failure.page=await within(mainWin.webContents.executeJavaScript(`({url:location.href,shell:window.szuDesktop?.shell,navCount:document.querySelectorAll('#nav [data-action="navigate"]').length,mainText:document.querySelector('#main')?.innerText.slice(0,1500)})`),'读取主窗口页面');
        failure.moduleType=await within(mainWin.webContents.executeJavaScript(`fetch('/assets/garden/app.mjs').then(r=>({status:r.status,type:r.headers.get('content-type')}))`),'读取页面模块');
        if(wantsShot())writeFileSync(screenshot,(await within(mainWin.webContents.capturePage(),'主窗口截图')).toPNG());
      }
    }catch(snapshotError){failure.snapshotError=snapshotError.message;}
    save();
    await stopWatchdog();
  }

  return {enabled,profile,errors,record,watch,writeReport,writeFailure};
}
