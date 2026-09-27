// 庭院存档的写入：带修订号提交，冲突时同步到最新存档并如实说明。
// 页面状态（state、revision、读档失败的降级状态）仍由 app.mjs 持有，这里通过 read 和 setRevision/setState 读写，检查脚本可以直接 import 后注入替身。
// read() 返回 {failure,revision}；setRevision、setState 与原来的赋值顺序一致（先记修订号，再换存档）；paint 是默认的重绘；byId 按 id 找表单节点，用来在冲突后填回草稿。
export function createWorkspaceCommit({api,normalize,read,setRevision,setState,paint,byId}){
 return async function commit(next,draft,repaint=paint){
  const {failure,revision}=read();
  if(failure)throw Error('庭院存档暂时打不开，这项改动没有保存。可以先在「今日」导出原始存档或尝试恢复。');
  try{const result=await api('/api/workspace',{version:1,revision,data:next});setRevision(result.revision);setState(next);repaint()}
  catch(e){
   if(e.code===409){
    const latest=await api('/api/workspace');setRevision(latest.revision);setState(normalize(latest.data));repaint();
    if(draft){const form=byId(draft.formId);for(const [name,value] of Object.entries(draft.values)){const field=form?.elements.namedItem(name);if(field){if(field.type==='checkbox')field.checked=!!value;else field.value=value}}}
    // 冲突也可能是服务端刚用备份恢复了损坏的存档（409 或重读的响应带恢复标记），这时不能说成另一个窗口。
    throw Error((e.recovered||latest.recovered?'存档文件损坏，已恢复到上一次成功保存的版本':'另一个窗口有新记录，已同步')+'。本次操作尚未保存，请再试一次。');
   }
   throw e;
  }
 };
}
