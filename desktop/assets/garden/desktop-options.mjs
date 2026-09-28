import {focusKey,restoreFocus} from './shell-repaint.mjs';
import {isMac} from './platform.mjs';
// 「勿扰」与托盘菜单的「勿扰（暂停专注提醒）」同名：同一个开关只用一个名字。
const rows=[['focusNotifications','专注完成时提醒我','主窗口隐藏时也可提醒；完全退出后不提醒。'],['doNotDisturb','勿扰','暂停专注通知，不改变计时、互动或奖励。'],['petVisible','显示桌面伙伴','关闭后可从托盘恢复，重启保留选择。'],['petAlwaysOnTop','伙伴保持置顶','关闭后，其他窗口可以盖住伙伴。'],['autoConnectCampus','启动时自动连接校园网','使用已记住的账号；本机已在线时跳过，下次启动生效。'],['launchAtLogin','登录 Windows 时启动','只在主动开启后登记，开机不弹出主窗口。']];
// macOS 用菜单栏图标代替托盘；通知授权要等第一次提醒时才由系统询问，先说一声免得用户以为没反应。其余几行与 Windows 同文。
const macRows=rows.map(([key,label,hint])=>({focusNotifications:[key,label,hint+'首次提醒时 macOS 会询问是否允许通知。'],petVisible:[key,label,'关闭后可从菜单栏图标恢复，重启保留选择。'],launchAtLogin:[key,'登录 Mac 时启动','只在主动开启后登记，登录时不弹出主窗口。']})[key]||[key,label,hint]);
const rowsFor=mac=>mac?macRows:rows;
// 登录项的原因随快照给出（launchAtLoginHint）：待系统批准时开关仍可用，只提示去哪里允许；
// 不在「应用程序」里时开关置灰——从 DMG 或下载目录直接运行登记不了登录项，开发模式同理。
function macLoginHint(settings,hint){const reason=settings?.launchAtLoginHint;return reason==='requires-approval'?'已登记，还需在「系统设置 → 通用 → 登录项与扩展」里允许 szuDesktop 才会生效。':reason==='not-in-applications'||settings&&!settings.launchAtLoginSupported?'请先把 szuDesktop 拖到「应用程序」文件夹，再从那里打开后开启。':hint}
export function createDesktopOptions({toast}){
 let settings=null;
 const supported=()=>!!globalThis.szuDesktop?.desktopSettings;
 function card(){if(!supported())return '';return `<section class="card desktop-options"><h2>安静地陪在桌面上</h2><div id="desktop-options">${fields()}</div><p id="desktop-options-status" class="muted" role="status"></p></section>`}
 function fields(){const mac=isMac();return rowsFor(mac).map(([key,label,hint])=>`<label class="setting-row"><span><strong>${label}</strong><small>${key==='launchAtLogin'&&mac?macLoginHint(settings,hint):key==='launchAtLogin'&&settings&&!settings.launchAtLoginSupported?'仅支持已安装的 Windows 版本。':key==='focusNotifications'&&settings&&!settings.notificationsSupported?'此系统暂不支持通知，主窗口仍显示完成状态。':hint}</small></span><input type="checkbox" data-desktop-setting="${key}" ${settings?.[key]?'checked':''} ${!settings||key==='launchAtLogin'&&!settings.launchAtLoginSupported||key==='focusNotifications'&&!settings.notificationsSupported?'disabled':''}></label>`).join('')}
 // 重绘开关后把键盘焦点放回同一个开关，避免落回页面开头。
 function paint(value){settings=value;const el=document.getElementById('desktop-options');if(el){const spot=focusKey(document.activeElement);el.innerHTML=fields();restoreFocus(spot)}}
 async function load(){if(!supported())return;try{paint(await globalThis.szuDesktop.desktopSettings())}catch(e){const el=document.getElementById('desktop-options-status');if(el)el.textContent='桌面设置读取失败，请稍后重试。'}}
 async function change(event){const key=event.target.dataset.desktopSetting;if(!key)return false;const input=event.target,spot=focusKey(input);input.disabled=true;try{paint(await globalThis.szuDesktop.setDesktopSettings({[key]:input.checked}));toast('桌面偏好已保存')}catch{toast('没有保存成功，请重试');await load()}finally{if(input.isConnected)input.disabled=false;restoreFocus(spot)}return true}
 globalThis.szuDesktop?.onDesktopSettings?.(paint);
 return {card,load,change};
}
