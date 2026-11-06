// 架构决策记录不能写完就烂掉：编号、结构和状态都要保持可查。
// 新增 ADR 时把编号加进 EXPECTED，并在 docs/adr/README.md 的目录里同步登记。
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'docs','adr');

const EXPECTED=[
  '0001-electron-shell-go-engine.md',
  '0002-loopback-service-credentials.md',
  '0003-user-supplied-session.md',
  '0004-local-only-data.md',
  '0005-exclude-vpn-from-default-build.md',
  '0006-write-operations-boundary.md',
  '0007-multi-window-revision-lock.md',
  '0008-explicit-route-registration.md',
];

const problems=[];
const check=(ok,message)=>{if(!ok)problems.push(message);};

check(existsSync(path.join(dir,'README.md')),'缺少 docs/adr/README.md 索引');

// 编号连续，且不能有「散落但没登记」的 ADR 文件。
const actual=readdirSync(dir).filter(name=>/^\d{4}-.+\.md$/.test(name)).sort();
check(actual.length===EXPECTED.length,
  `ADR 文件数 ${actual.length}，索引登记 ${EXPECTED.length} 篇；实际：${actual.join(', ')}`);
for(const name of EXPECTED) check(actual.includes(name),`索引登记了 ${name}，但文件不存在`);
for(const name of actual) check(EXPECTED.includes(name),`${name} 存在但没登记进索引`);
EXPECTED.forEach((name,i)=>check(name.startsWith(String(i+1).padStart(4,'0')+'-'),`${name} 编号不连续`));

// 每篇都要有六段和状态行；只写好处不写代价的决定不算记录。
const SECTIONS=['## 背景','## 备选方案','## 决定','## 代价与边界','## 怎么验证'];
for(const name of EXPECTED){
  const file=path.join(dir,name);
  if(!existsSync(file))continue;
  const text=readFileSync(file,'utf8');
  check(text.startsWith('# ADR '),`${name}: 缺少 ADR 标题`);
  check(/^- 状态：.+/m.test(text),`${name}: 缺少状态行`);
  for(const heading of SECTIONS) check(text.includes(heading),`${name}: 缺少 ${heading}`);
  check(!/学生自制|与深圳大学无隶属|未验收请见谅/.test(text),
    `${name}: 决策记录里不要写防御性文案，写事实与取舍`);
}

// 索引表要指向每一篇，避免「文件在、目录找不到」。
const index=readFileSync(path.join(dir,'README.md'),'utf8');
for(const name of EXPECTED) check(index.includes(name),`README.md 目录缺少 ${name}`);

if(problems.length){
  console.error('架构决策记录检查失败：');
  for(const item of problems)console.error('  - '+item);
  process.exit(1);
}
console.log(`架构决策记录：${EXPECTED.length} 篇齐备，编号连续，结构完整`);
