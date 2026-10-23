// Anonymous OPAC queries and official institutional resource entries.
import {esc} from './html.mjs';
import {pixelIcon} from './pixel.mjs';

const opac='https://www.lib.szu.edu.cn/opac/search.aspx';
const account='https://www.lib.szu.edu.cn/opac/user/userinfo.aspx';
const resourceLink=(url,text,extra='')=>`<a class="button quiet" href="${url}" target="_blank" rel="noopener noreferrer" ${extra}>${text} ↗</a>`;

export function createLibraryUI({api}){
 let keyword='',items=[],busy=false,error='',message='',page=1,version=0;
 function resources(){const native=typeof globalThis.szuDesktop?.openSchool==='function';return `<section class="library-resources"><h3 class="icon-heading">${pixelIcon('i-key')}个人借阅与文献</h3><p class="muted">用你自己的学校账号在官方页面查看借阅、检索文献。数据库的校外通道和机构权限由图书馆提供。</p><div class="actions">${resourceLink(account,'个人借阅',native?'data-action="library-account-open"':'')}${resourceLink('https://www.lib.szu.edu.cn/er/access/16084','知网 · 学校入口')}${resourceLink('https://www.lib.szu.edu.cn/er/access/16075','万方 · 学校入口')}</div><small>${native?'个人借阅在学校窗口打开；知网和万方在系统浏览器中打开。':'这几个入口在系统浏览器中打开。'}文献结果与个人借阅记录在原页查看。</small></section>`}
 function content(){
  const list=items.length?`<ul class="library-list">${items.map(b=>`<li><div class="library-book"><b>${esc(b.title)}</b><small>${esc([b.author,b.publisher,b.year].filter(Boolean).join(' · '))}</small></div>${b.ctrl_no?`<div class="actions"><button type="button" class="quiet library-copies-btn" data-action="library-copies" data-ctrl="${esc(b.ctrl_no)}">查看馆藏</button>${resourceLink('https://www.lib.szu.edu.cn/opac/bookinfo.aspx?ctrlno='+encodeURIComponent(b.ctrl_no),'书目原页')}</div><div class="library-copies" hidden></div>`:''}</li>`).join('')}</ul>`:'';
  return `<div class="card-head"><h2 class="icon-heading tone-info">${pixelIcon('i-book','heading-icon')}图书馆</h2><span class="badge" data-tone="info">馆藏检索</span></div>
  <p>按书名、作者或主题找书，展开查看位置、索书号和在架状态。</p>
  <form id="library-search-form"><label for="library-q">检索词</label><div class="library-search"><input id="library-q" name="q" type="search" maxlength="60" value="${esc(keyword)}" placeholder="书名、作者或主题"><button type="submit" class="primary"${busy?' disabled':''}>${busy?'检索中…':'检索'}</button></div></form>
  <div class="library-results" aria-live="polite">${error?`<p role="status" class="notice error">${esc(error)}</p>`:''}
  ${message?`<p role="status" class="notice">${esc(message)}</p>`:''}
  ${list}
  ${items.length?`<div class="actions library-pages"><button type="button" data-action="library-prev"${busy||page<=1?' disabled':''}>上一页</button><span>第 ${page} 页 · 本页 ${items.length} 条</span><button type="button" data-action="library-next"${busy||items.length<20?' disabled':''}>下一页</button>${resourceLink(opac,'图书馆原页')}</div>`:''}</div>
  ${resources()}`;
 }
 function paint(){const el=document.getElementById('library-panel');if(el)el.innerHTML=content()}
 async function search(nextPage=1){
  if(busy)return;
  const q=(document.getElementById('library-q')?.value??keyword).trim();
  keyword=q;
  if(!q||[...q].length>60){error='请输入 1–60 个字的检索词';paint();return}
  const request=++version;
  busy=true;error='';message='正在读取图书馆…';paint();
  try{
   const r=await api(`/api/library/search?q=${encodeURIComponent(q)}&page=${nextPage}`);
   if(request!==version)return;
   if(!Array.isArray(r.items))throw Error('图书馆返回的检索结果无法识别，请查看原页。');
   items=r.items;page=r.page||nextPage;
   message=items.length?`「${q}」· 当前页最多 20 条，更多结果可翻页。`:'本页没有可显示的书目，请查看图书馆原页核对。';
  }catch(e){if(request===version){error=e.message;message=''}}
  finally{if(request===version){busy=false;paint()}}
 }
 async function click(action,el){
  if(action==='library-account-open'){
   try{await globalThis.szuDesktop.openSchool('library-account');message='个人借阅页面已打开，请在学校原页查看自己的记录。';error=''}
   catch(e){error=(e.message||'学校页面暂时无法打开').replace(/^Error invoking remote method '[^']+': Error: /,'')}
   paint();return true;
  }
  if(action==='library-copies'){
   const ctrl=el?.dataset?.ctrl,box=el?.parentElement?.parentElement?.querySelector?.('.library-copies')||el?.parentElement?.querySelector?.('.library-copies');
   if(!ctrl||!box)return true;
   if(!box.hidden){box.hidden=true;el.textContent='查看馆藏';return true}
   box.hidden=false;el.textContent='收起馆藏';
   if(box.dataset.loaded)return true;
   box.textContent='正在读取馆藏…';
   try{
    const result=await api('/api/library/item?ctrlno='+encodeURIComponent(ctrl));
    const rows=(result.copies||[]).map(c=>{const tone=/^(?:可供出借|可借|在架|在馆)(?:$|[（(\s])/.test(c.status)?'success':/借出|外借/.test(c.status)?'warning':'info';return `<li><span class="copy-loc">${esc(c.location||'位置未提供')}</span><span class="copy-call">${esc(c.call_no||'索书号未提供')}</span><span class="badge" data-tone="${tone}">${esc(c.status||'状态未提供')}</span></li>`}).join('');
    box.innerHTML=rows?`<ul class="copy-list">${rows}</ul>`:'<p class="muted">这条书目未返回馆藏信息，请到书目原页核对。</p>';
    box.dataset.loaded='1';
   }catch(e){box.textContent=e.message||'馆藏读取失败，请到书目原页查看。'}
   return true;
  }
  if(!['library-search','library-next','library-prev'].includes(action))return false;
  await search(action==='library-next'?page+1:action==='library-prev'?Math.max(1,page-1):1);return true;
 }
 function input(event){
  if(event.target.id!=='library-q')return false;
  keyword=event.target.value;version++;items=[];page=1;busy=false;error='';message='';
  const root=document.getElementById('library-panel'),results=root?.querySelector?.('.library-results'),button=root?.querySelector?.('#library-search-form button');
  if(results)results.innerHTML='';
  if(button){button.disabled=false;button.textContent='检索'}
  return true;
 }
 function change(event){
  // Replacing a focused search field can emit change during submit's paint.
  // The same query (including trimmed outer spaces) must not cancel its read.
  if(event.target.id==='library-q'&&event.target.value.trim()===keyword.trim())return true;
  return input(event);
 }
 async function submit(form){if(form.id!=='library-search-form')return false;await search();return true}
 function section(){return `<section class="card" id="library-panel">${content()}</section>`}
 return {section,click,change,input,submit};
}
