import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {academicCookies,isSchoolURL,schoolTargets} from './school-policy.mjs';
import {createSchoolWindows} from './school-window.mjs';
import {isNavigationAbort} from './window-policy.mjs';
for(const url of Object.values(schoolTargets))assert.ok(isSchoolURL(url));
assert.ok(isSchoolURL('https://authserver-443.webvpn.szu.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.szu.edu.cn%2F'));
for(const url of ['https://szu.edu.cn.evil.test/','http://ehall.szu.edu.cn/','https://ehall.szu.edu.cn:444/','https://user@ehall.szu.edu.cn/','https://authserver-443.webvpn.szu.edu.cn.evil.test/','http://authserver-443.webvpn.szu.edu.cn/','https://other.webvpn.szu.edu.cn/','file:///C:/test','javascript:alert(1)'])assert.equal(isSchoolURL(url),false,url);
assert.deepEqual(academicCookies([
 {domain:'ehall.szu.edu.cn',path:'/jwapp',name:'s',value:'test-only'},
 {domain:'swzx.webvpn.szu.edu.cn',path:'/',name:'vpn',value:'separate'},
 {domain:'example.org',path:'/',name:'other',value:'excluded'},
]),[{name:'s',value:'test-only',path:'/jwapp'}]);
const window=readFileSync(new URL('./school-window.mjs',import.meta.url),'utf8');
assert.doesNotMatch(window,/webSecurity:false|preload:|nodeIntegration:true|sandbox:false/);
// Exercise the real sync path without Electron, the network or any user profile.
// An empty official profile must still reach Go so it can replace the selected
// account, rather than leave a previously imported person's session available.
const requests=[];
let responseStatus=400,responseMessage='请先在应用内的学校页面完成登录';
const profile={setPermissionRequestHandler(){},setPermissionCheckHandler(){},setProxy:async()=>{},cookies:{get:async()=>[]},clearStorageData:async()=>{},clearCache:async()=>{}};
// 学校会话只在内存里（没有 persist: 前缀），退出即失效。
const fromPartition=(name,options)=>{assert.equal(name,'szu-official');assert.deepEqual(options,{cache:false});return profile;};
const localApi=async(url,options)=>{
 requests.push({url,options});
 return {ok:false,status:responseStatus,json:async()=>({ok:false,message:responseMessage})};
};
// 主进程调本机服务必须带 sidecar 交来的凭据（Go 对没有凭据的请求回 401）。
const token='0123456789abcdef'.repeat(4);
const school=createSchoolWindows(()=>'http://127.0.0.1:1234',()=>token,{session:{fromPartition},fetch:localApi});
for(const business of ['undergrad','graduate','undergrad-scores','graduate-scores']){
 await assert.rejects(school.sync(business),/请先在应用内的学校页面完成登录/);
 const {url,options}=requests.at(-1);
 assert.equal(url,'http://127.0.0.1:1234/api/academic/browser-session');
 assert.equal(options.method,'POST');
 assert.equal(options.headers['X-SZU-Token'],token);
 assert.deepEqual(JSON.parse(options.body),{business,cookies:[]});
}
assert.equal(requests.length,4);
responseStatus=403;
responseMessage='当前账号没有所选业务的访问权限，请核对培养层次或在官方系统确认权限';
await assert.rejects(school.sync('undergrad'),{message:responseMessage});
// 清除本次学校登录同样带凭据。
await assert.rejects(school.clear(),{message:responseMessage});
assert.equal(requests.at(-1).url,'http://127.0.0.1:1234/api/academic/browser-session?scope=all');
assert.equal(requests.at(-1).options.method,'DELETE');
assert.equal(requests.at(-1).options.headers['X-SZU-Token'],token);
// 学校窗口必须等直连配置生效后才导航；否则会跟随系统代理，和 Go 教务请求走不同出口。
{
  let releaseProxy,created=0;
  const proxyCalls=[],navigated=[];
  const directProfile={...profile,setProxy:config=>{proxyCalls.push(config);return new Promise(resolve=>{releaseProxy=resolve;});}};
  class DirectWindow{
    constructor(){created++;this.webContents=Object.assign(new EventEmitter(),{setWindowOpenHandler(){},getURL:()=>''});}
    on(){}show(){}focus(){}isDestroyed(){return false;}setMenu(){}
    loadURL(url){navigated.push(url);return Promise.resolve();}
  }
  const options={BrowserWindow:DirectWindow,Menu:{buildFromTemplate:value=>value},dialog:{showErrorBox(){throw Error('unexpected load error');}},session:{fromPartition:()=>directProfile}};
  const directSchool=createSchoolWindows(()=>'http://127.0.0.1:1234',()=>token,options);
  const opening=directSchool.open('undergrad');
  assert.deepEqual(proxyCalls,[{mode:'direct'}]);
  assert.equal(created,0,'do not create a school window before proxy setup completes');
  assert.deepEqual(navigated,[]);
  releaseProxy();await opening;
  assert.deepEqual(navigated,[schoolTargets.undergrad]);
  const failedSchool=createSchoolWindows(()=>'http://127.0.0.1:1234',()=>token,{...options,
    session:{fromPartition:()=>({...profile,setProxy:async()=>{throw Error('proxy setup failed');}})}});
  await assert.rejects(failedSchool.open('graduate'),/proxy setup failed/);
  assert.equal(created,1,'failed proxy setup must not fall back to the inherited proxy');
}
// loadURL 被页面自身跳转或再次打开打断（ERR_ABORTED）时页面仍在加载，不能弹“无法打开”；
// 真正的网络错误，以及被我们自己拦下的主框架重定向，仍要提示。
{
  const errors=[],opened=[];let loadResult=()=>Promise.resolve(),menu=null;
  let options=null;
  class FakeWindow{
    constructor(value){options=value;this.url='';this.webContents=Object.assign(new EventEmitter(),{setWindowOpenHandler(){},getURL:()=>this.url,navigationHistory:{}});}
    on(){}show(){}focus(){}isDestroyed(){return false;}setTitle(){}
    setMenu(value){menu=value[0].submenu;}
    loadURL(url){this.url=url;return loadResult(this);}
  }
  const openWindow=createSchoolWindows(()=>'http://127.0.0.1:1234',()=>token,{BrowserWindow:FakeWindow,Menu:{buildFromTemplate:value=>value},
    dialog:{showErrorBox:(title,message)=>errors.push({title,message})},session:{fromPartition},shell:{openExternal:async url=>{opened.push(url);}},fetch:localApi});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const aborted=Object.assign(new Error("ERR_ABORTED (-3) loading 'https://ehall.szu.edu.cn/'"),{code:'ERR_ABORTED',errno:-3});
  loadResult=()=>Promise.reject(aborted);
  assert.deepEqual(await openWindow.open('undergrad'),{ok:true});await settle();
  assert.deepEqual(options.webPreferences,{session:profile,contextIsolation:true,nodeIntegration:false,sandbox:true},'school pages run sandboxed in the isolated session');
  assert.deepEqual(await openWindow.open('graduate'),{ok:true});await settle();
  assert.equal(errors.length,0,'an interrupted load is a navigation, not a failure');
  loadResult=()=>Promise.reject(Object.assign(new Error('ERR_NAME_NOT_RESOLVED (-105)'),{code:'ERR_NAME_NOT_RESOLVED',errno:-105}));
  await openWindow.open('undergrad-scores');await settle();
  assert.equal(errors.length,1,'real load failures still explain themselves');
  assert.match(errors[0].message,/错误代码：ERR_NAME_NOT_RESOLVED/);
  // 服务端把首次加载重定向到白名单外（http:// 或未列出的 webvpn 子域）：我们拦下它导致的 ERR_ABORTED 要说明原因。
  const redirect=(win,url,isMainFrame=true)=>{
    const event={isMainFrame,prevented:false,preventDefault(){this.prevented=true;}};
    win.webContents.emit('will-redirect',event,url);
    return event;
  };
  let blockedEvent;
  loadResult=win=>{blockedEvent=redirect(win,'http://ehall.szu.edu.cn/jwapp/');win.url='';return Promise.reject(aborted);};
  await openWindow.open('graduate-scores');await settle();
  assert.ok(blockedEvent.prevented,'off-list redirect is still blocked');
  assert.equal(errors.length,2,'a redirect we blocked is not a silent navigation');
  assert.match(errors[1].message,/不允许打开的地址（http:\/\/ehall\.szu\.edu\.cn）/);
  menu.find(item=>item.label==='在系统浏览器打开').click();await settle();
  assert.deepEqual(opened,[schoolTargets['graduate-scores']],'menu falls back to the requested school page');
  // 子框架的重定向被拦、或允许的重定向，都不影响主页面加载结果的判断。
  loadResult=win=>{redirect(win,'https://tracker.example/pixel',false);redirect(win,'https://authserver.szu.edu.cn/authserver/login');return Promise.reject(aborted);};
  await openWindow.open('undergrad');await settle();
  assert.equal(errors.length,2,'subframe blocks and allowed redirects keep interrupted loads silent');
  // 被拦的记录只属于那一次加载：之后正常的中止依旧静默。
  loadResult=()=>Promise.reject(aborted);
  await openWindow.open('graduate');await settle();
  assert.equal(errors.length,2);
}
assert.equal(isNavigationAbort({code:'ERR_ABORTED'}),true);
assert.equal(isNavigationAbort({errno:-3}),true);
for(const error of [null,undefined,{},{code:'ERR_FAILED',errno:-2},new Error('x')])assert.equal(isNavigationAbort(error),false);
const packaged=readFileSync(new URL('./electron-builder.yml',import.meta.url),'utf8');
for(const name of ['pet-settings.mjs','smoke-pet.mjs','school-window.mjs','school-policy.mjs','window-policy.mjs'])assert.ok(packaged.includes(`- ${name}`),`${name} absent from installer`);
console.log('School window: URL boundary, cookie scope, empty-session replacement, interrupted loads, blocked redirects, isolated profile and packaged modules passed');
