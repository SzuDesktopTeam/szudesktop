const rows=[['focusNotifications','专注完成时提醒我','主窗口隐藏时也可提醒；完全退出后不提醒。'],['doNotDisturb','安静陪伴','暂停专注通知，不改变计时、互动或奖励。'],['petVisible','显示桌面伙伴','关闭后可从托盘恢复，重启保留选择。'],['petAlwaysOnTop','伙伴保持置顶','关闭后，其他窗口可以盖住伙伴。'],['launchAtLogin','登录 Windows 时启动','只在主动开启后登记，开机不弹出主窗口。']];
export function createDesktopOptions({toast}){
 let settings=null;
 const supported=()=>!!globalThis.szuDesktop?.desktopSettings;
 function card(){if(!supported())return '';return `<section class="card desktop-options"><h2>安静地陪在桌面上</h2><div id="desktop-options">${fields()}</div><p id="desktop-options-status" class="muted" role="status"></p></section>`}
 function fields(){return rows.map(([key,label,hint])=>`<label class="setting-row"><span><strong>${label}</strong><small>${key==='launchAtLogin'&&settings&&!settings.launchAtLoginSupported?'仅支持已安装的 Windows 版本。':key==='focusNotifications'&&settings&&!settings.notificationsSupported?'此系统暂不支持通知，主窗口仍显示完成状态。':hint}</small></span><input type="checkbox" data-desktop-setting="${key}" ${settings?.[key]?'checked':''} ${!settings||key==='launchAtLogin'&&!settings.launchAtLoginSupported||key==='focusNotifications'&&!settings.notificationsSupported?'disabled':''}></label>`).join('')}
 function paint(value){settings=value;const el=document.getElementById('desktop-options');if(el)el.innerHTML=fields()}
 async function load(){if(!supported())return;try{paint(await globalThis.szuDesktop.desktopSettings())}catch(e){const el=document.getElementById('desktop-options-status');if(el)el.textContent='桌面设置读取失败，请稍后重试。'}}
 async function change(event){const key=event.target.dataset.desktopSetting;if(!key)return false;const input=event.target;input.disabled=true;try{paint(await globalThis.szuDesktop.setDesktopSettings({[key]:input.checked}));toast('桌面偏好已保存')}catch{toast('没有保存成功，请重试');await load()}finally{if(input.isConnected)input.disabled=false}return true}
 globalThis.szuDesktop?.onDesktopSettings?.(paint);
 return {card,load,change};
}
