// Notebook content stays separate from the garden save. No school credentials.
export const emptyNotebook=()=>({courses:[],notes:[],preferences:{selectedNoteId:'',selectedCourseId:''}});
export const escapeNote=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
export function wordCount(text){return (String(text).match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu)||[]).length}
function inline(text){
 const tokens=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|!?\[[^\]\n]+\]\([^\s)]+\))/g;let out='',last=0;
 for(const m of text.matchAll(tokens)){out+=escapeNote(text.slice(last,m.index));const raw=m[0];if(raw.startsWith('`'))out+='<code>'+escapeNote(raw.slice(1,-1))+'</code>';else if(raw.startsWith('**'))out+='<strong>'+escapeNote(raw.slice(2,-2))+'</strong>';else if(raw.startsWith('*'))out+='<em>'+escapeNote(raw.slice(1,-1))+'</em>';else{const link=/^!?\[([^\]]+)\]\(([^)]+)\)$/.exec(raw),url=safeNoteURL(link[2]);out+=url?`<a href="${escapeNote(url)}" target="_blank" rel="noopener noreferrer">${escapeNote(link[1])}${raw[0]==='!'?'（图片）':''} ↗</a>`:escapeNote(raw)}last=m.index+raw.length}return out+escapeNote(text.slice(last));
}
// Deliberately small Markdown reader: raw HTML is always text, remote images are links.
export function markdownNote(source){
 const lines=String(source).replace(/\r\n?/g,'\n').split('\n');let html='',paragraph=[],list='',code=null;
 const flush=()=>{if(paragraph.length){html+='<p>'+paragraph.map(inline).join('<br>')+'</p>';paragraph=[]}if(list){html+='</'+list+'>';list=''}};
 for(const line of lines){if(code!==null){if(/^```\s*$/.test(line)){html+='<pre><code>'+escapeNote(code.join('\n'))+'</code></pre>';code=null}else code.push(line);continue}if(/^```/.test(line)){flush();code=[];continue}if(!line.trim()){flush();continue}const h=/^(#{1,6})\s+(.+)$/.exec(line),item=/^\s*(?:[-*+]\s+|\d+\.\s+)(.*)$/.exec(line);if(h){flush();const n=Math.min(6,h[1].length+1);html+=`<h${n}>${inline(h[2])}</h${n}>`}else if(item){if(paragraph.length)flush();const kind=/^\s*\d+\./.test(line)?'ol':'ul';if(list!==kind){if(list)html+='</'+list+'>';list=kind;html+='<'+kind+'>'}const task=/^\[([ xX])\]\s*(.*)$/.exec(item[1]);html+='<li>'+ (task?`<span class="note-check" aria-label="${task[1]===' '?'未完成':'已完成'}">${task[1]===' '?'□':'☑'}</span> `+inline(task[2]):inline(item[1]))+'</li>'}else if(/^>\s?/.test(line)){flush();html+='<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>'}else if(/^\s*(---+|\*\*\*+)\s*$/.test(line)){flush();html+='<hr>'}else{if(list){html+='</'+list+'>';list=''}paragraph.push(line)}}flush();if(code!==null)html+='<pre><code>'+escapeNote(code.join('\n'))+'</code></pre>';return html||'<p class="note-placeholder">写下第一句话，内容会显示在这里。</p>';
}
export const NOTE_TEMPLATES={blank:{name:'空白笔记',body:''},lecture:{name:'课堂记录',body:'## 今天的主题\n\n\n## 重点与例子\n\n- \n\n## 还没弄懂\n\n- [ ] \n\n## 课后要做\n\n- [ ] \n'},research:{name:'阅读 / 组会',body:'## 材料与来源\n\n\n## 核心问题\n\n\n## 方法与证据\n\n\n## 我的理解\n\n\n## 下次讨论\n\n- [ ] \n'}};
export function markdownExport(note){return '# '+(note.title.trim()||'未命名笔记')+'\n\n'+(feishuDocumentURL(note.sourceUrl)?'[导入来源]('+feishuDocumentURL(note.sourceUrl)+')\n\n':'')+note.body+'\n'}
export function markdownImport(text,filename='导入笔记.md'){const clean=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),heading=/^#\s+([^\n]+)\n+/.exec(clean);return {title:heading?heading[1].trim():filename.replace(/\.(md|markdown|txt)$/i,''),body:heading?clean.slice(heading[0].length):clean}}

export function createNotebookStore(api,{onStatus=()=>{},onChange=()=>{}}={}){
 let data=emptyNotebook(),revision=0,loaded=false,dirty=false,error=null,conflict=false,sequence=0,flight=null;
 const status=()=>({loaded,dirty,error:error?.message||'',conflict,saving:!!flight,revision});
 const changed=()=>onStatus(status());
 async function load(){if(dirty)throw Error('请先保存或导出当前草稿');const result=await api('/api/notebook');data=result.data?normalizeNotebook(result.data):emptyNotebook();revision=result.revision;loaded=true;error=null;conflict=false;changed();onChange(data);return data}
 function edit(fn){if(!loaded)throw Error('笔记本尚未载入');fn(data);dirty=true;sequence++;changed()}
 function flush(){if(flight)return flight;if(!dirty)return Promise.resolve();if(conflict)return Promise.reject(error);error=null;
  flight=(async()=>{while(dirty){const at=sequence,snapshot=structuredClone(data);try{const result=await api('/api/notebook',{version:1,revision,data:snapshot},'PUT');revision=result.revision;if(sequence===at)dirty=false;error=null;onChange(data)}catch(e){error=e;conflict=e.code===409;throw e}}})().finally(()=>{flight=null;changed()});changed();return flight;
 }
 async function discardAndReload(){const at=sequence;if(flight)await flight.catch(()=>{});const result=await api('/api/notebook');if(sequence!==at)throw Error('读取期间你又修改了笔记，已保留当前草稿。请先保存或导出，再重试读取。');const incoming=result.data?normalizeNotebook(result.data):emptyNotebook();data=incoming;revision=result.revision;dirty=false;error=null;conflict=false;loaded=true;changed();onChange(data);return data}
 return {load,edit,flush,discardAndReload,status,get data(){return data},snapshot:()=>structuredClone(data)};
}
