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
const officialSources=sources.map(s=>({...s,search_mode:s.readable?'official':'unavailable'}));
const officialResult=(id,q='通知',page=1,scope='title')=>({source_id:id,source:sources.find(s=>s.id===id).name,url:sources.find(s=>s.id===id).url,query:q,scope,range:'column',range_label:'所选学院当前栏目',page,page_size:12,total:25,fetched_at:'2026-10-24T03:00:00Z',items:[{title:`${q} 第${page}页 <script>`,url:'https://law.szu.edu.cn/info/100/10.htm',date:'2026-10-24',can_read:true},{title:'官网外部文章',url:'https://mp.weixin.qq.com/s/example',date:'2026-10-23',can_read:false}]});
await check('official search sends title or fulltext scope and exposes real totals and page controls',async()=>{
 const paths=[];const ui=createNoticesUI({getSource:()=> 'college-law',api:async path=>{paths.push(path);if(path.endsWith('/notice-sources'))return {sources:officialSources};if(path.includes('/notices/search?')){const p=new URL('http://localhost'+path).searchParams;return officialResult(p.get('source'),p.get('q'),Number(p.get('page')),p.get('scope'))}return response('college-law')}});
 await ui.enter();assert.match(ui.card(),/id="notice-query"/);assert.match(ui.card(),/校方搜索/);
 ui.input({target:{id:'notice-query',value:'通知'}});await ui.change({target:{id:'notice-search-scope',value:'fulltext'}});await ui.click('notice-search');
 const request=new URL('http://localhost'+paths.at(-1));assert.equal(request.pathname,'/api/campus/notices/search');assert.equal(request.searchParams.get('scope'),'fulltext');assert.equal(request.searchParams.get('q'),'通知');
 assert.match(ui.card(),/所选学院当前栏目/);assert.match(ui.card(),/全文/);assert.match(ui.card(),/25 条/);assert.match(ui.card(),/第 1.*3 页/);assert.match(ui.card(),/&lt;script&gt;/);assert.doesNotMatch(ui.card(),/data-action="notice-open"[^>]*mp\.weixin/);
 await ui.click('notice-search-next');assert.equal(new URL('http://localhost'+paths.at(-1)).searchParams.get('page'),'2');assert.match(ui.card(),/第2页/);
 await ui.click('notice-search-prev');assert.equal(new URL('http://localhost'+paths.at(-1)).searchParams.get('page'),'1');
});
await check('loaded-title search filters all fetched items before paginating and never calls official search',async()=>{
 const many={...response('undergrad'),items:Array.from({length:25},(_,i)=>({title:(i<12?'普通':'目标')+i,date:'2026-10-24',url:'https://jwb.szu.edu.cn/info/1053/'+(i+1)+'.htm'}))};const paths=[];
 const ui=createNoticesUI({getProfile:()=>({college:'教务部'}),api:async path=>{paths.push(path);return path.endsWith('/notice-sources')?{sources}:many}});
 await ui.enter();assert.match(ui.card(),/本次读取.*标题/);ui.input({target:{id:'notice-query',value:'目标'}});await ui.click('notice-search');
 assert.match(ui.card(),/13 条/);assert.match(ui.card(),/25 条标题/);assert.match(ui.card(),/目标12/);assert.match(ui.card(),/目标23/);assert.doesNotMatch(ui.card(),/目标24/);assert.equal(paths.length,2);
 await ui.click('notice-search-next');assert.match(ui.card(),/目标24/);assert.doesNotMatch(ui.card(),/>目标12</);assert.equal(paths.length,2);
 await ui.click('notice-search-clear');assert.match(ui.card(),/普通0/);assert.doesNotMatch(ui.card(),/共 13 条/);
});
await check('a failed official search is explicit and cannot silently show the recent feed as complete results',async()=>{
 const ui=createNoticesUI({getSource:()=> 'college-law',api:async path=>{if(path.endsWith('/notice-sources'))return {sources:officialSources};if(path.includes('/notices/search?'))throw Error('校方搜索暂时打不开');return response('college-law')}});
 await ui.enter();ui.input({target:{id:'notice-query',value:'通知'}});await ui.click('notice-search');
 assert.match(ui.card(),/校方搜索暂时打不开/);assert.match(ui.card(),/校方搜索未完成/);assert.doesNotMatch(ui.card(),/college-law 公告/);
 await ui.click('notice-search-clear');assert.match(ui.card(),/college-law 公告/);
});
await check('search responses for a previous source or scope cannot replace the current selection',async()=>{
 let finish;const ui=createNoticesUI({getSource:()=> 'college-law',api:path=>{if(path.endsWith('/notice-sources'))return Promise.resolve({sources:officialSources});if(path.includes('/notices/search?'))return new Promise(resolve=>{finish=resolve});return Promise.resolve(response(new URL('http://localhost'+path).searchParams.get('source')))}});
 await ui.enter();ui.input({target:{id:'notice-query',value:'迟到结果'}});const old=ui.click('notice-search');await nextTurn();assert.match(ui.card(),/正在检索/);
 await ui.change({target:{id:'feed-source',value:'college-fe'}});await nextTurn();finish(officialResult('college-law','迟到结果'));await old;
 assert.match(ui.card(),/教育学部 · 读取于/);assert.doesNotMatch(ui.card(),/迟到结果 第/);
 ui.input({target:{id:'notice-query',value:'旧标题'}});const previous=ui.click('notice-search');await nextTurn();await ui.change({target:{id:'notice-search-scope',value:'fulltext'}});finish(officialResult('college-fe','旧标题'));await previous;assert.doesNotMatch(ui.card(),/旧标题 第/);
});
await check('successful empty searches say no matches and keep their official scope',async()=>{
 const ui=createNoticesUI({getSource:()=> 'college-law',api:async path=>path.endsWith('/notice-sources')?{sources:officialSources}:path.includes('/notices/search?')?{...officialResult('college-law'),range:'site',range_label:'法学院网站（可能包含新闻等其他栏目）',total:0,items:[]}:response('college-law')});
 await ui.enter();ui.input({target:{id:'notice-query',value:'没有的词'}});await ui.click('notice-search');assert.match(ui.card(),/没有找到匹配/);assert.match(ui.card(),/网站（可能包含新闻等其他栏目）/);assert.doesNotMatch(ui.card(),/这个栏目本次没有可显示/);
});
await check('opening a search result reuses the existing detail endpoint and escapes body and attachments',async()=>{
 const box={hidden:true,dataset:{},textContent:'',innerHTML:''};const paths=[];
 const ui=createNoticesUI({api:async path=>{paths.push(path);return {body:'正文 <script>\n第二段',attachments:[{name:'附件 <b>.pdf',url:'https://law.szu.edu.cn/system/_content/download.jsp?wbfileid=12&owner=34'}]}}});
 await ui.click('notice-open',{dataset:{url:'https://law.szu.edu.cn/info/100/10.htm'},parentElement:{querySelector:()=>box}});
 assert.match(paths[0],/^\/api\/campus\/notice\?url=/);assert.match(box.innerHTML,/正文 &lt;script&gt;<br>第二段/);assert.match(box.innerHTML,/附件 &lt;b&gt;\.pdf/);assert.match(box.innerHTML,/wbfileid=12&amp;owner=34/);
});
await check('collapsing and reopening a pending body shares its read instead of requesting it twice',async()=>{
 let finish,reads=0;const box={hidden:true,dataset:{},textContent:'',innerHTML:''},button={dataset:{url:'https://law.szu.edu.cn/info/100/10.htm'},parentElement:{querySelector:()=>box}};
 const ui=createNoticesUI({api:()=>{reads++;return new Promise(resolve=>{finish=resolve})}});
 const first=ui.click('notice-open',button);await ui.click('notice-open',button);const reopened=ui.click('notice-open',button);
 assert.equal(reads,1,'reopening a pending body must not duplicate a public school request');finish({body:'公开正文',attachments:[]});await first;await reopened;assert.match(box.innerHTML,/公开正文/);
});
console.log(`${count} notice checks passed`);
