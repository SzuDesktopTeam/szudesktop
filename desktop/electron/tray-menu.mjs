// 系统托盘与它的菜单：显示/隐藏宠物、置顶、大小、勿扰、打开主窗口和退出。
// 勾选状态每次都按当前设置重建；Tray、Menu 由 main.mjs 注入。
export function createTrayMenu({Tray,Menu,icon,readPreferences,petVisible,petSizeMenu,changeSettings,showMainWindow,quit,recordError=()=>false,debug=false}){
  let tray=null,trayMenu=null;
  function refreshTrayMenu(){
    if(!tray)return;
    const visible=petVisible();
    trayMenu=Menu.buildFromTemplate([
      {label:visible?'隐藏宠物':'显示宠物',click:()=>changeSettings({petVisible:!visible})},
      {label:'宠物置顶',type:'checkbox',checked:readPreferences().petAlwaysOnTop,click:()=>changeSettings({petAlwaysOnTop:!readPreferences().petAlwaysOnTop})},
      {label:'宠物大小',submenu:petSizeMenu()},
      {label:'勿扰（暂停专注提醒）',type:'checkbox',checked:readPreferences().doNotDisturb,click:()=>changeSettings({doNotDisturb:!readPreferences().doNotDisturb})},
      {label:'打开主窗口',click:()=>showMainWindow()},
      {type:'separator'},
      {label:'退出',click:()=>quit()},
    ]);
    tray.setContextMenu(trayMenu);
  }
  function createTray(){
    try{
      tray=new Tray(icon);
      tray.setToolTip('szuDesktop 荔枝庭院');
      tray.on('click',()=>showMainWindow());
      refreshTrayMenu();
      // 调试取证用：仅在显式开启宠物截图调试时打印，正常启动保持安静。
      if(debug)console.log('[pet] tray created:',icon);
    }catch(e){
      tray=null;
      // 冒烟模式记进报告；否则只在宠物截图调试时打印。
      if(!recordError('tray: '+e.message)&&debug)console.warn('[pet] tray failed:',e.message);
    }
  }
  function destroy(){if(tray){tray.destroy();tray=null;}}
  return {create:createTray,refresh:refreshTrayMenu,destroy,get:()=>tray,menu:()=>trayMenu,
    // 关主窗时藏到托盘的前提：托盘图标确实还在。
    exists:()=>Boolean(tray&&!tray.isDestroyed())};
}
