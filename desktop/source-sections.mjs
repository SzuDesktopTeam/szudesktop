// 检查脚本从 app.mjs 切出连续源码片段，丢进 vm 里跑真实页面逻辑。
//
// 页面目前仍是单文件，锚点就是函数声明。把切片规则收在这里有两个好处：
// 锚点找不到时统一报出是哪一段，不再各写一套容易漏判的 indexOf；
// 将来把页面拆成模块，只需改这一处（比如换成按模块读取），不用逐个改检查脚本。
import assert from 'node:assert/strict';

export function createSection(source,{file='app.mjs'}={}){
 return function section(start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,`${file} 里找不到这一段：${start} → ${end}（函数改名或顺序变了吗？）`);
  return source.slice(from,to);
 };
}
