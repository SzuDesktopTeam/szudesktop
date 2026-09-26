// Original local-only garden rules. No accounts, passwords, or remote services.
export const CROPS={
 radish:{name:'小萝卜',icon:'radish',time:60000,price:4,sell:3,yield:2,level:1,xp:1},
 strawberry:{name:'草莓',icon:'strawberry',time:300000,price:12,sell:12,yield:2,level:1,xp:5},
 blueberry:{name:'蓝莓',icon:'blueberry',time:1200000,price:24,sell:38,yield:2,level:2,xp:20},
 lychee:{name:'荔枝',icon:'lychee',time:3600000,price:40,sell:70,yield:3,level:3,xp:60},
};
export const DECOR={flower:{name:'窗边小花',price:35},scarf:{name:'猫咪围巾',price:60},lantern:{name:'暖光灯笼',price:90}};
// 宠物名册：sprite 对应 index.html 里的 symbol id；states=true 表示按心情切换
// 对应种类的 normal / happy / sad / sleep 四帧，false 表示只有单帧立绘。
// 荔宝是新存档的默认伙伴；旧存档补齐名册时保留已有伙伴及其名字和成长。
export const PETS={
 libao:{name:'荔宝',sprite:'libao',states:true,description:'荔枝庭院的老朋友，热情又爱笑。'},
 chestnut:{name:'栗栗',sprite:'cat',states:true,description:'爱晒太阳的栗色小猫，心情都写在脸上。'},
 egret:{name:'小白',sprite:'egret',states:true,description:'湖边散步的白鹭，喜欢安静地陪你。'},
 turtle:{name:'阿青',sprite:'turtle',states:true,description:'慢慢悠悠的小龟，最擅长陪你专注。'},
};
export const DEFAULT_PET='libao';
const PET_GREETINGS={libao:'嗨，我是荔宝！今天也一起加油。',chestnut:'喵，我在这儿呢。',egret:'湖边的风很舒服，陪你坐一会儿。',turtle:'不着急，我们一步一步来。'};
const PET_LINES={
 libao:{pat:['嘿嘿，叶子都被你摸歪啦。','今天也收到你的摸摸头了，开心！'],feed:['甜甜的！这一口留在好心情里。','吃饱啦，我可以陪你再做一件小事。'],play:['接住！这次换我把开心传给你。','我们绕庭院跑一小圈吧！'],sleep:['给我留一点晚风，梦里见。','叶子收好啦，我先睡一会儿。'],wake:['我醒啦！今天有什么新鲜事？','伸个懒腰，重新出发！'],focus:['这一段认真，我陪你一起收好了。','完成啦！要不要站起来喝口水？'],harvest:['满满一小篮！留一点给伙伴吧。','你看，认真照顾的种子真的长大了。']},
 chestnut:{pat:['呼噜……就是这里，再靠近一点。','耳朵被摸到了，先眯一会儿。'],feed:['喵，吃完就去窗边晒太阳。','盘子空啦。谢谢你记得我的点心。'],play:['那团影子跑哪儿了？我来找找。','抓到啦！这一局算我赢，好不好？'],sleep:['窗边这块刚刚好，呼噜……','尾巴收起来，留半个坐垫给你。'],wake:['喵——睡了一个暖暖的午觉。','我把爪子伸直啦，你也伸伸肩膀吧。'],focus:['你读你的，我在旁边安静打呼噜。','这一段结束啦，陪我看一眼窗外吧。'],harvest:['篮子我检查过了，没有小虫子。','这些叶子会晃耶……我只看，不扑。']},
 egret:{pat:['风碰过羽毛，你的手也很轻。','别急，我就在湖边等你。'],feed:['谢谢。吃完再去水边走一走。','这一小份刚好，剩下的慢慢来。'],play:['跟着我的影子，走过这一小段。','抬头看看，有一片云像我们的庭院。'],sleep:['湖面安静下来了，我也歇一会儿。','翅膀收好，等下一阵风。'],wake:['风换了方向，我们也活动一下吧。','我醒了。湖边还是一样安静。'],focus:['安静的一段时间，已经留下了痕迹。','辛苦了，望一望远处再继续吧。'],harvest:['种子等过风和阳光，现在轮到收获了。','把小篮子放稳，我们一份一份收好。']},
 turtle:{pat:['嗯……我有感觉到，谢谢你。','慢慢摸就好，我不赶时间。'],feed:['让我慢慢嚼，这一口很好吃。','肚子暖了，今天又多一点力气。'],play:['走慢一点也算比赛，我来啦。','这一步，再下一步。到了！'],sleep:['先把脑袋缩回去，待会儿见。','今天走过的路，睡醒再接着走。'],wake:['醒了醒了，我把四只脚都伸出来。','休息够啦，下一件事从小小的一步开始。'],focus:['一步一步的，你已经走完这一段了。','不用马上开始下一段，先歇一下。'],harvest:['等它长大，再慢慢收下，刚刚好。','不是长得最快的种子，收成也很好。']},
};
function companionLine(g,p,action){
 const lines=(PET_LINES[p.species]||PET_LINES[DEFAULT_PET])[action];
 const day=Number(g.daily.day.replaceAll('-',''));
 return lines[(day+g.daily.care+g.stats.harvest+g.stats.focus)%lines.length];
}
function createPet(species,now){
 return {species,name:PETS[species].name,xp:0,bond:10,hunger:80,energy:85,mood:85,sleeping:false,lastPat:0,lastPlay:0,say:PET_GREETINGS[species],saidAt:now};
}
// 每只宠物的字段。新增字段必须同时加进 createState / normalize 的迁移与白名单，
// 否则旧存档读进来会是 undefined。
const PET_FIELDS=['species','name','xp','bond','hunger','energy','mood','sleeping','lastPat','lastPlay','say','saidAt'];
export const activePet=g=>g.pets[g.active]||g.pets[0];
// 四位伙伴共用心情阈值，睡眠优先于心情。
export function petSprite(p){
 const spec=Object.hasOwn(PETS,p.species)?PETS[p.species]:PETS[DEFAULT_PET];
 if(!spec.states)return spec.sprite;
 return spec.sprite+'-'+(p.sleeping?'sleep':p.mood<35?'sad':p.mood>65?'happy':'normal');
}
// 宠物说的话。saidAt 只用于界面判断是否新鲜，不影响逻辑。
export function say(p,text,now){p.say=String(text).slice(0,60);p.saidAt=now}
export const QUESTS={care:{name:'陪伴伙伴 3 次',target:3,reward:15},plant:{name:'种下一颗种子',target:1,reward:10},harvest:{name:'收获一块农田',target:1,reward:15},focus:{name:'完成一次专注',target:1,reward:25}};
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
 {id:'rain',visit:4,title:'等雨停的十分钟',story:'雨落在屋檐上，阿青说不必把每一分钟都填满。你们把湿伞放在门边，等杯里的热气慢慢变淡。',keepsake:'雨天小伞'},
 {id:'books',visit:5,title:'夹在书页里的话',story:'桌上的书多了一张小纸条：“今天做过的那一点，已经算数。”荔宝画了一个歪歪的小太阳，让你下次翻到这里还能看见。',keepsake:'荔园书签'},
 {id:'basket',visit:6,title:'分一半给朋友',story:'伙伴们把收获篮摆到窗边，各自挑了一小份。没有比较谁攒得更多，剩下的可以留到下一次相聚。',keepsake:'分享小篮'},
 {id:'home',visit:7,title:'这儿已经有你的样子',story:'灯、书签和坐垫都留在原来的地方。你不必连续每天来；每次回来，伙伴都认得你。这片庭院，已经有了你的日常。',keepsake:'七次相遇相框'},
];
export function journeyList(g){return JOURNEY.map(chapter=>({...chapter,available:(g.journey?.days.length||0)>=chapter.visit,claimed:!!g.journey?.claimed.includes(chapter.id)}))}
const KEEPSAKE_ICONS={hello:'i-lantern',lake:'i-quill',shade:'i-flower',rain:'i-water',books:'i-book',basket:'i-chest',home:'i-cottage'};
export function journeyKeepsakes(g){return journeyList(g).filter(c=>c.claimed).map(c=>({id:c.id,name:c.keepsake,icon:KEEPSAKE_ICONS[c.id],storyTitle:c.title}))}
const dailyState=now=>({day:dayKey(now),gift:false,care:0,plant:0,harvest:0,focus:0,claimed:[],pats:[],todoRewards:0});
export function createState(now=Date.now()){
 return {schema:3,profile:{name:'',college:''},preferences:{theme:'day',motion:true,onboarded:false,noticeSource:'undergrad',studentLevel:'undergrad'},todos:[],courses:[],reminders:[],semester:'',
 game:{created:now,last:now,coins:40,food:3,seeds:{radish:4,strawberry:2,blueberry:0,lychee:0},stock:{radish:0,strawberry:0,blueberry:0,lychee:0},
 plots:[{crop:'radish',planted:now,ready:now+60000,watered:false},null,null,'locked','locked','locked'],
 pets:Object.keys(PETS).map(species=>createPet(species,now)),active:0,
 daily:dailyState(now),stats:{harvest:0,focus:0,minutes:0,planted:1,tasks:0},discovered:[],decor:[],equipped:[],achievements:[],gardenLevel:1,focus:null,focusHistory:[],journey:{days:[dayKey(now)],claimed:[]},log:[{time:now,text:'欢迎来到荔枝庭院。第一块萝卜地已经种好，记得来收获。'}]}};
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function check(ok,message){if(!ok)throw Error(message)}
function note(g,text,now){g.log.unshift({time:now,text});g.log=g.log.slice(0,30)}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&dayKey(new Date(value+'T12:00:00').getTime())===value}
const timeValue=n=>Number.isFinite(n)&&n>=0?n:0;
function todoDate(value){check(value===''||validDate(value),'请选择有效的事项日期');return value}
function focusFields(f){return {startedAt:timeValue(f.startedAt)||f.end-f.duration*60000,end:f.end,duration:f.duration,todoId:String(f.todoId||'').slice(0,60),task:String(f.task||'').slice(0,120)}}
export function normalize(input,now=Date.now()){
 // schema 2 是早期的单伙伴存档：只有 g.pet。这里统一升级成 pets 数组，
 // 用户改过的名字原样保留（迁移不覆盖用户数据），species 记为栗栗。
 const raw=input&&typeof input==='object'?structuredClone(input):null;
 check(raw&&(raw.schema===2||raw.schema===3)&&raw.game&&Array.isArray(raw.game.plots),'不支持的存档格式，请选择本应用导出的存档');
 const s=structuredClone(raw),g=s.game;
 for(const key of ['coins','food']){check(Number.isFinite(g[key])&&g[key]>=0&&g[key]<=1e8,'存档资源格式错误')}
 check(g.plots.length===6,'农田存档格式错误');
 for(const p of g.plots)if(p&&p!=='locked')check(CROPS[p.crop]&&Number.isFinite(p.planted)&&Number.isFinite(p.ready),'作物存档格式错误');
 for(const k of Object.keys(CROPS))for(const bag of ['seeds','stock'])check(g[bag]&&Number.isInteger(g[bag][k])&&g[bag][k]>=0&&g[bag][k]<=1e7,'背包格式错误');
 check(g.daily&&typeof g.daily.day==='string'&&Array.isArray(g.daily.claimed),'每日任务格式错误');
 for(const k of Object.keys(QUESTS))check(Number.isFinite(g.daily[k])&&g.daily[k]>=0,'每日任务数值错误');
 for(const k of ['harvest','focus','minutes','planted','tasks'])check(g.stats&&Number.isFinite(g.stats[k])&&g.stats[k]>=0,'累计记录格式错误');
 for(const k of ['discovered','decor','equipped','achievements','log'])check(Array.isArray(g[k]),'收藏存档格式错误');
 g.decor=g.decor.filter(k=>DECOR[k]);g.equipped=g.equipped.filter(k=>g.decor.includes(k));g.discovered=g.discovered.filter(k=>CROPS[k]);
 g.log=g.log.slice(0,30).filter(x=>x&&typeof x.text==='string'&&Number.isFinite(x.time)).map(x=>({time:x.time,text:x.text.slice(0,180)}));
 check(!g.focus||(Number.isFinite(g.focus.end)&&Number.isInteger(g.focus.duration)&&g.focus.duration>=1&&g.focus.duration<=120),'专注存档格式错误');
 g.focus=g.focus?focusFields(g.focus):null;
 g.focusHistory=(Array.isArray(g.focusHistory)?g.focusHistory:[]).filter(f=>f&&Number.isInteger(f.minutes)&&f.minutes>=1&&f.minutes<=120&&Number.isFinite(f.startedAt)&&Number.isFinite(f.endedAt)&&f.startedAt>=0&&f.endedAt>=f.startedAt).slice(0,365).map(f=>({startedAt:f.startedAt,endedAt:f.endedAt,minutes:f.minutes,todoId:String(f.todoId||'').slice(0,60),task:String(f.task||'').slice(0,120)}));
 g.journey={days:[...new Set((Array.isArray(g.journey?.days)?g.journey.days:[]).filter(validDate))].sort().slice(0,7),claimed:[...new Set((Array.isArray(g.journey?.claimed)?g.journey.claimed:[]).filter(id=>JOURNEY.some(c=>c.id===id)))]};
 g.journey.claimed=g.journey.claimed.filter(id=>JOURNEY.find(c=>c.id===id).visit<=g.journey.days.length);
 g.daily={day:g.daily.day,gift:!!g.daily.gift,...Object.fromEntries(Object.keys(QUESTS).map(k=>[k,g.daily[k]])),claimed:g.daily.claimed.filter(k=>Object.hasOwn(QUESTS,k)),pats:(Array.isArray(g.daily.pats)?g.daily.pats:[]).slice(0,8).map(n=>Number.isInteger(n)?clamp(n,0,PAT_REWARD_LIMIT):0),todoRewards:Number.isInteger(g.daily.todoRewards)?clamp(g.daily.todoRewards,0,TODO_REWARD_LIMIT):0};
 check(Number.isFinite(g.last)&&g.last>0&&g.last<=now+86400000,'存档时间异常');

 // —— 宠物：单只（schema 2）迁移成数组，并逐只校验 ——
 if(Array.isArray(g.pets)){
  check(g.pets.length>=1&&g.pets.length<=8,'伙伴数量不对');
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
  out.name=String(p.name||PETS[p.species].name).slice(0,12);
  out.xp=Number.isFinite(p.xp)?Math.min(Math.max(p.xp,0),1e6):0;
  for(const k of ['bond','hunger','energy','mood'])out[k]=clamp(Number.isFinite(p[k])?p[k]:50,0,100);
  out.sleeping=!!p.sleeping;
  for(const k of ['lastPat','lastPlay','saidAt'])out[k]=Number.isFinite(p[k])&&p[k]>=0?p[k]:0;
  out.say=String(p.say||'').slice(0,60);
  return out;
 });
 g.active=Number.isInteger(g.active)&&g.active>=0&&g.active<g.pets.length?g.active:0;

 s.profile={name:String(s.profile?.name||'').slice(0,20),college:String(s.profile?.college||'').slice(0,40)};
 s.preferences={theme:s.preferences?.theme==='night'?'night':'day',motion:s.preferences?.motion!==false,onboarded:s.preferences?.onboarded===true,noticeSource:typeof s.preferences?.noticeSource==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(s.preferences.noticeSource)?s.preferences.noticeSource:'undergrad',studentLevel:s.preferences?.studentLevel==='graduate'?'graduate':'undergrad'};
 s.todos=(Array.isArray(s.todos)?s.todos:[]).slice(0,500).filter(x=>x&&typeof x.id==='string'&&typeof x.text==='string').map(x=>({id:x.id.slice(0,60),text:x.text.slice(0,120),done:!!x.done,rewarded:!!x.rewarded,date:validDate(x.date)?x.date:'',createdAt:timeValue(x.createdAt),completedAt:x.done?timeValue(x.completedAt):0,archived:!!x.archived&&!!x.done}));
 s.courses=(Array.isArray(s.courses)?s.courses:[]).slice(0,300).filter(x=>x&&Number.isFinite(x.credit)&&Number.isFinite(x.point)&&x.credit>0&&x.credit<=100&&x.point>=0&&x.point<=5).map(x=>({name:String(x.name||'课程').slice(0,100),credit:x.credit,point:x.point,term:String(x.term||'').slice(0,40),code:String(x.code||'').slice(0,40),level:['undergrad','graduate'].includes(x.level)?x.level:'',grade:String(x.grade||'').slice(0,20),source:String(x.source||'手动录入').slice(0,30),included:x.included!==false}));
 s.reminders=(Array.isArray(s.reminders)?s.reminders:[]).filter(x=>x&&typeof x.id==='string'&&typeof x.place==='string'&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start&&x.end-x.start<=86400000).slice(0,50).map(x=>({id:x.id.slice(0,80),place:x.place.slice(0,80),start:x.start,end:x.end}));
 s.semester=/^\d{4}-\d{2}-\d{2}$/.test(s.semester||'')?s.semester:'';
 const clean={schema:3,profile:s.profile,preferences:s.preferences,todos:s.todos,courses:s.courses,reminders:s.reminders,semester:s.semester,game:{}};
 for(const k of Object.keys(createState(now).game))clean.game[k]=g[k];
 clean.game.pets=g.pets;clean.game.active=g.active;
 const settled=settle(clean,now);
 // 先结算原有伙伴，再迎接新伙伴；已有记录不覆盖、不重排，满 8 只时不挤掉旧伙伴。
 for(const species of Object.keys(PETS)){
  if(settled.game.pets.length>=8)break;
  if(!settled.game.pets.some(p=>p.species===species))settled.game.pets.push(createPet(species,now));
 }
 settled.game.gardenLevel=gardenLevel(settled.game);
 return settled;
}
export function settle(state,now=Date.now()){
 const s=structuredClone(state),g=s.game;now=Math.max(now,g.last);
 const hours=clamp((now-g.last)/3600000,0,48);
 // 每只宠物各自衰减：切换伙伴不该让另一只的状态定格在切换前。
 for(const p of g.pets){
  p.hunger=clamp(p.hunger-hours*2,15,100);p.mood=clamp(p.mood-hours,20,100);
  p.energy=clamp(p.energy+hours*(p.sleeping?30:-1),15,100);
 }
 g.last=now;
 const day=dayKey(now);
 if(day>g.daily.day)g.daily=dailyState(now);
 return s;
}
export function achievementList(g){return [
 {id:'harvest',name:'第一篮收成',hint:'收获一次',done:g.stats.harvest>=1},
 {id:'friend',name:'熟悉的朋友',hint:'有一位伙伴达到 3 级',done:g.pets.some(p=>p.xp>=100)||g.achievements.includes('friend')},
 {id:'focus',name:'专注的午后',hint:'累计专注 75 分钟',done:g.stats.minutes>=75||g.achievements.includes('focus')},
 {id:'gardener',name:'小小园艺家',hint:'累计收获 10 次',done:g.stats.harvest>=10},
 {id:'land',name:'庭院主人',hint:'解锁全部 6 块地',done:g.plots.every(p=>p!=='locked')},
 {id:'collection',name:'四季收藏家',hint:'收获全部 4 种作物',done:g.discovered.length===4},
]}
export function act(state,a,now=Date.now()){
 const s=settle(state,now),g=s.game,p=activePet(g);now=g.last;
 const care=()=>{g.daily.care++;p.bond=clamp(p.bond+3,0,100)};
 switch(a.type){
 case 'gift':check(!g.daily.gift,'今天的补给已经领过啦');g.daily.gift=true;g.coins+=20;g.food++;g.seeds.radish+=2;say(p,'补给到手！今天也请多指教。',now);note(g,'领取每日补给：20 荔枝币、1 份食物、2 颗萝卜种子。',now);break;
 case 'pat':check(now-p.lastPat>=10000,'让它享受一下，稍等 10 秒再摸摸');p.lastPat=now;if((g.daily.pats[g.active]||0)<PAT_REWARD_LIMIT){g.daily.pats[g.active]=(g.daily.pats[g.active]||0)+1;p.xp+=2;care();}else g.daily.care++;p.mood=clamp(p.mood+5,0,100);say(p,companionLine(g,p,'pat'),now);note(g,'摸摸头，'+p.name+'舒服地眯起了眼。',now);break;
 case 'feed':check(!p.sleeping,'先唤醒伙伴再喂食');check(p.hunger<98,'它已经吃饱了，留着下次吧');
  if(a.crop){check(CROPS[a.crop]&&g.stock[a.crop]>0,'背包里没有这种作物');g.stock[a.crop]--;}else{check(g.food>0,'食物用完了，可以去集市购买');g.food--;}
  p.hunger=clamp(p.hunger+30,0,100);p.energy=clamp(p.energy+5,0,100);p.xp+=8;care();say(p,companionLine(g,p,'feed'),now);note(g,'吃饱啦，伙伴的亲密度和成长增加了。',now);break;
 case 'play':check(!p.sleeping,'先唤醒伙伴');check(p.energy>=25,'它有点累了，让它休息一会儿');check(now-p.lastPlay>=30000,'再等一会儿，30 秒后可以继续玩');p.lastPlay=now;p.energy-=10;p.mood=clamp(p.mood+20,0,100);p.xp+=5;care();say(p,companionLine(g,p,'play'),now);note(g,'陪'+p.name+'玩了一会儿，心情变好了。',now);break;
 case 'sleep':p.sleeping=!p.sleeping;say(p,companionLine(g,p,p.sleeping?'sleep':'wake'),now);note(g,p.sleeping?p.name+'睡下了，休息时会恢复精力。':p.name+'醒来，伸了一个大懒腰。',now);break;
 case 'rename':check(String(a.name||'').trim().length>0,'给伙伴取个名字吧');p.name=String(a.name).trim().slice(0,12);say(p,'以后我就叫这个名字啦。',now);break;
 case 'switchPet':{
  check(Number.isInteger(a.index)&&a.index>=0&&a.index<g.pets.length,'没有这个伙伴');
  check(a.index!==g.active,'它已经在这里陪你啦');
  g.active=a.index;const q=activePet(g);
  say(q, q.sleeping?'（睡着的 '+q.name+' 翻了个身）':'嘿，轮到我了！',now);
  note(g,'切换伙伴：现在陪着你的是 '+q.name+'。',now);break;}
 case 'plant':{
  const c=CROPS[a.crop];check(Number.isInteger(a.index)&&a.index>=0&&a.index<6&&g.plots[a.index]===null,'请选择空地');check(c&&gardenLevel(g)>=c.level,'庭院还没有解锁这种作物');check(g.seeds[a.crop]>0,'这种种子用完了，去集市补充吧');g.seeds[a.crop]--;g.plots[a.index]={crop:a.crop,planted:now,ready:now+c.time,watered:false};g.stats.planted++;g.daily.plant++;note(g,'种下了'+c.name+'，离线时也会继续生长。',now);break;}
 case 'water':{const x=g.plots[a.index];check(x&&x!=='locked','这块地还没有作物');check(!x.watered,'已经浇过水了');check(now<x.ready,'已经成熟，可以收获了');x.ready=now+Math.ceil((x.ready-now)*0.75);x.watered=true;note(g,'浇水完成，剩余生长时间缩短四分之一。',now);break;}
 case 'harvest':{const x=g.plots[a.index];check(x&&x!=='locked'&&now>=x.ready,'作物还没有成熟');const c=CROPS[x.crop];g.stock[x.crop]+=c.yield;if(!g.discovered.includes(x.crop))g.discovered.push(x.crop);g.plots[a.index]=null;g.stats.harvest++;g.daily.harvest++;p.xp+=c.xp;say(p,companionLine(g,p,'harvest'),now);note(g,'收获 '+c.name+' ×'+c.yield+'，已放入背包。',now);break;}
 case 'unlock':{const n=g.plots.filter(x=>x!=='locked').length;const cost=60+(n-3)*30;check(g.plots[a.index]==='locked','这块地已经解锁');check(g.coins>=cost,'荔枝币不够，收获后去集市出售作物吧');g.coins-=cost;g.plots[a.index]=null;note(g,'新开垦了一块农田。',now);break;}
 case 'buySeed':{const c=CROPS[a.crop];check(c&&gardenLevel(g)>=c.level,'庭院还没有解锁这种作物');check(g.coins>=c.price,'荔枝币不够');g.coins-=c.price;g.seeds[a.crop]++;break;}
 case 'sell':{const c=CROPS[a.crop],n=g.stock[a.crop]||0;check(c&&n>0,'没有可出售的作物');g.coins+=n*c.sell;g.stock[a.crop]=0;note(g,'出售'+c.name+' ×'+n+'，获得 '+(n*c.sell)+' 荔枝币。',now);break;}
 case 'buyFood':check(g.coins>=8,'需要 8 荔枝币');g.coins-=8;g.food++;break;
 case 'decor':{const d=DECOR[a.id];check(d,'没有这件装饰');if(!g.decor.includes(a.id)){check(g.coins>=d.price,'荔枝币不够');g.coins-=d.price;g.decor.push(a.id);}g.equipped=g.equipped.includes(a.id)?g.equipped.filter(x=>x!==a.id):[...g.equipped,a.id];break;}
 case 'quest':{const q=QUESTS[a.id];check(q&&g.daily[a.id]>=q.target,'目标还没有完成');check(!g.daily.claimed.includes(a.id),'奖励已领取');g.daily.claimed.push(a.id);g.coins+=q.reward;note(g,'完成每日目标：'+q.name+'。',now);break;}
 case 'achievement':{const x=achievementList(g).find(x=>x.id===a.id);check(x?.done,'成就还没有完成');check(!g.achievements.includes(a.id),'奖励已领取');g.achievements.push(a.id);g.coins+=30;note(g,'获得纪念章：'+x.name+'。',now);break;}
 case 'focusStart':{check(!g.focus,'请先完成或取消当前专注');check(Number.isInteger(a.minutes)&&a.minutes>=1&&a.minutes<=120,'专注时长请输入 1–120 的整数分钟');const todo=a.todoId?s.todos.find(t=>t.id===a.todoId):null;check(!a.todoId||(todo&&!todo.done&&!todo.archived),'请选择一件未完成的事项');g.focus={startedAt:now,end:now+a.minutes*60000,duration:a.minutes,todoId:todo?.id||'',task:todo?.text||''};break;}
 case 'focusCancel':g.focus=null;break;
 case 'focusClaim':check(g.focus&&now>=g.focus.end,'专注还没结束');g.stats.minutes+=g.focus.duration;g.stats.focus++;g.daily.focus++;g.coins+=g.focus.duration;p.xp+=g.focus.duration;p.mood=clamp(p.mood+10,0,100);g.focusHistory.unshift({startedAt:g.focus.startedAt,endedAt:g.focus.end,minutes:g.focus.duration,todoId:g.focus.todoId,task:g.focus.task});g.focusHistory=g.focusHistory.slice(0,365);say(p,companionLine(g,p,'focus'),now);note(g,'完成 '+g.focus.duration+' 分钟专注，获得等量荔枝币与成长。',now);g.focus=null;break;
 case 'todoAdd':{const text=String(a.text||'').trim(),id=String(a.id||'').slice(0,60);check(text,'先写下一件小事');check(id&&!s.todos.some(t=>t.id===id),'事项标识重复，请重新添加');check(s.todos.filter(t=>!t.archived).length<100&&s.todos.length<500,'清单已满，请先归档或清理已完成事项');s.todos.push({id,text:text.slice(0,120),done:false,rewarded:false,date:todoDate(a.date===undefined?dayKey(now):a.date),createdAt:now,completedAt:0,archived:false});break;}
 case 'todoEdit':{const t=s.todos.find(x=>x.id===a.id);check(t,'没有找到事项');if(a.text!==undefined){const text=String(a.text).trim();check(text,'事项不能留空');t.text=text.slice(0,120)}if(a.date!==undefined)t.date=todoDate(a.date);break;}
 case 'todoToggle':{const t=s.todos.find(x=>x.id===a.id);check(t,'没有找到事项');check(!t.archived,'请先从归档中恢复事项');t.done=!t.done;t.completedAt=t.done?now:0;if(t.done&&!t.rewarded){t.rewarded=true;g.stats.tasks++;if(g.daily.todoRewards<TODO_REWARD_LIMIT){g.daily.todoRewards++;p.xp+=2;}}break;}
 case 'todoArchive':{const t=s.todos.find(x=>x.id===a.id);check(t,'没有找到事项');const archive=a.archived!==false;check(!archive||t.done,'完成后再归档这件小事');check(archive||!t.archived||s.todos.filter(x=>!x.archived).length<100,'未归档事项已满，请先整理');t.archived=archive;break;}
 case 'todoArchiveDone':for(const t of s.todos)if(t.done)t.archived=true;break;
 case 'todoDelete':s.todos=s.todos.filter(x=>x.id!==a.id);break;
 case 'visit':{const day=dayKey(now);if(g.journey.days.length<7&&!g.journey.days.includes(day)&&(!g.journey.days.length||day>g.journey.days.at(-1)))g.journey.days.push(day);break;}
 case 'journeyClaim':{const chapter=journeyList(g).find(c=>c.id===a.id);check(chapter?.available,'这段故事会在之后的来访中慢慢展开');check(!chapter.claimed,'这份纪念物已经收好啦');g.journey.claimed.push(chapter.id);note(g,'读完「'+chapter.title+'」，收好'+chapter.keepsake+'。',now);break;}
 default:throw Error('未知操作');
 }
 g.gardenLevel=gardenLevel(g);
 return s;
}
export function gpa(courses){courses=courses.filter(c=>c.included!==false);const total=courses.reduce((n,c)=>n+c.credit,0);return {credits:total,value:total?courses.reduce((n,c)=>n+c.credit*c.point,0)/total:0}}
