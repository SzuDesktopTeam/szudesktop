// Run against modules served by the two verified installation packages. No network
// calls or user-profile lookup: the caller supplies its disposable smoke workspace.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';

async function probe(baselineDirectory,candidateDirectory,workspacePath){
 const workspace=path.resolve(workspacePath),original=readFileSync(workspace);
 let fixtureDirectory,fixtureFile,fixtureBytes;
 try{
  const baseline=await import(pathToFileURL(path.resolve(baselineDirectory,'engine.mjs')).href);
  const candidate=await import(pathToFileURL(path.resolve(candidateDirectory,'engine.mjs')).href);
  const baselineSchema=baseline.createState().schema,candidateSchema=candidate.createState().schema;
  assert.ok(Number.isInteger(baselineSchema)&&Number.isInteger(candidateSchema),'package rules did not report an integer schema');
  assert.ok(candidateSchema>=baselineSchema,'candidate schema is older than the pinned baseline');
  const snapshot=JSON.parse(original.toString('utf8')),now=Date.now();
  let data=candidate.normalize(snapshot.data,now);
  const sources=[{type:'note',noteId:'synthetic-schema-note',title:'合成笔记回链'},
   {type:'notice',url:'https://jwb.szu.edu.cn/info/schema-probe.htm',title:'合成公告回链'}];
  for(const [index,source] of sources.entries()){
   const id='schema-probe-'+randomUUID();
   data=candidate.act(data,{type:'todoAdd',id,text:'合成升级检查 '+index,date:'',source},now);
   assert.equal(JSON.stringify(data.todos.find(todo=>todo.id===id)?.source),JSON.stringify(source),'candidate rules did not preserve the new todo source');
  }
  data=candidate.normalize(data,now);
  assert.equal(data.schema,candidateSchema,'candidate normalization did not write its own schema');
  fixtureDirectory=mkdtempSync(path.join(path.dirname(workspace),'.schema-upgrade-'));
  fixtureFile=path.join(fixtureDirectory,'workspace-v1.json');
  fixtureBytes=Buffer.from(JSON.stringify({...snapshot,data}));
  writeFileSync(fixtureFile,fixtureBytes,{flag:'wx'});
  const report={schemaChanged:candidateSchema>baselineSchema,baselineSchema,candidateSchema,
   baselineFrontendRefused:false,writes:0,fixtureUnchanged:true,workspaceUnchanged:true};
  if(!report.schemaChanged)return report;

  const loaded=JSON.parse(readFileSync(fixtureFile).toString('utf8')),input=structuredClone(loaded.data),before=JSON.stringify(input);
  let refusal;
  try{baseline.normalize(input,now)}catch(error){refusal=error}
  assert.ok(refusal&&/来自更新版本/.test(refusal.message),'baseline normalize did not refuse the newer save');
  assert.equal(JSON.stringify(input),before,'baseline normalize changed the refused input');

  // Exercise the old package's real startup error path, as in check-save-compat.
  // The school/pet UI is not started; attempted writes are recorded, never sent.
  const source=readFileSync(path.resolve(baselineDirectory,'app.mjs'),'utf8');
  const startupAt=source.lastIndexOf("try{let snapshot=null;try{snapshot=await api('/api/workspace')");
  const helperAt=source.indexOf('function enterWorkspaceFailure('),helperEnd=source.indexOf('async function recoverWorkspace(',helperAt);
  assert.ok(startupAt>=0&&helperAt>=0&&helperEnd>helperAt,'published app startup boundaries changed; update the probe');
  const writes=[],events=[];
  const context=vm.createContext({normalize:baseline.normalize,createState:baseline.createState,stampVersion(){},
   notebookUI:{load:async()=>{}},campusUI:{loadSession(){},loadCas(){},loadSources(){}},schoolUI:{load(){}},pianoUI:{load(){}},academicUI:{load(){}},
   revision:0,state:null,saved:false,workspaceReady:false,workspaceFailure:null,
   $:()=>{throw Error('baseline startup entered an unexpected fatal page')},
   api:async(endpoint,body,method='GET')=>{
    if(body!==undefined||method!=='GET')writes.push({endpoint,method});
    if(endpoint==='/api/workspace')return structuredClone(loaded);
    if(endpoint==='/api/credential')return {saved:false};
    if(endpoint==='/api/health')return {app_version:'synthetic-probe'};
    throw Error('unexpected API in baseline startup');
   },
   commit:async()=>{writes.push({endpoint:'commit'})},render(){events.push('render')},pollNetwork(){},
   showGuide(){throw Error('a refused save must not open onboarding')},
  });
  vm.runInContext(source.slice(helperAt,helperEnd),context,{timeout:1000});
  await vm.runInContext(`(async()=>{${source.slice(startupAt)}})()`,context,{timeout:1000});
  assert.equal(writes.length,0,'baseline frontend attempted a write after refusing the save');
  assert.equal(context.workspaceReady,false,'baseline frontend must remain in the read-only failure state');
  assert.ok(/来自更新版本/.test(context.workspaceFailure?.message||''),'baseline frontend did not preserve the upgrade explanation');
  assert.equal(JSON.stringify(context.workspaceFailure.raw),JSON.stringify(loaded.data),'baseline frontend did not preserve the original save for export');
  assert.ok(events.includes('render'),'baseline frontend did not render its refusal state');
  report.baselineFrontendRefused=true;
  return report;
 }finally{
  // Check actual bytes, not parsed equality: a rewrite or backup substitution is a failure.
  try{
   assert.ok(readFileSync(workspace).equals(original),'original workspace changed during the downgrade probe');
   if(fixtureBytes)assert.ok(readFileSync(fixtureFile).equals(fixtureBytes),'synthetic fixture changed during the downgrade probe');
  }finally{
   if(fixtureFile)unlinkSync(fixtureFile);
   if(fixtureDirectory)rmdirSync(fixtureDirectory);
  }
 }
}

try{
 assert.equal(process.argv.length,5,'usage: probe-schema-upgrade.mjs baseline-modules candidate-modules workspace-v1.json');
 const result=await probe(...process.argv.slice(2));
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){
 process.stderr.write('Schema upgrade probe failed: '+error.message+'\n');
 process.exitCode=1;
}
