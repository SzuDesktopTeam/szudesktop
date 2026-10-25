import {pixelIcon} from './pixel.mjs';
import {focusKey,restoreFocus} from './shell-repaint.mjs';
import {esc} from './html.mjs';
import {isMac} from './platform.mjs';
const RELEASES_URL='https://github.com/SzuDesktopTeam/szudesktop/releases';
const INSTALL_URL='https://github.com/SzuDesktopTeam/szudesktop/blob/main/docs/guide/install.md';
function downloadHelp(){
 const packages=isMac()?'<strong>Mac</strong>：先看「苹果菜单 → 关于本机」。Apple 芯片选 <code>mac-arm64.dmg</code>，Intel 选 <code>mac-x64.dmg</code>，目前为预览版。':'<strong>大多数 Windows 同学</strong>：选文件名含 <code>Setup</code> 的 <code>.exe</code>，自带桌面伙伴。免安装选 <code>portable.exe</code>；<code>szunet</code> 是命令行工具。';
 return `<div class="release-download-help"><div class="actions"><a class="button quiet" href="${RELEASES_URL}" target="_blank" rel="noopener noreferrer">打开公开发布页 ↗</a><a href="${INSTALL_URL}" target="_blank" rel="noopener noreferrer">安装与下载帮助 ↗</a></div><details><summary>该下载哪个文件？下载很慢或失败怎么办？</summary><ul><li>${packages}</li><li><strong>下载很慢或失败</strong>：在系统浏览器打开发布页，展开 Assets 找到对应文件，稍后重试。检查更新失败不影响当前版本使用。</li><li><strong>收到同学转发的程序文件</strong>：先核对版本，再与发布页同名 <code>.sha256</code> 比对；校验步骤见安装帮助。还没有维护者确认的备用下载站。</li></ul><small>请下载程序文件，Source code 是源码。更新前先导出庭院与待办、备份课程笔记，再完整退出旧版。</small></details></div>`;
}
export function parseVersion(value){const m=/^(beta|v)?(\d+)\.(\d+)\.(\d+)$/.exec(String(value));return m?[Number(m[2]),Number(m[3]),Number(m[4]),m[1]==='beta'?0:1]:null}
export function compareVersions(a,b){const left=parseVersion(a),right=parseVersion(b);if(!left||!right)return null;for(let i=0;i<left.length;i++){if(left[i]!==right[i])return Math.sign(left[i]-right[i])}return 0}
export function createReleaseUI({api,getVersion}){
 let channel='',busy=false,result=null,error='';
 const current=()=>String(getVersion()||'未知版本');
 const selected=()=>channel||(current().startsWith('beta')?'beta':'stable');
 function resultHTML(){
  if(busy)return '<p role="status">正在检查 GitHub 发布页…</p>';
  if(error)return `<p class="notice error" role="status">${esc(error)} 当前版本仍可继续使用。</p>`;
  if(!result)return '<p class="muted">点击后才联网检查，不会自动下载或安装。</p>';
  if(!result.available)return `<p role="status">${esc(result.message||'所选渠道暂无发布版本。')}</p>`;
  // macOS 版是按芯片区分的 .dmg，更新就是拖进「应用程序」替换，没有安装包可运行；未公证的新版首次打开还要再放行一次。
  // stale：这次没连上 GitHub，服务端沿用本次运行里早先查到的结果，message 说明是多久以前查的。
  const compared=compareVersions(result.version,current());
  const message=compared===null?'无法比较当前构建，请在发布页核对版本':compared>0?'发现新版本':compared===0?'已是此渠道最新版本':'当前构建比此渠道公开版本更新';
  return `<p role="status" class="notice ${compared>0?'ok':''}">${message} · ${esc(result.version)}${result.prerelease?'（测试版）':''}</p>${result.stale&&result.message?`<p class="muted">${esc(result.message)}</p>`:''}<a class="button" href="${esc(result.url)}" target="_blank" rel="noopener noreferrer">${compared>0?'前往下载更新':'查看发布说明'} ↗</a><small>${isMac()?'更新前可先导出庭院存档。下载对应芯片的 .dmg（Apple 芯片选 arm64，Intel 选 x64），按 ⌘Q 退出后把 szuDesktop 拖进「应用程序」替换旧版；首次打开新版需要再放行一次，和第一次安装时一样。':'安装更新前可先导出庭院存档；下载后由你运行安装包完成更新。'}</small>`;
 }
 function card(){return `<section class="card" id="release-panel"><div class="card-head"><h2 class="icon-heading">${pixelIcon('i-chest','heading-icon')}版本与更新</h2><span class="badge">${esc(current())}</span></div><div class="actions"><label for="release-channel">更新渠道</label><select id="release-channel" ${busy?'disabled':''}><option value="beta" ${selected()==='beta'?'selected':''}>测试版（含正式版）</option><option value="stable" ${selected()==='stable'?'selected':''}>仅正式版</option></select><button data-action="release-check" ${busy?'disabled':''}>检查更新</button></div><div aria-live="polite">${resultHTML()}</div>${downloadHelp()}</section>`}
 // 整卡替换后把焦点放回原来的按钮或下拉框；检查期间按钮被禁用，结束后再放回去。
 function paint(spot=focusKey(document.activeElement)){const el=document.getElementById('release-panel');if(el){el.outerHTML=card();restoreFocus(spot)}}
 async function click(action){if(action!=='release-check')return false;if(busy)return true;const spot=focusKey(document.activeElement);busy=true;result=null;error='';paint(spot);try{result=await api('/api/releases?channel='+selected())}catch(e){error=e.message||'暂时无法连接发布服务，请稍后重试。'}finally{busy=false;paint(spot)}return true}
 function change(e){if(e.target.id!=='release-channel')return false;if(!['stable','beta'].includes(e.target.value)||busy)return true;channel=e.target.value;result=null;error='';paint();return true}
 return {card,click,change};
}
