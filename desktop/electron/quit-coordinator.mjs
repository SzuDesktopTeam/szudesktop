// 退出协调：托盘、宠物菜单、页面按钮和系统注销触发的退出，都先请主窗保存笔记和 2048 棋局；
// 保存不住时让用户选择返回处理还是放弃修改。确认退出后先关窗口（closeWindows），再停后台引擎（stopEngine），
// 最后放行真正的退出。状态都在这个工厂里；app、dialog 和主窗口由 main.mjs 注入。
export const QUIT_SAVE_TIMEOUT_MS=5000;
export function createQuitCoordinator({app,dialog,getMainWindow,showMainWindow,waitForStartup=()=>undefined,closeWindows,stopEngine,
  setTimer=setTimeout,clearTimer=clearTimeout}){
  let quitting=false,quitReady=false,shutdownPromise=null;
  let quitRequest=0,pendingQuit=null,sessionEnding=false;

  function requestRendererSave(){
    const mainWin=getMainWindow(),wc=mainWin?.webContents;
    if(sessionEnding||!wc||mainWin.isDestroyed()||wc.isDestroyed()||wc.isCrashed())return Promise.resolve({ok:true});
    return new Promise(resolve=>{
      const id=++quitRequest;
      const finish=result=>{clearTimer(timer);if(pendingQuit?.id===id)pendingQuit=null;resolve(result);};
      const timer=setTimer(()=>finish({ok:false,message:'等待保存超时。请返回检查笔记和 2048 棋局的保存状态，或导出当前草稿。'}),QUIT_SAVE_TIMEOUT_MS);
      pendingQuit={id,finish};
      try{wc.send('szu:prepare-quit',id);}catch{finish({ok:false,message:'窗口暂时没有响应，未能确认内容已经保存。'});}
    });
  }
  // 页面的保存回执：来源已由 ipc-routes 核对，这里只认当前这一次请求的编号。
  function prepared(result){
    if(!pendingQuit||result?.id!==pendingQuit.id||typeof result.ok!=='boolean')return;
    pendingQuit.finish({ok:result.ok,message:typeof result.message==='string'?result.message.slice(0,240):'还有内容尚未保存'});
  }
  // 系统注销或关机：来不及等页面回执，直接放行。
  function sessionEnd(){sessionEnding=true;pendingQuit?.finish({ok:true});app.quit();}
  function beforeQuit(event){
    if(quitReady)return;
    event.preventDefault();
    if(!shutdownPromise)shutdownPromise=(async()=>{
      try{await waitForStartup();}catch{}
      const saved=await requestRendererSave();
      const mainWin=getMainWindow();
      if(!saved.ok&&mainWin&&!mainWin.isDestroyed()){
        showMainWindow();
        // 页面的 onBeforeQuit 同时保存笔记和 2048 棋局，哪一项没保存住都会走到这里，标题不能只说笔记。
        const answer=await dialog.showMessageBox(mainWin,{type:'warning',title:'还有内容尚未保存',message:'先保存，再退出庭院',
          detail:saved.message+' 返回后可重试保存或导出备份。直接退出会丢失尚未保存的修改。',
          buttons:['返回处理','放弃未保存修改并退出'],defaultId:0,cancelId:0});
        if(answer.response!==1){shutdownPromise=null;return;}
      }
      quitting=true;
      // Close our renderer first so its event stream cannot delay Go's graceful shutdown.
      try{await closeWindows();}catch{}
      try{await stopEngine();}catch{}
      quitReady=true;app.quit();
    })();
  }
  return {isQuitting:()=>quitting,requestRendererSave,prepared,sessionEnd,beforeQuit};
}
