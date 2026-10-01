// Keep the current page and draft alive when either save fails.
export function createSafeReload({save,reload,report}){
  let pending=null;
  return ()=>{
    if(pending)return pending;
    pending=Promise.resolve().then(save).then(reload).catch(report).finally(()=>{pending=null;});
    return pending;
  };
}
