// 页面侧纯逻辑的性质测试：html.mjs / routes.mjs / notebook-model.mjs / app-logic.mjs / pet-dialogue.mjs，
// 以及注入替身后的 workspace-commit.mjs 与 api-client.mjs。公共小件见 desktop/property-testing.mjs。
// 文末带 “（修复前失败）” 的用例是随机测试找到、经人工复核确认的真实问题的最小回归用例。
import assert from 'node:assert/strict';
import {esc} from './assets/garden/html.mjs';
import {readRoute,routeHash} from './assets/garden/routes.mjs';
import {normalizeNotebook,noteHeadings,markdownNote,markdownImport,markdownExport,wordCount,notebookTextBytes,notebookBytes,formatMiB,safeNoteURL,feishuDocumentURL,latestNotebookNote} from './assets/garden/notebook-model.mjs';
import {countdown,remaining,shouldPollNetwork,autostartView,exitHint} from './assets/garden/app-logic.mjs';
import {createWorkspaceCommit} from './assets/garden/workspace-commit.mjs';
import {createApi} from './assets/garden/api-client.mjs';
import {PET_CONTEXTS,PET_DIALOGUE,pickPetDialogue} from './assets/garden/pet-dialogue.mjs';
import {createState,normalize} from './assets/garden/engine.mjs';
import {Rng,forAll,forAllAsync,test,testAsync,report,clone,PROTO_KEYS} from './property-testing.mjs';

const NOW=new Date(2026,8,27,12).getTime();

// ───────────────────────── html.mjs ─────────────────────────
const unesc=s=>s.replace(/&(amp|lt|gt|quot|#39);/g,(_,e)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[e]);
forAll('esc：输出去掉实体后不含 & < > \' "，可无损解码回原文，逐字符同态，对安全文本是恒等',rng=>({a:rng.text(20,{tricky:6}),b:rng.text(20,{tricky:6})}),({a,b})=>{
  const out=esc(a);
  assert.doesNotMatch(out.replace(/&(amp|lt|gt|quot|#39);/g,''),/[&<>"']/,'输出里不得有未转义的特殊字符');
  assert.equal(unesc(out),a,'转义可逆');
  assert.equal(esc(a+b),esc(a)+esc(b),'逐字符转义应满足拼接同态');
  if(!/[&<>"']/.test(a))assert.equal(out,a);
  assert.ok(out.length>=a.length);
});
test('esc 对 null/undefined/数字/布尔/对象都不抛错且返回字符串',()=>{for(const v of [null,undefined,0,-0,1.5,NaN,true,false,[],{},[1,'<'],Symbol('x'),10n])assert.equal(typeof esc(v),'string')});

// ───────────────────────── routes.mjs ─────────────────────────
const PAGES={home:[],network:[],services:['spaces','notices','directory','piano'],garden:['pet','farm','market','arcade','journal'],study:['notes','focus','timetable','grades'],settings:['appearance','desktop','data','about']};
const genHash=rng=>rng.weighted([[3,()=>'#'+rng.pick(Object.keys(PAGES))+(rng.bool(0.6)?'/'+rng.pick([...Object.values(PAGES).flat(),...PROTO_KEYS,'','x']):'')],[1,()=>rng.text(12)],[1,()=>rng.pick(['','#','##','#/','#/focus','#study/focus/extra','study/focus','#constructor','#__proto__/toString',null,undefined,42])]]);
forAll('readRoute/routeHash：任意输入都落在路由表内，readRoute∘routeHash 是幂等往返，带分区的页面总有分区',genHash,hash=>{
  const route=readRoute(hash);
  assert.ok(Object.hasOwn(PAGES,route.page),`page=${route.page}`);
  if(PAGES[route.page].length)assert.ok(PAGES[route.page].includes(route.tab),`tab=${route.tab}`);else assert.equal(route.tab,undefined);
  const hash2=routeHash(route);assert.match(hash2,/^#[a-z]+(\/[a-z]+)?$/);
  assert.deepEqual(readRoute(hash2),route,'routeHash 后再 readRoute 应得到同一路由');
  assert.equal(routeHash(readRoute(hash2)),hash2);
  const requested=String(hash).replace(/^#/,'').split('/');
  if(Object.hasOwn(PAGES,requested[0])&&!PROTO_KEYS.includes(requested[0]))assert.equal(route.page,requested[0],'合法页面不应被改写');
  if(Object.hasOwn(PAGES,requested[0])&&PAGES[requested[0]].includes(requested[1]))assert.equal(route.tab,requested[1],'合法分区不应被改写');
});

// ───────────────────────── notebook-model.mjs ─────────────────────────
// Markdown 片段生成器：标题、列表、任务、代码围栏、引用、分隔线、行内记号、链接、CRLF/CR 换行与刁钻字符混排
function genMarkdown(rng,size){
  const lines=[],n=Math.round(1+size*rng.int(1,30));
  const inlineText=()=>rng.weighted([[4,()=>rng.text(10,{tricky:2})],[1,()=>'`'+rng.ascii(5)+'`'],[1,()=>'**'+rng.ascii(4)+'**'],[1,()=>'*'+rng.ascii(4)+'*'],[1,()=>'['+rng.text(4)+']('+rng.pick(['https://a.b/c','http://x.y','mailto:a@b.c','javascript:alert(1)','data:text/html,x','vbscript:x','ftp://a','//a.b','x y','https://a.b/"onmouseover="x'])+')'],[1,()=>'![img]('+rng.pick(['https://a.b/i.png','javascript:1'])+')']]);
  for(let i=0;i<n;i++)lines.push(rng.weighted([[3,()=>'#'.repeat(rng.int(1,7))+rng.pick([' ','','  ','\t',' #'])+inlineText()],[3,inlineText],[1,()=>''],[1,()=>rng.pick(['- ','* ','+ ','1. ','12. ','  - ','-','1.'])+inlineText()],[1,()=>'- ['+rng.pick([' ','x','X','y'])+'] '+inlineText()],[1,()=>rng.pick(['```','```js','``` ','```  x','~~~'])],[1,()=>'> '+inlineText()],[1,()=>rng.pick(['---','***','----',' --- ','-- -'])],[1,()=>'   '+inlineText()]]));
  return lines.join(rng.pick(['\n','\n','\r\n','\r']));
}
const ALLOWED_TAG=/<(\/?)(p|br|code|strong|em|a|h[2-6]|ul|ol|li|span|blockquote|hr|pre)(\s[^<>]*)?>/g;
forAll('noteHeadings 与 markdownNote 的章节编号一一对应，偏移量指回原文；HTML 里只有允许的标签，链接只有 http(s)/mailto',genMarkdown,source=>{
  const headings=noteHeadings(source),html=markdownNote(source);
  const ids=[...html.matchAll(/<h[2-6] id="note-section-(\d+)"/g)].map(m=>Number(m[1]));
  assert.deepEqual(ids,headings.map((_,i)=>i+1),'大纲的章节数与渲染出的标题数应一致（否则大纲跳转指错）');
  assert.deepEqual(headings.map(h=>h.id),headings.map((_,i)=>'note-section-'+(i+1)));
  let last=-1;
  for(const h of headings){
    assert.ok(h.start>last&&h.end>=h.start,'偏移量递增');last=h.end;
    // CommonMark 允许 “#  ” 这样的空标题；大纲文字去掉 `*_ 后也可能为空，这里只要求类型与层级正确
    const line=source.slice(h.start,h.end);assert.match(line,/^#{1,6}\s+/,'偏移量应指向原文的标题行');assert.doesNotMatch(line,/[\r\n]/);
    assert.ok(h.level>=1&&h.level<=6&&typeof h.text==='string');
  }
  const stripped=html.replace(ALLOWED_TAG,'');
  assert.doesNotMatch(stripped,/[<>]/,'除允许的标签外不得出现裸 < >：'+stripped.slice(0,120));
  for(const m of html.matchAll(/href="([^"]*)"/g))assert.match(unesc(m[1]),/^(https?:|mailto:)/,'链接协议受限');
  for(const m of html.matchAll(/<a\s([^>]*)>/g))assert.match(m[1],/target="_blank" rel="noopener noreferrer"/);
  // 简易配对检查：块级与行内标签开闭一致
  const stack=[];
  for(const m of html.matchAll(ALLOWED_TAG)){const [,close,tag]=m;if(tag==='br'||tag==='hr')continue;if(!close)stack.push(tag);else assert.equal(stack.pop(),tag,'标签应正确嵌套')}
  assert.deepEqual(stack,[],'标签应全部闭合');
});

test('markdownNote 对空文本给占位段落；noteHeadings 对空文本为空',()=>{assert.match(markdownNote(''),/note-placeholder/);assert.deepEqual(noteHeadings(''),[]);assert.deepEqual(noteHeadings('\n\n'),[])});

forAll('markdownImport(markdownExport(note)) 还原标题与正文（正文首尾空行除外）',rng=>({title:rng.text(12,{tricky:0}).replace(/[\r\n]/g,''),body:rng.text(40,{tricky:3}).replace(/\r/g,'').replace(/^﻿/,'')}),({title,body})=>{
  const back=markdownImport(markdownExport({title,body}));
  assert.equal(back.title,title.trim()||'未命名笔记');
  assert.equal(back.body.replace(/^\n+/,'').replace(/\n+$/,''),body.replace(/^\n+/,'').replace(/\n+$/,''),'正文内容应保持');
  assert.equal(markdownImport(markdownExport({title,body,sourceUrl:'https://x.feishu.cn/docx/Abc123'})).body.startsWith('[导入来源](https://x.feishu.cn/docx/Abc123)'),true);
});

forAll('wordCount：非负整数；给汉字两侧加空格不改变计数（每个汉字算一个词）',rng=>rng.text(20,{ascii:4,cjk:4,emoji:1,tricky:1}),text=>{
  const n=wordCount(text);assert.ok(Number.isInteger(n)&&n>=0);
  const han=/\p{Script=Han}/u;
  const spaced=text.replace(/\p{Script=Han}/gu,' $& ');
  assert.equal(wordCount(spaced),n,`汉字应各算一个词，与是否紧贴字母数字无关：${JSON.stringify(text)}`);
  const hanCount=[...text].filter(c=>han.test(c)).length;assert.ok(n>=hanCount,'汉字数是字数的下界');
});

// Go 侧（internal/ui/notebook.go）用 json.Marshal 重新压缩请求里的 RawMessage：< > & 与 U+2028/2029 变成六字节 \u 转义，其余字节原样。
function goStoredBytes(text){
  let bytes=0;
  for(const ch of text){const c=ch.codePointAt(0);if(c===0x3c||c===0x3e||c===0x26||c===0x2028||c===0x2029)bytes+=6;else bytes+=c<0x80?1:c<0x800?2:c<0x10000?3:4}
  return bytes+64;
}
forAll('notebookTextBytes 与 Go 重新序列化后的字节数完全一致（含代理对、行终止符与 HTML 特殊字符）',rng=>JSON.stringify({t:rng.text(60,{tricky:6}),n:rng.number(),a:[rng.text(8),null,true]}),text=>{
  assert.equal(notebookTextBytes(text),goStoredBytes(text));
  assert.equal(notebookBytes(JSON.parse(text)),notebookTextBytes(JSON.stringify(JSON.parse(text))));
});
test('formatMiB 向上取到 0.1 MiB 且单调',()=>{const rng=new Rng(3);let prev=0;for(const b of Array.from({length:300},()=>rng.int(0,9e6)).sort((a,b)=>a-b)){const v=Number(formatMiB(b));assert.ok(v>=b/1048576-1e-9&&v<b/1048576+0.1+1e-9);assert.ok(v>=prev);prev=v}});

// 笔记本备份：随机课程/笔记/偏好，normalizeNotebook 幂等；坏形状只以 Error 拒绝
function genNotebook(rng,size){
  const courses=rng.array(rng.int(0,3),i=>({id:rng.bool(0.9)?'c'+i:rng.pick(['c0','',7]),name:rng.bool(0.9)?'课程'+i:rng.pick(['',' ',5]),...(rng.bool(0.3)?{sharedUrl:rng.pick(['https://a.feishu.cn/docx/AbC1','https://evil.com/docx/x','',null,'https://a.larksuite.com/wiki/Zz9?x=1#y'])}:{})}));
  const notes=rng.array(rng.int(0,4),i=>({id:rng.bool(0.9)?'n'+i:rng.pick(['n0','',3]),title:rng.bool(0.9)?rng.text(6):5,body:rng.bool(0.95)?rng.text(20):null,courseId:rng.pick(['','c0','c1','missing',...(rng.bool(0.1)?[5]:[])]),createdAt:rng.bool(0.95)?rng.int(0,2e12):'x',updatedAt:rng.bool(0.95)?rng.int(0,2e12):NaN,...(rng.bool(0.3)?{deletedAt:rng.pick([rng.int(0,2e12),null,'x'])}:{})}));
  return {courses,notes,preferences:rng.bool(0.9)?{selectedNoteId:rng.pick(['','n0','n9']),selectedCourseId:rng.pick(['','c0','zz'])}:rng.pick([null,'x',[]])};
}
forAll('normalizeNotebook：幂等、编号唯一、选中项要么存在要么清空；坏形状只以 Error 拒绝',(rng,size)=>rng.weighted([[4,()=>genNotebook(rng,size)],[1,()=>rng.json(3,{keys:['courses','notes','preferences','id','name','title','body','courseId','createdAt','updatedAt','deletedAt','sharedUrl'],allowSpecial:true})]]),raw=>{
  let out;try{out=normalizeNotebook(clone(raw))}catch(e){assert.ok(e instanceof Error&&e.constructor===Error&&e.message,'应以友好 Error 拒绝');return}
  assert.deepEqual(normalizeNotebook(clone(out)),out,'幂等');
  const ids=new Set(out.courses.map(c=>c.id));assert.equal(ids.size,out.courses.length);assert.equal(new Set(out.notes.map(n=>n.id)).size,out.notes.length);
  for(const n of out.notes){assert.ok(n.courseId===''||ids.has(n.courseId));assert.ok(Number.isFinite(n.createdAt)&&Number.isFinite(n.updatedAt))}
  assert.ok(out.preferences.selectedNoteId===''||out.notes.some(n=>n.id===out.preferences.selectedNoteId));
  assert.ok(out.preferences.selectedCourseId===''||ids.has(out.preferences.selectedCourseId));
  for(const c of out.courses)if(c.sharedUrl)assert.equal(feishuDocumentURL(c.sharedUrl),feishuDocumentURL(c.sharedUrl)&&c.sharedUrl?feishuDocumentURL(c.sharedUrl):'');
  const latest=latestNotebookNote(out);if(latest)assert.ok(!latest.deletedAt&&out.notes.filter(n=>!n.deletedAt).every(n=>n.updatedAt<=latest.updatedAt));
});

forAll('safeNoteURL/feishuDocumentURL：幂等，只放行既定协议与域名，输出不带查询串、片段与凭据',rng=>rng.weighted([[2,()=>rng.pick(['https://','http://','mailto:','javascript:','data:','file:','ftp://','HTTPS://','//',''])+rng.pick(['x.feishu.cn','a-1.larksuite.com','b.larkoffice.com','feishu.cn','evil.feishu.cn.attacker.com','a.b.feishu.cn','user:pw@x.feishu.cn','x.feishu.cn:8443','127.0.0.1'])+rng.pick(['/docx/AbC123','/wiki/Zz9/','/docx/','/docs/x','/docx/a b','/wiki/Zz9?x=1#frag','','/docx/Ab-c'])],[1,()=>rng.text(20)]]),url=>{
  const safe=safeNoteURL(url),doc=feishuDocumentURL(url);
  assert.equal(safeNoteURL(safe),safe,'safeNoteURL 幂等');assert.equal(feishuDocumentURL(doc),doc,'feishuDocumentURL 幂等');
  if(safe)assert.match(safe,/^(https?:|mailto:)/);
  if(doc){const u=new URL(doc);assert.equal(u.protocol,'https:');assert.match(u.hostname,/^[a-z0-9-]+\.(feishu\.cn|larksuite\.com|larkoffice\.com)$/);assert.equal(u.search,'');assert.equal(u.hash,'');assert.equal(u.username,'');assert.equal(u.port,'');assert.match(u.pathname,/^\/(docx|wiki)\/[a-zA-Z0-9]+\/?$/)}
  if(doc)assert.equal(safeNoteURL(url)!=='',true,'飞书文档链接也一定是安全链接');
});

// ───────────────────────── app-logic.mjs ─────────────────────────
forAll('countdown/remaining：格式 MM:SS、秒数=向上取整的剩余秒、到点后提示成熟',rng=>({end:rng.int(0,4e12),now:rng.int(0,4e12)}),({end,now})=>{
  const text=countdown(end,now),m=/^(\d{2,}):(\d{2})$/.exec(text);assert.ok(m,text);
  const seconds=Number(m[1])*60+Number(m[2]);assert.equal(seconds,Math.max(0,Math.ceil((end-now)/1000)));assert.ok(Number(m[2])<60);
  assert.equal(remaining(end,now),end<=now?'成熟啦，随时可以收获':'还需 '+text);
});
forAll('shouldPollNetwork：退出或隐藏时永不轮询；可见时只在网络相关页面或 anyPage 下按 25 秒节流，force 立即',rng=>({exiting:rng.bool(0.2),hidden:rng.bool(0.3),page:rng.pick(['home','network','garden','study','services','settings']),force:rng.bool(0.3),anyPage:rng.bool(0.3),now:rng.int(0,1e6),checkedAt:rng.int(0,1e6)}),input=>{
  const out=shouldPollNetwork(input);assert.equal(typeof out,'boolean');
  const visible=!input.exiting&&!input.hidden,relevant=input.anyPage||input.page==='home'||input.page==='network';
  assert.equal(out,visible&&relevant&&(input.force||input.now-input.checkedAt>=25000));
});
forAll('autostartView：读不到状态时按钮禁用且文字不说“未开启”；安装版只允许关闭旧自启',rng=>({st:rng.bool(0.2)?null:{supported:rng.bool(0.8),enabled:rng.bool(),error:rng.bool(0.2)?'x':'',detail:rng.bool(0.7)?'详情':''},installed:rng.bool()}),({st,installed})=>{
  const view=autostartView(st,installed);assert.equal(typeof view.text,'string');assert.equal(typeof view.disabled,'boolean');assert.equal(typeof view.label,'string');
  if(!st){assert.equal(view.disabled,true);assert.doesNotMatch(view.text,/未开启/);assert.match(view.text,/正在读取/)}
  else{assert.equal(view.disabled,!(st.supported&&!st.error&&(!installed||st.enabled)));if(installed&&!st.enabled)assert.equal(view.disabled,true)}
  assert.ok(exitHint('electron').includes('托盘')&&exitHint('browser').includes('自动退出'));
});

// ───────────────────────── pet-dialogue.mjs ─────────────────────────
const SPECIES=Object.keys(PET_DIALOGUE);
forAll('pickPetDialogue：结果确定，台词属于所选伙伴与上下文的词库，未知伙伴/上下文回落，游标前进且不重复上一句，一轮遍历覆盖全部台词',rng=>({species:rng.bool(0.85)?rng.pick(SPECIES):rng.pick(['dragon','constructor','',null]),context:rng.bool(0.85)?rng.pick(PET_CONTEXTS):rng.pick(['dance','constructor','toString','']),cursor:rng.weighted([[4,()=>rng.int(0,40)],[1,()=>rng.pick([-1,1.5,NaN,'3',2**53,null])]]),seed:rng.pick([0,1,NOW,-5,'x']),lastIndex:rng.int(-1,15)}),({species,context,cursor,seed,lastIndex})=>{
  const id=Object.hasOwn(PET_DIALOGUE,species)?species:'libao',key=Object.hasOwn(PET_DIALOGUE[id],context)?context:'idle',pool=PET_DIALOGUE[id][key];
  const last=lastIndex>=0?pool[lastIndex%pool.length]:'';
  const line=pickPetDialogue(species,context,{cursor,last,seed});
  assert.deepEqual(pickPetDialogue(species,context,{cursor,last,seed}),line,'确定性');
  assert.ok(pool.includes(line.text),'台词应来自词库');assert.equal(line.context,key);
  const base=Number.isSafeInteger(cursor)&&cursor>=0?cursor:0;assert.ok(line.cursor===base+1||line.cursor===base+2,'游标前进 1 或 2');
  if(pool.length>1)assert.notEqual(line.text,last,'不重复上一句');
  let c=0,heard=new Set(),prev='';for(let i=0;i<pool.length;i++){const l=pickPetDialogue(species,context,{cursor:c,last:prev,seed});heard.add(l.text);c=l.cursor;prev=l.text}
  assert.ok(heard.size>=pool.length-1,'连续一轮应几乎遍历全部台词');
});

// ───────────────────────── workspace-commit.mjs（注入替身） ─────────────────────────
// 随机服务端行为：成功 / 409（另一窗口）/ 409 + 恢复标记 / 网络失败 / 409 后重读又失败 / 409 后重读到的存档不合法
const OUTCOMES=['ok','conflict','conflict-recovered','network','conflict-then-network','conflict-invalid-latest','conflict-latest-recovered'];
function harness(outcome){
  const calls=[];let revision=3,state='S0',failure=null;
  const latestData=outcome==='conflict-invalid-latest'?{schema:9,game:null}:createState(NOW);
  const api=async(path,data)=>{calls.push([path,data===undefined?'GET':'POST']);
    if(data!==undefined){if(outcome==='ok')return {revision:4};if(outcome==='network')throw Error('本机服务暂时无响应');const e=Error('conflict');e.code=409;if(outcome==='conflict-recovered')e.recovered=true;throw e}
    if(outcome==='conflict-then-network')throw Error('本机服务暂时无响应');
    const latest={revision:9,data:latestData};if(outcome==='conflict-latest-recovered')Object.defineProperty(latest,'recovered',{value:true});return latest};
  const commit=createWorkspaceCommit({api,normalize,read:()=>({failure,revision}),setRevision:r=>{calls.push(['rev',r]);revision=r},setState:s=>{calls.push(['state']);state=s},paint:()=>calls.push(['paint']),byId:()=>null});
  return {commit,calls,get revision(){return revision},get state(){return state},set failure(v){failure=v}};
}
await forAllAsync('commit：成功时先记修订号再换存档并重绘；失败时修订号与存档要么都不动、要么一起同步到最新（不能只改修订号）；错误文案与恢复标记一致',rng=>({outcome:rng.pick(OUTCOMES),failure:rng.bool(0.15),draft:rng.bool(0.3)}),async({outcome,failure,draft})=>{
  const h=harness(outcome);if(failure)h.failure={message:'x'};
  const next={marker:'next'};
  let error=null;try{await h.commit(next,draft?{formId:'f',values:{a:1}}:undefined)}catch(e){error=e}
  if(failure){assert.ok(error&&/暂时打不开/.test(error.message));assert.deepEqual(h.calls,[],'降级状态下不得访问服务');return}
  if(outcome==='ok'){assert.equal(error,null);assert.deepEqual(h.calls.slice(1),[['rev',4],['state'],['paint']]);assert.equal(h.state,next);assert.equal(h.revision,4);return}
  assert.ok(error instanceof Error,'失败必须抛错');
  const revChanged=h.calls.some(c=>c[0]==='rev'),stateChanged=h.calls.some(c=>c[0]==='state');
  assert.equal(revChanged,stateChanged,`修订号与存档必须一起变：${JSON.stringify(h.calls)}（${outcome}）`);
  if(stateChanged){assert.equal(h.revision,9);assert.equal(h.state.schema,3);assert.ok(h.state.game,'换上的必须是 normalize 过的存档');assert.equal(h.calls.at(-1)[0],'paint');assert.ok(h.calls.findIndex(c=>c[0]==='rev')<h.calls.findIndex(c=>c[0]==='state'),'先记修订号再换存档')}
  else assert.equal(h.state,'S0');
  if(outcome.startsWith('conflict')&&stateChanged){
    assert.match(error.message,/本次操作尚未保存/);
    const recovered=outcome==='conflict-recovered'||outcome==='conflict-latest-recovered';
    assert.equal(/存档文件损坏/.test(error.message),recovered,'“已恢复”文案只在带恢复标记时出现');
    assert.equal(/另一个窗口/.test(error.message),!recovered);
  }
},{cases:200});

// ───────────────────────── api-client.mjs（注入替身） ─────────────────────────
function fakeResponse({status,body,recovered}){return {ok:status>=200&&status<300,status,headers:{get:name=>name==='X-SZU-Recovered'&&recovered?'backup':null},text:async()=>body}}
await forAllAsync('api：网络异常与非 JSON 响应都变成带 HTTP 状态的 Error，失败时 code=状态码，成功时返回解析结果并按需标记 recovered；错误文案不含 HTML 标签',rng=>({path:rng.pick(['/api/workspace','/api/notebook','/api/status','/x']),data:rng.weighted([[2,undefined],[1,'{"raw":1}'],[1,()=>({a:rng.int(0,9)})],[1,null]]),status:rng.pick([200,200,201,204,400,404,409,413,500,502]),body:rng.weighted([[3,()=>JSON.stringify({message:rng.text(8),n:1})],[1,()=>'<html><body><h1>Bad</h1>'+rng.text(30)+'</body></html>'],[1,()=>rng.text(20)],[1,'']]),recovered:rng.bool(0.3),network:rng.bool(0.15)}),async({path,data,status,body,recovered,network})=>{
  const toasts=[],timers=[],requests=[];
  const api=createApi({toast:t=>toasts.push(t),fetch:async(url,init)=>{requests.push([url,init]);if(network)throw TypeError('fetch failed');return fakeResponse({status,body,recovered})},setTimeout:(fn,ms)=>{timers.push([fn,ms]);return 1}});
  let result,error=null;try{result=await api(path,data)}catch(e){error=e}
  assert.equal(requests.length,1);const [,init]=requests[0];
  assert.equal(init.method,data===undefined?'GET':'POST');assert.equal(init.body,data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data),'字符串原样发送，对象序列化一次');
  if(network){assert.ok(error&&/暂时无响应/.test(error.message)&&error.code===undefined);return}
  let parsed=null,json=true;try{parsed=JSON.parse(body)}catch{json=false}
  if(!json){assert.ok(error,'非 JSON 响应必须报错');assert.match(error.message,new RegExp(`HTTP ${status}`));assert.doesNotMatch(error.message,/<[^>]*>/,'错误文案不得带 HTML 标签');assert.equal(error.code,status<200||status>=300?status:undefined);return}
  if(status<200||status>=300){assert.ok(error);assert.equal(error.code,status);assert.equal(error.recovered,recovered||undefined);assert.equal(error.message,parsed?.message||'操作没有成功');return}
  assert.equal(error,null);assert.deepEqual(result,parsed);
  if(recovered&&result&&typeof result==='object'){assert.equal(result.recovered,true);assert.ok(!Object.keys(result).includes('recovered'),'recovered 标记不可枚举，不会被序列化回服务端')}
  const kind=path.startsWith('/api/notebook')?'笔记':path.startsWith('/api/workspace')?'存档':'';
  assert.equal(toasts.length,recovered&&kind?1:0,'只对存档/笔记文件提示恢复');if(toasts.length)assert.match(toasts[0],new RegExp(kind+'文件损坏'));
},{cases:250});

await testAsync('api：同一文件 6 秒内只提示一次恢复，不同文件各提示一次，计时器到点后可再次提示',async()=>{
  const toasts=[],timers=[];
  const api=createApi({toast:t=>toasts.push(t),fetch:async()=>fakeResponse({status:200,body:'{}',recovered:true}),setTimeout:(fn,ms)=>{timers.push(fn);assert.equal(ms,6000);return timers.length}});
  await api('/api/workspace');await api('/api/workspace');await api('/api/notebook');
  assert.deepEqual(toasts,['存档文件损坏，已恢复到上一次成功保存的版本','存档文件损坏，已恢复到上一次成功保存的版本；笔记文件损坏，已恢复到上一次成功保存的版本']);
  for(const fn of timers)fn();await api('/api/workspace');assert.equal(toasts.length,3);
});

// ───────────────────────── 随机测试找到并经复核的最小回归用例（修复前失败） ─────────────────────────

test('wordCount：紧跟字母/数字的汉字仍逐字计数，顺序不改变结果（修复前失败）',()=>{
  // [\p{L}\p{N}] 包含汉字；分别逐字符处理 CJK 后，汉字前后相邻的词数一致。
  assert.equal(wordCount('a漢'),wordCount('漢a'),'汉字与字母的先后顺序不该改变字数');
  assert.equal(wordCount('用Python写代码'),5,'用 / Python / 写 / 代 / 码');
  assert.equal(wordCount('第3章'),3);
});

await testAsync('commit 在 409 后若最新存档无法通过 normalize，不该只更新修订号而不换存档（修复前失败）',async()=>{
  // 修订号已指向服务端最新版本、页面状态仍是旧的：用户重试同一操作会用旧状态覆盖另一个窗口（或更新版本）刚写入的存档。
  const h=harness('conflict-invalid-latest');
  let error=null;try{await h.commit({marker:'next'})}catch(e){error=e}
  assert.ok(error);
  const revChanged=h.calls.some(c=>c[0]==='rev'),stateChanged=h.calls.some(c=>c[0]==='state');
  assert.equal(revChanged,stateChanged,`修订号与存档必须一起变：${JSON.stringify(h.calls)}`);
});

report();
