import {pixelIcon} from './pixel.mjs';
import {esc} from './html.mjs';
export function createSchoolWindowUI({onSessionChanged}){
 let message='',error=false,busy=false,business='undergrad';
 const businesses={undergrad:'本科课表',graduate:'研究生课表','undergrad-scores':'本科成绩','graduate-scores':'研究生成绩'};
 const available=()=>typeof globalThis.szuDesktop?.openSchool==='function';
 function card(booking=false,preferred='undergrad'){
  if(!available())return '';
  if(booking)return `<section class="card span"><h2 class="icon-heading tone-success">${pixelIcon('i-key','heading-icon')}在应用内办理预约</h2><p>打开学校预约窗口，直接登录、选择时段并提交。预约结果和取消也在同一个学校页面查看。</p><div class="actions"><button class="primary" data-action="official-booking">打开学校预约窗口</button></div><small>学校可能要求 WebVPN 和二次验证，请在原页面完成；以学校显示的预约结果为准。</small></section>`;
  const next=Object.hasOwn(businesses,preferred)?preferred:'undergrad';
  if(next!==business){business=next;message='';error=false}
  return `<section class="card span" id="official-account"><div class="card-head"><h2 class="icon-heading tone-info">${pixelIcon('i-key','heading-icon')}学校账号 · 登录后读取</h2><span class="badge" data-tone="info">${businesses[business]}</span></div><p>在学校原页面完成登录；回到这里读取本次登录，再查看下面的${business.endsWith('-scores')?'成绩':'课表'}。</p><p class="muted">登录入口跟随当前页面。切换本科或研究生，请使用上方的「我的培养层次」。</p><div class="actions"><button class="primary" data-action="official-open" ${busy?'disabled':''}>1. 打开学校登录</button><button data-action="official-sync" ${busy?'disabled':''}>2. 读取本次登录</button><button class="quiet" data-action="official-clear" ${busy?'disabled':''}>清除学校登录</button></div><p id="official-status" class="notice${error?' error':''}" role="status">${esc(message||'账号权限由学校决定；登录只保留到退出应用，不保存密码。')}</p><small>验证码和二次验证由学校页面处理；不同业务权限分别核验。</small></section>`;
 }
 function paint(){const status=document.getElementById('official-status');if(status){status.textContent=message;status.classList.toggle('error',error)}for(const el of document.querySelectorAll('#official-account button'))el.disabled=busy}
 async function click(action){
  if(!action.startsWith('official-'))return false;
  if(busy)return true;
  busy=true;error=false;message='正在处理…';paint();
  try{
   const target=business;
   if(action==='official-open'||action==='official-booking'){
    await globalThis.szuDesktop.openSchool(action==='official-booking'?'booking':target);
    message='学校窗口已打开。登录完成后，返回这里点击「读取本次登录」。';
   }else if(action==='official-sync'){
    try{const result=await globalThis.szuDesktop.syncSchool(target);message=result.message}
    finally{await onSessionChanged()}
   }else if(action==='official-clear'){
    const result=await globalThis.szuDesktop.clearSchool();message=result.message;await onSessionChanged();
   }
  }catch(e){error=true;message=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'')}
  finally{busy=false;paint()}
  return true;
 }
 return {card,click};
}
