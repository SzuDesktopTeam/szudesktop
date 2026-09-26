import assert from 'node:assert/strict';
import {act,createState,normalize,settle,level,gardenLevel,achievementList,journeyList,journeyKeepsakes,JOURNEY,CROPS,DECOR,PAT_REWARD_LIMIT,TODO_REWARD_LIMIT,petSprite,AVAILABLE_PETS} from './assets/garden/engine.mjs';
import {actionReward} from './assets/garden/rewards.mjs';

const now=new Date(2026,8,27,12).getTime();
let checks=0;
function test(name,work){work();checks++;console.log('PASS',name)}
const roundTrip=(s,time=now)=>normalize(JSON.parse(JSON.stringify(s)),time);

test('garden unlocks survive switching companions and saving',()=>{
 let s=createState(now);s.game.pets[0].xp=100;s.game.coins=100;
 s=act(s,{type:'switchPet',index:1},now);
 assert.equal(level(s.game),1);assert.equal(gardenLevel(s.game),3);
 s=roundTrip(s);s=act(s,{type:'buySeed',crop:'lychee'},now);s=act(s,{type:'plant',crop:'lychee',index:1},now);
 assert.equal(s.game.plots[1].crop,'lychee');
 assert.equal(achievementList(s.game).find(a=>a.id==='friend').done,true);
 s.game.pets[0].xp=0;
 assert.equal(gardenLevel(roundTrip(s).game),3,'earned garden unlock is a saved milestone');
});

test('old saves infer crop unlocks from previous garden progress without inventing visits or history',()=>{
 const old=createState(now);
 for(const key of ['gardenLevel','focusHistory','journey'])delete old.game[key];
 delete old.game.daily.pats;delete old.game.daily.todoRewards;
 old.game.active=1;old.game.seeds.lychee=1;old.game.stats.minutes=300;
 old.todos=[{id:'old',text:'旧事项',done:true,rewarded:true}];
 old.game.focus={end:now+25*60000,duration:25,password:'omit'};
 const s=roundTrip(old);
 assert.equal(gardenLevel(s.game),3);
 assert.deepEqual(s.game.journey,{days:[],claimed:[]});assert.deepEqual(s.game.focusHistory,[]);
 assert.equal(s.game.stats.minutes,300);
 assert.deepEqual(s.todos[0],{id:'old',text:'旧事项',done:true,rewarded:true,date:'',createdAt:0,completedAt:0,archived:false});
 assert.deepEqual(s.game.focus,{startedAt:now,end:now+25*60000,duration:25,todoId:'',task:''});
 const done=act(s,{type:'focusClaim'},now+25*60000);
 assert.equal(done.game.focusHistory[0].minutes,25);
 assert.deepEqual(roundTrip(done,now+25*60000),done);
});

test('equal focus time earns equal growth regardless of splitting',()=>{
 function sessions(lengths){let s=createState(now),time=now;for(const minutes of lengths){s=act(s,{type:'focusStart',minutes},time);time+=minutes*60000;s=act(s,{type:'focusClaim'},time)}return s}
 const long=sessions([45]),short=sessions(Array(9).fill(5));
 assert.equal(long.game.pets[0].xp,45);assert.equal(short.game.pets[0].xp,45);
 assert.equal(long.game.coins,short.game.coins);
 assert.equal(achievementList(long.game).find(a=>a.id==='focus').done,achievementList(short.game).find(a=>a.id==='focus').done);
 assert.equal(achievementList(sessions([75]).game).find(a=>a.id==='focus').done,true);
 const legacy=createState(now);legacy.game.achievements.push('focus');
 assert.equal(achievementList(roundTrip(legacy).game).find(a=>a.id==='focus').done,true,'previously collected medals stay complete');
});

test('custom focus limits, task snapshots and exact completion history survive reload',()=>{
 let s=act(createState(now),{type:'todoAdd',id:'paper',text:'读一篇论文',date:'2026-09-28'},now);
 for(const minutes of [0,121,2.5,NaN,'25'])assert.throws(()=>act(s,{type:'focusStart',minutes},now),/1–120/);
 assert.throws(()=>act(s,{type:'focusStart',minutes:20,todoId:'absent'},now),/事项/);
 s=act(s,{type:'focusStart',minutes:17,todoId:'paper'},now);
 s=act(s,{type:'todoEdit',id:'paper',text:'重命名后的论文'},now);
 s=roundTrip(s,now+1000);assert.throws(()=>act(s,{type:'focusClaim'},now+1000),/没结束/);
 s=act(s,{type:'todoDelete',id:'paper'},now+1000);
 s=act(s,{type:'focusClaim'},now+20*60000);
 assert.deepEqual(s.game.focusHistory,[{startedAt:now,endedAt:now+17*60000,minutes:17,todoId:'paper',task:'读一篇论文'}]);
 assert.equal(s.game.stats.minutes,17,'late claims do not fabricate additional study time');
 assert.throws(()=>act(s,{type:'focusClaim'},now+20*60000),/没结束/);
 assert.deepEqual(roundTrip(s,now+20*60000),s);
 for(const minutes of [1,120])assert.equal(act(createState(now),{type:'focusStart',minutes},now).game.focus.duration,minutes);
});

test('cancelling focus leaves the task and earned history untouched',()=>{
 let s=act(createState(now),{type:'todoAdd',id:'a',text:'写作业'},now);
 s=act(s,{type:'focusStart',minutes:25,todoId:'a'},now);s=act(s,{type:'focusCancel'},now+60000);
 assert.equal(s.todos[0].done,false);assert.equal(s.game.stats.minutes,0);assert.deepEqual(s.game.focusHistory,[]);
 s=act(s,{type:'focusStart',minutes:1,todoId:'a'},now+60000);s=act(s,{type:'focusClaim'},now+120000);
 assert.equal(s.todos[0].done,false,'finishing a timer does not assume the associated task is complete');
});

test('daily pat growth is limited per companion while interaction continues',()=>{
 let s=createState(now);
 for(let i=0;i<10;i++)s=act(s,{type:'pat'},now+i*10000);
 assert.equal(s.game.pets[0].xp,PAT_REWARD_LIMIT*2);assert.equal(s.game.pets[0].bond,10+PAT_REWARD_LIMIT*3);
 assert.equal(s.game.daily.care,10);assert.equal(s.game.pets[0].lastPat,now+90000);
 s=act(roundTrip(s,now+90000),{type:'pat'},now+100000);assert.equal(s.game.pets[0].xp,6);
 s=act(s,{type:'switchPet',index:1},now+100000);s=act(s,{type:'pat'},now+100000);assert.equal(s.game.pets[1].xp,2);
 s=act(s,{type:'switchPet',index:0},now+100000);s=act(s,{type:'pat'},now+86400000);assert.equal(s.game.pets[0].xp,8);
 assert.equal(s.game.daily.pats[0],1);
});

test('long crops earn more per visit and are not dominated in profit or growth per minute',()=>{
 let previousProfit=0;
 for(const [crop,c] of Object.entries(CROPS)){
  const minutes=c.time/60000,profit=(c.sell*c.yield-c.price)/minutes;
  assert.ok(profit>=previousProfit);previousProfit=profit;
  let s=createState(now);s.game.gardenLevel=3;s.game.seeds[crop]++;
  const xp=s.game.pets[0].xp;s=act(s,{type:'plant',crop,index:1},now);
  s=act(s,{type:'water',index:1},now);
  assert.equal(s.game.pets[0].xp,xp,'watering accelerates growth without a short-crop XP loophole');
  s=act(s,{type:'harvest',index:1},s.game.plots[1].ready);
  assert.equal(s.game.pets[0].xp-xp,minutes);
  assert.equal(s.game.stock[crop],c.yield);
 }
 assert.equal(CROPS.radish.time,60000,'the first harvest still arrives in one minute');
 assert.deepEqual(Object.values(DECOR).map(d=>d.price),[35,60,90],'progress is not prolonged by raising existing decoration prices');
});

test('todo editing, completion date, archive and restore preserve the first reward',()=>{
 let s=act(createState(now),{type:'todoAdd',id:'a',text:'读书'},now);
 assert.equal(s.todos[0].date,'2026-09-27');assert.equal(s.todos[0].createdAt,now);
 s=act(s,{type:'todoEdit',id:'a',text:'读第二章',date:'2026-09-29'},now);
 assert.throws(()=>act(s,{type:'todoEdit',id:'a',date:'2026-02-30'},now),/日期/);
 assert.throws(()=>act(s,{type:'todoArchive',id:'a'},now),/完成后/);
 s=act(s,{type:'todoToggle',id:'a'},now+60000);s=act(s,{type:'todoArchive',id:'a'},now+60000);
 assert.equal(s.todos[0].completedAt,now+60000);assert.equal(s.todos[0].archived,true);
 s=roundTrip(s,now+60000);assert.throws(()=>act(s,{type:'todoToggle',id:'a'},now+60000),/归档/);
 s=act(s,{type:'todoArchive',id:'a',archived:false},now+60000);
 s=act(s,{type:'todoToggle',id:'a'},now+60000);assert.equal(s.todos[0].completedAt,0);
 s=act(s,{type:'todoToggle',id:'a'},now+120000);
 assert.equal(s.game.pets[0].xp,2);assert.equal(s.game.stats.tasks,1);
 s=act(s,{type:'todoArchiveDone'},now+120000);assert.equal(s.todos[0].archived,true);
});

test('deleting and recreating todos cannot generate unlimited daily growth',()=>{
 let s=createState(now);
 for(let i=0;i<TODO_REWARD_LIMIT+3;i++){
  s=act(s,{type:'todoAdd',id:'repeat',text:'小事'},now);
  s=act(s,{type:'todoToggle',id:'repeat'},now);s=act(s,{type:'todoDelete',id:'repeat'},now);
 }
 assert.equal(s.game.pets[0].xp,TODO_REWARD_LIMIT*2);
 s=act(roundTrip(s),{type:'todoAdd',id:'tomorrow',text:'新的一天'},now+86400000);
 s=act(s,{type:'todoToggle',id:'tomorrow'},now+86400000);assert.equal(s.game.pets[0].xp,TODO_REWARD_LIMIT*2+2);
});

test('seven visits allow gaps, never count duplicate or backward days, and preserve keepsakes',()=>{
 let s=createState(now);assert.equal(journeyList(s.game)[0].available,true);
 s=act(s,{type:'visit'},now);assert.equal(s.game.journey.days.length,1);
 assert.throws(()=>act(s,{type:'journeyClaim',id:'home'},now),/之后/);
 for(const day of [2,5,9,14,20,28])s=act(s,{type:'visit'},now+day*86400000);
 assert.equal(s.game.journey.days.length,7);
 for(const chapter of JOURNEY){
  const before=s;s=act(s,{type:'journeyClaim',id:chapter.id},now+28*86400000);
  assert.deepEqual(actionReward(before,s,{type:'journeyClaim',id:chapter.id}).items,[chapter.keepsake]);
  assert.throws(()=>act(s,{type:'journeyClaim',id:chapter.id},now+28*86400000),/已经/);
 }
 s=act(s,{type:'visit'},now+40*86400000);s=act(s,{type:'visit'},now+86400000);
 assert.equal(s.game.journey.days.length,7);assert.equal(s.game.coins,40);
 assert.ok(journeyList(roundTrip(s,now+40*86400000).game).every(c=>c.available&&c.claimed));
});

test('new fields have explicit save whitelists and sane legacy defaults',()=>{
 let s=createState(now);s.preferences.noticeSource='college-test';s.preferences.studentLevel='graduate';s.preferences.cookie='omit';
 s=act(s,{type:'todoAdd',id:'a',text:'小事',date:''},now);s.todos[0].cookie='omit';
 s.game.journey.cookie='omit';s.game.daily.cookie='omit';
 s.game.focusHistory=[{startedAt:now,endedAt:now+60000,minutes:1,todoId:'a',task:'小事',cookie:'omit'}];
 s=roundTrip(s);
 assert.equal(s.preferences.noticeSource,'college-test');assert.equal(s.preferences.studentLevel,'graduate');
 assert.equal(JSON.stringify(s).includes('cookie'),false);
 assert.equal(s.todos[0].date,'');assert.deepEqual(roundTrip(s),s);
 s.preferences.noticeSource={};s.preferences.studentLevel='other';s=roundTrip(s);
 assert.equal(s.preferences.noticeSource,'undergrad');assert.equal(s.preferences.studentLevel,'undergrad');
});

test('libao has distinct mood and sleep sprites without changing the original companion',()=>{
 const pet=createState(now).game.pets[0];
 assert.equal(petSprite(pet),'libao-happy');
 assert.equal(petSprite({...pet,mood:50}),'libao-normal');
 assert.equal(petSprite({...pet,mood:20}),'libao-sad');
 assert.equal(petSprite({...pet,sleeping:true}),'libao-sleep');
 assert.equal(pet.species,'libao');
});

test('each companion responds in its own voice for every care and progress action',()=>{
 for(const type of ['pat','feed','play','sleep','wake','focusClaim','harvest']){
  const voices=[];
  for(let index=0;index<AVAILABLE_PETS.length;index++){
   let before=createState(now);before.game.active=index;
   const action={type:type==='wake'?'sleep':type,index:0};
   let time=now;
   if(type==='wake')before=act(before,{type:'sleep'},time);
   if(type==='focusClaim'){before=act(before,{type:'focusStart',minutes:1},time);time+=60000}
   if(type==='harvest')time+=60000;
   const after=act(before,action,time),replayed=act(roundTrip(before),action,time);
   const line=after.game.pets[index].say;
   assert.ok(line&&line.length<=60);assert.equal(after.game.pets[index].saidAt,time);
   assert.equal(replayed.game.pets[index].say,line,'reload does not reroll the response');voices.push(line);
  }
  assert.equal(new Set(voices).size,AVAILABLE_PETS.length,type+' should have a distinct voice for each species');
 }
 let s=createState(now);s=act(s,{type:'pat'},now);const first=s.game.pets[0].say;
 s=act(s,{type:'pat'},now+10000);assert.notEqual(s.game.pets[0].say,first);
});

test('keepsakes expose only earned items in story order and survive backup',()=>{
 let s=createState(now);assert.deepEqual(journeyKeepsakes(s.game),[]);
 s=act(s,{type:'visit'},now+2*86400000);
 s=act(s,{type:'journeyClaim',id:'lake'},now+2*86400000);
 s=act(s,{type:'journeyClaim',id:'hello'},now+2*86400000);
 const items=journeyKeepsakes(roundTrip(s,now+2*86400000).game);
 assert.deepEqual(items.map(x=>x.id),['hello','lake']);
 assert.deepEqual(items.map(x=>x.name),['初见小灯','湖边羽签']);
 for(const item of items){assert.match(item.icon,/^i-/);assert.ok(item.storyTitle)}
 assert.throws(()=>act(roundTrip(s,now+2*86400000),{type:'journeyClaim',id:'lake'},now+2*86400000),/已经/);
});

test('migration and backup cannot re-open already paid reward claims',()=>{
 let s=createState(now);
 s=act(s,{type:'gift'},now);s=act(s,{type:'harvest',index:0},now+60000);
 s=act(s,{type:'quest',id:'harvest'},now+60000);s=act(s,{type:'achievement',id:'harvest'},now+60000);
 s=act(s,{type:'focusStart',minutes:1},now+60000);s=act(s,{type:'focusClaim'},now+120000);
 const saved=roundTrip(s,now+120000),coins=saved.game.coins;
 for(const action of [{type:'gift'},{type:'quest',id:'harvest'},{type:'achievement',id:'harvest'},{type:'focusClaim'},{type:'harvest',index:0}])assert.throws(()=>act(saved,action,now+120000));
 assert.equal(saved.game.coins,coins);assert.equal(saved.game.focusHistory.length,1);
 assert.deepEqual(roundTrip(saved,now+120000),saved);
});

console.log(`${checks} garden progress checks passed`);
