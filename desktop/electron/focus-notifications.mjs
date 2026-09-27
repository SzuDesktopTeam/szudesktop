// Uses only saved workspace state. Cancellation clears focus, and claiming rewards
// remains the user's action in the study page, never a background write.
const validFocus=focus=>Boolean(focus&&Number.isFinite(focus.end)&&focus.end>0
  &&Number.isFinite(focus.duration)&&focus.duration>=1&&focus.duration<=120);
export function completedFocus(snapshot,now=Date.now()) {
  const focus=snapshot?.data?.game?.focus;
  if(!validFocus(focus)||focus.end>now)return null;
  return {id:`${focus.end}:${focus.duration}`,duration:focus.duration,end:focus.end};
}
// 进行中的专注何时结束；没有或已经结束时返回 null。
export function activeFocusEnd(snapshot,now=Date.now()) {
  const focus=snapshot?.data?.game?.focus;
  return validFocus(focus)&&focus.end>now?focus.end:null;
}

export function createFocusNotifier({loadWorkspace,readSettings,saveSettings,isSupported,notify,now=Date.now}) {
  let checking=false,stopped=false;
  // silentUntil：在这个时刻或之前结束的专注只记为已处理、不弹通知（静音期间结束的那一段）。
  function inspect(snapshot,{silentUntil=0}={}) {
    if(stopped)return false;
    const completed=completedFocus(snapshot,now()),settings=readSettings();
    if(!completed||settings.lastNotifiedFocus===completed.id)return false;
    // Persist before notifying: restart cannot repeat the same completion.
    // Muted completions are consumed too, so unmuting does not release a backlog.
    saveSettings({...settings,lastNotifiedFocus:completed.id});
    if(completed.end<=silentUntil||!settings.focusNotifications||settings.doNotDisturb||!isSupported())return false;
    notify(completed);
    return true;
  }
  return {
    stop:()=>{stopped=true;},
    inspect(snapshot,options) {
      try {return inspect(snapshot,options);} catch {return false;}
    },
    async check(options) {
      if(checking||stopped)return false;
      checking=true;
      try {return inspect(await loadWorkspace(),options);}
      catch {return false;}
      finally {checking=false;}
    },
  };
}

// 主窗的一次存档保存请求（开始、取消、领取专注都经由它写入）。
export function isWorkspaceSave(details,baseUrl) {
  if(details?.method!=='POST'||!(details.statusCode>=200&&details.statusCode<300))return false;
  try {
    const url=new URL(details.url);
    return url.origin===new URL(baseUrl).origin&&url.pathname==='/api/workspace';
  } catch {return false;}
}

// 决定什么时候读存档，代替原来每 2 秒一次的轮询：
// - 关闭提醒、勿扰或系统不支持通知时一次也不读；
// - 有进行中的专注时按结束时间设一次性定时器，最长 1 分钟复查一次，容忍睡眠和调整时钟；
// - 主窗保存存档、提醒设置变化、宠物定时刷新（复用同一份存档）时再看一眼；
// - idleRecheckMs：专注可能在主窗以外开始（复用的便携版引擎、它打开的浏览器页），主窗看不到保存；
//   没有进行中的专注时也按这个间隔低频复查（宠物刷新会顺延它，宠物可见时不额外读取）。
export const FOCUS_RECHECK_MAX_MS=60000;
export const FOCUS_SAVE_SETTLE_MS=1000;
const FOCUS_END_SLACK_MS=500;
export function createFocusScheduler({notifier,loadWorkspace,readSettings,isSupported,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,idleRecheckMs=0}) {
  let timer=null,saveTimer=null,watching=false,stopped=false,silentUntil=0,loading=null,again=false;
  const wanted=()=>{
    if(stopped)return false;
    try {const settings=readSettings();return Boolean(settings.focusNotifications&&!settings.doNotDisturb&&isSupported());}
    catch {return false;}
  };
  const cancel=()=>{
    if(timer!==null){clearTimer(timer);timer=null;}
    if(saveTimer!==null){clearTimer(saveTimer);saveTimer=null;}
  };
  function arm(delay) {
    if(timer!==null){clearTimer(timer);timer=null;}
    if(stopped||!watching)return;
    timer=setTimer(()=>{timer=null;void refresh();},delay);
    timer?.unref?.();
  }
  function observe(snapshot) {
    if(stopped)return false;
    const notified=notifier.inspect(snapshot,{silentUntil});
    const end=activeFocusEnd(snapshot,now());
    if(end!==null)arm(Math.min(FOCUS_RECHECK_MAX_MS,end-now()+FOCUS_END_SLACK_MS));
    else if(idleRecheckMs>0)arm(idleRecheckMs);
    else if(timer!==null){clearTimer(timer);timer=null;}
    return notified;
  }
  function refresh() {
    if(stopped||!watching)return Promise.resolve(false);
    // 读取途中又有新的保存：读完后再读一次，而不是并发多读。
    if(loading){again=true;return loading;}
    loading=(async()=>{
      let notified=false;
      do {
        again=false;
        try {notified=observe(await loadWorkspace())||notified;}
        catch {arm(FOCUS_RECHECK_MAX_MS);}
      } while(again&&!stopped&&watching);
      return notified;
    })().finally(()=>{loading=null;});
    return loading;
  }
  return {
    observe,refresh,
    // 启动时按当前设置决定是否读一次；应用关闭期间结束、尚未提醒过的专注照常提醒。
    start() {watching=wanted();return refresh();},
    settingsChanged() {
      const next=wanted();
      if(next===watching)return;
      watching=next;
      if(!watching){cancel();return;}
      // 静音期间结束的专注只记为已处理，重新打开提醒后不补发。
      silentUntil=now();
      void refresh();
    },
    // 连续保存（例如小游戏每一步）合并成一次读取。
    workspaceSaved() {
      if(stopped||!watching)return;
      if(saveTimer!==null)clearTimer(saveTimer);
      saveTimer=setTimer(()=>{saveTimer=null;void refresh();},FOCUS_SAVE_SETTLE_MS);
      saveTimer?.unref?.();
    },
    stop() {stopped=true;watching=false;cancel();},
  };
}
