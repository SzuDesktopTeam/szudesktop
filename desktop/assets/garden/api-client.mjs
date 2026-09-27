// 页面访问本机服务的唯一入口。fetch、提示和计时器都由调用方注入，检查脚本可以直接 import 后用替身测试，不必再切 app.mjs 的源码。
// data 是字符串时视为已经序列化好的 JSON，原样发送：几 MiB 的笔记不必再序列化一遍。
// 响应带 X-SZU-Recovered: backup 时在返回值（不可枚举）或错误上标 recovered，调用方据此说明冲突的真正原因。
export function createApi({toast,fetch:request=(...args)=>globalThis.fetch(...args),setTimeout:later=(fn,ms)=>globalThis.setTimeout(fn,ms)}){
 // 后端用上一份备份恢复了损坏的存档或笔记文件时带 X-SZU-Recovered: backup，这里明确告诉用户。
 // 服务端在某次 GET 读到之前每个响应都带这个头，同一文件 6 秒内只提示一次；返回响应是否带了它。
 const recoveredFiles=new Set();
 function announceRecovery(path,response){if(response.headers?.get?.('X-SZU-Recovered')!=='backup')return false;const kind=path.startsWith('/api/notebook')?'笔记':path.startsWith('/api/workspace')?'存档':'';if(kind&&!recoveredFiles.has(kind)){recoveredFiles.add(kind);toast([...recoveredFiles].map(name=>name+'文件损坏，已恢复到上一次成功保存的版本').join('；'));later(()=>recoveredFiles.delete(kind),6000)}return true}
 return async function api(path,data,method){let r;try{r=await request(path,{method:method||(data===undefined?'GET':'POST'),headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data),signal:AbortSignal.timeout(45000)})}catch{throw Error('本机服务暂时无响应，请确认程序仍在运行；未保存的操作不会显示为成功')};const recovered=announceRecovery(path,r);const text=await r.text().catch(()=>'');let d;try{d=JSON.parse(text)}catch{const body=text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,120),e=Error(`服务响应异常（HTTP ${r.status}）`+(body?'：'+body:''));if(!r.ok)e.code=r.status;throw e};if(!r.ok){const e=Error(d?.message||'操作没有成功');e.code=r.status;if(recovered)e.recovered=true;throw e}if(recovered&&d&&typeof d==='object')Object.defineProperty(d,'recovered',{value:true});return d};
}
