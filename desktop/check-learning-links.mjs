import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createNoticesUI} from './assets/garden/notices.mjs';
import {createTodoComposer} from './assets/garden/todo-composer.mjs';
import {createNotebookStore} from './assets/garden/notebook-model.mjs';
import {createNoteOperations} from './assets/garden/notebook-view.mjs';

let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS',name)}
const copy=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const originalDocument=globalThis.document;

const sources=[{id:'college-law',name:'法学院',url:'https://law.szu.edu.cn/xwjc/xygg.htm',group:'college',readable:true,search_mode:'official'}];
const feedItem={title:'学术讲座报名',url:'https://law.szu.edu.cn/info/100/101.htm',date:'2026-10-25'};
const searchItem={title:'研究生论文讲座',url:'https://law.szu.edu.cn/info/100/202.htm',date:'2026-10-24',can_read:true};
const externalItem={title:'外部公众号文章',url:'https://mp.weixin.qq.com/s/example',date:'2026-10-24',can_read:false};
const draft=item=>({text:item.title,source:{type:'notice',url:item.url,title:item.title}});
const clickNotice=(ui,url)=>ui.click('notice-todo',{dataset:{url}});

await check('feed and school search create a draft with the displayed notice source, never its publication date',async()=>{
 globalThis.document={getElementById:()=>null};
 const drafts=[],requests=[];
 const ui=createNoticesUI({getSource:()=> 'college-law',onTask:value=>drafts.push(value),api:async path=>{
  requests.push(path);
  if(path.endsWith('/notice-sources'))return {sources};
  if(path.includes('/notices/search?'))return {source:'法学院',items:[searchItem,externalItem],query:'讲座',scope:'title',range_label:'法学院公开栏目',page:1,page_size:12,total:2,fetched_at:'2026-10-25T00:00:00Z'};
  return {source:'法学院',items:[feedItem],fetched_at:'2026-10-25T00:00:00Z'};
 }});
 await ui.enter();assert.match(ui.card(),/data-action="notice-todo"/);
 await clickNotice(ui,feedItem.url);assert.deepEqual(drafts,[draft(feedItem)]);
 ui.input({target:{id:'notice-query',value:'讲座'}});await ui.click('notice-search');
 await clickNotice(ui,searchItem.url);assert.deepEqual(drafts[1],draft(searchItem));
 assert.equal(Object.hasOwn(drafts[1],'date'),false);
 assert.ok(requests.every(path=>path.startsWith('/api/campus/')));
 const externalRow=ui.card().split('<li ').find(row=>row.includes(externalItem.url));
 assert.ok(externalRow);assert.doesNotMatch(externalRow,/data-action="notice-todo"/);
 assert.match(externalRow,/原文/);
 await assert.rejects(clickNotice(ui,'https://law.szu.edu.cn/info/missing.htm'),/列表已更新/);
 await assert.rejects(clickNotice(ui,feedItem.url),/列表已更新/,'old feed buttons cannot create a task from a different search result');
 await assert.rejects(clickNotice(ui,externalItem.url));assert.equal(drafts.length,2);
 await ui.click('notice-search-clear');await clickNotice(ui,feedItem.url);assert.deepEqual(drafts[2],draft(feedItem));
});

// Small form fixture: parse actual control start tags so malformed button HTML cannot
// accidentally pass by having querySelector return an element that does not exist.
function composerDOM(){
 const dialogs=[],decode=s=>s.replace(/&(amp|lt|gt|quot|#39);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[x]);
 const element=()=>({listeners:{},disabled:false,addEventListener(name,fn){this.listeners[name]=fn},focus(){this.focused=true}});
 const document={body:{append(dialog){dialogs.push(dialog)}},createElement(tag){
  assert.equal(tag,'dialog');
  const dialog={...element(),open:false,setAttribute(){},showModal(){this.open=true},close(){this.open=false},remove(){this.removed=true},
   set innerHTML(html){
    this.html=html;assert.doesNotMatch(html,/<\/button\s+[^>]*>/,'button end tags cannot hold a missing next button');
    const controls=[];
    for(const match of html.matchAll(/<(input|button)\b([^>]*)>/g)){
     const control=element(),attributes=match[2];
     control.name=/\bname="([^"]*)"/.exec(attributes)?.[1]||'';
     control.value=decode(/\bvalue="([^"]*)"/.exec(attributes)?.[1]||'');
     control.cancel=/\bdata-composer-cancel\b/.test(attributes);
     controls.push(control);if(control.name)controls[control.name]=control;
    }
    this.form={...element(),elements:controls};this.status={textContent:''};
   },querySelector(selector){
    if(selector==='form')return this.form;
    if(selector==='[role=status]')return this.status;
    if(selector==='[data-composer-cancel]')return this.form.elements.find(x=>x.cancel)||null;
    assert.fail('Unexpected composer selector: '+selector);
   }};
  return dialog;
 }};
 return {document,dialogs,current:()=>dialogs.at(-1)};
}
const event=()=>({prevented:false,stopped:false,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}});
const submit=dialog=>dialog.form.listeners.submit(event());

await check('notice composer opens with no invented deadline and cancel leaves no task behind',async()=>{
 const dom=composerDOM(),writes=[];globalThis.document=dom.document;
 const composer=createTodoComposer({save:async action=>writes.push(action)});
 composer.open(draft(feedItem));const dialog=dom.current();assert.equal(dialog.open,true);
 assert.equal(dialog.form.elements.date.value,'');assert.equal(dialog.form.elements.text.value,feedItem.title);
 assert.match(dialog.html,/发布日期不一定是截止日期/);
 await dialog.querySelector('[data-composer-cancel]').listeners.click();assert.equal(dialog.open,false);assert.deepEqual(writes,[]);
 assert.throws(()=>composer.open({text:'不可信来源',source:{type:'notice',url:'javascript:alert(1)'}}),/来源/);
 assert.deepEqual(writes,[]);
});

await check('composer blocks duplicate submits and cancel while saving, preserving confirmed title and date',async()=>{
 const dom=composerDOM(),gate=deferred(),writes=[],messages=[];globalThis.document=dom.document;
 const composer=createTodoComposer({save:async action=>{writes.push(action);await gate.promise},toast:text=>messages.push(text)});
 composer.open(draft(feedItem));const dialog=dom.current();
 dialog.form.elements.text.value='  报名讲座，准备一个问题  ';dialog.form.elements.date.value='2026-10-29';
 const pending=submit(dialog);assert.ok(dialog.form.elements.every(control=>control.disabled));
 await submit(dialog);assert.equal(writes.length,1);
 await dialog.querySelector('[data-composer-cancel]').listeners.click();assert.equal(dialog.open,true);
 const escape=event();dialog.listeners.cancel(escape);assert.equal(escape.prevented,true);
 composer.open(draft(searchItem));assert.equal(dom.dialogs.length,1,'a second notice cannot replace a pending form');
 assert.deepEqual({...writes[0],id:'stable-id'},{type:'todoAdd',id:'stable-id',text:'报名讲座，准备一个问题',date:'2026-10-29',source:draft(feedItem).source});
 gate.resolve();await pending;assert.equal(dialog.open,false);assert.equal(messages.length,1);
});

await check('failed saves keep the composer draft and reuse its ID on an explicit retry',async()=>{
 const dom=composerDOM(),writes=[],messages=[];let fail=true;globalThis.document=dom.document;
 const composer=createTodoComposer({save:async action=>{writes.push(copy(action));if(fail)throw Error('磁盘暂不可写')},toast:text=>messages.push(text)});
 composer.open(draft(feedItem));const dialog=dom.current();dialog.form.elements.text.value='我自己的待办标题';
 await submit(dialog);assert.equal(dialog.open,true);assert.match(dialog.status.textContent,/磁盘暂不可写/);
 assert.equal(dialog.form.elements.text.value,'我自己的待办标题');assert.equal(dialog.form.elements.date.value,'');
 assert.ok(dialog.form.elements.every(control=>!control.disabled));assert.deepEqual(messages,[]);
 fail=false;await submit(dialog);assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(dialog.open,false);
});

await check('empty composer text is explained without saving or clearing other fields',async()=>{
 const dom=composerDOM(),writes=[];globalThis.document=dom.document;
 createTodoComposer({save:async action=>writes.push(action)}).open(draft(feedItem));
 const dialog=dom.current();dialog.form.elements.text.value='  ';dialog.form.elements.date.value='2026-10-29';
 await submit(dialog);assert.deepEqual(writes,[]);assert.match(dialog.status.textContent,/写下一件/);
 assert.equal(dialog.form.elements.date.value,'2026-10-29');assert.equal(dialog.open,true);
});

const notebookSource=readFileSync(new URL('./assets/garden/notebook.mjs',import.meta.url),'utf8');
function functionSection(start,end){const from=notebookSource.indexOf(start),to=notebookSource.indexOf(end,from);assert.ok(from>=0&&to>from,'Update the notebook integration harness when function boundaries change');return notebookSource.slice(from,to)}
const actionCode=functionSection('async function actionRun(','function paintFeishu(');
const openCode=functionSection('async function openNote(','\n return {view');
const notebookFixture=()=>({courses:[{id:'c1',name:'数学'},{id:'c2',name:'算法'}],notes:[
 {id:'n1',courseId:'c1',title:'课堂笔记',body:'第一篇的正文',createdAt:100,updatedAt:100},
 {id:'n2',courseId:'c2',title:'课堂笔记',body:'  研究例题的证明  ',createdAt:100,updatedAt:100},
 {id:'trashed',courseId:'c2',title:'旧笔记',body:'回收站里的内容仍完整',createdAt:100,updatedAt:100,deletedAt:200},
 ],preferences:{selectedNoteId:'n1',selectedCourseId:'c1'}});

await check('note task creation waits for the draft save and carries a stable note ID even when titles repeat',async()=>{
 const data=notebookFixture(),note=data.notes[1],gate=deferred(),tasks=[],messages=[];
 const area={value:note.body,selectionStart:0,selectionEnd:note.body.length};let saved=false;
 const context=vm.createContext({q:selector=>selector==='#note-body'?area:null,flush:async()=>{await gate.promise;saved=true},activeNote:()=>note,
  onTask:async(text,source)=>{assert.equal(saved,true);tasks.push({text,source:copy(source)})},toast:text=>messages.push(text)});
 vm.runInContext(actionCode,context);const pending=context.actionRun('task',{});assert.deepEqual(tasks,[]);
 gate.resolve();await pending;
 assert.deepEqual(tasks,[{text:'研究例题的证明',source:{type:'note',noteId:'n2',title:'课堂笔记'}}]);assert.equal(messages.length,1);
 context.flush=async()=>{throw Error('保留尚未保存的正文')};await assert.rejects(context.actionRun('task',{}),/尚未保存/);
 assert.equal(tasks.length,1);assert.equal(area.value,note.body);assert.equal(messages.length,1);
});

async function noteHarness(){
 let fail=false,rev=1;const writes=[],messages=[],paints=[];
 const store=createNotebookStore(async(path,body)=>{if(!body)return {version:1,revision:rev,data:notebookFixture()};if(fail)throw Error('笔记保存失败');writes.push(JSON.parse(body));return {revision:++rev}});
 await store.load();
 const operations=createNoteOperations({run:async()=>{},toast:text=>messages.push(text),settled(){}});
 const context=vm.createContext({operations,store,data:()=>store.data,flush:()=>store.flush(),prefer:fn=>store.prefer(fn),
  load:()=>store.load(),loadError:'',trash:true,query:'找不到本页的旧搜索',mode:'write',paint:options=>paints.push(copy(options)),toast:text=>messages.push(text)});
 vm.runInContext(openCode,context);
 return {context,store,writes,messages,paints,setFail:value=>{fail=value}};
}

await check('return to note clears stale search, switches course by ID and can read a page in trash',async()=>{
 const h=await noteHarness();await h.context.openNote('n2');
 assert.equal(h.store.data.preferences.selectedNoteId,'n2');assert.equal(h.store.data.preferences.selectedCourseId,'c2');
 assert.equal(h.context.query,'');assert.equal(h.context.trash,false);assert.equal(h.context.mode,'read');
 assert.deepEqual(h.paints,[{resetList:true}]);assert.deepEqual(h.writes,[],'selecting a note does not rewrite the notebook');
 await h.context.openNote('trashed');assert.equal(h.context.trash,true);assert.equal(h.store.data.preferences.selectedNoteId,'trashed');
 assert.equal(h.store.data.notes.find(n=>n.id==='trashed').body,'回收站里的内容仍完整');
 assert.match(h.messages.at(-1),/回收站/);assert.deepEqual(h.writes,[]);
});

await check('missing note returns an honest error without fabricating or changing the selected page',async()=>{
 const h=await noteHarness(),before=h.store.snapshot();
 await assert.rejects(h.context.openNote('missing'),/永久删除|当前笔记备份/);
 assert.deepEqual(h.store.snapshot(),before);assert.equal(h.context.query,'找不到本页的旧搜索');
 assert.equal(h.context.trash,true);assert.deepEqual(h.paints,[]);assert.deepEqual(h.writes,[]);assert.equal(h.context.operations.busy,false);
});

await check('return to note preserves an unsaved draft and selection when saving fails, then succeeds on retry',async()=>{
 const h=await noteHarness();h.store.edit(data=>{data.notes[0].body='这是仍未保存的珍贵草稿'});h.setFail(true);
 await assert.rejects(h.context.openNote('n2'),/保存失败/);
 assert.equal(h.store.data.notes[0].body,'这是仍未保存的珍贵草稿');assert.equal(h.store.status().dirty,true);
 assert.equal(h.store.data.preferences.selectedNoteId,'n1');assert.equal(h.context.query,'找不到本页的旧搜索');
 assert.equal(h.context.operations.busy,false);assert.deepEqual(h.paints,[]);
 h.setFail(false);await h.context.openNote('n2');assert.equal(h.store.status().dirty,false);
 assert.equal(h.writes[0].data.notes[0].body,'这是仍未保存的珍贵草稿');assert.equal(h.store.data.preferences.selectedNoteId,'n2');
});

globalThis.document=originalDocument;
console.log(`${checks} learning link checks passed`);
