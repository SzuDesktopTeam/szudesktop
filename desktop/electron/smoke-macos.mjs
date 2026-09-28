// macOS 冒烟：只在 darwin 的冒烟模式里由 smoke-report.mjs 动态导入，在真实 Electron 上核对 macOS 独有的装配——
// 应用菜单的角色、程序坞重新激活主窗口、菜单栏模板图、宠物跨桌面显示、程序坞菜单、渲染进程拿到的平台与设置页文案、登录项。
// 假对象只能证明 main.mjs 接对了线（check-main-wiring），这些要在真的 Electron 里看。
// 不 import electron：app、Menu、nativeImage 和窗口由 main.mjs 注入。每项给出 true/false，没通过的写明原因，
// 由 smoke-report 写进报告；只有核对本身出错（例如页面卡死）才抛出，按冒烟失败处理。

const EDIT_ROLES=['undo','redo','cut','copy','paste','pasteandmatchstyle','delete','selectall'];
const APP_ROLES=['hide','hideothers','unhide','quit'];

// 页面脚本限时 15 秒，写法同 smoke-pet 的 evalWithin：渲染进程卡死时 executeJavaScript 永远不返回，要报出来而不是一直等。
function evalWithin(win,label,source,ms=15000){
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
    const state={destroyed:win.isDestroyed(),visible:!win.isDestroyed()&&win.isVisible()};
    reject(Error(`${label} 窗口执行脚本 ${ms/1000} 秒未返回：${JSON.stringify(state)}；脚本开头 ${String(source).slice(0,80)}`));
  },ms);});
  return Promise.race([win.webContents.executeJavaScript(source),timeout]).finally(()=>clearTimeout(timer));
}
async function waitFor(read,ms){
  const end=Date.now()+ms;
  while(Date.now()<end){if(await read())return true;await new Promise(resolve=>setTimeout(resolve,50));}
  return Boolean(await read());
}
// 菜单里出现过的全部角色（小写）。真实 Menu 的 submenu 是 Menu（看 items），模板里是数组，两种都认。
export function menuRoles(menu){
  const roles=new Set();
  const walk=items=>{for(const item of items||[]){if(item.role)roles.add(String(item.role).toLowerCase());walk(Array.isArray(item.submenu)?item.submenu:item.submenu?.items);}};
  walk(menu?.items);
  return roles;
}
const submenuItems=item=>(Array.isArray(item?.submenu)?item.submenu:item?.submenu?.items||[]).filter(entry=>entry.type!=='separator');

// wait 只给检查脚本缩短等待用：activate 后等主窗口出现、等设置页渲染的时长（毫秒）。
export async function checkMacRuntime({app,Menu,nativeImage,mainWin,showMain,petWin,trayIcon,loginItems,baseUrl,wait:{activate=2000,page=6000}={}}){
  const checks={},failures={};
  // run 返回空串表示通过，否则返回原因；抛错也记为没通过，不让一项拖垮其余各项。
  async function check(name,run){
    let why;
    try{why=await run();}catch(error){why=error?.message||String(error);}
    checks[name]=!why;
    if(why)failures[name]=String(why);
  }
  const menu=Menu.getApplicationMenu(),roles=menuRoles(menu);
  await check('appMenuRoles',()=>{
    const missing=[...EDIT_ROLES,...APP_ROLES].filter(role=>!roles.has(role));
    return missing.length?'应用菜单缺少这些角色：'+missing.join('、'):'';
  });
  // 开发模式按设计保留开发者工具，这一项在开发模式下为 false；安装版必须为 true。
  await check('devToolsHidden',()=>roles.has('toggledevtools')?(app.isPackaged?'安装版的应用菜单里有开发者工具':'开发模式保留开发者工具（安装版里应当没有）'):'');
  await check('pageMenuDisabled',()=>{
    const items=submenuItems(menu?.items.find(item=>item.label==='页面'));
    if(!items.length)return '应用菜单里没有「页面」一栏';
    const enabled=items.filter(item=>item.enabled!==false).map(item=>item.label);
    return enabled.length?'没有学校或飞书窗口时「页面」里仍有可点的项：'+enabled.join('、'):'';
  });
  // 宠物窗设为在所有桌面显示时如果漏了 skipTransformProcessType，整个应用会变成没有程序坞图标的后台进程。
  await check('dockIconVisible',()=>app.dock?.isVisible()?'':'程序坞里看不到应用图标');
  await check('activateShowsMain',async()=>{
    if(!mainWin||mainWin.isDestroyed())return '主窗口不在';
    mainWin.hide();
    if(!await waitFor(()=>!mainWin.isVisible(),activate))return '主窗口没能隐藏';
    // 点程序坞图标时系统发来 reopen，Electron 以 activate 事件交给 main.mjs。
    app.emit('activate',{preventDefault(){}},false);
    const shown=await waitFor(()=>mainWin.isVisible(),activate);
    if(!shown)showMain();
    return shown?'':`隐藏主窗口后触发 activate，${activate/1000} 秒内没有重新显示`;
  });
  await check('trayTemplate',()=>{
    const image=nativeImage.createFromPath(trayIcon);
    if(image.isEmpty())return '读不出菜单栏图标：'+trayIcon;
    return image.isTemplateImage()?'':'菜单栏图标不是模板图（文件名应以 Template 结尾）';
  });
  await check('petAllWorkspaces',()=>!petWin||petWin.isDestroyed()?'宠物窗不在':petWin.isVisibleOnAllWorkspaces()?'':'宠物窗没有设为在所有桌面显示');
  await check('dockMenuWithoutQuit',()=>{
    const items=app.dock?.getMenu?.()?.items||[];
    if(!items.length)return '程序坞菜单为空';
    return items.some(item=>/退出/.test(item.label||''))?'程序坞菜单里有「退出」（系统会自带一项，不能重复）':'';
  });
  const main=source=>evalWithin(mainWin,'主',source);
  await check('rendererPlatform',async()=>{
    const platform=await main('window.szuDesktop?.platform');
    return platform==='darwin'?'':'页面拿到的平台是 '+JSON.stringify(platform);
  });
  // 设置页的桌面分区：登录项一行要换成 macOS 文案，并提示先拖进「应用程序」（冒烟用的应用从不在那里）。看完回到首页。
  await check('settingsCopy',async()=>{
    const url=mainWin.webContents.getURL();
    if(!url.startsWith(baseUrl))return '主窗口不在本机页面：'+url.split('?')[0];
    try{
      const reached=await waitFor(async()=>{
        if(await main("location.hash==='#settings/desktop'"))return true;
        await main("location.hash='#settings/desktop'");
        return false;
      },page);
      if(!reached)return '没能打开 #settings/desktop';
      const read=()=>main("document.querySelector('#desktop-options')?.innerText||''");
      await waitFor(async()=>{const text=await read();return text.includes('登录 Mac 时启动')&&text.includes('应用程序');},page);
      const text=await read();
      if(!text.includes('登录 Mac 时启动'))return '设置页没有「登录 Mac 时启动」：'+text.slice(0,120);
      if(!text.includes('应用程序'))return '设置页没有提示先拖进「应用程序」：'+text.slice(0,120);
      return /Windows|托盘/.test(text)?'设置页的桌面分区仍有 Windows 文案：'+text.slice(0,120):'';
    }finally{
      await main("location.hash='#home'");
      await waitFor(()=>main("location.hash==='#home'"),page);
    }
  });
  // 冒烟用的应用在临时目录（DMG 里复制出来）或开发目录里，登录项必须不可用，从头到尾不登记。
  await check('loginItemsUnsupported',()=>loginItems?.supported===false?'':'冒烟用的应用不在「应用程序」里，登录项应当不可用');
  return {checks,failures};
}
