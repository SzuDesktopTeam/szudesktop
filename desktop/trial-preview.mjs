// Isolated browser candidate: edited frontend + the unchanged published Go engine.
// No installation, login, notifications, login items, keychain or school-service access.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startSidecar} from './electron/sidecar.mjs';
import {acquireTrialInstance,TRIAL_KIND} from './trial-instance.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2);
if(args.length!==2){console.error('Usage: node desktop/trial-preview.mjs <published-engine.exe> <isolated-trial-data-directory>');process.exit(2)}
const engine=path.resolve(args[0]),dataDir=path.resolve(args[1]);
if(crypto.createHash('sha256').update(fs.readFileSync(engine)).digest('hex')!=='f7ef69a8ed04a516e7620c45ee315d61d898faeab3520860b243746d0fded5fb')throw Error('Engine checksum does not match beta0.9.5');
fs.mkdirSync(dataDir,{recursive:true});
const buildHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/garden/app.mjs'))).update(fs.readFileSync(fileURLToPath(import.meta.url))).update(fs.readFileSync(path.join(root,'trial-instance.mjs'))).digest('hex');
const lease=await acquireTrialInstance({dataDir,buildHash}).catch(e=>{console.error(e.message);process.exit(1)});
if(!lease.owned){console.log('Trial preview: '+lease.descriptor.origin+'/?launch='+lease.descriptor.token);console.log('已复用同一试用入口与数据目录。');process.exit(0)}
const handle=await startSidecar({command:engine,args:['--no-auto-login','--no-open'],env:{...process.env,SZUNET_CONFIG_DIR:dataDir},expectedVersion:'beta0.9.5',readyTimeoutMs:6000,healthTimeoutMs:2000}).catch(e=>{lease.release();console.error('试用引擎没能启动：'+e.message+'。请等待旧试用退出后重试。');process.exit(1)});
if(!handle.owned){lease.release();console.error('同一目录的旧引擎仍在运行或退出，无法确认由本启动器拥有。未复用、未停止它；请退出自己的旧试用终端后重试。');process.exit(1)}
const token=lease.descriptor?.token||crypto.randomBytes(32).toString('hex'),allowed=new Set(['/api/health','/api/workspace','/api/notebook']);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
let address,closing=false;
function json(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(req.headers.host!==new URL(address).host)return json(res,403,{error:'只接受本机试用地址'});
  if(req.headers.origin&&req.headers.origin!==address)return json(res,403,{error:'只接受同源请求'});
  if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return json(res,403,{error:'只接受同源请求'});
  const url=new URL(req.url,address);
  if(url.pathname==='/'&&url.searchParams.get('launch')===token){res.writeHead(303,{'Set-Cookie':`szu_trial=${token}; HttpOnly; SameSite=Strict; Path=/`,'Location':'/'});return res.end()}
  if(!(req.headers.cookie||'').split(';').some(c=>c.trim()==='szu_trial='+token))return json(res,401,{error:'请从终端中的试用链接重新打开'});
  if(url.pathname.startsWith('/api/')){
   if(url.pathname==='/api/trial-instance'&&req.method==='GET'){let engineHealthy=false;if(!closing){try{const health=await fetch(handle.baseUrl+'/api/health',{signal:AbortSignal.timeout(800)});const h=await health.json();engineHealthy=health.ok&&h.ok===true&&h.app==='szuDesktop'&&h.app_version==='beta0.9.5'}catch{}}return json(res,closing||!engineHealthy?503:200,{kind:TRIAL_KIND,version:1,dataDirHash:lease.dirHash,buildHash,ownerNonce:lease.owner.nonce,pid:process.pid,state:closing?'closing':'running',engineHealthy})}
   if(closing)return json(res,503,{error:'试用正在退出，请等待终端进程结束后重新打开。'});
   if(url.pathname==='/api/credential'&&req.method==='GET')return json(res,200,{saved:false});
   if(url.pathname==='/api/shutdown'&&req.method==='POST'){closing=true;lease.phase('closing');json(res,200,{ok:true});setTimeout(()=>void close(),100);return}
   if(!allowed.has(url.pathname))return json(res,503,{error:'本候选只试用伙伴与本机课堂笔记；学校服务和系统权限未启用'});
   if(!['GET','POST','PUT'].includes(req.method))return json(res,405,{error:'不支持此方法'});
   const chunks=[];let bytes=0;for await(const part of req){bytes+=part.length;if(bytes>10*1024*1024)return json(res,413,{error:'请求太大'});chunks.push(part)}const body=Buffer.concat(chunks).toString('utf8');
   const upstream=await fetch(handle.baseUrl+url.pathname+url.search,{method:req.method,headers:{'X-SZU-Token':handle.token,'content-type':'application/json'},...(req.method==='GET'?{}:{body}),signal:AbortSignal.timeout(15000)});
   res.writeHead(upstream.status,{'content-type':'application/json; charset=utf-8',...(upstream.headers.has('X-SZU-Recovered')?{'X-SZU-Recovered':upstream.headers.get('X-SZU-Recovered')}:{})});return res.end(await upstream.text());
  }
  if(req.method!=='GET')return json(res,405,{error:'不支持此方法'});
  const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||(!relative.startsWith('assets/')&&relative!=='index.html'))return json(res,404,{error:'没有此资源'});
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'没有此资源'});
  let content=fs.readFileSync(file);
  if(relative==='index.html')content=Buffer.from(content.toString('utf8').replace('<body>','<body><div role="status" style="padding:8px 16px;background:#fffaec;color:#493f2c;font:14px sans-serif;border-bottom:1px solid #77643f">本机试用候选 · 伙伴与课堂笔记 · 学校服务未启用 · 请勿输入账号密码</div>'));
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(content);
 }catch(error){json(res,500,{error:error.message})}
});

let stopping=false;
async function close(){if(stopping)return;stopping=true;closing=true;lease.phase('closing');const released=new Promise(resolve=>server.close(resolve));try{await handle.stop();await Promise.race([released,new Promise(resolve=>setTimeout(()=>{server.closeAllConnections();resolve()},1500))])}finally{lease.release();process.exit(0)}}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close());
server.once('error',error=>{console.error(error.code==='EADDRINUSE'?'试用地址端口被占用；没有更换地址或停止占用进程。请确认自己的旧试用已退出后重试。':'试用入口启动失败：'+error.message);void handle.stop().finally(()=>{lease.release();process.exit(1)})});
server.listen(lease.descriptor?Number(new URL(lease.descriptor.origin).port):0,'127.0.0.1',()=>{address='http://127.0.0.1:'+server.address().port;lease.save({kind:TRIAL_KIND,version:1,dataDirHash:lease.dirHash,origin:address,token});lease.phase('running');console.log('Trial preview: '+address+'/?launch='+token);console.log('Isolated data: '+dataDir)});
