import {esc} from './html.mjs';
import {normalizeTodoSource} from './todo-source.mjs';

// 公告发布日期不是截止日期。保存之前由同学决定标题与日期。
export function createTodoComposer({save,toast=()=>{}}){
 let dialog=null,saving=false;
 function open({text,source}){
  if(dialog?.open)return;
  const origin=normalizeTodoSource(source);
  if(!origin)throw Error('这条公告的来源无法识别，请先打开原文确认');
  dialog?.remove();
  dialog=document.createElement('dialog');
  dialog.className='todo-source-dialog';
  dialog.setAttribute('aria-labelledby','todo-source-heading');
  dialog.innerHTML=`<form><h2 id="todo-source-heading">把公告记成一件待办</h2><p class="muted">写下你要做的事，原公告会一起保留。</p><label for="todo-source-text">待办内容</label><input id="todo-source-text" name="text" maxlength="120" required value="${esc(String(text||'').slice(0,120))}"><label for="todo-source-date">计划日期（可不填）</label><input id="todo-source-date" name="date" type="date"><small>发布日期不一定是截止日期，请查看原文后自己决定。</small><p class="todo-source-preview">来源：${esc(origin.title)}</p><p role="status" aria-live="polite"></p><div class="actions"><button type="submit">保存待办</button><button type="button" class="quiet" data-composer-cancel>取消</button></div></form>`;
  const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]'),id=crypto.randomUUID();
  const close=()=>{if(!saving)dialog.close()};
  dialog.querySelector('[data-composer-cancel]').addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault()});
  form.addEventListener('submit',async e=>{
   e.preventDefault();e.stopPropagation();if(saving)return;
   const text=form.elements.text.value.trim();
   if(!text){status.textContent='写下一件要做的事再保存';form.elements.text.focus();return}
   saving=true;status.textContent='正在保存…';
   for(const control of form.elements)control.disabled=true;
   try{await save({type:'todoAdd',id,text,date:form.elements.date.value,source:origin});dialog.close();toast('已加入学习待办，原公告也一起保留了')}
   catch(error){status.textContent=error.message||'未能保存，内容仍在这里，可以重试'}
   finally{saving=false;for(const control of form.elements)control.disabled=false}
  });
  document.body.append(dialog);dialog.showModal();form.elements.text.focus();
 }
 return {open};
}
