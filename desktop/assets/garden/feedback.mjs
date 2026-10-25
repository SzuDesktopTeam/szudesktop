import {isMac} from './platform.mjs';
import {esc} from './html.mjs';
import {diagnosticReport} from './diagnostic-report.mjs';
import {focusKey,restoreFocus} from './shell-repaint.mjs';
// 「提交反馈」和页脚「问题与建议」打开同一页指南，后续新增渠道可直接在文档更新。
// 内置邮件草稿只发往已经公开的维护邮箱，Electron 外链策略也限定了同一个地址。
export const FEEDBACK_URL='https://github.com/SzuDesktopTeam/szudesktop/blob/main/docs/guide/feedback.md';
export const FEEDBACK_EMAIL='alakazama@qq.com';
const safeVersion=value=>/^(?:beta|v)?\d+\.\d+\.\d+$/.test(String(value))?String(value):'未知构建';
// 邮件应用对 URI 长度支持不同：长正文不截断，用户可以粘贴全文或附上导出的 TXT。
export function feedbackMailto(preview,version){const base=`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('szuDesktop 反馈 · '+safeVersion(version))}`,full=base+'&body='+encodeURIComponent(preview);return full.length<=1800?{url:full,bodyIncluded:true}:{url:base,bodyIncluded:false}}
// macOS 桌面版以 preload 给出的 platform 为准，并且要在 /win/ 之前判断（"darwin" 里也含 win）；没有桥时仍按浏览器报告的系统猜。
export function environmentSummary({version,mode,navigatorInfo=globalThis.navigator,bridge=globalThis.szuDesktop}={}){
 const mac=isMac(bridge),platform=String(navigatorInfo?.userAgentData?.platform||navigatorInfo?.platform||navigatorInfo?.userAgent||'');
 const os=mac?'macOS':/android/i.test(platform)?'Android':/iphone|ipad|ipod/i.test(platform)?'iOS':/win/i.test(platform)?'Windows':/mac/i.test(platform)?'macOS':/linux/i.test(platform)?'Linux':'未知系统';
 return `szuDesktop ${safeVersion(version)}\n系统：${os}\n界面：${mode==='electron'?(mac?'macOS 桌面版窗口':'安装版桌面窗口'):'便携版 / 浏览器窗口'}`;
}
// 反馈卡片：环境信息三行照旧；诊断报告放在折叠区里，同学先看过全文再点复制，应用不会自动上传（见 diagnostic-report.mjs）。
// getDiagnostics 返回 {status,diag,services}：最近一次网络状态、最近一次网络诊断、各学校服务最近一次请求的结构摘要。
function downloadText(text,name){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
export function createFeedbackUI({getVersion,getMode,toast,clipboard=globalThis.navigator?.clipboard,getDiagnostics=()=>({}),download=downloadText}){
 const summary=()=>environmentSummary({version:getVersion(),mode:getMode()});
 const report=()=>diagnosticReport({environment:summary(),...getDiagnostics()});
 let manual=false,reportManual=false,reportOpen=false,emailManual=false;
 const draft={expected:'',actual:'',steps:''};
 let draftOpen=false,includeDiagnostics=false,preview='',draftManual=false,previewNotice='';
 function mailHTML(){const mail=feedbackMailto(preview,getVersion());return `<p><a class="button" href="${esc(mail.url)}" target="_blank" rel="noopener noreferrer">发邮件反馈 ↗</a></p><small>${mail.bodyIncluded?'将把上方已预览的内容放入默认邮件应用的草稿。':'正文较长，邮件草稿只填入收件人和主题；请复制全文粘贴，或附上导出的文本。'}不会自动发送。若没有邮件应用，可复制邮箱地址，在常用邮箱中写信。</small>`}
 function draftHTML(){return `<details class="feedback-report feedback-draft" ${draftOpen?'open':''}><summary>整理一份反馈 · 无需登录</summary><p class="muted">先写清楚遇到了什么，再复制或保存为文本交给维护者。草稿只在本次打开期间保留，关闭或刷新前请导出；这里不会自动提交。</p><p><label for="feedback-expected">想做什么</label><input id="feedback-expected" maxlength="500" value="${esc(draft.expected)}" placeholder="例如：查看篮球场的空闲时段"></p><p><label for="feedback-actual">实际发生了什么</label><input id="feedback-actual" maxlength="1000" value="${esc(draft.actual)}" placeholder="例如：点击查询后，项目变回羽毛球"></p><p><label for="feedback-steps">复现步骤（可选）</label><textarea id="feedback-steps" maxlength="3000" rows="3" placeholder="按顺序写下点过的按钮、出现的提示">${esc(draft.steps)}</textarea></p><label class="check"><input type="checkbox" id="feedback-include-diagnostics" ${includeDiagnostics?'checked':''}> 附上经过脱敏的诊断报告（可选）</label><small>正文按你填写的内容原样保留，请勿输入密码、Cookie、学号或个人成绩。环境信息会自动附上，诊断报告默认不附带。</small><div class="actions"><button data-action="feedback-preview">预览反馈全文</button></div><p id="feedback-preview-status" role="status" class="muted">${esc(previewNotice)}</p>${preview?`<div id="feedback-draft-preview"><h3>将要复制或导出的内容</h3>${draftManual?'<p role="status" class="notice">请选中下方反馈全文手动复制，或保存为文本。</p>':''}<pre class="feedback-environment feedback-report-text">${esc(preview)}</pre><div class="actions"><button data-action="feedback-draft-copy">复制反馈全文</button><button class="quiet" data-action="feedback-export">保存为文本</button></div>${mailHTML()}<small>复制或导出不等于已提交。也可以通过上方「提交反馈」查看其他现有渠道。</small></div>`:''}</details>`}
 function card(text=report()){return `<section class="card" id="feedback-panel"><h2>反馈与建议</h2><p>遇到问题时，附上发生步骤和下面三项信息，能帮助我们复现。</p><p>反馈邮箱：<strong>${FEEDBACK_EMAIL}</strong> <button class="quiet" data-action="feedback-email-copy">复制邮箱地址</button></p>${emailManual?'<p role="status" class="notice">请选中邮箱地址手动复制。</p>':''}<pre class="feedback-environment">${summary()}</pre><div class="actions"><button data-action="feedback-copy">复制环境信息</button><a class="button quiet" href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">提交反馈 ↗</a></div><small>只复制版本、系统类型和界面模式，不包含学号、成绩、密码、Cookie 或存档。「提交反馈」打开使用指南里的反馈说明，写着现在可以用哪些方式反馈。</small>${manual?'<p role="status" class="notice">剪贴板暂不可用，请选中上方三行文字手动复制。</p>':''}${draftHTML()}<details class="feedback-report" ${reportOpen?'open':''}><summary>诊断报告 · 先预览，再复制</summary><p class="muted">网络或学校服务出问题时用。只列判区、门户是否可达、最近一次网络诊断的结论，以及各学校服务的状态类别和字段是否出现；不含账号、卡号、密码、IP、Cookie、成绩或课程内容。复制后由你决定发给谁，应用不会自动上传。</p><pre class="feedback-environment feedback-report-text">${esc(text)}</pre><div class="actions"><button data-action="feedback-report">复制诊断报告</button></div>${reportManual?'<p role="status" class="notice">剪贴板暂不可用，请选中上方报告手动复制。</p>':''}</details></section>`}
 async function write(text){if(!clipboard?.writeText)throw Error('clipboard unavailable');await clipboard.writeText(text)}
 async function click(action){
  let text;const spot=focusKey(document.activeElement);
  if(action==='feedback-email-copy'){try{await write(FEEDBACK_EMAIL);emailManual=false;toast('邮箱地址已复制')}catch{emailManual=true;toast('请选中邮箱地址手动复制')}}
  else if(action==='feedback-copy'){try{await write(summary());manual=false;toast('已复制版本、系统和界面模式')}catch{manual=true;toast('请选中环境信息手动复制')}}
  // 复制的就是重画后预览里的那一份：先生成、再复制，卡片用同一份文字重画。
  else if(action==='feedback-report'){text=report();reportOpen=true;try{await write(text);reportManual=false;toast('已复制诊断报告，只含结构、不含具体值')}catch{reportManual=true;toast('请选中诊断报告手动复制')}}
  else if(action==='feedback-preview'){
   draftOpen=true;
   if(!Object.values(draft).some(value=>value.trim())){previewNotice='先填写想做的事或遇到的问题，再预览。';toast(previewNotice)}
   else {preview=['szuDesktop 问题与建议',summary(),'想做什么：\n'+(draft.expected.trim()||'未填写'),'实际发生：\n'+(draft.actual.trim()||'未填写'),'复现步骤：\n'+(draft.steps.trim()||'未填写'),...(includeDiagnostics?[report()]:[])].join('\n\n');draftManual=false;previewNotice='请确认下面的全文，再复制或导出。'}
  }
  else if(action==='feedback-draft-copy'||action==='feedback-export'){
   if(!preview){toast('请先预览反馈全文');return true}
   if(action==='feedback-draft-copy'){try{await write(preview);draftManual=false;toast('反馈全文已复制，尚未提交')}catch{draftManual=true;toast('请手动复制全文，或保存为文本')}}
   else {try{await download(preview,'szuDesktop-feedback-'+safeVersion(getVersion())+'.txt');toast('反馈文本已导出，尚未提交')}catch{draftManual=true;toast('未能保存文件，请手动复制反馈全文')}}
  }
  else return false;
  const el=document.getElementById('feedback-panel');if(el){el.outerHTML=card(text);restoreFocus(spot)}return true;
 }
 function invalidatePreview(){draftOpen=true;preview='';draftManual=false;previewNotice='内容已修改，请重新预览。';const box=document.getElementById('feedback-draft-preview');if(box)box.hidden=true;const hint=document.getElementById('feedback-preview-status');if(hint)hint.textContent=previewNotice}
 function input(e){const field={'feedback-expected':'expected','feedback-actual':'actual','feedback-steps':'steps'}[e.target.id];if(!field)return false;draft[field]=e.target.value;invalidatePreview();return true}
 function change(e){if(e.target.id!=='feedback-include-diagnostics')return false;includeDiagnostics=e.target.checked;invalidatePreview();return true}
 return {card,click,input,change};
}
