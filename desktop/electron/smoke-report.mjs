// 安装包冒烟模式：只在 SZU_SMOKE_REPORT 与 SZUNET_CONFIG_DIR 都是绝对路径时开启，使用独立的配置目录，
// 从不碰用户的账号。这里收集页面和宠物窗的报错，界面就绪后跑 smoke-pet.mjs 的真实交互，
// 把结果或失败现场写进报告；失败报告写盘前抹掉会话凭据。报告里另带启动各阶段的耗时；
// SZU_SMOKE_RESOURCE_BASELINE 是绝对路径时，交报告前再记一份资源基线（UX24，R10 的完成标准），只记录、不设门槛。
import {appendFileSync,mkdirSync,renameSync,writeFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import os from 'node:os';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {redactToken} from './listen-url.mjs';

export const SMOKE_ERROR_LIMIT=10;
export function smokeMode(env){
  const report=env.SZU_SMOKE_REPORT;
  const enabled=Boolean(report&&path.isAbsolute(report)&&env.SZUNET_CONFIG_DIR&&path.isAbsolute(env.SZUNET_CONFIG_DIR));
  const absolute=name=>enabled&&env[name]&&path.isAbsolute(env[name])?env[name]:null;
  return {enabled,report,profile:enabled?path.join(env.SZUNET_CONFIG_DIR,'electron-profile'):null,
    screenshot:env.SZU_SMOKE_SCREENSHOT,quitAfterReport:env.SZU_SMOKE_QUIT_AFTER_REPORT==='1',
    quitTrace:absolute('SZU_SMOKE_QUIT_TRACE'),resourceBaseline:absolute('SZU_SMOKE_RESOURCE_BASELINE')};
}

const round=(value,digits=0)=>Math.round(value*10**digits)/10**digits;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// 启动各阶段：都记成距进程创建的毫秒数，先后由 main.mjs 决定。engineStart 主要是起引擎、等它报地址和健康检查
// （也含读设置、建主窗口对象）；petAndTray 是宠物窗、托盘和专注提醒；uiConfirmed 是 boot 走完到冒烟第一次确认主界面可用，
// 所以 uiReadyMs（界面就绪时间）是上限：界面真正画好的时刻不会晚于它。
export const STARTUP_MARKS=['mainScript','appReady','mainWindow','mainLoaded','petWindow','petLoaded','bootDone','uiReady'];
const STARTUP_PHASES=[['electronInit',null,'mainScript'],['appReady','mainScript','appReady'],['engineStart','appReady','mainWindow'],
  ['mainPageLoad','mainWindow','mainLoaded'],['petAndTray','mainLoaded','bootDone'],['uiConfirmed','bootDone','uiReady']];
export function startupPhases(marks){
  return Object.fromEntries(STARTUP_PHASES.map(([name,from,to])=>{
    const start=from?marks[from]:0,end=marks[to];
    return [name,Number.isFinite(start)&&Number.isFinite(end)?end-start:null];
  }));
}

// app.getAppMetrics() 的摘要：按进程类型（Browser 是主进程，Tab 是页面，另有 GPU、Utility 等）合计 CPU 与内存，并逐个列出进程，
// 主窗口与宠物窗的渲染进程标上 role。CPU 是 percentCPUUsage，单核百分比，取距上一次调用 getAppMetrics 的平均值；
// 内存单位 KB：workingSetSize 各平台都有，privateBytes 只有 Windows 给（其余平台记 null）。
export function summarizeMetrics(metrics,roles={}){
  const byType={},processes=[];
  for(const metric of metrics){
    const cpu=metric.cpu||{},memory=metric.memory||{};
    const row={pid:metric.pid,type:metric.type,role:Object.keys(roles).find(name=>roles[name]===metric.pid)||null,name:metric.name||metric.serviceName||null,
      cpuPercent:round(cpu.percentCPUUsage||0,2),cpuSeconds:Number.isFinite(cpu.cumulativeCPUUsage)?round(cpu.cumulativeCPUUsage,2):null,
      idleWakeupsPerSecond:cpu.idleWakeupsPerSecond??null,workingSetKB:memory.workingSetSize??null,peakWorkingSetKB:memory.peakWorkingSetSize??null,
      privateKB:memory.privateBytes??null};
    processes.push(row);
    const total=byType[row.type]??={count:0,cpuPercent:0,workingSetKB:0,peakWorkingSetKB:0,privateKB:null};
    total.count++;total.cpuPercent=round(total.cpuPercent+row.cpuPercent,2);
    total.workingSetKB+=row.workingSetKB||0;total.peakWorkingSetKB+=row.peakWorkingSetKB||0;
    if(row.privateKB!==null)total.privateKB=(total.privateKB||0)+row.privateKB;
  }
  return {byType,processes};
}
// 一个时点的几个关键数，冒烟脚本把它打进 CI 日志，不用下载 artifact 也能比较。
export function sampleSummary(sample){
  const rows=sample.processes,sum=(key,keep=()=>true)=>round(rows.filter(keep).reduce((total,row)=>total+(row[key]||0),0),2);
  const role=name=>rows.find(row=>row.role===name)?.cpuPercent??null;
  return {cpuPercent:sum('cpuPercent'),workingSetMB:round(sum('workingSetKB')/1024,1),mainRendererCpuPercent:role('main'),petRendererCpuPercent:role('pet'),
    gpuCpuPercent:sum('cpuPercent',row=>row.type==='GPU'),engineRssMB:Number.isFinite(sample.engine?.rssKB)?round(sample.engine.rssKB/1024,1):null};
}
const execText=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout:10000},(error,stdout)=>error?reject(error):resolve(String(stdout))));
// Go 引擎的常驻内存（KB）。Windows 上按 sidecar 的进程号问 tasklist，取的是工作集，与 getAppMetrics 的 workingSetSize 同一口径；
// 其余平台用 ps 的 RSS。读不到时返回原因，不抛错：基线只记录。复用别的启动器的引擎时没有进程号，记 null。
export async function engineRss(pid,{platform=process.platform,run=execText}={}){
  if(!pid)return {pid:null,rssKB:null};
  try{
    let kb;
    if(platform==='win32'){
      const fields=(await run('tasklist',['/FI',`PID eq ${pid}`,'/FO','CSV','/NH'])).match(/"[^"]*"/g)?.map(field=>field.slice(1,-1))||[];
      if(fields[1]!==String(pid))throw Error('tasklist 里没有进程 '+pid);
      kb=Number(fields.at(-1).replace(/\D/g,''));
    }else kb=Number((await run('/bin/ps',['-o','rss=','-p',String(pid)])).trim());
    if(!Number.isFinite(kb)||kb<=0)throw Error('读不出进程 '+pid+' 的内存');
    return {pid,rssKB:kb};
  }catch(error){return {pid,rssKB:null,error:error.message};}
}

// 资源基线：主窗口藏起 60 秒后采一次；接着从宠物菜单摸一次头（主窗口仍藏着，要把隐藏的页面叫醒去保存），再等 60 秒采第二次。
// 第二个时点专门盯「隐藏时照料伙伴之后页面还在后台持续出帧」这类问题（Electron 44.5.1 修过一次）。每个窗口开始时先调一次
// getAppMetrics 定下 CPU 的起点，所以两次的 CPU 都是各自 60 秒窗口里的平均。窗口固定 60 秒，慢环境（SZU_SMOKE_WAIT_SCALE）也不放大，
// 各平台之间才能比较，多出的时间由冒烟脚本放宽等报告的时限；windowMs 只给检查脚本缩短等待用。
// 任何一步出错都只记进 errors，最后总会把主窗口重新显示出来，再交冒烟报告。
export const RESOURCE_WINDOW_MS=60000;
export async function recordResourceBaseline({file,app,mainWin,petWin,getPetMenu,enginePid,startup,windowMs=RESOURCE_WINDOW_MS,
  readEngine=engineRss,sleep=pause,now=Date.now,stage=()=>{}}){
  const errors=[],samples={},replies=[];
  const pid=win=>{try{return win&&!win.isDestroyed()?win.webContents.getOSProcessId():null;}catch{return null;}};
  const take=async(since,extra={})=>{
    const metrics=summarizeMetrics(app.getAppMetrics(),{main:pid(mainWin),pet:pid(petWin)});
    const engine=await readEngine(enginePid);
    if(engine.error)errors.push('引擎内存：'+engine.error);
    return {seconds:round((now()-since)/1000,1),mainVisible:mainWin.isVisible(),petVisible:Boolean(petWin&&!petWin.isDestroyed()&&petWin.isVisible()),
      backgroundThrottling:mainWin.webContents.getBackgroundThrottling(),...extra,...metrics,engine};
  };
  // 页面执行完宠物指令会经 szu:pet-result 回报；这里只旁听，记下摸头后多久收到回报。
  const onMessage=(_event,channel,result)=>{if(channel==='szu:pet-result')replies.push({at:now(),ok:result?.ok===true,message:String(result?.message??'').slice(0,120)});};
  try{
    stage('resource-hidden');
    mainWin.hide();
    app.getAppMetrics();
    const hiddenAt=now();
    await sleep(windowMs);
    samples.hidden60s=await take(hiddenAt);
    stage('resource-pat');
    const pat=getPetMenu?.()?.getMenuItemById('pat');
    if(!pat)throw Error('宠物菜单里没有「摸摸头」');
    mainWin.webContents.on('ipc-message',onMessage);
    app.getAppMetrics();
    const patAt=now();
    pat.click();
    await sleep(windowMs);
    samples.afterPat60s=await take(patAt,{pat:{replies:replies.map(({at,...reply})=>({afterSeconds:round((at-patAt)/1000,1),...reply}))}});
    if(!replies.length)errors.push(`摸头后 ${windowMs/1000} 秒内页面没有回报结果`);
  }catch(error){errors.push(error?.message||String(error));}
  finally{
    if(!mainWin.isDestroyed()){mainWin.webContents.removeListener('ipc-message',onMessage);mainWin.show();}
  }
  const complete=Boolean(samples.hidden60s&&samples.afterPat60s),cpus=os.cpus();
  const baseline={schema:1,note:'只记录、不设门槛（UX24，R10 的完成标准）',recordedAt:new Date().toISOString(),complete,
    electron:process.versions.electron??null,platform:process.platform,arch:process.arch,translated:app.runningUnderARM64Translation===true,
    os:{release:os.release(),cpuModel:cpus[0]?.model??null,cpus:cpus.length,memoryMB:Math.round(os.totalmem()/1048576)},
    occludedBackgroundingDisabled:app.commandLine?.hasSwitch?.('disable-backgrounding-occluded-windows')===true,
    windowSeconds:windowMs/1000,startup,summary:Object.fromEntries(Object.entries(samples).map(([name,sample])=>[name,sampleSummary(sample)])),samples,errors};
  mkdirSync(path.dirname(file),{recursive:true});
  writeFileSync(file+'.tmp',JSON.stringify(baseline,null,2));
  renameSync(file+'.tmp',file);
  return {file:path.basename(file),complete,errors};
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
// 供 macOS 冒烟核对真实的 quit Apple Event 也走了保存握手；两个平台记资源基线的那次启动也设它，留一份退出耗时。其余情况什么也不做。
export function createQuitTrace(env){
  const file=env.SZU_SMOKE_QUIT_TRACE;
  if(!smokeMode(env).enabled||!file||!path.isAbsolute(file))return ()=>{};
  return (event,detail)=>{
    try{mkdirSync(path.dirname(file),{recursive:true});appendFileSync(file,JSON.stringify({event,...detail,at:Date.now()})+'\n');}catch{}
  };
}
// 退出轨迹里关窗（closeWindows）与停引擎（stopEngine）内部的子步骤。退出协调只记 confirmed、windows-closed、engine-stopped 三个点；
// Rosetta 下有一次关窗用了 3.5 秒、停引擎用了 8.8 秒，超过 sidecar 自己约 4 秒的上限，看不出慢在哪一步（B16）。这里只旁听，不改变退出流程：
// - 宠物窗、主窗口各自 closed 的时刻，把关窗切成「停定时器与宠物窗」「学校与飞书窗口的清理、托盘」「主窗口」三段；
// - 发给引擎的 /api/shutdown 何时发出、何时得到答复或失败（sidecar.mjs 用全局 fetch，这里包一层只看这一个地址）；
// - 引擎进程何时退出，被强制结束时记 engine-killed（macOS 是 SIGKILL；Windows 上 taskkill /F 的退出码是 1，记在 engine-exited 里）；
// - 第一次 before-quit 起每 tick 毫秒看一次主进程事件循环，间隔超过 stallMs 记 loop-stall：分得清是某一步慢，还是整个进程被停住了。
// 返回的函数撤掉 fetch 包装和事件循环监视，只给检查脚本收尾用；真实退出时进程直接结束。
export function traceShutdownSteps({app,windows={},engine=null,note,host=globalThis,tick=250,stallMs=1000,now=()=>performance.now()}){
  for(const [name,win] of Object.entries(windows))if(win&&!win.isDestroyed())win.once('closed',()=>note(name+'-window-closed'));
  app.once('window-all-closed',()=>note('window-all-closed'));
  engine?.once('exit',(code,signal)=>note(signal==='SIGKILL'?'engine-killed':'engine-exited',{code,signal}));
  const fetch=host.fetch;
  host.fetch=(input,init)=>{
    const pending=fetch(input,init);
    if(String(input?.url??input).endsWith('/api/shutdown')){
      note('shutdown-sent');
      pending.then(response=>note('shutdown-answered',{status:response.status}),error=>note('shutdown-failed',{error:error?.name||String(error)}));
    }
    return pending;
  };
  let monitor=null;
  app.once('before-quit',()=>{
    let last=now();
    monitor=setInterval(()=>{const at=now(),gap=at-last;last=at;if(gap>stallMs)note('loop-stall',{ms:Math.round(gap)});},tick);
    monitor.unref?.();
  });
  return ()=>{clearInterval(monitor);host.fetch=fetch;};
}
// onReady(callback)：app 的 ready 时刻只能在它发生之前挂监听，而这里不 import electron（见 check-packaging），由 main.mjs 传入；
// 没传时 appReady 记 null，与它相邻的两段耗时也记 null。
export function createSmokeRecorder({enabled=false,report=null,profile=null,screenshot=null,quitAfterReport=false,quitTrace=null,resourceBaseline=null,
  onReady=()=>{}}={}){
  const errors=[];
  let watchdog=null,heartbeat=null,stopping=null;
  // 启动各阶段的时刻（见 STARTUP_MARKS），每个只记第一次。进程创建时刻取 Electron 的 process.getCreationTime()，取不到时用 Node 的 timeOrigin。
  const origin=process.getCreationTime?.()||performance.timeOrigin,marks={};
  const mark=name=>{if(enabled&&marks[name]===undefined)marks[name]=Math.round(Date.now()-origin);};
  if(enabled){mark('mainScript');onReady(()=>mark('appReady'));}
  const startup=()=>({processStartedAt:new Date(origin).toISOString(),marks:Object.fromEntries(STARTUP_MARKS.map(name=>[name,marks[name]??null])),
    phases:startupPhases(marks),uiReadyMs:marks.uiReady??null});
  const stageFile=report?path.join(path.dirname(report),'pet-progress.json'):null;
  const stopWatchdog=()=>{
    if(!stopping){clearInterval(heartbeat);stopping=watchdog?watchdog.terminate():Promise.resolve();}
    return stopping;
  };
  // 看门狗：独立线程每秒检查主进程心跳。主进程事件循环卡住超过 20 秒时，定时器和超时都不会触发，
  // 以前只表现为“报告没出现”；这里由看门狗直接写失败报告，带上当时的冒烟阶段。
  if(enabled&&report){
    const beat=new Int32Array(new SharedArrayBuffer(4));
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
    // 主窗口的报错不带前缀，宠物窗带「pet: 」（见 main-window.mjs 与 pet-controller.mjs 的 watch 调用）：据此记下各自建窗和页面加载完的时刻。
    const which=consoleLabel?'pet':'main';
    mark(which+'Window');
    webContents.once('did-finish-load',()=>mark(which+'Loaded'));
    webContents.on('preload-error',(_event,_file,error)=>{record(preload+error.message);});
    webContents.on('console-message',details=>{if(details.level==='error')record(consoleLabel+details.message);});
  }
  // petRuntime 在界面就绪之后才取值：宠物窗、托盘和当前缩放以那一刻为准。
  // macRuntime 只在 macOS 上取值：应用菜单、程序坞、菜单栏图标等真实 Electron 上的核对见 smoke-macos.mjs，结果写进报告的 mac 字段。
  async function writeReport({app,mainWin,handle,petRuntime,macRuntime}){
    if(!enabled)return;
    mark('bootDone');
    const deadline=Date.now()+15000;
    let rendered=false;
    while(Date.now()<deadline){
      rendered=await mainWin.webContents.executeJavaScript(`Boolean(document.querySelector('#nav [data-action="navigate"]') && document.querySelector('#main #network-summary') && window.szuDesktop?.shell === 'electron')`);
      if(rendered)break;
      await new Promise(r=>setTimeout(r,100));
    }
    if(!rendered)throw Error('安装版主界面或隔离接口没有就绪');
    mark('uiReady');
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
    // 资源基线放在全部核对之后、检查页面报错之前：藏起的两分钟里页面报的错照样让冒烟失败。
    let resources={};
    if(resourceBaseline){
      const {petWin,getPetMenu}=petRuntime();
      resources={resourceBaseline:await recordResourceBaseline({file:resourceBaseline,app,mainWin,petWin,getPetMenu,
        enginePid:handle.owned?handle.child.pid:null,startup:startup(),
        stage:stage=>{try{writeFileSync(stageFile,JSON.stringify({stage}));}catch{}}})};
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
      traceShutdownSteps({app,windows:{pet:petRuntime().petWin,main:mainWin},engine:handle.owned?handle.child:null,note});
    }
    await publishSmokeReport(report,{version:status.app_version,packageVersion:app.getVersion(),electron:process.versions.electron,
      appPid:process.pid,sidecarPid:handle.owned?handle.child.pid:null,owned:handle.owned,
      baseUrl:handle.baseUrl,title:mainWin.getTitle(),rendered,pet,platform:process.platform,arch:process.arch,...mac,
      startup:startup(),...resources},stopWatchdog);
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

  return {enabled,profile,errors,record,watch,writeReport,writeFailure,startup};
}
