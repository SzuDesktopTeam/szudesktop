import {pixelIcon} from './pixel.mjs';
import {esc} from './html.mjs';
const directory='https://www.szu.edu.cn/yxjg/xbxy.htm';
const link=(url,text)=>`<a class="button quiet" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text} ↗</a>`;
// 设置里「学院」一栏是自由填写的文字：写全称（或包含全称）就对上那个来源；写的是名称中的一段（至少 3 个字）时，只有唯一对上才算。
// 对不上就不猜，交给同学自己在列表里选。
export function matchCollege(sources,text){
 const t=String(text||'').replace(/\s+/g,'');
 if(t.length<2)return '';
 const exact=sources.find(s=>s.name===t);if(exact)return exact.id;
 const within=sources.filter(s=>t.includes(s.name)).sort((a,b)=>b.name.length-a.name.length);if(within.length)return within[0].id;
 const partial=t.length>=3?sources.filter(s=>s.name.includes(t)):[];
 return partial.length===1?partial[0].id:'';
}
// 最新一条已经是一个月以前的，就在列表顶上说一句：教务部通知这类栏目会停更很久，同学不该因此以为功能坏了。
export function staleNote(items,now=Date.now()){
 const latest=items.map(x=>x.date).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')).sort().at(-1);
 if(!latest)return '';
 const months=Math.floor((now-new Date(latest+'T00:00:00').getTime())/(30*86400000));
 return months>=1?`这个栏目最新一条发布于 ${months} 个月前（${latest}），可能不常更新；可以换一个学院或部门看看。`:'';
}
// getProfile 返回设置里的学院和培养层次 {college,level}。
export function createNoticesUI({api,getSource=()=> 'undergrad',setSource,getProfile=()=>({}),now=()=>Date.now()}){
 // source 为空表示还没选：第一次进公告页时先请同学选学院，不自动读默认栏目。
 // picked 表示本次打开里同学亲手选过，之后不再按设置重新推断。
 let sources=[],source='',picked=false,unmatched='',catalogLoading=false,catalogError='',feed=null,error='',loading=false,requestVersion=0,preferenceError='',entered=false,initialRead=false;
 let query='',searchScope='title',search=null,searchError='',searching=false,searchingQuery='',searchVersion=0;
 const current=()=>sources.find(s=>s.id===source);
 const officialSearch=()=>current()?.search_mode==='official';
 function resetSearch(){query='';searchScope='title';search=null;searchError='';searching=false;searchingQuery='';searchVersion++}
 function noticeList(items){
  return `<ul class="campus-notices">${items.map((x,i)=>`<li data-index="${i}"><time>${esc(x.date||'')}</time>${x.can_read===false?`<a class="notice-title" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a><small>外部原页</small>`:`<button type="button" class="notice-title" data-action="notice-open" data-url="${esc(x.url)}">${esc(x.title)}</button>`}<a class="notice-src" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a><div class="notice-body" hidden></div></li>`).join('')}</ul>`;
 }
 function searchControls(){
  if(!current()?.readable)return '';
  return `<div class="actions"><div class="notice-source"><label for="notice-query">${officialSearch()?'校方搜索':'本次读取的标题检索'}</label><input id="notice-query" type="search" maxlength="80" value="${esc(query)}" placeholder="输入关键词后点检索"></div>${officialSearch()?`<div class="notice-source"><label for="notice-search-scope">检索内容</label><select id="notice-search-scope"><option value="title" ${searchScope==='title'?'selected':''}>标题</option><option value="fulltext" ${searchScope==='fulltext'?'selected':''}>全文（标题和正文）</option></select></div>`:''}<button type="button" data-action="notice-search" ${searching?'disabled':''}>检索</button><button type="button" class="quiet" data-action="notice-search-clear">清除检索</button></div><p class="muted">${officialSearch()?'使用校方公开搜索，结果会标明当前栏目或学院网站的范围；外链在原页查看，校方索引可能尚未收录最新内容。':'这个来源没有已接入的校方搜索，仅检索当前栏目本次读取的标题，不包含正文或全部历史通知。'}</p>`;
 }
 function searchHTML(){
  const pages=Math.max(1,Math.ceil(search.total/search.page_size)),scope=search.scope==='fulltext'?'全文（标题和正文）':'标题';
  return `<p class="notice">${esc(search.range_label)} · ${scope} · 关键词「${esc(search.query)}」 · 共 ${search.total} 条 · 读取于 ${esc(new Date(search.fetched_at).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}))}${search.stale?' · 上次读取的内容':''}</p>${search.items.length?'':`<p class="empty" role="status">${search.total===0?'没有找到匹配的公告。可以换个关键词或查看原页。':'这一页没有可安全展示的结果，请翻页或查看原页。'}</p>`}${noticeList(search.items)}<div class="actions"><button type="button" class="quiet" data-action="notice-search-prev" ${search.page<=1?'disabled':''}>上一页</button><span>第 ${search.page} / ${pages} 页</span><button type="button" class="quiet" data-action="notice-search-next" ${search.page>=pages?'disabled':''}>下一页</button></div>`;
 }
 // 存档里的默认值 undergrad 分不清「选过教务部」还是「从没选过」，而教务部的通知栏目多是写给各单位和老师、停更已久的旧通知。
 // 所以：存过别的来源就用它；设置里填了学院就直接用；研究生跟随培养层次用研究生院；都没有就先请同学自己选。
 function resolve(){
  const saved=getSource(),profile=getProfile()||{},has=id=>sources.some(s=>s.id===id);
  unmatched='';
  if(saved&&saved!=='undergrad'&&has(saved))return saved;
  const college=matchCollege(sources,profile.college);
  if(college)return college;
  if(profile.level==='graduate'&&has('graduate'))return 'graduate';
  unmatched=String(profile.college||'').trim();
  return '';
 }
 function feedHTML(){
  const chosen=current();
  if(!chosen)return '';
  if(!chosen.readable)return `<p class="notice" role="status">${esc(chosen.note||'暂未接入应用内读取，请查看学院官网。')}</p>`;
  if(searching)return `<p role="status">正在检索「${esc(searchingQuery)}」…</p>`;
  if(searchError)return `<p role="status" class="notice error">${esc(searchError)}${officialSearch()?'；校方搜索未完成，可重试或查看原页。':''}</p>`;
  if(search)return searchHTML();
  if(loading)return `<p role="status">正在读取${esc(chosen.name)}的公开公告…</p>`;
  if(error)return `<p role="status" class="notice error">${esc(error)}</p>`;
  if(!feed)return '<p class="muted">正在准备所选学院的公告，也可以直接查看原页。</p>';
  const sorted=[...feed.items].sort((a,b)=>b.date.localeCompare(a.date)),stale=staleNote(sorted,now());
  return `${stale?`<p class="notice" data-tone="info">${esc(stale)}</p>`:''}<p class="notice">${esc(feed.source)} · ${feed.stale?'上次读取的内容':'读取于 '+esc(new Date(feed.fetched_at).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}))}${feed.message?' · '+esc(feed.message):''}</p>${sorted.length?'':'<p class="empty" role="status">这个栏目本次没有可显示的公告。可以查看原页确认最新通知。</p>'}${noticeList(sorted.slice(0,12))}`;
 }
 function content(){
  const chosen=current();
  const options=[['university','全校通知'],['college','学院与学部']].map(([group,label])=>`<optgroup label="${label}">${sources.filter(s=>s.group===group).map(s=>`<option value="${esc(s.id)}" ${s.id===source?'selected':''}>${esc(s.name)}${s.readable?'':' · 官网查看'}</option>`).join('')}</optgroup>`).join('');
  // 教务部（undergrad）也是存档的默认值，选了分不清是不是亲手选的，下次还会再问；提示里要如实说，不能笼统承诺「会记住」。
  const choose=`<div class="notice notice-first-choice" data-tone="info" role="status"><strong>先选你的学院</strong><p>选好后会记在本机，下次打开直接显示它的公告；在「设置 → 风景与偏好」填写学院也可以。部分学院的网站暂时只能打开官网查看；教务部、研究生院在「全校通知」里。只有教务部记不住：想每次直接看它，在设置里把学院填成「教务部」。</p>${unmatched?`<p class="muted">设置里填写的「${esc(unmatched)}」没有对上公告来源，请在下面选一下。</p>`:''}</div><div class="actions"><div class="notice-source"><label for="feed-source">学院／部门</label><select id="feed-source"><option value="" selected disabled>请选择学院或部门</option>${options}</select></div>${link(directory,'学校院系目录')}</div>`;
  return `<div class="card-head"><h2 class="icon-heading tone-warning">${pixelIcon('i-bell','heading-icon')}学校公告</h2><span class="badge" data-tone="info">按学院查看</span></div><p class="muted">按发布单位查看公开通知，不包含需要登录的校内公告。所选学院会记在本机。</p>${preferenceError?`<p role="status" class="notice error">${esc(preferenceError)}</p>`:''}
  ${catalogLoading?'<p role="status">正在准备学院列表…</p>':catalogError?`<p role="status" class="notice error">${esc(catalogError)}</p><div class="actions"><button data-action="notice-sources">重新加载学院列表</button>${link(directory,'学校院系目录')}</div>`:sources.length&&!source?choose:chosen?`<div class="actions"><div class="notice-source"><label for="feed-source">学院／部门</label><select id="feed-source">${options}</select></div>${chosen.readable?`<button data-action="notice-read" ${loading?'disabled':''}>${pixelIcon('i-bell')}刷新公告</button>`:''}${link(chosen.url,chosen.readable?'查看原页':'打开学院官网')}</div>${chosen.readable&&chosen.note?`<p class="muted">当前栏目：${esc(chosen.note)}</p>`:''}${searchControls()}<div id="campus-feed-content" aria-live="polite">${feedHTML()}</div>${chosen.readable&&!search&&!searching&&!searchError?'<small>当前栏目首页最多展示 12 条，10 分钟内复用。仅收录可核对日期的本站公告，更多通知请查看原页。</small>':''}`:'<p role="status">正在准备学院列表…</p>'}`;
 }
 const card=()=>`<section class="card campus-feed" id="notice-panel">${content()}</section>`;
 const paint=()=>{const el=document.getElementById('notice-panel');if(el)el.innerHTML=content()};
 async function load(){
  if(catalogLoading||sources.length)return;
  catalogLoading=true;catalogError='';paint();
  try{const result=await api('/api/campus/notice-sources');sources=result.sources;source=resolve();if(!sources.length)catalogError='暂时没有可用的公告来源，请查看学校院系目录。'}
  catch(e){catalogError=e.message}
  finally{catalogLoading=false;paint()}
  if(entered)return readOnEntry();
 }
 function readOnEntry(){
  if(initialRead||!current())return;
  initialRead=true;
  if(current().readable&&!feed&&!loading&&!error)return read();
 }
 // 每次进入都按设置重新推断一次（同学可能刚在设置里填了学院、或改了培养层次），亲手选过的就不再动。
 function enter(){
  entered=true;
  if(!sources.length)return catalogError?undefined:load();
  if(!picked){const next=resolve();if(next!==source){source=next;requestVersion++;feed=null;error='';loading=false;initialRead=false;resetSearch()}}
  return readOnEntry();
 }
 async function read(){
  if(!current()?.readable||loading)return;
  const selected=source,version=++requestVersion;
  resetSearch();
  feed=null;error='';loading=true;paint();
  try{const result=await api('/api/campus/notices?source='+encodeURIComponent(selected));if(version===requestVersion)feed=result}
  catch(e){if(version===requestVersion)error=e.message}
  finally{if(version===requestVersion){loading=false;paint()}}
 }
 async function runSearch(page=1,value=query,scope=searchScope){
  if(!current()?.readable)return;
  const selected=source,q=value.trim(),version=++searchVersion;
  search=null;searchError='';searching=false;
  if(!q||[...q].length>80){searchError='请输入 1–80 字关键词。';paint();return}
  searching=true;searchingQuery=q;paint();
  try{
   let result;
   if(officialSearch())result=await api('/api/campus/notices/search?source='+encodeURIComponent(selected)+'&q='+encodeURIComponent(q)+'&scope='+encodeURIComponent(scope)+'&page='+page);
   else{
    if(!feed)throw Error('请先读取这个栏目，再检索本次读取的标题。');
    const items=[...feed.items].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).filter(x=>x.title.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
    result={source:feed.source,query:q,scope:'title',range:'loaded_titles',range_label:`当前栏目本次读取的 ${feed.items.length} 条标题（不含正文和全部历史）`,page,page_size:12,total:items.length,items:items.slice((page-1)*12,page*12),fetched_at:feed.fetched_at,stale:feed.stale};
   }
   if(version===searchVersion&&selected===source)search=result;
  }catch(e){if(version===searchVersion&&selected===source)searchError=e.message||'检索失败，请查看原页。'}
  finally{if(version===searchVersion&&selected===source){searching=false;paint()}}
 }
 async function click(action,el){
  if(action==='notice-read'){await read();return true}
  if(action==='notice-sources'){await load();return true}
  if(action==='notice-search'){await runSearch();return true}
  if(action==='notice-search-clear'){resetSearch();paint();return true}
  if(action==='notice-search-prev'||action==='notice-search-next'){
   if(search){const page=search.page+(action==='notice-search-next'?1:-1);if(page>=1&&page<=Math.ceil(search.total/search.page_size))await runSearch(page,search.query,search.scope)}
   return true;
  }
  if(action==='notice-open'){
   const url=el?.dataset?.url, box=el?.parentElement?.querySelector('.notice-body');
   if(!url||!box)return true;
   if(!box.hidden){box.hidden=true;return true}
   box.hidden=false;
   if(box.dataset.loaded||box.dataset.loading)return true;
   box.dataset.loading='1';
   box.textContent='正在读取正文…';
   try{
    const d=await api('/api/campus/notice?url='+encodeURIComponent(url));
    const attach=(d.attachments||[]).map(a=>`<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.name)}</a>`).join('');
    box.innerHTML=`<div class="notice-text">${esc(d.body||'').replace(/\n/g,'<br>')}</div>${attach?`<p class="notice-files">附件：${attach}</p>`:''}`;
    box.dataset.loaded='1';
   }catch(e){box.textContent=e.message||'正文读取失败，请点原文查看。'}
   finally{delete box.dataset.loading}
   return true;
  }
  return false}
 async function change(e){
  if(e.target.id==='notice-search-scope'){
   if(officialSearch()&&['title','fulltext'].includes(e.target.value)){searchScope=e.target.value;searchVersion++;search=null;searchError='';searching=false;paint()}
   return true;
  }
  if(e.target.id!=='feed-source')return false;
  if(!sources.some(s=>s.id===e.target.value))return true;
  source=e.target.value;picked=true;unmatched='';const selectionVersion=++requestVersion;feed=null;error='';loading=false;preferenceError='';resetSearch();paint();
  if(setSource){try{await setSource(source)}catch{if(selectionVersion===requestVersion){preferenceError='这次学院选择未能保存，重新打开时可能恢复原选择。';paint()}}}
  if(selectionVersion!==requestVersion)return true;
  // Keep only the local preference write inside the caller's write lock.
  // read() owns its loading/error state and ignores responses for old choices.
  if(current().readable)void read();
  return true;
 }
 function input(e){if(e.target.id!=='notice-query')return false;query=e.target.value;return true}
 return {card,load,enter,click,change,input};
}
