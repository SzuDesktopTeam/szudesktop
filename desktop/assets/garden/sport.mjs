// 体育场馆预约（ehall 的 qljfwapp 应用）。
// 和社区空间（swzx）是两回事：这里是羽毛球、篮球这些运动场地。
// 提交的字段映射还没实测，解析已做宽松容错；调试用 raw_sample 会带回学校返回的开头一段。
import {esc} from './html.mjs';

const KINDS={'1':'包场','2':'散场'};

export function createSportUI({api,toast}){
 let rooms=[],date='',day=null,busy=false,error='',message='',needLogin=false;
 let start='',end='',phone='',kind='2',agree=false,pending=null;

 const hasWindow=()=>typeof globalThis.szuDesktop?.openSchool==='function';
 const canSync=()=>typeof globalThis.szuDesktop?.syncSchool==='function';

 function content(){
  const roomOptions=rooms.map(r=>`<option value="${esc(r.id)}"${date===''?'':''}>${esc(KINDS[r.kind]||'场地')} · ${esc(r.name)}（${esc(r.campus==='2'?'丽湖':'粤海')}）</option>`).join('');
  return `<div class="card-head"><h2 class="icon-heading tone-info">体育场馆</h2><span class="badge" data-tone="info">羽毛球 · 篮球</span></div>
  <p>找一块能挥拍的场地。提交前会再核对一次时段。</p>
  ${needLogin?`<div class="notice" data-tone="warning"><p>还没登录学校系统。先打开学校窗口登录一次，之后会记住。</p><div class="actions">${hasWindow()?`<button type="button" class="primary" data-action="sport-login">打开学校窗口</button>`:''}${canSync()?`<button type="button" data-action="sport-sync"${busy?' disabled':''}>登录完成了</button>`:''}</div></div>`:''}
  <div class="actions"><button type="button" data-action="sport-venues"${busy?' disabled':''}>${rooms.length?'刷新场地':'先读场地'}</button></div>
  ${rooms.length?`<div class="grid"><div><label for="sport-room">场地 · ${rooms.length}</label><select id="sport-room">${roomOptions}</select></div><div><label for="sport-date">使用日期</label><input id="sport-date" type="date" value="${esc(date)}"></div></div><div class="actions"><button type="button" data-action="sport-times"${busy?' disabled':''}>查询时段</button></div>`:''}
  ${error?`<p role="status" class="notice error">${esc(error)}</p>`:''}
  ${!error&&message?`<p role="status" class="notice">${esc(message)}</p>`:''}
  ${day?timesSection():''}`;
 }

 function timesSection(){
  const chips=day.slots.map(s=>`<button type="button" class="booking-slot" data-tone="${s.free?'success':'muted'}" data-action="sport-pick" data-index="${s.index}" aria-pressed="${start===s.start&&end===s.end}"${s.free?'':' disabled'}><b>${esc(s.start)}–${esc(s.end)}</b><small>${s.free?'可订':'已满'}</small></button>`).join('');
  const chosen=start&&end?`${start}–${end}`:'';
  return `<h3>选择时段</h3>
   <ul class="booking-slots">${chips||'<li class="empty">这天没有开放时段</li>'}</ul>
   ${start?`<div class="notice" data-tone="info">已选 ${esc(chosen)}</div>`:''}
   <div class="grid three">
    <div><label for="sport-phone">手机号</label><input id="sport-phone" inputmode="numeric" value="${esc(phone)}" placeholder="11 位手机号"></div>
    <div><label for="sport-kind">类型</label><select id="sport-kind"><option value="2"${kind==='2'?' selected':''}>散场（按格）</option><option value="1"${kind==='1'?' selected':''}>包场（整场）</option></select></div>
    <div><label><input id="sport-agree" type="checkbox"${agree?' checked':''}> 已读场地须知</label></div>
   </div>
   <div class="actions"><button type="button" class="primary" data-action="sport-prepare"${busy||!start||!end||!agree?' disabled':''}>核对并继续</button></div>
   ${pending?`<div class="notice" data-tone="warning"><p><strong>${esc(pending.time)}</strong> · ${esc(day.date)}</p><p class="muted">两分钟内有效，过期要重新核对。</p><div class="actions"><button type="button" class="primary" data-action="sport-commit"${busy?' disabled':''}>确认提交</button><button type="button" data-action="sport-cancel">取消</button></div></div>`:''}`;
 }

 function paint(){const el=document.getElementById('sport-panel');if(el)el.innerHTML=content()}

 async function click(a,el){
  if(a==='sport-login'){
   try{await globalThis.szuDesktop.openSchool('sport');message='学校窗口已打开，登录后回来点「登录完成了」。';error=''}
   catch(e){error=e.message}
   paint();return true;
  }
  if(a==='sport-sync'){
   if(busy)return true;busy=true;error='';message='正在同步登录状态…';paint();
   try{
    const r=await globalThis.szuDesktop.syncSchool('sport');
    needLogin=false;message=r&&r.message?r.message:'登录状态已同步';
    const v=await api('/api/sport/venues');
    rooms=v.rooms||[];
    if(rooms.length&&!date)date=new Date().toISOString().slice(0,10);
   }catch(e){error=e.message;needLogin=true}
   finally{busy=false;paint()}
   return true;
  }
  if(a==='sport-venues'){
   if(busy)return true;busy=true;error='';message='正在读取场地…';paint();
   try{
    const r=await api('/api/sport/venues');
    rooms=r.rooms||[];
    message=rooms.length?`读到 ${rooms.length} 个场地`:'学校本次没有返回场地，请稍后再试。';
    if(rooms.length&&!date)date=new Date().toISOString().slice(0,10);
    needLogin=!rooms.length;
   }catch(e){error=e.message;needLogin=/登录/.test(e.message)}
   finally{busy=false;paint()}
   return true;
  }
  if(a==='sport-times'){
   if(busy)return true;
   const room=document.getElementById('sport-room')?.value||'';
   const dateVal=document.getElementById('sport-date')?.value||date;
   if(!room){error='请选择场地';paint();return true}
   busy=true;error='';message='正在读取时段…';paint();
   try{
    const d=new Date(dateVal);date=d.toISOString().slice(0,10);
    day=await api(`/api/sport/times?room=${encodeURIComponent(room)}&date=${encodeURIComponent(date)}`);
    start='';end='';pending=null;
    message=`读到 ${day.slots?day.slots.length:0} 格时段`;
    if(day.raw_sample)message+=`（调试用：${day.raw_sample.length} 字节）`;
   }catch(e){error=e.message}
   finally{busy=false;paint()}
   return true;
  }
  if(a==='sport-pick'){
   const i=Number(el&&el.dataset.index);
   const slot=day&&Array.isArray(day.slots)?day.slots.find(s=>s.index===i):null;
   if(slot){start=slot.start;end=slot.end;pending=null;paint()}
   return true;
  }
  if(a==='sport-prepare'){
   if(busy||!start||!end)return true;
   busy=true;error='';paint();
   try{
    const room=document.getElementById('sport-room')?.value||'';
    const dateVal=document.getElementById('sport-date')?.value||date;
    const r=await api('/api/sport/prepare',{room_id:room,date:dateVal,start,end,phone,kind,agree:true},'POST');
    pending={token:r.token,time:r.time,date:r.date};
    message='核对通过，确认下面这次预约后再提交。';
   }catch(e){error=e.message}
   finally{busy=false;paint()}
   return true;
  }
  if(a==='sport-commit'){
   if(busy||!pending)return true;
   busy=true;error='';paint();
   try{
    const r=await api('/api/sport/commit',{token:pending.token},'POST');
    pending=null;
    message=r.message||'提交成功，请核对「我的预约」';
    // 提交后刷新时段，避免看到旧状态
    const room=document.getElementById('sport-room')?.value||'';
    const dateVal=document.getElementById('sport-date')?.value||date;
    if(room&&dateVal)day=await api(`/api/sport/times?room=${encodeURIComponent(room)}&date=${encodeURIComponent(dateVal)}`);
    start='';end='';
   }catch(e){error=e.message;pending=null}
   finally{busy=false;paint()}
   return true;
  }
  if(a==='sport-cancel'){pending=null;message='已取消这次预约';paint();return true}
  return false;
 }

 function change(e){
  const id=e.target.id;
  if(id==='sport-phone'){phone=e.target.value;return true}
  if(id==='sport-kind'){kind=e.target.value;return true}
  if(id==='sport-agree'){agree=e.target.checked;return true}
  return false;
 }

 function section(){return `<section class="card" id="sport-panel">${content()}</section>`}
 return {section,click,change};
}
