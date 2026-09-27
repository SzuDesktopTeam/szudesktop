import {pixelIcon} from './pixel.mjs';
import {esc} from './html.mjs';

export function networkBadge(status) {
  return status ? (status.internet_ok ? '外网可用' : '外网不可用') : '状态未确认';
}

export const networkTone=status=>!status?'muted':status.internet_ok?'success':'error';
export const networkLoginHint=status=>!status?'连接状态待确认，可展开检查账号':status.internet_ok?'当前外网可用，按需展开':'填写账号，连接校园网络';
const row=(tone,icon,title,detail)=>`<div class="network-line" data-tone="${tone}">${pixelIcon(icon)}<div><strong>${title}</strong>${detail?`<span>${esc(detail)}</span>`:''}</div></div>`;

export function networkSummaryHTML(status,error='') {
  if(!status)return row('muted','i-compass','状态未确认',error||'网络状态尚未确认，请刷新后重试。');
  const connection=row(networkTone(status),status.internet_ok?'i-signal':'i-disconnect',networkBadge(status),status.zone_label);
  if(status.online_known)return connection+row(status.online?'success':'warning','i-shield','校园认证',status.online?'当前网络出口已在线。':'门户未检测到在线会话。');
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
