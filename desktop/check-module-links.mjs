// 验证 module-links.mjs（run-checks.mjs 的第一步）的模块语法与链接检查真能拦下问题：在临时目录里放几组好坏模块，
// 覆盖本仓库实际用到的导出写法，以及压缩风格源码里容易误判的字符串、模板、正则和注释。
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {scanModule,checkModuleLinks,checkSyntax,listModules} from './module-links.mjs';

let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS',name)}

await check('scanner reads every export form used in this repo',()=>{
 const info=scanModule(`import {a,b as c} from './a.mjs';import d,{e} from './d.mjs';import * as ns from './ns.mjs';import './side.mjs';
export function f(){}export async function g(){}export function* h(){}export class K{}
export const one=1,two={x:[1,2]},three=(x)=>x/2
export let {p,q:r,s=1,...rest}=obj,[u,,v]=arr;
export {c as renamed,d};export {w as w2,default as fromDefault} from './w.mjs';export * from './star.mjs';export * as space from './space.mjs';
export default one;`);
 assert.deepEqual(info.imports.map(x=>[x.spec,x.named,x.default,!!x.namespace]),[['./a.mjs',['a','b'],false,false],['./d.mjs',['e'],true,false],['./ns.mjs',[],false,true],['./side.mjs',[],false,false]]);
 assert.deepEqual([...info.exports].sort(),['K','default','f','g','h','one','p','r','renamed','rest','s','space','three','two','u','v','w2','fromDefault','d'].sort());
 assert.deepEqual(info.reexports.map(x=>[x.spec,x.named]),[['./w.mjs',['w','default']],['./space.mjs',[]]]);
 assert.deepEqual(info.stars.map(x=>x.spec),['./star.mjs']);
});

await check('strings, templates, regex literals and comments never look like imports',()=>{
 const info=scanModule(`// import {x} from './comment.mjs';
/* export const hidden=1; */
const s="import {y} from './string.mjs'",t=\`export const fake=\${{a:1}.a} \${\`import './nested.mjs'\`} }{\`;
const re=/[#*>\`_\\[\\]]/g,div=a/2/3,url='/api/x';
const m=await import('./late.mjs');export const real=re.test('\`')?1:2;
const tpl=\`\${/\`/.test(s)}\`;export {s as alsoReal};`);
 assert.deepEqual(info.imports,[]);assert.deepEqual([...info.exports].sort(),['alsoReal','real']);
 assert.deepEqual(info.dynamic.map(x=>x.spec),['./late.mjs']);
});

const dir=mkdtempSync(path.join(tmpdir(),'szud-links-'));
try{
 const write=(name,text)=>{const file=path.join(dir,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,text);return file};
 const garden=path.join(dir,'garden'),vendor=path.join(garden,'vendor');
 write('garden/lib.mjs','export function helper(){}export const VALUE=1;export {helper as alias};export default VALUE;');
 write('garden/barrel.mjs',"export * from './lib.mjs';export * from './loop.mjs';export {VALUE as renamed} from './lib.mjs';");
 write('garden/loop.mjs',"export * from './barrel.mjs';export const LOOP=1;");
 write('garden/vendor/three.mjs','export const Scene=1;');
 write('electron/shim.mjs',"export * from '../garden/lib.mjs';");
 const good=[
  write('garden/app.mjs',"import VALUE,{helper,alias} from './lib.mjs';import {renamed,LOOP,helper as viaBarrel} from './barrel.mjs';import {AnythingFromVendor} from './vendor/three.mjs';const later=()=>import('./lib.mjs');"),
  write('electron/main.mjs',"import {app} from 'electron';import {readFileSync} from 'node:fs';import {helper} from './shim.mjs';"),
 ];
 const options={vendorDirs:[vendor],browserDirs:[garden]};
 await check('valid imports, re-export chains, export * cycles and vendor files pass',()=>{
  assert.deepEqual(checkModuleLinks(good,options),[]);
 });
 await check('a missing file, a missing named or default export, a bare name in the page and a missing dynamic import all fail',()=>{
  const bad=[
   write('garden/bad-file.mjs',"import {helper} from './nope.mjs';"),
   write('garden/bad-name.mjs',"import {helpr} from './lib.mjs';"),
   write('garden/bad-default.mjs',"import shim from '../electron/shim.mjs';"),
   write('garden/bad-barrel.mjs',"import {default as d} from './barrel.mjs';export {Missing} from './lib.mjs';"),
   write('garden/bad-bare.mjs',"import * as THREE from 'three';"),
   write('garden/bad-dynamic.mjs',"const x=()=>import('./gone.mjs');"),
   write('garden/bad-vendor.mjs',"import {Scene} from './vendor/missing.mjs';"),
  ];
  const errors=checkModuleLinks(bad,options).join('\n');
  for(const expected of [/bad-file\.mjs:1 导入的 '\.\/nope\.mjs' 不存在/,/bad-name\.mjs:1 从 '\.\/lib\.mjs' 导入的 helpr 在 .*lib\.mjs 里没有导出/,/bad-default\.mjs:1 从 '\.\.\/electron\/shim\.mjs' 导入的 默认导出 在 .*shim\.mjs 里没有导出/,
   /bad-barrel\.mjs:1 从 '\.\/barrel\.mjs' 导入的 默认导出/,/bad-barrel\.mjs:1 从 '\.\/lib\.mjs' 导入的 Missing/,/bad-bare\.mjs:1 导入了裸模块名 'three'/,/bad-dynamic\.mjs:1 导入的 '\.\/gone\.mjs' 不存在/,/bad-vendor\.mjs:1 导入的 '\.\/vendor\/missing\.mjs' 不存在/])
   assert.match(errors,expected);
  assert.equal(checkModuleLinks(bad,options).length,8);
 });
 await check('node --check reports syntax errors and the broken module is not used to judge its importers',async()=>{
  const broken=write('garden/broken.mjs','export const fine=1;\nexport const oops=(;');
  const user=write('garden/user.mjs',"import {fine,later} from './broken.mjs';");
  const syntax=await checkSyntax([broken,...good]);
  assert.equal(syntax.errors.length,1);assert.match(syntax.errors[0],/broken\.mjs 语法检查失败/);assert.ok(syntax.broken.has(broken));
  assert.deepEqual(checkModuleLinks([user],{...options,broken:syntax.broken}),[],'语法已经报过的模块不再刷连带报错');
 });
 await check('module listing skips vendor, node_modules and release output',()=>{
  write('electron/node_modules/pkg/index.mjs','export const x=1;');write('electron/release/win-unpacked/resources/app.mjs','export const x=1;');
  assert.deepEqual(listModules(garden,['vendor']).some(file=>file.includes(`${path.sep}vendor${path.sep}`)),false);
  assert.deepEqual(listModules(path.join(dir,'electron'),['node_modules','release']).map(file=>path.basename(file)),['main.mjs','shim.mjs']);
 });
}finally{rmSync(dir,{recursive:true,force:true})}

console.log(`${checks} module link checks passed`);
