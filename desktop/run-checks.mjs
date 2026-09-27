// 统一检查入口：node desktop/run-checks.mjs [--only-node]
//
// 第一步做模块语法与链接检查（见 desktop/module-links.mjs），然后自动发现并逐个运行
// desktop/check-*.mjs 与 desktop/electron/check-*.mjs，再跑 desktop/check_*.py
// （发布说明抽取、许可文件与第三方来源哈希、Windows 版本资源），
// 最后汇总失败并以非零码退出。--only-node 只跑 JS 检查（模块链接检查照跑）。
//
// 为什么要有它：检查清单以前分别手抄在 release.yml、Makefile、README 和 CONTRIBUTING 里，
// 已经对不上（CONTRIBUTING 只列了 10 个，CI 实际跑 38 个）。新增检查只要按
// check-xxx.mjs / check_xxx.py 命名放进对应目录，CI 和本地都会自动跑到，不用再改任何清单。
// 每个检查都以仓库根为工作目录单独起一个进程，和 CI 里逐条执行时一样。
//
// 模块分析函数放在 desktop/module-links.mjs，本文件只负责调度；它不导出任何东西，被运行时总是执行全部检查
// （不做“是否被直接运行”的判断，免得经符号链接或 junction 运行时 argv 与 import.meta.url 对不上而静默跳过）。
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {moduleLinkStep} from './module-links.mjs';

const desktop=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(desktop);

// ───────────────────────── 运行全部检查 ─────────────────────────

// 单个检查最多跑 5 分钟：卡住的检查要报出来，而不是让 CI 挂到默认的 6 小时。
const TIMEOUT_MS=5*60*1000;

function discover(dir,pattern){
  return readdirSync(path.join(root,dir)).filter(name=>pattern.test(name)).sort().map(name=>path.posix.join(dir,name));
}

async function main(){
  const onlyNode=process.argv.includes('--only-node');
  const unknown=process.argv.slice(2).filter(arg=>arg!=='--only-node');
  if(unknown.length){
    console.error('用法: node desktop/run-checks.mjs [--only-node]\n不认识的参数: '+unknown.join(' '));
    process.exit(2);
  }
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const nodeChecks=[...discover('desktop',/^check-.+\.mjs$/),...discover('desktop/electron',/^check-.+\.mjs$/)];
  const pythonChecks=onlyNode?[]:discover('desktop',/^check_.+\.py$/);
  // 一个都没找到说明路径或命名约定变了；静默「全部通过」比失败更糟。
  if(!nodeChecks.length||(!onlyNode&&!pythonChecks.length)){
    console.error('!! 没有发现任何检查脚本（desktop/check-*.mjs、desktop/electron/check-*.mjs、desktop/check_*.py），请确认从仓库里运行');
    process.exit(1);
  }

  const failures=[];
  const started=Date.now();
  {
    const name='模块语法与链接检查（garden 与 electron 的 .mjs）';
    console.log(`\n▶ ${name}`);
    const t0=Date.now(),{files,errors}=await moduleLinkStep(),seconds=((Date.now()-t0)/1000).toFixed(1);
    if(errors.length){
      console.log(errors.map(line=>'  '+line).join('\n'));
      failures.push(`${name}：${errors.length} 处问题`);
      console.log(`✗ ${name}（${files.length} 个模块，${errors.length} 处问题，${seconds}s）`);
    }else console.log(`✓ ${name}（${files.length} 个模块，${seconds}s）`);
  }

  const runs=[...nodeChecks.map(file=>[process.execPath,file]),...pythonChecks.map(file=>[python,file])];
  for(const [command,file] of runs){
    console.log(`\n▶ ${file}`);
    const t0=Date.now();
    const result=spawnSync(command,[file],{cwd:root,stdio:'inherit',timeout:TIMEOUT_MS,windowsHide:true});
    const seconds=((Date.now()-t0)/1000).toFixed(1);
    if(result.error||result.status!==0){
      const why=result.error?.code==='ETIMEDOUT'?`超过 ${TIMEOUT_MS/60000} 分钟未结束`
        :result.error?`无法启动（${result.error.message}）`
        :result.signal?`被信号 ${result.signal} 终止`:`退出码 ${result.status}`;
      failures.push(`${file}：${why}`);
      console.log(`✗ ${file}（${why}，${seconds}s）`);
    }else{
      console.log(`✓ ${file}（${seconds}s）`);
    }
  }

  const total=((Date.now()-started)/1000).toFixed(1);
  const summary=`模块链接检查 + ${nodeChecks.length} 个 JS 检查`+(onlyNode?'':` + ${pythonChecks.length} 个 Python 检查`);
  if(failures.length){
    console.error(`\n${summary}，${failures.length} 个失败（用时 ${total}s）：\n`+failures.map(line=>'  - '+line).join('\n'));
    process.exit(1);
  }
  console.log(`\n${summary}，全部通过（用时 ${total}s）`);
}

await main();
