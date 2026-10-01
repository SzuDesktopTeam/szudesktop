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
 const formEvents={},events={},buttons=[{disabled:false},{disabled:false}],status={hidden:true,textContent:''},messages=[],writes=[];
 let server={revision:1,data:createState()},hold=false,release,fail=null;
 const gate=new Promise(resolve=>release=resolve);
 const form={querySelectorAll:()=>buttons,addEventListener:(type,fn)=>formEvents[type]=fn,removeEventListener:type=>delete formEvents[type]};
 const guide={open:false,returnValue:'',attrs:{},querySelector:()=>form,showModal(){this.open=true},addEventListener:(type,fn)=>events[type]=fn,removeEventListener:type=>delete events[type],setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},close(choice){this.returnValue=choice;this.open=false;void events.close()}};
 const context=vm.createContext({state:structuredClone(server.data),busy:false,revision:1,act,recordOnboarded,exitHint:()=>'',toast:m=>messages.push(m),$:selector=>selector==='#guide'?guide:selector==='#guide-save-status'?status:null,navigate(){},reactPet(){}});
 context.commit=createWorkspaceCommit({api:async(path,body)=>{if(!body)return structuredClone(server);if(fail)throw fail;if(body.revision!==server.revision)throw Object.assign(Error('revision conflict'),{code:409});writes.push(structuredClone(body));server={revision:server.revision+1,data:structuredClone(body.data)};const result={revision:server.revision};if(hold)await gate;return result},normalize,read:()=>({revision:context.revision}),setRevision:r=>context.revision=r,setState:data=>context.state=data,paint(){},byId(){}});
 context.run=async work=>{if(context.busy)return;context.busy=true;try{await work()}finally{context.busy=false}};
 vm.runInContext(code,context);
 return {context,guide,status,buttons,messages,writes,open:()=>context.showGuide(),submit:()=>formEvents.submit({preventDefault(){},submitter:{value:'ok'}}),cancel:()=>events.cancel({preventDefault(){}}),hold:()=>hold=true,release:()=>{hold=false;release()},fail:e=>fail=e,server:()=>server,updateExternal(){server.data.profile.name='合成另一窗口';server.revision++}};
}
const delayed=fixture();delayed.hold();delayed.open();delayed.submit();await tick();assert.equal(delayed.guide.open,true);assert.equal(delayed.context.busy,true);assert.ok(delayed.buttons.every(b=>b.disabled));assert.match(delayed.status.textContent,/正在收好/);assert.equal(delayed.writes.length,1);assert.equal(delayed.writes[0].data.preferences.onboarded,true);assert.ok(delayed.writes[0].data.game.journey.days.includes(delayed.writes[0].data.game.daily.day));delayed.submit();delayed.cancel();assert.equal(delayed.writes.length,1);delayed.release();await tick();assert.equal(delayed.guide.open,false);assert.equal(delayed.context.busy,false);assert.ok(delayed.buttons.every(b=>!b.disabled));await delayed.context.commit(act(delayed.context.state,{type:'pat'}));assert.ok(delayed.server().data.game.pets[0].lastPat>0);
const failed=fixture();failed.fail(Object.assign(Error('synthetic outage'),{code:500}));failed.open();failed.submit();await tick();assert.equal(failed.guide.open,true);assert.equal(failed.context.state.preferences.onboarded,false);assert.match(failed.status.textContent,/请稍后重试/);assert.match(failed.messages.at(-1),/synthetic outage/);assert.ok(failed.buttons.every(b=>!b.disabled));failed.fail(null);failed.cancel();await tick();assert.equal(failed.guide.open,false);assert.equal(failed.server().data.preferences.onboarded,true);
const other=fixture();other.hold();other.open();other.submit();await tick();other.updateExternal();other.release();await tick();await assert.rejects(other.context.commit(act(other.context.state,{type:'pat'})),/本次操作尚未保存/);assert.equal(other.context.state.profile.name,'合成另一窗口');assert.equal(other.server().data.profile.name,'合成另一窗口');assert.equal(other.server().data.game.pets[0].lastPat,0);await other.context.commit(act(other.context.state,{type:'pat'}));assert.ok(other.server().data.game.pets[0].lastPat>0);assert.equal(other.server().data.profile.name,'合成另一窗口');
console.log('Guide race checks passed: atomic visit, modal save gate, duplicate submit, failure/retry, Esc, delayed response and external409 preservation');
