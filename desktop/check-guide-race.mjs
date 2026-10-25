import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createState,act,normalize} from './assets/garden/engine.mjs';
import {recordOnboarded} from './assets/garden/app-logic.mjs';
import {createWorkspaceCommit} from './assets/garden/workspace-commit.mjs';
const source=fs.readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function showGuide(){'),source.indexOf('function todoHTML(){'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const formEvents={},events={},buttons=Array.from({length:6},()=>({disabled:false})),status={hidden:true,textContent:''},messages=[],writes=[],routes=[],noteEvents=[];
 let server={revision:1,data:createState()},hold=false,release,fail=null,noteFail=null;
 const gate=new Promise(resolve=>release=resolve);
 const form={querySelectorAll:()=>buttons,addEventListener:(type,fn)=>formEvents[type]=fn,removeEventListener:type=>delete formEvents[type]};
 const guide={open:false,returnValue:'',attrs:{},querySelector:()=>form,showModal(){this.open=true},addEventListener:(type,fn)=>events[type]=fn,removeEventListener:type=>delete events[type],setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},close(choice){this.returnValue=choice;this.open=false;void events.close()}};
 const context=vm.createContext({state:structuredClone(server.data),busy:false,revision:1,act,recordOnboarded,exitHint:()=>'',toast:m=>messages.push(m),$:selector=>selector==='#guide'?guide:selector==='#guide-save-status'?status:null,navigate(...route){routes.push(route);noteEvents.push('navigate');return true},reactPet(){},notebookUI:{async startLecture(){noteEvents.push('startLecture');if(noteFail)throw noteFail},focusBody(){noteEvents.push('focusBody')}}});
 context.commit=createWorkspaceCommit({api:async(path,body)=>{if(!body)return structuredClone(server);if(fail)throw fail;if(body.revision!==server.revision)throw Object.assign(Error('revision conflict'),{code:409});writes.push(structuredClone(body));server={revision:server.revision+1,data:structuredClone(body.data)};const result={revision:server.revision};if(hold)await gate;return result},normalize,read:()=>({revision:context.revision}),setRevision:r=>context.revision=r,setState:data=>context.state=data,paint(){},byId(){}});
 context.run=async work=>{if(context.busy)return;context.busy=true;try{await work()}catch(e){messages.push(e.message)}finally{context.busy=false}};
 vm.runInContext(code,context);
 return {context,guide,status,buttons,messages,writes,routes,noteEvents,failNote:e=>noteFail=e,open:()=>context.showGuide(),submit:(choice='ok')=>formEvents.submit({preventDefault(){},submitter:{value:choice}}),cancel:()=>events.cancel({preventDefault(){}}),hold:()=>hold=true,release:()=>{hold=false;release()},fail:e=>fail=e,server:()=>server,updateExternal(){server.data.profile.name='合成另一窗口';server.revision++}};
}
const delayed=fixture();delayed.hold();delayed.open();delayed.submit();await tick();assert.equal(delayed.guide.open,true);assert.equal(delayed.context.busy,true);assert.ok(delayed.buttons.every(b=>b.disabled));assert.match(delayed.status.textContent,/正在收好/);assert.equal(delayed.writes.length,1);assert.equal(delayed.writes[0].data.preferences.onboarded,true);assert.ok(delayed.writes[0].data.game.journey.days.includes(delayed.writes[0].data.game.daily.day));delayed.submit();delayed.cancel();assert.equal(delayed.writes.length,1);delayed.release();await tick();assert.equal(delayed.guide.open,false);assert.equal(delayed.context.busy,false);assert.ok(delayed.buttons.every(b=>!b.disabled));await delayed.context.commit(act(delayed.context.state,{type:'pat'}));assert.ok(delayed.server().data.game.pets[0].lastPat>0);
const failed=fixture();failed.fail(Object.assign(Error('synthetic outage'),{code:500}));failed.open();failed.submit();await tick();assert.equal(failed.guide.open,true);assert.equal(failed.context.state.preferences.onboarded,false);assert.match(failed.status.textContent,/请稍后重试/);assert.match(failed.messages.at(-1),/synthetic outage/);assert.ok(failed.buttons.every(b=>!b.disabled));failed.fail(null);failed.cancel();await tick();assert.equal(failed.guide.open,false);assert.equal(failed.server().data.preferences.onboarded,true);
const other=fixture();other.hold();other.open();other.submit();await tick();other.updateExternal();other.release();await tick();await assert.rejects(other.context.commit(act(other.context.state,{type:'pat'})),/本次操作尚未保存/);assert.equal(other.context.state.profile.name,'合成另一窗口');assert.equal(other.server().data.profile.name,'合成另一窗口');assert.equal(other.server().data.game.pets[0].lastPat,0);await other.context.commit(act(other.context.state,{type:'pat'}));assert.ok(other.server().data.game.pets[0].lastPat>0);assert.equal(other.server().data.profile.name,'合成另一窗口');
for(const [choice,route] of [['notices',['services','notices']],['library',['services','library']],['garden',['garden','pet']],['notes',['study','notes']]]){
 const routed=fixture();routed.hold();routed.open();routed.submit(choice);await tick();
 assert.equal(routed.routes.length,0,'等待引导保存时不能跳走或创建笔记');assert.equal(routed.noteEvents.length,0);
 routed.submit(choice);assert.equal(routed.writes.length,1,'双击不能重复保存或开笔记');
 routed.release();await tick();assert.deepEqual(routed.routes,[route]);assert.equal(routed.server().data.preferences.onboarded,true);
 if(choice==='notes')assert.deepEqual(routed.noteEvents,['startLecture','navigate','focusBody']);
}
const intentFailure=fixture();intentFailure.fail(Object.assign(Error('synthetic save failure'),{code:500}));intentFailure.open();intentFailure.submit('notes');await tick();assert.equal(intentFailure.guide.open,true);assert.equal(intentFailure.noteEvents.length,0);assert.equal(intentFailure.routes.length,0);intentFailure.fail(null);intentFailure.submit('notes');await tick();assert.deepEqual(intentFailure.noteEvents,['startLecture','navigate','focusBody']);assert.deepEqual(intentFailure.routes,[['study','notes']]);
const noteFailure=fixture();noteFailure.failNote(Error('合成笔记保存失败'));noteFailure.open();noteFailure.submit('notes');await tick();assert.equal(noteFailure.guide.open,false);assert.equal(noteFailure.server().data.preferences.onboarded,true);assert.equal(noteFailure.routes.length,0,'笔记创建失败不能导航后伪装成新建成功');assert.match(noteFailure.messages.at(-1),/笔记保存失败/);assert.equal(noteFailure.context.busy,false);
console.log('Guide race checks passed: atomic visit, modal save gate, duplicate submit, failure/retry, Esc, delayed response, external409 preservation, intent routes and notebook failure');
