// macOS 屏幕顶端的应用菜单：应用名、编辑、页面、窗口四栏。不 import electron：main.mjs 只在 darwin 上用 Menu.buildFromTemplate 建出来，
// 检查脚本直接看模板。macOS 没有窗口自己的菜单栏，学校和飞书窗口的 win.setMenu 在这里看不到，所以它们把同一份菜单项
// 经 onWindowMenu 登记到这里，作为「页面」一栏跟着当前聚焦的窗口走；「编辑」一栏让 ⌘C/⌘V/⌘Z 在登录框和飞书文档里可用。
// Windows 不走这里，窗口菜单照旧。

// 没有聚焦学校或飞书窗口时，「页面」一栏仍列出这几项并置灰：用户看得到这里能做什么，也点不到已经关掉的窗口。
export const PAGE_MENU_PLACEHOLDER=['返回','刷新','在系统浏览器打开'];
// role 决定行为和系统快捷键，label 换成中文：Electron 给 role 的默认文字是英文。
export function buildAppMenuTemplate({version,isPackaged,pageMenu,onOpenMain}){
  const pages=pageMenu?.length?pageMenu:PAGE_MENU_PLACEHOLDER.map(label=>({label,enabled:false}));
  return [
    {role:'appMenu',submenu:[
      {role:'about',label:'关于 szuDesktop'},
      ...(version?[{label:'版本 '+version,enabled:false}]:[]),
      {type:'separator'},
      {role:'services',label:'服务'},
      {type:'separator'},
      {role:'hide',label:'隐藏 szuDesktop'},{role:'hideOthers',label:'隐藏其他'},{role:'unhide',label:'全部显示'},
      {type:'separator'},
      // 与菜单栏图标、宠物菜单的「退出」一样经 before-quit：先请页面保存笔记和棋局。
      {role:'quit',label:'退出 szuDesktop'},
    ]},
    {label:'编辑',submenu:[
      {role:'undo',label:'撤销'},{role:'redo',label:'重做'},
      {type:'separator'},
      {role:'cut',label:'剪切'},{role:'copy',label:'拷贝'},{role:'paste',label:'粘贴'},{role:'pasteAndMatchStyle',label:'粘贴并匹配样式'},
      {role:'delete',label:'删除'},{role:'selectAll',label:'全选'},
    ]},
    {label:'页面',submenu:pages},
    // windowMenu 让系统在这一栏末尾列出打开的窗口（宠物已设为不列出）。⌘W 关主窗口只是藏起来，与点红色按钮相同。
    {role:'windowMenu',label:'窗口',submenu:[
      {role:'minimize',label:'最小化'},{role:'zoom',label:'缩放'},{role:'close',label:'关闭窗口'},
      {type:'separator'},
      {label:'打开主窗口',click:()=>onOpenMain()},
      // 开发者工具只在开发模式里给：安装版的页面不需要它，也不该让用户误开。
      ...(isPackaged?[]:[{type:'separator'},{role:'toggleDevTools',label:'开发者工具'}]),
      {type:'separator'},
      {role:'front',label:'前置全部窗口'},
    ]},
  ];
}

// 学校和飞书窗口登记自己的菜单项（与 win.setMenu 用的是同一份数组），应用菜单按当前聚焦的窗口取用。
// 窗口关掉后删掉登记并通知 main 重建菜单；菜单来不及重建时，点残留的菜单项也先看窗口还在不在，
// 已销毁就什么也不做，不会抛出「Object has been destroyed」。
export function createPageMenuRegistry({onChange=()=>{}}={}){
  const menus=new WeakMap();
  const guard=(win,items)=>items.map(item=>({...item,
    ...(Array.isArray(item.submenu)?{submenu:guard(win,item.submenu)}:{}),
    ...(typeof item.click==='function'?{click:(...args)=>{if(!win.isDestroyed())item.click(...args);}}:{})}));
  return {
    set(win,submenu){
      if(!menus.has(win))win.once('closed',()=>{menus.delete(win);onChange();});
      menus.set(win,submenu);
    },
    // 没登记过、已经关掉或传入 null（没有聚焦窗口）时返回 null，「页面」一栏置灰。
    current(win){
      const submenu=win&&!win.isDestroyed()?menus.get(win):null;
      return submenu?guard(win,submenu):null;
    },
  };
}
