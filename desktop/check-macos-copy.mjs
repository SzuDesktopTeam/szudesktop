// macOS 桌面版的页面文案：preload 给出 platform==='darwin' 时，各处换成 Mac 的说法
// （菜单栏图标、⌘Q、程序坞、钥匙串、登录 Mac 时启动、.dmg 拖进「应用程序」、⌘B），并且不再出现托盘、Windows、DPAPI、安装包。
// Windows 原文由 check-windows-copy.mjs 逐字锁定；本文件只看 Mac 分支。每个用例都在 finally 里还原 globalThis.szuDesktop。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {exitHint} from './assets/garden/app-logic.mjs';
import {createDesktopOptions} from './assets/garden/desktop-options.mjs';
import {createState} from './assets/garden/engine.mjs';
import {createFeedbackUI,environmentSummary} from './assets/garden/feedback.mjs';
import {homeSkinPicker} from './assets/garden/home-skins.mjs';
import {esc} from './assets/garden/html.mjs';
import {createNotebookUI} from './assets/garden/notebook.mjs';
import {isMac} from './assets/garden/platform.mjs';
import {focusView} from './assets/garden/productivity.mjs';
import {createReleaseUI} from './assets/garden/release-ui.mjs';

const MAC=Object.freeze({shell:'electron',platform:'darwin'});
const NOW=Date.UTC(2026,8,1,4),VERSION='beta0.9.4';
const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const section=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from,`app.mjs 里找不到 ${start}`);return source.slice(from,to)};
const pageSource=section('function showGuide(){','function markOnboarded(')+section('function sectionNav(','function servicesPage(')+section('function settings(){','function loadPetScale(){')+section('function workspaceFailureHTML(){','function enterWorkspaceFailure(');
const clean=(value,where)=>assert.doesNotMatch(value,/托盘|Windows|DPAPI|安装包/,`${where}在 macOS 上仍有 Windows 文案`);
const MAC_EXIT=/菜单栏/;

async function withBridge(bridge,fn){
 const previous={bridge:globalThis.szuDesktop,document:globalThis.document};
 try{if(bridge===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=bridge;globalThis.document={querySelector:()=>null,getElementById:()=>null,body:{classList:{toggle(){}}}};return await fn()}
 finally{if(previous.bridge===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=previous.bridge;if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document}
}

let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS',name)}

await check('isMac 只认桥给出的 darwin，不回退到 navigator',()=>withBridge(undefined,()=>{
 assert.equal(isMac(MAC),true);
 for(const bridge of [undefined,null,{},{shell:'electron'},{shell:'electron',platform:'win32'},{platform:''},{platform:'Darwin'}])assert.equal(isMac(bridge),false,JSON.stringify(bridge));
 // 在 Mac 上跑这个检查时 navigator 报告的也是 Mac；没有桥就仍不算桌面版。
 assert.equal(isMac(),false);
}));

await check('退出方式指向菜单栏图标、⌘Q 与程序坞',()=>withBridge(MAC,()=>{
 for(const hint of [exitHint(),exitHint('electron')]){assert.match(hint,MAC_EXIT);assert.match(hint,/⌘Q/);assert.match(hint,/程序坞/);assert.match(hint,/常驻/);clean(hint,'退出说明')}
 assert.match(exitHint('browser'),/10 秒/,'浏览器模式的说明与平台无关');
}));

async function desktopRows(snapshot){
 return withBridge({...MAC,desktopSettings:async()=>snapshot},async()=>{
  const host={innerHTML:''};globalThis.document={getElementById:id=>id==='desktop-options'?host:null};
  const ui=createDesktopOptions({toast(){}}),before=ui.card();await ui.load();
  const rows=Object.fromEntries([...host.innerHTML.matchAll(/<strong>([^<]*)<\/strong><small>([^<]*)<\/small><\/span><input type="checkbox" data-desktop-setting="([^"]+)"([^>]*)>/g)].map(m=>[m[3],{label:m[1],hint:m[2],disabled:/\bdisabled\b/.test(m[4])}]));
  return {before,after:host.innerHTML,rows};
 });
}

await check('桌面陪伴：登录 Mac 时启动、菜单栏图标恢复伙伴、首次提醒会询问通知授权',async()=>{
 const ok=await desktopRows({focusNotifications:true,petVisible:true,launchAtLogin:false,launchAtLoginSupported:true,notificationsSupported:true});
 assert.equal(ok.rows.launchAtLogin.label,'登录 Mac 时启动');assert.equal(ok.rows.launchAtLogin.hint,'只在主动开启后登记，登录时不弹出主窗口。');assert.equal(ok.rows.launchAtLogin.disabled,false);
 assert.match(ok.rows.petVisible.hint,/菜单栏图标/);
 assert.match(ok.rows.focusNotifications.hint,/首次提醒时 macOS 会询问是否允许通知/);
 assert.equal(Object.keys(ok.rows).length,6,'Mac 与 Windows 是同一组开关');
 for(const value of [ok.before,ok.after])clean(value,'桌面陪伴开关');
 assert.match(ok.before,/登录 Mac 时启动/,'读到设置之前也用 Mac 文案');
});

await check('登录项按快照原因提示：不在「应用程序」里置灰，待批准时指向系统设置',async()=>{
 const outside=await desktopRows({launchAtLoginSupported:false,notificationsSupported:true,launchAtLoginHint:'not-in-applications'});
 assert.match(outside.rows.launchAtLogin.hint,/拖到「应用程序」文件夹/);assert.equal(outside.rows.launchAtLogin.disabled,true);
 // 主进程没给原因（或给了不认识的原因）但不支持时，同样引导拖进「应用程序」：开发模式和 DMG 里运行都不在那里。
 for(const launchAtLoginHint of [undefined,'not-packaged'])assert.match((await desktopRows({launchAtLoginSupported:false,notificationsSupported:true,launchAtLoginHint})).rows.launchAtLogin.hint,/应用程序/);
 const approval=await desktopRows({launchAtLogin:false,launchAtLoginSupported:true,notificationsSupported:true,launchAtLoginHint:'requires-approval'});
 assert.match(approval.rows.launchAtLogin.hint,/系统设置 → 通用 → 登录项与扩展/);assert.equal(approval.rows.launchAtLogin.disabled,false,'待批准时仍可操作开关');
 const quiet=await desktopRows({launchAtLoginSupported:true,notificationsSupported:false});
 assert.equal(quiet.rows.focusNotifications.hint,'此系统暂不支持通知，主窗口仍显示完成状态。');
 for(const value of [outside.after,approval.after,quiet.after])clean(value,'登录项提示');
});

// app.mjs 的设置页、读档失败页和引导按页面里的接线放进 vm；它们就地读 globalThis.szuDesktop，卡片用真实模块渲染。
function appPage(){
 const guide={open:false,returnValue:'',querySelector:()=>({querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}}),showModal(){this.open=true},addEventListener(){}},exit={textContent:''},store={textContent:'校园网密码由 Windows DPAPI 加密'};
 const context=vm.createContext({szuDesktop:MAC,state:createState(NOW),saved:true,appVersion:VERSION,page:'settings',settingsTab:'desktop',workspaceFailure:null,head:()=>'',sprite:()=>'',esc,homeSkinPicker,
  btn:(label,action,extra='',cls='')=>`<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`,
  desktopUI:createDesktopOptions({toast(){}}),releaseUI:createReleaseUI({api:()=>assert.fail('打开设置页不应自动检查更新'),getVersion:()=>VERSION}),
  feedbackUI:createFeedbackUI({getVersion:()=>VERSION,getMode:()=>'electron',toast(){}}),exitHint:()=>exitHint(),
  $:selector=>({'#guide':guide,'#exit-guide-text':exit,'#guide-store-text':store})[selector]??null});
 vm.runInContext(pageSource,context);
 const tab=name=>{context.settingsTab=name;return context.settings()};
 const page={desktop:tab('desktop'),data:tab('data'),about:tab('about')};
 context.workspaceFailure={message:'存档时间异常',raw:null};context.settingsTab='appearance';page.recovery=context.workspaceFailureHTML();
 context.showGuide();page.guide={exit:exit.textContent,store:store.textContent};
 return page;
}

await check('设置页：宠物手势与缩放、菜单栏切换大小、钥匙串、隐藏的存档目录',()=>withBridge({...MAC,desktopSettings:async()=>({})},()=>{
 const page=appPage();
 assert.ok(page.desktop.includes('菜单栏图标里也可快速切换大小'));
 assert.ok(page.desktop.includes('右键（触控板双指轻点，或按住 Control 点按）'));
 const scale=/<p class="muted">([^<]*可调整大小[^<]*)<\/p>/.exec(page.desktop)?.[1];
 assert.ok(scale,'设置页缺少宠物缩放说明');assert.ok(scale.includes('悬停时滚动鼠标滚轮，或在触控板上双指上下滑动，可调整大小'));
 // 触控板一次滑动会连跳好几档，Mac 文案不能承诺每次 10%。
 assert.doesNotMatch(scale,/10%/);
 assert.match(page.desktop,/登录 Mac 时启动/,'桌面陪伴分区用的是 Mac 的开关文案');
 assert.ok(page.data.includes('macOS 把密码存进系统钥匙串（Keychain）'));
 assert.ok(page.data.includes('~/.szunet/workspace-v1.json（在 Finder 中按 ⌘⇧. 可显示隐藏文件夹）'));
 assert.ok(page.recovery.includes('~/.szunet/workspace-v1.json（在 Finder 中按 ⌘⇧. 可显示隐藏文件夹）'),'读档失败页的存档位置');
 assert.match(page.about,/⌘Q/);assert.match(page.about,/macOS 桌面版窗口/);
 for(const [name,value] of Object.entries(page))if(typeof value==='string')clean(value,`设置页 ${name} `);
}));

await check('新手引导：钥匙串代替 DPAPI，退出方式指向菜单栏与 ⌘Q',()=>withBridge(MAC,()=>{
 const page=appPage();
 assert.equal(page.guide.store,'校园网密码存进 macOS 钥匙串');assert.match(page.guide.exit,MAC_EXIT);assert.match(page.guide.exit,/⌘Q/);
 // 页面默认文字仍是 Windows 原文，只在 Mac 上由 showGuide 换掉这一段。
 const paragraph=/<p><b>数据只在本机<\/b>[\s\S]*?<\/p>/.exec(html)?.[0];
 assert.ok(paragraph,'引导里找不到「数据只在本机」一段');assert.equal((html.match(/id="guide-store-text"/g)||[]).length,1);
 const shown=paragraph.replace(/(<span id="guide-store-text">)[^<]*(<\/span>)/,`$1${page.guide.store}$2`).replace(/<[^>]+>/g,'');
 assert.match(shown,/钥匙串/);clean(shown+page.guide.exit,'新手引导');
}));

await check('专注进行中：退出说明写 ⌘Q',()=>withBridge(MAC,()=>{
 const state=createState(NOW);state.game.focus={end:NOW+60000,duration:1,task:'读完第三章'};
 const view=focusView(state);assert.match(view,/按 ⌘Q 完全退出后不会发送通知/);clean(view,'专注页');
}));

await check('发现新版本：下载对应芯片的 .dmg，拖进「应用程序」替换',()=>withBridge(MAC,async()=>{
 const ui=createReleaseUI({api:async()=>({available:true,version:'beta9.9.9',prerelease:true,url:'https://github.com/SzuDesktopTeam/szudesktop/releases/tag/beta9.9.9'}),getVersion:()=>VERSION});
 await ui.click('release-check');const card=ui.card();
 assert.match(card,/\.dmg/);assert.match(card,/「应用程序」/);assert.match(card,/arm64/);assert.match(card,/x64/);clean(card,'更新提示');
}));

await check('笔记工具栏的快捷键写 ⌘B、⌘I',()=>withBridge(MAC,async()=>{
 const data={courses:[{id:'course-1',name:'机器学习'}],notes:[{id:'note-1',courseId:'course-1',title:'支持向量机',body:'先理解间隔',createdAt:NOW,updatedAt:NOW}],preferences:{selectedCourseId:'course-1',selectedNoteId:'note-1'}};
 const ui=createNotebookUI({api:async()=>({revision:1,data})});
 try{await ui.load();const view=ui.view();assert.ok(view.includes('title="粗体（⌘B）"'));assert.ok(view.includes('title="斜体（⌘I）"'));assert.doesNotMatch(view,/Ctrl\+[BI]/)}finally{ui.destroy()}
}));

await check('反馈摘要：macOS 桌面版窗口，darwin 不会被 /win/ 认成 Windows',()=>withBridge(MAC,()=>{
 for(const platform of ['MacIntel','darwin','Win32']){
  const summary=environmentSummary({version:VERSION,mode:'electron',navigatorInfo:{platform}});
  assert.equal(summary,`szuDesktop ${VERSION}\n系统：macOS\n界面：macOS 桌面版窗口`,`navigator 报告 ${platform} 时也以桥为准`);
 }
 // 桥也可以显式传入，不依赖全局。
 assert.match(environmentSummary({version:VERSION,mode:'electron',navigatorInfo:{platform:'Win32'},bridge:{platform:'win32'}}),/系统：Windows\n界面：安装版桌面窗口/);
 clean(createFeedbackUI({getVersion:()=>VERSION,getMode:()=>'electron',toast(){},clipboard:null}).card(),'反馈卡片');
}));

console.log(`${checks} 项 macOS 文案检查通过`);
