// 页面是否运行在 macOS 桌面版里：只认 preload 给出的 platform。
// 不回退到 navigator：便携版在 Mac 浏览器里打开时没有菜单栏图标、⌘Q 这些外壳能力，仍按原文案显示。
export const isMac=(bridge=globalThis.szuDesktop)=>bridge?.platform==='darwin';
