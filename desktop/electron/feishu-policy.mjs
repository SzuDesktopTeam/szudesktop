const officialDomains=['feishu.cn','larksuite.com','larkoffice.com'];
function officialURL(raw){
  if(typeof raw!=='string')return null;
  try{
    const url=new URL(raw);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port
      &&officialDomains.some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain))?url:null;
  }catch{return null;}
}
export function isOfficialFeishuURL(raw){return Boolean(officialURL(raw));}
export function isFeishuDocumentURL(raw){
  const url=officialURL(raw);
  return Boolean(url&&/^\/(docx|wiki)\/[A-Za-z0-9]+\/?$/.test(url.pathname));
}
