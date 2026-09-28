// 存档跨版本兼容：旧版本读到新版本写的庭院存档时，不能把不认识的内容悄悄丢掉再写回。
//
// normalize 只留下本版本认识的键和取值（作物、装饰、建设、成就、伙伴、字段……），同一个 schema 下
// 新版本多出来的东西，旧版本读进来就没了，下一次自动保存便写回磁盘。办法是：存档里只要会出现新的键或取值，
// 就把 engine.mjs 的 SAVE_SCHEMA 加一；旧版本读到更高的 schema 会拒读、进入只读的存档失败页，不改原文件。
// 这里登记每个 schema 的“词表”（存档里会出现的键路径与取值），当前词表和登记的对不上就失败，提醒改动的人。
//
// 更新词表：node desktop/check-save-compat.mjs --print，把输出贴进 SCHEMA_VOCABULARY。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createState,normalize,achievementList,dayKey,JOURNEY,QUESTS,DECOR,CROPS,PETS,SAVE_SCHEMA,saveFromNewerVersion} from './assets/garden/engine.mjs';
import {PROJECTS} from './assets/garden/garden-loop.mjs';
import {PET_CONTEXTS} from './assets/garden/pet-dialogue.mjs';
import {ORDER_KEEPSAKES} from './assets/garden/garden-orders.mjs';
import {PUZZLE_MILESTONES} from './assets/garden/puzzle2048.mjs';
import {HOME_SKIN_DETAILS} from './assets/garden/home-skins.mjs';

const NOW=new Date(2026,8,27,12).getTime();
const DAY=86400000;

// 每个字段、每种可选内容都填上的一份存档：normalize 之后它的键路径就是本版本会写出的全部结构。
function richSave(){
 const s=createState(NOW),g=s.game,today=dayKey(NOW);
 s.profile={name:'小荔',college:'计算机与软件学院'};s.semester='2026-09-01';
 s.todos=[{id:'t1',text:'复习线性代数',done:true,rewarded:true,date:today,createdAt:NOW-DAY,completedAt:NOW,archived:true}];
 s.courses=[{name:'高等数学',credit:4,point:3.7,term:'2026 秋',code:'MATH101',level:'undergrad',grade:'A',source:'手动录入',included:true}];
 s.reminders=[{id:'r1',place:'琴房 101',start:NOW,end:NOW+3600000}];
 g.discovered=Object.keys(CROPS);g.decor=[...Object.keys(DECOR),...Object.keys(PROJECTS)];g.equipped=[...g.decor];
 g.achievements=achievementList(g).map(a=>a.id);
 g.journey={days:Array.from({length:7},(_,i)=>dayKey(NOW-(6-i)*DAY)),claimed:JOURNEY.map(c=>c.id)};
 g.focus={startedAt:NOW,end:NOW+60000,duration:1,todoId:'t1',task:'复习线性代数'};
 g.focusHistory=[{startedAt:NOW-120000,endedAt:NOW-60000,minutes:1,todoId:'t1',task:'复习线性代数'}];
 for(const p of g.pets)p.dialogue=Object.fromEntries(PET_CONTEXTS.map(k=>[k,1]));
 g.puzzle={...g.puzzle,undo:{board:[...g.puzzle.board],score:0,rng:1,moves:0},milestones:[...PUZZLE_MILESTONES],earnedDay:today,qualifiedDay:today,supplyClaim:{day:today,crop:Object.keys(CROPS)[0],quantity:1}};
 g.orders={day:today,offers:[],completed:[today+':0'],total:99,keepsakes:ORDER_KEEPSAKES.map(k=>k.id)};
 g.daily={...g.daily,claimed:Object.keys(QUESTS),pats:[1],todoRewards:1};
 return normalize(s,NOW);
}
// 键路径：数组元素记作 []；委托的 needs 以作物为键，作物已单独登记，这里只记一个 *。
function keyPaths(value,prefix,out){
 if(Array.isArray(value)){for(const item of value)keyPaths(item,prefix+'[]',out);return out}
 if(!value||typeof value!=='object')return out;
 if(prefix.endsWith('.needs')){out.add('key:'+prefix+'.*');return out}
 for(const [k,v] of Object.entries(value)){const path=prefix?prefix+'.'+k:k;out.add('key:'+path);keyPaths(v,path,out)}
 return out;
}
// 存进存档、又会被 normalize 按本版本的表过滤的取值。
function vocabulary(){
 const out=keyPaths(richSave(),'',new Set()),add=(kind,ids)=>{for(const id of ids)out.add(kind+':'+id)};
 add('crop',Object.keys(CROPS));add('decor',[...Object.keys(DECOR),...Object.keys(PROJECTS)]);
 add('achievement',achievementList(createState(NOW).game).map(a=>a.id));add('journey',JOURNEY.map(c=>c.id));
 add('quest',Object.keys(QUESTS));add('pet',Object.keys(PETS));add('keepsake',ORDER_KEEPSAKES.map(k=>k.id));add('milestone',PUZZLE_MILESTONES);
 add('homeSkin',Object.keys(HOME_SKIN_DETAILS).filter(id=>{const s=createState(NOW);s.preferences.homeSkin=id;return normalize(s,NOW).preferences.homeSkin===id}));
 return [...out].sort();
}

// 每个 schema 的词表。新增键或取值：SAVE_SCHEMA 加一，normalize 继续接受上一版，再在这里登记新版本；
// 只删掉了键或取值（旧版本读新存档不会丢东西）：直接更新当前版本的登记即可。
const SCHEMA_VOCABULARY={
 3:`
achievement:collection achievement:focus achievement:friend achievement:gardener achievement:harvest achievement:land
crop:blueberry crop:lychee crop:radish crop:strawberry
decor:flower decor:lakeLights decor:lantern decor:picnic decor:scarf decor:seedrack
homeSkin:bookshop homeSkin:lake homeSkin:pixel homeSkin:terrace
journey:basket journey:books journey:hello journey:home journey:lake journey:rain journey:shade
keepsake:first-basket keepsake:full-table keepsake:garden-helper keepsake:picnic-note
key:courses key:courses[].code key:courses[].credit key:courses[].grade key:courses[].included key:courses[].level key:courses[].name
key:courses[].point key:courses[].source key:courses[].term
key:game key:game.achievements key:game.active key:game.coins key:game.created key:game.daily key:game.daily.care key:game.daily.claimed
key:game.daily.day key:game.daily.focus key:game.daily.gift key:game.daily.harvest key:game.daily.pats key:game.daily.plant key:game.daily.todoRewards
key:game.decor key:game.discovered key:game.equipped key:game.focus key:game.focus.duration key:game.focus.end key:game.focus.startedAt
key:game.focus.task key:game.focus.todoId key:game.focusHistory key:game.focusHistory[].endedAt key:game.focusHistory[].minutes
key:game.focusHistory[].startedAt key:game.focusHistory[].task key:game.focusHistory[].todoId key:game.food key:game.gardenLevel key:game.journey
key:game.journey.claimed key:game.journey.days key:game.last key:game.log key:game.log[].text key:game.log[].time key:game.orders
key:game.orders.completed key:game.orders.day key:game.orders.keepsakes key:game.orders.offers key:game.orders.offers[].bonus
key:game.orders.offers[].coins key:game.orders.offers[].id key:game.orders.offers[].needs key:game.orders.offers[].needs.*
key:game.orders.offers[].pet key:game.orders.offers[].text key:game.orders.offers[].title key:game.orders.total key:game.pets key:game.pets[].bond
key:game.pets[].dialogue key:game.pets[].dialogue.build key:game.pets[].dialogue.feed key:game.pets[].dialogue.focus
key:game.pets[].dialogue.focusStart key:game.pets[].dialogue.gameLose key:game.pets[].dialogue.gameWin key:game.pets[].dialogue.greet
key:game.pets[].dialogue.harvest key:game.pets[].dialogue.hungry key:game.pets[].dialogue.idle key:game.pets[].dialogue.morning
key:game.pets[].dialogue.night key:game.pets[].dialogue.order key:game.pets[].dialogue.pat key:game.pets[].dialogue.plant
key:game.pets[].dialogue.play key:game.pets[].dialogue.signature key:game.pets[].dialogue.sleep key:game.pets[].dialogue.supply
key:game.pets[].dialogue.task key:game.pets[].dialogue.tired key:game.pets[].dialogue.wake key:game.pets[].dialogue.water key:game.pets[].energy
key:game.pets[].hunger key:game.pets[].lastPat key:game.pets[].lastPlay key:game.pets[].mood key:game.pets[].name key:game.pets[].saidAt
key:game.pets[].say key:game.pets[].sleeping key:game.pets[].species key:game.pets[].xp key:game.plots key:game.plots[].crop key:game.plots[].planted
key:game.plots[].ready key:game.plots[].watered key:game.puzzle key:game.puzzle.best key:game.puzzle.board key:game.puzzle.earnedDay
key:game.puzzle.milestones key:game.puzzle.moves key:game.puzzle.over key:game.puzzle.qualifiedDay key:game.puzzle.rng key:game.puzzle.score
key:game.puzzle.supplyClaim key:game.puzzle.supplyClaim.crop key:game.puzzle.supplyClaim.day key:game.puzzle.supplyClaim.quantity key:game.puzzle.undo
key:game.puzzle.undo.board key:game.puzzle.undo.moves key:game.puzzle.undo.over key:game.puzzle.undo.rng key:game.puzzle.undo.score
key:game.puzzle.undo.won key:game.puzzle.won key:game.seeds key:game.seeds.blueberry key:game.seeds.lychee key:game.seeds.radish
key:game.seeds.strawberry key:game.stats key:game.stats.focus key:game.stats.harvest key:game.stats.minutes key:game.stats.planted
key:game.stats.tasks key:game.stock key:game.stock.blueberry key:game.stock.lychee key:game.stock.radish key:game.stock.strawberry
key:preferences key:preferences.homeSkin key:preferences.motion key:preferences.noticeSource key:preferences.onboarded key:preferences.studentLevel
key:preferences.theme
key:profile key:profile.college key:profile.name
key:reminders key:reminders[].end key:reminders[].id key:reminders[].place key:reminders[].start
key:schema
key:semester
key:todos key:todos[].archived key:todos[].completedAt key:todos[].createdAt key:todos[].date key:todos[].done key:todos[].id key:todos[].rewarded
key:todos[].text
milestone:1024 milestone:128 milestone:2048 milestone:256 milestone:512
pet:chestnut pet:egret pet:libao pet:pingu pet:skipper pet:turtle
quest:care quest:focus quest:harvest quest:plant
`,
};

if(process.argv.includes('--print')){
 const lines=[];let kind='',line='';
 // 按类别（键按顶层字段）分段，每行不超过 150 个字符，改动时 diff 好读。
 const group=item=>item.startsWith('key:')?item.slice(4).split(/[.[]/)[0]:item.slice(0,item.indexOf(':'));
 for(const item of vocabulary()){const k=group(item);if(line&&(k!==kind||line.length+item.length>=150)){lines.push(line);line=''}kind=k;line+=(line?' ':'')+item}
 if(line)lines.push(line);
 console.log(` ${SAVE_SCHEMA}:\`\n${lines.join('\n')}\n\`,`);process.exit(0);
}

let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS',name)}
const registered=schema=>(SCHEMA_VOCABULARY[schema]||'').split(/\s+/).filter(Boolean).sort();

await check('the save vocabulary of the current schema is registered, so new keys cannot ship without raising SAVE_SCHEMA',()=>{
 assert.equal(createState(NOW).schema,SAVE_SCHEMA);assert.equal(richSave().schema,SAVE_SCHEMA);
 assert.ok(SCHEMA_VOCABULARY[SAVE_SCHEMA],`SAVE_SCHEMA=${SAVE_SCHEMA} 还没有登记词表：运行 node desktop/check-save-compat.mjs --print，把输出贴进 SCHEMA_VOCABULARY`);
 const current=vocabulary(),known=registered(SAVE_SCHEMA),added=current.filter(x=>!known.includes(x)),removed=known.filter(x=>!current.includes(x));
 if(added.length||removed.length)assert.fail([
  `存档词表和 schema ${SAVE_SCHEMA} 登记的不一致。`,
  added.length?'新增：'+added.join(' '):'',removed.length?'删除：'+removed.join(' '):'',
  added.length?`有新增时，旧版本读到新存档会把这些内容丢掉：请把 engine.mjs 的 SAVE_SCHEMA 改成 ${SAVE_SCHEMA+1}，normalize 继续接受 ${SAVE_SCHEMA}，再用 --print 登记新版本。`
   :'只删除时旧版本读新存档不会丢东西：用 --print 更新当前版本的登记即可。',
 ].filter(Boolean).join('\n'));
 // 旧版本的登记留着不删，记录已经写到同学电脑上的存档长什么样；登记的版本号必须真实存在。
 for(const schema of Object.keys(SCHEMA_VOCABULARY).map(Number))assert.ok(Number.isInteger(schema)&&schema>=3&&schema<=SAVE_SCHEMA,`登记了不存在的 schema ${schema}`);
});

await check('within one schema normalize drops what it does not know, which is why the vocabulary guard exists',()=>{
 const s=richSave(),crop='future-crop';
 s.game.seeds[crop]=5;s.game.discovered.push(crop);s.game.decor.push('future-decor');s.game.achievements.push('future-badge');s.wishlist=['x'];s.game.weather={today:'rain'};
 const n=normalize(JSON.parse(JSON.stringify(s)),NOW);
 assert.equal(n.game.seeds[crop],undefined);assert.ok(!n.game.discovered.includes(crop));assert.ok(!n.game.decor.includes('future-decor'));
 assert.ok(!n.game.achievements.includes('future-badge'));assert.equal(n.wishlist,undefined);assert.equal(n.game.weather,undefined);
});

await check('a save written by a newer version is refused with a clear message instead of being trimmed and written back',()=>{
 const future=richSave();future.schema=SAVE_SCHEMA+1;
 future.game.seeds['future-crop']=5;future.game.decor.push('future-decor');future.wishlist=['新版本才有的字段'];
 const text=JSON.stringify(future),input=JSON.parse(text);
 assert.equal(saveFromNewerVersion(input),true);
 assert.throws(()=>normalize(input,NOW),e=>/来自更新版本/.test(e.message)&&/请先把应用更新到最新版/.test(e.message)&&/原文件不会被改动/.test(e.message)&&e.message.includes(`存档结构 ${SAVE_SCHEMA+1}`));
 assert.equal(JSON.stringify(input),text,'拒读时不能改动传进来的存档');
 // 结构再怎么变，只要版本号更高就按“更新版本”说明，而不是报成“不支持的格式”。
 for(const game of [null,{plots:'changed'},[]])assert.throws(()=>normalize({schema:SAVE_SCHEMA+1,game},NOW),/来自更新版本/);
 for(const schema of [SAVE_SCHEMA,2,'4',4.5,null,undefined])assert.equal(saveFromNewerVersion({schema,game:{}}),false,String(schema));
 for(const raw of [null,undefined,'save',42])assert.equal(saveFromNewerVersion(raw),false);
 assert.throws(()=>normalize({schema:1,game:{plots:[]}},NOW),/不支持的存档格式/);assert.throws(()=>normalize({schema:'4',game:{plots:[]}},NOW),/不支持的存档格式/);
});

// 真实的启动流程：读到更新版本的存档时进入只读的失败页，提示更新，任何写入都不会发生。
const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const startupAt=source.lastIndexOf("try{let snapshot=null;try{snapshot=await api('/api/workspace')");
const failureHelpers=source.slice(source.indexOf('function enterWorkspaceFailure('),source.indexOf('async function recoverWorkspace('));
await check('opening a newer save shows the read-only failure page with the update hint and never writes',async()=>{
 assert.ok(startupAt>=0&&failureHelpers.length>0,'app.mjs 的启动读档流程变了，同步这里');
 const future=richSave();future.schema=SAVE_SCHEMA+1;future.game.decor.push('future-decor');
 const writes=[],events=[];
 const context=vm.createContext({normalize,createState,stampVersion(){},notebookUI:{load:async()=>{events.push('notes')}},campusUI:{loadSession(){},loadCas(){},loadSources(){}},schoolUI:{load(){}},pianoUI:{load(){}},academicUI:{load(){}},
  $:()=>assert.fail('读档结果必须交给页面渲染'),revision:0,state:null,saved:false,workspaceReady:false,workspaceFailure:null,
  api:async(path,body)=>{if(body!==undefined)writes.push([path,body]);if(path==='/api/workspace')return {revision:7,data:structuredClone(future)};if(path==='/api/credential')return {saved:false};return {}},
  commit:async next=>{writes.push(['commit',next])},render(){events.push('render')},pollNetwork(){events.push('network')},showGuide:()=>assert.fail('读档失败时不能弹出新手引导')});
 vm.runInContext(failureHelpers,context);
 await vm.runInContext(`(async()=>{${source.slice(startupAt)}})()`,context);
 assert.equal(context.workspaceReady,false);assert.match(context.workspaceFailure.message,/来自更新版本[^]*请先把应用更新到最新版/);
 assert.deepEqual(context.workspaceFailure.raw,future,'原始存档原样留给“导出原始存档”');
 assert.deepEqual(writes,[],'更新版本的存档不能被本版本写回');assert.deepEqual(events,['render','notes','network']);
});

console.log(`\n${checks} save compatibility checks passed`);
