// Original local-only garden rules. No accounts, passwords, or remote services.
import {PETS,AVAILABLE_PETS,PET_LIMIT,petDefinition} from './pet-catalog.mjs';
import {PET_CONTEXTS,pickPetDialogue} from './pet-dialogue.mjs';
import {createPuzzle,normalizePuzzle,movePuzzle,restartPuzzle,undoPuzzle} from './puzzle2048.mjs';
import {createOrders,normalizeOrders,dailyOrders,deliverOrder} from './garden-orders.mjs';
import {CROPS,PROJECTS,projectStatus,sellableStock,puzzleSupply} from './garden-loop.mjs';
export {PETS,DEFAULT_PET,AVAILABLE_PETS,petSprite,petViewBox} from './pet-catalog.mjs';
// 作物表只有一份，定义在 garden-loop.mjs；这里照旧以 CROPS 导出。
export {CROPS};
const cropBag=(start={})=>Object.fromEntries(Object.keys(CROPS).map(k=>[k,start[k]||0]));
export const DECOR={flower:{name:'窗边小花',price:35},scarf:{name:'猫咪围巾',price:60},lantern:{name:'暖光灯笼',price:90}};
function companionLine(g,p,action){
 p.dialogue??={};
 const line=pickPetDialogue(p.species,action,{cursor:p.dialogue[action]||0,last:p.say,seed:g.created});
 p.dialogue[line.context]=line.cursor;
 return line.text;
}
function createPet(species,now){
 return {species,name:PETS[species].name,xp:0,bond:10,hunger:80,energy:85,mood:85,sleeping:false,lastPat:0,lastPlay:0,say:PETS[species].greeting,saidAt:now,dialogue:{}};
}
// 每只宠物的字段。新增字段必须同时加进 createState / normalize 的迁移与白名单，
// 否则旧存档读进来会是 undefined。
const PET_FIELDS=['species','name','xp','bond','hunger','energy','mood','sleeping','lastPat','lastPlay','say','saidAt','dialogue'];
export const activePet=g=>g.pets[g.active]||g.pets[0];
// 宠物说的话。saidAt 只用于界面判断是否新鲜，不影响逻辑。
export function say(p,text,now){p.say=limitedText(text,60);p.saidAt=now}
export const QUESTS={care:{name:'陪伴伙伴 3 次',target:3,reward:15},plant:{name:'种下一颗种子',target:1,reward:10},harvest:{name:'收获一块农田',target:1,reward:15},focus:{name:'完成一次专注',target:1,reward:25}};
export const plotUnlockCost=g=>Math.max(60,60+(g.plots.filter(x=>x!=='locked').length-3)*30);
export const dayKey=t=>{const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const level=g=>Math.min(20,1+Math.floor(activePet(g).xp/50));
// Garden unlocks belong to the garden, even when a younger companion takes over.
export function gardenLevel(g){
 const earned=Math.max(1,...g.pets.map(p=>Math.min(20,1+Math.floor(p.xp/50))));
 const crops=Object.entries(CROPS).filter(([id])=>g.discovered.includes(id)||g.seeds[id]>0||g.stock[id]>0||g.plots.some(p=>p?.crop===id));
 return Math.max(earned,Number.isInteger(g.gardenLevel)?clamp(g.gardenLevel,1,20):1,...crops.map(([,c])=>c.level));
}
export const PAT_REWARD_LIMIT=3;
export const TODO_REWARD_LIMIT=5;
export const JOURNEY=[
 {id:'hello',visit:1,title:'给你留了一盏灯',story:'荔宝把小屋门前的灯拨亮了一点：“不用先做完所有事，来坐坐也很好。”你们给这片小庭院留了一个位置。',keepsake:'初见小灯'},
 {id:'lake',visit:2,title:'文山湖边的慢半拍',story:'小白在湖边停下来，等一圈水纹慢慢散开。今天没有急着赶路，你们记住了风吹过树叶的声音。',keepsake:'湖边羽签'},
 {id:'shade',visit:3,title:'栗栗的午后座位',story:'栗栗把窗边晒暖的那一角让出来一点。你翻了几页书，它换了个舒服的姿势。一段安静的时间，也可以一起度过。',keepsake:'暖阳坐垫'},
 {id:'rain',visit:4,title:'等雨停的十分钟',story:'雨落在屋檐上，Pingu 把一条干毛巾推到你手边，轻轻 Noot 了一声。你们把湿伞放在门边，等杯里的热气慢慢变淡。',keepsake:'雨天小伞'},
 {id:'books',visit:5,title:'夹在书页里的话',story:'桌上的书多了一张小纸条：“今天做过的那一点，已经算数。”荔宝画了一个歪歪的小太阳，让你下次翻到这里还能看见。',keepsake:'荔园书签'},
 {id:'basket',visit:6,title:'分一半给朋友',story:'伙伴们把收获篮摆到窗边，各自挑了一小份。没有比较谁攒得更多，剩下的可以留到下一次相聚。',keepsake:'分享小篮'},
 {id:'home',visit:7,title:'这儿已经有你的样子',story:'灯、书签和坐垫都留在原来的地方。你不必连续每天来；每次回来，伙伴都认得你。这片庭院，已经有了你的日常。',keepsake:'七次相遇相框'},
];
export function journeyList(g){return JOURNEY.map(chapter=>({...chapter,available:(g.journey?.days.length||0)>=chapter.visit,claimed:!!g.journey?.claimed.includes(chapter.id)}))}
const KEEPSAKE_ICONS={hello:'i-lantern',lake:'i-quill',shade:'i-flower',rain:'i-water',books:'i-book',basket:'i-chest',home:'i-cottage'};
export function journeyKeepsakes(g){return journeyList(g).filter(c=>c.claimed).map(c=>({id:c.id,name:c.keepsake,icon:KEEPSAKE_ICONS[c.id],storyTitle:c.title}))}
const dailyState=now=>({day:dayKey(now),gift:false,...Object.fromEntries(Object.keys(QUESTS).map(k=>[k,0])),claimed:[],pats:[],todoRewards:0});
const STAT_KEYS=['harvest','focus','minutes','planted','tasks'];
// 存档结构版本。normalize 只留下本版本认识的键和取值，旧版本读到新版本多出来的作物、装饰、成就或字段会直接丢掉，
// 下次自动保存就写回磁盘。所以存档里只要会出现新的键或取值，就把它加一，并在 normalize 里继续接受旧版本：
// 已经发布的各版本都只认 2 和 3，读到更高的版本会拒读、进入只读的存档失败页，不会覆盖原文件。
// 用它而不另加字段，正是因为这些已发布的版本不认识新字段，只会把它和其他新数据一起丢掉。
// desktop/check-save-compat.mjs 登记了每个版本的键和取值，改了却没加版本号时会失败。
export const SAVE_SCHEMA=3;
// 更新版本写的存档。读成本版本认识的样子再保存，新版本的内容就没了，所以宁可拒读。
export const saveFromNewerVersion=raw=>!!raw&&typeof raw==='object'&&Number.isInteger(raw.schema)&&raw.schema>SAVE_SCHEMA;
export function createState(now=Date.now()){
 return {schema:SAVE_SCHEMA,profile:{name:'',college:''},preferences:{theme:'day',homeSkin:'pixel',motion:true,onboarded:false,noticeSource:'undergrad',studentLevel:'undergrad'},todos:[],courses:[],reminders:[],semester:'',
 game:{created:now,last:now,coins:40,food:3,seeds:cropBag({radish:4,strawberry:2}),stock:cropBag(),
 plots:[{crop:'radish',planted:now,ready:now+60000,watered:false},null,null,'locked','locked','locked'],
 pets:AVAILABLE_PETS.map(species=>createPet(species,now)),active:0,puzzle:createPuzzle(now),orders:createOrders(),
 daily:dailyState(now),stats:{harvest:0,focus:0,minutes:0,planted:1,tasks:0},discovered:[],decor:[],equipped:[],achievements:[],gardenLevel:1,focus:null,focusHistory:[],journey:{days:[dayKey(now)],claimed:[]},log:[{time:now,text:'欢迎来到荔枝庭院。第一块萝卜地已经种好，记得来收获。'}]}};
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function check(ok,message){if(!ok)throw Error(message)}
function note(g,text,now){g.log.unshift({time:now,text});g.log=g.log.slice(0,30)}
const textValue=(value,fallback='')=>typeof value==='string'?value:fallback;
const limitedText=(value,limit,fallback='')=>{let result='',units=0;for(const char of textValue(value,fallback)){if(units+char.length>limit)break;result+=char;units+=char.length}return result};
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&dayKey(new Date(value+'T12:00:00').getTime())===value}
const timeValue=n=>Number.isFinite(n)&&n>=0?n:0;
function todoDate(value){check(value===''||validDate(value),'请选择有效的事项日期');return value}
function focusFields(f){return {startedAt:timeValue(f.startedAt)||f.end-f.duration*60000,end:f.end,duration:f.duration,todoId:limitedText(f.todoId,60),task:limitedText(f.task,120)}}
export function normalize(input,now=Date.now()){
 // schema 2 是早期的单伙伴存档：只有 g.pet。这里统一升级成 pets 数组，
 // 用户改过的名字原样保留（迁移不覆盖用户数据），species 记为栗栗。
 const raw=input&&typeof input==='object'?structuredClone(input):null;
 // 只在确认是更新版本后才拼提示：schema 可能是任意垃圾对象，提前转成字符串本身就会抛 TypeError。
 if(saveFromNewerVersion(raw))throw Error(`这份存档来自更新版本的荔枝庭院（存档结构 ${raw.schema}，当前版本只认识到 ${SAVE_SCHEMA}），直接读取会丢掉新版本的内容。请先把应用更新到最新版再打开，原文件不会被改动。`);
 check(raw&&Number.isInteger(raw.schema)&&raw.schema>=2&&raw.schema<=SAVE_SCHEMA&&raw.game&&Array.isArray(raw.game.plots),'不支持的存档格式，请选择本应用导出的存档');
 const s=structuredClone(raw),g=s.game;
 for(const key of ['coins','food']){check(Number.isFinite(g[key])&&g[key]>=0&&g[key]<=1e8,'存档资源格式错误')}
 check(g.plots.length===6,'农田存档格式错误');
 for(const p of g.plots)if(p!==null&&p!=='locked')check(p&&typeof p==='object'&&!Array.isArray(p)&&Object.hasOwn(CROPS,p.crop)&&Number.isFinite(p.planted)&&Number.isFinite(p.ready),'作物存档格式错误');
 // 作物、每日目标和累计记录的键会随版本增减：旧存档缺少的新键补 0，已下架的键直接丢弃；
 // 只有数值本身损坏才算存档错误，避免调整常量表后所有旧存档都读不出来。
 const counts=(bag,keys,valid,message)=>{check(bag&&typeof bag==='object'&&!Array.isArray(bag),message);return Object.fromEntries(keys.map(k=>{const n=Object.hasOwn(bag,k)?bag[k]:0;check(valid(n),message);return [k,n]}))};
 for(const bag of ['seeds','stock'])g[bag]=counts(g[bag],Object.keys(CROPS),n=>Number.isInteger(n)&&n>=0&&n<=1e7,'背包格式错误');
 check(g.daily&&typeof g.daily.day==='string'&&Array.isArray(g.daily.claimed),'每日任务格式错误');
 // 日期写坏了（如 2026-9-1）就对不上任何一天：这一天的记录按今天重新开始，不让整份存档读不出来。
 if(!validDate(g.daily.day))g.daily=dailyState(now);
 const quests=counts(g.daily,Object.keys(QUESTS),n=>Number.isFinite(n)&&n>=0,'每日任务数值错误');
 g.stats=counts(g.stats,STAT_KEYS,n=>Number.isFinite(n)&&n>=0,'累计记录格式错误');
 for(const k of ['discovered','decor','equipped','achievements','log'])check(Array.isArray(g[k]),'收藏存档格式错误');
 // 存档时间只要求是有效时间戳。比当前时钟还晚（时钟调快后又改回）不算损坏，由 settle 按时钟校正处理。
 check(Number.isFinite(g.last)&&g.last>0,'存档时间异常');
 g.created=Number.isFinite(g.created)&&g.created>0?g.created:g.last;
 g.decor=g.decor.filter(k=>Object.hasOwn(DECOR,k)||Object.hasOwn(PROJECTS,k));g.equipped=g.equipped.filter(k=>g.decor.includes(k));g.discovered=g.discovered.filter(k=>Object.hasOwn(CROPS,k));
 g.log=g.log.slice(0,30).filter(x=>x&&typeof x.text==='string'&&Number.isFinite(x.time)).map(x=>({time:x.time,text:limitedText(x.text,180)}));
 check(!g.focus||(Number.isFinite(g.focus.end)&&Number.isInteger(g.focus.duration)&&g.focus.duration>=1&&g.focus.duration<=120),'专注存档格式错误');
 g.focus=g.focus?focusFields(g.focus):null;
 g.focusHistory=(Array.isArray(g.focusHistory)?g.focusHistory:[]).filter(f=>f&&Number.isInteger(f.minutes)&&f.minutes>=1&&f.minutes<=120&&Number.isFinite(f.startedAt)&&Number.isFinite(f.endedAt)&&f.startedAt>=0&&f.endedAt>=f.startedAt).slice(0,365).map(f=>({startedAt:f.startedAt,endedAt:f.endedAt,minutes:f.minutes,todoId:limitedText(f.todoId,60),task:limitedText(f.task,120)}));
 g.journey={days:[...new Set((Array.isArray(g.journey?.days)?g.journey.days:[]).filter(validDate))].sort().slice(0,7),claimed:[...new Set((Array.isArray(g.journey?.claimed)?g.journey.claimed:[]).filter(id=>JOURNEY.some(c=>c.id===id)))]};
 g.journey.claimed=g.journey.claimed.filter(id=>JOURNEY.find(c=>c.id===id).visit<=g.journey.days.length);
 g.puzzle=normalizePuzzle(g.puzzle,g.created);
 g.orders=normalizeOrders(g.orders,CROPS);
 g.daily={day:g.daily.day,gift:!!g.daily.gift,...quests,claimed:g.daily.claimed.filter(k=>Object.hasOwn(QUESTS,k)),pats:(Array.isArray(g.daily.pats)?g.daily.pats:[]).slice(0,PET_LIMIT).map(n=>Number.isInteger(n)?clamp(n,0,PAT_REWARD_LIMIT):0),todoRewards:Number.isInteger(g.daily.todoRewards)?clamp(g.daily.todoRewards,0,TODO_REWARD_LIMIT):0};

 // —— 宠物：单只（schema 2）迁移成数组，并逐只校验 ——
 if(Array.isArray(g.pets)){
  check(g.pets.length>=1&&g.pets.length<=PET_LIMIT,'伙伴数量不对');
 }else{
  check(g.pet&&typeof g.pet==='object','伙伴存档格式错误');
  g.pets=[{...g.pet,species:'chestnut'}];
 }
 g.pets=g.pets.map(p=>{
  check(p&&typeof p==='object','伙伴存档格式错误');
  check(typeof p.species==='string'&&Object.hasOwn(PETS,p.species),'不认识的伙伴种类');
  const out={};
  for(const k of PET_FIELDS)out[k]=p[k];
  out.species=p.species;
  out.name=limitedText(p.name,12,PETS[p.species].name)||PETS[p.species].name;
  out.xp=Number.isFinite(p.xp)?Math.min(Math.max(p.xp,0),1e6):0;
  for(const k of ['bond','hunger','energy','mood'])out[k]=clamp(Number.isFinite(p[k])?p[k]:50,0,100);
  out.sleeping=!!p.sleeping;
  for(const k of ['lastPat','lastPlay','saidAt'])out[k]=Number.isFinite(p[k])&&p[k]>=0?p[k]:0;
  out.say=limitedText(p.say,60);
  out.dialogue=Object.fromEntries(PET_CONTEXTS.filter(k=>Number.isSafeInteger(p.dialogue?.[k])&&p.dialogue[k]>=0).map(k=>[k,p.dialogue[k]]));
  return out;
 });
 g.active=Number.isInteger(g.active)&&g.active>=0&&g.active<g.pets.length?g.active:0;
 const validAchievements=new Set(achievementList(g).map(item=>item.id));g.achievements=g.achievements.filter(id=>validAchievements.has(id));

 s.profile={name:limitedText(s.profile?.name,20),college:limitedText(s.profile?.college,40)};
 s.preferences={theme:s.preferences?.theme==='night'?'night':'day',homeSkin:['pixel','lake','bookshop','terrace'].includes(s.preferences?.homeSkin)?s.preferences.homeSkin:'pixel',motion:s.preferences?.motion!==false,onboarded:s.preferences?.onboarded===true,noticeSource:typeof s.preferences?.noticeSource==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(s.preferences.noticeSource)?s.preferences.noticeSource:'undergrad',studentLevel:s.preferences?.studentLevel==='graduate'?'graduate':'undergrad'};
 s.todos=(Array.isArray(s.todos)?s.todos:[]).slice(0,500).filter(x=>x&&typeof x.id==='string'&&typeof x.text==='string').map(x=>({id:x.id.slice(0,60),text:x.text.slice(0,120),done:!!x.done,rewarded:!!x.rewarded,date:validDate(x.date)?x.date:'',createdAt:timeValue(x.createdAt),completedAt:x.done?timeValue(x.completedAt):0,archived:!!x.archived&&!!x.done}));
	s.courses=(Array.isArray(s.courses)?s.courses:[]).slice(0,300).filter(x=>x&&Number.isFinite(x.credit)&&Number.isFinite(x.point)&&x.credit>0&&x.credit<=100&&x.point>=0&&x.point<=5).map(x=>({name:limitedText(x.name,100,'课程')||'课程',credit:x.credit,point:x.point,term:limitedText(x.term,40),code:limitedText(x.code,40),level:['undergrad','graduate'].includes(x.level)?x.level:'',grade:limitedText(x.grade,20),source:limitedText(x.source,30,'手动录入')||'手动录入',included:x.included!==false}));
 s.reminders=(Array.isArray(s.reminders)?s.reminders:[]).filter(x=>x&&typeof x.id==='string'&&typeof x.place==='string'&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start&&x.end-x.start<=86400000).slice(0,50).map(x=>({id:x.id.slice(0,80),place:x.place.slice(0,80),start:x.start,end:x.end}));
 s.semester=/^\d{4}-\d{2}-\d{2}$/.test(s.semester||'')?s.semester:'';
 const clean={schema:SAVE_SCHEMA,profile:s.profile,preferences:s.preferences,todos:s.todos,courses:s.courses,reminders:s.reminders,semester:s.semester,game:{}};
 for(const k of Object.keys(createState(now).game))clean.game[k]=g[k];
 clean.game.pets=g.pets;clean.game.active=g.active;
 const settled=settle(clean,now);
 // 先结算原有伙伴，再补齐上架伙伴；已有记录不覆盖、不重排，满额时不挤掉旧伙伴。
 for(const species of AVAILABLE_PETS){
  if(settled.game.pets.length>=PET_LIMIT)break;
  if(!settled.game.pets.some(p=>p.species===species))settled.game.pets.push(createPet(species,now));
 }
 settled.game.gardenLevel=gardenLevel(settled.game);
 return settled;
}
const plainObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
// 每次试读都要完整 normalize 一遍。正常存档最多试九十来次，上限留足余量，损坏得再离谱也很快结束。
const RECOVER_ATTEMPTS=200;
// 宽松恢复：严格读档失败时的补救入口，对任何输入都不抛错。原存档的字段逐项放进一份新存档里试读，
// 通过校验的保留，通不过的子项退回默认值；返回值已经过 normalize，可以直接使用和保存。
export function recoverSave(raw,now=Date.now()){
 let src=null;try{src=JSON.parse(JSON.stringify(raw??null))}catch{}
 try{return normalize(src,now)}catch{}
 if(!plainObject(src))return normalize(createState(now),now);
 const game=plainObject(src.game)?src.game:{},valid=candidate=>{try{normalize(candidate,now);return true}catch{return false}};
 let kept=createState(now),tries=0;
 const attempt=change=>{if(++tries>RECOVER_ATTEMPTS)return false;const next=structuredClone(kept);change(next);if(!valid(next))return false;kept=next;return true};
 for(const key of ['profile','preferences','todos','courses','reminders','semester'])if(Object.hasOwn(src,key))attempt(s=>{s[key]=src[key]});
 for(const key of Object.keys(kept.game)){
  if(key==='pets'||key==='active'||!Object.hasOwn(game,key)||attempt(s=>{s.game[key]=game[key]}))continue;
  const value=game[key];
  // 整项通不过时再逐个子项挑出能用的部分：只试新存档里有的键（其余键 normalize 反正会丢弃）；
  // 已开垦但作物损坏的地块保留为空地。
  if(key==='plots'&&Array.isArray(value))value.slice(0,6).forEach((plot,i)=>{if(!attempt(s=>{s.game.plots[i]=plot}))attempt(s=>{s.game.plots[i]=null})});
  else if(plainObject(value)&&plainObject(kept.game[key]))for(const k of Object.keys(kept.game[key]))if(Object.hasOwn(value,k))attempt(s=>{s.game[key][k]=value[k]});
 }
 // 伙伴逐只保留；不认识的种类被跳过，一只都留不下时使用新存档的伙伴。schema 2 的单伙伴照常迁移。
 const pets=Array.isArray(game.pets)?game.pets:plainObject(game.pet)?[{...game.pet,species:'chestnut'}]:[],saved=[];
 for(const pet of pets){if(saved.length>=PET_LIMIT||tries>=RECOVER_ATTEMPTS)break;if(attempt(s=>{s.game.pets=[...saved,pet];s.game.active=0}))saved.push(pet)}
 if(saved.includes(pets[game.active]))attempt(s=>{s.game.active=saved.indexOf(pets[game.active])});
 try{return normalize(kept,now)}catch{return normalize(createState(now),now)}
}
// 时钟校正：系统时间调快后又改回，存档里会留下比现在更晚的时间戳。把进行中的计时整体平移到
// 当前时钟，剩余的生长、专注和冷却时间保持不变，庭院不会因此被冻结。
// 已知取舍：计时只保留剩余时间，所以先把时钟往回拨、打开应用、再改回来，作物和专注都会少等这段时间，
// 反复拨也一样（本机存档不做防作弊承诺，见 docs/STATUS.md 8.3）。只有按天发放的记录
// （daily.day、委托和小游戏日期、来访日）只进不退，回拨时钟也领不到第二份当天奖励。
function correctClock(g,now){
 const offset=now-g.last,shift=t=>Number.isFinite(t)&&t>0?Math.max(0,t+offset):t;
 for(const p of g.plots)if(p&&p!=='locked'){p.planted=shift(p.planted);p.ready=shift(p.ready)}
 if(g.focus){g.focus.startedAt=shift(g.focus.startedAt);g.focus.end=shift(g.focus.end)}
 for(const p of g.pets)for(const k of ['lastPat','lastPlay','saidAt'])p[k]=shift(p[k]);
 g.last=now;
}
export function settle(state,now=Date.now()){
 const s=structuredClone(state),g=s.game;
 if(now<g.last)correctClock(g,now);
 const hours=clamp((now-g.last)/3600000,0,48);
 // 每只宠物各自衰减：切换伙伴不该让另一只的状态定格在切换前。
 for(const p of g.pets){
  p.hunger=clamp(p.hunger-hours*2,15,100);p.mood=clamp(p.mood-hours,20,100);
  p.energy=clamp(p.energy+hours*(p.sleeping?30:-1),15,100);
 }
 g.last=now;
 if(!validDate(g.daily.day)||dayKey(now)>g.daily.day)g.daily=dailyState(now);
 // g.daily.day 是庭院日期：平时等于今天，时钟回拨后停在已经到过的最晚一天。
 dailyOrders(g,g.daily.day,CROPS,gardenLevel(g));
 return s;
}
export function achievementList(g){return [
 {id:'harvest',name:'第一篮收成',hint:'收获一次',done:g.stats.harvest>=1},
 {id:'friend',name:'熟悉的朋友',hint:'有一位伙伴达到 3 级',done:g.pets.some(p=>p.xp>=100)||g.achievements.includes('friend')},
 {id:'focus',name:'专注的午后',hint:'累计专注 75 分钟',done:g.stats.minutes>=75||g.achievements.includes('focus')},
 {id:'gardener',name:'小小园艺家',hint:'累计收获 10 次',done:g.stats.harvest>=10},
 {id:'land',name:'庭院主人',hint:'解锁全部 6 块地',done:g.plots.every(p=>p!=='locked')},
 {id:'collection',name:'四季收藏家',hint:`收获全部 ${Object.keys(CROPS).length} 种作物`,done:Object.keys(CROPS).every(k=>g.discovered.includes(k))||g.achievements.includes('collection')},
]}
export function act(state,a,now=Date.now()){
 const s=settle(state,now),g=s.game,p=activePet(g),today=g.daily.day;now=g.last;
 const care=()=>{g.daily.care++;p.bond=clamp(p.bond+3,0,100)};
 switch(a.type){
 case 'chat':{
  const hour=new Date(now).getHours();
  const context=p.sleeping?'sleep':p.hunger<40?'hungry':p.energy<35?'tired':hour<10?'morning':hour>=21?'night':'idle';
  say(p,companionLine(g,p,context),now);break;}
 case 'petSignature':{
  check(!p.sleeping,'伙伴正在睡觉，醒来后再看它的拿手动作吧');
  check(!g.focus||g.focus.end<=now,'伙伴正在安静陪你专注，结束后再看吧');
  say(p,companionLine(g,p,'signature'),now);break;}
 case 'puzzleMove':{
  const result=movePuzzle(g.puzzle,a.direction);g.puzzle=result.state;
  if(result.changed&&result.merges.some(m=>m.value>=128))g.puzzle.qualifiedDay=today;
  if(result.newMilestones.length)say(p,companionLine(g,p,'gameWin'),now);
  else if(result.changed&&result.over)say(p,companionLine(g,p,'gameLose'),now);
  break;}
 case 'puzzleUndo':g.puzzle=undoPuzzle(g.puzzle);break;
 case 'puzzleRestart':g.puzzle=restartPuzzle(g.puzzle,now);break;
 case 'puzzleClaim':{check(g.puzzle.qualifiedDay===today,'今天合成一次 128 或更大的数字，就能领取小礼物');check(g.puzzle.earnedDay!==today,'今天的小游戏礼物已经领取');const supply=puzzleSupply(g);g.puzzle.earnedDay=today;g.puzzle.supplyClaim={day:today,crop:supply.crop,quantity:supply.quantity};g.seeds[supply.crop]+=supply.quantity;g.coins+=8;p.bond=clamp(p.bond+2,0,100);p.xp+=3;p.mood=clamp(p.mood+10,0,100);g.daily.care++;say(p,companionLine(g,p,p.sleeping?'sleep':'supply'),now);note(g,'合成补给：'+CROPS[supply.crop].name+'种子 ×'+supply.quantity+'、8 荔枝币；伙伴成长 +3、亲密度 +2，计入一次陪伴。准备带去「'+supply.target+'」。',now);break;}
 case 'orderDeliver':{const result=deliverOrder(g,a.id,today,CROPS,gardenLevel(g)),recipient=g.pets.find(pet=>pet.species===result.order.pet);if(recipient){recipient.xp+=5;recipient.bond=clamp(recipient.bond+3,0,100);say(recipient,companionLine(g,recipient,recipient.sleeping?'sleep':'order'),now)}note(g,'完成伙伴委托「'+result.order.title+'」，收下 '+result.order.coins+' 荔枝币；'+(recipient?.name||PETS[result.order.pet].name)+'成长 +5、亲密度 +3。',now);break;}
 case 'gift':check(!g.daily.gift,'今天的补给已经领过啦');g.daily.gift=true;g.coins+=20;g.food++;g.seeds.radish+=2;say(p,companionLine(g,p,p.sleeping?'sleep':'supply'),now);note(g,'领取每日补给：20 荔枝币、1 份食物、2 颗萝卜种子。',now);break;
 case 'pat':check(now-p.lastPat>=10000,'让它享受一下，稍等 10 秒再摸摸');p.lastPat=now;if((g.daily.pats[g.active]||0)<PAT_REWARD_LIMIT){g.daily.pats[g.active]=(g.daily.pats[g.active]||0)+1;p.xp+=2;care();}else g.daily.care++;p.mood=clamp(p.mood+5,0,100);say(p,companionLine(g,p,'pat'),now);note(g,'摸摸头，'+p.name+'舒服地眯起了眼。',now);break;
 case 'feed':check(!p.sleeping,'先唤醒伙伴再喂食');check(p.hunger<98,'它已经吃饱了，留着下次吧');
  if(a.crop){check(CROPS[a.crop]&&g.stock[a.crop]>0,'背包里没有这种作物');g.stock[a.crop]--;}else{check(g.food>0,'食物用完了，可以去集市购买');g.food--;}
  p.hunger=clamp(p.hunger+30,0,100);p.energy=clamp(p.energy+5,0,100);p.xp+=8;care();say(p,companionLine(g,p,'feed'),now);note(g,'吃饱啦，伙伴的亲密度和成长增加了。',now);break;
 case 'play':check(!p.sleeping,'先唤醒伙伴');check(p.energy>=25,'它有点累了，让它休息一会儿');check(now-p.lastPlay>=30000,'再等一会儿，30 秒后可以继续玩');p.lastPlay=now;p.energy-=10;p.mood=clamp(p.mood+20,0,100);p.xp+=5;care();say(p,companionLine(g,p,'play'),now);note(g,'陪'+p.name+'玩了一会儿，心情变好了。',now);break;
 case 'sleep':p.sleeping=!p.sleeping;say(p,companionLine(g,p,p.sleeping?'sleep':'wake'),now);note(g,p.sleeping?p.name+'睡下了，休息时会恢复精力。':p.name+'醒来，伸了一个大懒腰。',now);break;
 case 'rename':{const name=textValue(a.name).trim();check(name.length>0,'给伙伴取个名字吧');p.name=limitedText(name,12);say(p,'以后我就叫这个名字啦。',now);break;}
 case 'switchPet':{
  check(Number.isInteger(a.index)&&a.index>=0&&a.index<g.pets.length,'没有这个伙伴');
  check(a.index!==g.active,'它已经在这里陪你啦');
  g.active=a.index;const q=activePet(g);
  say(q,q.sleeping?companionLine(g,q,'sleep'):companionLine(g,q,'greet'),now);
  note(g,'切换伙伴：现在陪着你的是 '+q.name+'。',now);break;}
 case 'plant':{
  const c=CROPS[a.crop];check(Number.isInteger(a.index)&&a.index>=0&&a.index<6&&g.plots[a.index]===null,'请选择空地');check(c&&gardenLevel(g)>=c.level,'庭院还没有解锁这种作物');check(g.seeds[a.crop]>0,'这种种子用完了，去集市补充吧');g.seeds[a.crop]--;g.plots[a.index]={crop:a.crop,planted:now,ready:now+c.time,watered:false};g.stats.planted++;g.daily.plant++;say(p,companionLine(g,p,p.sleeping?'sleep':'plant'),now);note(g,'种下了'+c.name+'，离线时也会继续生长。',now);break;}
 case 'water':{const x=g.plots[a.index];check(x&&x!=='locked','这块地还没有作物');check(!x.watered,'已经浇过水了');check(now<x.ready,'已经成熟，可以收获了');x.ready=now+Math.ceil((x.ready-now)*0.75);x.watered=true;say(p,companionLine(g,p,p.sleeping?'sleep':'water'),now);note(g,'浇水完成，剩余生长时间缩短四分之一。',now);break;}
 case 'harvest':{const x=g.plots[a.index];check(x&&x!=='locked'&&now>=x.ready,'作物还没有成熟');const c=CROPS[x.crop];g.stock[x.crop]+=c.yield;if(!g.discovered.includes(x.crop))g.discovered.push(x.crop);g.plots[a.index]=null;g.stats.harvest++;g.daily.harvest++;p.xp+=c.xp;say(p,companionLine(g,p,p.sleeping?'sleep':'harvest'),now);note(g,'收获 '+c.name+' ×'+c.yield+'，已放入背包。',now);break;}
 case 'unlock':{const cost=plotUnlockCost(g);check(g.plots[a.index]==='locked','这块地已经解锁');check(g.coins>=cost,'荔枝币不够，收获后去集市出售作物吧');g.coins-=cost;g.plots[a.index]=null;note(g,'新开垦了一块农田。',now);break;}
 case 'buySeed':{const c=CROPS[a.crop];check(c&&gardenLevel(g)>=c.level,'庭院还没有解锁这种作物');check(g.coins>=c.price,'荔枝币不够');g.coins-=c.price;g.seeds[a.crop]++;break;}
 case 'sell':{const c=CROPS[a.crop],n=g.stock[a.crop]||0;check(c&&n>0,'没有可出售的作物');g.coins+=n*c.sell;g.stock[a.crop]=0;note(g,'出售'+c.name+' ×'+n+'，获得 '+(n*c.sell)+' 荔枝币。',now);break;}
 case 'sellSurplus':{const c=CROPS[a.crop];check(c,'没有这种作物');const n=sellableStock(g,a.crop);check(n>0,'这些收成已为伙伴委托和下一项建设留好，暂时没有多余的');g.coins+=n*c.sell;g.stock[a.crop]-=n;note(g,'出售多余的'+c.name+' ×'+n+'，获得 '+(n*c.sell)+' 荔枝币；为委托和建设留好的收成仍在篮子里。',now);break;}
 case 'buyFood':check(g.coins>=8,'需要 8 荔枝币');g.coins-=8;g.food++;break;
 case 'decor':{const d=(Object.hasOwn(DECOR,a.id)&&DECOR[a.id])||(Object.hasOwn(PROJECTS,a.id)&&PROJECTS[a.id]);check(d,'没有这件装饰');if(!g.decor.includes(a.id)){if(Object.hasOwn(PROJECTS,a.id)){const status=projectStatus(g,a.id);check(status.unlocked,d.requirement.kind==='harvest'?'累计收获 '+d.requirement.count+' 次后可以建设':'完成 '+d.requirement.count+' 份伙伴委托后可以建设');check(status.missing.every(item=>item.missing===0),'建设材料还没有齐，先去农田收获吧')}check(g.coins>=d.price,'荔枝币不够');g.coins-=d.price;if(d.needs)for(const [crop,n] of Object.entries(d.needs))g.stock[crop]-=n;g.decor.push(a.id);say(p,companionLine(g,p,p.sleeping?'sleep':'build'),now);if(Object.hasOwn(PROJECTS,a.id))note(g,'建好了「'+d.name+'」，收成变成了庭院里看得见的一角。',now)}g.equipped=g.equipped.includes(a.id)?g.equipped.filter(x=>x!==a.id):[...g.equipped,a.id];break;}
 case 'quest':{const q=QUESTS[a.id];check(q&&g.daily[a.id]>=q.target,'目标还没有完成');check(!g.daily.claimed.includes(a.id),'奖励已领取');g.daily.claimed.push(a.id);g.coins+=q.reward;note(g,'完成每日目标：'+q.name+'。',now);break;}
 case 'achievement':{const x=achievementList(g).find(x=>x.id===a.id);check(x?.done,'成就还没有完成');check(!g.achievements.includes(a.id),'奖励已领取');g.achievements.push(a.id);g.coins+=30;note(g,'获得纪念章：'+x.name+'。',now);break;}
 case 'focusStart':{check(!g.focus,'请先完成或取消当前专注');check(Number.isInteger(a.minutes)&&a.minutes>=1&&a.minutes<=120,'专注时长请输入 1–120 的整数分钟');const todo=a.todoId?s.todos.find(t=>t.id===a.todoId):null;check(!a.todoId||(todo&&!todo.done&&!todo.archived),'请选择一件未完成的事项');g.focus={startedAt:now,end:now+a.minutes*60000,duration:a.minutes,todoId:todo?.id||'',task:todo?.text||''};say(p,companionLine(g,p,p.sleeping?'sleep':'focusStart'),now);break;}
 case 'focusCancel':g.focus=null;break;
 case 'focusClaim':check(g.focus&&now>=g.focus.end,'专注还没结束');g.stats.minutes+=g.focus.duration;g.stats.focus++;g.daily.focus++;g.coins+=g.focus.duration;p.xp+=g.focus.duration;p.mood=clamp(p.mood+10,0,100);g.focusHistory.unshift({startedAt:g.focus.startedAt,endedAt:g.focus.end,minutes:g.focus.duration,todoId:g.focus.todoId,task:g.focus.task});g.focusHistory=g.focusHistory.slice(0,365);say(p,companionLine(g,p,'focus'),now);note(g,'完成 '+g.focus.duration+' 分钟专注，获得等量荔枝币与成长。',now);g.focus=null;break;
 case 'todoAdd':{const text=String(a.text||'').trim(),id=String(a.id||'').slice(0,60);check(text,'先写下一件小事');check(id&&!s.todos.some(t=>t.id===id),'事项标识重复，请重新添加');check(s.todos.filter(t=>!t.archived).length<100&&s.todos.length<500,'清单已满，请先归档或清理已完成事项');s.todos.push({id,text:text.slice(0,120),done:false,rewarded:false,date:todoDate(a.date===undefined?dayKey(now):a.date),createdAt:now,completedAt:0,archived:false});break;}
 case 'todoEdit':{const t=s.todos.find(x=>x.id===a.id);check(t,'没有找到事项');if(a.text!==undefined){const text=String(a.text).trim();check(text,'事项不能留空');t.text=text.slice(0,120)}if(a.date!==undefined)t.date=todoDate(a.date);break;}
 case 'todoToggle':{const t=s.todos.find(x=>x.id===a.id);check(t,'没有找到事项');check(!t.archived,'请先从归档中恢复事项');t.done=!t.done;t.completedAt=t.done?now:0;if(t.done&&!t.rewarded){t.rewarded=true;g.stats.tasks++;if(g.daily.todoRewards<TODO_REWARD_LIMIT){g.daily.todoRewards++;p.xp+=2;}}if(t.done)say(p,companionLine(g,p,'task'),now);break;}
 case 'todoArchive':{const t=s.todos.find(x=>x.id===a.id);check(t,'没有找到事项');const archive=a.archived!==false;check(!archive||t.done,'完成后再归档这件小事');check(archive||!t.archived||s.todos.filter(x=>!x.archived).length<100,'未归档事项已满，请先整理');t.archived=archive;break;}
 case 'todoArchiveDone':for(const t of s.todos)if(t.done)t.archived=true;break;
 case 'todoDelete':s.todos=s.todos.filter(x=>x.id!==a.id);break;
 case 'visit':{if(g.journey.days.length<7&&!g.journey.days.includes(today)&&(!g.journey.days.length||today>g.journey.days.at(-1)))g.journey.days.push(today);break;}
 case 'journeyClaim':{const chapter=journeyList(g).find(c=>c.id===a.id);check(chapter?.available,'这段故事会在之后的来访中慢慢展开');check(!chapter.claimed,'这份纪念物已经收好啦');g.journey.claimed.push(chapter.id);note(g,'读完「'+chapter.title+'」，收好'+chapter.keepsake+'。',now);break;}
 default:throw Error('未知操作');
 }
 g.gardenLevel=gardenLevel(g);
 return s;
}
export function gpa(courses){courses=courses.filter(c=>c.included!==false);const total=courses.reduce((n,c)=>n+c.credit,0);return {credits:total,value:total?courses.reduce((n,c)=>n+c.credit*c.point,0)/total:0}}
