import assert from 'node:assert/strict';
import {createSportUI} from './assets/garden/sport.mjs';

const projects=[
 {id:'badminton',name:'羽毛球',campus:'1',kind:'1.0'},
 {id:'basketball',name:'篮球',campus:'1',kind:'2.0'},
 {id:'fitness',name:'健身',campus:'2',kind:'2.0'},
];
const originalDocument=globalThis.document;
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail});return {promise,resolve,reject}};
const responseFor=url=>({room:{id:new URL(url,'http://fixture').searchParams.get('room')},date:new URL(url,'http://fixture').searchParams.get('date'),slots:[{index:0,start:'09:00',end:'10:00',free:true}]});

function fixture(onRequest=()=>undefined){
 const fields=new Map(),buttons=new Map(),calls=[];let html='';
 function readControls(value){
  // Replacing select markup selects the marked option, or its first option.
  for(const [,attrs,id,body] of value.matchAll(/<select\b([^>]*id="([^"]+)"[^>]*)>([\s\S]*?)<\/select>/g)){
   const options=[...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([,attrs])=>({value:attrs.match(/\bvalue="([^"]*)"/)?.[1]||'',selected:/\bselected\b/.test(attrs)}));
   fields.set(id,{id,value:(options.find(x=>x.selected)||options[0])?.value||'',options,disabled:/\bdisabled\b/.test(attrs)});
  }
  for(const [,attrs] of value.matchAll(/<input\b([^>]*)>/g)){
   const id=attrs.match(/\bid="([^"]*)"/)?.[1];
   if(id)fields.set(id,{id,value:attrs.match(/\bvalue="([^"]*)"/)?.[1]||'',checked:/\bchecked\b/.test(attrs),disabled:/\bdisabled\b/.test(attrs)});
  }
  for(const [,attrs] of value.matchAll(/<button\b([^>]*)>/g)){
   const action=attrs.match(/\bdata-action="([^"]*)"/)?.[1];
   if(action)buttons.set(action,{action,disabled:/\bdisabled\b/.test(attrs),dataset:{index:attrs.match(/\bdata-index="([^"]*)"/)?.[1]}});
  }
 }
 const panel={get innerHTML(){return html},set innerHTML(value){html=value;fields.clear();buttons.clear();readControls(value)}};
 function region(id){return {set innerHTML(value){
  const opening=new RegExp('<div\\b[^>]*id="'+id+'"[^>]*>').exec(html);assert.ok(opening,id);
  const start=opening.index+opening[0].length,tags=/<div\b[^>]*>|<\/div>/g;tags.lastIndex=start;
  let depth=1,end=start;for(let tag;(tag=tags.exec(html));){depth+=tag[0].startsWith('</')?-1:1;if(!depth){end=tag.index;break}}
  const previous=html.slice(start,end);
  for(const [,action] of previous.matchAll(/\bdata-action="([^"]*)"/g))buttons.delete(action);
  for(const [,field] of previous.matchAll(/\bid="([^"]*)"/g))fields.delete(field);
  html=html.slice(0,start)+value+html.slice(end);readControls(value);
 }}}
 globalThis.document={getElementById:id=>id==='sport-panel'?panel:fields.get(id)||(html.includes(`id="${id}"`)?region(id):null),querySelector:selector=>buttons.get(selector.match(/data-action="([^"]*)"/)?.[1])||null,querySelectorAll:selector=>[...buttons.values()].filter(button=>button.action===selector.match(/data-action="([^"]*)"/)?.[1])};
 const ui=createSportUI({toast:()=>{},api:async(url,body,method)=>{
  calls.push({url,body,method});
  const override=onRequest(url,body,method);if(override!==undefined)return override;
  if(url==='/api/sport/venues')return {rooms:projects};
  if(url.startsWith('/api/sport/times?'))return responseFor(url);
  if(url==='/api/sport/prepare')return {token:'fixture-confirmation',date:body.date,time:body.start+'–'+body.end};
  if(url==='/api/sport/commit')return {ok:true,message:'fixture completed'};
  assert.fail('unexpected fixture call: '+url);
 }});
 panel.innerHTML=ui.section();
 function change(id,value){const input=fields.get(id);assert.ok(input,id);if(id==='sport-agree')input.checked=value;else input.value=value;return ui.change({target:input})}
 return {ui,calls,panel,fields,buttons,change,html:()=>html};
}

async function queried(f){
 await f.ui.click('sport-venues');
 f.change('sport-room','basketball');f.change('sport-date','2026-10-28');
 await f.ui.click('sport-times');
}
async function selectSlot(f,accept=true){await f.ui.click('sport-pick',{dataset:{index:'0'}});if(accept)f.change('sport-agree',true)}

let passed=0,failed=0;
async function check(name,work){try{await work();passed++;console.log('PASS',name)}catch(error){failed++;console.error('FAIL',name+'\n '+error.message)}}
try{
 await check('another project and date survive querying, slot selection, and refreshing projects',async()=>{
  const f=fixture();await queried(f);
  assert.equal(f.fields.get('sport-room').options.length,3);
  assert.match(f.calls.at(-1).url,/room=basketball&date=2026-10-28/);
  assert.equal(f.fields.get('sport-room').value,'basketball');
  assert.equal(f.fields.get('sport-date').value,'2026-10-28');
  await selectSlot(f);assert.equal(f.fields.get('sport-room').value,'basketball');
  await f.ui.click('sport-venues');assert.equal(f.fields.get('sport-room').value,'basketball');
 });
 await check('changing project or date removes previous slots and confirmation',async()=>{
  for(const [id,value] of [['sport-room','fitness'],['sport-date','2026-10-29']]){
   const f=fixture();await queried(f);await selectSlot(f);await f.ui.click('sport-prepare');
   assert.match(f.html(),/data-action="sport-commit"/);
   const control=f.fields.get(id);assert.equal(f.change(id,value),true);
   assert.equal(f.fields.get(id),control,'changing conditions keeps the original control in place');
   assert.doesNotMatch(f.html(),/data-action="sport-pick"|data-action="sport-commit"/);
   const count=f.calls.length;await f.ui.click('sport-prepare');await f.ui.click('sport-commit');
   assert.equal(f.calls.length,count,'old selection cannot prepare or submit');
  }
 });
 await check('a delayed query cannot restore slots for a previous selection or clear a newer request',async()=>{
  const old=deferred(),fresh=deferred();let queryCount=0;
  const f=fixture(url=>url.startsWith('/api/sport/times?')?(++queryCount===1?old.promise:fresh.promise):undefined);
  await f.ui.click('sport-venues');f.change('sport-room','basketball');f.change('sport-date','2026-10-28');
  const first=f.ui.click('sport-times');
  f.change('sport-room','fitness');const second=f.ui.click('sport-times');
  old.resolve(responseFor('/api/sport/times?room=basketball&date=2026-10-28'));await first;
  assert.doesNotMatch(f.html(),/data-action="sport-pick"/);
  assert.equal(f.fields.get('sport-room').value,'fitness');
  assert.match(f.html(),/正在读取时段/,'old completion must not finish the newer request');
  fresh.resolve(responseFor('/api/sport/times?room=fitness&date=2026-10-28'));await second;
  assert.match(f.html(),/data-action="sport-pick"/);
  assert.equal(f.fields.get('sport-room').value,'fitness');
 });
 await check('prepare and the post-confirmation refresh keep the queried project and date',async()=>{
  const f=fixture();await queried(f);await selectSlot(f);
  await f.ui.click('sport-prepare');
  assert.equal(f.calls.at(-1).body.room_id,'basketball');
  assert.equal(f.calls.at(-1).body.date,'2026-10-28');
  await f.ui.click('sport-commit');
  assert.deepEqual(f.calls.find(x=>x.url==='/api/sport/commit').body,{token:'fixture-confirmation'});
  assert.equal(f.calls.at(-1).url,'/api/sport/times?room=basketball&date=2026-10-28');
  assert.equal(f.fields.get('sport-room').value,'basketball');
 });
 await check('a delayed prepare cannot restore confirmation after changing its date',async()=>{
  const pending=deferred();const f=fixture(url=>url==='/api/sport/prepare'?pending.promise:undefined);
  await queried(f);await selectSlot(f);const request=f.ui.click('sport-prepare');
  f.change('sport-date','2026-10-29');pending.resolve({token:'stale-fixture',time:'09:00–10:00'});await request;
  assert.doesNotMatch(f.html(),/data-action="sport-commit"|data-action="sport-pick"/);
  const count=f.calls.length;await f.ui.click('sport-commit');assert.equal(f.calls.length,count);
 });
 await check('an in-flight submission locks its conditions and preserves success or failure',async()=>{
  for(const outcome of ['success','failure']){
   const pending=deferred();const f=fixture(url=>url==='/api/sport/commit'?pending.promise:undefined);
   await queried(f);await selectSlot(f);await f.ui.click('sport-prepare');const request=f.ui.click('sport-commit');
   assert.equal(f.fields.get('sport-room').disabled,true);assert.equal(f.fields.get('sport-date').disabled,true);
   f.change('sport-room','fitness');f.change('sport-date','2026-10-29');f.change('sport-agree',false);
   assert.equal(f.fields.get('sport-room').value,'basketball');assert.equal(f.fields.get('sport-date').value,'2026-10-28');
   assert.equal(f.fields.get('sport-agree').checked,true);
   await f.ui.click('sport-times');assert.equal(f.calls.at(-1).url,'/api/sport/commit');
   if(outcome==='success')pending.resolve({ok:true,message:'submission accepted'});else pending.reject(Error('submission result unknown'));
   await request;assert.match(f.html(),outcome==='success'?/submission accepted/:/submission result unknown/);
   assert.equal(f.fields.get('sport-room').disabled,false);assert.equal(f.fields.get('sport-date').disabled,false);
   if(outcome==='success')assert.equal(f.calls.at(-1).url,'/api/sport/times?room=basketball&date=2026-10-28');
  }
 });
 await check('agreement enables prepare immediately without replacing the inputs or button',async()=>{
  const f=fixture();await queried(f);await selectSlot(f,false);
  const agreement=f.fields.get('sport-agree'),button=f.buttons.get('sport-prepare');
  assert.equal(button.disabled,true);const count=f.calls.length;await f.ui.click('sport-prepare');assert.equal(f.calls.length,count);
  f.change('sport-agree',true);assert.equal(button.disabled,false);
  assert.equal(f.fields.get('sport-agree'),agreement);assert.equal(f.buttons.get('sport-prepare'),button);
  f.change('sport-agree',false);assert.equal(button.disabled,true);
 });
 await check('editing a phone leaves the query status in place before and after preparation',async()=>{
  // Real Chromium lost a checkbox click when phone blur removed the status above
  // it. Keep that rendered status unchanged; browser acceptance checks geometry.
  for(const prepared of [false,true]){
   const f=fixture();await queried(f);await selectSlot(f);
   if(prepared)await f.ui.click('sport-prepare');
   const before=f.html().match(/<div id="sport-status">([\s\S]*?)<\/div>/)?.[1];
   assert.match(before,/读到 1 格时段/,'preparation status belongs below the booking controls');
   f.change('sport-phone','13800000000');
   const after=f.html().match(/<div id="sport-status">([\s\S]*?)<\/div>/)?.[1];
   assert.equal(after,before,'phone blur must not collapse the query status above the checkbox');
   assert.doesNotMatch(f.html(),/data-action="sport-commit"/);
  }
 });
 await check('editing booking details invalidates both an existing and an arriving confirmation',async()=>{
  for(const [id,value] of [['sport-phone','13800000000'],['sport-kind','1'],['sport-agree',false]]){
   for(const delayed of [false,true]){
    const pending=deferred();const f=fixture(url=>delayed&&url==='/api/sport/prepare'?pending.promise:undefined);
    await queried(f);await selectSlot(f);const request=f.ui.click('sport-prepare');if(!delayed)await request;
    const field=f.fields.get(id),button=f.buttons.get('sport-prepare');f.change(id,value);
    assert.equal(f.fields.get(id),field);assert.equal(f.buttons.get('sport-prepare'),button);
    if(delayed){pending.resolve({token:'obsolete-details',time:'09:00–10:00'});await request}
    assert.doesNotMatch(f.html(),/data-action="sport-commit"/);
    const count=f.calls.length;await f.ui.click('sport-commit');assert.equal(f.calls.length,count);
   }
  }
 });
 await check('sports heading does not limit the school project list',()=>{
  assert.doesNotMatch(fixture().html(),/羽毛球|篮球|挥拍/);
 });
 await check('a cleared date is rejected without requesting school data',async()=>{
  const f=fixture();await queried(f);f.change('sport-date','');
  const count=f.calls.length;await f.ui.click('sport-times');
  assert.equal(f.calls.length,count);assert.match(f.html(),/请选择日期/);
 });
 await check('same-value change events do not discard the current slots',async()=>{
  const f=fixture();await queried(f);
  f.change('sport-room','basketball');f.change('sport-date','2026-10-28');
  assert.match(f.html(),/data-action="sport-pick"/);
 });
}finally{globalThis.document=originalDocument}
console.log(`${passed} sports checks passed; ${failed} failed`);
if(failed)process.exitCode=1;
