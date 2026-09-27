import {spawn, execFile} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createEndpointParser, startupFailureReason, lastStderrLine, TOKEN_HEADER} from './listen-url.mjs';

const hasExited=child=>child.exitCode!==null||child.signalCode!==null;
const STDERR_TAIL=2048;
// taskkill 自身的超时；正常的进程树清理应当远早于它结束。
export const TASKKILL_TIMEOUT_MS=3000;

// Electron 的 GUI 进程没有控制台，stderr 必须自己接住。启动阶段只保留最后约 2KB，
// 用来把 Go 写的“启动失败: <原因>”带进错误框；启动成功后不再保留内容。
// 开发模式传入 sink（process.stderr），Go 运行期的日志和 panic 照常出现在终端。
function captureStderr(child,sink){
  const stream=child.stderr;
  let text='',keep=true;
  const onData=chunk=>{
    if(keep)text=(text+chunk).slice(-STDERR_TAIL);
    try{sink?.write(chunk);}catch{}
  };
  const ended=new Promise(resolve=>{
    if(!stream){resolve();return;}
    stream.once('end',resolve);stream.once('close',resolve);
  });
  stream?.setEncoding('utf8');
  stream?.on('data',onData);
  return {
    text:()=>text,
    // 进程 exit 可能早于 stderr 读完；最多再等 200ms，孙进程占着管道也不会卡住启动。
    settled:()=>Promise.race([ended,delay(200)]),
    release(){
      keep=false;text='';
      if(!sink){stream?.removeListener('data',onData);stream?.resume();}
    },
  };
}

// 只有 Go 的“启动失败: <原因>”协议行才算原因；其他输出（panic 栈、flag 用法）
// 只作为附加细节放进错误，仍按原来的方式提示用户。
function reasonError(reason,extra={}){
  return Object.assign(new Error('后台引擎启动失败：'+reason),{reason,...extra});
}
function exitError(code,stderr){
  const reason=startupFailureReason(stderr);
  if(reason)return reasonError(reason,{exitCode:code});
  const detail=lastStderrLine(stderr);
  return Object.assign(new Error('sidecar 提前退出，码 '+code+(detail?'（最后输出：'+detail+'）':'')),{exitCode:code});
}
// 一直没打印监听地址：多半是旧的后台进程还在退出，Go 正在等它交出实例锁。
// 重装解决不了这种情况，提示稍后再开。
function timeoutError(stderr){
  const reason=startupFailureReason(stderr);
  if(reason)return reasonError(reason);
  const detail=lastStderrLine(stderr);
  return Object.assign(new Error('后台引擎启动超时（可能有旧的 szuDesktop 后台进程正在退出）'+(detail?'，最后输出：'+detail:'')),{retryLater:true});
}
// 启动失败错误框的正文：有原因按原因处理；超时请稍后再开；其余情况才建议重装。
export function startupErrorText(error){
  const message=String(error?.message||'后台引擎没有启动').replace(/[。.\s]+$/,'');
  if(error?.reason)return message+'。\n\n请按上面的原因处理后重新打开应用；若仍失败，反馈时请附上这段原因。';
  if(error?.retryLater)return message+'。\n\n请稍等几秒再重新打开应用；若仍失败，请在任务管理器结束残留的 szudesktop 后台进程，或重启电脑后再试。';
  return message+'。请重新打开应用；若仍失败，请重新安装。';
}

function waitForUrl(child, timeoutMs, stderr){
  return new Promise((resolve,reject)=>{
    const parse=createEndpointParser();
    const cleanup=()=>{
      clearTimeout(timer);
      child.stdout.removeListener('data',onData);
      child.removeListener('error',onError);
      child.removeListener('close',onClose);
      // Keep draining logs without retaining their contents after discovery.
      child.stdout.resume();
    };
    const finish=(err,endpoint)=>{cleanup();if(err)reject(err);else resolve(endpoint);};
    const onError=err=>finish(new Error('sidecar 启动失败: '+err.message,{cause:err}));
    // close follows both stdio streams, so the stderr tail is complete here.
    const onClose=code=>finish(exitError(code,stderr.text()));
    // 地址行和凭据行可能分在不同的块里，解析器自己保留半行和已经认出的那一行。
    const onData=chunk=>{
      const endpoint=parse(chunk);
      if(endpoint)finish(null,endpoint);
    };
    const timer=setTimeout(()=>finish(timeoutError(stderr.text())),timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',onData);
    child.once('error',onError);
    // close follows stdout drain, so a short-lived reuse launcher is parsed first.
    child.once('close',onClose);
  });
}

function waitForExit(child,timeoutMs){
  if(hasExited(child))return Promise.resolve(true);
  return new Promise(resolve=>{
    const finish=exited=>{clearTimeout(timer);child.removeListener('exit',onExit);resolve(exited);};
    const onExit=()=>finish(true);
    const timer=setTimeout(()=>finish(false),timeoutMs);
    child.once('exit',onExit);
  });
}

async function waitHealthy(baseUrl, readyPath, timeoutMs, child, expectedVersion, stderr){
  const controller=new AbortController();
  const timeoutError=new Error('sidecar 健康探测超时: '+baseUrl+readyPath);
  const timer=setTimeout(()=>controller.abort(timeoutError),timeoutMs);
  const onExit=code=>{void stderr.settled().then(()=>controller.abort(exitError(code,stderr.text())));};
  if(child){child.once('exit',onExit);if(hasExited(child))onExit(child.exitCode);}
  try{
    while(!controller.signal.aborted){
      try{
        const response=await fetch(baseUrl+readyPath,{signal:controller.signal});
        if(!child&&response.status===404){
          response.body?.cancel().catch(()=>{});
          controller.abort(new Error('当前后台引擎版本较旧，请先退出旧版 szuDesktop 再打开'));
          throw controller.signal.reason;
        }
        if(response.ok){
          const identity=await response.json();
          if(identity.ok===true&&identity.app==='szuDesktop'){
            if(expectedVersion&&identity.app_version!==expectedVersion){
              controller.abort(new Error(child?'后台引擎与应用版本不一致，请重新安装当前版本'
                :'正在运行的后台程序与当前版本不一致，请先退出旧版 szuDesktop（包括便携版）后再打开'));
              throw controller.signal.reason;
            }
            return;
          }
        }else response.body?.cancel().catch(()=>{});
      }catch(err){if(controller.signal.aborted)throw controller.signal.reason;}
      try{await delay(150,undefined,{signal:controller.signal});}catch{throw controller.signal.reason;}
    }
    throw controller.signal.reason;
  }finally{
    clearTimeout(timer);
    child?.removeListener('exit',onExit);
  }
}

// stderrTo：可选的可写流，启动前后的 stderr 都原样转发过去（开发模式传 process.stderr）。
export async function startSidecar({command,args=[],env,cwd,expectedVersion,readyPath='/api/health',readyTimeoutMs=15000,healthTimeoutMs=8000,stderrTo}){
  const child=spawn(command,args,{env:env||process.env,cwd,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const stderr=captureStderr(child,stderrTo);
  let endpoint;
  try{
    endpoint=await waitForUrl(child,readyTimeoutMs,stderr);
    if(!endpoint.owned){
      if(!await waitForExit(child,readyTimeoutMs))throw new Error('sidecar 复用启动器退出超时');
      if(child.exitCode!==0){await stderr.settled();throw exitError(child.exitCode,stderr.text());}
    }
    await waitHealthy(endpoint.baseUrl,readyPath,healthTimeoutMs,endpoint.owned?child:null,expectedVersion,stderr);
  }catch(err){
    stderr.release();
    await stopSidecar(child);
    throw err;
  }
  stderr.release();
  let stopping;
  return {...endpoint,child,stop:()=>{
    if(!stopping)stopping=endpoint.owned?shutdownOwned(child,endpoint.baseUrl,endpoint.token):Promise.resolve();
    return stopping;
  }};
}

async function shutdownOwned(child,baseUrl,token){
  if(hasExited(child))return;
  let accepted=false;
  try{
    const response=await fetch(baseUrl+'/api/shutdown',{
      method:'POST',headers:{'content-type':'application/json',[TOKEN_HEADER]:token},body:'{}',signal:AbortSignal.timeout(1000),
    });
    accepted=response.ok;
    response.body?.cancel().catch(()=>{});
  }catch{}
  if(accepted&&await waitForExit(child,2000))return;
  await stopSidecar(child);
}

const pendingStops=new WeakMap();
export function stopSidecar(child){
  if(!child)return Promise.resolve();
  if(pendingStops.has(child))return pendingStops.get(child);
  if(!child.pid||hasExited(child))return Promise.resolve();
  const stopping=(async()=>{
    if(process.platform==='win32'){
      // Kill the tree while its root is still alive. Killing the parent first
      // destroys the relationship taskkill needs to find its descendants.
      await new Promise((resolve,reject)=>execFile('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,timeout:TASKKILL_TIMEOUT_MS},err=>{
        if(err&&!hasExited(child))reject(new Error('sidecar 进程树清理失败',{cause:err}));else resolve();
      }));
    }else{
      child.kill('SIGKILL');
    }
    if(!await waitForExit(child,1000))throw new Error('sidecar 退出超时');
  })();
  pendingStops.set(child,stopping);
  return stopping;
}
