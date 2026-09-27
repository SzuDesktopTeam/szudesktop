// 从 notebook.mjs 抽出的笔记本界面小块：只依赖传入的状态和节点，不在模块顶层碰 DOM。
// notebook.mjs 照常导入使用；check-notebook.mjs 直接 import 这些函数做行为测试，不再按字符串标记切源码。
import {noteHeadings,formatMiB,NOTEBOOK_WARN_BYTES} from './notebook-model.mjs';
import {esc} from './html.mjs';

export const noteButton=(label,action,attrs='',cls='')=>`<button type="button" data-note-action="${action}" ${attrs} class="${cls}">${label}</button>`;
const button=noteButton;

export function notebookSearchSummaryHTML(count,query){return `<span>${query.trim()?`找到 ${count} 页`:`共 ${count} 页`}</span>${query.trim()?button('清除搜索','clear-search'): ''}`}
// visible 只在有搜索词且有打开的页时才调用：不搜索时不必为提示过滤整本笔记。
export function notebookSearchContextHTML(query,note,visible){return query.trim()&&note&&!visible().some(n=>n.id===note.id)?`<p class="note-search-context"><span>当前打开的这页不在搜索结果中，正文仍保留。</span>${button('回到当前页','clear-search')}</p>`:''}

// 保存状态 s 来自 createNotebookStore().status()；notes 是整本笔记，trash 表示当前是否在回收站里。
export function notebookStatusHTML(s,{notes,trash}){const trashed=notes.filter(n=>n.deletedAt).length,near=!s.error&&s.bytes>=NOTEBOOK_WARN_BYTES;const text=s.conflict?(s.recovered?'笔记文件损坏，已恢复到上一次成功保存的版本。':'另一个窗口保存了新内容。')+'当前草稿仍在本页，请先导出，再读取最新版本。':s.tooLarge?s.error+'。可以永久删除回收站里的旧页、删掉部分正文，或导出草稿后放弃这次修改。':s.error?'尚未保存：'+s.error:s.saving?'正在保存到本机…':s.dirty?'有待保存的修改…':s.loaded?(near?`已保存到本机 · 已用 ${formatMiB(s.bytes)} / 8 MiB，接近上限。可以清空回收站，或导出备份后删掉旧笔记。`:'已保存到本机'):'正在打开笔记本…';
 // Over or near the limit, offer the ways out right here: trash, export and discard.
 const cleanup=(trashed&&!trash?button(`查看回收站（${trashed}）`,'trash'):'')+(trashed?button('清空回收站','empty-trash','','danger'):'');
 return `<span class="note-save-indicator ${s.error?'has-error':near?'is-near-limit':''}" role="status">${esc(text)}</span>${s.error?`<div class="note-save-recovery">${button('导出当前草稿备份','backup')}${s.conflict?button('读取最新版本','reload'):s.tooLarge?cleanup+button('放弃这次修改','reload'):button('重试保存','save')}</div>`:near?`<div class="note-save-recovery">${cleanup||button('导出整本备份','backup')}</div>`:''}`}

// 大纲跳转：书写模式在文本框里选中章节标题并滚到它附近（文本框的 value 与选区按 LF 计），阅读模式滚到对应锚点。
// find 按选择器在笔记本里找节点，host 用来临时挂测量用的 div。
export function jumpToNoteHeading(index,{note,area,find,host,document:doc=globalThis.document,getComputedStyle:computed=el=>globalThis.getComputedStyle(el)}){const writing=area&&!area.hidden,text=writing?area.value:note?.body,heading=note&&noteHeadings(text)[index];if(!heading)return;if(!writing){const target=find('#'+heading.id);target?.scrollIntoView({block:'start',behavior:'instant'});target?.focus({preventScroll:true});return}area.focus({preventScroll:true});area.setSelectionRange(heading.start,heading.end);const style=computed(area),measure=doc.createElement('div');Object.assign(measure.style,{position:'fixed',visibility:'hidden',pointerEvents:'none',whiteSpace:'pre-wrap',overflowWrap:'break-word',boxSizing:'border-box',width:area.clientWidth+'px',fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,paddingLeft:style.paddingLeft,paddingRight:style.paddingRight});measure.textContent=text.slice(0,heading.start)+'\u200b';host.appendChild(measure);area.scrollTop=Math.max(0,measure.getBoundingClientRect().height-area.clientHeight/3);measure.remove();area.scrollIntoView({block:'nearest',behavior:'instant'})}

// 笔记操作锁：同一时间只处理一项会改笔记本的操作，后来的操作提示稍候。
// 导出备份不占锁也不等锁：其他操作卡住时，用户仍能把草稿带走，且不会提前解除别人的锁。
// run 执行具体操作；settled 在每次持锁操作结束后调用（用来刷新保存状态）。
export function createNoteOperations({run,toast,settled}){
 let operation=false;
 async function exclusive(work){operation=true;try{return await work()}finally{operation=false;settled()}}
 async function perform(action,attrs={}){if(['backup','export'].includes(action)){try{await run(action,attrs)}catch(e){toast(e.message||'导出没有完成')}return}if(operation){toast('上一项笔记操作还在处理中，请稍候');return}await exclusive(async()=>{try{await run(action,attrs)}catch(e){toast(e.message||'这次操作未完成')}})}
 return {perform,exclusive,get busy(){return operation}};
}
