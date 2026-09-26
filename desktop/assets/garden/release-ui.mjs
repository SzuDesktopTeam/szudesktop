import {pixelIcon} from './pixel.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  const compared=compareVersions(result.version,current());
  const message=compared===null?'无法比较当前构建，请在发布页核对版本':compared>0?'发现新版本':compared===0?'已是此渠道最新版本':'当前构建比此渠道公开版本更新';
  return `<p role="status" class="notice ${compared>0?'ok':''}">${message} · ${esc(result.version)}${result.prerelease?'（测试版）':''}</p><a class="button" href="${esc(result.url)}" target="_blank" rel="noopener noreferrer">${compared>0?'前往下载更新':'查看发布说明'} ↗</a><small>安装更新前可先导出庭院存档；下载后由你运行安装包完成更新。</small>`;
 }
 function card(){return `<section class="card" id="release-panel"><div class="card-head"><h2 class="icon-heading">${pixelIcon('i-chest','heading-icon')}版本与更新</h2><span class="badge">${esc(current())}</span></div><div class="actions"><label for="release-channel">更新渠道</label><select id="release-channel" ${busy?'disabled':''}><option value="beta" ${selected()==='beta'?'selected':''}>测试版（含正式版）</option><option value="stable" ${selected()==='stable'?'selected':''}>仅正式版</option></select><button data-action="release-check" ${busy?'disabled':''}>检查更新</button></div><div aria-live="polite">${resultHTML()}</div></section>`}
 function paint(){const el=document.getElementById('release-panel');if(el)el.outerHTML=card()}
 async function click(action){if(action!=='release-check')return false;if(busy)return true;busy=true;result=null;error='';paint();try{result=await api('/api/releases?channel='+selected())}catch(e){error=e.message||'暂时无法连接发布服务，请稍后重试。'}finally{busy=false;paint()}return true}
 function change(e){if(e.target.id!=='release-channel')return false;if(!['stable','beta'].includes(e.target.value)||busy)return true;channel=e.target.value;result=null;error='';paint();return true}
 return {card,click,change};
}
