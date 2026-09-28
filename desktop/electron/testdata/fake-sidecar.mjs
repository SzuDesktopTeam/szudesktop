import http from 'node:http';
// 与 fake-lifecycle.mjs 相同：启动它的测试进程没了就自己退出。测试被 kill -9、外层超时打断时 stop 来不及执行，
// 非 Windows 上假引擎又自成进程组，打断信号到不了这里：以前这个一直监听的假引擎会挂在 launchd / init 下面。
const runner=process.ppid;
const runnerGone=()=>{if(process.ppid!==runner)return true;try{process.kill(runner,0);return false;}catch(e){return e.code!=='EPERM';}};
setInterval(()=>{if(runnerGone())process.exit(0);},200).unref();
const srv=http.createServer((req,res)=>{
  if(req.url==='/api/status'||req.url==='/api/health'){res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true,"app":"szuDesktop","app_version":"test"}');return;}
  res.writeHead(404);res.end();
});
srv.listen(0,'127.0.0.1',()=>{
  const port=srv.address().port;
  process.stdout.write(`szuDesktop 已启动: http://127.0.0.1:${port}\nszuDesktop 会话: ${'0123456789abcdef'.repeat(4)}\n`);
});
