import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {act,createState,normalize} from './assets/garden/engine.mjs';
import {createWorkspaceCommit} from './assets/garden/workspace-commit.mjs';

const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const section=(from,to)=>{const start=source.indexOf(from),end=source.indexOf(to,start);assert.ok(start>=0&&end>start,'notice retry callback must exist');return source.slice(start,end)};
const code=section('async function notebookLearningAction(','const desktopUI=')+'\n'+section('async function saveNoticeTodo(','const todoComposer=');
const action={type:'todoAdd',id:'notice-fixed-id',text:'报名讲座',date:'2026-10-29',source:{type:'notice',title:'讲座通知',url:'https://law.szu.edu.cn/info/100/101.htm'}};
const clone=value=>structuredClone(value);
function fixture(){
 let server={data:createState(),revision:1},loseReply=true,failure=null,writes=0;
 const context=vm.createContext({state:clone(server.data),revision:1,busy:false,act,paintCompanionDialog(){},clocks(){},reactPet(){}});
 context.commit=createWorkspaceCommit({normalize,read:()=>({revision:context.revision}),setRevision:r=>context.revision=r,setState:s=>context.state=s,paint(){},byId(){},api:async(_path,body)=>{
  if(failure)throw failure;if(!body)return clone(server);
  if(body.revision!==server.revision)throw Object.assign(Error('revision conflict'),{code:409});
  writes++;server={data:clone(body.data),revision:server.revision+1};
  if(loseReply){loseReply=false;throw Error('response connection lost')}
  return {revision:server.revision};
 }});
 vm.runInContext(code,context);
 return {save:value=>context.saveNoticeTodo(value),server:()=>server,local:()=>context.state,writes:()=>writes,fail:error=>failure=error};
}
{
 const h=fixture();await assert.rejects(h.save(action),/response connection lost/);
 assert.equal(h.server().data.todos.length,1);assert.equal(h.local().todos.length,0);
 await h.save(action);assert.equal(h.local().todos.length,1);assert.equal(h.writes(),1,'409 synchronization confirms the first save without a duplicate write');
 await h.save({...action,source:{url:action.source.url,title:action.source.title,type:'notice'}});assert.equal(h.writes(),1,'same fields with a different object order remain the same source');
}
for(const change of [{text:'改成另一件事'},{date:'2026-10-30'},{source:{...action.source,url:'https://law.szu.edu.cn/info/100/102.htm'}},{source:{...action.source,title:'另一个标题'}}]){
 const h=fixture();await assert.rejects(h.save(action));const edited={...clone(action),...change};
 await assert.rejects(h.save(edited),/已有.*记录|已保存/);await assert.rejects(h.save(edited),/学习书屋.*专注与小事.*编辑/);
 assert.equal(h.server().data.todos.length,1);assert.equal(h.server().data.todos[0].text,action.text);assert.equal(h.server().data.todos[0].date,action.date);assert.equal(h.server().data.todos[0].source.url,action.source.url);assert.equal(h.writes(),1,'a changed retry draft must not overwrite the saved task');
}
{
 const h=fixture(),error=Object.assign(Error('disk unavailable'),{code:500});h.fail(error);await assert.rejects(h.save(action),e=>e===error);assert.equal(h.writes(),0);assert.equal(h.local().todos.length,0);
}
console.log('PASS notice todo retries recognize an acknowledged record after response loss, preserve changed drafts and propagate unrelated failures');
