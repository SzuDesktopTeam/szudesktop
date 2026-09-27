// 安装版庭院引擎的依赖清单：从 engine.mjs 出发，沿静态 import / export…from 求出闭包。
// build.mjs 据此生成 extraResources，check-pet-view 对同一结果断言，不再手写名单。
// 只在构建和检查时运行，不进安装包。
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const GARDEN_DIR=path.resolve(here,'..','assets','garden');
export const GARDEN_ENGINE_ENTRY=path.join(GARDEN_DIR,'engine.mjs');
// main.mjs 在安装版里从 resources/garden-engine.mjs 加载引擎。
export const GARDEN_ENGINE_RESOURCE='garden-engine.mjs';

// 只认行首的 import / export 语句（含多行花括号），注释掉的导入不会被当成依赖。
const STATIC_IMPORT=/^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"\n]+)\1|^[ \t]*import\s*(['"])([^'"\n]+)\3/gm;
const DYNAMIC_IMPORT=/\bimport\s*\(/;

export function staticImports(source) {
  const text=String(source);
  // 动态导入没法在打包前确定，直接报错，避免安装版运行时才发现缺文件。
  if(DYNAMIC_IMPORT.test(text))throw Error('庭院引擎依赖里出现了动态 import()，打包清单无法静态解析');
  return [...text.matchAll(STATIC_IMPORT)].map(match=>match[2]??match[4]);
}

// 返回闭包内全部模块的绝对路径，入口在前，其余按发现顺序。
export function moduleClosure(entry=GARDEN_ENGINE_ENTRY,{root=GARDEN_DIR,read=file=>readFileSync(file,'utf8'),exists=existsSync}={}) {
  const seen=new Set(),queue=[path.resolve(entry)];
  while(queue.length) {
    const file=queue.shift();
    if(seen.has(file))continue;
    seen.add(file);
    for(const specifier of staticImports(read(file))) {
      if(!/^\.{1,2}\//.test(specifier))throw Error(`${path.basename(file)} 导入了 ${specifier}：安装版引擎只能使用相对路径模块`);
      const target=path.resolve(path.dirname(file),specifier);
      const relative=path.relative(root,target);
      if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error(`${path.basename(file)} 导入了庭院目录之外的 ${specifier}`);
      if(!exists(target))throw Error(`${path.basename(file)} 导入的 ${specifier} 不存在`);
      queue.push(target);
    }
  }
  return [...seen];
}

// electron-builder 的 extraResources 条目：入口改名为 garden-engine.mjs，其余保持相对 garden 目录的位置，
// 这样入口里的 './x.mjs' 在 resources 目录下照样能解析。
export function gardenEngineResources({entry=GARDEN_ENGINE_ENTRY,root=GARDEN_DIR,read,exists}={}) {
  const files=moduleClosure(entry,{root,read,exists});
  const resolvedEntry=path.resolve(entry);
  return files.map(file=>{
    if(file!==resolvedEntry&&moduleClosure(file,{root,read,exists}).includes(resolvedEntry)){
      throw Error(`${path.basename(file)} 反向导入了引擎入口；安装版入口已改名为 ${GARDEN_ENGINE_RESOURCE}，无法解析`);
    }
    return {from:file,to:file===resolvedEntry?GARDEN_ENGINE_RESOURCE:path.relative(root,file).split(path.sep).join('/')};
  });
}
