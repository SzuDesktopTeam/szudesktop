// Only complete protocol lines can announce an endpoint. A partially written port
// must never be accepted, and unrelated URLs in logs are not discovery records.
// Go 在地址行之外另起一行交出本次运行的调用方凭据（server.go 的 announce）：
//   szuDesktop 已启动: http://127.0.0.1:<端口>      （或“已复用”）
//   szuDesktop 会话: <64 位小写十六进制>
// 两行都到齐才算就绪。凭据只留在内存里：不写日志、不进错误框和冒烟报告。
const ENDPOINT_LINE=/^szuDesktop (已启动|已复用): http:\/\/(?:127\.0\.0\.1|localhost):(\d{1,5})\r?$/;
const SESSION_LINE=/^szuDesktop 会话: ([0-9a-f]{64})\r?$/;
// 协议行都很短；超过这个长度还没换行的内容不可能是协议行，只保留一个占位，缓冲不会无限增长。
const LINE_MAX=512;
export const TOKEN_HEADER='X-SZU-Token';

// 按块喂入标准输出，返回 {baseUrl,owned,token} 或 null。只看完整的行，
// 半行留到下一块；地址和凭据各取第一条合格的行，其余输出（日志、伪造的半截行）一律忽略。
export function createEndpointParser(){
  let partial='',endpoint=null,token=null;
  return chunk=>{
    const lines=(partial+String(chunk??'')).split('\n');
    partial=lines.pop();
    // 以 NUL 开头的行不可能匹配上面两个正则，用它代替超长的半行。
    if(partial.length>LINE_MAX)partial='\0';
    for(const raw of lines){
      if(!endpoint){
        const match=ENDPOINT_LINE.exec(raw);
        const port=match?Number(match[2]):0;
        if(port>=1&&port<=65535){endpoint={baseUrl:`http://127.0.0.1:${port}`,owned:match[1]==='已启动'};continue;}
      }
      if(!token){const match=SESSION_LINE.exec(raw);if(match)token=match[1];}
    }
    return endpoint&&token?{...endpoint,token}:null;
  };
}
export function parseSidecarEndpoint(text){return createEndpointParser()(String(text||''));}
export function parseListenUrl(text){return parseSidecarEndpoint(text)?.baseUrl??null;}
// 主窗口首次加载的地址：Go 用一次性的 launch 参数换成 HttpOnly Cookie 并跳回 /，地址栏不留凭据。
export function launchUrl({baseUrl,token}){return baseUrl+'/?launch='+token;}
// 主进程直接读庭院存档（宠物刷新、专注提醒）：不经过页面的 Cookie，每个请求都带上 sidecar 交来的凭据。
// getHandle 在每次读取时取当前的 sidecar 句柄；引擎还没就绪或请求失败都抛错，由调用方决定如何降级。
export function workspaceLoader(getHandle,request=globalThis.fetch){
  return async()=>{
    const handle=getHandle();
    if(!handle)throw Error('本机引擎尚未就绪');
    const response=await request(handle.baseUrl+'/api/workspace',{headers:{[TOKEN_HEADER]:handle.token},signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('庭院存档暂时不可读');
    return response.json();
  };
}
// 错误信息（loadURL 的报错会带上完整地址）写进错误框或冒烟报告之前先抹掉凭据。
export function redactToken(text,token){
  const value=String(text??'');
  return typeof token==='string'&&token?value.split(token).join('<会话凭据>'):value;
}
// Go 启动失败时向 stderr 写单行“启动失败: <原因>”。只有这种协议行才算原因：
// panic 栈、flag 用法说明等其他输出的最后一行对用户没有意义，只能作为附加细节。
export const STARTUP_REASON_MAX=300;
export const STDERR_DETAIL_MAX=200;
const stderrLines=stderr=>String(stderr||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
const tidy=(line,max)=>line.replace(/[。.！!；;，,\s]+$/,'').slice(0,max);
export function startupFailureReason(stderr){
  const line=stderrLines(stderr).findLast(value=>/^启动失败\s*[:：]/.test(value));
  return line?tidy(line.replace(/^启动失败\s*[:：]\s*/,''),STARTUP_REASON_MAX):'';
}
// 没有协议行时，把最后一条非空输出附在错误里，方便反馈时定位。
export function lastStderrLine(stderr){
  const line=stderrLines(stderr).at(-1);
  return line?tidy(line,STDERR_DETAIL_MAX):'';
}
