import assert from 'node:assert/strict';
import {createAcademicCatalogUI} from './assets/garden/academic-catalog.mjs';

// Only synthetic data: these checks do not authenticate to a school service.
const panel={innerHTML:''};
globalThis.document={getElementById:id=>id==='academic-catalog-panel'?panel:null};
const stamp={source_url:'https://ehall.szu.edu.cn/jwapp/sys/kcbcx/*default/index.do',fetched_at:'2026-10-24T02:00:00Z'};
const range={page:1,page_size:2,returned:1,total:3,complete:false,has_next:true,note:'本页是查询结果的一部分。'};
const classList={...stamp,term:'2026-2027-1',page:1,page_size:2,total:3,range,items:[{code:'test-class',name:'合成测试班',grade:'2026',department:'测试学院',major:'测试专业'}]};
const planList={...stamp,page:1,page_size:2,total:null,range:{...range,total:null,note:'学校未提供总数；不能确认已取全。'},items:[{code:'test-plan',title:'合成测试方案',minimum_credits:150,degree:'学士'}]};
let checks=0;
async function test(name,fn){await fn();console.log('PASS',name);checks++}
const edit=(ui,field,value)=>ui.change({target:{id:'academic-catalog-'+field,value}});

await test('both new catalog businesses retain the real-account acceptance warning',async()=>{
 const ui=createAcademicCatalogUI({api:async()=>planList});
 for(const mode of ['timetable','program'])assert.match(ui.section(mode),/还没用真实账号验收过/);
 ui.section('program');await ui.click('academic-catalog-query');
 assert.match(ui.section('program'),/还没用真实账号验收过/);
});

await test('unread views contain no fabricated results and retain official entry',async()=>{
 const ui=createAcademicCatalogUI({api:async()=>{throw Error('must not run on render')}});
 const html=ui.section('timetable');
 assert.match(html,/全校课表/);assert.match(html,/尚未查询/);assert.match(html,/ehall\.szu\.edu\.cn/);
 assert.doesNotMatch(html,/合成测试班|找到 0/);
 assert.match(ui.section('program'),/培养方案/);
});

await test('query uses entered filters and paginates without losing them',async()=>{
 const calls=[];
 const ui=createAcademicCatalogUI({api:async url=>{calls.push(url);return {...classList,page:new URL(url,'http://local').searchParams.get('page')==='2'?2:1}}});
 ui.section('timetable');edit(ui,'term','2026-2027-1');edit(ui,'query','合成');edit(ui,'grade','2026级');edit(ui,'department','测试学院');edit(ui,'major','测试专业');
 await ui.click('academic-catalog-query');
 assert.match(ui.section('timetable'),/合成测试班/);assert.match(ui.section('timetable'),/本页.*1.*学校总数.*3/);
 await ui.click('academic-catalog-next');
 const query=new URL(calls.at(-1),'http://local').searchParams;
 assert.equal(query.get('page'),'2');assert.equal(query.get('q'),'合成');assert.equal(query.get('term'),'2026-2027-1');assert.equal(query.get('grade'),'2026级');
});

await test('official session sync loads real school term parameters then classes',async()=>{
 const nativeCalls=[],apiCalls=[];
 globalThis.szuDesktop={openSchool:async target=>nativeCalls.push(['open',target]),syncSchool:async target=>{nativeCalls.push(['sync',target]);return {message:'业务验证成功'}}};
 const ui=createAcademicCatalogUI({api:async url=>{apiCalls.push(url);return url.endsWith('/terms')?{...stamp,items:[{id:'2026-2027-1',name:'学校提供学期'}],range:{note:'不是全部历史学期'}}:classList}});
 ui.section('timetable');await ui.click('academic-catalog-open');await ui.click('academic-catalog-sync');
 assert.deepEqual(nativeCalls,[['open','catalog-timetable'],['sync','catalog-timetable']]);
 assert.equal(apiCalls[0],'/api/academic/catalog/terms');assert.match(apiCalls[1],/term=2026-2027-1/);
 assert.match(ui.section('timetable'),/学校提供学期/);assert.match(ui.section('timetable'),/合成测试班/);
});

await test('selected class displays four distinct course kinds and provenance',async()=>{
 const ui=createAcademicCatalogUI({api:async url=>url.includes('/timetable?')?{...stamp,term:'2026-2027-1',class:classList.items[0],range:{note:'学校返回范围'},ranges:{scheduled:{note:'总数未确认'}},scheduled:[{name:'测试排课',weeks:'1-8周',weekday:2,start_section:3,end_section:4,location:'测试教室',teacher:'测试教师'}],adjustments:[{name:'测试调课'}],practicals:[{name:'测试实践课'}],unarranged:[{name:'测试未排课'}]}:classList});
 ui.section('timetable');edit(ui,'term','2026-2027-1');await ui.click('academic-catalog-query');
 await ui.click('academic-catalog-detail',{dataset:{code:'test-class'}});
 const html=ui.section('timetable');
 for(const text of ['测试排课','测试调课','测试实践课','测试未排课','1-8周','测试教室','学校返回范围','总数未确认'])assert.ok(html.includes(text),text);
 assert.match(html,/读取时间/);
});

await test('program detail shows school requirements, modules and every course',async()=>{
 const ui=createAcademicCatalogUI({api:async url=>url.includes('/program?')?{...stamp,summary:planList.items[0],detail:{objectives:'测试培养目标',requirements:'测试毕业要求',notes:[]},range:{note:'培养方案不是个人已修学分'},ranges:{modules:{note:'模块全量'},courses:{note:'课程全量'}},modules:[{code:'test-module',name:'测试模块',required_credits:10}],courses:[{module_code:'test-module',code:'test-course',name:'测试课程',credits:2,core:true},{module_code:'other-module',code:'test-other',name:'测试其他课程',credits:3}]}:planList});
 ui.section('program');await ui.click('academic-catalog-query');await ui.click('academic-catalog-detail',{dataset:{code:'test-plan'}});
 const html=ui.section('program');for(const text of ['测试培养目标','测试毕业要求','测试模块','测试课程','测试其他课程','主干','个人已修学分'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/剩余学分|已经修满/);
});

await test('unknown total stays unknown and can query another page',async()=>{
 const calls=[];const ui=createAcademicCatalogUI({api:async url=>{calls.push(url);return planList}});
 ui.section('program');await ui.click('academic-catalog-query');
 assert.match(ui.section('program'),/总数未提供|未提供总数/);assert.doesNotMatch(ui.section('program'),/全部.*1.*方案/);
 await ui.click('academic-catalog-next');assert.match(calls.at(-1),/page=2/);
});

await test('upstream failure clears the old successful result and offers retry',async()=>{
 let fail=false;const ui=createAcademicCatalogUI({api:async()=>{if(fail)throw Error('当前账号没有该业务权限');return planList}});
 ui.section('program');await ui.click('academic-catalog-query');assert.match(ui.section('program'),/合成测试方案/);
 fail=true;await ui.click('academic-catalog-query');const html=ui.section('program');
 assert.match(html,/当前账号没有该业务权限/);assert.doesNotMatch(html,/合成测试方案/);assert.doesNotMatch(html,/正在查询/);
});

await test('reset during a pending read prevents stale school data from returning',async()=>{
 let resolve;const ui=createAcademicCatalogUI({api:()=>new Promise(done=>resolve=done)});
 ui.section('program');const pending=ui.click('academic-catalog-query');ui.reset();resolve(planList);await pending;
 assert.doesNotMatch(ui.section('program'),/合成测试方案/);assert.match(ui.section('program'),/尚未查询/);
});

await test('navigating to another catalog mode discards the previous pending response',async()=>{
 let resolve;const ui=createAcademicCatalogUI({api:()=>new Promise(done=>resolve=done)});
 ui.section('program');const pending=ui.click('academic-catalog-query');ui.section('timetable');resolve(planList);await pending;
 assert.doesNotMatch(ui.section('timetable'),/合成测试方案|正在查询/);
});

await test('remote titles and identifiers are escaped and unsafe source URLs never become links',async()=>{
 const ui=createAcademicCatalogUI({api:async()=>({...planList,source_url:'javascript:alert(1)',items:[{code:'\" onclick=\"evil',title:'<img src=x onerror=evil>'}]})});
 ui.section('program');await ui.click('academic-catalog-query');const html=ui.section('program');
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x|href="javascript:|data-code="" onclick=/);
});

await test('failed session replacement clears both catalog modes and notifies other school views',async()=>{
 let changes=0;
 globalThis.szuDesktop={openSchool:async()=>{},syncSchool:async()=>{throw Error('学校未接受本次登录')}};
 const ui=createAcademicCatalogUI({api:async()=>planList,onSessionChanged:async()=>{changes++}});
 ui.section('program');await ui.click('academic-catalog-query');
 ui.section('timetable');await ui.click('academic-catalog-sync');
 assert.equal(changes,1);assert.doesNotMatch(ui.section('program'),/合成测试方案/);
});

await test('unrelated form changes do not erase catalog results',async()=>{
 const ui=createAcademicCatalogUI({api:async()=>planList});ui.section('program');await ui.click('academic-catalog-query');
 assert.equal(ui.change({target:{id:'term',value:'elsewhere'}}),false);
 assert.match(ui.section('program'),/合成测试方案/);
});

await test('blur preserves the original query button and the first pointer click reaches the API',async()=>{
 const originalDocument=globalThis.document;
 let nodes={},html='',calls=[];
 // Any full-panel replacement recreates the form controls. This makes node
 // identity and the browser's blur-before-click ordering observable.
 const livePanel={get innerHTML(){return html},set innerHTML(value){
  html=value;
  nodes={input:{id:'academic-catalog-query',value:''},button:{},results:{textContent:''},status:{textContent:'',className:'',hidden:false}};
 }};
 const dom={activeElement:null,getElementById:id=>id==='academic-catalog-panel'?livePanel:id==='academic-catalog-results'?nodes.results:id==='academic-catalog-status'?nodes.status:null};
 globalThis.document=dom;
 try{
  const ui=createAcademicCatalogUI({api:async url=>{calls.push(url);return planList}});
  livePanel.innerHTML=ui.section('program');
  const originalInput=nodes.input,originalButton=nodes.button;
  dom.activeElement=originalInput;originalInput.value='中文方案';
  assert.equal(ui.input({target:originalInput,isComposing:true}),true);
  assert.equal(nodes.input,originalInput,'composition input replaced the active control');
  assert.equal(dom.activeElement,originalInput,'composition lost focus');
  assert.equal(originalInput.value,'中文方案','composition value was rewritten');
  ui.change({target:originalInput}); // Blur caused by pointerdown on the button.
  assert.equal(nodes.input,originalInput,'blur replaced the active input');
  assert.equal(nodes.button,originalButton,'blur replaced the pressed button');
  if(nodes.button===originalButton)await ui.click('academic-catalog-query',originalButton);
  assert.equal(calls.length,1,'first pointer click was swallowed');
  assert.equal(new URL(calls[0],'http://local').searchParams.get('q'),'中文方案');
 }finally{globalThis.document=originalDocument}
});

console.log(`${checks} academic catalog checks passed`);
