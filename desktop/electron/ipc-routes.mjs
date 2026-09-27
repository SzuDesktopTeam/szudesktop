// 主进程的全部 IPC 入口集中在这里：szu:* 只接受主窗口里本机页面的主 frame（isTrusted），
// pet:* 只接受宠物窗自己的页面（pet.isSender）；参数类型不对的消息直接忽略，具体处理在对应模块里。
export const TRUSTED_INVOKE_CHANNELS=['szu:quit','szu:pet-scale-get','szu:pet-scale-set','szu:desktop-settings-get','szu:desktop-settings-set',
  'szu:school-open','szu:school-sync','szu:school-clear','szu:feishu-open'];
export function registerIpcRoutes({ipcMain,app,isTrusted,quit,pet,preferences,getOfficial,defer=setImmediate}){
  const trusted=(channel,handler)=>ipcMain.handle(channel,(event,value)=>{
    if(!isTrusted(event))throw Error('请求来源不匹配');
    return handler(value);
  });
  trusted('szu:quit',()=>{defer(()=>app.quit());return true;});
  ipcMain.on('szu:quit-prepared',(event,result)=>{if(isTrusted(event))quit.prepared(result);});
  // 主窗设置和宠物菜单共用缩放。
  trusted('szu:pet-scale-get',()=>pet.scale());
  trusted('szu:pet-scale-set',value=>pet.applyScale(value));
  trusted('szu:desktop-settings-get',()=>preferences.snapshot());
  trusted('szu:desktop-settings-set',value=>preferences.apply(value));
  for(const [channel,method] of [['szu:school-open','open'],['szu:school-sync','sync'],['szu:school-clear','clear']]){
    trusted(channel,value=>getOfficial().school[method](value));
  }
  trusted('szu:feishu-open',url=>getOfficial().feishu.open(url));
  ipcMain.on('szu:pet-result',async(event,result)=>{
    if(!isTrusted(event)||typeof result?.ok!=='boolean'||typeof result.message!=='string')return;
    await pet.showResult(result);
  });
  ipcMain.on('pet:menu',event=>{if(pet.isSender(event))void pet.openMenu();});
  ipcMain.on('pet:scale-step',(event,direction)=>{if(pet.isSender(event)&&[1,-1].includes(direction))pet.stepScale(direction);});
  // 立绘报告指针是否在自己身上：只收布尔值，决定透明窗此刻接不接收点击。
  ipcMain.on('pet:hit',(event,inside)=>{if(pet.isSender(event)&&typeof inside==='boolean')pet.setHit(inside);});
  ipcMain.on('pet:drag',(event,phase,point)=>{if(pet.isSender(event)&&Number.isFinite(point?.x)&&Number.isFinite(point?.y))pet.drag(phase,point);});
}
