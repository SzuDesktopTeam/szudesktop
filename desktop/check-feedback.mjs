import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createFeedbackUI,environmentSummary,FEEDBACK_URL} from './assets/garden/feedback.mjs';
import {createServiceLog,diagnosticReport,scrubAdvice,SCHOOL_SERVICES} from './assets/garden/diagnostic-report.mjs';
const version=readFileSync(new URL('../internal/version/VERSION',import.meta.url),'utf8').trim();
globalThis.document={getElementById:()=>null};
const environment={version,mode:'electron',navigatorInfo:{platform:'Win32',userAgent:'private-user-path-token',cookie:'secret-cookie',username:'student'}};
const summary=environmentSummary(environment);
assert.equal(summary,`szuDesktop ${version}\n系统：Windows\n界面：安装版桌面窗口`);
assert.doesNotMatch(summary,/private|secret|student/);assert.match(environmentSummary({version:'<script>',navigatorInfo:{platform:'MacIntel'}}),/未知构建\n系统：macOS/);
let copied='',toast='';
const ui=createFeedbackUI({getVersion:()=>environment.version,getMode:()=>environment.mode,toast:value=>{toast=value},clipboard:{writeText:async value=>{copied=value}}});
assert.equal(copied,'');await ui.click('feedback-copy');assert.equal(copied.split('\n').length,3);assert.match(toast,/已复制/);
const fallback=createFeedbackUI({getVersion:()=>environment.version,getMode:()=>environment.mode,toast:()=>{},clipboard:null});await fallback.click('feedback-copy');assert.match(fallback.card(),/手动复制/);
console.log('PASS environment allowlist, explicit copy and clipboard fallback');

// O2：诊断报告只输出结构。下面的替身响应故意塞满具体值（学号、姓名、成绩、IP、ac_id、Cookie、链接），报告里一个都不能出现。
{
 const log=createServiceLog(),secrets=['2024123456','张三','95','A+','10.1.2.3','ac_id=12','：12，','SESSION=secret','jwb.szu.edu.cn/a.htm','线性代数','致远楼'];
 const scores={level:'undergrad',label:'本科',items:[{name:'线性代数',term:'2025-2026-1',credit:3,score:'95',gpa:4,identity:'2024123456'},{name:'张三的课',term:'',credit:2,score:'A+',identity:'2024123456'}],fetched:2,total:2,full:true};
 const api=async path=>{if(path.startsWith('/api/scores'))return scores;if(path.startsWith('/api/campus/notices'))return {source:'教务部',items:[{title:'致远楼通知',date:'2026-06-08',url:'https://jwb.szu.edu.cn/a.htm'}],fetched_at:'2026-09-29T00:00:00Z',stale:false};if(path.startsWith('/api/academic/undergrad/timetable')){const e=Error('学校返回 412');e.code=412;throw e}if(path.startsWith('/api/piano/my'))throw Error('本机服务暂时无响应');return {saved:true,cookie:'SESSION=secret'}};
 const school=log.wrap(api);
 assert.equal(await school('/api/scores?level=undergrad'),scores,'包装后的 api 原样返回学校数据');
 await school('/api/campus/notices?source=undergrad');await school('/api/session');await school('/api/workspace');
 await assert.rejects(()=>school('/api/academic/undergrad/timetable'),/412/);await assert.rejects(()=>school('/api/piano/my'),/无响应/);
 assert.deepEqual(log.entries().map(entry=>entry.spec.path),['/api/scores','/api/campus/notices','/api/academic/undergrad/timetable','/api/piano/my'],'只记学校服务查询，会话、存档请求不记');
 const status={zone:'online',zone_label:'已联网 10.1.2.3',internet_ok:true,online_known:false,online_error:'暂时无法确认',online_ip:'10.1.2.3',username:'2024123456'};
 const diag={zone:'teaching',zone_label:'教学区',internet_ok:false,probed:true,teaching_portal_ok:true,dorm_portal_ok:false,dns_ok:true,ac_id:'12',ac_id_trusted:true,advices:['你在教学区，走深澜（SRun）认证。账号是 6 位校园卡号，密码是统一身份认证密码','教学区接入点编号（ac_id）：12，由校园网网关下发，可信','出口 10.1.2.3 已被账号 2024123456 占用'],notes:['本机 IP 10.1.2.3']};
 const report=diagnosticReport({environment:summary,status,diag,services:log.entries()});
 for(const secret of secrets)assert.ok(!report.includes(secret),'诊断报告里出现了具体值：'+secret);
 for(const line of ['判区：已联网（online）','外网：可用','校园认证：外网正常，没有检测到校园网认证页面','判区：教学区（teaching）','教学区门户：可达','宿舍区门户：不可达','net.szu.edu.cn 解析：成功','ac_id 来源：校园网网关下发',
  '- 教学区接入点编号（ac_id）：（已隐藏），由校园网网关下发，可信','- 出口 （IP 已隐藏） 已被账号 （数字已隐藏） 占用',
  '在线成绩（本科）：2xx · level:string label:string items:array fetched:number total:number full:boolean · items 2 条，字段 name 2/2 term 1/2 credit 2/2 score 2/2 gpa 1/2 category 0/2 identity 2/2',
  '学校公告：2xx · source:string items:array fetched_at:string stale:boolean · items 1 条，字段 title 1/1 url 1/1 date 1/1','本科课表：4xx','我的琴房预约：无响应','官方校历：本次打开后未请求'])assert.ok(report.includes(line),'诊断报告缺少：'+line+'\n'+report);
 assert.ok(report.startsWith('szuDesktop 诊断报告')&&report.includes(summary),'报告带上环境信息');
 assert.match(report,/学校域名解析到 198\.18\.0\.0\/15：这一版诊断接口没有单独提供/);
 // 系统代理开关来自 /api/diag 的 system_proxy：只报两个开关；缺这一项或类型不对时报「读不到」，不能报成「关」。
 assert.match(report,/系统代理开关：读不到（或这一版诊断接口没有提供）/);
 const proxied=diagnosticReport({diag:{...diag,system_proxy:{manual:true,pac:false,server:'10.1.2.3:7890'}}});
 assert.match(proxied,/系统代理开关：手动代理 开 · 自动配置脚本（PAC） 关/);assert.ok(!proxied.includes('7890')&&!proxied.includes('10.1.2.3'),'代理地址不能进报告');
 assert.match(diagnosticReport({diag:{...diag,system_proxy:{manual:false,pac:true}}}),/系统代理开关：手动代理 关 · 自动配置脚本（PAC） 开/);
 assert.match(diagnosticReport({diag:{...diag,system_proxy:{manual:'1'}}}),/系统代理开关：读不到/);
 // F12：门户确认在线时 /api/status 带 online_zone，判区仍是 online；报告单列一行，没有这一项时不猜。
 assert.match(report,/确认在线的区域：没有（门户没有确认在线，或这一版接口没有这一项）/);
 for(const [code,label] of [['teaching','教学区（teaching）'],['dorm','宿舍区（dorm）']])assert.ok(diagnosticReport({status:{...status,online_known:true,online:true,online_state:'online',online_zone:code}}).includes('确认在线的区域：'+label));
 assert.match(diagnosticReport({status:{...status,online_zone:'online'}}),/确认在线的区域：没有/);
 assert.match(diagnosticReport({diag:{...diag,dns_fake_ip:true}}),/学校域名解析到 198\.18\.0\.0\/15：是/);assert.match(diagnosticReport({diag:{...diag,dns_fake_ip:false}}),/学校域名解析到 198\.18\.0\.0\/15：否/);
 assert.match(diagnosticReport({status:{...status,zone:'teaching',internet_ok:false,online_state:'unconfirmed'}}),/校园认证：未查明（查询出错）/);
 assert.match(diagnosticReport({environment:summary}),/本次打开后还没有运行网络诊断/);
 assert.match(diagnosticReport({diag:{...diag,advices:['学校域名 net.szu.edu.cn 解析到了 198.18.0.0/15 里的假地址：代理软件接管了学校域名']}}),/学校域名解析到 198\.18\.0\.0\/15：是/,'结论里提到 Fake-IP 时报告为「是」，且不把网段当成 IP 遮掉');
 assert.equal(scrubAdvice('教学区接入点编号（ac_id）：abc-9，只是从门户页面推测的'),'教学区接入点编号（ac_id）：（已隐藏），只是从门户页面推测的');
 // 两套协议指纹都能用时，「如果登录报 ac_id 或协议错误…」那句排在接入点编号那一行前面，来源要按后者报。
 const dual={...diag,ac_id:'17',ac_id_trusted:true,advices:['当前能正常上外网。如果只是想上网，不用做任何事','协议指纹：深澜握手=是、ePortal 登录接口=是 → 真掉线时按「宿舍区」的协议登录（两套都在）；如果登录报 ac_id 或协议错误，在高级设置里改按教学区','教学区接入点编号（ac_id）：17，来自这张网上次认证成功的记录']};
 assert.match(diagnosticReport({diag:dual}),/ac_id 来源：本机上次成功的记录/);
 assert.equal(SCHOOL_SERVICES.length,new Set(SCHOOL_SERVICES.map(spec=>spec.path)).size);

 // 先预览再复制：卡片折叠区里就是完整报告，复制按钮在折叠区里；点之前不碰剪贴板，复制的就是重画后预览里的那一份。
 let clip='',note='';const nodes={};
 globalThis.document={getElementById:id=>id==='feedback-panel'?(nodes.panel??={outerHTML:''}):null};
 const ui=createFeedbackUI({getVersion:()=>environment.version,getMode:()=>environment.mode,toast:value=>{note=value},clipboard:{writeText:async value=>{clip=value}},getDiagnostics:()=>({status,diag,services:log.entries()})});
 const card=ui.card(),preview=/<details class="feedback-report" >[\s\S]*<\/details>/.exec(card)?.[0];
 assert.ok(preview,'诊断报告要放在默认折叠的预览区里');assert.match(preview,/<summary>诊断报告 · 先预览，再复制<\/summary>/);assert.match(preview,/data-action="feedback-report"/);assert.match(preview,/不会自动上传/);
 assert.ok(card.includes('教学区接入点编号（ac_id）：（已隐藏）'));assert.equal(clip,'');
 assert.doesNotMatch(card,/https?:\/\/(?!github\.com\/SzuDesktopTeam)/,'反馈卡片不放占位链接或第三方渠道');
 await ui.click('feedback-report');
 // 卡片里的环境信息按本机 navigator 生成，与上面固定成 Windows 的那份不同，所以按同样的输入再生成一份来比。
 assert.equal(clip,diagnosticReport({environment:environmentSummary({version:environment.version,mode:environment.mode}),status,diag,services:log.entries()}));assert.match(note,/已复制诊断报告/);
 assert.match(nodes.panel.outerHTML,/<details class="feedback-report" open>/);assert.ok(nodes.panel.outerHTML.includes(clip.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')),'预览里就是刚复制的全文');
 const offline=createFeedbackUI({getVersion:()=>environment.version,getMode:()=>environment.mode,toast:()=>{},clipboard:null,getDiagnostics:()=>({})});
 await offline.click('feedback-report');assert.match(nodes.panel.outerHTML,/请选中上方报告手动复制/);assert.match(nodes.panel.outerHTML,/<details class="feedback-report" open>/);
 globalThis.document={getElementById:()=>null};
 console.log('PASS diagnostic report is structure-only, previewed before copying and never uploaded');
}

// B10：反馈入口只打开使用指南里的反馈说明页，渠道换了只改文档、不用重新发版。地址只在 feedback.mjs 写一次，
// 页脚的「问题与建议」由 app.mjs 按同一个常量填上；页面里不再写死 GitHub Issues 的地址。
{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
 const html=read('./index.html'),app=read('./assets/garden/app.mjs'),own=read('./assets/garden/feedback.mjs');
 assert.equal(FEEDBACK_URL,'https://github.com/SzuDesktopTeam/szudesktop/blob/main/docs/guide/feedback.md');
 assert.ok(existsSync(new URL('../docs/guide/feedback.md',import.meta.url)),'反馈说明页 docs/guide/feedback.md 不在仓库里，按钮会打开 404');
 const card=createFeedbackUI({getVersion:()=>version,getMode:()=>'electron',toast(){},clipboard:null}).card();
 assert.ok(card.includes(`<a class="button quiet" href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">提交反馈 ↗</a>`),'「提交反馈」打开反馈说明页');
 assert.doesNotMatch(card,/GitHub 账号/,'反馈渠道写在说明页里，卡片不再预设只有 GitHub');
 assert.match(html,/<a data-feedback-link target="_blank" rel="noopener noreferrer">问题与建议 ↗<\/a>/,'页脚链接不自带地址');
 const wiring=/^document\.querySelectorAll\('\[data-feedback-link\]'\)[^\n]*$/m.exec(app)?.[0];assert.ok(wiring,'app.mjs 没有给页脚填反馈地址');
 const links=[{href:''}];vm.runInNewContext(wiring,{FEEDBACK_URL,document:{querySelectorAll:selector=>selector==='[data-feedback-link]'?links:[]}});
 assert.equal(links[0].href,FEEDBACK_URL);
 for(const [name,text] of [['index.html',html],['app.mjs',app],['feedback.mjs',own]])assert.doesNotMatch(text,/szudesktop\/issues/,name+' 又写死了 GitHub Issues 地址，换渠道就得重新发版');
 assert.equal(own.split(FEEDBACK_URL).length,2,'反馈地址只写一次');
 console.log('PASS feedback entry points open one guide page defined once');
}
