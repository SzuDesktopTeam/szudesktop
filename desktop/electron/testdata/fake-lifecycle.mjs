import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
// 与 Go 的 announce 同一格式：地址行之后另起一行交出本次运行的凭据（64 位小写十六进制）。
const FAKE_TOKEN='0123456789abcdef'.repeat(4);
const session=`szuDesktop 会话: ${FAKE_TOKEN}\n`;
const [mode,value]=process.argv.slice(2);
// 启动它的测试进程没了就自己退出。测试被 Ctrl+C、外层超时或 kill -9 打断时 finally 来不及执行，
// 非 Windows 上假引擎又和真引擎一样自成进程组，打断信号到不了这里：以前 slow-start 的假引擎会一直挂在 launchd / init 下面。
// 只盯启动它的测试进程：测试在跑时这段不起作用，「stop 结束整个进程树 / 进程组」的检查照样有效。
const runner=process.ppid;
const runnerGone=()=>{if(process.ppid!==runner)return true;try{process.kill(runner,0);return false;}catch(e){return e.code!=='EPERM';}};
setInterval(()=>{if(runnerGone())process.exit(0);},200).unref();
if(mode==='reuse'||mode==='reuse-failed'){
  process.stdout.write(`szuDesktop 已复用: ${value}\n`+session,()=>process.exit(mode==='reuse'?0:1));
}else if(mode==='startup-error'){
  // Go 启动失败的协议：前面可能有别的日志，最后一行是“启动失败: <原因>”。
  process.stderr.write('2026/09/27 准备配置目录\n'+'x'.repeat(4096)+'\n启动失败: 本机配置目录无法写入\n',()=>process.exit(1));
}else if(mode==='panic'){
  // Go 运行时崩溃：最后一行是栈帧，不是给用户看的原因。
  process.stderr.write('panic: runtime error: invalid memory address or nil pointer dereference\n\ngoroutine 1 [running]:\nmain.main()\n\tszudesktop/desktop/cmd/szudesktop/main.go:57 +0x1a5\n',()=>process.exit(2));
}else if(mode==='slow-start'){
  // 一直不打印监听地址（例如在等旧实例交出锁），只有普通日志。
  fs.writeFileSync(path.join(value,'parent.pid'),String(process.pid));
  process.stderr.write('2026/09/27 等待已有实例响应\n');
  setInterval(()=>{},1000);
}else{
  if(value)fs.writeFileSync(path.join(value,'parent.pid'),String(process.pid));
  if(mode==='tree'){
    // 孙进程也只盯测试进程、不盯引擎：引擎被结束时它是否跟着结束，仍由 stop 的检查来判断。
    const child=spawn(process.execPath,['-e',`const p=${runner};setInterval(()=>{try{process.kill(p,0)}catch(e){if(e.code!=='EPERM')process.exit(0)}},200)`],{stdio:'ignore',windowsHide:true});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    fs.writeFileSync(path.join(value,'descendant.pid'),String(child.pid));
  }
  const server=http.createServer((req,res)=>{
    if(mode==='hanging'||mode==='exit-after-url')return;
    // 运行期日志：用来确认开发模式下启动后的 stderr 仍被转发。
    if(req.url==='/test/stderr'){process.stderr.write('运行期日志\n',()=>res.end('{}'));return;}
    if(mode==='offline'&&req.url==='/api/status')return;
    if(mode==='offline'&&req.url==='/api/shutdown'){res.statusCode=404;res.end();return;}
    if(mode==='hanging-body'&&req.url==='/api/health'){res.writeHead(200,{'content-type':'application/json'});res.write('{"ok":');return;}
    if(mode==='graceful'&&req.url==='/api/shutdown'&&req.method==='POST'){
      // 和 Go 一样：没带凭据的关闭请求拒绝，外壳只好强制结束进程，测试据此发现漏带请求头。
      if(req.headers['x-szu-token']!==FAKE_TOKEN){res.statusCode=401;res.end('{}');return;}
      fs.writeFileSync(path.join(value,'graceful.marker'),'shutdown accepted');
      req.resume();
      req.on('end',()=>res.end('{}',()=>server.close(()=>process.exit(0))));
      return;
    }
    res.statusCode=mode==='unhealthy'?500:200;
    res.end(req.url==='/api/health'?JSON.stringify({ok:true,app:mode==='wrong-app'?'other-app':'szuDesktop',app_version:'test'}):'{}');
  });
  // 大量 stderr 日志不能把管道写满、卡住启动。
  if(mode==='noisy')process.stderr.write('日志'.repeat(100000)+'\n');
  server.listen(0,'127.0.0.1',()=>{
    const port=String(server.address().port);
    if(mode==='exit-after-url'){
      // 已打印监听地址、健康检查前退出：原因同样要带进错误。
      process.stdout.write(`szuDesktop 已启动: http://127.0.0.1:${port}\n`+session,()=>process.stderr.write('启动失败: 应用正在启动或退出，请稍后再打开\n',()=>process.exit(1)));
      return;
    }
    if(mode==='chunked'){
      // 地址行和凭据行都从中间断开，分三块写出。
      process.stdout.write(`szuDesktop 已启动: http://127.0.0.1:${port.slice(0,1)}`);
      setTimeout(()=>process.stdout.write(port.slice(1)+'\n'+session.slice(0,30)),100);
      setTimeout(()=>process.stdout.write(session.slice(30)),200);
    }else if(mode==='no-session'){
      // 只有地址行、没有凭据行：外壳不能当成就绪。
      process.stdout.write(`szuDesktop 已启动: http://127.0.0.1:${port}\n`);
    }else if(mode==='forged-session'){
      // 长度不对、大写、前后多字符、没写完的凭据行都不算。
      process.stdout.write(`szuDesktop 已启动: http://127.0.0.1:${port}\n`
        +`szuDesktop 会话: ${FAKE_TOKEN.slice(1)}\n`+`szuDesktop 会话: ${FAKE_TOKEN}0\n`
        +`szuDesktop 会话: ${FAKE_TOKEN.toUpperCase()}\n`+`日志 szuDesktop 会话: ${FAKE_TOKEN}\n`
        +`szuDesktop 会话: ${FAKE_TOKEN} \n`+`szuDesktop 会话:${FAKE_TOKEN}\n`+`szuDesktop 会话: ${FAKE_TOKEN}`);
    }else process.stdout.write(`szuDesktop 已启动: http://127.0.0.1:${port}\n`+session);
  });
}
