// 模块语法与链接检查：node --check 加上对相对 import 与具名导出的静态核对。
// desktop/run-checks.mjs 把它作为第一步运行，desktop/check-module-links.mjs 用临时目录里的坏模块验证它真能拦下错误。
// 本文件故意不以 check- 开头，不会被 run-checks.mjs 当成检查脚本单独运行。
import {execFile} from 'node:child_process';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const desktop=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(desktop);

// ───────────────────────── 模块语法与链接检查 ─────────────────────────
//
// 页面与 Electron 主进程的 .mjs 大多没有被任何检查脚本 import 过（app.mjs、electron/main.mjs 等），
// 语法错误或导入了不存在的导出，要等到用户打开窗口才以白屏或启动失败的形式暴露。这一步不装任何依赖：
//   1. 每个模块跑一次 node --check，拦下语法错误；
//   2. 自己扫描 import / export 语句，核对每个相对导入的目标文件存在、具名导入在目标里确有导出
//      （含 export function/const/let/class、export {a as b}、export {a} from、export * from、export * as ns from、
//      export default）；动态 import('字面量') 只核对文件存在；vendor 下的第三方模块只核对存在。
// 庭院页面在浏览器里运行、没有 import map，所以 garden 模块出现裸模块名（如 'three'）也算错误。

// 把源码切成记号，只为找 import/export：注释丢弃，字符串保留值，模板字符串与正则字面量整体跳过（模板里的 ${} 照常切分）。
const KEYWORDS_BEFORE_EXPRESSION=new Set(['return','typeof','instanceof','in','of','new','delete','void','throw','case','do','else','yield','await','export','import','default','extends']);
export function tokenize(source){
 const tokens=[],stack=[];let i=0,line=1,newline=true;
 const n=source.length;
 const push=(t,v)=>{tokens.push({t,v,line,nl:newline});newline=false};
 const regexAllowed=()=>{const last=tokens.at(-1);if(!last)return true;if(last.t==='name')return KEYWORDS_BEFORE_EXPRESSION.has(last.v);if(last.t==='tpl')return last.v==='${';if(last.t==='num'||last.t==='str'||last.t==='regex')return false;return !(last.v===')'||last.v===']')};
 // 从 i 开始扫模板字符串的一段文字，遇到 ` 结束或 ${ 进入表达式。
 const templateChunk=()=>{while(i<n){const c=source[i];if(c==='\\'){i+=2;continue}if(c==='\n')line++;if(c==='`'){i++;return false}if(c==='$'&&source[i+1]==='{'){i+=2;return true}i++}throw Error(`第 ${line} 行起的模板字符串没有结束`)};
 while(i<n){
  const c=source[i];
  if(c==='\n'){line++;newline=true;i++;continue}
  if(c===' '||c==='\t'||c==='\r'||c==='\f'||c==='\v'||c==='\ufeff'||c==='\u00a0'||c==='\u2028'||c==='\u2029'){i++;continue}
  if(c==='/'&&source[i+1]==='/'){while(i<n&&source[i]!=='\n')i++;continue}
  if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);if(end<0)throw Error(`第 ${line} 行起的注释没有结束`);for(let k=i;k<end;k++)if(source[k]==='\n'){line++;newline=true}i=end+2;continue}
  if(c==='#'&&i===0&&source[1]==='!'){while(i<n&&source[i]!=='\n')i++;continue}
  if(c==='"'||c==="'"){let v='';i++;while(i<n&&source[i]!==c){if(source[i]==='\\'){v+=source[i+1];i+=2;continue}if(source[i]==='\n')throw Error(`第 ${line} 行的字符串没有结束`);v+=source[i++]}if(i>=n)throw Error(`第 ${line} 行的字符串没有结束`);i++;push('str',v);continue}
  if(c==='`'){i++;const tokenLine=line,open=templateChunk();if(open)stack.push(0);tokens.push({t:'tpl',v:open?'${':'`',line:tokenLine,nl:newline});newline=false;continue}
  if(c==='/'&&regexAllowed()){let inClass=false;i++;while(i<n){const d=source[i];if(d==='\\'){i+=2;continue}if(d==='\n')throw Error(`第 ${line} 行的正则字面量没有结束`);if(d==='[')inClass=true;else if(d===']')inClass=false;else if(d==='/'&&!inClass)break;i++}i++;while(i<n&&/[a-z]/i.test(source[i]))i++;push('regex','/');continue}
  if(/[A-Za-z_$\u0080-\uffff]/.test(c)||c==='\\'){let j=i+1;while(j<n&&/[\w$\u0080-\uffff\\]/.test(source[j]))j++;push('name',source.slice(i,j));i=j;continue}
  if(c==='#'){let j=i+1;while(j<n&&/[\w$\u0080-\uffff]/.test(source[j]))j++;push('name',source.slice(i,j));i=j;continue}
  if(/[0-9]/.test(c)||c==='.'&&/[0-9]/.test(source[i+1])){let j=i+1;while(j<n&&/[\w.]/.test(source[j]))j++;push('num',source.slice(i,j));i=j;continue}
  if(c==='{'){if(stack.length)stack[stack.length-1]++;push('punct','{');i++;continue}
  if(c==='}'){
   // 模板表达式 ${ … } 的结尾：回到模板文字继续扫。
   if(stack.length&&stack.at(-1)===0){stack.pop();i++;const open=templateChunk();if(open)stack.push(0);tokens.push({t:'tpl',v:open?'${':'`',line,nl:false});continue}
   if(stack.length)stack[stack.length-1]--;push('punct','}');i++;continue}
  if(c==='.'&&source[i+1]==='.'&&source[i+2]==='.'){push('punct','...');i+=3;continue}
  push('punct',c);i++;
 }
 if(stack.length)throw Error('模板字符串里的 ${ 没有闭合');
 return tokens;
}

// 从记号里读出模块的导入导出。只看顶层（花括号、圆括号、方括号深度为 0）的 import/export 语句，动态 import() 任何位置都收集。
export function scanModule(source){
 const tokens=tokenize(source),imports=[],exports=new Set(),reexports=[],stars=[],dynamic=[];
 let depth=0,i=0;
 const is=(k,t,v)=>tokens[k]&&tokens[k].t===t&&(v===undefined||tokens[k].v===v);
 const fail=(k,message)=>{throw Error(`第 ${tokens[k]?.line??tokens.at(-1)?.line??1} 行：${message}`)};
 const name=k=>tokens[k]&&(tokens[k].t==='name'||tokens[k].t==='str')?tokens[k].v:fail(k,'这里应该是一个名字');
 // 读 { a, b as c, 'x' as d }，返回 [[原名, 对外名], …]，i 停在 } 之后。
 const specifiers=()=>{const list=[];i++;while(!is(i,'punct','}')){if(i>=tokens.length)fail(i,'花括号没有闭合');const original=name(i);i++;let alias=original;if(is(i,'name','as')){alias=name(i+1);i+=2}list.push([original,alias]);if(is(i,'punct',','))i++;else if(!is(i,'punct','}'))fail(i,'导入导出列表里缺少逗号')}i++;return list};
 const fromClause=()=>{if(!is(i,'name','from')||!is(i+1,'str'))fail(i,'缺少 from \'模块\'');const spec=tokens[i+1].v,line=tokens[i+1].line;i+=2;return {spec,line}};
 // 跳过一个表达式（变量初始值）：到深度 0 的逗号、分号，或换行后另起的一条顶层语句为止。
 const STATEMENT=new Set(['export','import','function','const','let','var','class','async','if','for','while','return','try','switch','throw']);
 const skipExpression=()=>{let d=0;while(i<tokens.length){const tok=tokens[i];if(d===0&&tok.t==='punct'&&(tok.v===','||tok.v===';'))return;if(d===0&&tok.nl&&tok.t==='name'&&STATEMENT.has(tok.v)&&!is(i-1,'punct','.'))return;if(tok.t==='punct'&&'([{'.includes(tok.v))d++;else if(tok.t==='punct'&&')]}'.includes(tok.v)){if(d===0)return;d--}i++}};
 // 解构导出里真正绑定的名字：冒号前的是属性名，等号后的是默认值。
 const pattern=()=>{const open=tokens[i].v,close=open==='{'?'}':']';let d=0;const names=[];while(i<tokens.length){const tok=tokens[i];if(tok.t==='punct'&&(tok.v==='{'||tok.v==='[')){d++;i++;continue}if(tok.t==='punct'&&(tok.v==='}'||tok.v===']')){d--;i++;if(d===0)return names;continue}if(tok.t==='punct'&&tok.v==='='){i++;skipDefault();continue}if(tok.t==='name'&&!is(i+1,'punct',':'))names.push(tok.v);i++}fail(i,`解构模式缺少 ${close}`)};
 const skipDefault=()=>{let d=0;while(i<tokens.length){const tok=tokens[i];if(tok.t==='punct'&&'([{'.includes(tok.v))d++;else if(tok.t==='punct'&&')]}'.includes(tok.v)){if(d===0)return;d--}else if(d===0&&tok.t==='punct'&&tok.v===',')return;i++}};
 while(i<tokens.length){
  const tok=tokens[i];
  if(tok.t==='name'&&tok.v==='import'&&!is(i-1,'punct','.')){
   if(is(i+1,'punct','(')){if(is(i+2,'str')&&is(i+3,'punct',')'))dynamic.push({spec:tokens[i+2].v,line:tokens[i+2].line});i++;continue}
   if(is(i+1,'punct','.')){i++;continue}
   if(depth===0){
    const line=tok.line;i++;
    if(is(i,'str')){imports.push({spec:tokens[i].v,line,named:[],default:false});i++;continue}
    const record={named:[],default:false,namespace:false};
    if(is(i,'name')&&tokens[i].v!=='from'||is(i,'name','from')&&is(i+1,'name','from')){record.default=true;i++;if(is(i,'punct',','))i++}
    if(is(i,'punct','*')){if(!is(i+1,'name','as'))fail(i,'import * 后面要有 as');record.namespace=true;i+=3}
    else if(is(i,'punct','{'))record.named=specifiers().map(([original])=>original);
    const {spec}=fromClause();imports.push({spec,line,...record});continue;
   }
  }
  if(tok.t==='name'&&tok.v==='export'&&depth===0&&!is(i-1,'punct','.')){
   const line=tok.line;i++;
   if(is(i,'name','default')){exports.add('default');i++;continue}
   if(is(i,'name','async')&&is(i+1,'name','function'))i++;
   if(is(i,'name','function')||is(i,'name','class')){i++;if(is(i,'punct','*'))i++;exports.add(name(i));i++;continue}
   if(is(i,'name','const')||is(i,'name','let')||is(i,'name','var')){
    i++;
    for(;;){
     if(is(i,'punct','{')||is(i,'punct','['))pattern().forEach(bound=>exports.add(bound));
     else{exports.add(name(i));i++}
     if(is(i,'punct','=')){i++;skipExpression()}
     if(is(i,'punct',',')){i++;continue}
     break;
    }
    continue;
   }
   if(is(i,'punct','{')){const list=specifiers();if(is(i,'name','from')){const {spec}=fromClause();reexports.push({spec,line,named:list.map(([original])=>original)})}for(const [,alias] of list)exports.add(alias);continue}
   if(is(i,'punct','*')){i++;if(is(i,'name','as')){exports.add(name(i+1));i+=2;const {spec}=fromClause();reexports.push({spec,line,named:[]})}else{const {spec}=fromClause();stars.push({spec,line})}continue}
   fail(i,'认不出这条 export 语句');
  }
  if(tok.t==='punct'&&'([{'.includes(tok.v))depth++;
  else if(tok.t==='punct'&&')]}'.includes(tok.v))depth--;
  i++;
 }
 return {imports,exports,reexports,stars,dynamic};
}

// 列出要检查的模块：garden 下不含 vendor，electron 下不含 node_modules 和打包产物 release。
export function listModules(dir,skip){
 const found=[];
 const walk=current=>{for(const entry of readdirSync(current,{withFileTypes:true})){const full=path.join(current,entry.name);if(entry.isDirectory()){if(!skip.includes(entry.name))walk(full)}else if(entry.name.endsWith('.mjs'))found.push(full)}};
 walk(dir);return found.sort();
}

// 静态核对导入导出。files 是要检查的模块；vendorDirs 下的模块只核对存在，不解析导出；
// browserDirs 下的模块在浏览器里运行，不允许裸模块名；broken 是已知语法有错的模块，不再拿它们的导出去核对别人，免得一处错误刷出一串连带报错。
// 返回错误说明数组，空数组表示通过。
export function checkModuleLinks(files,{vendorDirs=[],browserDirs=[],broken=new Set(),read=file=>readFileSync(file,'utf8')}={}){
 const errors=[],cache=new Map();
 const rel=file=>path.relative(root,file).split(path.sep).join('/');
 const inside=(file,dirs)=>dirs.some(dir=>{const r=path.relative(dir,file);return r&&!r.startsWith('..')&&!path.isAbsolute(r)});
 const scan=file=>{if(!cache.has(file)){try{cache.set(file,scanModule(read(file)))}catch(e){cache.set(file,null);errors.push(`${rel(file)}：无法分析导入导出（${e.message}）`)}}return cache.get(file)};
 const isFile=file=>{try{return statSync(file).isFile()}catch{return false}};
 // 模块对外的全部名字：自己的导出，加上 export * 从别处转出的名字（不含 default）。
 // 结果按文件缓存；visiting 只挡住 export * 的循环，不影响菱形依赖里第二次读到同一个模块。
 const exported=new Map();
 const exportsOf=(file,visiting=new Set())=>{if(exported.has(file))return exported.get(file);if(visiting.has(file))return new Set();visiting.add(file);const info=scan(file);let names=null;if(info){names=new Set(info.exports);for(const star of info.stars){const target=path.resolve(path.dirname(file),star.spec);if(!isFile(target)||inside(target,vendorDirs))continue;const more=exportsOf(target,visiting);if(!more){names=null;break}for(const n of more)if(n!=='default')names.add(n)}}visiting.delete(file);exported.set(file,names);return names};
 for(const file of files){
  if(broken.has(file))continue;
  const info=scan(file);if(!info)continue;
  const links=[...info.imports.map(x=>({...x,kind:'import'})),...info.reexports.map(x=>({...x,kind:'export'})),...info.stars.map(x=>({...x,named:[],kind:'export'})),...info.dynamic.map(x=>({...x,named:[],kind:'dynamic'}))];
  for(const link of links){
   const where=`${rel(file)}:${link.line}`;
   if(!/^\.{1,2}\//.test(link.spec)){
    if(inside(file,browserDirs))errors.push(`${where} 导入了裸模块名 '${link.spec}'：页面没有 import map，浏览器无法解析`);
    continue;
   }
   const target=path.resolve(path.dirname(file),link.spec);
   if(!isFile(target)){errors.push(`${where} 导入的 '${link.spec}' 不存在`);continue}
   if(inside(target,vendorDirs)||link.kind==='dynamic'||broken.has(target))continue;
   const wanted=[...(link.named||[]),...(link.default?['default']:[])];
   if(!wanted.length)continue;
   const available=exportsOf(target);if(!available)continue;
   for(const name of wanted)if(!available.has(name))errors.push(`${where} 从 '${link.spec}' 导入的 ${name==='default'?'默认导出':name} 在 ${rel(target)} 里没有导出`);
  }
 }
 return errors;
}

// node --check 逐个检查语法；并发跑，模块多也只要几秒。
// 返回 {errors,broken}：broken 是语法检查没通过的模块。
export async function checkSyntax(files,{concurrency=8}={}){
 const run=promisify(execFile),errors=[],broken=new Set();let next=0;
 const worker=async()=>{while(next<files.length){const file=files[next++];try{await run(process.execPath,['--check',file],{windowsHide:true,timeout:60000})}catch(e){broken.add(file);const detail=String(e.stderr||e.message).trim().split('\n').filter(Boolean).slice(0,6).join('\n    ');errors.push(`${path.relative(root,file).split(path.sep).join('/')} 语法检查失败：\n    ${detail}`)}}};
 await Promise.all(Array.from({length:Math.min(concurrency,files.length)},worker));
 return {errors:errors.sort(),broken};
}

export async function moduleLinkStep(){
 const garden=path.join(desktop,'assets','garden'),electron=path.join(desktop,'electron');
 const files=[...listModules(garden,['vendor']),...listModules(electron,['node_modules','release'])];
 if(!files.length)return {files,errors:['没有找到任何 .mjs 模块，请确认从仓库里运行']};
 const syntax=await checkSyntax(files);
 const errors=[...syntax.errors,...checkModuleLinks(files,{vendorDirs:[path.join(garden,'vendor')],browserDirs:[garden],broken:syntax.broken})];
 return {files,errors};
}
