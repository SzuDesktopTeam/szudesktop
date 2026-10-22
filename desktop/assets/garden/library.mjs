// 图书馆 OPAC 检索（匿名可用，不需要登录）。
// 「我的借阅」要 CAS，等学校窗口的会话接稳了再加。
import {esc} from './html.mjs';

export function createLibraryUI({api}){
 let keyword='',items=[],busy=false,error='',message='',searched='';

 function content(){
  const list=items.length?`<ul class="library-list">${items.map(b=>`<li><b>${esc(b.title)}</b><small>${esc([b.author,b.publisher].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>`:'';
  return `<div class="card-head"><h2 class="icon-heading tone-info">图书馆</h2><span class="badge" data-tone="info">馆藏检索</span></div>
  <p>查馆藏。搜索结果来自学校图书馆 OPAC，借还要去原页。</p>
  <div class="grid"><div><label for="library-q">检索词</label><input id="library-q" value="${esc(keyword)}" placeholder="书名、作者或主题"></div></div>
  <div class="actions"><button type="button" class="primary" data-action="library-search"${busy?' disabled':''}>${busy?'检索中…':'检索'}</button></div>
  ${error?`<p role="status" class="notice error">${esc(error)}</p>`:''}
  ${!error&&message?`<p role="status" class="notice">${esc(message)}</p>`:''}
  ${list}`;
 }

 function paint(){const el=document.getElementById('library-panel');if(el)el.innerHTML=content()}

 async function click(a){
  if(a!=='library-search')return false;
  if(busy)return true;
  const q=(document.getElementById('library-q')?.value||keyword).trim();
  if(!q){error='请输入检索词';paint();return true}
  busy=true;error='';message='正在检索…';paint();
  try{
   const r=await api(`/api/library/search?q=${encodeURIComponent(q)}`);
   items=r.items||[];searched=q;keyword=q;
   message=`「${q}」找到 ${items.length} 条`;
  }catch(e){error=e.message;items=[]}
  finally{busy=false;paint()}
  return true;
 }

 function change(e){
  if(e.target.id!=='library-q')return false;
  keyword=e.target.value;return true;
 }

 function section(){return `<section class="card" id="library-panel">${content()}</section>`}
 return {section,click,change};
}
