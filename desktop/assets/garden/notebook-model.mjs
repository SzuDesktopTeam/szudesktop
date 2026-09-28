// Notebook content stays separate from the garden save. No school credentials.
import {esc} from './html.mjs';
export const emptyNotebook=()=>({courses:[],notes:[],preferences:{selectedNoteId:'',selectedCourseId:''}});
export function safeNoteURL(value){try{const u=new URL(value);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:''}catch{return ''}}
export function feishuDocumentURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||!/^[a-z0-9-]+\.(feishu\.cn|larksuite\.com|larkoffice\.com)$/i.test(u.hostname)||!/^\/(docx|wiki)\/[a-zA-Z0-9]+\/?$/.test(u.pathname)||u.username||u.password||u.port)return '';u.search='';u.hash='';return u.href}catch{return ''}}
export function normalizeNotebook(input){
 if(!input||!Array.isArray(input.courses)||!Array.isArray(input.notes)||!input.preferences||typeof input.preferences!=='object')throw Error('请选择本应用导出的笔记备份');
 const data=structuredClone(input),ids=new Set();
 for(const course of data.courses){if(!course||typeof course.id!=='string'||!course.id||ids.has(course.id)||typeof course.name!=='string'||!course.name.trim())throw Error('课程记录不完整或编号重复');ids.add(course.id);if(course.sharedUrl&&!feishuDocumentURL(course.sharedUrl))throw Error('备份中有无效的飞书文档链接')}
 const notes=new Set();
 for(const note of data.notes){if(!note||typeof note.id!=='string'||!note.id||notes.has(note.id)||typeof note.title!=='string'||typeof note.body!=='string'||typeof note.courseId!=='string'||(note.courseId&&!ids.has(note.courseId))||!Number.isFinite(note.createdAt)||!Number.isFinite(note.updatedAt)||(note.deletedAt!==undefined&&!Number.isFinite(note.deletedAt)))throw Error('笔记记录不完整、编号重复或所属课程缺失');notes.add(note.id)}
 if(!notes.has(data.preferences.selectedNoteId))data.preferences.selectedNoteId='';
 if(!ids.has(data.preferences.selectedCourseId))data.preferences.selectedCourseId='';
 return data;
}
const CJK=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LETTER_OR_NUMBER=/[\p{L}\p{N}]/u;
export function wordCount(text){let count=0,inWord=false;for(const char of String(text)){if(CJK.test(char)){count++;inWord=false}else if(LETTER_OR_NUMBER.test(char)){if(!inWord)count++;inWord=true}else inWord=false}return count}
export function latestNotebookNote(data){return data.notes.filter(note=>!note.deletedAt).reduce((latest,note)=>!latest||note.updatedAt>latest.updatedAt?note:latest,null)}
// Preserve the original character offsets so outline jumps work with CRLF imports too.
export function noteHeadings(source){
 const headings=[];let inCode=false;
 for(const match of String(source).matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)){
  if(!match[0])break;const line=match[0].replace(/[\r\n]+$/,'');
  if(inCode){if(/^```\s*$/.test(line))inCode=false;continue}
  if(/^```/.test(line)){inCode=true;continue}
  const heading=/^(#{1,6})\s+(.+)$/.exec(line);if(!heading)continue;
  headings.push({id:'note-section-'+(headings.length+1),level:heading[1].length,text:heading[2].replace(/[`*_]/g,''),start:match.index,end:match.index+line.length});
 }
 return headings;
}
function inline(text){
 const tokens=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|!?\[[^\]\n]+\]\([^\s)]+\))/g;let out='',last=0;
 for(const m of text.matchAll(tokens)){out+=esc(text.slice(last,m.index));const raw=m[0];if(raw.startsWith('`'))out+='<code>'+esc(raw.slice(1,-1))+'</code>';else if(raw.startsWith('**'))out+='<strong>'+esc(raw.slice(2,-2))+'</strong>';else if(raw.startsWith('*'))out+='<em>'+esc(raw.slice(1,-1))+'</em>';else{const link=/^!?\[([^\]]+)\]\(([^)]+)\)$/.exec(raw),url=safeNoteURL(link[2]);out+=url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(link[1])}${raw[0]==='!'?'（图片）':''} ↗</a>`:esc(raw)}last=m.index+raw.length}return out+esc(text.slice(last));
}
// Deliberately small Markdown reader: raw HTML is always text, remote images are links.
export function markdownNote(source){
 const lines=String(source).replace(/\r\n?/g,'\n').split('\n');let html='',paragraph=[],list='',code=null,headingIndex=0;
 const flush=()=>{if(paragraph.length){html+='<p>'+paragraph.map(inline).join('<br>')+'</p>';paragraph=[]}if(list){html+='</'+list+'>';list=''}};
 for(const line of lines){if(code!==null){if(/^```\s*$/.test(line)){html+='<pre><code>'+esc(code.join('\n'))+'</code></pre>';code=null}else code.push(line);continue}if(/^```/.test(line)){flush();code=[];continue}if(!line.trim()){flush();continue}const h=/^(#{1,6})\s+(.+)$/.exec(line),item=/^\s*(?:[-*+]\s+|\d+\.\s+)(.*)$/.exec(line);if(h){flush();const n=Math.min(6,h[1].length+1);html+=`<h${n} id="note-section-${++headingIndex}" tabindex="-1">${inline(h[2])}</h${n}>`}else if(item){if(paragraph.length)flush();const kind=/^\s*\d+\./.test(line)?'ol':'ul';if(list!==kind){if(list)html+='</'+list+'>';list=kind;html+='<'+kind+'>'}const task=/^\[([ xX])\]\s*(.*)$/.exec(item[1]);html+='<li>'+ (task?`<span class="note-check" aria-label="${task[1]===' '?'未完成':'已完成'}">${task[1]===' '?'□':'☑'}</span> `+inline(task[2]):inline(item[1]))+'</li>'}else if(/^>\s?/.test(line)){flush();html+='<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>'}else if(/^\s*(---+|\*\*\*+)\s*$/.test(line)){flush();html+='<hr>'}else{if(list){html+='</'+list+'>';list=''}paragraph.push(line)}}flush();if(code!==null)html+='<pre><code>'+esc(code.join('\n'))+'</code></pre>';return html||'<p class="note-placeholder">写下第一句话，内容会显示在这里。</p>';
}
export const NOTE_TEMPLATES={blank:{name:'空白笔记',body:''},lecture:{name:'课堂记录',body:'## 今天的主题\n\n\n## 重点与例子\n\n- \n\n## 还没弄懂\n\n- [ ] \n\n## 课后要做\n\n- [ ] \n'},research:{name:'阅读 / 组会',body:'## 材料与来源\n\n\n## 核心问题\n\n\n## 方法与证据\n\n\n## 我的理解\n\n\n## 下次讨论\n\n- [ ] \n'}};
export function markdownExport(note){return '# '+(note.title.trim()||'未命名笔记')+'\n\n'+(feishuDocumentURL(note.sourceUrl)?'[导入来源]('+feishuDocumentURL(note.sourceUrl)+')\n\n':'')+note.body+'\n'}
export function markdownImport(text,filename='导入笔记.md'){const clean=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),heading=/^#\s+([^\n]+)\n+/.exec(clean);return {title:heading?heading[1].trim():filename.replace(/\.(md|markdown|txt)$/i,''),body:heading?clean.slice(heading[0].length):clean}}

// The sidecar refuses notebooks over 8 MiB (internal/ui/notebook.go). Sizes are
// counted the way Go stores them: UTF-8 bytes, except that json.Marshal writes
// < > & U+2028 U+2029 as six-byte \u escapes, plus room for the version wrapper.
export const NOTEBOOK_MAX_BYTES=8*1024*1024;
export const NOTEBOOK_WARN_BYTES=Math.floor(NOTEBOOK_MAX_BYTES*0.8);
// One pass without copies: every UTF-16 unit counts one byte, plus the extra
// bytes its UTF-8 form or Go escape needs. JSON.stringify output has no lone
// surrogates, so the high half of a pair carries the pair's extra bytes.
export function notebookTextBytes(text){let n=64+text.length;for(let i=0,end=text.length;i<end;i++){const c=text.charCodeAt(i);if(c>127)n+=c<2048?1:c>=0xdc00&&c<0xe000?0:c===0x2028||c===0x2029?5:2;else if(c===60||c===62||c===38)n+=5}return n}
// Each UTF-16 unit is at most six stored bytes, so a notebook this short cannot
// reach the warning line and is not counted byte by byte: the bound stands in.
const storedBytes=text=>text.length*6+64<NOTEBOOK_WARN_BYTES?text.length*6+64:notebookTextBytes(text);
export const notebookBytes=data=>notebookTextBytes(JSON.stringify(data));
export const formatMiB=bytes=>(Math.ceil(bytes/104857.6)/10).toFixed(1);
export function tooLargeError(bytes){const e=Error(`笔记本约 ${formatMiB(bytes)} MiB，超过 8 MiB 上限，这次修改还没保存`);e.code=413;return e}

export function createNotebookStore(api,{onStatus=()=>{},onChange=()=>{}}={}){
 let data=emptyNotebook(),revision=0,loaded=false,dirty=false,error=null,conflict=false,sequence=0,flight=null,savedText='',bytes=0;
 const status=()=>({loaded,dirty,error:error?.message||'',conflict,recovered:conflict&&!!error?.recovered,tooLarge:error?.code===413,saving:!!flight,revision,bytes});
 const changed=()=>onStatus(status());
 // The last text known to match the file: an edit that ends where it began is not rewritten.
 const settled=()=>{savedText=JSON.stringify(data);bytes=storedBytes(savedText)};
 async function load(){if(dirty)throw Error('请先保存或导出当前草稿');const result=await api('/api/notebook');data=result.data?normalizeNotebook(result.data):emptyNotebook();revision=result.revision;loaded=true;error=null;conflict=false;settled();changed();onChange(data);return data}
 function edit(fn){if(!loaded)throw Error('笔记本尚未载入');fn(data);dirty=true;sequence++;changed()}
 // Which course or page is open is a view preference, not an edit: it rides along
 // with the next content save instead of rewriting the whole notebook by itself.
 function prefer(fn){if(!loaded)throw Error('笔记本尚未载入');fn(data)}
 function flush(){if(flight)return flight;if(!dirty)return Promise.resolve();if(conflict)return Promise.reject(error);error=null;
  // 比较改动和估算体积时已经序列化过一次，这份文本直接拼成请求体交给 api() 原样发送，每次保存只序列化一遍。
  // 写进文件的正是 text；保存途中又有修改时由下一轮接着写，改回原样的则不再重写。
  flight=(async()=>{while(dirty){const at=sequence,text=JSON.stringify(data);if(text===savedText){dirty=false;break}bytes=storedBytes(text);try{if(bytes>NOTEBOOK_MAX_BYTES)throw tooLargeError(bytes);const result=await api('/api/notebook',`{"version":1,"revision":${JSON.stringify(revision)},"data":${text}}`,'PUT');revision=result.revision;savedText=text;if(sequence===at)dirty=false;error=null;onChange(data)}catch(e){error=e;conflict=e.code===409;throw e}}})().finally(()=>{flight=null;changed()});changed();return flight;
 }
 async function discardAndReload(){const at=sequence;if(flight)await flight.catch(()=>{});const result=await api('/api/notebook');if(sequence!==at)throw Error('读取期间你又修改了笔记，已保留当前草稿。请先保存或导出，再重试读取。');const incoming=result.data?normalizeNotebook(result.data):emptyNotebook();data=incoming;revision=result.revision;dirty=false;error=null;conflict=false;loaded=true;settled();changed();onChange(data);return data}
 return {load,edit,prefer,flush,discardAndReload,status,get data(){return data},snapshot:()=>structuredClone(data)};
}
