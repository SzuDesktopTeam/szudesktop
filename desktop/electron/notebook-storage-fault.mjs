// Test-only filesystem fault. Only the isolated smoke profile may be touched.
import assert from 'node:assert/strict';
import {existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,renameSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// 允许制造存储故障的根目录：CI 上是一次性 runner 的 RUNNER_TEMP；开发机上 --local 冒烟的配置目录由 smoke_dmg.py 的
// TemporaryDirectory 建在系统临时目录里。以前本机用的是证据目录，配置目录从不在它下面，本机冒烟每次都在这一步被拒。
// 真实用户的配置目录不在这两处，下面另有 Electron 配置必须是 <配置目录>/electron-profile 的核对。
export const storageFaultRoot=(env=process.env,temp=tmpdir())=>env.GITHUB_ACTIONS==='true'?env.RUNNER_TEMP:temp;

export async function withNotebookStorageFailure({configDir,userData,reportPath,allowedRoot},check){
  for(const value of [configDir,userData,reportPath,allowedRoot])assert.ok(value&&path.isAbsolute(value),'storage fault requires absolute isolated smoke paths');
  const cfg=realpathSync(configDir),root=realpathSync(allowedRoot),relative=path.relative(root,cfg);
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'storage fault refuses a profile outside its owned smoke root');
  assert.equal(realpathSync(userData),path.join(cfg,'electron-profile'),'storage fault requires the isolated Electron profile');
  const notebook=path.join(cfg,'notebook-v1.json'),file=notebook+'.lock',backup=file+'.smoke-original';
  assert.ok(lstatSync(notebook).isFile()&&!lstatSync(notebook).isSymbolicLink(),'storage fault requires a regular notebook file');
  assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink(),'storage fault requires the existing notebook lock');
  assert.equal(existsSync(backup),false,'storage fault refuses an existing recovery file');
  const before=readFileSync(file);
  const notebookBefore=readFileSync(notebook);
  renameSync(file,backup);
  try{mkdirSync(file);return await check();}
  finally{
    // Empty-directory removal only: never recursively delete unexpected contents.
    if(existsSync(file))rmdirSync(file);
    renameSync(backup,file);
    assert.deepEqual(readFileSync(file),before,'fault teardown must restore original bytes');
    assert.deepEqual(readFileSync(notebook),notebookBefore,'fault must never alter the original notebook');
  }
}
