import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,lstatSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {storageFaultRoot,withNotebookStorageFailure} from './notebook-storage-fault.mjs';
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
  // 本机 --local 冒烟的配置目录在系统临时目录里（smoke_dmg.py 的 TemporaryDirectory），不在证据目录下：
  // 根目录在 CI 上取 RUNNER_TEMP，本机取系统临时目录；smoke-pet.mjs 必须用这一个函数，不能再自己挑根目录。
  assert.equal(storageFaultRoot({GITHUB_ACTIONS:'true',RUNNER_TEMP:'/runner/temp'},'/local/tmp'),'/runner/temp');
  assert.equal(storageFaultRoot({},'/local/tmp'),'/local/tmp');assert.equal(storageFaultRoot({GITHUB_ACTIONS:'false',RUNNER_TEMP:'/runner/temp'},'/local/tmp'),'/local/tmp');
  assert.equal(storageFaultRoot({}),tmpdir());
  await withNotebookStorageFailure({...opts,allowedRoot:storageFaultRoot({})},async()=>{assert.ok(lstatSync(lock).isDirectory());});
  const pet=readFileSync(new URL('smoke-pet.mjs',import.meta.url),'utf8');
  assert.match(pet,/allowedRoot:storageFaultRoot\(\)/,'smoke-pet.mjs 要按 storageFaultRoot() 取故障根目录');assert.doesNotMatch(pet,/allowedRoot:[^}]*evidenceDir/);
  writeFileSync(lock+'.smoke-original','pre-existing recovery');
  await assert.rejects(withNotebookStorageFailure(opts,()=>assert.fail()),/existing recovery/);
  assert.equal(readFileSync(file,'utf8'),'original bytes');assert.equal(readFileSync(lock+'.smoke-original','utf8'),'pre-existing recovery');
  console.log('PASS isolated storage fault rejects unsafe paths and restores exact bytes on success or failure');
}finally{rmSync(root,{recursive:true,force:true});}
