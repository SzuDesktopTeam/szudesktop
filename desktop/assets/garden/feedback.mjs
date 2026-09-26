const safeVersion=value=>/^(?:beta|v)?\d+\.\d+\.\d+$/.test(String(value))?String(value):'未知构建';
export function environmentSummary({version,mode,navigatorInfo=globalThis.navigator}={}){
 const platform=String(navigatorInfo?.userAgentData?.platform||navigatorInfo?.platform||navigatorInfo?.userAgent||'');
 const os=/android/i.test(platform)?'Android':/iphone|ipad|ipod/i.test(platform)?'iOS':/win/i.test(platform)?'Windows':/mac/i.test(platform)?'macOS':/linux/i.test(platform)?'Linux':'未知系统';
 return `szuDesktop ${safeVersion(version)}\n系统：${os}\n界面：${mode==='electron'?'安装版桌面窗口':'便携版 / 浏览器窗口'}`;
}
export function createFeedbackUI({getVersion,getMode,toast,clipboard=globalThis.navigator?.clipboard}){
 const summary=()=>environmentSummary({version:getVersion(),mode:getMode()});
 let manual=false;
 function card(){return `<section class="card" id="feedback-panel"><h2>反馈与建议</h2><p>遇到问题时，附上发生步骤和下面三项信息，能帮助我们复现。</p><pre class="feedback-environment">${summary()}</pre><div class="actions"><button data-action="feedback-copy">复制环境信息</button><a class="button quiet" href="https://github.com/SzuDesktopTeam/szudesktop/issues/new/choose" target="_blank" rel="noopener noreferrer">提交反馈 ↗</a></div><small>只复制版本、系统类型和界面模式，不包含学号、成绩、密码、Cookie 或存档。提交 GitHub 反馈需要 GitHub 账号。</small>${manual?'<p role="status" class="notice">剪贴板暂不可用，请选中上方三行文字手动复制。</p>':''}</section>`}
 async function click(action){if(action!=='feedback-copy')return false;try{if(!clipboard?.writeText)throw Error('clipboard unavailable');await clipboard.writeText(summary());manual=false;toast('已复制版本、系统和界面模式')}catch{manual=true;toast('请选中环境信息手动复制')}const el=document.getElementById('feedback-panel');if(el)el.outerHTML=card();return true}
 return {card,click};
}
