// 「复制诊断报告」：同学把网络或学校服务的问题交回来时用，只输出结构，不输出具体值。
// 报告里没有账号、卡号、密码、IP、Cookie、ac_id 编号，也没有成绩、课表、公告的内容：学校服务只列 HTTP 状态类别、
// 条数、期望字段是否出现（键名和 JSON 类型）。本科同学靠它就能核对成绩与课表的字段映射，不用交出成绩。
// 报告先在反馈卡片里预览，由同学自己复制、自己决定发给谁；这里不上传任何东西。

import {authState} from './network-status.mjs';

// 只记这几项学校服务的 GET 查询；存档、笔记、登录和凭据请求一律不记。
// fields 是顶层期望字段，list 是列表字段，item 是列表项的期望字段（与 desktop/internal/ui 里对应的 JSON 键一致）。
export const SCHOOL_SERVICES=[
 {path:'/api/campus/notices',name:'学校公告',fields:['source','items','fetched_at','stale'],list:'items',item:['title','url','date']},
 {path:'/api/campus/calendar',name:'官方校历',fields:['terms','checked_at','source','stale'],list:'terms',item:['name','start','end','week_start','classes_start']},
 {path:'/api/booking/rooms',name:'学习空间列表',fields:['rooms','today','fetched_at'],list:'rooms',item:['id','name','campus','community','type']},
 {path:'/api/booking/availability',name:'学习空间空位',fields:['room','date','slots','fetched_at'],list:'slots',item:['start','end','state']},
 {path:'/api/scores',name:'在线成绩',byLevel:true,fields:['level','label','items','fetched','total','full'],list:'items',item:['name','term','credit','score','gpa','category','identity']},
 {path:'/api/academic/undergrad/timetable',name:'本科课表',fields:['level','term','courses','fetched_at'],list:'courses',item:['name','code','class','teacher','arrangement']},
 {path:'/api/academic/timetable',name:'研究生课表',fields:['level','term','entries','unscheduled','fetched_at'],list:'entries',item:['name','day','start','end','weeks','room','teacher']},
 {path:'/api/piano/rooms',name:'琴房列表',fields:['rooms','count'],list:'rooms',item:['name','device','manager','desc']},
 {path:'/api/piano/my',name:'我的琴房预约',fields:['list'],list:'list',item:['room','time','sign']},
];
const LEVELS={undergrad:'本科',graduate:'研究生'};
const jsonType=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const filled=value=>value!==undefined&&value!==null&&value!==''&&!(Array.isArray(value)&&!value.length);
export const statusClass=code=>Number.isInteger(code)&&code>=100&&code<600?Math.floor(code/100)+'xx':'无响应';

// 把一次响应收成结构摘要：只留键名、类型和计数，响应本身不保存。
function shapeOf(spec,data){
 if(!data||typeof data!=='object'||Array.isArray(data))return {type:jsonType(data)};
 const rows=Array.isArray(data[spec.list])?data[spec.list]:null;
 return {
  fields:spec.fields.map(key=>[key,Object.hasOwn(data,key)?jsonType(data[key]):'缺失']),
  rows:rows?rows.length:null,
  items:rows?spec.item.map(key=>[key,rows.filter(row=>row&&typeof row==='object'&&filled(row[key])).length]):[],
 };
}

// 记下每项学校服务最近一次的结果。wrap(api) 包住交给学校服务界面的 api()：成功记 2xx 和结构摘要，
// 失败记错误上的 HTTP 状态码（本机服务无响应时没有状态码，记为「无响应」）。请求和返回值原样透传。
export function createServiceLog(){
 const latest=new Map();
 function record(path,status,data){
  const [pathname,query='']=String(path).split('?'),spec=SCHOOL_SERVICES.find(s=>s.path===pathname);
  if(!spec)return;
  const level=spec.byLevel?new URLSearchParams(query).get('level'):null,known=Object.hasOwn(LEVELS,level||'')?level:'';
  latest.set(spec.path+':'+known,{spec,level:known,status,shape:status>=200&&status<300?shapeOf(spec,data):null});
 }
 const wrap=api=>async(path,...rest)=>{let data;try{data=await api(path,...rest)}catch(e){record(path,Number.isInteger(e?.code)?e.code:0);throw e}record(path,200,data);return data};
 return {record,wrap,entries:()=>[...latest.values()]};
}

const ZONES={teaching:'教学区',dorm:'宿舍区',online:'已联网',outside:'校外，或校园网不通',unknown:'未知'};
const zone=code=>(Object.hasOwn(ZONES,code||'')?ZONES[code]:'未知')+(code?`（${Object.hasOwn(ZONES,code)?code:'?'}）`:'');
const yes=(value,ok,bad,unknown='未提供')=>value===true?ok:value===false?bad:unknown;
// 诊断结论是服务端写好的固定句子，其中接入点编号、IP 和长串数字是具体值，一律遮掉。
export const scrubAdvice=text=>String(text).replace(/(ac_id）：)[^，,；;\s]+/g,'$1（已隐藏）').replace(/\d{1,3}(?:\.\d{1,3}){3}(?!\/)/g,'（IP 已隐藏）').replace(/\d{5,}/g,'（数字已隐藏）').slice(0,240);
// ac_id 只报来源类别：启动参数、本机记录、网关下发还是页面推测。
// 按服务端 acIDAdvice 写的「（ac_id）：」找那一行：两套协议指纹都能用时，前面还有一句「如果登录报 ac_id 或协议错误…」，
// 只找「ac_id」会先撞上它，来源就退成笼统的「可信来源」或「推测」。
function acIdSource(diag){
 if(!diag.ac_id)return '不适用（这次没有探测教学区接入点）';
 const line=(diag.advices||[]).find(text=>String(text).includes('ac_id）：'))||'';
 return line.includes('启动参数')?'启动参数':line.includes('认证成功的记录')?'本机上次成功的记录':line.includes('网关下发')?'校园网网关下发':line.includes('推测')?'从门户页面推测':diag.ac_id_trusted?'可信来源':'推测';
}
// 学校域名是否被代理的 Fake-IP 接管：诊断接口的 dns_fake_ip；旧版接口没有这个字段时，看结论里有没有提到 198.18.0.0/15。
function fakeIP(diag){
 if(typeof diag.dns_fake_ip==='boolean')return diag.dns_fake_ip?'是（代理软件接管了学校域名）':'否';
 const text=[...(diag.advices||[]),...(diag.notes||[])].join('\n');
 return text.includes('198.18.0.0/15')?'是（代理软件接管了学校域名）':'这一版诊断接口没有单独提供';
}

function statusLines(status){
 if(!status)return ['本次打开后还没有读到网络状态。'];
 const auth={online:'出口已在线',offline:'出口未在线',no_campus_portal:'外网正常，没有检测到校园网认证页面',not_queried:'没有判定在教学区或宿舍区，未查询',unconfirmed:'未查明（查询出错）'}[authState(status)];
 const auto={ok:'成功',failed:'未成功',skipped:'已在线，跳过'}[status.auto_login?.result]||'本次未尝试';
 return [`判区：${zone(status.zone)}`,`外网：${yes(status.internet_ok,'可用','不可用')}`,`校园认证：${auth}`,`启动时自动连接：${auto}`];
}
function diagLines(diag){
 if(!diag)return ['本次打开后还没有运行网络诊断。可以先到「校园网」页点「运行网络诊断」，再回来复制报告。'];
 const lines=[`判区：${zone(diag.zone)}`,`外网：${yes(diag.internet_ok,'可用','不可用')}`,`门户探测：${yes(diag.probed,'已运行','外网正常时不探测门户')}`,
  `教学区门户：${yes(diag.teaching_portal_ok,'可达','不可达')}`,`宿舍区门户：${yes(diag.dorm_portal_ok,'可达','不可达')}`,
  `net.szu.edu.cn 解析：${yes(diag.dns_ok,'成功','失败')}`,`学校域名解析到 198.18.0.0/15：${fakeIP(diag)}`,`ac_id 来源：${acIdSource(diag)}`,'系统代理开关：诊断接口暂未提供'];
 if(typeof diag.online==='boolean')lines.push(`账号在线：${diag.online?'是':'否'}`);
 const advices=(Array.isArray(diag.advices)?diag.advices:[]).map(scrubAdvice);
 return [...lines,'结论：',...(advices.length?advices.map(text=>'- '+text):['- （诊断没有给出结论）'])];
}
function serviceLine(entry){
 const {spec,level,status,shape}=entry,name=spec.name+(level?`（${LEVELS[level]}）`:'');
 if(!shape)return `${name}：${statusClass(status)}`;
 if(shape.type)return `${name}：${statusClass(status)} · 响应不是对象（${shape.type}）`;
 const fields=shape.fields.map(([key,type])=>`${key}:${type}`).join(' ');
 const items=shape.rows===null?'':` · ${spec.list} ${shape.rows} 条`+(shape.rows?'，字段 '+shape.items.map(([key,count])=>`${key} ${count}/${shape.rows}`).join(' '):'');
 return `${name}：${statusClass(status)} · ${fields}${items}`;
}
function serviceLines(entries=[]){
 const done=new Set(entries.map(entry=>entry.spec.path));
 return [...entries.map(serviceLine),...SCHOOL_SERVICES.filter(spec=>!done.has(spec.path)).map(spec=>`${spec.name}：本次打开后未请求`)];
}

export function diagnosticReport({environment='',status=null,diag=null,services=[]}={}){
 return ['szuDesktop 诊断报告（只含结构：不含账号、卡号、密码、IP、Cookie、ac_id 编号、成绩、课表或公告内容）',environment,
  '','【网络状态】最近一次刷新',...statusLines(status),
  '','【网络诊断】最近一次',...diagLines(diag),
  '','【学校服务】本次打开后每项最近一次请求：HTTP 状态类别、条数、期望字段是否出现',...serviceLines(services)].join('\n');
}
