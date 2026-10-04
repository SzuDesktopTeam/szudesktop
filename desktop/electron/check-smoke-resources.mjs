// 冒烟里的资源基线（UX24，R10 的完成标准）、启动各阶段耗时和退出子步骤轨迹（B16）：真实的数只能在安装包冒烟里测，
// 这里用假对象核对口径——采样顺序、CPU 起点清零、按进程类型合计、引擎内存的两种读法、出错时只记录且总把主窗口放回来，
// 以及退出轨迹只旁听、不改变 fetch 的返回值。
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {smokeMode,createSmokeRecorder,startupPhases,summarizeMetrics,sampleSummary,engineRss,recordResourceBaseline,traceShutdownSteps,
  RESOURCE_WINDOW_MS,STARTUP_MARKS} from './smoke-report.mjs';

const dir=mkdtempSync(path.join(os.tmpdir(),'szu-smoke-resources-'));
try{
  // 基线只在冒烟模式加绝对路径时开启，和退出轨迹同一条规则。
  const smoke={SZU_SMOKE_REPORT:path.join(dir,'report.json'),SZUNET_CONFIG_DIR:dir};
  const file=path.join(dir,'evidence','resource-baseline.json');
  assert.equal(smokeMode({...smoke,SZU_SMOKE_RESOURCE_BASELINE:file}).resourceBaseline,file);
  assert.equal(smokeMode({...smoke,SZU_SMOKE_RESOURCE_BASELINE:'resource-baseline.json'}).resourceBaseline,null);
  assert.equal(smokeMode({SZU_SMOKE_RESOURCE_BASELINE:file}).resourceBaseline,null,'never outside smoke mode');
  assert.equal(RESOURCE_WINDOW_MS,60000,'the documented 60-second windows');

  // 启动各阶段：相邻时刻之差；缺了某个时刻，相关的两段记 null，不拿别的时刻凑。
  assert.deepEqual(startupPhases({mainScript:300,appReady:420,mainWindow:1500,mainLoaded:2100,bootDone:2600,uiReady:2700}),
    {electronInit:300,appReady:120,engineStart:1080,mainPageLoad:600,petAndTray:500,uiConfirmed:100});
  assert.deepEqual(startupPhases({mainScript:300,mainWindow:1500}),{electronInit:300,appReady:null,engineStart:null,mainPageLoad:null,petAndTray:null,uiConfirmed:null});
  // 记录器：模块求值时记主脚本，ready、建窗、页面加载完各记第一次；宠物窗按报错前缀认出来。没有报告路径时不起看门狗。
  let ready;
  const recorder=createSmokeRecorder({enabled:true,onReady:callback=>{ready=callback;}});
  const mainPage=new EventEmitter(),petPage=new EventEmitter();
  recorder.watch(mainPage,{preload:'preload: ',console:''});recorder.watch(petPage,{preload:'pet preload: ',console:'pet: '});
  ready();mainPage.emit('did-finish-load');mainPage.emit('did-finish-load');petPage.emit('did-finish-load');
  const timings=recorder.startup();
  assert.deepEqual(Object.keys(timings.marks),STARTUP_MARKS);
  for(const name of ['mainScript','appReady','mainWindow','mainLoaded','petWindow','petLoaded'])assert.ok(Number.isFinite(timings.marks[name]),name);
  assert.equal(timings.marks.bootDone,null);assert.equal(timings.uiReadyMs,null,'set only when the smoke confirms the UI');
  assert.ok(timings.marks.mainScript<=timings.marks.mainWindow&&timings.marks.mainWindow<=timings.marks.mainLoaded);
  assert.ok(!Number.isNaN(Date.parse(timings.processStartedAt)));
  assert.deepEqual(createSmokeRecorder({onReady:()=>assert.fail('disabled smoke must not watch app ready')}).startup().marks.mainScript,null);

  // 进程摘要：按类型合计，主窗口与宠物窗的渲染进程标出来；privateBytes 只有 Windows 给，没有时记 null。
  const metrics=[
    {pid:1,type:'Browser',cpu:{percentCPUUsage:0.123,cumulativeCPUUsage:2.346,idleWakeupsPerSecond:3},memory:{workingSetSize:90000,peakWorkingSetSize:120000}},
    {pid:2,type:'GPU',cpu:{percentCPUUsage:0.5,idleWakeupsPerSecond:1},memory:{workingSetSize:40000,peakWorkingSetSize:50000}},
    {pid:3,type:'Tab',cpu:{percentCPUUsage:0.01},memory:{workingSetSize:70000,peakWorkingSetSize:80000}},
    {pid:4,type:'Tab',cpu:{percentCPUUsage:0.2},memory:{workingSetSize:30000,peakWorkingSetSize:35000}},
    {pid:5,type:'Utility',serviceName:'network.mojom.NetworkService',cpu:{percentCPUUsage:0},memory:{workingSetSize:10000,peakWorkingSetSize:12000,privateBytes:6000}},
  ];
  const summary=summarizeMetrics(metrics,{main:3,pet:4});
  assert.deepEqual(summary.byType.Tab,{count:2,cpuPercent:0.21,workingSetKB:100000,peakWorkingSetKB:115000,privateKB:null});
  assert.deepEqual(summary.byType.Utility,{count:1,cpuPercent:0,workingSetKB:10000,peakWorkingSetKB:12000,privateKB:6000});
  assert.deepEqual(summary.processes.map(row=>row.role),[null,null,'main','pet',null]);
  assert.deepEqual(summary.processes[0],{pid:1,type:'Browser',role:null,name:null,cpuPercent:0.12,cpuSeconds:2.35,idleWakeupsPerSecond:3,
    workingSetKB:90000,peakWorkingSetKB:120000,privateKB:null});
  assert.equal(summary.processes[4].name,'network.mojom.NetworkService');
  assert.deepEqual(sampleSummary({...summary,engine:{pid:9,rssKB:51200}}),
    {cpuPercent:0.83,workingSetMB:234.4,mainRendererCpuPercent:0.01,petRendererCpuPercent:0.2,gpuCpuPercent:0.5,engineRssMB:50});

  // 引擎内存：Windows 读 tasklist 的工作集（千位分隔符随系统区域变），其余平台读 ps 的 RSS；读不到只给原因。
  const calls=[];
  const fake=output=>async(command,args)=>{calls.push([command,...args]);return output;};
  assert.deepEqual(await engineRss(4321,{platform:'win32',run:fake('"szudesktop-windows-amd64.exe","4321","Console","1","23,456 K"\r\n')}),{pid:4321,rssKB:23456});
  assert.deepEqual(calls.pop(),['tasklist','/FI','PID eq 4321','/FO','CSV','/NH']);
  assert.deepEqual(await engineRss(4321,{platform:'win32',run:fake('"szudesktop-windows-amd64.exe","4321","Console","1","23.456 K"\r\n')}),{pid:4321,rssKB:23456});
  assert.match((await engineRss(4321,{platform:'win32',run:fake('INFO: No tasks are running which match the specified criteria.\r\n')})).error,/4321/);
  assert.deepEqual(await engineRss(77,{platform:'darwin',run:fake(' 51200\n')}),{pid:77,rssKB:51200});
  assert.deepEqual(calls.pop(),['/bin/ps','-o','rss=','-p','77']);
  assert.deepEqual(await engineRss(77,{platform:'darwin',run:async()=>{throw Error('ps exited 1');}}),{pid:77,rssKB:null,error:'ps exited 1'});
  assert.deepEqual(await engineRss(null,{run:()=>assert.fail('a reused engine has no pid to read')}),{pid:null,rssKB:null});

  // 一次完整的基线：藏主窗口 → 清零 CPU 起点 → 60 秒 → 采样；摸头 → 清零 → 60 秒 → 采样；最后放回主窗口。
  function fakeRun({withPat=true,reply=true,failMetrics=false}={}){
    const log=[];let clock=1_000_000,visible=true,throttling=true;
    const webContents=Object.assign(new EventEmitter(),{getOSProcessId:()=>3,getBackgroundThrottling:()=>throttling});
    const mainWin={webContents,isDestroyed:()=>false,isVisible:()=>visible,hide(){visible=false;log.push('hide');},show(){visible=true;log.push('show');}};
    const petWin={webContents:{getOSProcessId:()=>4},isDestroyed:()=>false,isVisible:()=>true};
    const app={runningUnderARM64Translation:false,commandLine:{hasSwitch:name=>name==='disable-backgrounding-occluded-windows'},
      getAppMetrics(){log.push('metrics');if(failMetrics)throw Error('metrics unavailable');return metrics;}};
    const pat={click(){
      log.push('pat');throttling=false;
      // 页面回报来自主窗口的渲染进程；别的频道不算。
      webContents.emit('ipc-message',{},'szu:other',{ok:true});
      if(reply){clock+=1500;webContents.emit('ipc-message',{},'szu:pet-result',{ok:true,message:'摸摸头，心情变好了',requestId:1});throttling=true;}
    }};
    const getPetMenu=()=>({getMenuItemById:id=>withPat&&id==='pat'?pat:null});
    const run=recordResourceBaseline({file,app,mainWin,petWin,getPetMenu,enginePid:9,startup:{uiReadyMs:2700},
      readEngine:async pid=>{log.push('engine:'+pid);return {pid,rssKB:51200};},
      sleep:async ms=>{log.push('sleep:'+ms);clock+=ms;},now:()=>clock,stage:stage=>log.push('stage:'+stage)});
    return {run,log,webContents};
  }
  {
    const {run,log,webContents}=fakeRun();
    const result=await run;
    assert.deepEqual(result,{file:'resource-baseline.json',complete:true,errors:[]});
    assert.deepEqual(log,['stage:resource-hidden','hide','metrics','sleep:60000','metrics','engine:9','stage:resource-pat','metrics','pat','sleep:60000','metrics','engine:9','show']);
    assert.equal(webContents.listenerCount('ipc-message'),0,'the reply listener is removed afterwards');
    const saved=JSON.parse(readFileSync(file,'utf8'));
    assert.equal(saved.complete,true);assert.equal(saved.windowSeconds,60);assert.deepEqual(saved.startup,{uiReadyMs:2700});
    assert.equal(saved.occludedBackgroundingDisabled,true);assert.equal(saved.translated,false);
    const {hidden60s,afterPat60s}=saved.samples;
    assert.equal(hidden60s.seconds,60);assert.equal(hidden60s.mainVisible,false,'sampled while the main window is hidden');
    assert.equal(hidden60s.backgroundThrottling,true);assert.equal(hidden60s.byType.Tab.count,2);assert.deepEqual(hidden60s.engine,{pid:9,rssKB:51200});
    assert.equal(afterPat60s.seconds,61.5,'the window starts at the pat, before the reply');
    assert.deepEqual(afterPat60s.pat,{replies:[{afterSeconds:1.5,ok:true,message:'摸摸头，心情变好了'}]});
    assert.equal(afterPat60s.backgroundThrottling,true,'idle throttling is back after the acknowledged save');
    assert.deepEqual(Object.keys(saved.summary),['hidden60s','afterPat60s']);assert.equal(saved.summary.afterPat60s.engineRssMB,50);
  }
  {
    // 页面一直没回报：照样采完两个时点，只在 errors 里写明。
    const {run}=fakeRun({reply:false});
    assert.deepEqual(await run,{file:'resource-baseline.json',complete:true,errors:['摸头后 60 秒内页面没有回报结果']});
  }
  {
    // 菜单里找不到摸头：第二个时点不采，基线不完整，但主窗口照样放回来、文件照样写出。
    const {run,log}=fakeRun({withPat:false});
    const result=await run;
    assert.equal(result.complete,false);assert.deepEqual(result.errors,['宠物菜单里没有「摸摸头」']);
    assert.equal(log.at(-1),'show');
    const saved=JSON.parse(readFileSync(file,'utf8'));
    assert.deepEqual(Object.keys(saved.samples),['hidden60s']);assert.equal(saved.complete,false);
  }
  {
    const {run,log}=fakeRun({failMetrics:true});
    const result=await run;
    assert.equal(result.complete,false);assert.deepEqual(result.errors,['metrics unavailable']);assert.equal(log.at(-1),'show');
  }

  // 退出子步骤：只旁听。fetch 原样返回同一个 Promise，只有 /api/shutdown 记发出与答复；窗口 closed、引擎退出或被强制结束各记一条。
  {
    const notes=[],note=(event,detail)=>notes.push(detail?[event,detail]:[event]);
    const app=new EventEmitter(),engine=new EventEmitter();
    const win=()=>Object.assign(new EventEmitter(),{isDestroyed:()=>false});
    const pet=win(),main=win();
    const answered=Promise.resolve({status:200}),refused=Promise.reject(Object.assign(Error('timed out'),{name:'TimeoutError'}));
    refused.catch(()=>{});
    const host={fetch:url=>url.endsWith('/api/shutdown')?(String(url).includes('slow')?refused:answered):Promise.resolve({status:204})};
    let clock=0;
    const stop=traceShutdownSteps({app,windows:{pet,main},engine,note,host,tick:5,stallMs:1000,now:()=>clock});
    assert.equal(await host.fetch('http://127.0.0.1:1/api/health').then(r=>r.status),204);
    assert.deepEqual(notes,[],'other requests are not traced');
    assert.equal(host.fetch('http://127.0.0.1:1/api/shutdown',{method:'POST'}),answered,'the caller gets the original promise');
    await answered;await new Promise(resolve=>setImmediate(resolve));
    await host.fetch('http://slow/api/shutdown').catch(()=>{});await new Promise(resolve=>setImmediate(resolve));
    app.emit('before-quit');
    clock=2500;await new Promise(resolve=>setTimeout(resolve,30));
    pet.emit('closed');main.emit('closed');app.emit('window-all-closed');engine.emit('exit',null,'SIGKILL');
    stop();
    assert.equal(typeof host.fetch,'function');assert.equal(await host.fetch('http://127.0.0.1:1/api/shutdown').then(r=>r.status),200);
    assert.deepEqual(notes,[['shutdown-sent'],['shutdown-answered',{status:200}],['shutdown-sent'],['shutdown-failed',{error:'TimeoutError'}],
      ['loop-stall',{ms:2500}],['pet-window-closed'],['main-window-closed'],['window-all-closed'],['engine-killed',{code:null,signal:'SIGKILL'}]]);
    const graceful=[],other=new EventEmitter();
    traceShutdownSteps({app:new EventEmitter(),engine:other,note:event=>graceful.push(event),host:{fetch:async()=>({status:200})}});
    other.emit('exit',0,null);assert.deepEqual(graceful,['engine-exited']);
  }
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('Smoke resources: startup phases, metrics summary, engine RSS, hidden/pat baseline sampling and shutdown sub-step trace');
