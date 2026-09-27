// 检查脚本共用的 electron 假对象：只实现主进程模块用到的那部分接口，并记下调用，方便断言行为。
// 不启动 Electron、不读用户配置；只被 check-*.mjs 引用，不进安装包。
import {EventEmitter} from 'node:events';

export class FakeSession {
  constructor(){
    this.permissionRequest=null;this.permissionCheck=null;this.headersReceived=null;this.completed=null;
    this.webRequest={onHeadersReceived:fn=>{this.headersReceived=fn;},onCompleted:fn=>{this.completed=fn;}};
  }
  setPermissionRequestHandler(fn){this.permissionRequest=fn;}
  setPermissionCheckHandler(fn){this.permissionCheck=fn;}
}

export class FakeWebContents extends EventEmitter {
  constructor(){
    super();
    this.sent=[];this.mainFrame={url:''};this.session=new FakeSession();this.openHandler=null;this.crashed=false;this.destroyed=false;
  }
  send(channel,payload){this.sent.push([channel,payload]);}
  setWindowOpenHandler(fn){this.openHandler=fn;}
  isDestroyed(){return this.destroyed;}
  isCrashed(){return this.crashed;}
  async executeJavaScript(){return undefined;}
  async capturePage(){return {toPNG:()=>Buffer.alloc(0)};}
  // 最近一次发往该通道的内容；没有时返回 undefined。
  last(channel){return this.sent.findLast(([name])=>name===channel)?.[1];}
}

// 同一个假窗口类同时充当主窗口和宠物窗：记录选项、几何、显隐和鼠标穿透。
export function fakeWindowClass(){
  const windows=[];
  class FakeWindow extends EventEmitter {
    constructor(options){
      super();
      this.options=options;this.webContents=new FakeWebContents();
      this.bounds={x:options.x??0,y:options.y??0,width:options.width??0,height:options.height??0};
      this.visible=Boolean(options.show??true);this.destroyed=false;this.minimized=false;this.focused=false;
      this.alwaysOnTop=Boolean(options.alwaysOnTop);this.focusable=options.focusable!==false;this.mouse=[];this.loaded=[];
      windows.push(this);
    }
    setMenuBarVisibility(value){this.menuBar=value;}
    setIgnoreMouseEvents(ignore,options){this.mouse.push({ignore,forward:options?.forward});}
    async loadFile(file){this.loaded.push(file);}
    async loadURL(url){this.loaded.push(url);}
    setAlwaysOnTop(value,level){this.alwaysOnTop=value;this.level=level;}
    showInactive(){this.visible=true;}
    show(){this.visible=true;}
    hide(){this.visible=false;}
    focus(){this.focused=true;}
    isVisible(){return this.visible;}
    isMinimized(){return this.minimized;}
    restore(){this.minimized=false;}
    getBounds(){return {...this.bounds};}
    setBounds(bounds){this.bounds={...bounds};}
    setFocusable(value){this.focusable=value;}
    isDestroyed(){return this.destroyed;}
    destroy(){if(this.destroyed)return;this.destroyed=true;this.webContents.destroyed=true;this.emit('closed');}
    close(){this.destroy();}
  }
  return {FakeWindow,windows};
}

// Menu.buildFromTemplate 的替身：保留模板，按 id 查找菜单项，popup 只记下参数（callback 由检查脚本手动调用）。
export function fakeMenu(){
  const built=[];
  const find=(items,id)=>{
    for(const item of items||[]){
      if(item.id===id)return item;
      const nested=find(item.submenu,id);
      if(nested)return nested;
    }
    return null;
  };
  return {built,Menu:{buildFromTemplate(template){
    const menu={items:template,popups:[],popup(options){this.popups.push(options);},getMenuItemById:id=>find(template,id),
      find:label=>template.find(item=>item.label===label)};
    built.push(menu);
    return menu;
  }}};
}

// screen 的替身：单一显示器，光标位置可以改；on() 记下显示器变化的监听器。
export function fakeScreen(workArea={x:0,y:0,width:1920,height:1080}){
  const screen=new EventEmitter();
  screen.cursor={x:0,y:0};
  screen.getPrimaryDisplay=()=>({workArea});
  screen.getDisplayNearestPoint=()=>({workArea});
  screen.getDisplayMatching=()=>({workArea});
  screen.getCursorScreenPoint=()=>screen.cursor;
  return screen;
}

export class FakeIpcMain {
  constructor(){this.handlers=new Map();this.listeners=new Map();}
  handle(channel,fn){if(this.handlers.has(channel))throw Error('duplicate handler '+channel);this.handlers.set(channel,fn);}
  on(channel,fn){if(this.listeners.has(channel))throw Error('duplicate listener '+channel);this.listeners.set(channel,fn);}
  async invoke(channel,event,...args){return this.handlers.get(channel)(event,...args);}
  emit(channel,event,...args){return this.listeners.get(channel)(event,...args);}
}

export class FakeTray extends EventEmitter {
  constructor(icon){super();this.icon=icon;this.menu=null;this.destroyed=false;}
  setToolTip(text){this.tooltip=text;}
  setContextMenu(menu){this.menu=menu;}
  destroy(){this.destroyed=true;}
  isDestroyed(){return this.destroyed;}
}

// 记录错误框和询问框；showMessageBox 依次取 responses 里的按钮编号。
export function fakeDialog(responses=[]){
  const errors=[],boxes=[];
  return {errors,boxes,
    showErrorBox(title,message){errors.push({title,message});},
    async showMessageBox(...args){
      const options=args.at(-1);
      boxes.push({parent:args.length>1?args[0]:null,options});
      return {response:responses.length?responses.shift():0};
    }};
}

// 让排队的 promise 与 setImmediate 回调都跑完。
export const settle=async(rounds=5)=>{for(let i=0;i<rounds;i++)await new Promise(resolve=>setImmediate(resolve));};
