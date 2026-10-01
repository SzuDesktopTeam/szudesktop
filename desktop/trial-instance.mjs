// Coordination is scoped to one explicitly isolated trial directory.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
export const TRIAL_KIND='szuDesktop-browser-trial';
const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return null}};
const alive=pid=>{try{process.kill(pid,0);return true}catch(e){return e.code!=='ESRCH'}};
const write=(file,value)=>{const temporary=file+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600});fs.renameSync(temporary,file)};
export function validTrialDescriptor(d,dirHash){try{const u=new URL(d.origin);return d.kind===TRIAL_KIND&&d.version===1&&d.dataDirHash===dirHash&&u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port&&Number(u.port)>0&&u.pathname==='/'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^[a-f0-9]{64}$/.test(d.token)}catch{return false}}
export async function probeTrialInstance(descriptor,owner,{fetch:request=fetch,timeoutMs=1000}={}){
 const response=await request(descriptor.origin+'/api/trial-instance',{headers:{cookie:'szu_trial='+descriptor.token},signal:AbortSignal.timeout(timeoutMs)});
 const identity=await response.json();
 const matches=identity.kind===TRIAL_KIND&&identity.version===1&&identity.dataDirHash===descriptor.dataDirHash&&identity.buildHash===owner.buildHash&&identity.ownerNonce===owner.nonce&&identity.pid===owner.pid;
 if(!matches)throw Error('试用地址上的服务身份不匹配，未复用、未停止该服务。请退出自己的旧试用终端后重试。');
 return response.ok&&identity.state==='running'&&identity.engineHealthy===true;
}
export async function acquireTrialInstance({dataDir,buildHash,timeoutMs=12000,probe=probeTrialInstance}){
 const canonical=fs.realpathSync(dataDir),dirHash=crypto.createHash('sha256').update(process.platform==='win32'?canonical.toLowerCase():canonical).digest('hex');
 const lock=path.join(canonical,'trial-preview.lock'),file=path.join(canonical,'trial-preview-instance.json'),deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  const nonce=crypto.randomBytes(16).toString('hex');let fd;
  try{fd=fs.openSync(lock,'wx',0o600)}catch(e){if(e.code!=='EEXIST')throw e}
  if(fd!==undefined){
   const owner={kind:TRIAL_KIND,version:1,pid:process.pid,nonce,phase:'starting',buildHash,dataDirHash:dirHash};fs.writeFileSync(fd,JSON.stringify(owner));fs.closeSync(fd);
   const release=()=>{if(read(lock)?.nonce===nonce)fs.unlinkSync(lock)};
   const descriptor=read(file);if(fs.existsSync(file)&&!validTrialDescriptor(descriptor,dirHash)){release();throw Error('试用入口记录无法确认，原记录和数据已保留。请检查自己的试用目录后重试。')}
   return {owned:true,owner,dirHash,descriptor,save:next=>write(file,next),phase:phase=>{owner.phase=phase;write(lock,owner)},release};
  }
  const owner=read(lock);
  if(owner?.kind===TRIAL_KIND&&owner.version===1&&owner.dataDirHash===dirHash&&Number.isInteger(owner.pid)&&owner.pid>0&&typeof owner.nonce==='string'){
   if(!alive(owner.pid)){const repair=lock+'.repair';let repairFd;try{repairFd=fs.openSync(repair,'wx',0o600)}catch(e){if(e.code!=='EEXIST')throw e}if(repairFd!==undefined){try{const latest=read(lock);if(latest?.nonce===owner.nonce&&!alive(latest.pid))fs.unlinkSync(lock)}finally{fs.closeSync(repairFd);fs.unlinkSync(repair)}}await delay(10);continue}
   if(owner.buildHash!==buildHash)throw Error('这个试用目录已有另一候选版本运行。请先在旧终端退出，再打开当前候选；没有停止其他进程。');
   const descriptor=read(file);
   if(owner.phase==='running'&&validTrialDescriptor(descriptor,dirHash)){
    try{if(await probe(descriptor,owner))return {owned:false,descriptor,dirHash}}catch(e){if(/身份不匹配/.test(e.message))throw e}
   }
  }
  await delay(Math.min(100,Math.max(1,deadline-Date.now())));
 }
 throw Error('等待旧试用实例启动或退出超时（'+Math.ceil(timeoutMs/1000)+' 秒）。没有创建第二个入口。请确认自己的旧试用终端已退出后重试；数据没有清空。');
}
