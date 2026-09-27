import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {isAppUrl,isTrustedSender,contentSecurityPolicy} from './window-policy.mjs';
const base='http://127.0.0.1:45678';
assert.equal(isAppUrl(base+'/#garden',base),true);
for(const url of ['https://szu.edu.cn', 'http://127.0.0.1:45679/', 'http://127.0.0.1.evil.test:45678/', 'file:///a', 'javascript:alert(1)', 'http://user@127.0.0.1:45678']) assert.equal(isAppUrl(url,base),false,url);
const frame={url:base+'/'},wc={mainFrame:frame},win={webContents:wc};
assert.equal(isTrustedSender({sender:wc,senderFrame:frame},win,base),true);
assert.equal(isTrustedSender({sender:wc,senderFrame:{url:base+'/' }},win,base),false);
assert.equal(isTrustedSender({sender:{},senderFrame:frame},win,base),false);
frame.url='https://szu.edu.cn/';
assert.equal(isTrustedSender({sender:wc,senderFrame:frame},win,base),false);
assert.match(contentSecurityPolicy,/script-src 'self';/);
assert.doesNotMatch(contentSecurityPolicy,/unsafe-eval/);
console.log('Window policy: local navigation, IPC sender and CSP checks passed');

// Exercise the real preload and main-process save handshake without launching
// Electron or reading a profile. Tray quit must wait for editor persistence.
const main=readFileSync(new URL('./main.mjs',import.meta.url),'utf8');
const requestSource=main.slice(main.indexOf('function requestRendererSave(){'),main.indexOf('\nfunction desktopSettingsSnapshot(){'));
const replyStart=main.indexOf("  ipcMain.on('szu:quit-prepared'");
const replySource=main.slice(replyStart,main.indexOf('\n  });',replyStart)+6);
const renderer=new EventEmitter(),handlers=new Map();
let bridge,timer,crashed=false,sendCount=0;
const quitFrame={url:base+'/'};
const quitWC={mainFrame:quitFrame,isDestroyed:()=>false,isCrashed:()=>crashed,
  send:(channel,id)=>{sendCount++;renderer.emit(channel,{},id);}};
const quitWin={webContents:quitWC,isDestroyed:()=>false};
const ipcEvent={sender:quitWC,senderFrame:quitFrame};
renderer.send=(channel,payload)=>handlers.get(channel)?.(ipcEvent,payload);
renderer.invoke=async()=>{};
const guard=new Function('mainWin','handle','ipcMain','isTrustedSender','setTimeout','clearTimeout',
  'let quitRequest=0,pendingQuit=null,sessionEnding=false;\n'+requestSource+'\n'+replySource+
  '\nreturn {request:requestRendererSave,pending:()=>pendingQuit?.id,endSession:()=>{sessionEnding=true;}};'
)(quitWin,{baseUrl:base},{on:(channel,callback)=>handlers.set(channel,callback)},isTrustedSender,
  (callback,milliseconds)=>{assert.equal(milliseconds,5000);timer={callback,active:true};return timer;},item=>{item.active=false;});
vm.runInNewContext(readFileSync(new URL('./preload.cjs',import.meta.url),'utf8'),{
  require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}},ipcRenderer:renderer}),
});
assert.deepEqual(await guard.request(),{ok:true,message:'笔记尚未保存'}); // No editor mounted during startup.
let complete;
bridge.onBeforeQuit(()=>new Promise(resolve=>{complete=resolve;}));
let settled=false;
const saving=guard.request().then(result=>{settled=true;return result;});
await Promise.resolve();assert.equal(settled,false);
const id=guard.pending();
handlers.get('szu:quit-prepared')({sender:quitWC,senderFrame:{url:base+'/'}},{id,ok:true});
handlers.get('szu:quit-prepared')(ipcEvent,{id:id+1,ok:true});
assert.equal(guard.pending(),id);assert.equal(settled,false);
complete();assert.equal((await saving).ok,true);assert.equal(guard.pending(),undefined);
bridge.onBeforeQuit(async()=>{throw Error('磁盘已满');});
assert.deepEqual(await guard.request(),{ok:false,message:'磁盘已满'});
bridge.onBeforeQuit(()=>new Promise(()=>{}));
const stalled=guard.request();timer.callback();
assert.equal((await stalled).ok,false);assert.equal(guard.pending(),undefined);
crashed=true;const beforeCrash=sendCount;assert.deepEqual(await guard.request(),{ok:true});assert.equal(sendCount,beforeCrash);
crashed=false;guard.endSession();assert.deepEqual(await guard.request(),{ok:true});assert.equal(sendCount,beforeCrash);
assert.ok(main.indexOf('const saved=await requestRendererSave()')<main.lastIndexOf('mainWin.destroy()'));
assert.match(main,/if\(answer\.response!==1\)\{shutdownPromise=null;return;\}/);
console.log('Quit save: persistence awaited, failure preserved, forged replies rejected, bounded wait and crash/session shutdown passed');
