import assert from 'node:assert/strict';
import {act,createState,normalize,recoverSave,SAVE_SCHEMA} from './assets/garden/engine.mjs';
import {todoView} from './assets/garden/productivity.mjs';

const now=new Date(2026,9,25,12).getTime();
const note={type:'note',noteId:'note-lecture-1',title:'线性代数 · 特征值'};
const notice={type:'notice',url:'https://jwb.szu.edu.cn/info/1011/1234.htm',title:'关于学术讲座报名的通知'};
const add=(source,id='task')=>act(createState(now),{type:'todoAdd',id,text:'阅读并整理重点',date:'',source},now);
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name)}

check('note and notice todos retain a source snapshot through export, restore and recovery',()=>{
 for(const source of [note,notice]){
  const input=structuredClone(source),state=add(input);
  input.title='标题后来已修改';
  assert.deepEqual(state.todos[0].source,source);
  const restored=normalize(JSON.parse(JSON.stringify(state)),now);
  assert.deepEqual(restored.todos[0].source,source);
  assert.deepEqual(recoverSave(JSON.parse(JSON.stringify(state)),now).todos[0].source,source);
  assert.equal(restored.todos[0].date,'','the source does not invent a deadline');
 }
});

check('editing, completing and archiving preserve the original source independently of task text',()=>{
 let state=add(note);
 for(const action of [{type:'todoEdit',text:'重新整理这一章',date:'2026-10-28'},{type:'todoToggle'},{type:'todoArchive'},{type:'todoArchive',archived:false},{type:'todoToggle'}]){
  state=act(state,{...action,id:'task'},now);
  assert.deepEqual(state.todos[0].source,note);
 }
 assert.equal(state.todos[0].text,'重新整理这一章');
});

check('unsupported or unsafe source metadata is dropped while the todo itself survives',()=>{
 const badSources=[null,[],{type:'unknown'},
  {type:'note',noteId:''},{type:'note',noteId:'   '},{type:'note',noteId:42},
  ...['javascript:alert(1)','data:text/html,test','https://evil.example/notice',
   'https://szu.edu.cn.evil.example/a','https://notszu.edu.cn/a',
   'https://user:secret@jwb.szu.edu.cn/a','https://jwb.szu.edu.cn:8443/a',
   'https://jwb.szu.edu.cn/a#javascript:alert(1)','http://127.0.0.1/a'].map(url=>({type:'notice',url,title:'通知'}))];
 for(const source of badSources){
  assert.equal(add(source).todos[0].source,undefined,JSON.stringify(source));
  const state=add(undefined);state.todos[0].source=source;
  const restored=normalize(state,now);
  assert.equal(restored.todos.length,1);assert.equal(restored.todos[0].source,undefined);
 }
});

check('school URLs are canonicalized, source fields are whitelisted and note identifiers stay exact',()=>{
 const state=add({...notice,url:'HTTPS://JWB.SZU.EDU.CN:443/info/1.htm?q=1&y=2',secret:'not retained'});
 assert.deepEqual(state.todos[0].source,{...notice,url:'https://jwb.szu.edu.cn/info/1.htm?q=1&y=2'});
 assert.deepEqual(add({...note,noteId:'导入笔记 "1"',extra:'unused'}).todos[0].source,{...note,noteId:'导入笔记 "1"'});
 assert.equal(add({...notice,url:'http://szu.edu.cn:80/notice'}).todos[0].source.url,'http://szu.edu.cn/notice');
});

check('legacy todos remain unchanged when a schema 3 save upgrades',()=>{
 const state=add(undefined),original=structuredClone(state.todos);state.schema=3;
 const restored=normalize(state,now);
 assert.equal(restored.schema,SAVE_SCHEMA);assert.deepEqual(restored.todos,original);
 assert.equal(Object.hasOwn(restored.todos[0],'source'),false);
});

check('source links render in every todo category with escaped titles and no unsafe navigation',()=>{
 let state=add({...note,title:'<img src=x> "笔记"'});
 let html=todoView(state,'open',now);
 assert.match(html,/data-action="todoSource" data-id="task"/);
 assert.match(html,/返回笔记/);assert.match(html,/&lt;img src=x&gt; &quot;笔记&quot;/);assert.doesNotMatch(html,/<img/);
 state=act(state,{type:'todoToggle',id:'task'},now);
 assert.match(todoView(state,'done',now),/返回笔记/);
 state=act(state,{type:'todoArchive',id:'task'},now);
 assert.match(todoView(state,'archive',now),/返回笔记/);
 html=todoView(add(notice),'open',now);
 assert.match(html,/href="https:\/\/jwb\.szu\.edu\.cn\/info\/1011\/1234\.htm"/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert.match(html,/查看公告原文/);assert.match(html,/关于学术讲座报名的通知/);
 const malformed=add(undefined);malformed.todos[0].source={type:'notice',url:'javascript:alert(1)',title:'unsafe'};
 assert.doesNotMatch(todoView(malformed,'open',now),/javascript:|查看公告原文/);
});

console.log(`${checks} todo source checks passed`);
