import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {emptyNotebook,normalizeNotebook,markdownNote,noteHeadings,latestNotebookNote,feishuDocumentURL,wordCount,markdownExport,markdownImport,createNotebookStore} from './assets/garden/notebook-model.mjs';

let checks=0;
async function test(name,fn){await fn();checks++;process.stdout.write('PASS '+name+'\n')}
const fixture=()=>({courses:[{id:'course-1',name:'机器学习'}],notes:[{id:'note-1',courseId:'course-1',title:'支持向量机',body:'先理解间隔',createdAt:100,updatedAt:100}],preferences:{selectedCourseId:'course-1',selectedNoteId:'note-1'}});
await test('备份保留正文、回收站与来源，坏引用不会悄悄丢失',()=>{const data=fixture();data.notes[0].deletedAt=200;data.notes[0].sourceUrl='https://team.feishu.cn/docx/abc';assert.deepEqual(normalizeNotebook(data),data);const broken=fixture();broken.notes[0].courseId='missing';assert.throws(()=>normalizeNotebook(broken));const duplicate=fixture();duplicate.notes.push({...duplicate.notes[0]});assert.throws(()=>normalizeNotebook(duplicate))});
await test('Markdown 原始 HTML、危险链接和远程图片都不能执行或暗中加载',()=>{const html=markdownNote('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[点我](javascript:alert) ![图](https://remote.test/private.png)\n\n`<svg onload=1>`');assert.doesNotMatch(html,/<script|<img|<svg|href="javascript:/i);assert.match(html,/&lt;script&gt;/);assert.match(html,/图片/);assert.match(html,/https:\/\/remote.test\/private.png/)});
await test('课堂需要的标题、清单、代码与强调可阅读',()=>{const html=markdownNote('## 重点\n\n- [ ] 看例题\n- [x] **弄懂**\n\n```js\nconst x = "<a>";\n```\n\n> 一个问题');assert.match(html,/<h3 id="note-section-1" tabindex="-1">重点/);assert.match(html,/未完成/);assert.match(html,/已完成/);assert.match(html,/<strong>弄懂/);assert.match(html,/&lt;a&gt;/);assert.match(html,/<blockquote>/)});
await test('飞书文档只接受明确官方文档地址',()=>{assert.equal(feishuDocumentURL('https://team.feishu.cn/docx/Abc?from=copy#xx'),'https://team.feishu.cn/docx/Abc');assert.equal(feishuDocumentURL('https://team.larksuite.com/wiki/Abc'),'https://team.larksuite.com/wiki/Abc');assert.equal(feishuDocumentURL('https://team.larkoffice.com/docx/Abc'),'https://team.larkoffice.com/docx/Abc');for(const value of ['https://feishu.cn.evil.test/docx/a','http://team.feishu.cn/docx/a','https://user:pw@team.feishu.cn/docx/a','https://team.feishu.cn:8443/docx/a','https://team.feishu.cn/drive/folder/a'])assert.equal(feishuDocumentURL(value),'')});
await test('Markdown 导出导入保留标题正文与中文计数',()=>{const note=fixture().notes[0];assert.deepEqual(markdownImport(markdownExport(note)),{title:note.title,body:note.body+'\n'});assert.deepEqual(markdownImport('正文','第一课.md'),{title:'第一课',body:'正文'});assert.equal(wordCount('今天学习 machine learning 2'),7)});
await test('首次空本机存档可以打开，无虚构示例内容',async()=>{const store=createNotebookStore(async()=>({version:1,revision:0,data:null}));await store.load();assert.deepEqual(store.data,emptyNotebook());assert.equal(store.status().dirty,false)});
await test('保存进行中继续输入会顺序落盘，最后一笔不会被旧响应覆盖',async()=>{const writes=[],pending=[];let rev=1;const api=async(path,body)=>{if(!body)return {revision:rev,data:fixture()};writes.push(structuredClone(body));await new Promise(resolve=>pending.push(resolve));return {revision:++rev,data:body.data}};const store=createNotebookStore(api);await store.load();store.edit(d=>{d.notes[0].body='第一笔'});const saved=store.flush();await Promise.resolve();store.edit(d=>{d.notes[0].body='第二笔中文'});assert.equal(store.flush(),saved);pending.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(writes.length,2);assert.equal(writes[1].revision,2);assert.equal(writes[1].data.notes[0].body,'第二笔中文');pending.shift()();await saved;assert.equal(store.status().dirty,false);assert.equal(store.data.notes[0].body,'第二笔中文')});
await test('冲突保留本机草稿，禁止自动重试覆盖其他窗口',async()=>{let writes=0;const store=createNotebookStore(async(path,body)=>{if(!body)return {revision:1,data:fixture()};writes++;const e=Error('另一个窗口已保存');e.code=409;throw e});await store.load();store.edit(d=>{d.notes[0].body='宝贵的草稿'});await assert.rejects(store.flush());assert.equal(store.status().conflict,true);assert.equal(store.status().dirty,true);assert.equal(store.snapshot().notes[0].body,'宝贵的草稿');await assert.rejects(store.flush());assert.equal(writes,1)});
await test('普通保存失败可以重试，失败时不会假报已保存',async()=>{let fail=true;const store=createNotebookStore(async(path,body)=>{if(!body)return {revision:1,data:fixture()};if(fail)throw Error('磁盘暂不可写');return {revision:2,data:body.data}});await store.load();store.edit(d=>{d.notes[0].title='新标题'});await assert.rejects(store.flush());assert.equal(store.status().dirty,true);assert.match(store.status().error,/磁盘/);fail=false;await store.flush();assert.equal(store.status().dirty,false);assert.equal(store.status().error,'')});
await test('选择读取最新版本但网络失败时，草稿依然可以导出',async()=>{let first=true;const store=createNotebookStore(async()=>{if(first){first=false;return {revision:1,data:fixture()}}throw Error('网络失败')});await store.load();store.edit(d=>{d.notes[0].body='仍在'});await assert.rejects(store.discardAndReload());assert.equal(store.status().dirty,true);assert.equal(store.snapshot().notes[0].body,'仍在')});
await test('读取最新版本等待期间继续写的内容不会被迟到的 GET 覆盖',async()=>{let reads=0,release;const store=createNotebookStore(async()=>{if(++reads===1)return {revision:1,data:fixture()};return new Promise(resolve=>{release=()=>{const latest=fixture();latest.notes[0].body='另一窗口的内容';resolve({revision:2,data:latest})}})});await store.load();store.edit(d=>{d.notes[0].body='准备放弃的旧草稿'});const reading=store.discardAndReload();store.edit(d=>{d.notes[0].body='确认读取后新写的一句'});release();await assert.rejects(reading,/读取期间你又修改/);assert.equal(store.status().dirty,true);assert.equal(store.status().revision,1);assert.equal(store.snapshot().notes[0].body,'确认读取后新写的一句')});
await test('确认读取后没有继续编辑时，正常采用最新版本并清除旧草稿状态',async()=>{let reads=0,release;const store=createNotebookStore(async()=>{if(++reads===1)return {revision:1,data:fixture()};return new Promise(resolve=>{release=()=>{const latest=fixture();latest.notes[0].body='明确采用的最新内容';resolve({revision:4,data:latest})}})});await store.load();store.edit(d=>{d.notes[0].body='准备放弃的旧草稿'});const reading=store.discardAndReload();release();await reading;assert.equal(store.status().dirty,false);assert.equal(store.status().revision,4);assert.equal(store.status().error,'');assert.equal(store.snapshot().notes[0].body,'明确采用的最新内容')});
await test('导出草稿不提前解除正在等待的操作锁，原操作完成后正常解锁',async()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8'),from=source.indexOf('async function perform('),to=source.indexOf('async function actionRun(',from);assert.ok(from>=0&&to>from);
 for(const exportAction of ['backup','export']){
  let release;const gate=new Promise(resolve=>{release=resolve}),calls=[],messages=[];
  const context=vm.createContext({operation:false,paintStatus(){},toast:message=>messages.push(message),actionRun:async action=>{calls.push(action);if(action==='feishu-import')await gate}});
  vm.runInContext(source.slice(from,to),context);const pending=context.perform('feishu-import');assert.equal(context.operation,true);
  await context.perform(exportAction);assert.equal(context.operation,true);await context.perform('course');assert.deepEqual(calls,['feishu-import',exportAction]);assert.match(messages[0],/还在处理中/);
  release();await pending;assert.equal(context.operation,false);await context.perform('course');assert.deepEqual(calls,['feishu-import',exportAction,'course']);assert.equal(context.operation,false);
 }
});
await test('长文大纲跳过代码块，重复标题有独立锚点，CRLF 定位不偏移',()=>{
 const body='## 重复标题\r\n正文\r\n```md\r\n# 代码内不是章节\r\n```\r\n### 重复标题\r\n末尾';
 const headings=noteHeadings(body);assert.equal(headings.length,2);assert.deepEqual(headings.map(h=>h.id),['note-section-1','note-section-2']);
 assert.equal(body.slice(headings[1].start,headings[1].end),'### 重复标题');
 const html=markdownNote(body);for(const h of headings)assert.ok(html.includes(`id="${h.id}"`));assert.equal((html.match(/id="note-section-/g)||[]).length,2);
});
await test('大纲按文本框的 LF 内容选中章节，原 CRLF 正文和阅读锚点保持不变',()=>{
 const source=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8'),from=source.indexOf('function jumpToHeading('),to=source.indexOf('function editor(',from);assert.ok(from>=0&&to>from);
 const body='## 第一节\r\n第一段\r\n第二段\r\n\r\n### 要跳转的章节\r\n结尾',note={body},events=[];
 // Native textarea.value and its selection offsets use LF, including after a CRLF JSON restore.
 const area={value:body.replace(/\r\n/g,'\n'),hidden:false,clientWidth:500,clientHeight:200,focus(){events.push('editor-focus')},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end},scrollIntoView(){events.push('editor-scroll')}};
 const measure={style:{},getBoundingClientRect:()=>({height:300}),remove(){}},anchor={scrollIntoView(){events.push('anchor-scroll')},focus(){events.push('anchor-focus')}};
 const context=vm.createContext({activeNote:()=>note,noteHeadings,q:selector=>selector==='#note-body'?area:selector==='#note-section-2'?anchor:null,getComputedStyle:()=>({}),document:{createElement:()=>measure},host:{appendChild(){}}});
 vm.runInContext(source.slice(from,to),context);context.jumpToHeading(1);
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
 const context=vm.createContext({operation:false,trash:true,query:'旧关键词',mode:'read',store:{status:()=>({loaded:true})},data:()=>data,latestNotebookNote,flush:async()=>{if(++saves===1)await gate},edit:fn=>fn(data),paint(){},paintStatus(){}});
 vm.runInContext(source.slice(from,to),context);const pending=context.resumeLatest();assert.equal(data.preferences.selectedNoteId,'note-1');
 release();await pending;assert.equal(data.preferences.selectedNoteId,'recent');assert.equal(data.preferences.selectedCourseId,'course-2');assert.equal(context.trash,false);assert.equal(context.query,'');assert.equal(context.mode,'write');assert.equal(context.operation,false);assert.equal(saves,2);
 context.flush=async()=>{throw Error('保留未保存草稿')};data.preferences.selectedNoteId='note-1';await assert.rejects(context.resumeLatest(),/未保存草稿/);assert.equal(data.preferences.selectedNoteId,'note-1');assert.equal(context.operation,false);
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
process.stdout.write(`${checks} notebook checks passed.\n`);
