import assert from 'node:assert/strict';
import {createLibraryUI} from './assets/garden/library.mjs';

const previous=globalThis.document;
const panel={innerHTML:''},input={value:''};
globalThis.document={getElementById:id=>id==='library-panel'?panel:id==='library-q'?input:null};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let count=0;
async function check(name,work){await work();count++;console.log('PASS',name)}
try{
 await check('library offers verified institutional entries without claiming a database session',()=>{
  const ui=createLibraryUI({api:()=>assert.fail('rendering a resource link must not fetch private data')});
  const html=ui.section();
  for(const url of ['https://www.lib.szu.edu.cn/er/access/16084','https://www.lib.szu.edu.cn/er/access/16075','https://www.lib.szu.edu.cn/opac/user/userinfo.aspx'])assert.ok(html.includes(url),url);
  assert.match(html,/知网/);assert.match(html,/万方/);assert.match(html,/个人借阅/);
  assert.doesNotMatch(html,/已获得机构授权|借阅记录已同步/);
 });
 await check('failed searches retain the exact typed keyword for retry',async()=>{
  input.value='量子力学';
  const ui=createLibraryUI({api:async()=>{throw Error('学校暂时连不上')}});
  await ui.click('library-search');
  assert.match(panel.innerHTML,/value="量子力学"/);assert.match(panel.innerHTML,/学校暂时连不上/);
 });
 await check('page navigation requests the next page instead of hiding results after the first twenty',async()=>{
  const calls=[];
  const ui=createLibraryUI({api:async url=>{calls.push(url);return {page:calls.length,items:Array.from({length:20},(_,i)=>({title:'书'+i,ctrl_no:String(i+1)}))}}});
  input.value='计算机';await ui.click('library-search');
  assert.match(panel.innerHTML,/library-next/);assert.match(panel.innerHTML,/第 1 页/);
  await ui.click('library-next');
  assert.match(calls[1],/page=2/);assert.match(panel.innerHTML,/第 2 页/);
  assert.doesNotMatch(panel.innerHTML,/找到 20 条/,'one page is not a known total');
 });
 await check('editing a pending query discards its old results and keeps controls retryable',async()=>{
  let finish;
  const ui=createLibraryUI({api:()=>new Promise(resolve=>{finish=resolve})});
  input.value='旧检索';const pending=ui.click('library-search');await tick();
  input.value='新检索';ui.input({target:{id:'library-q',value:input.value}});
  finish({page:1,items:[{title:'过期结果'}]});await pending;
  assert.doesNotMatch(ui.section(),/过期结果|检索中…/);
  assert.match(ui.section(),/value="新检索"/);
 });
 await check('empty holdings are explained without claiming unavailable books',async()=>{
  const ui=createLibraryUI({api:async()=>({copies:[]})});
  const box={hidden:true,dataset:{},textContent:'',innerHTML:''};
  const button={dataset:{ctrl:'123'},parentElement:{querySelector:()=>box},textContent:''};
  await ui.click('library-copies',button);
  assert.match(box.innerHTML||box.textContent,/未返回馆藏|原页/);
 });
 await check('holdings escape school text and do not color unavailable books as borrowable',async()=>{
  const ui=createLibraryUI({api:async()=>({copies:[{location:'<img onerror=bad()>',call_no:'<script>',status:'不可供出借'}]})});
  const box={hidden:true,dataset:{},textContent:'',innerHTML:''};
  const button={dataset:{ctrl:'123'},parentElement:{querySelector:()=>box},textContent:''};
  await ui.click('library-copies',button);
  assert.ok(box.innerHTML.includes('&lt;img'));assert.ok(box.innerHTML.includes('&lt;script&gt;'));
  assert.doesNotMatch(box.innerHTML,/<img|<script|data-tone="success"/);
 });
 console.log(`${count} library checks passed`);
}finally{globalThis.document=previous}
