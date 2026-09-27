import assert from 'node:assert/strict';
import {parseListenUrl,parseSidecarEndpoint,createEndpointParser,launchUrl,redactToken,TOKEN_HEADER,startupFailureReason,lastStderrLine,STARTUP_REASON_MAX,STDERR_DETAIL_MAX} from './listen-url.mjs';
import {startSidecar,stopSidecar,startupErrorText,TASKKILL_TIMEOUT_MS} from './sidecar.mjs';
import {isSafeExternalUrl} from './external-url.mjs';
import {createEngineMonitor,ENGINE_HEALTH_INTERVAL_MS} from './engine-monitor.mjs';
import {fakeDialog,settle} from './testdata/fake-electron.mjs';
import {EventEmitter} from 'node:events';
import {execFileSync} from 'node:child_process';
import {Writable} from 'node:stream';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const fake=path.join(here,'testdata','fake-sidecar.mjs');
const fixture=path.join(here,'testdata','fake-lifecycle.mjs');
const tests=[];
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
function test(name,fn){tests.push({name,fn});}
function killOwnFixture(pid){
  if(!pid||!alive(pid))return;
  try{if(process.platform==='win32')execFileSync('taskkill',['/pid',String(pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else process.kill(pid,'SIGKILL');}catch{}
}
async function withFixtureFiles(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'szu-sidecar-test-'));
  try{await fn(dir);}finally{
    // Only terminate PIDs recorded by this test's child fixtures.
    for(const name of ['parent.pid','descendant.pid']){const p=path.join(dir,name);if(fs.existsSync(p))killOwnFixture(Number(fs.readFileSync(p,'utf8')));}
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

// testdata 里各个假引擎打印的同一份凭据。
const FAKE_TOKEN='0123456789abcdef'.repeat(4);
const session=`szuDesktop 会话: ${FAKE_TOKEN}\n`;
test('parseListenUrl: 只接受完整协议行与有效端口',()=>{
  assert.equal(parseListenUrl('szuDesktop 已启动: http://127.0.0.1:52344\n'+session),'http://127.0.0.1:52344');
  assert.equal(parseListenUrl('szuDesktop 已启动: http://localhost:7000\r\n'+session),'http://127.0.0.1:7000');
  assert.equal(parseListenUrl('szuDesktop 已复用: http://127.0.0.1:7001\n'+session),'http://127.0.0.1:7001');
  for(const value of ['','正在启动...\n','http://localhost:7000\n','szuDesktop 已启动: http://127.0.0.1:5','szuDesktop 已启动: http://127.0.0.1:0\n','szuDesktop 已启动: http://127.0.0.1:65536\n','szuDesktop 已启动: http://127.0.0.1:80/path\n'])assert.equal(parseListenUrl(value+session),null,value);
  assert.equal(parseListenUrl('szuDesktop 已启动: http://127.0.0.1:6001\n[自动登录] 成功\n'+session),'http://127.0.0.1:6001');
});

test('parseSidecarEndpoint: 地址和凭据两行都完整才就绪，凭据格式严格',()=>{
  assert.deepEqual(parseSidecarEndpoint('szuDesktop 已启动: http://127.0.0.1:6001\n'+session),{baseUrl:'http://127.0.0.1:6001',owned:true,token:FAKE_TOKEN});
  assert.deepEqual(parseSidecarEndpoint(session.replace('\n','\r\n')+'日志\nszuDesktop 已复用: http://127.0.0.1:6002\r\n'),{baseUrl:'http://127.0.0.1:6002',owned:false,token:FAKE_TOKEN},'凭据行在前、CRLF 也可以');
  const url='szuDesktop 已启动: http://127.0.0.1:6001\n';
  for(const line of [
    '',                                                  // 没有凭据行
    `szuDesktop 会话: ${FAKE_TOKEN}`,                     // 半行：还没换行
    `szuDesktop 会话: ${FAKE_TOKEN.slice(1)}\n`,          // 63 位
    `szuDesktop 会话: ${FAKE_TOKEN}0\n`,                  // 65 位
    `szuDesktop 会话: ${FAKE_TOKEN.toUpperCase()}\n`,     // 大写
    `szuDesktop 会话: ${FAKE_TOKEN.slice(1)}g\n`,         // 非十六进制
    `日志 szuDesktop 会话: ${FAKE_TOKEN}\n`,               // 行首有别的内容（伪造）
    `szuDesktop 会话: ${FAKE_TOKEN} \n`,                  // 行尾多空格
    `szuDesktop 会话:${FAKE_TOKEN}\n`,                    // 少了空格
    `szuDesktop 会话: ${FAKE_TOKEN}\rx\n`,                // CR 后还有内容
  ])assert.equal(parseSidecarEndpoint(url+line),null,JSON.stringify(line));
  // 凭据对，但地址行是半行：同样不就绪。
  assert.equal(parseSidecarEndpoint(session+'szuDesktop 已启动: http://127.0.0.1:600'),null);
  // 多条凭据行只取第一条合格的。
  assert.equal(parseSidecarEndpoint(url+`szuDesktop 会话: ${'f'.repeat(64)}\n`+session).token,'f'.repeat(64));
});

test('createEndpointParser: 按块喂入，跨块的半行拼起来，超长半行被丢弃',()=>{
  const text='日志一\nszuDesktop 已启动: http://127.0.0.1:52344\n日志二\n'+session;
  for(let size=1;size<=text.length;size+=7){
    const parse=createEndpointParser();
    let endpoint=null;
    for(let i=0;i<text.length;i+=size){
      endpoint=parse(text.slice(i,i+size));
      if(i+size<text.length)assert.equal(endpoint,null,`第 ${i} 块就提前就绪（每块 ${size}）`);
    }
    assert.deepEqual(endpoint,{baseUrl:'http://127.0.0.1:52344',owned:true,token:FAKE_TOKEN},`每块 ${size} 字符`);
  }
  const parse=createEndpointParser();
  assert.equal(parse('szuDesktop 已启动: http://127.0.0.1:52344\n'),null);
  // 一行几十 KB 的日志之后，行尾恰好像凭据行也不算：它不是一整行协议行。
  assert.equal(parse('x'.repeat(40000)),null);
  assert.equal(parse('szuDesktop 会话: '+FAKE_TOKEN+'\n'),null);
  assert.deepEqual(parse(session),{baseUrl:'http://127.0.0.1:52344',owned:true,token:FAKE_TOKEN});
});

test('launchUrl / redactToken: 首次地址带一次性凭据，错误信息里抹掉它',()=>{
  const handle={baseUrl:'http://127.0.0.1:52344',token:FAKE_TOKEN};
  assert.equal(launchUrl(handle),'http://127.0.0.1:52344/?launch='+FAKE_TOKEN);
  const message=`ERR_CONNECTION_REFUSED (-102) loading '${launchUrl(handle)}'`;
  assert.equal(redactToken(message,FAKE_TOKEN),"ERR_CONNECTION_REFUSED (-102) loading 'http://127.0.0.1:52344/?launch=<会话凭据>'");
  assert.equal(redactToken(message+message,FAKE_TOKEN).includes(FAKE_TOKEN),false);
  for(const token of [undefined,null,''])assert.equal(redactToken('原样',token),'原样');
  assert.equal(redactToken(undefined,FAKE_TOKEN),'');
  assert.equal(TOKEN_HEADER,'X-SZU-Token');
});

// Go 真实的 panic 与 flag 用法输出：最后一行分别是栈帧和某个参数说明，都不是原因。
const goPanic='panic: runtime error: invalid memory address or nil pointer dereference\n[signal 0xc0000005 code=0x0 addr=0x0 pc=0x6e1a45]\n\ngoroutine 1 [running]:\nmain.main()\n\tszudesktop/desktop/cmd/szudesktop/main.go:57 +0x1a5\n';
const goUsage='flag provided but not defined: -x\nUsage of szudesktop:\n  -addr string\n    \t监听地址，默认随机端口 (default "127.0.0.1:0")\n  -no-open\n    \t不打开浏览器\n';
test('startupFailureReason: 只认“启动失败:”协议行',()=>{
  assert.equal(startupFailureReason('启动失败: 应用正在启动或退出，请稍后再打开\n'),'应用正在启动或退出，请稍后再打开');
  assert.equal(startupFailureReason('日志一\r\n启动失败：配置目录无法写入。\r\n\r\n  \n'),'配置目录无法写入');
  assert.equal(startupFailureReason('启动失败: 端口被占用\n之后的其他日志\n'),'端口被占用','协议行之后的普通日志不覆盖原因');
  for(const value of ['','\n \r\n',null,undefined,'panic: boom\n',goPanic,goUsage,'2026/09/27 启动失败的重试\n'])assert.equal(startupFailureReason(value),'',String(value));
  assert.equal(startupFailureReason('启动失败: '+'长'.repeat(500)).length,STARTUP_REASON_MAX);
  assert.equal(lastStderrLine(goPanic),'szudesktop/desktop/cmd/szudesktop/main.go:57 +0x1a5');
  assert.equal(lastStderrLine(goUsage),'不打开浏览器');
  assert.equal(lastStderrLine('x'.repeat(500)).length,STDERR_DETAIL_MAX);
  assert.equal(lastStderrLine('\n'),'');
});

test('startupErrorText: 有原因按原因处理，超时稍后再开，其余才建议重装',()=>{
  const reasoned=startupErrorText(Object.assign(new Error('后台引擎启动失败：本机配置目录无法写入'),{reason:'本机配置目录无法写入'}));
  assert.match(reasoned,/^后台引擎启动失败：本机配置目录无法写入。\n\n请按上面的原因处理/);
  assert.doesNotMatch(reasoned,/重新安装/);
  const later=startupErrorText(Object.assign(new Error('后台引擎启动超时（可能有旧的 szuDesktop 后台进程正在退出）'),{retryLater:true}));
  assert.match(later,/稍等几秒再重新打开/);assert.doesNotMatch(later,/重新安装/);
  assert.equal(startupErrorText(new Error('sidecar 提前退出，码 2')),'sidecar 提前退出，码 2。请重新打开应用；若仍失败，请重新安装。');
  assert.equal(startupErrorText(new Error('当前版本较旧。')),'当前版本较旧。请重新打开应用；若仍失败，请重新安装。','不重复句号');
});

test('startSidecar: 启动失败时把 stderr 里的原因带进错误，而不是只有退出码',async()=>{
  await assert.rejects(startSidecar({command:process.execPath,args:[fixture,'startup-error']}),error=>{
    assert.equal(error.message,'后台引擎启动失败：本机配置目录无法写入');
    assert.equal(error.reason,'本机配置目录无法写入');
    assert.equal(error.exitCode,1);
    return true;
  });
});

test('startSidecar: panic 这类非协议输出不算原因，只作附加细节并保留重装建议',async()=>{
  await assert.rejects(startSidecar({command:process.execPath,args:[fixture,'panic']}),error=>{
    assert.equal(error.reason,undefined);
    assert.equal(error.exitCode,2);
    assert.equal(error.message,'sidecar 提前退出，码 2（最后输出：szudesktop/desktop/cmd/szudesktop/main.go:57 +0x1a5）');
    assert.match(startupErrorText(error),/请重新安装/);
    return true;
  });
});

test('startSidecar: 一直不打印地址时超时，不建议重装，并回收进程',async()=>{
  await withFixtureFiles(async dir=>{
    await assert.rejects(startSidecar({command:process.execPath,args:[fixture,'slow-start',dir],readyTimeoutMs:800}),error=>{
      assert.equal(error.retryLater,true);
      assert.equal(error.reason,undefined,'普通日志不是原因');
      assert.equal(error.message,'后台引擎启动超时（可能有旧的 szuDesktop 后台进程正在退出），最后输出：2026/09/27 等待已有实例响应');
      assert.doesNotMatch(startupErrorText(error),/重新安装/);
      return true;
    });
    assert.equal(alive(Number(fs.readFileSync(path.join(dir,'parent.pid'),'utf8'))),false,'超时后回收卡住的引擎');
  });
});

test('startSidecar: 开发模式把启动前后的 stderr 转发到终端',async()=>{
  await withFixtureFiles(async dir=>{
    let forwarded='';
    const sink=new Writable({write(chunk,_encoding,done){forwarded+=chunk;done();}});
    const handle=await startSidecar({command:process.execPath,args:[fixture,'noisy',dir],stderrTo:sink});
    try{
      await (await fetch(handle.baseUrl+'/test/stderr')).text();
      for(let i=0;i<100&&!forwarded.includes('运行期日志');i++)await new Promise(resolve=>setTimeout(resolve,20));
      assert.ok(forwarded.endsWith('运行期日志\n'),'启动后的运行期日志仍然转发');
      assert.ok(forwarded.startsWith('日志'.repeat(100000)),'启动阶段的日志也完整转发');
    }finally{await handle.stop();}
  });
});

test('startSidecar: 打印地址后、健康检查前退出也带上原因',async()=>{
  await withFixtureFiles(async dir=>{
    await assert.rejects(startSidecar({command:process.execPath,args:[fixture,'exit-after-url',dir],healthTimeoutMs:5000}),
      {message:'后台引擎启动失败：应用正在启动或退出，请稍后再打开',reason:'应用正在启动或退出，请稍后再打开'});
  });
});

test('startSidecar: 大量 stderr 日志不会卡住启动，启动后不再保留日志',async()=>{
  await withFixtureFiles(async dir=>{
    const handle=await startSidecar({command:process.execPath,args:[fixture,'noisy',dir]});
    try{
      assert.equal(handle.token,FAKE_TOKEN);
      assert.equal((await fetch(handle.baseUrl+'/api/status')).status,200);
      assert.equal(handle.child.stderr.listenerCount('data'),0,'启动后只排空 stderr，不保留内容');
    }finally{await handle.stop();}
  });
});

test('startSidecar: 不存在的引擎返回受控错误',async()=>{
  await assert.rejects(startSidecar({command:path.join(here,'testdata','does-not-exist.exe'),readyTimeoutMs:500}),/ENOENT|启动失败/);
});

test('startSidecar: 拉起健康引擎，释放输出监听，幂等停止',async()=>{
  const handle=await startSidecar({command:process.execPath,args:[fake]});
  try{
    assert.equal(handle.owned,true);
    assert.equal((await fetch(handle.baseUrl+'/api/status')).status,200);
    assert.equal(handle.child.stdout.listenerCount('data'),0);
    assert.equal(handle.child.stderr.listenerCount('data'),0);
    assert.equal(handle.child.listenerCount('close'),0);
  }finally{await Promise.all([handle.stop(),handle.stop()]);}
  assert.equal(alive(handle.child.pid),false);
});

// 假引擎只接受带正确 X-SZU-Token 的关闭请求：写出 marker 就证明外壳带上了凭据。
test('stop: 优先等待自己引擎的正常 shutdown',async()=>{
  await withFixtureFiles(async dir=>{
    const handle=await startSidecar({command:process.execPath,args:[fixture,'graceful',dir]});
    try{
      await handle.stop();
      assert.equal(fs.readFileSync(path.join(dir,'graceful.marker'),'utf8'),'shutdown accepted');
      assert.equal(handle.child.exitCode,0);
      assert.equal(alive(handle.child.pid),false);
    }finally{await handle.stop();}
  });
});

test('startSidecar: 分块输出端口和凭据时等待换行',async()=>{
  const handle=await startSidecar({command:process.execPath,args:[fixture,'chunked']});
  try{
    assert.equal(handle.token,FAKE_TOKEN);
    assert.equal((await fetch(handle.baseUrl+'/api/status')).status,200);
  }finally{await handle.stop();}
});

// 只有地址、没有合格的凭据行：不能当成就绪，按启动超时处理并回收进程，错误里也不带任何凭据片段。
for(const mode of ['no-session','forged-session'])test('startSidecar: '+mode+' 不算就绪',async()=>{
  await withFixtureFiles(async dir=>{
    await assert.rejects(startSidecar({command:process.execPath,args:[fixture,mode,dir],readyTimeoutMs:800}),error=>{
      assert.equal(error.retryLater,true);
      assert.doesNotMatch(error.message,/[0-9a-f]{16}/i);
      return true;
    });
    assert.equal(alive(Number(fs.readFileSync(path.join(dir,'parent.pid'),'utf8'))),false,'超时后回收引擎');
  });
});

// Windows 上清理要另起 taskkill，CI 机器上单次可能要一两秒；截止时间本身仍由 350ms 的健康超时验证。
const cleanupBudget=process.platform==='win32'?8000:4000;
for(const mode of ['unhealthy','hanging','hanging-body','wrong-app'])test('startSidecar: '+mode+' 健康请求有总截止时间且回收进程',async()=>{
  await withFixtureFiles(async dir=>{
    const started=Date.now();
    let watchdog;
    try{
      await assert.rejects(Promise.race([
        startSidecar({command:process.execPath,args:[fixture,mode,dir],healthTimeoutMs:350}),
        new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(new Error('测试看门狗：健康探测没有截止')),cleanupBudget+1000);}),
      ]),/健康探测超时/);
    }finally{clearTimeout(watchdog);}
    assert.ok(Date.now()-started<cleanupBudget,'应及时结束启动失败清理');
    assert.equal(alive(Number(fs.readFileSync(path.join(dir,'parent.pid'),'utf8'))),false);
  });
});

test('startSidecar: 版本匹配的已有服务可复用，停止不杀已有引擎',async()=>{
  const server=http.createServer((req,res)=>res.end(JSON.stringify({ok:true,app:'szuDesktop',app_version:'beta0.9.3'})));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl='http://127.0.0.1:'+server.address().port;
  try{
    const handle=await startSidecar({command:process.execPath,args:[fixture,'reuse',baseUrl],expectedVersion:'beta0.9.3'});
    assert.equal(handle.owned,false);
    assert.equal(handle.baseUrl,baseUrl);
    assert.equal(handle.token,FAKE_TOKEN,'复用时交出正在运行那份服务的凭据');
    assert.equal(handle.child.exitCode,0);
    await handle.stop();
    assert.equal((await fetch(baseUrl+'/api/status')).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

for(const version of ['beta0.9.1',undefined])test('startSidecar: '+(version||'缺失版本')+' 共享引擎拒绝复用且保持存活',async()=>{
  const requests=[];
  const server=http.createServer((req,res)=>{
    requests.push(req.url);
    res.end(JSON.stringify({ok:true,app:'szuDesktop',app_version:version}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl='http://127.0.0.1:'+server.address().port;
  try{
    await assert.rejects(startSidecar({command:process.execPath,args:[fixture,'reuse',baseUrl],expectedVersion:'beta0.9.3'}),/请先退出旧版.*便携版/);
    assert.equal((await fetch(baseUrl+'/api/health')).status,200);
    assert.ok(!requests.includes('/api/shutdown'),'不得关闭不属于当前外壳的服务');
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('startSidecar: 外网状态挂起时本机健康接口仍能就绪',async()=>{
  const handle=await startSidecar({command:process.execPath,args:[fixture,'offline'],healthTimeoutMs:500});
  try{
    assert.equal((await (await fetch(handle.baseUrl+'/api/health')).json()).app,'szuDesktop');
    await assert.rejects(fetch(handle.baseUrl+'/api/status',{signal:AbortSignal.timeout(100)}));
  }finally{await handle.stop();}
});

test('startSidecar: 旧版共享引擎缺少健康接口时提示退出旧版，且不关它',async()=>{
  const server=http.createServer((req,res)=>{res.statusCode=req.url==='/api/health'?404:200;res.end('{}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl='http://127.0.0.1:'+server.address().port;
  try{
    await assert.rejects(startSidecar({command:process.execPath,args:[fixture,'reuse',baseUrl]}),/请先退出旧版/);
    assert.equal((await fetch(baseUrl+'/api/status')).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('startSidecar: 没有就绪行的零退出不是成功复用',async()=>{
  await assert.rejects(startSidecar({command:process.execPath,args:['-e','process.exit(0)']}),/提前退出/);
});

test('startSidecar: 复用启动器异常退出不返回成功',async()=>{
  await assert.rejects(startSidecar({command:process.execPath,args:[fixture,'reuse-failed','http://127.0.0.1:32123']}),/提前退出/);
});

if(process.platform==='win32')test('stop: Windows 等待整棵自己启动的进程树终止',async()=>{
  await withFixtureFiles(async dir=>{
    const handle=await startSidecar({command:process.execPath,args:[fixture,'tree',dir]});
    try{
      const descendantPid=Number(fs.readFileSync(path.join(dir,'descendant.pid'),'utf8'));
      assert.equal(alive(descendantPid),true);
      // 直接走强制清理分支并计时：taskkill 必须自己结束，而不是拖到它的超时才返回。
      const started=Date.now();
      await stopSidecar(handle.child);
      const elapsed=Date.now()-started;
      assert.ok(elapsed<TASKKILL_TIMEOUT_MS,`进程树清理用了 ${elapsed}ms，已接近 taskkill 超时`);
      assert.equal(alive(handle.child.pid),false);
      assert.equal(alive(descendantPid),false,'stop 完成时后代进程仍存活');
    }finally{await handle.stop();}
  });
});

test('engine monitor: 自己的引擎退出或复用的服务失联时只提示一次，退出流程中不提示',async()=>{
  const dialog=fakeDialog([0,1]),app={relaunches:0,quits:0,relaunch(){this.relaunches++;},quit(){this.quits++;}},mainWin={isDestroyed:()=>false};
  let quitting=false;
  const owned=createEngineMonitor({app,dialog,getMainWindow:()=>mainWin,isQuitting:()=>quitting});
  const child=new EventEmitter();
  owned.watch({owned:true,child});
  child.emit('exit',1);await settle();
  assert.equal(dialog.boxes.length,1);assert.equal(dialog.boxes[0].parent,mainWin);
  assert.equal(dialog.boxes[0].options.detail,'后台引擎意外结束，请重新打开应用。已保存的庭院和学习记录会保留。');
  assert.deepEqual(dialog.boxes[0].options.buttons,['重新打开','退出']);
  assert.equal(app.relaunches,1,'"重新打开" relaunches');assert.equal(app.quits,1);
  await owned.failed('窗口进程意外结束，请重新打开应用');assert.equal(dialog.boxes.length,1,'only one prompt per run');
  // 复用便携版的引擎：定时查健康状态，别的应用占了端口或服务停了才提示；退出流程中不查。
  let health={ok:true,app:'szuDesktop'},checks=0,tick=null;
  const reused=createEngineMonitor({app,dialog,getMainWindow:()=>null,isQuitting:()=>quitting,
    fetch:async(url,options)=>{checks++;assert.equal(url,'http://127.0.0.1:1/api/health');assert.ok(options.signal);return {ok:true,json:async()=>health};},
    setInterval:(fn,ms)=>{assert.equal(ms,ENGINE_HEALTH_INTERVAL_MS);tick=fn;return {unref(){}};},clearInterval:()=>{tick=null;}});
  reused.watch({owned:false,baseUrl:'http://127.0.0.1:1'});
  await tick();assert.equal(checks,1);assert.equal(dialog.boxes.length,1,'a healthy reused service stays quiet');
  health={ok:true,app:'other'};quitting=true;await tick();assert.equal(checks,1,'no checks while quitting');
  quitting=false;await tick();await settle();
  assert.equal(dialog.boxes.length,2);assert.equal(dialog.boxes[1].parent,null,'without a main window the prompt is app-modal');
  assert.match(dialog.boxes[1].options.detail,/^此前已运行的后台服务已停止/);assert.equal(app.relaunches,1,'"退出" does not relaunch');
  reused.stop();assert.equal(tick,null);
});

test('isSafeExternalUrl: 放行 http/https，拒绝危险与相对 URI',()=>{
  for(const url of ['http://example.com','https://example.com','HTTPS://Example.COM'])assert.equal(isSafeExternalUrl(url),true);
  for(const url of ['file:///C:/x','search-ms:query','ms-msdt:x','javascript:alert(1)','data:text/html,x','','relative/path','//example.com'])assert.equal(isSafeExternalUrl(url),false);
});

for(const {name,fn} of tests){await fn();console.log('PASS',name);}
console.log(tests.length+' checks passed');
