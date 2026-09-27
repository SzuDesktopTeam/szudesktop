import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {isFeishuDocumentURL,isOfficialFeishuURL} from './feishu-policy.mjs';
import {isSafeExternalUrl} from './external-url.mjs';

for(const url of ['https://course.feishu.cn/docx/ABC123?from=share','https://course.larksuite.com/wiki/ABC123/','https://course.larkoffice.com/docx/ABC123'])assert.ok(isFeishuDocumentURL(url),url);
for(const url of ['https://accounts.feishu.cn/accounts/page/login','https://passport.larksuite.com/login','https://www.larkoffice.com/']){
  assert.ok(isOfficialFeishuURL(url));assert.equal(isFeishuDocumentURL(url),false);
}
for(const url of ['http://course.feishu.cn/docx/ABC123','https://course.feishu.cn.evil.test/docx/ABC123','https://user@course.feishu.cn/docx/ABC123','https://course.feishu.cn:444/docx/ABC123','https://127.0.0.1/docx/ABC123','https://evil.test/#https://course.feishu.cn/docx/ABC123','file:///C:/test','javascript:alert(1)','lark://open','https://course.feishu.cn/docx/%41BC123'])assert.equal(isFeishuDocumentURL(url),false,url);
for(const url of ['https://course.feishu.cn/base/ABC123','https://course.feishu.cn/docx/ABC123/extra'])assert.equal(isFeishuDocumentURL(url),false,url);

const windows=[],external=[],cleared=[];
let permissionRequest,permissionCheck;
const profile={setPermissionRequestHandler(fn){permissionRequest=fn;},setPermissionCheckHandler(fn){permissionCheck=fn;},async clearStorageData(){cleared.push('storage');},async clearCache(){cleared.push('cache');}};
class FakeWindow extends EventEmitter{
  constructor(options){
    super();this.options=options;this.urls=[];this.url='';this.destroyed=false;windows.push(this);
    this.webContents=new EventEmitter();
    Object.assign(this.webContents,{navigationHistory:{canGoBack:()=>true,goBack:()=>{this.back=true;}},
      setWindowOpenHandler:fn=>{this.popup=fn;},getURL:()=>this.url,reload:()=>{this.reloaded=true;}});
  }
  loadURL(url){this.url=url;this.urls.push(url);return Promise.resolve();}
  isDestroyed(){return this.destroyed;}
  show(){this.shown=true;}focus(){this.focused=true;}setTitle(title){this.title=title;}setMenu(menu){this.menu=menu;}
  destroy(){this.destroyed=true;this.emit('closed');}close(){this.destroy();}
}
const source=readFileSync(new URL('./feishu-window.mjs',import.meta.url),'utf8');
const createFeishuWindow=new Function('BrowserWindow','Menu','dialog','session','shell','isFeishuDocumentURL','isOfficialFeishuURL','isSafeExternalUrl',
  source.replace(/^import[^\n]*\n/gm,'').replace('export function createFeishuWindow','function createFeishuWindow')+'\nreturn createFeishuWindow;'
)(FakeWindow,{buildFromTemplate:value=>value},{showErrorBox(){assert.fail('unexpected window error');}},
  {fromPartition:(name,options)=>{assert.equal(name,'szu-feishu-official');assert.deepEqual(options,{cache:false});return profile;}},
  {openExternal:async url=>{external.push(url);}},isFeishuDocumentURL,isOfficialFeishuURL,isSafeExternalUrl);
const controller=createFeishuWindow();
await assert.rejects(controller.open('https://evil.test/'),/官方课程文档/);
assert.equal(windows.length,0);
await controller.open('https://course.feishu.cn/docx/ABC123');
await controller.open('https://course.feishu.cn/docx/ABC123');
const win=windows[0],wc=win.webContents;
assert.equal(windows.length,1);assert.equal(win.urls.length,1);
assert.deepEqual(win.options.webPreferences,{session:profile,contextIsolation:true,nodeIntegration:false,sandbox:true});
assert.ok(win.shown&&win.focused);
permissionRequest(null,'media',allowed=>assert.equal(allowed,false));assert.equal(permissionCheck(),false);
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
await controller.shutdown();assert.ok(win.destroyed);assert.deepEqual(cleared,['storage','cache']);
assert.doesNotMatch(source,/preload:|nodeIntegration:true|sandbox:false|webSecurity:false|cookies\.get|executeJavaScript/);
const main=readFileSync(new URL('./main.mjs',import.meta.url),'utf8');
assert.match(main,/ipcMain\.handle\('szu:feishu-open',\(event,url\)=>\{\s*if\(!isTrustedSender\(event,mainWin,handle\?\.baseUrl\)\)/);
assert.match(main,/await feishuWindow\?\.shutdown\(\)/);
assert.match(readFileSync(new URL('./preload.cjs',import.meta.url),'utf8'),/openFeishu: \(url\) => ipcRenderer\.invoke\('szu:feishu-open', url\)/);
console.log('Feishu window: official document/login boundaries, sandbox, isolated session, window reuse, external navigation, guarded IPC and shutdown passed');
