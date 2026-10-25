// Keep only a local note reference or the public school notice that led to a task.
export function normalizeTodoSource(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const title=typeof value.title==='string'?Array.from(value.title.trim()).slice(0,200).join(''):'';
 if(value.type==='note'&&typeof value.noteId==='string'&&value.noteId.trim()){
  return {type:'note',noteId:value.noteId,title:title||'未命名笔记'};
 }
 if(value.type==='notice'&&typeof value.url==='string'){
  try{
   const url=new URL(value.url);
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||url.hash)return undefined;
   if(url.hostname!=='szu.edu.cn'&&!url.hostname.endsWith('.szu.edu.cn'))return undefined;
   return {type:'notice',url:url.href,title:title||'校园公告'};
  }catch{}
 }
 return undefined;
}
