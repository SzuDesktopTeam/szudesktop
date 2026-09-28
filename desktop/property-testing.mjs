// 性质测试（property-based testing）的公共小件：带种子的 PRNG、随机生成器、通用的反例缩小器和 forAll 运行器。
// 本文件故意不以 check- 开头，不会被 run-checks.mjs 当成检查脚本单独运行；由 desktop/check-properties*.mjs 导入。
// 不引入任何 npm 依赖。每条性质默认跑 300 个随机用例；失败时打印种子与缩小后的最小反例，
// 并继续跑其余性质，最后统一汇总（同一条性质最多记录 3 种不同的失败信息，避免一个已知问题遮住别的问题）。
// 复现：PROPERTY_SEED=<种子> node desktop/check-properties.mjs
import {AssertionError} from 'node:assert/strict';

// Mulberry32：与 puzzle2048.mjs 使用的是同一族算法，但这里只用于生成测试输入。
export function mulberry32(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}

export const ASCII=Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join('');
export const CJK='深大学生的桌面学习伙伴荔枝庭院小萝卜草莓蓝莓专注委托今天明天课程笔记';
export const EMOJI=['😀','🍓','🐢','🐧','👩‍💻'];
// 容易出问题的字符：HTML 特殊字符、Markdown 记号、控制字符、行终止符、BOM、不换行空格、孤立代理项。
export const TRICKY=['<','>','&','"',"'",'`','*','_','#','[',']','(',')','\\','/','\n','\r','\t','\0','\b','\f','\u2028','\u2029','\uFEFF','\u00a0','\ud83d','\ude00'];
export const PROTO_KEYS=['constructor','__proto__','toString','hasOwnProperty','valueOf','length'];

export class Rng{
  constructor(seed){this.seed=seed>>>0;this.next=mulberry32(this.seed)}
  float(){return this.next()}
  // 闭区间整数
  int(lo,hi){return lo+Math.floor(this.next()*(hi-lo+1))}
  bool(p=0.5){return this.next()<p}
  pick(list){return list[Math.floor(this.next()*list.length)]}
  // pairs: [[权重, 值或工厂], ...]；值为函数时调用它
  weighted(pairs){
    const total=pairs.reduce((n,[w])=>n+w,0);let r=this.next()*total;
    for(const [w,v] of pairs){r-=w;if(r<0)return typeof v==='function'?v():v}
    const last=pairs.at(-1)[1];return typeof last==='function'?last():last;
  }
  shuffle(list){const out=[...list];for(let i=out.length-1;i>0;i--){const j=this.int(0,i);[out[i],out[j]]=[out[j],out[i]]}return out}
  array(n,make){return Array.from({length:n},(_,i)=>make(i))}
  // 长度 0..max 的字符串；默认字母表混合 ASCII、汉字、emoji 与刁钻字符
  text(max=12,{ascii=6,cjk=3,emoji=1,tricky=2}={}){
    const n=this.int(0,max);let out='';
    for(let i=0;i<n;i++)out+=this.weighted([[ascii,()=>ASCII[this.int(0,ASCII.length-1)]],[cjk,()=>CJK[this.int(0,CJK.length-1)]],[emoji,()=>this.pick(EMOJI)],[tricky,()=>this.pick(TRICKY)]]);
    return out;
  }
  ascii(max=12){const n=this.int(0,max);let out='';for(let i=0;i<n;i++)out+=ASCII[this.int(0,ASCII.length-1)];return out}
  // 数字：整数为主，混入小数、负数、巨大数；allowSpecial 时还混入 NaN/Infinity/-0（这些不是 JSON）
  number(allowSpecial=false){
    return this.weighted([[5,()=>this.int(0,20)],[2,()=>this.int(-5,5)],[2,()=>this.int(0,1e6)],[1,()=>this.float()*100],[1,()=>this.pick([1e8,1e8+1,1e7,1e7+1,1e9,2**31,2**32,2**53,-1,0.5,1e21,-1e6])],[allowSpecial?2:0,()=>this.pick([NaN,Infinity,-Infinity,-0])]]);
  }
  // 任意 JSON 值；keys 提供领域相关的键名池，depth 控制嵌套
  json(depth=3,{keys=[],allowSpecial=false}={}){
    const scalar=()=>this.weighted([[1,null],[1,()=>this.bool()],[3,()=>this.number(allowSpecial)],[3,()=>this.text(8)]]);
    if(depth<=0)return scalar();
    return this.weighted([[4,scalar],[2,()=>this.array(this.int(0,4),()=>this.json(depth-1,{keys,allowSpecial}))],[2,()=>{
      const out={};for(let i=0,n=this.int(0,4);i<n;i++)out[this.key(keys)]=this.json(depth-1,{keys,allowSpecial});return out;
    }]]);
  }
  key(keys=[]){return this.weighted([[keys.length?4:0,()=>this.pick(keys)],[1,()=>this.pick(PROTO_KEYS)],[2,()=>this.ascii(4)]])}
}

// —— 通用缩小器：只依赖值的 JSON 形状，删元素、删键、缩短字符串、缩小数字，直到再也找不到仍失败的更小候选 ——
function* candidates(v){
  if(Array.isArray(v)){
    if(v.length)yield [];
    if(v.length>2){yield v.slice(0,v.length>>1);yield v.slice(v.length>>1)}
    for(let i=0;i<v.length;i++)yield [...v.slice(0,i),...v.slice(i+1)];
    for(let i=0;i<v.length;i++)for(const c of candidates(v[i]))yield v.map((x,j)=>j===i?c:x);
  }else if(v&&typeof v==='object'){
    const keys=Object.keys(v),without=drop=>{const out={};for(const other of keys)if(!drop.includes(other))out[other]=v[other];return out};
    if(keys.length>2){yield without(keys.slice(0,keys.length>>1));yield without(keys.slice(keys.length>>1))}
    for(const k of keys)yield without([k]);
    for(const k of keys)for(const c of candidates(v[k])){const out={};for(const other of keys)out[other]=other===k?c:v[other];yield out}
  }else if(typeof v==='string'){
    if(!v.length)return;
    yield '';
    if(v.length>1){yield v.slice(0,v.length>>1);yield v.slice(v.length>>1)}
    for(let i=0;i<Math.min(v.length,48);i++)yield v.slice(0,i)+v.slice(i+1);
    if(/[^a-z]/.test(v))yield v.replace(/[^a-z]/g,'a');
  }else if(typeof v==='number'){
    if(Number.isNaN(v))return;
    if(v!==0)yield 0;
    if(!Number.isFinite(v)){yield v>0?1e9:-1e9;return}
    if(!Number.isInteger(v))yield Math.trunc(v);
    if(Math.abs(v)>1)yield Math.trunc(v/2);
    if(v<0)yield -v;
    if(Math.abs(v)>1)yield v-Math.sign(v);
  }else if(v===true)yield false;
}
export function shrink(value,fails,budget=4000){
  let current=value,used=0,improved=true;
  const stillFails=v=>{if(used++>=budget)return false;try{return fails(v)===true}catch{return false}};
  while(improved&&used<budget){improved=false;for(const c of candidates(current)){if(stillFails(c)){current=c;improved=true;break}}}
  return current;
}
export async function shrinkAsync(value,fails,budget=400){
  let current=value,used=0,improved=true;
  const stillFails=async v=>{if(used++>=budget)return false;try{return (await fails(v))===true}catch{return false}};
  while(improved&&used<budget){improved=false;for(const c of candidates(current)){if(await stillFails(c)){current=c;improved=true;break}}}
  return current;
}

// —— 运行器 ——
export const BASE_SEED=(Number(process.env.PROPERTY_SEED)>>>0)||20260928;
const failures=[];let passed=0,checks=0;
const replacer=(_,v)=>typeof v==='number'&&!Number.isFinite(v)?`<${String(v)}>`:v===undefined?'<undefined>':typeof v==='bigint'?`<${v}n>`:typeof v==='function'?'<function>':typeof v==='symbol'?'<symbol>':v;
export function show(value,max=900){let text;try{text=JSON.stringify(value,replacer)}catch{text=String(value)}text=String(text);return text.length>max?text.slice(0,max)+`…(共 ${text.length} 字符)`:text}
function record(name,error,extra={}){
  failures.push({name,message:extra.message||error?.message||String(error),...extra});
  console.log('FAIL',name);
  if(extra.seed!==undefined)console.log(`  种子 ${extra.seed}（第 ${extra.index} 个用例）`);
  console.log('  '+String(extra.message||error?.message||error).split('\n').slice(0,6).join('\n  '));
  if('counterexample' in extra)console.log('  最小反例: '+show(extra.counterexample));
}
// 失败信息里的数字与引号内容随反例变化，归一化后才能判断“同一种失败”，缩小器据此判定候选是否仍然失败
const signature=message=>String(message).replace(/"(?:[^"\\]|\\.)*"/g,'"…"').replace(/[\d.]+/g,'#').slice(0,160);

export function test(name,fn){checks++;try{fn();passed++;console.log('PASS',name)}catch(e){record(name,e)}}
export async function testAsync(name,fn){checks++;try{await fn();passed++;console.log('PASS',name)}catch(e){record(name,e)}}

// gen(rng,size) 生成一个用例（size 从 0 渐增到 1，前面的用例更小）；prop(value) 用 assert 断言。
// prop 必须只依赖 value（不能自带随机性），否则缩小出来的反例不可复现。
export function forAll(name,gen,prop,{cases=300,seed=BASE_SEED,shrinkBudget=4000,distinct=3}={}){
  checks++;const seen=new Map(),started=Date.now();
  for(let i=0;i<cases;i++){
    const caseSeed=(seed+Math.imul(i+1,0x9E3779B1))>>>0,size=Math.min(1,(i+1)/Math.max(1,Math.min(cases,80)));
    let value;
    try{value=gen(new Rng(caseSeed),size)}catch(e){record(name,e,{seed:caseSeed,index:i,message:'生成器自身抛错: '+e.message});return}
    try{prop(value)}catch(e){
      if(!(e instanceof AssertionError)){record(name,e,{seed:caseSeed,index:i,counterexample:value,message:'性质函数抛出非断言错误: '+(e?.stack||e)});return}
      const key=signature(e.message);
      if(seen.has(key))continue;
      if(seen.size>=distinct)continue;
      seen.set(key,true);
      const fails=v=>{try{prop(v);return false}catch(err){return err instanceof AssertionError&&signature(err.message)===key}};
      const small=shrink(value,fails,shrinkBudget);
      let message=e.message;try{prop(small)}catch(err){message=err.message}
      record(name,e,{seed:caseSeed,index:i,counterexample:small,message});
    }
  }
  if(!seen.size){passed++;console.log('PASS',name,`(${cases} 个用例，${((Date.now()-started)/1000).toFixed(1)}s)`)}
}
export async function forAllAsync(name,gen,prop,{cases=200,seed=BASE_SEED,shrinkBudget=400,distinct=3}={}){
  checks++;const seen=new Map(),started=Date.now();
  for(let i=0;i<cases;i++){
    const caseSeed=(seed+Math.imul(i+1,0x9E3779B1))>>>0,size=Math.min(1,(i+1)/Math.max(1,Math.min(cases,80)));
    let value;
    try{value=gen(new Rng(caseSeed),size)}catch(e){record(name,e,{seed:caseSeed,index:i,message:'生成器自身抛错: '+e.message});return}
    try{await prop(value)}catch(e){
      if(!(e instanceof AssertionError)){record(name,e,{seed:caseSeed,index:i,counterexample:value,message:'性质函数抛出非断言错误: '+(e?.stack||e)});return}
      const key=signature(e.message);
      if(seen.has(key)||seen.size>=distinct)continue;
      seen.set(key,true);
      const fails=async v=>{try{await prop(v);return false}catch(err){return err instanceof AssertionError&&signature(err.message)===key}};
      const small=await shrinkAsync(value,fails,shrinkBudget);
      let message=e.message;try{await prop(small)}catch(err){message=err.message}
      record(name,e,{seed:caseSeed,index:i,counterexample:small,message});
    }
  }
  if(!seen.size){passed++;console.log('PASS',name,`(${cases} 个用例，${((Date.now()-started)/1000).toFixed(1)}s)`)}
}

// 深度遍历，找出 NaN/Infinity/undefined/函数等不能进 JSON 的值，返回首个路径或 null
export function firstUnserializable(value,path='$'){
  if(typeof value==='number')return Number.isFinite(value)?null:path;
  if(value===undefined||typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')return path;
  // 稀疏数组的空洞经 JSON 会变成 null，不算不可序列化
  if(Array.isArray(value)){for(let i=0;i<value.length;i++){if(!(i in value))continue;const hit=firstUnserializable(value[i],`${path}[${i}]`);if(hit)return hit}return null}
  if(value&&typeof value==='object'){for(const k of Object.keys(value)){const hit=firstUnserializable(value[k],`${path}.${k}`);if(hit)return hit}}
  return null;
}
export const clone=v=>JSON.parse(JSON.stringify(v));

export function report(){
  console.log(`\n随机种子 ${BASE_SEED}（PROPERTY_SEED 可覆盖）`);
  if(failures.length){
    console.error(`\n${passed}/${checks} checks passed，${failures.length} 处失败：`);
    for(const f of failures)console.error(`  - ${f.name}${f.seed!==undefined?`（种子 ${f.seed}）`:''}: ${String(f.message).split('\n')[0]}`);
    process.exit(1);
  }
  console.log(`${passed} checks passed`);
}
