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
// 官方编辑器只放行两项：复制链接/代码块用的异步剪贴板写入，以及演示和视频全屏。
// 请求方（以及嵌入它的页面）都必须是飞书官方 https 源；读剪贴板、摄像头、定位等一律拒绝。
const feishuPermissions=new Set(['clipboard-sanitized-write','fullscreen']);
export function isFeishuPermissionAllowed(permission,requestingURL,embeddingURL){
  return feishuPermissions.has(permission)&&isOfficialFeishuURL(requestingURL)
    &&(embeddingURL===undefined||embeddingURL===null||embeddingURL===''||isOfficialFeishuURL(embeddingURL));
}
export function isFeishuDocumentURL(raw){
  const url=officialURL(raw);
  return Boolean(url&&/^\/(docx|wiki)\/[A-Za-z0-9]+\/?$/.test(url.pathname));
}
