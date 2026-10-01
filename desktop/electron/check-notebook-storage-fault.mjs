import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,lstatSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {withNotebookStorageFailure} from './notebook-storage-fault.mjs';
const root=mkdtempSync(path.join(tmpdir(),'szu-storage-fault-'));
try{
  const configDir=path.join(root,'profile'),userData=path.join(configDir,'electron-profile');mkdirSync(userData,{recursive:true});
  const file=path.join(configDir,'notebook-v1.json');writeFileSync(file,'original bytes');
  const lock=file+'.lock';writeFileSync(lock,'original lock');
  const opts={configDir,userData,reportPath:path.join(root,'report.json'),allowedRoot:root};
  await assert.rejects(withNotebookStorageFailure({...opts,allowedRoot:userData},()=>assert.fail()),/outside/);
  await assert.rejects(withNotebookStorageFailure({...opts,userData:root},()=>assert.fail()),/Electron profile/);
  assert.equal(readFileSync(file,'utf8'),'original bytes');
  await assert.rejects(withNotebookStorageFailure(opts,async()=>{assert.ok(lstatSync(lock).isDirectory());assert.equal(readFileSync(file,'utf8'),'original bytes');throw Error('injected assertion failure');}),/injected assertion/);
  assert.equal(readFileSync(file,'utf8'),'original bytes');assert.equal(existsSync(lock+'.smoke-original'),false);
  await withNotebookStorageFailure(opts,async()=>{assert.ok(lstatSync(lock).isDirectory());});
  assert.equal(readFileSync(file,'utf8'),'original bytes');
  writeFileSync(lock+'.smoke-original','pre-existing recovery');
  await assert.rejects(withNotebookStorageFailure(opts,()=>assert.fail()),/existing recovery/);
  assert.equal(readFileSync(file,'utf8'),'original bytes');assert.equal(readFileSync(lock+'.smoke-original','utf8'),'pre-existing recovery');
  console.log('PASS isolated storage fault rejects unsafe paths and restores exact bytes on success or failure');
}finally{rmSync(root,{recursive:true,force:true});}
