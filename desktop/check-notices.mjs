import assert from 'node:assert/strict';
import {createNoticesUI,matchCollege,staleNote} from './assets/garden/notices.mjs';
globalThis.document={getElementById:()=>({innerHTML:''})};
const sources=[{id:'undergrad',name:'教务部',url:'https://jwb.szu.edu.cn/index/jwtz.htm',group:'university',readable:true},{id:'college-fe',name:'教育学部',url:'https://fe.szu.edu.cn/xbzx/tzgg.htm',group:'college',readable:true},{id:'college-law',name:'法学院',url:'https://law.szu.edu.cn/xwjc/xygg.htm',group:'college',readable:true},{id:'college-csse',name:'计算机与软件学院',url:'https://csse.szu.edu.cn/',group:'college',readable:false,note:'暂未接入，请在学院官网查看。'}];
const response=id=>({source:sources.find(s=>s.id===id).name,items:[{title:id+' 公告 <script>',date:'2026-09-20',url:sources.find(s=>s.id===id).url}],fetched_at:'2026-09-20T12:00:00Z',stale:false});
let mode='normal',calls=[],pending=new Map(),count=0;
const ui=createNoticesUI({api:async path=>{calls.push(path);if(path.endsWith('/notice-sources'))return {sources};const id=new URL('http://localhost'+path).searchParams.get('source');if(mode==='defer')return new Promise(resolve=>pending.set(id,resolve));if(mode==='fail')throw Error('学校网站暂时无法读取');return response(id)}});
const choose=id=>ui.change({target:{id:'feed-source',value:id}});
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
async function check(name,f){await f();count++;console.log('PASS',name)}
await check('catalog groups university and college sources with their actual official links',async()=>{await ui.load();assert.match(ui.card(),/全校通知/);assert.match(ui.card(),/学院与学部/);assert.match(ui.card(),/计算机与软件学院 · 官网查看/)});
await check('choosing a college automatically reads its feed and escapes titles',async()=>{await choose('college-fe');assert.match(calls.at(-1),/source=college-fe/);assert.match(ui.card(),/教育学部 · 读取于/);assert.match(ui.card(),/&lt;script&gt;/);assert.match(ui.card(),/https:\/\/fe.szu.edu.cn\/xbzx\/tzgg.htm/)});
await check('unsupported college clears old notices and presents its official page without a fake read action',async()=>{const before=calls.length;await choose('college-csse');assert.equal(calls.length,before);assert.match(ui.card(),/打开学院官网/);assert.doesNotMatch(ui.card(),/教育学部 · 读取于|data-action="notice-read"/)});
await check('late response from a previous college never overwrites the selected feed',async()=>{mode='defer';await choose('college-fe');await choose('college-law');pending.get('college-law')(response('college-law'));await nextTurn();pending.get('college-fe')(response('college-fe'));await nextTurn();assert.match(ui.card(),/法学院 · 读取于/);assert.doesNotMatch(ui.card(),/教育学部 · 读取于/);mode='normal'});
await check('failed college change cannot keep a previous college feed under the new heading',async()=>{mode='fail';await choose('college-fe');assert.match(ui.card(),/学校网站暂时无法读取/);assert.doesNotMatch(ui.card(),/法学院 · 读取于/)});
await check('saved source restores on a new UI instance and changes persist',async()=>{
 let preferred='college-law';const config={api:async path=>path.endsWith('/notice-sources')?{sources}:response(preferred),getSource:()=>preferred,setSource:async value=>{preferred=value}};
 const first=createNoticesUI(config);await first.load();assert.match(first.card(),/value="college-law" selected/);
 await first.change({target:{id:'feed-source',value:'college-fe'}});assert.equal(preferred,'college-fe');
 const reopened=createNoticesUI(config);await reopened.load();assert.match(reopened.card(),/value="college-fe" selected/);
 // O15：存过的来源已被移除时，不再悄悄换成教务部，而是请同学重新选。
 preferred='removed-college';const removed=createNoticesUI(config);await removed.load();assert.match(removed.card(),/先选你的学院/);assert.match(removed.card(),/<option value="" selected disabled>/);
});
await check('preference write failure stays visible while the selected feed remains usable',async()=>{
 const failed=createNoticesUI({api:async path=>path.endsWith('/notice-sources')?{sources}:response('college-law'),setSource:async()=>{throw Error('save failed')}});await failed.load();await failed.change({target:{id:'feed-source',value:'college-law'}});assert.match(failed.card(),/学院选择未能保存/);assert.match(failed.card(),/法学院 · 读取于/);
});
await check('source changes await preference saving but release the caller before the school responds',async()=>{
 let saveFinished,feedFinished,returned=false,savedSource='undergrad';
 const isolated=createNoticesUI({api:path=>path.endsWith('/notice-sources')?Promise.resolve({sources}):new Promise(resolve=>{feedFinished=resolve}),setSource:value=>new Promise(resolve=>{saveFinished=()=>{savedSource=value;resolve()}})});
 await isolated.load();
 const change=isolated.change({target:{id:'feed-source',value:'college-law'}}).then(value=>{returned=true;return value});
 await nextTurn();
 assert.equal(returned,false,'the local preference write must remain awaited');
 assert.equal(feedFinished,undefined,'school reading starts only after saving the choice');
 saveFinished();await nextTurn();
 assert.equal(savedSource,'college-law');
 assert.equal(returned,true,'an unresolved school request must not retain the global write lock');
 assert.equal(await change,true);
 assert.equal(typeof feedFinished,'function');
 assert.match(isolated.card(),/正在读取法学院的公开公告/);
 feedFinished(response('college-law'));await nextTurn();
 assert.match(isolated.card(),/法学院 · 读取于/);
});
await check('first visit reads the saved college once, with no background read before entering',async()=>{
 const requests=[];
 const first=createNoticesUI({getSource:()=> 'college-law',api:async path=>{requests.push(path);return path.endsWith('/notice-sources')?{sources}:response('college-law')}});
 await first.load();assert.equal(requests.length,1);
 await first.enter();assert.match(first.card(),/法学院 · 读取于/);
 assert.match(requests[1],/source=college-law/);
 await first.enter();await first.enter();assert.equal(requests.length,2,'rerendering and returning to notices must not poll');
 assert.match(first.card(),/刷新公告/);
});
await check('entering while catalog is loading shares that request and waits to read its saved source',async()=>{
 let finishCatalog,finishFeed;const requests=[];
 const first=createNoticesUI({getSource:()=> 'college-fe',api:path=>{requests.push(path);return new Promise(resolve=>{if(path.endsWith('/notice-sources'))finishCatalog=resolve;else finishFeed=resolve})}});
 const loading=first.load();await first.enter();await first.enter();assert.equal(requests.length,1);
 finishCatalog({sources});await nextTurn();
 assert.equal(requests.length,2);assert.match(requests[1],/source=college-fe/);
 await first.enter();assert.equal(requests.length,2,'an in-flight feed must not duplicate on rerender');
 finishFeed(response('college-fe'));await loading;assert.match(first.card(),/教育学部 · 读取于/);
});
await check('a failed first read remains explicit until a user retries',async()=>{
 let failed=true,reads=0;
 // O15：没有线索时第一次进入不再自动读教务部；这里改成设置里填了「教务部」的同学，其余步骤不变。
 const first=createNoticesUI({getProfile:()=>({college:'教务部'}),api:async path=>{if(path.endsWith('/notice-sources'))return {sources};reads++;if(failed)throw Error('学校网站暂时无法读取');return response('undergrad')}});
 await first.enter();assert.match(first.card(),/学校网站暂时无法读取/);
 await first.enter();assert.equal(reads,1,'rendering an error cannot start a retry loop');
 failed=false;await first.click('notice-read');assert.equal(reads,2);assert.match(first.card(),/教务部 · 读取于/);
});
await check('a saved unsupported college stays an official link without an automatic feed request',async()=>{
 const requests=[];
 const first=createNoticesUI({getSource:()=> 'college-csse',api:async path=>{requests.push(path);return {sources}}});
 await first.enter();assert.equal(requests.length,1);assert.match(first.card(),/打开学院官网/);
 assert.doesNotMatch(first.card(),/data-action="notice-read"/);
});

await check('an empty successful feed explains its scope and keeps the original page available',async()=>{
 // O15：同上，由设置里的「教务部」选定栏目。
 const empty=createNoticesUI({getProfile:()=>({college:'教务部'}),api:async path=>path.endsWith('/notice-sources')?{sources}:{...response('undergrad'),items:[]}});
 await empty.enter();
 assert.match(empty.card(),/这个栏目本次没有可显示的公告/);assert.match(empty.card(),/查看原页确认最新通知/);
 assert.match(empty.card(),/href="https:\/\/jwb.szu.edu.cn\/index\/jwtz.htm"/);
 assert.doesNotMatch(empty.card(),/正在读取教务部|正在准备所选学院/);
});
// O15：默认的教务部栏目多是写给各单位和老师、停更已久的通知。第一次进公告页先请同学选学院；设置里填过学院就直接用，研究生跟随培养层次。
const graduateSources=[...sources,{id:'graduate',name:'研究生院',url:'https://gra.szu.edu.cn/',group:'university',readable:true}];
const feedFor=id=>({source:graduateSources.find(s=>s.id===id).name,items:[{title:id+' 公告',date:'2026-09-20',url:'https://example.szu.edu.cn/'+id}],fetched_at:'2026-09-20T12:00:00Z',stale:false});
await check('first entry without a known college asks the student to choose instead of reading the default feed',async()=>{
 const requests=[];
 const first=createNoticesUI({api:async path=>{requests.push(path);if(path.endsWith('/notice-sources'))return {sources};return response(new URL('http://localhost'+path).searchParams.get('source'))}});
 await first.enter();
 assert.deepEqual(requests,['/api/campus/notice-sources'],'还没选学院时不自动读取默认栏目');
 assert.match(first.card(),/先选你的学院/);assert.match(first.card(),/<option value="" selected disabled>请选择学院或部门<\/option>/);
 assert.match(first.card(),/部分学院的网站暂时只能打开官网查看/,'不能承诺每个学院都能在应用内读取');
 assert.doesNotMatch(first.card(),/data-action="notice-read"|读取于/);
 await first.change({target:{id:'feed-source',value:'college-law'}});await nextTurn();
 assert.match(requests.at(-1),/source=college-law/);assert.match(first.card(),/法学院 · 读取于/);assert.doesNotMatch(first.card(),/先选你的学院/);
 await first.enter();assert.equal(requests.length,2,'选过之后再进来不重新询问、不重复读取');
});
await check('the college saved in settings is used directly; an unmatched one is shown escaped and still asks',async()=>{
 const requests=[];let college='法学院 2024 级';
 const ui=createNoticesUI({getProfile:()=>({college}),api:async path=>{requests.push(path);if(path.endsWith('/notice-sources'))return {sources};return response(new URL('http://localhost'+path).searchParams.get('source'))}});
 await ui.enter();assert.match(requests.at(-1),/source=college-law/);assert.match(ui.card(),/法学院 · 读取于/);
 college='<b>计软</b>';const other=createNoticesUI({getProfile:()=>({college}),api:async()=>({sources})});
 await other.enter();assert.match(other.card(),/先选你的学院/);assert.match(other.card(),/&lt;b&gt;计软&lt;\/b&gt;/);assert.doesNotMatch(other.card(),/<b>计软/);
});
await check('graduate students default to the graduate school; a saved choice and the settings college still win',async()=>{
 const requests=[];let level='graduate',saved='undergrad',college='';
 const api=async path=>{requests.push(path);if(path.endsWith('/notice-sources'))return {sources:graduateSources};return feedFor(new URL('http://localhost'+path).searchParams.get('source'))};
 const graduate=createNoticesUI({api,getSource:()=>saved,getProfile:()=>({college,level})});
 await graduate.enter();assert.match(requests.at(-1),/source=graduate/);assert.match(graduate.card(),/研究生院 · 读取于/);
 saved='college-fe';const chosen=createNoticesUI({api,getSource:()=>saved,getProfile:()=>({college,level})});
 await chosen.enter();assert.match(requests.at(-1),/source=college-fe/,'存过的学院优先于培养层次');
 saved='undergrad';college='法学院';const fromSettings=createNoticesUI({api,getSource:()=>saved,getProfile:()=>({college,level})});
 await fromSettings.enter();assert.match(requests.at(-1),/source=college-law/,'设置里的学院优先于培养层次');
 college='';level='undergrad';const later=createNoticesUI({api,getSource:()=>saved,getProfile:()=>({college,level})});
 await later.enter();assert.match(later.card(),/先选你的学院/);
 level='graduate';const before=requests.length;await later.enter();
 assert.equal(requests.length,before+1);assert.match(requests.at(-1),/source=graduate/,'还没亲手选过时，改了培养层次再进来就跟着换');
});
await check('college text matches only a full name or one unambiguous part',()=>{
 const list=[{id:'college-ma',name:'管理学院'},{id:'college-sg',name:'政府管理学院'},{id:'college-ai',name:'人工智能学院'},{id:'college-law',name:'法学院'}];
 assert.equal(matchCollege(list,'管理学院'),'college-ma');assert.equal(matchCollege(list,'政府管理学院 研一'),'college-sg');
 assert.equal(matchCollege(list,'人工智能'),'college-ai');assert.equal(matchCollege(list,'管理学'),'','两个学院都含「管理学」时不猜');
 for(const text of ['','学院','法学','  ',null,undefined])assert.equal(matchCollege(list,text),'');
});
await check('a feed whose newest item is a month old says so above the list',async()=>{
 const now=new Date('2026-09-29T10:00:00').getTime();
 assert.equal(staleNote([{date:'2026-06-08'},{date:'2026-04-20'}],now),'这个栏目最新一条发布于 3 个月前（2026-06-08），可能不常更新；可以换一个学院或部门看看。');
 assert.equal(staleNote([{date:'2026-09-20'}],now),'');assert.equal(staleNote([{date:''}],now),'');
 const ui=createNoticesUI({getProfile:()=>({college:'教务部'}),now:()=>now,api:async path=>path.endsWith('/notice-sources')?{sources}:{...response('undergrad'),items:[{title:'旧通知',date:'2026-06-08',url:'https://jwb.szu.edu.cn/a.htm'}]}});
 await ui.enter();assert.match(ui.card(),/最新一条发布于 3 个月前/);
});
// 存档里的 undergrad 分不清「亲手选了教务部」和「从没选过」，所以选了教务部下次还会再问。提示不能笼统承诺「会记住」，要说清楚怎么让它记住。
await check('picking 教务部 from the prompt is asked again next launch, and the prompt says so instead of promising to remember',async()=>{
 let saved='undergrad';const config={api:async path=>path.endsWith('/notice-sources')?{sources}:response('undergrad'),getSource:()=>saved,setSource:async id=>{saved=id}};
 const first=createNoticesUI(config);await first.enter();
 const prompt=/<div class="notice notice-first-choice"[\s\S]*?<\/div>/.exec(first.card())?.[0]||'';
 assert.match(prompt,/选好后会记在本机/);assert.match(prompt,/只有教务部记不住：想每次直接看它，在设置里把学院填成「教务部」/,'承诺会记住的同一段里要写明教务部例外');
 await first.change({target:{id:'feed-source',value:'undergrad'}});await nextTurn();assert.equal(saved,'undergrad');assert.doesNotMatch(first.card(),/先选你的学院/);
 const relaunched=createNoticesUI(config);await relaunched.enter();assert.match(relaunched.card(),/先选你的学院/,'重启后仍会再问（与提示里写的一致）');
 const filled=createNoticesUI({...config,getProfile:()=>({college:'教务部'})});await filled.enter();assert.doesNotMatch(filled.card(),/先选你的学院/,'按提示在设置里填了「教务部」就不再问');assert.match(filled.card(),/教务部 · 读取于/);
});
console.log(`${count} notice checks passed`);
