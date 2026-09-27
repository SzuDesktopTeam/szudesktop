import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {isFeishuDocumentURL,isFeishuPermissionAllowed,isOfficialFeishuURL} from './feishu-policy.mjs';
import {schoolTargets} from './school-policy.mjs';
import {createFeishuWindow} from './feishu-window.mjs';
import {createOfficialWindows} from './official-windows.mjs';
import {fakeDialog} from './testdata/fake-electron.mjs';

for(const url of ['https://course.feishu.cn/docx/ABC123?from=share','https://course.larksuite.com/wiki/ABC123/','https://course.larkoffice.com/docx/ABC123'])assert.ok(isFeishuDocumentURL(url),url);
for(const url of ['https://accounts.feishu.cn/accounts/page/login','https://passport.larksuite.com/login','https://www.larkoffice.com/']){
  assert.ok(isOfficialFeishuURL(url));assert.equal(isFeishuDocumentURL(url),false);
}
for(const url of ['http://course.feishu.cn/docx/ABC123','https://course.feishu.cn.evil.test/docx/ABC123','https://user@course.feishu.cn/docx/ABC123','https://course.feishu.cn:444/docx/ABC123','https://127.0.0.1/docx/ABC123','https://evil.test/#https://course.feishu.cn/docx/ABC123','file:///C:/test','javascript:alert(1)','lark://open','https://course.feishu.cn/docx/%41BC123'])assert.equal(isFeishuDocumentURL(url),false,url);
for(const url of ['https://course.feishu.cn/base/ABC123','https://course.feishu.cn/docx/ABC123/extra'])assert.equal(isFeishuDocumentURL(url),false,url);

const windows=[],external=[],cleared=[],errors=[],messages=[];
let loadResult=()=>Promise.resolve(),expectError=false;
let permissionRequest,permissionCheck;
const profile={setPermissionRequestHandler(fn){permissionRequest=fn;},setPermissionCheckHandler(fn){permissionCheck=fn;},async clearStorageData(){cleared.push('storage');},async clearCache(){cleared.push('cache');}};
class FakeWindow extends EventEmitter{
  constructor(options){
    super();this.options=options;this.urls=[];this.url='';this.destroyed=false;windows.push(this);
    this.webContents=new EventEmitter();
    Object.assign(this.webContents,{navigationHistory:{canGoBack:()=>true,goBack:()=>{this.back=true;}},
      setWindowOpenHandler:fn=>{this.popup=fn;},getURL:()=>this.url,reload:()=>{this.reloaded=true;}});
  }
  loadURL(url){this.url=url;this.urls.push(url);return loadResult(url,this);}
  isDestroyed(){return this.destroyed;}
  show(){this.shown=true;}focus(){this.focused=true;}setTitle(title){this.title=title;}setMenu(menu){this.menu=menu;}
  destroy(){this.destroyed=true;this.emit('closed');}close(){this.destroy();}
}
const source=readFileSync(new URL('./feishu-window.mjs',import.meta.url),'utf8');
// 直接调用真实模块：electron 对象全部由参数注入，这里换成假窗口、假会话和假系统浏览器。
const controller=createFeishuWindow({BrowserWindow:FakeWindow,Menu:{buildFromTemplate:value=>value},
  dialog:{showErrorBox(title,message){if(!expectError)assert.fail('unexpected window error');errors.push(title);messages.push(message);}},
  session:{fromPartition:(name,options)=>{assert.equal(name,'szu-feishu-official');assert.deepEqual(options,{cache:false});return profile;}},
  shell:{openExternal:async url=>{external.push(url);}}});
await assert.rejects(controller.open('https://evil.test/'),/官方课程文档/);
assert.equal(windows.length,0);
await controller.open('https://course.feishu.cn/docx/ABC123');
await controller.open('https://course.feishu.cn/docx/ABC123');
const win=windows[0],wc=win.webContents;
assert.equal(windows.length,1);assert.equal(win.urls.length,1);
assert.deepEqual(win.options.webPreferences,{session:profile,contextIsolation:true,nodeIntegration:false,sandbox:true});
assert.ok(win.shown&&win.focused);
permissionRequest(null,'media',allowed=>assert.equal(allowed,false));assert.equal(permissionCheck(),false);
// 官方页面只放行复制链接/代码块和全屏；其他权限、其他来源一律拒绝。
const official={getURL:()=>'https://course.feishu.cn/docx/ABC123'},decisions=[];
for(const permission of ['clipboard-sanitized-write','fullscreen'])permissionRequest(official,permission,allowed=>decisions.push(allowed),{requestingUrl:'https://course.feishu.cn/docx/ABC123',isMainFrame:true});
assert.deepEqual(decisions,[true,true]);
for(const [wc,permission,details] of [[official,'clipboard-read',{requestingUrl:'https://course.feishu.cn/docx/ABC123'}],[official,'media',{requestingUrl:'https://course.feishu.cn/'}],
  [official,'notifications',{requestingUrl:'https://course.feishu.cn/'}],[official,'geolocation',{requestingUrl:'https://course.feishu.cn/'}],
  [official,'fullscreen',{requestingUrl:'https://evil.test/'}],[official,'clipboard-sanitized-write',{requestingUrl:'http://course.feishu.cn/'}],
  [{getURL:()=>'https://evil.test/embed'},'fullscreen',{requestingUrl:'https://course.feishu.cn/embed'}],[official,'fullscreen',undefined]])
  permissionRequest(wc,permission,allowed=>assert.equal(allowed,false,permission),details);
assert.equal(permissionCheck(null,'clipboard-sanitized-write','https://course.feishu.cn',{embeddingOrigin:'https://course.feishu.cn',isMainFrame:true}),true);
assert.equal(permissionCheck(null,'fullscreen','https://docs.larksuite.com',{isMainFrame:false}),true);
for(const [permission,origin,details] of [['clipboard-read','https://course.feishu.cn',{}],['media','https://course.feishu.cn',{}],
  ['clipboard-sanitized-write','https://course.feishu.cn.evil.test',{}],['fullscreen','https://course.feishu.cn',{embeddingOrigin:'https://evil.test'}],['fullscreen','',{}]])
  assert.equal(permissionCheck(null,permission,origin,details),false,permission+' '+origin);
await controller.open('https://course.feishu.cn/wiki/XYZ789');
assert.equal(windows.length,1);assert.equal(win.urls.length,2);
const blocked=()=>({prevented:false,preventDefault(){this.prevented=true;}});
let event=blocked();wc.emit('will-navigate',event,'https://external.example/reading');
assert.ok(event.prevented);assert.deepEqual(external,['https://external.example/reading']);
event=blocked();wc.emit('will-redirect',event,'https://external.example/redirect');
assert.ok(event.prevented);assert.equal(external.length,1);
event=blocked();wc.emit('will-navigate',event,'javascript:alert(1)');
assert.ok(event.prevented);assert.equal(external.length,1);
event=blocked();wc.emit('will-navigate',event,'https://accounts.feishu.cn/login');assert.equal(event.prevented,false);
assert.deepEqual(win.popup({url:'https://accounts.feishu.cn/login'}),{action:'deny'});
assert.equal(win.url,'https://accounts.feishu.cn/login');
assert.deepEqual(win.popup({url:'file:///C:/test'}),{action:'deny'});assert.equal(external.length,1);
assert.deepEqual(win.popup({url:'https://external.example/paper'}),{action:'deny'});
assert.equal(external.at(-1),'https://external.example/paper');assert.equal(windows.length,1);
const menu=win.menu[0].submenu;
menu.find(item=>item.label==='返回').click();assert.ok(win.back);
menu.find(item=>item.label==='刷新').click();assert.ok(win.reloaded);
menu.find(item=>item.label==='在系统浏览器打开').click();assert.equal(external.at(-1),'https://accounts.feishu.cn/login');
// 登录跳转打断 loadURL（ERR_ABORTED）不弹错误框；真正打不开时仍提示。
const settle=()=>new Promise(resolve=>setImmediate(resolve));
loadResult=()=>Promise.reject(Object.assign(new Error('ERR_ABORTED (-3)'),{code:'ERR_ABORTED',errno:-3}));
await controller.open('https://course.feishu.cn/docx/ABORT1');await settle();
assert.deepEqual(errors,[]);
expectError=true;loadResult=()=>Promise.reject(Object.assign(new Error('ERR_CONNECTION_RESET (-101)'),{code:'ERR_CONNECTION_RESET',errno:-101}));
await controller.open('https://course.feishu.cn/docx/RESET1');await settle();
assert.deepEqual(errors,['飞书页面暂时无法打开']);
assert.match(messages.at(-1),/请检查网络/);
// 租户走第三方单点登录：我们拦下的主框架重定向导致的 ERR_ABORTED 要说明原因，菜单能改在系统浏览器打开原文档。
const aborted=Object.assign(new Error('ERR_ABORTED (-3)'),{code:'ERR_ABORTED',errno:-3});
const redirect=(target,url,isMainFrame=true)=>{
  const event={isMainFrame,prevented:false,preventDefault(){this.prevented=true;}};
  target.webContents.emit('will-redirect',event,url);return event;
};
let ssoEvent;
loadResult=(_url,target)=>{ssoEvent=redirect(target,'https://sso.example.edu.cn/login?service=feishu');target.url='';return Promise.reject(aborted);};
await controller.open('https://course.feishu.cn/docx/SSO1');await settle();
assert.ok(ssoEvent.prevented,'third-party redirect stays blocked');
assert.deepEqual(errors,['飞书页面暂时无法打开','飞书页面暂时无法打开'],'a redirect we blocked is not a silent navigation');
assert.match(messages.at(-1),/飞书官方域名以外的地址（https:\/\/sso\.example\.edu\.cn）/);
const externalBefore=external.length;
menu.find(item=>item.label==='在系统浏览器打开').click();await settle();
assert.deepEqual(external.slice(externalBefore),['https://course.feishu.cn/docx/SSO1'],'menu falls back to the requested document');
expectError=false;
// 子框架被拦或允许的重定向不改变判断；被拦记录只属于那一次加载。
loadResult=(_url,target)=>{redirect(target,'https://ads.example/frame',false);redirect(target,'https://accounts.feishu.cn/login');return Promise.reject(aborted);};
await controller.open('https://course.feishu.cn/docx/FRAME1');await settle();
loadResult=()=>Promise.reject(aborted);
await controller.open('https://course.feishu.cn/docx/ABORT2');await settle();
assert.equal(errors.length,2);
loadResult=()=>Promise.resolve();
await controller.shutdown();assert.ok(win.destroyed);assert.deepEqual(cleared,['storage','cache']);
assert.doesNotMatch(source,/preload:|nodeIntegration:true|sandbox:false|webSecurity:false|cookies\.get|executeJavaScript/);
// 学校与飞书窗口接线（official-windows）：主窗点开的外部地址按域名分流，只有安全的网页链接交给系统浏览器；
// 退出时关窗并清掉会话，学校会话清不掉时按需提示。szu:feishu-open 的来源核对见 check-window-policy。
{
  loadResult=()=>Promise.resolve();
  const dialog=fakeDialog(),opened=[],cleared=[],partitions=[];let quitting=false,report=true,shellFails=false;
  const officialSession={fromPartition:(name,options)=>{
    assert.deepEqual(options,{cache:false});partitions.push(name);
    return {setPermissionRequestHandler(){},setPermissionCheckHandler(){},cookies:{get:async()=>[]},
      clearStorageData:async()=>{cleared.push(name+':storage');},clearCache:async()=>{cleared.push(name+':cache');}};
  }};
  const deps={BrowserWindow:FakeWindow,Menu:{buildFromTemplate:value=>value},dialog,session:officialSession,
    shell:{openExternal:async url=>{if(shellFails)throw Error('no browser');opened.push(url);}},
    getBaseURL:()=>'http://127.0.0.1:1',getToken:()=>'0123456789abcdef'.repeat(4),isQuitting:()=>quitting,reportSchoolCleanup:()=>report};
  const official=createOfficialWindows(deps);
  assert.deepEqual(partitions,['szu-official','szu-feishu-official'],'school and Feishu pages use separate in-memory sessions');
  const before=windows.length;
  for(const url of ['https://course.feishu.cn/docx/ROUTE1',schoolTargets.undergrad,'https://example.com/paper','file:///C:/secret','javascript:alert(1)','search-ms:query=x'])official.openExternal(url);
  await settle();
  assert.deepEqual(windows.slice(before).map(win=>win.urls[0]),['https://course.feishu.cn/docx/ROUTE1',schoolTargets.undergrad],'documents and school pages open in their own windows');
  assert.deepEqual(opened,['https://example.com/paper'],'only safe web links reach the system browser');
  shellFails=true;official.openExternal('https://example.com/a');await settle();
  assert.equal(dialog.errors.at(-1)?.title,'未能打开浏览器');
  const shown=dialog.errors.length;quitting=true;official.openExternal('https://example.com/b');await settle();
  assert.equal(dialog.errors.length,shown,'no browser error while quitting');
  await official.shutdown();
  assert.ok(windows.slice(before).every(win=>win.destroyed),'both official windows close on quit');
  assert.deepEqual(cleared,['szu-feishu-official:storage','szu-feishu-official:cache']);
  // 学校会话清不掉（后台服务已经不在）：复用便携版引擎时提示用户，其余情况静默。
  const realFetch=globalThis.fetch;let failing;
  globalThis.fetch=async()=>({ok:false,json:async()=>({message:'后台服务已停止'})});
  try{failing=createOfficialWindows(deps);}finally{globalThis.fetch=realFetch;}
  await assert.rejects(failing.school.sync('undergrad'),/后台服务已停止/);
  await failing.shutdown();
  assert.deepEqual(dialog.errors.at(-1),{title:'学校登录未能清除',message:'请在仍运行的便携版中清除学校登录，或退出该后台服务。'});
  const reported=dialog.errors.length;report=false;await failing.shutdown();
  assert.equal(dialog.errors.length,reported);
}
assert.match(readFileSync(new URL('./preload.cjs',import.meta.url),'utf8'),/openFeishu: \(url\) => ipcRenderer\.invoke\('szu:feishu-open', url\)/);
assert.equal(isFeishuPermissionAllowed('fullscreen','https://www.larkoffice.com/'),true);
assert.equal(isFeishuPermissionAllowed('fullscreen','https://www.larkoffice.com/','about:blank'),false);
console.log('Feishu window: official document/login boundaries, sandbox, isolated session, minimal editor permissions, interrupted loads, blocked redirects, window reuse, external navigation, link routing and session cleanup passed');
