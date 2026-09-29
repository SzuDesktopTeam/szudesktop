// 从 app.mjs 抽出的小块页面逻辑：不在模块顶层碰 DOM，要用的节点、桥接和回调都由调用方传入。
// app.mjs 照常导入使用；检查脚本直接 import 这些函数做行为测试，不再按字符串标记切 app.mjs 的源码。
import {isMac} from './platform.mjs';
import {dayKey} from './engine.mjs';

// 退出方式随外壳不同：安装版关闭主窗口后桌面伙伴仍常驻，浏览器模式在所有窗口关闭后自动退出。
// macOS 没有托盘：关窗后从程序坞找回主窗口，退出用 ⌘Q 或菜单栏图标。拿不到平台时一律是 Windows 原文。
export function exitHint(shell=globalThis.szuDesktop?.shell,mac=isMac()){return shell==='electron'?(mac?'关闭主窗口后桌面伙伴仍会常驻，点程序坞图标就能找回主窗口；要完全退出请按 ⌘Q，或用菜单栏图标里的「退出」、「设置 → 关于与更新 → 退出应用」，下次打开可继续使用。':'关闭主窗口后桌面伙伴仍会常驻；要完全退出请用托盘菜单「退出」或「设置 → 关于与更新 → 退出应用」，下次打开可继续使用。'):'关闭所有应用窗口约 10 秒后自动退出；想立即退出走「设置 → 关于与更新 → 退出应用」。刷新页面不会结束服务。'}

export function countdown(end,now=Date.now()){let n=Math.max(0,Math.ceil((end-now)/1000));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
export function remaining(end,now=Date.now()){return end<=now?'成熟啦，随时可以收获':'还需 '+countdown(end,now)}

// 每次 /api/status 都会探测外网和校园门户，所以只在窗口可见、且当前页面显示网络状态时轮询；
// 切到这两个页面时补一次，窗口回到可见时不论在哪一页都立即补一次（anyPage）。退出后不再探测。
export function shouldPollNetwork({exiting,hidden,page,force=false,anyPage=false,now,checkedAt}){if(exiting||hidden||!anyPage&&page!=='home'&&page!=='network')return false;return force||now-checkedAt>=25000}

// 开机自启卡片的文字与按钮。读不到状态时不能画成「未开启」，安装版只允许关掉旧版留下的自启项。
export function autostartView(st,installed){let text=st?(st.detail||'状态未知'):'正在读取…';if(installed)text+=' · 安装版暂不支持开机自启';return {text,disabled:!(st&&st.supported&&!st.error&&(!installed||st.enabled)),label:installed?(st?.enabled?'关闭旧版开机自启':'安装版暂不支持开机自启'):(st?.enabled?'关掉开机自启':'打开开机自启')}}

// 「看过引导」和「回访」是两件事：关掉引导只说明看过了，同学并没有离开过。
// 存档创建当天、或本次打开时才新建的存档（第一次重启之前，跨过午夜也算），首页仍按首访显示：首访标题、展开的伙伴栏、「开始 5 分钟」。
// 只读存档里已有的 created，不另加存档字段：新字段要随存档结构版本一起加，旧版本读不懂。
export function isReturningVisit(state,{now=Date.now(),freshSession=false}={}){if(!state?.preferences?.onboarded||freshSession)return false;const created=state.game?.created;return !(Number.isFinite(created)&&dayKey(created)===dayKey(now))}

// 记下已经看过新手引导：只改 onboarded 这一项，已记录过就不再写存档；写入失败要告诉用户。
export async function recordOnboarded(state,{commit,toast}){if(!state||state.preferences.onboarded)return;const next=structuredClone(state);next.preferences={...next.preferences,onboarded:true};try{await commit(next)}catch(e){toast('引导状态没能保存，下次打开还会看到：'+e.message)}}

// 把服务端报告的版本写到页面上。版本没变时不重挂设置卡片；先记下新版本再重画卡片，卡片读到的就是新版本。
export function stampVersion(v,{getVersion,setVersion,document,cards}){if(!v)return;const changed=getVersion()!==v;setVersion(v);const meta=document.querySelector('meta[name=app-version]');if(meta)meta.content=v;const badge=document.querySelector('#app-badge');if(badge)badge.textContent=v+' · 非官方应用';const about=document.querySelector('#about-version');if(about)about.textContent='szuDesktop '+v+' · 荔枝庭院';if(changed){for(const [id,ui] of cards){const card=document.getElementById(id);if(card)card.outerHTML=ui.card()}}}

// 确认框每次打开都先清掉上一次的返回值：原生 Esc 不会给 returnValue 赋新值，必须视为取消。
export function createConfirm($){return async function confirm(title,text){const d=$('#confirm');d.returnValue='';$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true}))}}
