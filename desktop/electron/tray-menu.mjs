// 系统托盘与它的菜单：显示/隐藏宠物、置顶、大小、勿扰、打开主窗口和退出。
// 勾选状态每次都按当前设置重建；Tray、Menu 由 main.mjs 注入。
import {existsSync} from 'node:fs';

// macOS 上它是菜单栏图标，程序坞右键菜单也复用同一组菜单项；platform、exists、setDockMenu 缺省时与 Windows 行为一致。
export function createTrayMenu({Tray,Menu,icon,readPreferences,petVisible,petSizeMenu,changeSettings,showMainWindow,quit,recordError=()=>false,debug=false,
  platform,exists=existsSync,setDockMenu=()=>{}}){
  const mac=platform==='darwin';
  let tray=null,trayMenu=null;
  function refreshTrayMenu(){
    if(!tray)return;
    const visible=petVisible();
    const items=[
      {label:visible?'隐藏宠物':'显示宠物',click:()=>changeSettings({petVisible:!visible})},
      {label:'宠物置顶',type:'checkbox',checked:readPreferences().petAlwaysOnTop,click:()=>changeSettings({petAlwaysOnTop:!readPreferences().petAlwaysOnTop})},
      {label:'宠物大小',submenu:petSizeMenu()},
      {label:'勿扰（暂停专注提醒）',type:'checkbox',checked:readPreferences().doNotDisturb,click:()=>changeSettings({doNotDisturb:!readPreferences().doNotDisturb})},
      {label:'打开主窗口',click:()=>showMainWindow()},
    ];
    trayMenu=Menu.buildFromTemplate([
      ...items,
      {type:'separator'},
      {label:'退出',click:()=>quit()},
    ]);
    tray.setContextMenu(trayMenu);
    // 程序坞菜单末尾系统自带「退出」，这里只给前面这些项，勾选状态与菜单栏图标同步刷新。
    if(mac)setDockMenu(Menu.buildFromTemplate(items));
  }
  function createTray(){
    try{
      // macOS 上图片读不到时 Tray 不报错，只在菜单栏留一块看不见的空位；先确认文件在，否则按托盘建不起来处理（关主窗即退出）。
      if(mac&&!exists(icon))throw Error('找不到菜单栏图标 '+icon);
      tray=new Tray(icon);
      tray.setToolTip('szuDesktop 荔枝庭院');
      // macOS 惯例是单击菜单栏图标弹出菜单，不再另外打开主窗口；双击也不单独响应。
      if(mac)tray.setIgnoreDoubleClickEvents(true);
      else tray.on('click',()=>showMainWindow());
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
