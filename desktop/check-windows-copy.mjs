// Windows 文案逐字锁定：页面只在桥给出 platform==='darwin' 时才换成 macOS 文案。
// 拿不到平台（旧 preload、便携版浏览器页）或 platform==='win32' 时，下面每一句都必须与加入 macOS 分支之前一字不差，
// 期望值取自改动前的页面输出。macOS 文案另由 check-macos-copy.mjs 断言。
// 末尾打印全部 Windows 渲染结果的摘要：改文案前后各跑一次，两次摘要相同，说明不只是这些关键句，整段输出都没变。
// 例外是按术语表统一的名字（O12）：「桌面宠物」→「桌面伙伴」、设置里的「安静陪伴」→与托盘同名的「勿扰」、「学习工具」「今日手帐」→导航里的「学习书屋」「今日」。
// 这几处是有意改名，期望值随之更新；其余句子仍逐字不变。
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {exitHint} from './assets/garden/app-logic.mjs';
import {createDesktopOptions} from './assets/garden/desktop-options.mjs';
import {createState} from './assets/garden/engine.mjs';
import {environmentSummary} from './assets/garden/feedback.mjs';
import {homeSkinPicker} from './assets/garden/home-skins.mjs';
import {esc} from './assets/garden/html.mjs';
import {createNotebookUI} from './assets/garden/notebook.mjs';
import {focusView} from './assets/garden/productivity.mjs';
import {createReleaseUI} from './assets/garden/release-ui.mjs';

// 固定时间和版本，摘要才能在两次运行之间比较。
const NOW=Date.UTC(2026,8,1,4),VERSION='beta0.9.4';
const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const section=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from,`app.mjs 里找不到 ${start}`);return source.slice(from,to)};
const pageSource=section('function showGuide(){','function markOnboarded(')+section('function sectionNav(','function servicesPage(')+section('function settings(){','function loadPetScale(){')+section('function workspaceFailureHTML(){','function enterWorkspaceFailure(');
const text=value=>value.replace(/<[^>]+>/g,'');

const WIN={
 exitElectron:'关闭主窗口后桌面伙伴仍会常驻；要完全退出请用托盘菜单「退出」或「设置 → 关于与更新 → 退出应用」，下次打开可继续使用。',
 exitBrowser:'关闭所有应用窗口约 10 秒后自动退出；想立即退出走「设置 → 关于与更新 → 退出应用」。刷新页面不会结束服务。',
 rows:[['专注完成时提醒我','主窗口隐藏时也可提醒；完全退出后不提醒。'],['勿扰','暂停专注通知，不改变计时、互动或奖励。'],['显示桌面伙伴','关闭后可从托盘恢复，重启保留选择。'],['伙伴保持置顶','关闭后，其他窗口可以盖住伙伴。'],['启动时自动连接校园网','使用已记住的账号；本机已在线时跳过，下次启动生效。'],['登录 Windows 时启动','只在主动开启后登记，开机不弹出主窗口。']],
 noNotifications:'此系统暂不支持通知，主窗口仍显示完成状态。',
 noLoginItem:'仅支持已安装的 Windows 版本。',
 petMenu:'<p class="muted">点击或右键伙伴可打开菜单，摸摸、喂食、陪玩和休息都会保存到同一份庭院存档。拖动伙伴可以移动位置，悬停时滚轮每次调整 10%；也可以用滑杆在 40–200% 之间细调。</p>',
 petTray:'<p class="muted">菜单还能打开农田、学习书屋与今日，托盘里也可快速切换大小。</p>',
 autostart:['<p class="muted">登录 Windows 时静默启动并自动连接一次校园网。需要界面时，再双击程序打开。</p>','<small>可在这里或 Windows 的「启动应用」中关闭。</small>'],
 archive:'<p class="notice">存档默认位于用户目录下的 .szunet / workspace-v1.json。换电脑前，请先导出存档。</p>',
 dpapi:'<p class="muted">Windows 使用系统 DPAPI 保护密码。查看卡号需要在校园网页主动点击，不会出现在首页或导出的存档里。</p>',
 recovery:'<p class="muted">存档默认位于用户目录下的 .szunet / workspace-v1.json。可以先备份这个文件，再重新读取。</p>',
 guide:'数据只在本机：庭院与学习记录存在用户目录 .szunet / workspace-v1.json；校园网密码由 Windows DPAPI 加密，导出的备份不含账号密码。',
 focus:'<p class="muted">计时已保存。安装版保持运行时可以在后台提醒；完全退出应用后不会发送通知。</p>',
 release:'<small>安装更新前可先导出庭院存档；下载后由你运行安装包完成更新。</small>',
 notebook:['title="粗体（Ctrl+B）"','title="斜体（Ctrl+I）"'],
 feedback:`szuDesktop ${VERSION}\n系统：Windows\n界面：安装版桌面窗口`,
};

// 每个用例都把全局桥和 document 还原成进来之前的样子，互不串味。
async function withBridge(bridge,fn){
 const previous={bridge:globalThis.szuDesktop,document:globalThis.document};
 try{if(bridge===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=bridge;globalThis.document={querySelector:()=>null,getElementById:()=>null,body:{classList:{toggle(){}}}};return await fn()}
 finally{if(previous.bridge===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=previous.bridge;if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document}
}

// app.mjs 的 settings()、读档失败页和 showGuide 按页面里的接线放进 vm；它们就地读 globalThis.szuDesktop。
function appPage(bridge){
 const guide={open:false,returnValue:'',querySelector:()=>({querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}}),showModal(){this.open=true},addEventListener(){}},exit={textContent:'可在「设置 → 关于与更新 → 退出应用」结束本次使用，下次打开可继续。'},store={textContent:'校园网密码由 Windows DPAPI 加密'};
 const context=vm.createContext({szuDesktop:bridge,state:createState(NOW),saved:true,appVersion:VERSION,page:'settings',settingsTab:'desktop',workspaceFailure:null,head:()=>'',sprite:()=>'',esc,homeSkinPicker,
  btn:(label,action,extra='',cls='')=>`<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`,
  desktopUI:{card:()=>''},releaseUI:{card:()=>''},feedbackUI:{card:()=>''},exitHint:()=>exitHint(),
  $:selector=>({'#guide':guide,'#exit-guide-text':exit,'#guide-store-text':store})[selector]??null});
 vm.runInContext(pageSource,context);
 const tab=name=>{context.settingsTab=name;return context.settings()};
 const rendered={desktop:tab('desktop'),data:tab('data'),about:tab('about')};
 context.workspaceFailure={message:'存档时间异常',raw:null};context.settingsTab='appearance';rendered.recovery=context.workspaceFailureHTML();
 context.showGuide();rendered.guide={exit:exit.textContent,store:store.textContent};
 return rendered;
}

async function desktopRows(bridge,snapshot){
 return withBridge({...bridge,desktopSettings:async()=>snapshot},async()=>{
  const host={innerHTML:''};globalThis.document={getElementById:id=>id==='desktop-options'?host:null};
  const ui=createDesktopOptions({toast(){}}),before=ui.card();await ui.load();
  const pairs=value=>[...value.matchAll(/<strong>([^<]*)<\/strong><small>([^<]*)<\/small>/g)].map(match=>[match[1],match[2]]);
  return {before,after:host.innerHTML,rows:pairs(host.innerHTML)};
 });
}

async function releaseHint(bridge){
 return withBridge(bridge,async()=>{
  const ui=createReleaseUI({api:async()=>({available:true,version:'beta9.9.9',prerelease:true,url:'https://github.com/SzuDesktopTeam/szudesktop/releases/tag/beta9.9.9'}),getVersion:()=>VERSION});
  const idle=ui.card();await ui.click('release-check');return {idle,found:ui.card()};
 });
}

async function notebookView(bridge){
 return withBridge(bridge,async()=>{
  const data={courses:[{id:'course-1',name:'机器学习'}],notes:[{id:'note-1',courseId:'course-1',title:'支持向量机',body:'## 间隔\n先理解间隔',createdAt:NOW,updatedAt:NOW}],preferences:{selectedCourseId:'course-1',selectedNoteId:'note-1'}};
  const ui=createNotebookUI({api:async()=>({revision:1,data})});
  try{await ui.load();return ui.view()}finally{ui.destroy()}
 });
}

async function focusNote(bridge){
 return withBridge(bridge,()=>{const state=createState(NOW);state.game.focus={end:NOW+60000,duration:1,task:'读完第三章'};return focusView(state)});
}

let checks=0;const digest=createHash('sha256');
async function check(name,fn){const rendered=await fn();digest.update(name+'\0'+JSON.stringify(rendered)+'\0');checks++;console.log('PASS',name)}

// 两种桥都代表「不是 Mac」：旧 preload 没有 platform 字段，新 preload 在 Windows 上给出 win32。
for(const [label,bridge] of [['没有 platform',{shell:'electron'}],['platform:\'win32\'',{shell:'electron',platform:'win32'}]]){
 await check(`${label}：退出方式仍指向托盘`,()=>withBridge(bridge,()=>{
  assert.equal(exitHint(),WIN.exitElectron);assert.equal(exitHint('electron'),WIN.exitElectron);assert.equal(exitHint('browser'),WIN.exitBrowser);
  return [exitHint(),exitHint('browser')];
 }));
 await check(`${label}：桌面陪伴开关的标签与说明逐字不变`,async()=>{
  const ok=await desktopRows(bridge,{focusNotifications:true,petVisible:true,launchAtLogin:false,launchAtLoginSupported:true,notificationsSupported:true});
  assert.deepEqual(ok.rows,WIN.rows);
  for(const [name,hint] of WIN.rows)assert.ok(ok.before.includes(`<strong>${name}</strong><small>${hint}</small>`),'读到设置之前也用同一组文案');
  const unsupported=await desktopRows(bridge,{launchAtLoginSupported:false,notificationsSupported:false});
  assert.deepEqual(unsupported.rows,WIN.rows.map(([name,hint],i)=>[name,i===0?WIN.noNotifications:i===5?WIN.noLoginItem:hint]));
  // 登录项原因提示只在 darwin 上显示；即使快照带着它，Windows 页面也不变。
  const hinted=await desktopRows(bridge,{launchAtLoginSupported:false,notificationsSupported:true,launchAtLoginHint:'not-in-applications'});
  assert.equal(hinted.rows[5][1],WIN.noLoginItem);
  return [ok,unsupported,hinted];
 });
 await check(`${label}：设置页的桌面伙伴、存档位置、DPAPI 与退出说明逐字不变`,()=>withBridge(bridge,()=>{
  const page=appPage(bridge);
  assert.ok(page.desktop.includes(WIN.petMenu),'滚轮每次调整 10% 的原句');assert.ok(page.desktop.includes(WIN.petTray));
  assert.ok(page.data.includes(WIN.archive));assert.ok(page.data.includes(WIN.dpapi));
  assert.ok(page.about.includes(`<small>${WIN.exitElectron}</small>`));
  assert.ok(page.recovery.includes(WIN.recovery),'读档失败页的存档位置');
  assert.equal(page.guide.exit,WIN.exitElectron);assert.equal(page.guide.store,'校园网密码由 Windows DPAPI 加密','引导里的 DPAPI 句不被替换');
  return page;
 }));
 await check(`${label}：专注提示、更新提示、笔记快捷键与反馈摘要逐字不变`,async()=>{
  const focus=await focusNote(bridge),release=await releaseHint(bridge),notebook=await notebookView(bridge);
  assert.ok(focus.includes(WIN.focus));
  assert.ok(release.found.includes(WIN.release));
  for(const title of WIN.notebook)assert.ok(notebook.includes(title),`笔记工具栏缺少 ${title}`);
  const summary=await withBridge(bridge,()=>[environmentSummary({version:VERSION,mode:'electron',navigatorInfo:{platform:'Win32'}}),environmentSummary({version:VERSION,mode:'browser',navigatorInfo:{platform:'Win32'}})]);
  assert.equal(summary[0],WIN.feedback);assert.equal(summary[1],`szuDesktop ${VERSION}\n系统：Windows\n界面：便携版 / 浏览器窗口`);
  return [focus,release,notebook,summary];
 });
}

// 便携版在浏览器里打开，没有桥：自启卡片和退出说明仍是原文，反馈摘要也只看浏览器报告的系统。
await check('没有桥（便携版）：开机自启卡片、退出说明与反馈摘要逐字不变',()=>withBridge(undefined,()=>{
 const page=appPage(undefined);
 for(const line of WIN.autostart)assert.ok(page.desktop.includes(line));
 assert.ok(page.about.includes(`<small>${WIN.exitBrowser}</small>`));assert.ok(page.data.includes(WIN.dpapi));
 assert.equal(environmentSummary({version:VERSION,mode:'browser',navigatorInfo:{platform:'MacIntel'}}),`szuDesktop ${VERSION}\n系统：macOS\n界面：便携版 / 浏览器窗口`);
 return page;
}));

await check('index.html 引导里的存档与 DPAPI 原句不变',()=>{
 const paragraph=/<p><b>数据只在本机<\/b>[\s\S]*?<\/p>/.exec(html)?.[0];
 assert.ok(paragraph,'引导里找不到「数据只在本机」一段');assert.equal(text(paragraph),WIN.guide);
 return text(paragraph);
});

console.log(`${checks} 项 Windows 文案检查通过；Windows 渲染摘要 ${digest.digest('hex').slice(0,16)}`);
