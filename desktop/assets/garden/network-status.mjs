import {pixelIcon} from './pixel.mjs';
import {esc} from './html.mjs';

export function networkBadge(status) {
  return status ? (status.internet_ok ? '外网可用' : '外网不可用') : '状态未确认';
}

export const networkTone=status=>!status?'muted':status.internet_ok?'success':'error';
export const networkLoginHint=status=>!status?'连接状态待确认，可展开检查账号':status.internet_ok?'当前外网可用，按需展开':'填写账号，连接校园网络';
const row=(tone,icon,title,detail)=>`<div class="network-line" data-tone="${tone}">${pixelIcon(icon)}<div><strong>${title}</strong>${detail?`<span>${esc(detail)}</span>`:''}</div></div>`;

// 校园认证这一栏按 /api/status 的 online_state 分（与 desktop/internal/ui/server.go 的 onlineState* 一致）：
// online / offline 已查明；no_campus_portal 是外网正常、没判到校园网区域、门户也查不到——人在校外时本来就是这样，
// 不能常驻一条琥珀色的「请运行诊断」，把在家安装的新同学引去排查一个不存在的问题；not_queried 是没判到教学区或宿舍区、没去查。
// 这两种都用灰色的中性说明。只有 unconfirmed（判定在教学区或宿舍区，门户却查不到）才保留琥珀色和诊断引导。
// 旧版接口没有 online_state 时，按「外网正常、判区为已联网、没查明」自己判断中性状态，其余照旧按待确认处理。
export const OFF_CAMPUS_NOTE='外网正常；没有检测到校园网认证页面（不在校园网内时属正常）';
export function authState(status){
  if(status.online_known)return status.online?'online':'offline';
  if(['no_campus_portal','not_queried','unconfirmed'].includes(status.online_state))return status.online_state;
  return status.internet_ok===true&&status.zone==='online'?'no_campus_portal':'unconfirmed';
}

export function networkSummaryHTML(status,error='') {
  if(!status)return row('muted','i-compass','状态未确认',error||'网络状态尚未确认，请刷新后重试。');
  const connection=row(networkTone(status),status.internet_ok?'i-signal':'i-disconnect',networkBadge(status),status.zone_label),auth=authState(status);
  if(auth==='online'||auth==='offline')return connection+row(status.online?'success':'warning','i-shield','校园认证',status.online?'当前网络出口已在线。':'门户未检测到在线会话。');
  if(auth==='no_campus_portal')return connection+row('muted','i-compass','校园认证',status.online_note||OFF_CAMPUS_NOTE);
  if(auth==='not_queried')return connection+row('muted','i-compass','校园认证','没有判定在教学区或宿舍区，没有查询认证状态。');
  return connection+row('warning','i-compass','校园认证待确认',status.online_error?'暂未查明：'+status.online_error:'当前网络未确认校园认证状态。');
}

// 本次启动自动连接校园网的结果；没有尝试时后端不返回 auto_login，这里也不显示。
// 说明文字已由后端脱敏，这里仍按纯文本转义。
export function autoLoginHTML(status) {
  const attempt=status?.auto_login;
  if(!attempt||typeof attempt!=='object')return '';
  const at=Number(attempt.at)>0?new Date(attempt.at*1000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'';
  const when=at?' · '+at:'';
  if(attempt.result==='failed')return row('warning','i-key','启动时自动连接未成功'+when,attempt.message||'请在下方重新登录，或检查已记住的账号密码。');
  if(attempt.result==='ok')return row('success','i-signal','启动时已自动连接校园网'+when,'');
  if(attempt.result==='skipped')return row('muted','i-compass','本机已在线，启动时未重复认证'+when,'');
  return '';
}

// 网络诊断的结果：一行结论后面跟着校园网指南，看不懂结论时可以直接去查怎么处理。结论和报错都是纯文本，这里转义。
export const NETWORK_GUIDE_URL='https://github.com/SzuDesktopTeam/szudesktop/blob/main/docs/guide/network.md';
const guideLink=`<a class="diag-guide" href="${NETWORK_GUIDE_URL}" target="_blank" rel="noopener noreferrer">校园网指南 ↗</a>`;
export const diagResultHTML=d=>`<span>${esc([d.zone_label,'互联网：'+(d.internet_ok?'可用':'不可用'),'教学区门户：'+(d.teaching_portal_ok?'可达':'未确认'),'宿舍区门户：'+(d.dorm_portal_ok?'可达':'未确认'),...(d.advices||[])].join(' · '))}</span> ${guideLink}`;
export const diagErrorHTML=message=>`<span>${esc(message)}</span> ${guideLink}`;
