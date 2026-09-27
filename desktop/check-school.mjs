import assert from 'node:assert/strict';
import {createSchoolUI,timetableHTML,undergradTimetableHTML} from './assets/garden/school.mjs';
import {createSchoolWindowUI} from './assets/garden/school-window.mjs';
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:'',disabled:false,reset(){this.value=''}});return nodes.get(id)};
globalThis.document={getElementById:node,querySelector:node};
const sample={entries:[{name:'<img src=x>',day:2,start:3,end:4,weeks:'1–16周（单）',room:'测试教室'}],unscheduled:[{name:'待排课程'}],term:'测试学期',fetched_at:'2026-09-20T00:00:00Z'};
let fail=false,calls=[],count=0;
const ui=createSchoolUI({toast(){},api:async(path,data,method)=>{calls.push({path,method});if(path.endsWith('/session'))return {authenticated:method!=='DELETE'};if(path.endsWith('/challenge'))return {challenge:'fake',image:'/api/academic/captcha?id=fake'};if(path.endsWith('/login'))return {authenticated:true};if(fail)throw Object.assign(Error('登录状态已失效'),{code:401});return sample}});
async function check(name,f){await f();count++;console.log('PASS',name)}
await check('official periods, weeks and unarranged courses are preserved and escaped',()=>{
 const text=timetableHTML(sample);assert.match(text,/&lt;img src=x&gt;/);assert.doesNotMatch(text,/<img src=x>/);assert.match(text,/第 3–4 节/);assert.match(text,/1–16周（单）/);assert.match(text,/待排课程/);
});
await check('login and timetable are two separate cards',()=>{
 const L=ui.loginCard(),T=ui.timetableCard('graduate'),U=ui.timetableCard('undergrad');
 // 登录卡只放认证：学号/密码/验证码/清除登录
 for(const need of [/学号/,/教务密码/,/school-captcha/,/清除本次登录/])assert.match(L,need);
 // 课表卡只放读取与展示，不再混进密码框
 assert.doesNotMatch(L,/读取我的课表/);assert.doesNotMatch(L,/id="school-timetable"/);
 assert.match(T,/读取我的课表/);assert.match(T,/id="school-timetable"/);assert.match(T,/研究生 · 本学期课表/);
 assert.doesNotMatch(T,/id="undergrad-timetable"|data-action="school-undergrad"/);
 assert.match(U,/读取本科个人课表/);assert.match(U,/id="undergrad-timetable"/);assert.match(U,/本科 · 本学期课表/);
 assert.doesNotMatch(U,/id="school-timetable"|data-action="school-read"/);
 assert.equal(ui.timetableCard(),U,'默认本科分区不混入研究生读取按钮');
 assert.doesNotMatch(T,/教务密码/);assert.doesNotMatch(T,/清除本次登录/);
});
await check('official empty timetable is distinct from not queried',()=>{
 assert.match(timetableHTML(null),/登录后点击/);assert.match(timetableHTML({...sample,entries:[],unscheduled:[]}),/学校当前学期没有返回已排定/);
});
await check('relogin clears previously displayed personal schedule',async()=>{
 await ui.load();await ui.click('school-read');assert.match(node('school-timetable').innerHTML,/&lt;img/);
 await ui.click('school-challenge');assert.doesNotMatch(node('school-timetable').innerHTML,/&lt;img/);assert.equal(node('#school-login-form button[type=submit]').disabled,false);
});
await check('login clears password and consumes the image challenge',async()=>{
 const values={username:'test-only',password:'fake-password',captcha:'0000'};node('school-password').value=values.password;
 await ui.submit({id:'school-login-form',reset(){}},values);assert.equal(values.password,'');assert.equal(node('school-password').value,'');assert.equal(node('#school-login-form button[type=submit]').disabled,true);assert.equal(node('[data-action="school-read"]').disabled,false);
});
await check('expired session removes old schedule and disables read',async()=>{
 await ui.click('school-read');fail=true;await ui.click('school-read');assert.match(node('school-status').innerHTML,/已失效/);assert.doesNotMatch(node('school-timetable').innerHTML,/&lt;img/);assert.equal(node('[data-action="school-read"]').disabled,true);
});
await check('undergraduate personal timetable preserves and escapes source text',()=>{
 const html=undergradTimetableHTML({term:'2026-2027-1',fetched_at:sample.fetched_at,courses:[{name:'<script>',arrangement:'周一 3-4节\n<img src=x>',teacher:'老师'}]});
 assert.match(html,/&lt;script&gt;/);assert.match(html,/周一 3-4节/);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<script>|<img/);
});
await check('installed graduate view exposes query failures without a login card or a false empty schedule',async()=>{
 const beforeDocument=globalThis.document;globalThis.szuDesktop={openSchool(){}};
 const visible=new Map(['school-query-status','school-timetable','school-timetable-hint'].map(id=>[id,{innerHTML:'',textContent:''}]));
 globalThis.document={getElementById:id=>visible.get(id)||null,querySelector:()=>null};
 try{
  const installed=createSchoolUI({toast(){},api:async path=>{if(path.endsWith('/session'))return {authenticated:true};throw Error('学校连接超时 <request>')}});
  assert.equal(installed.loginCard(),'');await installed.load();await installed.click('school-read');
  assert.match(visible.get('school-query-status').innerHTML,/学校连接超时 &lt;request&gt;/);
  assert.equal(visible.get('school-timetable').innerHTML,'');assert.match(installed.timetableCard('graduate'),/id="school-query-status"/);
  assert.doesNotMatch(installed.timetableCard('graduate'),/学校当前学期没有返回|登录后点击「读取我的课表」/);
 }finally{globalThis.document=beforeDocument;delete globalThis.szuDesktop}
});

await check('undergraduate query shows pending, prevents duplicate reads and recovers after an error',async()=>{
 let finish,reject,requests=0;
 const undergraduate=createSchoolUI({toast(){},api:()=>{requests++;return new Promise((resolve,fail)=>{finish=resolve;reject=fail})}});
 const first=undergraduate.click('school-undergrad');
 assert.match(node('undergrad-timetable').innerHTML,/正在读取学校本科课表/);
 assert.doesNotMatch(node('undergrad-timetable').innerHTML,/尚未读取/);
 assert.equal(node('[data-action="school-undergrad"]').disabled,true);
 await undergraduate.click('school-undergrad');assert.equal(requests,1);
 reject(Error('读取超时，请重试'));await first;
 assert.match(node('undergrad-timetable').innerHTML,/读取超时，请重试/);
 assert.equal(node('[data-action="school-undergrad"]').disabled,false);
 const retry=undergraduate.click('school-undergrad');
 finish({term:'测试学期',fetched_at:sample.fetched_at,courses:[]});await retry;
 assert.match(node('undergrad-timetable').innerHTML,/学校该学期返回空课表/);
 assert.doesNotMatch(node('undergrad-timetable').innerHTML,/读取超时|正在读取/);
});
await check('official login and session import follow the displayed academic page',async()=>{
 const previousDocument=globalThis.document,previousDesktop=globalThis.szuDesktop;
 const actions=[],status={textContent:'',classList:{toggle(){}}};
 globalThis.document={getElementById:id=>id==='official-status'?status:null,querySelectorAll:()=>[]};
 globalThis.szuDesktop={openSchool:async target=>actions.push(['open',target]),syncSchool:async target=>{actions.push(['sync',target]);return {message:'测试登录状态'}},clearSchool:async()=>({message:'已清除'})};
 try{
  let sessionChanges=0;const officialUI=createSchoolWindowUI({onSessionChanged:async()=>{sessionChanges++}});
  for(const [target,label] of [['undergrad','本科课表'],['graduate','研究生课表'],['undergrad-scores','本科成绩'],['graduate-scores','研究生成绩']]){
   const html=officialUI.card(false,target);
   assert.match(html,new RegExp(label));assert.doesNotMatch(html,/official-business|<select/);
   await officialUI.click('official-open');assert.deepEqual(actions.at(-1),['open',target]);
   await officialUI.click('official-sync');assert.deepEqual(actions.at(-1),['sync',target]);
  }
  assert.equal(sessionChanges,4);
  assert.doesNotMatch(officialUI.card(false,'undergrad'),/测试登录状态/,'switching academic pages clears the previous business status');
  officialUI.card(true);await officialUI.click('official-booking');assert.deepEqual(actions.at(-1),['open','booking']);
  await officialUI.click('official-clear');assert.equal(sessionChanges,5);
 }finally{globalThis.document=previousDocument;if(previousDesktop===undefined)delete globalThis.szuDesktop;else globalThis.szuDesktop=previousDesktop}
});
console.log(`${count} school checks passed`);
