// 庭院纯逻辑的性质测试：engine / puzzle2048 / garden-orders / garden-loop / garden-path / rewards。
// 思路：从函数名、注释和调用方提炼“对任意合法输入都应成立的性质”，用带种子的随机输入找反例，
// 失败时打印缩小后的最小反例与种子。公共小件见 desktop/property-testing.mjs。
// 文末带 “（修复前失败）” 的用例是随机测试找到、经人工复核确认的真实问题的最小回归用例。
import assert from 'node:assert/strict';
import {act,createState,normalize,recoverSave,settle,dayKey,level,gardenLevel,gpa,CROPS,QUESTS,DECOR,JOURNEY,PETS,PAT_REWARD_LIMIT,TODO_REWARD_LIMIT} from './assets/garden/engine.mjs';
import {PET_LIMIT} from './assets/garden/pet-catalog.mjs';
import {createPuzzle,normalizePuzzle,movePuzzle,undoPuzzle,restartPuzzle,puzzleCanMove,PUZZLE_MILESTONES} from './assets/garden/puzzle2048.mjs';
import {createOrders,normalizeOrders,dailyOrders,deliverOrder,ORDER_KEEPSAKES} from './assets/garden/garden-orders.mjs';
import {PROJECTS,projectStatus,nextProject,reservedStock,sellableStock,puzzleSupply} from './assets/garden/garden-loop.mjs';
import {gardenNextStep,pendingOrders} from './assets/garden/garden-path.mjs';
import {actionReward} from './assets/garden/rewards.mjs';
import {readRoute} from './assets/garden/routes.mjs';
import {Rng,forAll,test,report,clone,firstUnserializable,PROTO_KEYS} from './property-testing.mjs';

const NOW=new Date(2026,8,27,12).getTime();
const CROP_IDS=Object.keys(CROPS);
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const isPlainObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

// ───────────────────────── 生成器 ─────────────────────────

// 每一步的时间推进：以向前为主，混入零、跨天与回拨（时钟回拨是 settle 的 correctClock 明确支持的场景）。
const DT=[0,0,1000,10000,31000,65000,5*60000,21*60000,61*60000,5*3600000,86400000+3600000,3*86400000,-3600000,-86400000];
const TYPES=['chat','petSignature','puzzleMove','puzzleMove','puzzleUndo','puzzleRestart','puzzleClaim','orderDeliver','gift','pat','feed','play','sleep','rename','switchPet','plant','plant','water','harvest','harvest','unlock','buySeed','sell','sellSurplus','buyFood','decor','quest','achievement','focusStart','focusCancel','focusClaim','focusClaim','todoAdd','todoEdit','todoToggle','todoArchive','todoArchiveDone','todoDelete','visit','journeyClaim','nonsense'];
const ACHIEVEMENTS=['harvest','friend','focus','gardener','land','collection'];
// 随机动作：大多数字段取自当前状态里真实存在的编号，少数换成越界或原型链上的键，看引擎是否只用友好的 check 拒绝。
function randomAction(rng,s){
  const g=s.game,type=rng.pick(TYPES);
  const crop=()=>rng.bool(0.85)?rng.pick(CROP_IDS):rng.pick([...PROTO_KEYS,'',null,42,'apple']);
  const index=()=>rng.bool(0.85)?rng.int(0,5):rng.pick([-1,6,7,'3',1.5,'length','constructor',NaN,undefined]);
  const todoId=()=>s.todos.length&&rng.bool(0.85)?rng.pick(s.todos).id:rng.pick(['missing','constructor','']);
  switch(type){
   case 'feed':return rng.bool(0.5)?{type}:{type,crop:crop()};
   case 'rename':return {type,name:rng.bool(0.8)?'伙伴'+rng.int(1,99):rng.text(16)};
   case 'switchPet':return {type,index:rng.bool(0.9)?rng.int(0,g.pets.length-1):index()};
   case 'plant':return {type,crop:crop(),index:index()};
   case 'water':case 'harvest':case 'unlock':return {type,index:index()};
   case 'buySeed':case 'sell':case 'sellSurplus':return {type,crop:crop()};
   case 'decor':return {type,id:rng.pick([...Object.keys(DECOR),...Object.keys(PROJECTS),...Object.keys(PROJECTS),'constructor','toString','nothing'])};
   case 'quest':return {type,id:rng.pick([...Object.keys(QUESTS),...Object.keys(QUESTS),'constructor','x'])};
   case 'achievement':return {type,id:rng.pick([...ACHIEVEMENTS,...ACHIEVEMENTS,'constructor','x'])};
   case 'journeyClaim':return {type,id:rng.pick([...JOURNEY.map(c=>c.id),'constructor','x'])};
   case 'focusStart':return {type,minutes:rng.bool(0.85)?rng.pick([1,5,25,45,120]):rng.pick([0,121,'25',2.5,NaN,-1]),...(rng.bool(0.3)&&s.todos.length?{todoId:rng.pick(s.todos).id}:{})};
   case 'todoAdd':return {type,id:'t'+rng.int(0,20),text:rng.bool(0.9)?'小事'+rng.int(0,999):rng.text(10),...(rng.bool(0.4)?{date:rng.pick(['','2026-09-27','2026-09-30','2026-9-1','x'])}:{})};
   case 'todoEdit':return {type,id:todoId(),...(rng.bool(0.7)?{text:rng.bool(0.9)?'改'+rng.int(0,99):rng.text(6)}:{}),...(rng.bool(0.3)?{date:rng.pick(['','2026-10-01','bad'])}:{})};
   case 'todoToggle':case 'todoDelete':return {type,id:todoId()};
   case 'todoArchive':return {type,id:todoId(),...(rng.bool(0.3)?{archived:false}:{})};
   case 'puzzleMove':return {type,direction:rng.bool(0.9)?rng.pick(['up','right','down','left']):rng.pick([0,3,4,'diag',null])};
   case 'orderDeliver':return {type,id:rng.bool(0.9)&&g.orders.offers.length?rng.pick(g.orders.offers).id:rng.pick(['x','constructor','2026-09-27:0'])};
   default:return {type};
  }
}
// 可达状态：从 createState 出发按随机动作与时间推进演化。生成器一边生成一边演化以便按当前状态挑编号；
// prop 用 replay 重放同一份 steps 得到完全相同的状态序列，因此缩小 steps（删掉若干步）后仍是合法重放。
function genSteps(rng,size,max=70){
  const n=Math.max(1,Math.round(size*max*(0.3+0.7*rng.float())));
  const steps=[];let s=createState(NOW),t=NOW;
  for(let i=0;i<n;i++){const action=randomAction(rng,s),dt=rng.pick(DT);t=Math.max(1,t+dt);steps.push({action,dt});try{s=act(s,action,t)}catch{}}
  return steps;
}
function replay(steps,{onStep}={}){
  let s=createState(NOW),t=NOW;
  for(const {action,dt} of steps){
    t=Math.max(1,t+dt);
    if(!isPlainObject(action))continue;// 缩小器删掉 action 后这一步视为空操作
    let next=null,error=null;try{next=act(s,action,t)}catch(e){error=e}
    if(onStep)onStep({before:s,after:next,action,time:t,error});
    if(next)s=next;
  }
  return {state:s,time:t};
}

// 存档损坏：在一份可达存档上随机改 1–4 处（替换任意路径、删键、塞进 NaN/巨大数/原型链键名/错误类型）。
const SAVE_KEYS=['schema','profile','preferences','todos','courses','reminders','semester','game','created','last','coins','food','seeds','stock','plots','pets','pet','active','puzzle','orders','daily','stats','discovered','decor','equipped','achievements','gardenLevel','focus','focusHistory','journey','log','board','score','best','rng','moves','undo','day','offers','completed','total','keepsakes','days','claimed','pats','todoRewards','gift','name','xp','bond','hunger','energy','mood','sleeping','say','dialogue','species','crop','planted','ready','watered','id','text','done','date','end','duration','minutes'];
const GARBAGE=[null,true,false,0,-1,1.5,1e9,1e8+1,2**53,'',' ','locked','constructor','__proto__','2026-9-1','2026-09-27',[],{},[null],{constructor:1},'radish','libao'];
function mutate(rng,value,depth=0){
  const keys=isPlainObject(value)?Object.keys(value):Array.isArray(value)?value.map((_,i)=>i):[];
  if(!keys.length||depth>5||rng.bool(0.25))return rng.weighted([[3,()=>rng.pick(GARBAGE)],[2,()=>rng.json(2,{keys:SAVE_KEYS,allowSpecial:true})],[1,()=>rng.number(true)]]);
  const k=rng.pick(keys);
  if(rng.bool(0.15)){if(Array.isArray(value))value.splice(Number(k),1);else delete value[k];return value}
  if(isPlainObject(value)&&rng.bool(0.1)){value[rng.key(SAVE_KEYS)]=rng.pick(GARBAGE);return value}
  value[k]=mutate(rng,value[k],depth+1);return value;
}
function genCorruptSave(rng,size){
  const steps=genSteps(rng,size,40),{state}=replay(steps),save=clone(state);
  const n=rng.int(1,4);for(let i=0;i<n;i++)mutate(rng,save);
  // 农田是最容易被“半合法”值卡住的地方，额外多打一枪
  if(rng.bool(0.25)&&Array.isArray(save.game?.plots))save.game.plots[rng.int(0,5)]=rng.pick(GARBAGE);
  return save;
}

// ───────────────────────── 不变量 ─────────────────────────
const validTile=n=>n===0||(Number.isSafeInteger(n)&&n>=2&&Number.isInteger(Math.log2(n)));
const natural=n=>Number.isSafeInteger(n)&&n>=0;
function assertPuzzle(p,label='puzzle'){
  assert.ok(Array.isArray(p.board)&&p.board.length===16&&p.board.every(validTile),`${label}.board`);
  assert.ok(natural(p.score)&&natural(p.moves)&&natural(p.best)&&p.best>=p.score,`${label}.score/best/moves`);
  assert.ok(natural(p.rng)&&p.rng<=0xffffffff,`${label}.rng`);
  assert.equal(p.over,!puzzleCanMove(p.board),`${label}.over 与棋盘一致`);
  assert.equal(p.won,Math.max(...p.board)>=2048,`${label}.won 与棋盘一致`);
  assert.deepEqual(p.milestones,[...new Set(p.milestones)].sort((a,b)=>a-b),`${label}.milestones 有序无重复`);
  assert.ok(p.milestones.every(m=>PUZZLE_MILESTONES.includes(m)),`${label}.milestones 合法`);
  assert.ok(p.undo===null||(Array.isArray(p.undo.board)&&p.undo.board.length===16&&p.undo.board.every(validTile)),`${label}.undo`);
  for(const k of ['earnedDay','qualifiedDay'])assert.ok(p[k]===''||DAY.test(p[k]),`${label}.${k}`);
  assert.ok(p.supplyClaim===null||(p.supplyClaim.day===p.earnedDay&&Object.hasOwn(CROPS,p.supplyClaim.crop)&&p.supplyClaim.quantity===1),`${label}.supplyClaim`);
}
function assertOrders(o,label='orders'){
  assert.ok(o.day===''||DAY.test(o.day),`${label}.day`);
  const ids=o.day?[0,1,2].map(i=>o.day+':'+i):[];
  assert.ok(o.offers.length===0||o.offers.length===3,`${label}.offers 数量`);
  o.offers.forEach((offer,i)=>{assert.equal(offer.id,ids[i],`${label}.offers[${i}].id`);assert.ok(Object.hasOwn(PETS,offer.pet));const needs=Object.entries(offer.needs);assert.ok(needs.length>=1&&needs.length<=2&&needs.every(([c,n])=>Object.hasOwn(CROPS,c)&&Number.isInteger(n)&&n>=1&&n<=4),`${label}.offers[${i}].needs`);assert.ok(natural(offer.coins)&&offer.coins>=offer.bonus)});
  assert.deepEqual(o.completed,[...new Set(o.completed)],`${label}.completed 无重复`);
  assert.ok(o.completed.every(id=>ids.includes(id)),`${label}.completed 属于当天`);
  assert.ok(natural(o.total)&&o.total>=o.completed.length,`${label}.total`);
  assert.ok(o.keepsakes.every(id=>ORDER_KEEPSAKES.some(k=>k.id===id&&k.total<=o.total)),`${label}.keepsakes`);
}
// 一份“合法状态”应满足的全部不变量：normalize、recoverSave、settle、act 的输出都要过这一关。
function assertValidState(s,label='state'){
  assert.equal(firstUnserializable(s),null,`${label} 里出现 NaN/Infinity/undefined`);
  assert.equal(s.schema,3);
  const g=s.game;
  assert.equal(g.plots.length,6,`${label}.plots 长度`);
  for(const p of g.plots)if(p!==null&&p!=='locked')assert.ok(isPlainObject(p)&&Object.hasOwn(CROPS,p.crop)&&Number.isFinite(p.planted)&&Number.isFinite(p.ready),`${label}.plots 作物`);
  for(const k of ['coins','food'])assert.ok(Number.isFinite(g[k])&&g[k]>=0&&g[k]<=1e8,`${label}.${k}=${g[k]} 越界`);
  for(const bag of ['seeds','stock']){assert.deepEqual(Object.keys(g[bag]).sort(),[...CROP_IDS].sort(),`${label}.${bag} 键集`);for(const [c,n] of Object.entries(g[bag]))assert.ok(Number.isInteger(n)&&n>=0&&n<=1e7,`${label}.${bag}.${c}=${n}`)}
  assert.ok(g.pets.length>=1&&g.pets.length<=PET_LIMIT,`${label}.pets 数量`);
  for(const p of g.pets){
    assert.ok(Object.hasOwn(PETS,p.species),`${label} 伙伴种类`);
    assert.ok(typeof p.name==='string'&&p.name.length>=1&&p.name.length<=12,`${label} 伙伴名字长度`);
    for(const k of ['bond','hunger','energy','mood'])assert.ok(Number.isFinite(p[k])&&p[k]>=0&&p[k]<=100,`${label} 伙伴 ${k}=${p[k]}`);
    assert.ok(Number.isFinite(p.xp)&&p.xp>=0,`${label} 伙伴 xp`);
    assert.equal(typeof p.sleeping,'boolean');assert.ok(typeof p.say==='string'&&p.say.length<=60,`${label} 伙伴台词长度`);
    for(const k of ['lastPat','lastPlay','saidAt'])assert.ok(Number.isFinite(p[k])&&p[k]>=0,`${label} 伙伴 ${k}`);
  }
  assert.ok(Number.isInteger(g.active)&&g.active>=0&&g.active<g.pets.length,`${label}.active`);
  assert.match(g.daily.day,DAY,`${label}.daily.day`);
  for(const k of Object.keys(QUESTS))assert.ok(Number.isFinite(g.daily[k])&&g.daily[k]>=0,`${label}.daily.${k}`);
  assert.ok(g.daily.claimed.every(k=>Object.hasOwn(QUESTS,k)),`${label}.daily.claimed`);
  assert.ok(Number.isInteger(g.daily.todoRewards)&&g.daily.todoRewards>=0&&g.daily.todoRewards<=TODO_REWARD_LIMIT,`${label}.daily.todoRewards`);
  assert.ok(Array.isArray(g.daily.pats)&&g.daily.pats.length<=PET_LIMIT&&[...g.daily.pats].every(n=>n===undefined||(Number.isInteger(n)&&n>=0&&n<=PAT_REWARD_LIMIT)),`${label}.daily.pats`);
  for(const k of ['harvest','focus','minutes','planted','tasks'])assert.ok(Number.isFinite(g.stats[k])&&g.stats[k]>=0,`${label}.stats.${k}`);
  assertPuzzle(g.puzzle,`${label}.puzzle`);assertOrders(g.orders,`${label}.orders`);
  assert.ok(g.journey.days.length<=7&&g.journey.days.every(d=>DAY.test(d)),`${label}.journey.days`);
  assert.deepEqual(g.journey.days,[...new Set(g.journey.days)].sort(),`${label}.journey.days 有序无重复`);
  assert.ok(g.journey.claimed.every(id=>JOURNEY.find(c=>c.id===id)?.visit<=g.journey.days.length),`${label}.journey.claimed`);
  assert.ok(g.log.length<=30&&g.log.every(x=>Number.isFinite(x.time)&&typeof x.text==='string'&&x.text.length<=180),`${label}.log`);
  assert.ok(g.focus===null||(Number.isFinite(g.focus.end)&&Number.isInteger(g.focus.duration)&&g.focus.duration>=1&&g.focus.duration<=120&&Number.isFinite(g.focus.startedAt)),`${label}.focus`);
  assert.ok(g.focusHistory.length<=365&&g.focusHistory.every(f=>Number.isInteger(f.minutes)&&f.minutes>=1&&f.minutes<=120&&f.endedAt>=f.startedAt),`${label}.focusHistory`);
  assert.ok(g.discovered.every(c=>Object.hasOwn(CROPS,c)),`${label}.discovered`);
  assert.ok(g.decor.every(k=>Object.hasOwn(DECOR,k)||Object.hasOwn(PROJECTS,k)),`${label}.decor 含不存在的装饰: ${JSON.stringify(g.decor)}`);
  assert.ok(g.equipped.every(k=>g.decor.includes(k)),`${label}.equipped 只能摆放已拥有的装饰`);
  assert.ok(g.achievements.every(id=>ACHIEVEMENTS.includes(id)),`${label}.achievements`);
  assert.ok(Number.isInteger(g.gardenLevel)&&g.gardenLevel>=1&&g.gardenLevel<=20&&g.gardenLevel===gardenLevel(g),`${label}.gardenLevel 与推导值一致`);
  assert.ok(level(g)>=1&&level(g)<=20&&gardenLevel(g)>=level(g),`${label} 庭院等级不低于当前伙伴等级`);
  assert.ok(Number.isFinite(g.last)&&g.last>0&&Number.isFinite(g.created)&&g.created>0,`${label}.last/created`);
  assert.ok(s.todos.length<=500&&s.todos.every(t=>typeof t.id==='string'&&t.id.length<=60&&typeof t.text==='string'&&t.text.length<=120&&(t.date===''||DAY.test(t.date))&&(!t.archived||t.done)),`${label}.todos`);
  assert.equal(new Set(s.todos.map(t=>t.id)).size,s.todos.length,`${label}.todos 编号唯一`);
  assert.ok(s.courses.every(c=>c.credit>0&&c.credit<=100&&c.point>=0&&c.point<=5),`${label}.courses`);
  assert.ok(['day','night'].includes(s.preferences.theme)&&typeof s.preferences.motion==='boolean',`${label}.preferences`);
}
const rt=(s,t)=>normalize(clone(s),t);
const friendly=e=>e instanceof Error&&e.constructor===Error&&typeof e.message==='string'&&e.message.length>0;
// 稀疏的 daily.pats 经 JSON 变成 null 再被 normalize 补 0：比较前后状态时先按同样规则规整
function canon(s){const c=clone(s);c.game.daily.pats=c.game.daily.pats.map(n=>Number.isInteger(n)?n:0);return c}

// ───────────────────────── engine：normalize / recoverSave / settle ─────────────────────────

forAll('normalize 对可达状态幂等，且经 JSON 往返不改变可达状态（除稀疏 pats 补 0）',genSteps,steps=>{
  // 最后一步可能失败，此时状态里的 last 早于 time：以存档自己的时间读档才是“原样往返”
  const {state}=replay(steps),time=state.game.last;
  const once=rt(state,time),twice=rt(once,time);
  assert.deepEqual(twice,once,'normalize(normalize(x)) 应与 normalize(x) 相同');
  // createState 本身未结算（当天委托尚未生成），所以与 settle 后的状态比较；act 的输出本来就是结算过的
  assert.deepEqual(once,canon(settle(state,time)),'act 产出的状态应原样通过严格读档');
  assertValidState(once,'normalize(可达状态)');
});

forAll('normalize 对损坏存档：要么以友好的 Error 拒绝，要么产出满足全部不变量且幂等的状态',genCorruptSave,save=>{
  let out;try{out=normalize(clone(save),NOW)}catch(e){assert.ok(friendly(e),`normalize 抛出了非 check 的错误: ${e?.constructor?.name}: ${e?.message}`);return}
  assertValidState(out,'normalize(损坏存档)');
  assert.deepEqual(rt(out,NOW),out,'normalize 应幂等');
});

forAll('recoverSave 对任意 JSON 值都不抛错，输出满足不变量、可再次通过 normalize 且幂等',(rng,size)=>rng.weighted([[3,()=>genCorruptSave(rng,size)],[2,()=>rng.json(4,{keys:SAVE_KEYS,allowSpecial:true})],[1,()=>({schema:rng.pick([2,3,4,'3']),game:rng.json(3,{keys:SAVE_KEYS,allowSpecial:true})})]]),raw=>{
  let out;assert.doesNotThrow(()=>{out=recoverSave(raw,NOW)},'recoverSave 承诺不抛错');
  assertValidState(out,'recoverSave');
  assert.deepEqual(rt(out,NOW),out,'recoverSave 的返回值应已是 normalize 的定点');
},{cases:400});

test('recoverSave 对非 JSON 的原始值（undefined、函数、BigInt、循环引用、Symbol、Proxy）也不抛错',()=>{
  const cyclic={schema:3,game:{plots:[]}};cyclic.self=cyclic;
  const hostile=new Proxy({},{get(){throw Error('boom')},ownKeys(){throw Error('boom')}});
  for(const raw of [undefined,null,()=>1,Symbol('x'),10n,cyclic,hostile,new Map(),new Date(NaN),[1,2n],{schema:3,game:{plots:Array(6).fill(null),coins:10n}}]){
    let out;assert.doesNotThrow(()=>{out=recoverSave(raw,NOW)});assertValidState(out,'recoverSave(原始值)');
  }
});

const RECOVER_KEYS=['coins','food','seeds','stock','stats','daily','journey','focusHistory','log','puzzle','orders','discovered','decor','equipped','achievements','plots','focus'];
forAll('recoverSave 只丢弃损坏的那一项：把可达存档的某个字段整项换成垃圾后，其余字段与严格读档结果一致',(rng,size)=>({steps:genSteps(rng,size,80),key:rng.pick(RECOVER_KEYS),garbage:rng.pick([null,'x',-1,[],{},[1],{a:1},1e9,true])}),({steps,key,garbage})=>{
  const {state}=replay(steps),time=state.game.last,expected=rt(state,time),broken=clone(state);broken.game[key]=garbage;
  let strict=null;try{strict=normalize(clone(broken),time)}catch{}
  const out=recoverSave(broken,time);assertValidState(out,'recoverSave(单项损坏)');
  // 与损坏项相关的派生数据（庭院等级、当天委托、日志，以及只能摆放已拥有装饰的 equipped）允许不同；其余每一项都应原样保留
  const dependents={decor:['equipped']}[key]||[];
  const independent=Object.keys(expected.game).filter(k=>![key,'gardenLevel','orders','daily','log','last',...dependents].includes(k));
  for(const k of independent)assert.deepEqual(out.game[k],expected.game[k],`game.${k} 不该因 game.${key} 损坏而改变（严格读档${strict?'通过':'失败'}）`);
  for(const k of ['profile','preferences','todos','courses','reminders','semester'])assert.deepEqual(out[k],expected[k],`${k} 不该因 game.${key} 损坏而改变`);
});

forAll('settle 对任意时间点保持不变量：不动农田与库存，状态在上下限内，日期只进不退，回拨时剩余时间不变',(rng,size)=>({steps:genSteps(rng,size,60),dt:rng.weighted([[3,()=>rng.int(0,3*86400000)],[2,()=>rng.int(-3*86400000,0)],[1,()=>rng.pick([-1e12,1e12,49*3600000,1,0,-1])]])}),({steps,dt})=>{
  const {state,time}=replay(steps),t=Math.max(1,time+dt),before=rt(state,time),after=settle(before,t);
  assertValidState(after,'settle');
  assert.equal(after.game.last,t);
  for(const k of ['coins','food','seeds','stock','decor','equipped','discovered','achievements','journey','focusHistory','todos','stats','puzzle'])assert.deepEqual(after.game[k]??after[k],before.game[k]??before[k],`settle 不该改动 ${k}`);
  assert.ok(after.game.daily.day>=before.game.daily.day,'庭院日期只进不退');
  if(t>=before.game.last){
    assert.deepEqual(after.game.plots,before.game.plots,'时钟向前时 settle 不动农田');
    for(let i=0;i<after.game.pets.length;i++){const a=after.game.pets[i],b=before.game.pets[i];assert.ok(a.hunger<=b.hunger&&a.mood<=b.mood,'离线只会让饥饿与心情下降');assert.ok(b.sleeping?a.energy>=b.energy:a.energy<=b.energy,'睡觉恢复精力，否则下降')}
  }else{
    after.game.plots.forEach((p,i)=>{const b=before.game.plots[i];if(!p||p==='locked')return assert.equal(p,b);
      for(const k of ['planted','ready'])assert.ok(p[k]-t===b[k]-before.game.last||(p[k]===0&&b[k]-before.game.last+t<0),`回拨后地块 ${i} 的 ${k} 应保持剩余时间`)});
    if(before.game.focus)assert.equal(after.game.focus.end-t,before.game.focus.end-before.game.last,'回拨后专注剩余时间不变');
  }
  assert.deepEqual(settle(after,t),after,'同一时间点再 settle 一次没有变化');
});

forAll('dayKey 单调且格式固定；settle 在任意 1970–2100 的时间点都不抛错',rng=>({steps:genSteps(rng,0.3,20),t:rng.int(1,4102444800000)}),({steps,t})=>{
  assert.match(dayKey(t),DAY);assert.ok(dayKey(t)<=dayKey(t+1)&&dayKey(t)<=dayKey(t+86400000));
  const {state}=replay(steps);assert.doesNotThrow(()=>settle(state,t));assertValidState(settle(state,t),'settle(远期)');
});

// ───────────────────────── engine：act ─────────────────────────

forAll('act 原子性：失败时输入不变且错误友好；成功时输出满足不变量、庭院等级不降、可直接再次严格读档',genSteps,steps=>{
  replay(steps,{onStep:({before,after,action,time,error})=>{
    const snapshot=structuredClone(before);
    if(error){
      assert.ok(friendly(error),`act(${JSON.stringify(action)}) 抛出了 ${error?.constructor?.name}: ${error?.message}`);
      assert.deepEqual(before,snapshot,'act 抛错后输入不应被改动');return;
    }
    assertValidState(after,`act(${action.type})`);
    assert.ok(gardenLevel(after.game)>=gardenLevel(before.game),'已解锁的作物不会锁回去');
    assert.ok(after.game.plots.filter(p=>p!=='locked').length>=before.game.plots.filter(p=>p!=='locked').length,'开垦过的地不会再锁上');
    assert.deepEqual(rt(after,time),canon(after),`act(${action.type}) 的结果应原样通过严格读档`);
  }});
});

// 各类动作对资源的影响要与说明一致（价格、上限），随机序列里逐步核对
const PRICE={buyFood:8};
forAll('act 经济规则：买卖按标价结算、出售清空库存、解锁只会减少荔枝币、种子与库存变化与动作一致',genSteps,steps=>{
  replay(steps,{onStep:({before,after,action})=>{
    if(!after)return;const b=before.game,a=after.game,dc=a.coins-b.coins;
    switch(action.type){
      case 'buySeed':assert.equal(dc,-CROPS[action.crop].price);assert.equal(a.seeds[action.crop],b.seeds[action.crop]+1);break;
      case 'buyFood':assert.equal(dc,-PRICE.buyFood);assert.equal(a.food,b.food+1);break;
      case 'sell':assert.equal(dc,b.stock[action.crop]*CROPS[action.crop].sell);assert.equal(a.stock[action.crop],0);break;
      case 'sellSurplus':{const n=b.stock[action.crop]-a.stock[action.crop];assert.ok(n>0&&n<=sellableStock(b,action.crop));assert.equal(dc,n*CROPS[action.crop].sell);break}
      case 'unlock':assert.ok(dc<0,`解锁农田应扣费，实际荔枝币变化 ${dc}`);assert.equal(a.plots[action.index],null);break;
      case 'plant':assert.equal(a.seeds[action.crop],b.seeds[action.crop]-1);assert.equal(a.plots[action.index].crop,action.crop);assert.equal(dc,0);break;
      case 'harvest':{const crop=b.plots[action.index].crop;assert.equal(a.stock[crop],b.stock[crop]+CROPS[crop].yield);assert.equal(a.plots[action.index],null);break}
      case 'gift':assert.equal(dc,20);assert.equal(a.food,b.food+1);assert.equal(a.seeds.radish,b.seeds.radish+2);break;
      case 'focusClaim':assert.equal(dc,b.focus.duration);assert.equal(a.focus,null);assert.equal(a.stats.minutes-b.stats.minutes,b.focus.duration);break;
      case 'quest':assert.equal(dc,QUESTS[action.id].reward);break;
      case 'achievement':assert.equal(dc,30);break;
      case 'decor':if(!b.decor.includes(action.id))assert.equal(dc,-(DECOR[action.id]||PROJECTS[action.id]).price);else assert.equal(dc,0);break;
      case 'orderDeliver':{const order=b.orders.offers.find(o=>o.id===action.id);assert.equal(dc,order.coins);for(const [c,n] of Object.entries(order.needs))assert.equal(a.stock[c],b.stock[c]-n);break}
      case 'puzzleClaim':assert.equal(dc,8);break;
      default:if(!['chat','petSignature','puzzleMove','puzzleUndo','puzzleRestart','pat','feed','play','sleep','rename','switchPet','water','focusStart','focusCancel','visit','journeyClaim'].includes(action.type)||true)assert.equal(dc,0,`${action.type} 不该改变荔枝币`);
    }
  }});
});

forAll('每日/一次性奖励不可重复：补给、目标、小游戏礼物每庭院日一次，委托、成就、旅程每编号一次，摸头与待办的成长有日上限',genSteps,steps=>{
  const perDay=new Map(),once=new Map();
  const bump=(map,key,limit,label)=>{map.set(key,(map.get(key)||0)+1);assert.ok(map.get(key)<=limit,`${label} 重复领取: ${key}`)};
  replay(steps,{onStep:({before,after,action})=>{
    // act 先 settle 再执行：这一步实际所属的庭院日期是 after.daily.day
    if(!after)return;const day=after.game.daily.day,a=after.game,b=before.game;
    if(action.type==='gift')bump(perDay,'gift@'+day,1,'每日补给');
    if(action.type==='puzzleClaim')bump(perDay,'puzzle@'+day,1,'小游戏礼物');
    if(action.type==='quest')bump(perDay,'quest:'+action.id+'@'+day,1,'每日目标');
    if(action.type==='orderDeliver')bump(once,'order:'+action.id,1,'委托');
    if(action.type==='achievement')bump(once,'ach:'+action.id,1,'成就');
    if(action.type==='journeyClaim')bump(once,'journey:'+action.id,1,'旅程纪念');
    if(action.type==='pat'){const i=b.active;const xp=a.pets[i].xp-b.pets[i].xp;assert.ok(xp===0||xp===2);if(xp)bump(perDay,`pat:${a.pets[i].species}@${day}`,PAT_REWARD_LIMIT,'摸头成长')}
    if(action.type==='todoToggle'){const xp=a.pets[b.active].xp-b.pets[b.active].xp;assert.ok(xp===0||xp===2);if(xp)bump(perDay,'todo@'+day,TODO_REWARD_LIMIT,'待办成长');const t=after.todos.find(t=>t.id===action.id);if(t.done)assert.ok(t.rewarded)}
  }});
});

// ───────────────────────── rewards ─────────────────────────
forAll('actionReward：无变化时为 null；有奖励时条目 ≤3、无 NaN/undefined/+0，币与成长数字和实际增量一致，升级标记与等级一致',genSteps,steps=>{
  replay(steps,{onStep:({before,after,action})=>{
    assert.equal(actionReward(before,before,action),null,'状态没变就不该有奖励');
    if(!after)return;
    const reward=actionReward(before,after,action);
    if(reward===null)return;
    assert.equal(typeof reward.title,'string');assert.ok(reward.title.length>0);assert.equal(typeof reward.levelUp,'boolean');
    assert.ok(Array.isArray(reward.items)&&reward.items.length>=1&&reward.items.length<=3,'奖励条目 1–3 条');
    for(const item of reward.items){
      assert.equal(typeof item,'string');
      assert.doesNotMatch(item,/NaN|undefined|null|\+0(?!\d)|−0(?!\d)|-0(?!\d)/,`奖励条目不该出现空增量: ${item}（动作 ${action.type}）`);
      const coins=/^荔枝币 \+(\d+)$/.exec(item);if(coins)assert.equal(Number(coins[1]),after.game.coins-before.game.coins,'荔枝币增量与实际一致');
      const growth=/^(.+?)成长 \+(\d+)/.exec(item);
      if(growth){const pets=after.game.pets.filter(p=>p.name===growth[1]);assert.ok(pets.some(p=>{const old=before.game.pets.find(q=>q.species===p.species);return old&&p.xp-old.xp===Number(growth[2])}),`成长数字应等于伙伴 ${growth[1]} 的实际增量: ${item}`)}
    }
    if(reward.levelUp){assert.ok(after.game.pets.some((p,i)=>Math.min(20,1+Math.floor(p.xp/50))>Math.min(20,1+Math.floor((before.game.pets.find(q=>q.species===p.species)?.xp??p.xp)/50))),'levelUp 为真时必有伙伴升级')}
  }});
});

// ───────────────────────── garden-path ─────────────────────────
const GARDEN_TABS=['pet','farm','market','arcade','journal'];
forAll('gardenNextStep：不改状态、字段完整、路由合法，且它推荐的直接动作在引擎里一定能成功',(rng,size)=>({steps:genSteps(rng,size),dt:rng.pick([0,0,1000,60000,3600000,-60000])}),({steps,dt})=>{
  // 推荐基于引擎的庭院日期（注释明确写了跨天不回退）：像应用里一样先把状态结算到 t 再问下一步
  const {state,time}=replay(steps),t=Math.max(1,time+dt),s=settle(rt(state,state.game.last),t),snapshot=clone(s);
  const step=gardenNextStep(s,t);
  assert.deepEqual(s,snapshot,'gardenNextStep 只读');
  for(const k of ['title','detail','label','action','icon'])assert.ok(typeof step[k]==='string'&&step[k].length>0,`step.${k}`);
  assert.ok(['navigate','gardenRoute','gift','puzzleClaim'].includes(step.action),step.action);
  if(step.action==='navigate'){const route=readRoute('#'+step.page+'/'+step.tab);assert.equal(route.page,step.page);assert.equal(route.tab,step.tab)}
  if(step.action==='gardenRoute'){assert.ok(GARDEN_TABS.includes(step.tab),step.tab);if('index' in step)assert.ok(Number.isInteger(step.index)&&step.index>=0&&step.index<6);if('crop' in step)assert.ok(Object.hasOwn(CROPS,step.crop));if('order' in step)assert.ok(pendingOrders(s.game).some(o=>o.id===step.order))}
  const succeed=a=>assert.doesNotThrow(()=>act(s,a,t),`推荐动作 ${JSON.stringify(a)}（${step.label}）应可执行`);
  if(step.action==='gift')succeed({type:'gift'});
  if(step.action==='puzzleClaim')succeed({type:'puzzleClaim'});
  if(step.label==='去收获')succeed({type:'harvest',index:step.index});
  if(step.label==='带着需求去播种')succeed({type:'plant',crop:step.crop,index:step.index});
  if(step.label==='交付给伙伴')succeed({type:'orderDeliver',id:step.order});
  if(step.label==='一起建设')succeed({type:'decor',id:nextProject(s.game).id});
});

// ───────────────────────── garden-loop ─────────────────────────
forAll('garden-loop：可售数量在 0 与库存之间，建设状态各字段自洽，合成补给只给已解锁的作物',genSteps,steps=>{
  const {state,time}=replay(steps),g=rt(state,time).game,reserved=reservedStock(g);
  for(const crop of CROP_IDS){const n=sellableStock(g,crop);assert.ok(n>=0&&n<=g.stock[crop]&&n===Math.max(0,g.stock[crop]-reserved[crop]),crop)}
  for(const id of Object.keys(PROJECTS)){const st=projectStatus(g,id);assert.equal(st.owned,g.decor.includes(id));assert.equal(st.ready,!st.owned&&st.unlocked&&st.coinShort===0&&st.missing.every(m=>m.missing===0));assert.ok(st.missing.every(m=>m.missing===Math.max(0,m.need-m.have)&&m.have===g.stock[m.crop]))}
  const supply=puzzleSupply(g);assert.ok(Object.hasOwn(CROPS,supply.crop)&&supply.quantity===1&&CROPS[supply.crop].level<=g.gardenLevel,'补给作物应已解锁');
  const project=nextProject(g);assert.equal(project,Object.values(PROJECTS).find(p=>!g.decor.includes(p.id))||null);
});

test('gpa：只计入 included!==false 的课程，学分和与加权绩点在范围内',()=>{
  const rng=new Rng(7);
  for(let i=0;i<300;i++){
    const courses=rng.array(rng.int(0,8),()=>({credit:rng.int(1,10)/2,point:rng.int(0,10)/2,included:rng.pick([true,false,undefined])}));
    const {credits,value}=gpa(courses),used=courses.filter(c=>c.included!==false);
    assert.equal(credits,used.reduce((n,c)=>n+c.credit,0));assert.ok(value>=0&&value<=5);
    if(!used.length)assert.equal(value,0);
  }
});

// ───────────────────────── puzzle2048 ─────────────────────────
function genBoard(rng,size){
  const density=0.2+0.75*size*rng.float(),maxExp=rng.int(1,11);
  return Array.from({length:16},()=>rng.bool(density)?2**rng.int(1,maxExp):0);
}
const genPuzzle=(rng,size)=>{const board=genBoard(rng,size),state={...createPuzzle(rng.int(0,2**32-1)),board,score:rng.int(0,5000),moves:rng.int(0,500)};state.best=state.score+rng.int(0,100);state.over=!puzzleCanMove(board);state.won=Math.max(...board)>=2048;if(rng.bool(0.3))state.milestones=PUZZLE_MILESTONES.filter(()=>rng.bool(0.5));return state};
const lineIndexes=(dir,line)=>Array.from({length:4},(_,n)=>dir===0?n*4+line:dir===1?line*4+3-n:dir===2?(3-n)*4+line:line*4+n);
function referenceMove(board,dir){
  const out=Array(16).fill(0);let score=0;
  for(let line=0;line<4;line++){const idx=lineIndexes(dir,line),tiles=idx.map(i=>board[i]).filter(Boolean),merged=[];
    for(let i=0;i<tiles.length;i++){if(tiles[i+1]===tiles[i]){merged.push(tiles[i]*2);score+=tiles[i]*2;i++}else merged.push(tiles[i])}
    merged.forEach((v,n)=>{out[idx[n]]=v})}
  return {board:out,score};
}
forAll('movePuzzle：与参考实现逐格一致，数值守恒，得分=合并值之和，无效移动不改变任何东西，over/won/best/undo 自洽',(rng,size)=>({puzzle:genPuzzle(rng,size),dir:rng.int(0,3)}),({puzzle,dir})=>{
  const before=normalizePuzzle(clone(puzzle)),input=clone(puzzle),result=movePuzzle(input,['up','right','down','left'][dir]);
  assert.deepEqual(input,puzzle,'movePuzzle 不改输入');
  assert.deepEqual(movePuzzle(clone(puzzle),dir),result,'方向用下标或名字结果相同，且结果确定');
  const ref=referenceMove(before.board,dir),after=result.state;
  assertPuzzle(after,'move 后');
  if(before.over){assert.equal(result.changed,false);assert.deepEqual(after,before,'终局后移动不改变状态');return}
  const changed=ref.board.some((v,i)=>v!==before.board[i]);
  assert.equal(result.changed,changed,'changed 应等于“棋盘是否会变”');
  if(!changed){assert.deepEqual(after,before,'无效移动不该改变状态');assert.equal(result.newTile,null);assert.deepEqual(result.merges,[]);return}
  const withoutNew=after.board.map((v,i)=>i===result.newTile.index?0:v);
  assert.deepEqual(withoutNew,ref.board,'除新落子外的棋盘应与参考实现一致');
  assert.ok([2,4].includes(result.newTile.value)&&ref.board[result.newTile.index]===0,'新落子只在移动后的空格出现');
  assert.equal(after.score-before.score,ref.score);assert.equal(after.score-before.score,result.merges.reduce((n,m)=>n+m.value,0));
  assert.equal(after.moves,before.moves+1);assert.ok(after.best>=after.score&&after.best>=before.best);
  const sum=b=>b.reduce((n,v)=>n+v,0);assert.equal(sum(withoutNew),sum(before.board),'数值守恒');
  assert.equal(withoutNew.filter(Boolean).length,before.board.filter(Boolean).length-result.merges.length,'棋子数=原数-合并数');
  for(const m of result.merges)assert.ok(before.board[m.from[0]]===m.value/2&&before.board[m.from[1]]===m.value/2&&withoutNew[m.to]===m.value,'合并记录与棋盘一致');
  assert.equal(new Set(result.merges.map(m=>m.to)).size,result.merges.length,'一格一次合并');
  assert.deepEqual(after.undo,{board:before.board,score:before.score,rng:before.rng,moves:before.moves,over:before.over,won:before.won},'undo 快照是移动前的局面');
  assert.deepEqual(result.newMilestones,PUZZLE_MILESTONES.filter(v=>v<=Math.max(...after.board)&&!before.milestones.includes(v)));
  const undone=undoPuzzle(after);
  assert.deepEqual({board:undone.board,score:undone.score,rng:undone.rng,moves:undone.moves},{board:before.board,score:before.score,rng:before.rng,moves:before.moves},'撤销恢复棋盘');
  assert.deepEqual({best:undone.best,milestones:undone.milestones,earnedDay:undone.earnedDay,qualifiedDay:undone.qualifiedDay,supplyClaim:undone.supplyClaim,undo:undone.undo},{best:after.best,milestones:after.milestones,earnedDay:after.earnedDay,qualifiedDay:after.qualifiedDay,supplyClaim:after.supplyClaim,undo:null},'撤销保留记录类字段');
});

forAll('normalizePuzzle：对随机 JSON 要么友好拒绝，要么产出合法且幂等的棋局；restartPuzzle 只保留记录类字段',(rng,size)=>rng.weighted([[2,()=>genPuzzle(rng,size)],[2,()=>{const p=clone(genPuzzle(rng,size));for(let i=0,n=rng.int(1,3);i<n;i++)mutate(rng,p);return p}],[1,()=>rng.json(3,{keys:SAVE_KEYS,allowSpecial:true})]]),raw=>{
  let out;try{out=normalizePuzzle(clone(raw),17)}catch(e){assert.ok(friendly(e),`normalizePuzzle 抛出 ${e?.constructor?.name}: ${e?.message}`);return}
  assertPuzzle(out,'normalizePuzzle');
  assert.deepEqual(normalizePuzzle(clone(out),17),out,'幂等');
  const restarted=restartPuzzle(out,99);assertPuzzle(restarted,'restart');
  assert.equal(restarted.board.filter(Boolean).length,2);assert.equal(restarted.score,0);assert.equal(restarted.moves,0);assert.equal(restarted.undo,null);
  assert.deepEqual([restarted.best,restarted.milestones,restarted.earnedDay,restarted.qualifiedDay,restarted.supplyClaim],[out.best,out.milestones,out.earnedDay,out.qualifiedDay,out.supplyClaim]);
});

forAll('随机整局 2048：从新局一直走到终局，累计得分等于所有合并值之和，步数等于有效移动数，不抛错',rng=>({seed:rng.int(0,2**32-1),dirs:rng.array(600,()=>rng.int(0,3))}),({seed,dirs})=>{
  let state=createPuzzle(seed),score=0,moves=0;
  for(const d of dirs){const r=movePuzzle(state,d);state=r.state;if(r.changed){moves++;score+=r.merges.reduce((n,m)=>n+m.value,0)}else assert.deepEqual(r.merges,[]);if(state.over)break}
  assert.equal(state.score,score);assert.equal(state.moves,moves);assertPuzzle(state,'整局');
  assert.equal(state.over,!puzzleCanMove(state.board));
},{cases:120});

// ───────────────────────── garden-orders ─────────────────────────
const isoDay=(rng)=>new Date(Date.UTC(rng.int(2020,2031),rng.int(0,11),rng.int(1,28))).toISOString().slice(0,10);
const genGame=(rng,level=rng.int(1,20))=>({coins:rng.int(0,500),gardenLevel:level,stock:Object.fromEntries(CROP_IDS.map(c=>[c,rng.int(0,6)])),orders:createOrders()});
forAll('dailyOrders：同一天与等级结果确定，三份委托编号、奖励与需求都按规则生成且只用已解锁作物；保存后重新读档不变',rng=>({game:genGame(rng),day:isoDay(rng)}),({game,day})=>{
  const level=game.gardenLevel,offers=dailyOrders(game,day,CROPS,level);
  assert.deepEqual(dailyOrders(clone(game),day,CROPS,level).map(o=>o.id),offers.map(o=>o.id));
  assert.deepEqual(dailyOrders({...clone(game),orders:createOrders()},day,CROPS,level),offers,'相同输入相同输出');
  assert.equal(offers.length,3);
  offers.forEach((o,i)=>{assert.equal(o.id,`${day}:${i}`);assert.equal(o.bonus,[3,3,4][i]);
    assert.equal(o.coins,Object.entries(o.needs).reduce((n,[c,q])=>n+CROPS[c].sell*q,o.bonus),'奖励=作物售价之和+额外');
    for(const [c,q] of Object.entries(o.needs)){assert.ok(CROPS[c].level<=level,'只要求已解锁作物');assert.ok(q>=1&&q<=4)}});
  assert.deepEqual(normalizeOrders(clone(game.orders),CROPS),game.orders,'当天的委托原样通过读档');
  assertOrders(game.orders);
});

forAll('deliverOrder：交付一次即结算（币+奖励、库存-需求、total+1、纪念物单调），重复或库存不足时抛错且状态不变；回拨日期拒绝交付',rng=>({game:genGame(rng),day:isoDay(rng),pick:rng.int(0,2),short:rng.bool(0.3),rollback:rng.bool(0.3)}),({game,day,pick,short,rollback})=>{
  const offers=dailyOrders(game,day,CROPS,game.gardenLevel),order=offers[pick];
  if(short){const [c]=Object.keys(order.needs);game.stock[c]=order.needs[c]-1}
  else for(const [c,q] of Object.entries(order.needs))game.stock[c]=Math.max(game.stock[c],q);
  const before=clone(game);
  if(rollback){const earlier=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);assert.throws(()=>deliverOrder(game,order.id,earlier,CROPS,game.gardenLevel),/当前庭院日期/);assert.deepEqual(game,before,'回拨日期拒绝时状态不变');return}
  if(short){assert.throws(()=>deliverOrder(game,order.id,day,CROPS,game.gardenLevel),/还不够/);assert.deepEqual(game,before,'库存不足时状态不变');return}
  const result=deliverOrder(game,order.id,day,CROPS,game.gardenLevel);
  assert.equal(result.order.id,order.id);assert.equal(game.coins,before.coins+order.coins);
  for(const [c,q] of Object.entries(order.needs))assert.equal(game.stock[c],before.stock[c]-q);
  assert.equal(game.orders.total,before.orders.total+1);assert.ok(game.orders.completed.includes(order.id));
  assert.deepEqual(result.newKeepsakes.map(k=>k.id),ORDER_KEEPSAKES.filter(k=>game.orders.total>=k.total).map(k=>k.id));
  const after=clone(game);assert.throws(()=>deliverOrder(game,order.id,day,CROPS,game.gardenLevel),/已经交付/);assert.deepEqual(game,after);
  assertOrders(game.orders);assert.deepEqual(normalizeOrders(clone(game.orders),CROPS),game.orders,'交付记录原样通过读档');
});

forAll('normalizeOrders：对随机 JSON 要么友好拒绝，要么产出合法且幂等的委托记录，且不会让已交付的编号重新可领',(rng,size)=>rng.weighted([[2,()=>{const g=genGame(rng);dailyOrders(g,isoDay(rng),CROPS,g.gardenLevel);if(rng.bool(0.5))g.orders.completed.push(g.orders.offers[0].id);const o=clone(g.orders);for(let i=0,n=rng.int(0,3);i<n;i++)mutate(rng,o);return o}],[1,()=>rng.json(3,{keys:SAVE_KEYS,allowSpecial:true})]]),raw=>{
  let out;try{out=normalizeOrders(clone(raw),CROPS)}catch(e){assert.ok(friendly(e),`normalizeOrders 抛出 ${e?.constructor?.name}: ${e?.message}`);return}
  assertOrders(out,'normalizeOrders');assert.deepEqual(normalizeOrders(clone(out),CROPS),out,'幂等');
  if(isPlainObject(raw)&&typeof raw.day==='string'&&Array.isArray(raw.completed))for(const id of raw.completed)if([0,1,2].some(i=>id===raw.day+':'+i))assert.ok(out.completed.includes(id),`当天已交付的 ${id} 不该被读档丢掉`);
  // 读档后重建当天委托，已交付编号仍然不可再交付
  const game={coins:0,gardenLevel:20,stock:Object.fromEntries(CROP_IDS.map(c=>[c,99])),orders:out};
  if(out.day){dailyOrders(game,out.day,CROPS,20);for(const id of out.completed)assert.throws(()=>deliverOrder(game,id,out.day,CROPS,20),/已经交付/)}
});

// ───────────────────────── 随机测试找到并经复核的最小回归用例（修复前失败） ─────────────────────────

test('normalize 不该把原型链上的键名当成已拥有的装饰（修复前失败）',()=>{
  // DECOR[k]||PROJECTS[k] 对 'constructor'/'toString' 等键为真：损坏或伪造存档里的这些键会被当作装饰永久保留。
  const s=createState(NOW);s.game.decor=['constructor','toString'];s.game.equipped=['constructor'];
  const out=normalize(clone(s),NOW);
  assert.deepEqual(out.game.decor,[],'不存在的装饰应被过滤');assert.deepEqual(out.game.equipped,[]);
});

test('act(decor) 对不存在的装饰应以友好提示拒绝，而不是 TypeError（修复前失败）',()=>{
  const s=createState(NOW);
  for(const id of ['constructor','toString','hasOwnProperty'])assert.throws(()=>act(s,{type:'decor',id},NOW),e=>friendly(e)&&/没有这件装饰/.test(e.message),`decor ${id}`);
});

test('unlock 永远不会增加荔枝币：解锁地块少于 3 块的存档下开垦费用变成负数（修复前失败）',()=>{
  // normalize 接受 6 块全锁的农田；act(unlock) 的费用 60+(n-3)*30 在 n<3 时为负，check(coins>=负数) 必过，coins-=负数 反而加钱。
  const s=createState(NOW);s.game.plots=Array(6).fill('locked');
  const loaded=normalize(clone(s),NOW),after=act(loaded,{type:'unlock',index:0},NOW);
  assert.ok(after.game.coins<loaded.game.coins,`开垦应扣费，实际 ${loaded.game.coins} -> ${after.game.coins}`);
});

test('文本截断不该切开代理对：12 个码元处落在 emoji 中间时伙伴名字末尾出现孤立代理项（修复前失败）',()=>{
  const name='😀😀😀😀😀a😀';
  const renamed=act(createState(NOW),{type:'rename',name},NOW);
  assert.ok(renamed.game.pets[0].name.isWellFormed(),`名字含孤立代理项: ${JSON.stringify(renamed.game.pets[0].name)}`);
  const s=createState(NOW);s.profile.name='😀'.repeat(9)+'a'+'😀';s.game.pets[1].say='字'.repeat(59)+'😀';
  const out=normalize(clone(s),NOW);
  assert.ok(out.profile.name.isWellFormed(),'昵称截断应保持 Unicode 完整');assert.ok(out.game.pets[1].say.isWellFormed(),'台词截断应保持 Unicode 完整');
});

test('normalize 对 JSON 里带有自有 toString 键的对象调用 String() 会抛 TypeError，而不是友好拒绝（修复前失败）',()=>{
  // 昵称、学院、伙伴名字、台词、课程名等都用 String(value||默认) 收口；JSON 完全可以表达 {"toString":""} 这样的对象。
  for(const patch of [s=>{s.profile.college=[{toString:''}]},s=>{s.profile.name={toString:1}},s=>{s.game.pets[0].name={valueOf:0,toString:0}},s=>{s.game.pets[0].say=[{toString:''}]}]){
    const s=createState(NOW);patch(s);
    try{normalize(clone(s),NOW)}catch(e){assert.ok(friendly(e),`normalize 抛出 ${e.constructor.name}: ${e.message}`)}
  }
});

test('normalize 接受 ""/0/false 这样的地块值：界面显示为空地却永远不能播种、开垦或收获（修复前失败）',()=>{
  // for(const p of g.plots)if(p&&p!=='locked')check(...)：假值地块直接跳过校验被原样保留；recoverSave 也因严格读档通过而不会把它改回 null。
  for(const bad of ['',0,false]){
    const s=createState(NOW);s.game.plots[1]=bad;
    let out;try{out=normalize(clone(s),NOW)}catch(e){assert.ok(friendly(e));continue}
    assert.equal(out.game.plots[1],null,`地块值 ${JSON.stringify(bad)} 应被拒绝或规整为空地`);
    assert.doesNotThrow(()=>act(out,{type:'plant',crop:'radish',index:1},NOW),'空地应能播种');
  }
});

test('normalize 不过滤 achievements 里的未知编号：任意垃圾会永久留在存档里（修复前失败）',()=>{
  const s=createState(NOW);s.game.achievements=[0,'constructor',{big:'x'.repeat(10)},'harvest'];
  const out=normalize(clone(s),NOW);
  assert.deepEqual(out.game.achievements,['harvest'],'成就编号应像 decor/discovered/claimed 一样只保留已知的');
});

test('奖励条目不该写出“亲密 +0”：亲密度已满时合成补给/委托的奖励文案（修复前失败）',()=>{
  const s=createState(NOW);s.game.pets[0].bond=100;s.game.puzzle.qualifiedDay=s.game.daily.day;
  const after=act(s,{type:'puzzleClaim'},NOW),reward=actionReward(s,after,{type:'puzzleClaim'});
  assert.ok(reward.items.every(item=>!/\+0(?!\d)/.test(item)),JSON.stringify(reward.items));
});

report();
