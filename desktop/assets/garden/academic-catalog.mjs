// Read-only views of the school's class timetable and published curricula.
// Data stays in this view's memory; cookies are handled only by the main process.
import {esc} from './html.mjs';
import {unverifiedBadge} from './labels.mjs';

const homes={timetable:'https://ehall.szu.edu.cn/jwapp/sys/kcbcx/*default/index.do',program:'https://ehall.szu.edu.cn/jwapp/sys/qxfacx/*default/index.do'};
const businesses={timetable:'catalog-timetable',program:'catalog-program'};
const fresh=()=>({query:'',grade:'',department:'',major:'',term:'',page:1,pageSize:20,terms:[],list:null,detail:null});
const value=text=>text===null||text===undefined||text===''?'学校未提供':String(text);

export function createAcademicCatalogUI({api,onSessionChanged=()=>{}}){
 let mode='timetable',states={timetable:fresh(),program:fresh()},busy=false,message='',error='',generation=0;
 const state=()=>states[mode];
 const native=()=>globalThis.szuDesktop;
 const current=token=>token===generation;
 function paint(){const panel=globalThis.document?.getElementById('academic-catalog-panel');if(panel)panel.innerHTML=content()}
 function selectMode(next){
  const selected=next==='program'?'program':'timetable';
  if(selected!==mode){mode=selected;generation++;busy=false;message='';error=''}
 }
 function rangeHTML(span){
  if(!span)return '';
  const paging=span.page?`第 ${esc(span.page)} 页 · `:'';
  return `<p class="muted">${paging}${span.page?'本页':'本次'}返回 ${esc(span.returned??0)} 条 · ${span.total===null||span.total===undefined?'学校总数未提供':`学校总数 ${esc(span.total)} 条`}${span.note?`<br>${esc(span.note)}`:''}</p>`;
 }
 function provenance(data){
  if(!data)return '';
  let time='学校未提供';
  if(data.fetched_at){const date=new Date(data.fetched_at);if(!Number.isNaN(date.getTime()))time=date.toLocaleString('zh-CN')}
  // Backend sources are fixed, but no arbitrary remote href enters this view.
  const source=Object.values(homes).includes(data.source_url)?data.source_url:homes[mode];
  return `<p class="muted">读取时间：${esc(time)} · <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">学校原页</a></p>`;
 }
 function input(field,label,placeholder=''){
  return `<div><label for="academic-catalog-${field}">${label}</label><input id="academic-catalog-${field}" value="${esc(state()[field])}" placeholder="${esc(placeholder)}"${busy?' disabled':''}></div>`;
 }
 function content(){
  const timetable=mode==='timetable',s=state(),available=typeof native()?.openSchool==='function'&&typeof native()?.syncSchool==='function';
  return `<div class="card-head"><h2 class="icon-heading tone-info">${timetable?'全校课表':'培养方案'}</h2>${unverifiedBadge()}</div>
   <p>${timetable?'按学期和班级查询学校课表，排课、调课、实践课与未排课程分别显示。':'查询学校已发布的培养方案，查看模块要求及课程。方案规定不等于个人已修学分，也不保证课程当期开设。'}</p>
   <div class="actions">${available?`<button data-action="academic-catalog-open"${busy?' disabled':''}>打开学校原页登录</button><button data-action="academic-catalog-sync"${busy?' disabled':''}>读取登录并查询</button>`:`<a href="${homes[mode]}" target="_blank" rel="noopener noreferrer">打开学校原页</a><small>安装版可从学校窗口读取本人登录；网页版需先建立本机学校会话。</small>`}</div>
   ${timetable?`<div class="grid"><div><label for="academic-catalog-term">学期代码</label><input id="academic-catalog-term" list="academic-catalog-term-options" value="${esc(s.term)}" placeholder="先读取学校学期，或输入官方学期代码"${busy?' disabled':''}><datalist id="academic-catalog-term-options">${s.terms.map(t=>`<option value="${esc(t.id)}">${esc(t.name||t.id)}</option>`).join('')}</datalist></div></div><div class="actions"><button data-action="academic-catalog-terms"${busy?' disabled':''}>读取学校学期</button></div><small>候选来自学校课表参数，未列出全部历史学期；其他学期请填写学校原页提供的代码，如 2026-2027-1。</small>`:''}
   <div class="grid">${input('query',timetable?'班级名称':'方案名称','可留空')}${input('grade','年级','如 2026')}${input('department','学院','可留空')}${input('major','专业','可留空')}</div>
   <div class="actions"><button class="primary" data-action="academic-catalog-query"${busy?' disabled':''}>${busy?'正在查询…':timetable?'查询班级':'查询培养方案'}</button><button class="quiet" data-action="academic-catalog-reset">清除查询结果</button></div>
   <p id="academic-catalog-status" class="notice${error?' error':''}" role="status"${error||message?'':' hidden'}>${esc(error||message)}</p>
   <div id="academic-catalog-results">${s.list?listHTML(s.list):`<p class="empty">${busy?'正在读取学校数据…':'尚未查询。请在学校原页完成本人登录后读取。'}</p>`}
   ${s.detail?(timetable?timetableHTML(s.detail):programHTML(s.detail)):''}</div>`;
 }
 function listHTML(data){
  const timetable=mode==='timetable',rows=data.items||[];
  const list=rows.length?`<ul class="library-list">${rows.map(item=>`<li><b>${esc(timetable?item.name:item.title)}</b><small>${esc([item.grade?item.grade+'级':'',item.department,item.major].filter(Boolean).join(' · '))}</small>${!timetable?`<small>最低学分 ${esc(value(item.minimum_credits))} · 学制 ${esc(value(item.duration_years))} · ${esc(value(item.degree))}</small>`:''}<button class="quiet" data-action="academic-catalog-detail" data-code="${esc(item.code)}"${busy?' disabled':''}>${timetable?'查看班级课表':'查看模块与课程'}</button></li>`).join('')}</ul>`:`<p class="empty">学校本次查询返回 0 条${timetable?'班级':'方案'}；可调整条件或到原页核对。</p>`;
  return `${provenance(data)}${rangeHTML(data.range)}${list}<div class="actions"><button data-action="academic-catalog-prev"${busy||data.page<=1?' disabled':''}>上一页</button><span>第 ${esc(data.page||1)} 页</span><button data-action="academic-catalog-next"${busy||!data.range?.has_next?' disabled':''}>下一页</button></div>`;
 }
 function courseHTML(course){
  const weekday=course.weekday==null?'':`星期${['','一','二','三','四','五','六','日'][course.weekday]||course.weekday}`;
  const periods=course.start_section==null?'':`第 ${course.start_section}${course.end_section==null||course.end_section===course.start_section?'':'–'+course.end_section} 节`;
  const schedule=[course.weeks,weekday,periods,course.location,course.campus].filter(x=>x!==null&&x!==undefined&&x!=='').join(' · ');
  return `<li><b>${esc(course.name)}</b><small>${esc([course.code,course.section?`课序 ${course.section}`:'',course.teacher].filter(Boolean).join(' · '))}</small><p>${esc(course.arrangement||schedule||'学校未提供时间地点')}</p></li>`;
 }
 function timetableHTML(data){
  return `<div><h3>${esc(data.class?.name||'所选班级')} · ${esc(data.term)}</h3>${provenance(data)}${data.range?.note?`<p class="notice">${esc(data.range.note)}</p>`:''}${[['scheduled','排课'],['adjustments','调课'],['practicals','实践课'],['unarranged','未排课程']].map(([key,label])=>`<div><h4>${label} · ${(data[key]||[]).length} 条</h4>${rangeHTML(data.ranges?.[key])}${data[key]?.length?`<ul class="library-list">${data[key].map(courseHTML).join('')}</ul>`:`<p class="empty">学校本次返回该类课程为空。</p>`}</div>`).join('')}</div>`;
 }
 function planCourseHTML(course){
  return `<li><b>${esc(course.name)}</b><small>${esc([course.code,course.nature,course.exam_type,course.core?'主干课程':''].filter(Boolean).join(' · '))}</small><p>学分 ${esc(value(course.credits))} · 学时 ${esc(value(course.hours))}${course.recommended_semester!=null?` · 建议第 ${esc(course.recommended_semester)} 学期`:''}${course.term?` · ${esc(course.term)}`:''}</p></li>`;
 }
 function programHTML(data){
  const detail=data.detail||{},modules=data.modules||[],courses=data.courses||[],known=new Set(modules.map(m=>m.code)),other=courses.filter(c=>!known.has(c.module_code));
  const prose=[['培养目标',detail.objectives],['毕业要求',detail.requirements],['主要学科',detail.subjects],['主干课程',detail.core_courses],['方案特色',detail.features]].filter(([,text])=>text).map(([label,text])=>`<details><summary>${label}</summary><p>${esc(text)}</p></details>`).join('');
  return `<div><h3>${esc(data.summary?.title||'所选培养方案')}</h3>${provenance(data)}<p class="notice">${esc(data.range?.note||'培养方案不是个人已修学分。')}</p>${prose}${(detail.notes||[]).map(note=>`<p>${esc(note)}</p>`).join('')}<h4>课程模块 · ${modules.length} 个</h4>${rangeHTML(data.ranges?.modules)}${rangeHTML(data.ranges?.courses)}${modules.map(module=>{const items=courses.filter(c=>c.module_code===module.code),parent=modules.find(m=>m.code===module.parent_code);return `<details><summary>${esc(module.name)} · 要求学分 ${esc(value(module.required_credits))}</summary><p>${esc([module.type,module.category,parent?'上级模块：'+parent.name:''].filter(Boolean).join(' · '))}</p><p>模块总学分 ${esc(value(module.total_credits))} · 学时 ${esc(value(module.hours))} · 课程数 ${esc(value(module.course_count))}</p>${items.length?`<ul class="library-list">${items.map(planCourseHTML).join('')}</ul>`:'<p class="empty">学校本次没有返回该模块的课程条目。</p>'}</details>`}).join('')}${!modules.length?'<p class="empty">学校本次返回模块列表为空。</p>':''}${other.length?`<h4>其他模块课程</h4><p class="muted">这些课程的模块代码未出现在本次模块列表中，保留学校返回的课程。</p><ul class="library-list">${other.map(planCourseHTML).join('')}</ul>`:''}${!courses.length?'<p class="empty">学校本次返回课程列表为空。</p>':''}</div>`;
 }
 async function loadTerms(token,s){
  const data=await api('/api/academic/catalog/terms');
  if(!current(token))return false;
  if(!Array.isArray(data.items)||!data.items.length)throw Error('学校没有返回可识别学期，请到原页核对');
  s.terms=data.items;if(!s.term)s.term=data.items[0].id;
  return true;
 }
 async function loadList(token,s){
  s.list=null;s.detail=null;
  if(mode==='timetable'&&!s.term&&!await loadTerms(token,s))return;
  const params=new URLSearchParams({page:String(s.page),page_size:String(s.pageSize)});
  for(const [key,text]of [['q',s.query],['grade',s.grade],['department',s.department],['major',s.major],['term',mode==='timetable'?s.term:'']])if(text.trim())params.set(key,text.trim());
  const data=await api(`/api/academic/catalog/${mode==='timetable'?'classes':'programs'}?${params}`);
  if(!current(token))return;
  if(!Array.isArray(data.items))throw Error('学校返回的列表无法识别，请到原页核对');
  s.list=data;s.page=data.page||s.page;s.pageSize=data.page_size||s.pageSize;if(mode==='timetable')s.term=data.term||s.term;
  message='已读取学校本次返回的数据。';
 }
 async function click(action,element){
  if(!action.startsWith('academic-catalog-'))return false;
  if(action==='academic-catalog-reset'){reset();paint();return true}
  if(busy)return true;
  const s=state(),token=++generation;busy=true;error='';message='正在查询…';
  try{
   if(action==='academic-catalog-open'){
    if(typeof native()?.openSchool!=='function')throw Error('请在安装版中打开学校窗口，或使用上方的学校原页链接');
    message='正在打开学校原页…';paint();await native().openSchool(businesses[mode]);
    if(current(token))message='请在学校原页完成本人登录，再返回点击「读取登录并查询」。';
   }else if(action==='academic-catalog-sync'){
    for(const view of Object.values(states)){view.list=null;view.detail=null;view.terms=[]}paint();
    if(typeof native()?.syncSchool!=='function')throw Error('安装版才能读取学校窗口登录，请先建立本机学校会话');
    try{await native().syncSchool(businesses[mode])}
    finally{if(current(token))await onSessionChanged()}
    if(current(token)){
     s.page=1;await loadList(token,s);
    }
   }else if(action==='academic-catalog-terms'){
    s.list=null;s.detail=null;paint();if(await loadTerms(token,s))message='已读取学校课表参数中的学期；其他历史学期请在原页核对代码。';
   }else if(action==='academic-catalog-query'||action==='academic-catalog-prev'||action==='academic-catalog-next'){
    if(action==='academic-catalog-prev')s.page=Math.max(1,s.page-1);
    else if(action==='academic-catalog-next'){if(!s.list?.range?.has_next)return true;s.page++}
    else s.page=1;
    s.list=null;s.detail=null;paint();await loadList(token,s);
   }else if(action==='academic-catalog-detail'){
    const code=element?.dataset?.code;
    if(!code||!s.list?.items?.some(item=>item.code===code))throw Error('请先查询并选择学校返回的条目');
    s.detail=null;paint();
    const params=new URLSearchParams(mode==='timetable'?{term:s.list.term,class_code:code}:{plan_code:code});
    const data=await api(`/api/academic/catalog/${mode==='timetable'?'timetable':'program'}?${params}`);
    if(current(token)){s.detail=data;message='已读取所选条目的学校详情。'}
   }
  }catch(cause){if(current(token)){error=(cause.message||'学校查询失败，请到原页核对').replace(/^Error invoking remote method '[^']+': Error: /,'');message=''}}
  finally{if(current(token)){busy=false;paint()}}
  return true;
 }
 function change(event){
  if(!event.target?.id?.startsWith('academic-catalog-'))return false;
  const field=event.target?.id?.replace(/^academic-catalog-/,'');
  if(!['query','grade','department','major','term'].includes(field))return false;
  if(state()[field]===event.target.value)return true;
  state()[field]=event.target.value;state().page=1;state().list=null;state().detail=null;
  generation++;busy=false;error='';message='查询条件已更改，请重新查询。';
  // Native change fires on blur, before the pressed button receives click.
  // Never replace form controls here: that would swallow the first click and
  // interrupt Chinese IME composition. Clear only the stale output region.
  const results=globalThis.document?.getElementById('academic-catalog-results');if(results)results.textContent='';
  const status=globalThis.document?.getElementById('academic-catalog-status');
  if(status){status.textContent=message;status.className='notice';status.hidden=false}
  const panel=globalThis.document?.getElementById('academic-catalog-panel');
  for(const control of panel?.querySelectorAll?.('input,button')||[])control.disabled=false;
  return true;
 }
 function reset(){generation++;states={timetable:fresh(),program:fresh()};busy=false;message='';error=''}
 function section(nextMode='timetable'){selectMode(nextMode);return `<section class="card span" id="academic-catalog-panel">${content()}</section>`}
 return {section,click,change,input:change,reset};
}
