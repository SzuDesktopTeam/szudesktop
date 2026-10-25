// 网页外链只放行 http/https；邮件只允许公开反馈邮箱与 subject/body，不放开任意系统协议。
export function isSafeExternalUrl(value){
 const url=String(value||'');
 if(/^https?:\/\//i.test(url))return true;
 if(!url.startsWith('mailto:alakazama@qq.com')||url.length>1800||/[\x00-\x20]/.test(url))return false;
 try{
  const mail=new URL(url),params=mail.searchParams;
  if(mail.protocol!=='mailto:'||mail.pathname!=='alakazama@qq.com'||mail.hash)return false;
  for(const key of params.keys())if(!['subject','body'].includes(key)||params.getAll(key).length!==1)return false;
  return !/[\r\n\0]/.test(params.get('subject')||'')&&!/\0/.test(params.get('body')||'');
 }catch{return false}
}
