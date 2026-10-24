// 体育场馆预约（ehall 的 qljfwapp 应用）。
// 和社区空间（swzx）是两回事：这里是羽毛球、篮球这些运动场地。
// 提交的字段映射还没实测，解析已做宽松容错；调试用 raw_sample 会带回学校返回的开头一段。
import {esc} from './html.mjs';

const KINDS={'1':'包场','2':'散场'};

export function createSportUI({api,toast}){
 let rooms=[],room='',date='',day=null,daySelection=null,busy=false,committing=false,error='',message='',needLogin=false,version=0;
 let start='',end='',phone='',kind='2',agree=false,pending=null;

 const hasWindow=()=>typeof globalThis.szuDesktop?.openSchool==='function';
 const canSync=()=>typeof globalThis.szuDesktop?.syncSchool==='function';

 function content(){
  const roomOptions=rooms.map(r=>`<option value="${esc(r.id)}"${r.id===room?' selected':''}>${esc(KINDS[r.kind]||'场地')} · ${esc(r.name)}（${esc(r.campus==='2'?'丽湖':'粤海')}）</option>`).join('');
  return `<div class="card-head"><h2 class="icon-heading tone-info">体育场馆</h2><span class="badge" data-tone="info">学校运动场地</span></div>
  <p>选择运动项目与日期，查看学校开放的时段。</p>
  ${needLogin?`<div class="notice" data-tone="warning"><p>还没登录学校系统。先打开学校窗口登录一次，之后会记住。</p><div class="actions">${hasWindow()?`<button type="button" class="primary" data-action="sport-login">打开学校窗口</button>`:''}${canSync()?`<button type="button" data-action="sport-sync"${busy?' disabled':''}>登录完成了</button>`:''}</div></div>`:''}
  <div class="actions"><button type="button" data-action="sport-venues"${busy?' disabled':''}>${rooms.length?'刷新场地':'先读场地'}</button></div>
  ${rooms.length?`<div class="grid"><div><label for="sport-room">场地 · ${rooms.length}</label><select id="sport-room"${committing?' disabled':''}>${roomOptions}</select></div><div><label for="sport-date">使用日期</label><input id="sport-date" type="date" value="${esc(date)}"${committing?' disabled':''}></div></div><div class="actions"><button type="button" data-action="sport-times"${busy?' disabled':''}>查询时段</button></div>`:''}
  <div id="sport-results">${resultsHTML()}</div>`;
 }

 function statusHTML(){return `${error?`<p role="status" class="notice error">${esc(error)}</p>`:''}${!error&&message?`<p role="status" class="notice">${esc(message)}</p>`:''}`}
 function resultsHTML(){return `<div id="sport-status">${statusHTML()}</div>${day?timesSection():''}`}
 function clearResults(){day=null;daySelection=null;start='';end='';pending=null}
 function paintButtons(){
  for(const action of ['sport-venues','sport-times','sport-sync']){const button=document.querySelector(`#sport-panel [data-action="${action}"]`);if(button)button.disabled=busy}
  const prepare=document.querySelector('#sport-panel [data-action="sport-prepare"]');if(prepare)prepare.disabled=busy||!start||!end||!agree;
  for(const button of document.querySelectorAll('#sport-panel [data-action="sport-pick"]'))button.disabled=busy||!day?.slots.find(slot=>slot.index===Number(button.dataset.index))?.free;
 }
 function paintResults(){
  const results=document.getElementById('sport-results');if(results)results.innerHTML=resultsHTML();
  paintButtons();
 }
 function paintBookingControls(){
  // Keep the query status above the form in place: phone blur must not move
  // the checkbox or prepare button between pointerdown and click.
  const confirmation=document.getElementById('sport-confirmation');if(confirmation)confirmation.innerHTML=confirmationHTML();
  paintButtons();
 }
 function confirmationHTML(){return pending?`<div class="notice" data-tone="warning"><p>核对通过，请确认这次预约。</p><p>${esc(rooms.find(r=>r.id===pending.room)?.name||pending.room)} · <strong>${esc(pending.time)}</strong> · ${esc(pending.date)}</p><p class="muted">两分钟内有效，过期要重新核对。</p><div class="actions"><button type="button" class="primary" data-action="sport-commit"${busy?' disabled':''}>确认提交</button><button type="button" data-action="sport-cancel">取消</button></div></div>`:''}

 function timesSection(){
  const chips=day.slots.map(s=>`<button type="button" class="booking-slot" data-tone="${s.free?'success':'muted'}" data-action="sport-pick" data-index="${s.index}" aria-pressed="${start===s.start&&end===s.end}"${s.free&&!busy?'':' disabled'}><b>${esc(s.start)}–${esc(s.end)}</b><small>${s.free?'可订':'已满'}</small></button>`).join('');
  const chosen=start&&end?`${start}–${end}`:'';
  return `<h3>选择时段</h3>
   <ul class="booking-slots">${chips||'<li class="empty">这天没有开放时段</li>'}</ul>
   ${start?`<div class="notice" data-tone="info">已选 ${esc(chosen)}</div>`:''}
   <div class="grid three">
    <div><label for="sport-phone">手机号</label><input id="sport-phone" inputmode="numeric" value="${esc(phone)}" placeholder="11 位手机号"${committing?' disabled':''}></div>
    <div><label for="sport-kind">类型</label><select id="sport-kind"${committing?' disabled':''}><option value="2"${kind==='2'?' selected':''}>散场（按格）</option><option value="1"${kind==='1'?' selected':''}>包场（整场）</option></select></div>
    <div><label><input id="sport-agree" type="checkbox"${agree?' checked':''}${committing?' disabled':''}> 已读场地须知</label></div>
   </div>
   <div class="actions"><button type="button" class="primary" data-action="sport-prepare"${busy||!start||!end||!agree?' disabled':''}>核对并继续</button></div>
   <div id="sport-confirmation">${confirmationHTML()}</div>`;
 }

 function paint(){const el=document.getElementById('sport-panel');if(el)el.innerHTML=content()}

 async function click(a,el){
  if(a==='sport-login'){
   try{await globalThis.szuDesktop.openSchool('sport');message='学校窗口已打开，登录后回来点「登录完成了」。';error=''}
   catch(e){error=e.message}
   paint();return true;
  }
  if(a==='sport-sync'){
   if(busy)return true;const request=++version;busy=true;clearResults();error='';message='正在同步登录状态…';paint();
   try{
    const r=await globalThis.szuDesktop.syncSchool('sport');
    if(request!==version)return true;
    needLogin=false;message=r&&r.message?r.message:'登录状态已同步';
    const v=await api('/api/sport/venues');
    if(request!==version)return true;
    rooms=v.rooms||[];
    if(!rooms.some(r=>r.id===room))room=rooms[0]?.id||'';
    if(rooms.length&&!date)date=new Date().toISOString().slice(0,10);
   }catch(e){if(request===version){error=e.message;needLogin=true}}
   finally{if(request===version){busy=false;paint()}}
   return true;
  }
  if(a==='sport-venues'){
   if(busy)return true;const request=++version;busy=true;clearResults();error='';message='正在读取场地…';paint();
   try{
    const r=await api('/api/sport/venues');
    if(request!==version)return true;
    rooms=r.rooms||[];
    if(!rooms.some(r=>r.id===room))room=rooms[0]?.id||'';
    message=rooms.length?`读到 ${rooms.length} 个场地`:'学校本次没有返回场地，请稍后再试。';
    if(rooms.length&&!date)date=new Date().toISOString().slice(0,10);
    needLogin=!rooms.length;
   }catch(e){if(request===version){error=e.message;needLogin=/登录/.test(e.message)}}
   finally{if(request===version){busy=false;paint()}}
   return true;
  }
  if(a==='sport-times'){
   if(busy)return true;
   if(!room){error='请选择场地';paint();return true}
   if(!date||Number.isNaN(new Date(date).getTime())){error='请选择日期';paintResults();return true}
   const request=++version,selection={room,date};
   busy=true;clearResults();error='';message='正在读取时段…';paint();
   try{
    const result=await api(`/api/sport/times?room=${encodeURIComponent(selection.room)}&date=${encodeURIComponent(selection.date)}`);
    if(request!==version)return true;
    day=result;daySelection=selection;
    message=`读到 ${day.slots?day.slots.length:0} 格时段`;
    if(day.raw_sample)message+=`（调试用：${day.raw_sample.length} 字节）`;
   }catch(e){if(request===version)error=e.message}
   finally{if(request===version){busy=false;paint()}}
   return true;
  }
  if(a==='sport-pick'){
   if(busy)return true;
   const i=Number(el&&el.dataset.index);
   const slot=day&&Array.isArray(day.slots)?day.slots.find(s=>s.index===i):null;
   if(slot?.free){start=slot.start;end=slot.end;pending=null;paint()}
   return true;
  }
  if(a==='sport-prepare'){
   if(busy||!start||!end||!agree||!daySelection||daySelection.room!==room||daySelection.date!==date)return true;
   const request=++version,selection={...daySelection};
   busy=true;pending=null;error='';paint();
   try{
    const r=await api('/api/sport/prepare',{room_id:selection.room,date:selection.date,start,end,phone,kind,agree:true},'POST');
    if(request!==version)return true;
    pending={token:r.token,time:r.time,room:selection.room,date:selection.date};
   }catch(e){if(request===version)error=e.message}
   finally{if(request===version){busy=false;paint()}}
   return true;
  }
  if(a==='sport-commit'){
   if(busy||!pending||pending.room!==room||pending.date!==date)return true;
   const request=++version,confirmation=pending;
   busy=committing=true;pending=null;error='';message='正在提交，请稍候…';paint();
   try{
    const r=await api('/api/sport/commit',{token:confirmation.token},'POST');
    if(request!==version)return true;
    message=r.message||'提交成功，请核对「我的预约」';
    // 提交后刷新时段，避免看到旧状态
    const result=await api(`/api/sport/times?room=${encodeURIComponent(confirmation.room)}&date=${encodeURIComponent(confirmation.date)}`);
    if(request!==version)return true;
    day=result;daySelection={room:confirmation.room,date:confirmation.date};
    start='';end='';
   }catch(e){if(request===version){error=e.message;pending=null}}
   finally{committing=false;busy=false;paint()}
   return true;
  }
  if(a==='sport-cancel'){if(committing)return true;pending=null;message='已取消这次预约';paint();return true}
  return false;
 }

 function change(e){
  const id=e.target.id;
  const values={'sport-room':room,'sport-date':date,'sport-phone':phone,'sport-kind':kind,'sport-agree':agree};
  if(!Object.hasOwn(values,id))return false;
  const property=id==='sport-agree'?'checked':'value',value=e.target[property];
  // A sent reservation cannot be cancelled by changing the form underneath it.
  if(committing){e.target[property]=values[id];return true}
  if(value===values[id])return true;
  if(id==='sport-room')room=value;
  else if(id==='sport-date')date=value;
  else if(id==='sport-phone')phone=value;
  else if(id==='sport-kind')kind=value;
  else agree=value;
  version++;busy=false;pending=null;
  // Keep inputs and the prepare button in place so blur does not swallow a click.
  if(id==='sport-room'||id==='sport-date'){error='';message='';clearResults();paintResults()}
  else paintBookingControls();
  return true;
 }

 function section(){return `<section class="card" id="sport-panel">${content()}</section>`}
 return {section,click,change};
}
