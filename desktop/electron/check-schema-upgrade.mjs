import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createState,SAVE_SCHEMA} from '../assets/garden/engine.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),candidate=path.resolve(here,'../assets/garden');
const root=mkdtempSync(path.join(tmpdir(),'szu-schema-probe-check-'));
const app=readFileSync(path.join(candidate,'app.mjs'),'utf8');
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name)}
function scenario(name,{schema=SAVE_SCHEMA-1,accept=false,write='',corrupt=false}={}){
 const directory=path.join(root,name);mkdirSync(directory);const baseline=path.join(directory,'baseline');mkdirSync(baseline);
 const workspace=path.join(directory,'workspace-v1.json'),data=createState();data.profile.name='合成升级检查';
 const before=Buffer.from(JSON.stringify({version:1,revision:1,data}));writeFileSync(workspace,before);
 writeFileSync(path.join(baseline,'engine.mjs'),`
import {writeFileSync} from 'node:fs';
import {createState as currentState,normalize as currentNormalize} from ${JSON.stringify(pathToFileURL(path.join(candidate,'engine.mjs')).href)};
export const SAVE_SCHEMA=${schema};
export const createState=()=>({...currentState(),schema:SAVE_SCHEMA});
export function normalize(raw){
 ${corrupt?`writeFileSync(${JSON.stringify(workspace)},'unexpected overwrite');`:''}
 ${accept?'':`if(raw.schema>SAVE_SCHEMA)throw Error('这份存档来自更新版本，请先把应用更新到最新版。原文件不会被改动。');`}
 return currentNormalize(raw);
}
`);
 const marker='if(workspaceFailure||snapshot.data)render();';assert.ok(app.includes(marker));
 const extra=write==='api'?"await api('/api/workspace',{version:1,data:state});":write==='commit'?'await commit(state);':'';
 writeFileSync(path.join(baseline,'app.mjs'),extra?app.replace(marker,extra+marker):app);
 const result=spawnSync(process.execPath,[path.join(here,'probe-schema-upgrade.mjs'),baseline,candidate,workspace],{encoding:'utf8',timeout:30000});
 return {result,before,workspace};
}
try{
 check('published frontend refuses a real candidate source-linked save without writing either file',()=>{
  const {result,before,workspace}=scenario('normal');assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.deepEqual(report,{schemaChanged:true,baselineSchema:SAVE_SCHEMA-1,candidateSchema:SAVE_SCHEMA,baselineFrontendRefused:true,writes:0,fixtureUnchanged:true,workspaceUnchanged:true});
  assert.ok(readFileSync(workspace).equals(before));
 });
 check('equal schemas report an explicit skip for later releases',()=>{
  const {result}=scenario('same',{schema:SAVE_SCHEMA,accept:true});assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);assert.equal(report.schemaChanged,false);assert.equal(report.baselineFrontendRefused,false);
  assert.equal(report.writes,0);assert.equal(report.workspaceUnchanged,true);
 });
 check('a baseline that accepts the higher schema fails the probe',()=>{
  const {result}=scenario('accepts',{accept:true});assert.notEqual(result.status,0);assert.match(result.stderr,/baseline normalize did not refuse/);
 });
 check('the actual startup path cannot write through API or commit after a refusal',()=>{
  for(const write of ['api','commit']){const {result}=scenario('writes-'+write,{write});assert.notEqual(result.status,0);assert.match(result.stderr,/baseline frontend attempted a write/)}
 });
 check('an unexpected change to the original workspace fails even when normalize refuses',()=>{
  const {result}=scenario('corrupt',{corrupt:true});assert.notEqual(result.status,0);assert.match(result.stderr,/original workspace changed/);
 });
 console.log(`${checks} schema upgrade probe checks passed`);
}finally{
 // The directory was created by this process under the OS temporary directory.
 const resolved=path.resolve(root),parent=path.resolve(tmpdir());
 assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('szu-schema-probe-check-'));
 rmSync(resolved,{recursive:true,force:true});
}
