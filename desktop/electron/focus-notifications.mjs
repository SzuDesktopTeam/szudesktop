// Uses only saved workspace state. Cancellation clears focus, and claiming rewards
// remains the user's action in the study page, never a background write.
export function completedFocus(snapshot,now=Date.now()) {
  const focus=snapshot?.data?.game?.focus;
  if(!focus||!Number.isFinite(focus.end)||focus.end<=0||focus.end>now
    ||!Number.isFinite(focus.duration)||focus.duration<1||focus.duration>120)return null;
  return {id:`${focus.end}:${focus.duration}`,duration:focus.duration};
}

export function createFocusNotifier({loadWorkspace,readSettings,saveSettings,isSupported,notify,now=Date.now}) {
  let checking=false,stopped=false;
  return {
    stop:()=>{stopped=true;},
    async check() {
      if(checking||stopped)return false;
      checking=true;
      try {
        const snapshot=await loadWorkspace();
        if(stopped)return false;
        const completed=completedFocus(snapshot,now()),settings=readSettings();
        if(!completed||settings.lastNotifiedFocus===completed.id)return false;
        // Persist before notifying: restart cannot repeat the same completion.
        // Muted completions are consumed too, so unmuting does not release a backlog.
        saveSettings({...settings,lastNotifiedFocus:completed.id});
        if(!settings.focusNotifications||settings.doNotDisturb||!isSupported())return false;
        notify(completed);
        return true;
      } catch {return false;}
      finally {checking=false;}
    },
  };
}
