export const schoolTargets=Object.freeze({
  undergrad:'https://ehall.szu.edu.cn/jwapp/sys/wdkb/*default/index.do',
  graduate:'https://ehall.szu.edu.cn/yjsxkapp/sys/xsxkapp/*default/index.do',
  'undergrad-scores':'https://ehall.szu.edu.cn/jwapp/sys/cjcx/*default/index.do',
  'graduate-scores':'https://ehall.szu.edu.cn/gsapp/sys/xscjglapp/*default/index.do',
  booking:'https://swzx.webvpn.szu.edu.cn/#/pages/booth/szu-booth-list',
  sport:'https://ehall.szu.edu.cn/qljfwapp/sys/lwSzuCgyy/index.do#/sportVenue',
  'catalog-timetable':'https://ehall.szu.edu.cn/jwapp/sys/kcbcx/*default/index.do',
  'catalog-program':'https://ehall.szu.edu.cn/jwapp/sys/qxfacx/*default/index.do',
  'academic-completion':'https://ehall.szu.edu.cn/jwapp/sys/xywccx/*default/index.do',
  lecture:'https://lecture.szu.edu.cn/',
  'library-account':'https://www.lib.szu.edu.cn/opac/user/userinfo.aspx',
});
const hosts=new Set(['ehall.szu.edu.cn','authserver.szu.edu.cn','webvpn.szu.edu.cn','authserver-443.webvpn.szu.edu.cn',
  'swzx.webvpn.szu.edu.cn','swzx.szu.edu.cn','www.lib.szu.edu.cn','lib.szu.edu.cn','lecture.szu.edu.cn']);
export function isSchoolURL(raw){
  try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&hosts.has(u.hostname);}
  catch{return false;}
}
export function isLibraryAuthorizationURL(raw){
  try{const u=new URL(raw);return isSchoolURL(raw)&&u.hostname==='www.lib.szu.edu.cn'&&u.pathname.startsWith('/er/access/');}
  catch{return false;}
}
export function academicCookies(cookies){
  return cookies.filter(c=>['ehall.szu.edu.cn','.ehall.szu.edu.cn','szu.edu.cn','.szu.edu.cn'].includes(c.domain))
    .map(({name,value,path})=>({name,value,path}));
}
