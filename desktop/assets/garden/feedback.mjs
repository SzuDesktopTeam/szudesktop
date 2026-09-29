import {isMac} from './platform.mjs';
import {esc} from './html.mjs';
import {diagnosticReport} from './diagnostic-report.mjs';
const safeVersion=value=>/^(?:beta|v)?\d+\.\d+\.\d+$/.test(String(value))?String(value):'未知构建';
// macOS 桌面版以 preload 给出的 platform 为准，并且要在 /win/ 之前判断（"darwin" 里也含 win）；没有桥时仍按浏览器报告的系统猜。
export function environmentSummary({version,mode,navigatorInfo=globalThis.navigator,bridge=globalThis.szuDesktop}={}){
 const mac=isMac(bridge),platform=String(navigatorInfo?.userAgentData?.platform||navigatorInfo?.platform||navigatorInfo?.userAgent||'');
 const os=mac?'macOS':/android/i.test(platform)?'Android':/iphone|ipad|ipod/i.test(platform)?'iOS':/win/i.test(platform)?'Windows':/mac/i.test(platform)?'macOS':/linux/i.test(platform)?'Linux':'未知系统';
 return `szuDesktop ${safeVersion(version)}\n系统：${os}\n界面：${mode==='electron'?(mac?'macOS 桌面版窗口':'安装版桌面窗口'):'便携版 / 浏览器窗口'}`;
}
// 反馈卡片：环境信息三行照旧；诊断报告放在折叠区里，同学先看过全文再点复制，应用不会自动上传（见 diagnostic-report.mjs）。
// getDiagnostics 返回 {status,diag,services}：最近一次网络状态、最近一次网络诊断、各学校服务最近一次请求的结构摘要。
export function createFeedbackUI({getVersion,getMode,toast,clipboard=globalThis.navigator?.clipboard,getDiagnostics=()=>({})}){
 const summary=()=>environmentSummary({version:getVersion(),mode:getMode()});
 const report=()=>diagnosticReport({environment:summary(),...getDiagnostics()});
 let manual=false,reportManual=false,reportOpen=false;
 function card(text=report()){return `<section class="card" id="feedback-panel"><h2>反馈与建议</h2><p>遇到问题时，附上发生步骤和下面三项信息，能帮助我们复现。</p><pre class="feedback-environment">${summary()}</pre><div class="actions"><button data-action="feedback-copy">复制环境信息</button><a class="button quiet" href="https://github.com/SzuDesktopTeam/szudesktop/issues/new/choose" target="_blank" rel="noopener noreferrer">提交反馈 ↗</a></div><small>只复制版本、系统类型和界面模式，不包含学号、成绩、密码、Cookie 或存档。提交 GitHub 反馈需要 GitHub 账号。</small>${manual?'<p role="status" class="notice">剪贴板暂不可用，请选中上方三行文字手动复制。</p>':''}<details class="feedback-report" ${reportOpen?'open':''}><summary>诊断报告 · 先预览，再复制</summary><p class="muted">网络或学校服务出问题时用。只列判区、门户是否可达、最近一次网络诊断的结论，以及各学校服务的状态类别和字段是否出现；不含账号、卡号、密码、IP、Cookie、成绩或课程内容。复制后由你决定发给谁，应用不会自动上传。</p><pre class="feedback-environment feedback-report-text">${esc(text)}</pre><div class="actions"><button data-action="feedback-report">复制诊断报告</button></div>${reportManual?'<p role="status" class="notice">剪贴板暂不可用，请选中上方报告手动复制。</p>':''}</details></section>`}
 async function write(text){if(!clipboard?.writeText)throw Error('clipboard unavailable');await clipboard.writeText(text)}
 async function click(action){
  let text;
  if(action==='feedback-copy'){try{await write(summary());manual=false;toast('已复制版本、系统和界面模式')}catch{manual=true;toast('请选中环境信息手动复制')}}
  // 复制的就是重画后预览里的那一份：先生成、再复制，卡片用同一份文字重画。
  else if(action==='feedback-report'){text=report();reportOpen=true;try{await write(text);reportManual=false;toast('已复制诊断报告，只含结构、不含具体值')}catch{reportManual=true;toast('请选中诊断报告手动复制')}}
  else return false;
  const el=document.getElementById('feedback-panel');if(el)el.outerHTML=card(text);return true;
 }
 return {card,click};
}
