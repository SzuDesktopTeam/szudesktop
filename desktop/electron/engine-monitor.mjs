// 后台引擎意外停止时提示用户重新打开：自己启动的引擎看进程退出，复用便携版的引擎每 5 秒查一次健康状态。
// 同一次运行只提示一次；退出流程中不再提示。
export const ENGINE_HEALTH_INTERVAL_MS=5000;
export function createEngineMonitor({app,dialog,getMainWindow,isQuitting,fetch:request=globalThis.fetch,setInterval:repeat=setInterval,clearInterval:cancel=clearInterval}){
  let failureShown=false,healthTimer=null;
  async function engineFailed(message){
    if(isQuitting()||failureShown)return;
    failureShown=true;
    const options={type:'error',title:'szuDesktop 引擎已停止',message:'本机服务暂时无法使用',
      detail:message+'。已保存的庭院和学习记录会保留。',buttons:['重新打开','退出'],defaultId:0,cancelId:1};
    const mainWin=getMainWindow();
    const result=await (mainWin&&!mainWin.isDestroyed()?dialog.showMessageBox(mainWin,options):dialog.showMessageBox(options));
    if(result.response===0)app.relaunch();
    app.quit();
  }
  function watch(handle){
    if(handle.owned){
      handle.child.once('exit',()=>void engineFailed('后台引擎意外结束，请重新打开应用'));
      return;
    }
    // The reused service belongs to another launcher; never terminate it on our exit.
    let checking=false;
    healthTimer=repeat(async()=>{
      if(checking||isQuitting())return;
      checking=true;
      try{const r=await request(handle.baseUrl+'/api/health',{signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error();const health=await r.json();if(!health.ok||health.app!=='szuDesktop')throw Error();}
      catch{void engineFailed('此前已运行的后台服务已停止');}
      finally{checking=false;}
    },ENGINE_HEALTH_INTERVAL_MS);
    healthTimer.unref?.();
  }
  function stop(){cancel(healthTimer);}
  return {failed:engineFailed,watch,stop};
}
