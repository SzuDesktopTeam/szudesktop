import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {emptyNotebook,normalizeNotebook,markdownNote,noteHeadings,latestNotebookNote,feishuDocumentURL,wordCount,markdownExport,markdownImport,createNotebookStore,notebookBytes,notebookTextBytes,formatMiB,NOTEBOOK_MAX_BYTES,NOTEBOOK_WARN_BYTES} from './assets/garden/notebook-model.mjs';
import {notebookStatusHTML,notebookSearchSummaryHTML,notebookSearchContextHTML,jumpToNoteHeading,createNoteOperations} from './assets/garden/notebook-view.mjs';

const notebookSource=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8');
// 把真实按钮 HTML 缩写成 [动作:文字]，断言只关心给了哪些出口。
const buttonMarks=html=>html.replace(/<button type="button" data-note-action="([^"]+)"[^>]*>([^<]*)<\/button>/g,'[$1:$2]');
let checks=0;
async function test(name,fn){await fn();checks++;process.stdout.write('PASS '+name+'\n')}
// 保存请求体是已经序列化好的 JSON 文本；测试替身按对象检查它。
const payload=body=>typeof body==='string'?JSON.parse(body):body;
const fixture=()=>({courses:[{id:'course-1',name:'机器学习'}],notes:[{id:'note-1',courseId:'course-1',title:'支持向量机',body:'先理解间隔',createdAt:100,updatedAt:100}],preferences:{selectedCourseId:'course-1',selectedNoteId:'note-1'}});
await test('备份保留正文、回收站与来源，坏引用不会悄悄丢失',()=>{const data=fixture();data.notes[0].deletedAt=200;data.notes[0].sourceUrl='https://team.feishu.cn/docx/abc';assert.deepEqual(normalizeNotebook(data),data);const broken=fixture();broken.notes[0].courseId='missing';assert.throws(()=>normalizeNotebook(broken));const duplicate=fixture();duplicate.notes.push({...duplicate.notes[0]});assert.throws(()=>normalizeNotebook(duplicate))});
await test('Markdown 原始 HTML、危险链接和远程图片都不能执行或暗中加载',()=>{const html=markdownNote('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[点我](javascript:alert) ![图](https://remote.test/private.png)\n\n`<svg onload=1>`');assert.doesNotMatch(html,/<script|<img|<svg|href="javascript:/i);assert.match(html,/&lt;script&gt;/);assert.match(html,/图片/);assert.match(html,/https:\/\/remote.test\/private.png/)});
await test('课堂需要的标题、清单、代码与强调可阅读',()=>{const html=markdownNote('## 重点\n\n- [ ] 看例题\n- [x] **弄懂**\n\n```js\nconst x = "<a>";\n```\n\n> 一个问题');assert.match(html,/<h3 id="note-section-1" tabindex="-1">重点/);assert.match(html,/未完成/);assert.match(html,/已完成/);assert.match(html,/<strong>弄懂/);assert.match(html,/&lt;a&gt;/);assert.match(html,/<blockquote>/)});
await test('飞书文档只接受明确官方文档地址',()=>{assert.equal(feishuDocumentURL('https://team.feishu.cn/docx/Abc?from=copy#xx'),'https://team.feishu.cn/docx/Abc');assert.equal(feishuDocumentURL('https://team.larksuite.com/wiki/Abc'),'https://team.larksuite.com/wiki/Abc');assert.equal(feishuDocumentURL('https://team.larkoffice.com/docx/Abc'),'https://team.larkoffice.com/docx/Abc');for(const value of ['https://feishu.cn.evil.test/docx/a','http://team.feishu.cn/docx/a','https://user:pw@team.feishu.cn/docx/a','https://team.feishu.cn:8443/docx/a','https://team.feishu.cn/drive/folder/a'])assert.equal(feishuDocumentURL(value),'')});
await test('Markdown 导出导入保留标题正文与中文计数',()=>{const note=fixture().notes[0];assert.deepEqual(markdownImport(markdownExport(note)),{title:note.title,body:note.body+'\n'});assert.deepEqual(markdownImport('正文','第一课.md'),{title:'第一课',body:'正文'});assert.equal(wordCount('今天学习 machine learning 2'),7)});
await test('首次空本机存档可以打开，无虚构示例内容',async()=>{const store=createNotebookStore(async()=>({version:1,revision:0,data:null}));await store.load();assert.deepEqual(store.data,emptyNotebook());assert.equal(store.status().dirty,false)});
await test('保存进行中继续输入会顺序落盘，最后一笔不会被旧响应覆盖',async()=>{const writes=[],pending=[];let rev=1;const api=async(path,body)=>{if(!body)return {revision:rev,data:fixture()};writes.push(payload(body));await new Promise(resolve=>pending.push(resolve));return {revision:++rev}};const store=createNotebookStore(api);await store.load();store.edit(d=>{d.notes[0].body='第一笔'});const saved=store.flush();await Promise.resolve();store.edit(d=>{d.notes[0].body='第二笔中文'});assert.equal(store.flush(),saved);pending.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(writes.length,2);assert.equal(writes[1].revision,2);assert.equal(writes[1].data.notes[0].body,'第二笔中文');pending.shift()();await saved;assert.equal(store.status().dirty,false);assert.equal(store.data.notes[0].body,'第二笔中文')});
await test('冲突保留本机草稿，禁止自动重试覆盖其他窗口',async()=>{let writes=0;const store=createNotebookStore(async(path,body)=>{if(!body)return {revision:1,data:fixture()};writes++;const e=Error('另一个窗口已保存');e.code=409;throw e});await store.load();store.edit(d=>{d.notes[0].body='宝贵的草稿'});await assert.rejects(store.flush());assert.equal(store.status().conflict,true);assert.equal(store.status().dirty,true);assert.equal(store.snapshot().notes[0].body,'宝贵的草稿');await assert.rejects(store.flush());assert.equal(writes,1)});
await test('普通保存失败可以重试，失败时不会假报已保存',async()=>{let fail=true;const store=createNotebookStore(async(path,body)=>{if(!body)return {revision:1,data:fixture()};if(fail)throw Error('磁盘暂不可写');return {revision:2}});await store.load();store.edit(d=>{d.notes[0].title='新标题'});await assert.rejects(store.flush());assert.equal(store.status().dirty,true);assert.match(store.status().error,/磁盘/);fail=false;await store.flush();assert.equal(store.status().dirty,false);assert.equal(store.status().error,'')});
await test('选择读取最新版本但网络失败时，草稿依然可以导出',async()=>{let first=true;const store=createNotebookStore(async()=>{if(first){first=false;return {revision:1,data:fixture()}}throw Error('网络失败')});await store.load();store.edit(d=>{d.notes[0].body='仍在'});await assert.rejects(store.discardAndReload());assert.equal(store.status().dirty,true);assert.equal(store.snapshot().notes[0].body,'仍在')});
await test('读取最新版本等待期间继续写的内容不会被迟到的 GET 覆盖',async()=>{let reads=0,release;const store=createNotebookStore(async()=>{if(++reads===1)return {revision:1,data:fixture()};return new Promise(resolve=>{release=()=>{const latest=fixture();latest.notes[0].body='另一窗口的内容';resolve({revision:2,data:latest})}})});await store.load();store.edit(d=>{d.notes[0].body='准备放弃的旧草稿'});const reading=store.discardAndReload();store.edit(d=>{d.notes[0].body='确认读取后新写的一句'});release();await assert.rejects(reading,/读取期间你又修改/);assert.equal(store.status().dirty,true);assert.equal(store.status().revision,1);assert.equal(store.snapshot().notes[0].body,'确认读取后新写的一句')});
await test('确认读取后没有继续编辑时，正常采用最新版本并清除旧草稿状态',async()=>{let reads=0,release;const store=createNotebookStore(async()=>{if(++reads===1)return {revision:1,data:fixture()};return new Promise(resolve=>{release=()=>{const latest=fixture();latest.notes[0].body='明确采用的最新内容';resolve({revision:4,data:latest})}})});await store.load();store.edit(d=>{d.notes[0].body='准备放弃的旧草稿'});const reading=store.discardAndReload();release();await reading;assert.equal(store.status().dirty,false);assert.equal(store.status().revision,4);assert.equal(store.status().error,'');assert.equal(store.snapshot().notes[0].body,'明确采用的最新内容')});
await test('导出草稿不提前解除正在等待的操作锁，原操作完成后正常解锁',async()=>{
 assert.match(notebookSource,/const operations=createNoteOperations\(\{run:actionRun,toast,settled:paintStatus\}\);\n function perform\(action,attrs=\{\}\)\{return operations\.perform\(action,attrs\)\}/,'笔记操作必须经 createNoteOperations 的锁');
 for(const exportAction of ['backup','export']){
  let release,settled=0;const gate=new Promise(resolve=>{release=resolve}),calls=[],messages=[];
  const ops=createNoteOperations({settled:()=>settled++,toast:message=>messages.push(message),run:async action=>{calls.push(action);if(action==='feishu-import')await gate}});
  const pending=ops.perform('feishu-import');assert.equal(ops.busy,true);
  await ops.perform(exportAction);assert.equal(ops.busy,true);await ops.perform('course');assert.deepEqual(calls,['feishu-import',exportAction]);assert.match(messages[0],/还在处理中/);
  release();await pending;assert.equal(ops.busy,false);assert.equal(settled,1,'持锁操作结束后刷新保存状态');await ops.perform('course');assert.deepEqual(calls,['feishu-import',exportAction,'course']);assert.equal(ops.busy,false);
 }
 const failed=[],ops=createNoteOperations({settled(){},toast:message=>failed.push(message),run:async action=>{throw Error(action==='backup'?'':'磁盘暂不可写')}});
 await ops.perform('course');await ops.perform('backup');assert.deepEqual(failed,['磁盘暂不可写','导出没有完成']);assert.equal(ops.busy,false,'失败也要解锁');
});
await test('长文大纲跳过代码块，重复标题有独立锚点，CRLF 定位不偏移',()=>{
 const body='## 重复标题\r\n正文\r\n```md\r\n# 代码内不是章节\r\n```\r\n### 重复标题\r\n末尾';
 const headings=noteHeadings(body);assert.equal(headings.length,2);assert.deepEqual(headings.map(h=>h.id),['note-section-1','note-section-2']);
 assert.equal(body.slice(headings[1].start,headings[1].end),'### 重复标题');
 const html=markdownNote(body);for(const h of headings)assert.ok(html.includes(`id="${h.id}"`));assert.equal((html.match(/id="note-section-/g)||[]).length,2);
});
await test('大纲按文本框的 LF 内容选中章节，原 CRLF 正文和阅读锚点保持不变',()=>{
 assert.match(notebookSource,/function jumpToHeading\(index\)\{jumpToNoteHeading\(index,\{note:activeNote\(\),area:q\('#note-body'\),find:q,host\}\)\}/);
 const body='## 第一节\r\n第一段\r\n第二段\r\n\r\n### 要跳转的章节\r\n结尾',note={body},events=[];
 // Native textarea.value and its selection offsets use LF, including after a CRLF JSON restore.
 const area={value:body.replace(/\r\n/g,'\n'),hidden:false,clientWidth:500,clientHeight:200,focus(){events.push('editor-focus')},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end},scrollIntoView(){events.push('editor-scroll')}};
 const measure={style:{},getBoundingClientRect:()=>({height:300}),remove(){}},anchor={scrollIntoView(){events.push('anchor-scroll')},focus(){events.push('anchor-focus')}};
 const find=selector=>selector==='#note-section-2'?anchor:null;
 const context={jumpToHeading:index=>jumpToNoteHeading(index,{note,area,find,host:{appendChild(){}},document:{createElement:()=>measure},getComputedStyle:()=>({})})};
 context.jumpToHeading(1);
 assert.equal(area.value.slice(area.selectionStart,area.selectionEnd),'### 要跳转的章节');assert.equal(measure.textContent,area.value.slice(0,area.selectionStart)+'\u200b');assert.equal(note.body,body);
 assert.deepEqual(events,['editor-focus','editor-scroll']);area.hidden=true;context.jumpToHeading(1);assert.deepEqual(events,['editor-focus','editor-scroll','anchor-scroll','anchor-focus']);
});
await test('最近笔记忽略回收站，不受上次选择的旧页影响',()=>{
 const data=fixture();data.notes.push({...data.notes[0],id:'recent',updatedAt:200},{...data.notes[0],id:'deleted',updatedAt:300,deletedAt:300});
 assert.equal(latestNotebookNote(data).id,'recent');assert.equal(latestNotebookNote(emptyNotebook()),null);
});
await test('首页继续笔记等待保存，再准确选择最近页并清除旧搜索和回收站状态',async()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8'),from=source.indexOf('async function resumeLatest('),to=source.indexOf('\n return {view',from);assert.ok(from>=0&&to>from);
 const data=fixture();data.courses.push({id:'course-2',name:'另一门课'});data.notes.push({...data.notes[0],id:'recent',courseId:'course-2',updatedAt:200});
 let release,saves=0;const gate=new Promise(resolve=>{release=resolve});
 const messages=[],operations=createNoteOperations({run:async()=>{},toast:message=>messages.push(message),settled(){}});
 const context=vm.createContext({operations,trash:true,query:'旧关键词',mode:'read',store:{status:()=>({loaded:true})},data:()=>data,latestNotebookNote,flush:async()=>{if(++saves===1)await gate},edit(){assert.fail('选中最近一页只是界面偏好，不应把整本笔记标成待保存')},prefer:fn=>fn(data),paint(){},paintStatus(){}});
 vm.runInContext(source.slice(from,to),context);const pending=context.resumeLatest();assert.equal(data.preferences.selectedNoteId,'note-1');
 assert.equal(operations.busy,true);await operations.perform('course');assert.match(messages[0],/还在处理中/,'继续笔记与其他笔记操作共用同一把锁');await assert.rejects(context.resumeLatest(),/还在处理中/);
 release();await pending;assert.equal(data.preferences.selectedNoteId,'recent');assert.equal(data.preferences.selectedCourseId,'course-2');assert.equal(context.trash,false);assert.equal(context.query,'');assert.equal(context.mode,'write');assert.equal(operations.busy,false);assert.equal(saves,1,'only the pending draft is saved; the selection itself is not a whole-notebook write');
 context.flush=async()=>{throw Error('保留未保存草稿')};data.preferences.selectedNoteId='note-1';await assert.rejects(context.resumeLatest(),/未保存草稿/);assert.equal(data.preferences.selectedNoteId,'note-1');assert.equal(operations.busy,false);
});
await test('迁移课程先保存正文；保存失败不改归属，迁移后正文和来源完整保留',async()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8'),from=source.indexOf('async function actionRun('),to=source.indexOf('function paintFeishu(',from);assert.ok(from>=0&&to>from);
 const data=fixture();data.courses.push({id:'course-2',name:'新课程'});data.notes[0].sourceUrl='https://team.feishu.cn/docx/abc';const note=data.notes[0],body=note.body,sourceUrl=note.sourceUrl,messages=[];
 const context=vm.createContext({activeNote:()=>note,data:()=>data,course:()=>data.courses.find(c=>c.id===data.preferences.selectedCourseId),Date,edit:fn=>fn(data),paint(){},query:'旧词',toast:text=>messages.push(text),flush:async()=>{throw Error('保存失败')}});
 vm.runInContext(source.slice(from,to),context);await assert.rejects(context.actionRun('move-course',{courseId:'course-2'}),/保存失败/);assert.equal(note.courseId,'course-1');
 context.flush=async()=>{};await context.actionRun('move-course',{courseId:'course-2'});assert.equal(note.courseId,'course-2');assert.equal(data.preferences.selectedCourseId,'course-2');assert.equal(data.preferences.selectedNoteId,note.id);assert.equal(note.body,body);assert.equal(note.sourceUrl,sourceUrl);assert.equal(context.query,'');assert.equal(messages.length,1);
 await context.actionRun('move-course',{courseId:''});assert.equal(note.courseId,'');assert.equal(note.body,body);
});
await test('设置页备份先等笔记载入，随后直接导出现有草稿而不强制覆盖保存',async()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8'),from=source.indexOf('async function backup('),to=source.indexOf('async function resumeLatest(',from);assert.ok(from>=0&&to>from);
 let loaded=false,release,reads=0;const gate=new Promise(resolve=>{release=resolve}),exports=[],draft={body:'尚未落盘的想法'};
 const context=vm.createContext({store:{status:()=>({loaded,dirty:true})},load:async()=>{reads++;await gate;loaded=true;return fixture()},exportBackup:()=>exports.push({...draft}),flush(){assert.fail('备份不能被保存失败或冲突阻止')},loadError:''});
 vm.runInContext(source.slice(from,to),context);const pending=context.backup();assert.equal(exports.length,0);release();await pending;assert.equal(reads,1);assert.equal(exports[0].body,'尚未落盘的想法');
 draft.body='冲突后仍需带走的新草稿';await context.backup();assert.equal(reads,1);assert.equal(exports[1].body,'冲突后仍需带走的新草稿');
 loaded=false;context.load=async()=>null;context.loadError='本机笔记读取失败';await assert.rejects(context.backup(),/本机笔记读取失败/);assert.equal(exports.length,2);
});
await test('切换笔记保持课程和笔记滚动位置，换课程时只复位笔记列表',()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8'),from=source.indexOf('function paint({'),to=source.indexOf('function paintStatus(',from);assert.ok(from>=0&&to>from);
 let context;
 const makeHost=(courseTop,noteTop,noteLeft)=>({isConnected:true,nodes:{'.note-course-list':{scrollTop:courseTop,scrollLeft:21},'.note-list':{scrollTop:noteTop,scrollLeft:noteLeft}},replaceWith(){}});
 const old=makeHost(180,390,560),next=makeHost(0,0,0);
 context=vm.createContext({host:old,q:selector=>context.host.nodes[selector],document:{createElement:()=>({firstElementChild:next})},view:()=>'',bind(){},paintStatus(){}});
 vm.runInContext(source.slice(from,to),context);context.paint();assert.equal(context.host,next);assert.equal(next.nodes['.note-course-list'].scrollTop,180);assert.equal(next.nodes['.note-list'].scrollTop,390);assert.equal(next.nodes['.note-list'].scrollLeft,560);
 context.host=makeHost(240,410,720);const replacement=makeHost(0,0,0);context.document.createElement=()=>({firstElementChild:replacement});context.paint({resetList:true});assert.equal(replacement.nodes['.note-course-list'].scrollTop,240);assert.equal(replacement.nodes['.note-course-list'].scrollLeft,21);assert.equal(replacement.nodes['.note-list'].scrollTop,0);assert.equal(replacement.nodes['.note-list'].scrollLeft,0);
});
await test('正文输入更新侧栏时保持两个方向滚动，不重建正在输入的编辑器',()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8'),from=source.indexOf('function paintList('),to=source.indexOf('function summaryHTML(',from);assert.ok(from>=0&&to>from);
 const nodes={'.note-list':{scrollTop:220,scrollLeft:480},'[data-note-search-summary]':{},'[data-note-search-context]':{}},draft={body:'正在输入的正文'};
 const fresh=()=>({scrollTop:0,scrollLeft:0,replaceWith(next){nodes['.note-list']=next}});nodes['.note-list'].replaceWith=function(next){nodes['.note-list']=next};
 const context=vm.createContext({q:selector=>nodes[selector],document:{createElement:()=>({querySelector:fresh})},noteList:()=>'',searchSummaryHTML:()=> '找到 1 页',searchContextHTML:()=> '当前页不匹配',activeNote:()=>draft,editor(){assert.fail('不应重建正在输入的正文')}});
 vm.runInContext(source.slice(from,to),context);context.paintList();assert.equal(nodes['.note-list'].scrollTop,220);assert.equal(nodes['.note-list'].scrollLeft,480);assert.equal(nodes['[data-note-search-summary]'].innerHTML,'找到 1 页');assert.equal(draft.body,'正在输入的正文');
 context.paintList({reset:true});assert.equal(nodes['.note-list'].scrollTop,0);assert.equal(nodes['.note-list'].scrollLeft,0);
});
await test('搜索无匹配明确告知当前页状态，清除搜索不会保存或切换现有草稿',async()=>{
 const source=notebookSource;
 assert.ok(source.includes(' function searchSummaryHTML(notes=filtered()){return notebookSearchSummaryHTML(notes.length,query)}')&&source.includes(' function searchContextHTML(){return notebookSearchContextHTML(query,activeNote(),filtered)}'),'搜索提示必须用 notebook-view.mjs 的函数');
 assert.equal(notebookSearchSummaryHTML(3,'  '),'<span>共 3 页</span>','没有搜索词时只报总页数，不给清除按钮');
 let filters=0;assert.equal(notebookSearchContextHTML('',{id:'x'},()=>{filters++;return []}),'');assert.equal(filters,0,'不搜索时不必为提示过滤整本笔记');
 assert.equal(notebookSearchContextHTML('词',{id:'x'},()=>[{id:'x'}]),'','当前页在结果里时不提示');
 const draft={id:'current',body:'尚未保存的长文'},search={value:'查不到',focus(){}},events=[];
 const context=vm.createContext({query:'查不到',filtered:()=>[],activeNote:()=>draft,q:selector=>selector==='#note-search'?search:selector==='.note-list-item.selected'?{scrollIntoView:()=>events.push('reveal')}:null,paintList:options=>events.push(options.reset),flush(){assert.fail('清除搜索不需要保存草稿')}});
 // 与 notebook.mjs 相同的接线：提示按当前的 query、打开的页和过滤结果即时算出。
 Object.assign(context,{searchSummaryHTML:(notes=context.filtered())=>notebookSearchSummaryHTML(notes.length,context.query),searchContextHTML:()=>notebookSearchContextHTML(context.query,context.activeNote(),context.filtered)});
 assert.match(context.searchSummaryHTML(),/找到 0 页/);assert.match(context.searchSummaryHTML(),/清除搜索/);assert.match(context.searchContextHTML(),/这页不在搜索结果中/);
 const actionFrom=source.indexOf('async function actionRun('),actionTo=source.indexOf('function paintFeishu(',actionFrom);vm.runInContext(source.slice(actionFrom,actionTo),context);await context.actionRun('clear-search');assert.equal(context.query,'');assert.equal(search.value,'');assert.equal(context.searchContextHTML(),'');assert.equal(draft.body,'尚未保存的长文');assert.deepEqual(events,[true,'reveal']);
 const inputFrom=source.indexOf('function input('),inputTo=source.indexOf('function keydown(',inputFrom);vm.runInContext(source.slice(inputFrom,inputTo),context);context.input({target:{id:'note-search',value:'另一个词'}});assert.equal(context.query,'另一个词');assert.equal(draft.body,'尚未保存的长文');assert.equal(events.at(-1),true);
});
await test('只切换选中的课程或笔记不整本写盘，改回原样的草稿也不重写',async()=>{
 const sent=[];const store=createNotebookStore(async(path,body)=>{if(!body)return {revision:1,data:fixture()};assert.equal(typeof body,'string','为比较改动构造的 JSON 文本直接作请求体，不再序列化第二遍');sent.push(payload(body));return {revision:1+sent.length}});
 await store.load();store.prefer(d=>{d.preferences.selectedNoteId=''});assert.equal(store.status().dirty,false);await store.flush();assert.equal(sent.length,0);
 store.edit(d=>{d.notes[0].body='临时改一下'});store.edit(d=>{d.notes[0].body='先理解间隔'});store.prefer(d=>{d.preferences.selectedNoteId='note-1'});
 await store.flush();assert.equal(sent.length,0,'content identical to the saved file is not rewritten');assert.equal(store.status().dirty,false);
 store.prefer(d=>{d.preferences.selectedNoteId=''});store.edit(d=>{d.notes[0].title='新的标题'});await store.flush();
 assert.equal(sent.length,1);assert.equal(sent[0].data.notes[0].title,'新的标题');assert.equal(sent[0].data.preferences.selectedNoteId,'','the latest selection rides along with a real save');
});
await test('超过 8 MiB 在本机就拦下并说明，清出空间后恢复保存；接近上限时报告用量',async()=>{
 const sent=[];let reject=null;const store=createNotebookStore(async(path,body)=>{if(!body)return {revision:1,data:fixture()};if(reject)throw reject;sent.push(payload(body));return {revision:1+sent.length}});
 await store.load();assert.ok(store.status().bytes>0&&store.status().bytes<NOTEBOOK_WARN_BYTES);
 store.edit(d=>{d.notes.push({id:'big',courseId:'',title:'导入的长文',body:'记'.repeat(Math.ceil(NOTEBOOK_MAX_BYTES/3)),createdAt:1,updatedAt:1,deletedAt:2})});
 await assert.rejects(store.flush(),e=>e.code===413&&/超过 8 MiB 上限/.test(e.message));
 assert.equal(sent.length,0,'an over-limit notebook is refused before uploading 8 MiB');
 assert.equal(store.status().tooLarge,true);assert.equal(store.status().dirty,true);assert.equal(store.status().conflict,false);
 store.edit(d=>{d.notes=d.notes.filter(n=>n.id!=='big');d.notes[0].body='清理后继续写'});await store.flush();
 assert.equal(sent.length,1);assert.equal(sent[0].data.notes.length,1);assert.equal(store.status().tooLarge,false);assert.equal(store.status().error,'');
 store.edit(d=>{d.notes[0].body='<'.repeat(Math.ceil(NOTEBOOK_WARN_BYTES/6))});await store.flush();
 assert.ok(store.status().bytes>=NOTEBOOK_WARN_BYTES&&store.status().bytes<NOTEBOOK_MAX_BYTES,'Go stores < as \\u003c, six bytes each');
 reject=Object.assign(Error('笔记不能超过 8 MiB，原笔记已保留'),{code:413});store.edit(d=>{d.notes[0].title='服务端拒绝'});
 await assert.rejects(store.flush());assert.equal(store.status().tooLarge,true,'a 413 from the sidecar is reported the same way');
 assert.equal(notebookBytes({a:'<'})-notebookBytes({a:'a'}),5);assert.equal(notebookBytes({a:'记'})-notebookBytes({a:'a'}),2);assert.equal(formatMiB(NOTEBOOK_MAX_BYTES+1),'8.1');
});
await test('保存状态在超限和接近上限时给出清理入口，普通状态保持安静',()=>{
 assert.ok(notebookSource.includes(' function statusHTML(){return notebookStatusHTML(store.status(),{notes:data().notes,trash})}'),'保存状态必须用 notebook-view.mjs 的 notebookStatusHTML');
 const data=fixture();data.notes.push({...data.notes[0],id:'old',deletedAt:5},{...data.notes[0],id:'older',deletedAt:6});let status,trash=false;
 const context={statusHTML:()=>buttonMarks(notebookStatusHTML(status,{notes:data.notes,trash}))};
 status={loaded:true,dirty:true,error:'笔记本约 8.1 MiB，超过 8 MiB 上限，这次修改还没保存',tooLarge:true,conflict:false,bytes:NOTEBOOK_MAX_BYTES+1};
 trash=true;assert.ok(!context.statusHTML().includes('[trash:'),'已经在回收站里时不再给“查看回收站”');trash=false;
 status={loaded:true,dirty:true,error:'笔记本约 8.1 MiB，超过 8 MiB 上限，这次修改还没保存',tooLarge:true,conflict:false,bytes:NOTEBOOK_MAX_BYTES+1};
 let html=context.statusHTML();for(const part of ['[backup:导出当前草稿备份]','[trash:查看回收站（2）]','[empty-trash:清空回收站]','[reload:放弃这次修改]','has-error','永久删除回收站里的旧页'])assert.ok(html.includes(part),part);
 assert.ok(!html.includes('[save:'),'retrying the same oversized save cannot help');
 status={loaded:true,dirty:false,error:'',tooLarge:false,conflict:false,bytes:NOTEBOOK_WARN_BYTES+10};html=context.statusHTML();
 assert.match(html,/is-near-limit/);assert.match(html,/已用 6\.\d \/ 8 MiB，接近上限/);assert.ok(html.includes('[empty-trash:清空回收站]'));
 data.notes=data.notes.filter(n=>!n.deletedAt);html=context.statusHTML();assert.ok(html.includes('[backup:导出整本备份]'));
 status={...status,bytes:1000};html=context.statusHTML();assert.doesNotMatch(html,/note-save-recovery|接近上限/);
 status={loaded:true,dirty:true,error:'另一个窗口已保存',tooLarge:false,conflict:true,bytes:1000};assert.ok(context.statusHTML().includes('[reload:读取最新版本]'));
});
await test('回收站可以永久删除一页或整体清空；超限时仍能进入回收站清理',async()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8'),from=source.indexOf('async function actionRun('),to=source.indexOf('function paintFeishu(',from);assert.ok(from>=0&&to>from);
 const data=fixture();data.notes.push({...data.notes[0],id:'old',title:'旧页',deletedAt:5},{...data.notes[0],id:'older',title:'更旧',deletedAt:6});
 let active=data.notes[1],accept=true,flushes=0,flushError=null;const messages=[];
 const context=vm.createContext({activeNote:()=>active,data:()=>data,edit:fn=>fn(data),prefer:fn=>fn(data),chooseVisible(){},paint(){},confirm:async()=>accept,toast:text=>messages.push(text),flush:async()=>{flushes++;if(flushError)throw flushError},trash:true,query:''});
 vm.runInContext(source.slice(from,to),context);
 accept=false;await context.actionRun('purge');assert.equal(data.notes.length,3,'nothing is removed without confirmation');
 accept=true;await context.actionRun('purge');assert.deepEqual(data.notes.map(n=>n.id),['note-1','older']);assert.match(messages.at(-1),/永久删除/);
 active=data.notes[0];await context.actionRun('purge');assert.equal(data.notes.length,2,'a page that is not in the trash is never purged');
 await context.actionRun('empty-trash');assert.deepEqual(data.notes.map(n=>n.id),['note-1']);assert.match(messages.at(-1),/1 页/);
 flushError=Object.assign(Error('笔记本超过 8 MiB 上限'),{code:413});context.trash=false;await context.actionRun('trash');assert.equal(context.trash,true,'an over-limit save does not lock the reader out of the trash');
 flushError=Error('磁盘暂不可写');context.trash=false;await assert.rejects(context.actionRun('trash'),/磁盘/);assert.equal(context.trash,false);
 const flushesBefore=flushes;flushError=null;await context.actionRun('select',{id:'note-1'});assert.equal(data.preferences.selectedNoteId,'note-1');assert.equal(flushes,flushesBefore+1,'only the pending draft is flushed; the selection is not');
});
await test('输入时只重绘当前这一条列表项，字数与大纲在停笔后再算',()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8');
 const slice=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from,start);return source.slice(from,to)};
 const note={id:'n1',title:'标题',body:'正文',updatedAt:1},timers=[],count={textContent:''};let edits=0,lists=0,outlines=0,replaced=null;
 const item={dataset:{id:'n1'},classList:{contains:name=>name==='selected'},replaceWith(next){replaced=next}},list={firstElementChild:item};
 const context=vm.createContext({query:'',metaTimer:null,activeNote:()=>note,edit:fn=>{edits++;fn()},q:selector=>selector==='.note-list'?list:selector==='[data-note-count]'?count:null,
  document:{createElement:()=>({set innerHTML(html){this.firstElementChild={html}}})},listItem:n=>'<item>'+n.body,paintList(){lists++},wordCount:text=>text.length,paintOutline(){outlines++},
  setTimeout:fn=>timers.push(fn),clearTimeout(){},Date});
 context.matchesQuery=n=>!context.query||n.body.includes(context.query);
 vm.runInContext(slice('function paintEdited(','function jumpToHeading(')+slice('function input(','function keydown('),context);
 context.input({target:{id:'note-body',value:'正文改了'}});
 assert.equal(edits,1);assert.equal(lists,0,'the whole list is not rebuilt per keystroke');assert.equal(replaced.html,'<item>正文改了');
 assert.equal(count.textContent,'');assert.equal(outlines,0);timers.at(-1)();assert.equal(count.textContent,'4 字词');assert.equal(outlines,1);
 context.input({target:{id:'note-body',value:'正文改了'}});assert.equal(edits,1,'an unchanged value is not an edit');
 context.query='找不到';context.input({target:{id:'note-body',value:'又改了'}});assert.equal(lists,1,'a page leaving the search results rebuilds the list');
 context.query='';list.firstElementChild={dataset:{id:'other'},classList:{contains:()=>false}};context.input({target:{id:'note-title',value:'新标题'}});assert.equal(lists,2,'a page that must move to the top rebuilds the list');assert.equal(note.title,'新标题');
});
await test('笔记体积按 Go 写盘的字节逐字计算：中文、表情、< > & 与行分隔符都算对',()=>{
 const reference=text=>Buffer.byteLength(text)+[...text].reduce((n,ch)=>n+('<>&'.includes(ch)?5:ch==='\u2028'||ch==='\u2029'?3:0),0)+64;
 for(const value of ['','plain','线性代数 <b> & notes','😀 emoji 𠀀','行\u2028分\u2029段','\ud800 孤立代理','\n\t"引号"\\','é ß ☃'])assert.equal(notebookTextBytes(JSON.stringify({a:value})),reference(JSON.stringify({a:value})),JSON.stringify(value));
});
await test('请求体发出时就定型：保存途中改了又改回不重写，改了没改回由下一轮写入',async()=>{
 const gates=[],disk=[];let rev=1;
 const store=createNotebookStore(async(path,body)=>{if(!body)return {revision:1,data:fixture()};assert.equal(typeof body,'string');await new Promise(resolve=>gates.push(resolve));disk.push(JSON.parse(body).data);return {revision:++rev}});
 const tick=()=>new Promise(resolve=>setImmediate(resolve)),drain=async()=>{for(let i=0;i<20&&store.status().saving;i++){gates.shift()?.();await tick()}};
 await store.load();store.edit(d=>{d.notes[0].body='第一版'});let saving=store.flush();
 store.edit(d=>{d.notes[0].body='第二版'});store.edit(d=>{d.notes[0].body='第一版'});
 await drain();await saving;
 assert.deepEqual(disk.map(d=>d.notes[0].body),['第一版'],'the body is fixed when sent, and an edit reverted while saving is not rewritten');assert.equal(store.status().dirty,false);
 store.edit(d=>{d.notes[0].body='第三版'});saving=store.flush();store.edit(d=>{d.notes[0].body='第四版'});
 await drain();await saving;
 assert.deepEqual(disk.map(d=>d.notes[0].body),['第一版','第三版','第四版'],'an edit made while saving goes out in the next round');
 assert.equal(store.status().dirty,false);assert.equal(store.status().revision,4);
});
await test('服务端刚用备份恢复了笔记文件时，冲突说明文件已恢复，而不是另一个窗口',async()=>{
 const status=store=>buttonMarks(notebookStatusHTML(store.status(),{notes:store.data.notes,trash:false}));
 for(const recovered of [true,false]){
  const store=createNotebookStore(async(path,body)=>{if(!body)return {revision:1,data:fixture()};throw Object.assign(Error(recovered?'笔记文件损坏，已恢复到上一次成功保存的版本；请先导出当前内容，再重新载入':'另一个窗口更新了笔记'),{code:409,recovered})});
  await store.load();store.edit(d=>{d.notes[0].body='恢复前写下的草稿'});await assert.rejects(store.flush());
  assert.equal(store.status().conflict,true);assert.equal(store.status().recovered,recovered);assert.equal(store.snapshot().notes[0].body,'恢复前写下的草稿');
  const html=status(store);assert.ok(html.includes('[reload:读取最新版本]'));
  if(recovered){assert.match(html,/笔记文件损坏，已恢复到上一次成功保存的版本。当前草稿仍在本页，请先导出，再读取最新版本。/);assert.doesNotMatch(html,/另一个窗口/)}
  else assert.match(html,/另一个窗口保存了新内容。当前草稿仍在本页/);
 }
});
await test('离开书桌不论保存成败都收起专心书写，标志与界面一致',async()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8');
 const slice=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from,start);return source.slice(from,to)};
 const classes=new Set(),toggle={textContent:'',attrs:{},setAttribute(name,value){this.attrs[name]=value}};let failure=null;
 const context=vm.createContext({writingFocus:false,host:null,q:selector=>selector==='[data-note-action=focus-mode]'?toggle:null,
  document:{body:{classList:{toggle:(name,on)=>{if(on)classes.add(name);else classes.delete(name)}}}},flush:async()=>{if(failure)throw failure}});
 vm.runInContext(slice('function setWritingFocus(','const operations=createNoteOperations(')+slice('async function leave(','async function backup('),context);
 for(const error of [Object.assign(Error('另一个窗口已保存'),{code:409}),Object.assign(Error('笔记不能超过 8 MiB'),{code:413}),Error('本机服务暂时无响应'),null]){
  context.setWritingFocus(true);assert.equal(context.writingFocus,true);assert.ok(classes.has('note-writing-focus'));failure=error;
  if(error)await assert.rejects(context.leave(),error);else await context.leave();
  assert.equal(context.writingFocus,false,String(error?.code));assert.ok(!classes.has('note-writing-focus'));
  assert.equal(toggle.textContent,'专心书写');assert.equal(toggle.attrs['aria-pressed'],'false');
 }
});
process.stdout.write(`${checks} notebook checks passed.\n`);
