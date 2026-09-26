// 宠物窗专用 preload：仅暴露状态订阅和受限的菜单、缩放步进、拖动通知。
// 宠物渲染进程没有任何 fetch/Node 能力，数据全部由主进程推过来。
// 不接收路径或任意频道；拖动只传事件坐标，主进程将窗口限制在显示器工作区。
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('szuPet', Object.freeze({
  onState: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('pet:state', (_event, key) => cb(String(key)));
  },
  onSay: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('pet:say', (_event, text) => cb(String(text).slice(0, 60)));
  },
  // 主进程推送当前伙伴与学习/动画设置，两个窗口共用同一个逐帧播放器。
  onAction: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('pet:action', (_event, payload) => {
      const view = payload && typeof payload === 'object' ? payload : {};
      cb({species:String(view.species??''),mood:Number(view.mood),energy:Number(view.energy),sleeping:Boolean(view.sleeping),focus:Boolean(view.focus),motion:view.motion!==false});
    });
  },
  // 主进程推送的缩放倍数，用于驱动 CSS 变量。
  onScale: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('pet:scale', (_event, value) => cb(Number(value)));
  },
  onReaction: (cb) => {
    if (typeof cb === 'function') ipcRenderer.on('pet:react', (_event,action) => {
      if(typeof action==='string'&&/^[a-zA-Z]{1,32}$/.test(action))cb(action);
    });
  },
  openMenu: () => ipcRenderer.send('pet:menu'),
  scaleStep: (direction) => {
    if (direction === 1 || direction === -1) ipcRenderer.send('pet:scale-step', direction);
  },
  drag: (phase, point) => {
    if (['start', 'move', 'end'].includes(phase) && Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
      ipcRenderer.send('pet:drag', phase, {x:Math.round(point.x), y:Math.round(point.y)});
    }
  },
}));
