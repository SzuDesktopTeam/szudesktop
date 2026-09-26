import {CROPS,JOURNEY,level} from './engine.mjs';

const increase=(before,after)=>Number.isFinite(before)&&Number.isFinite(after)?Math.max(0,after-before):0;

// Present rewards only after a successful save. The engine remains the source
// of truth: neither the reward amounts nor the companion's level live here.
export function actionReward(before,after,action){
 const old=before?.game,g=after?.game;
 if(!old||!g||!action)return null;
 const items=[];
 let title;
 switch(action.type){
 case 'harvest':{
  const plot=old.plots?.[action.index];
  if(!plot||!CROPS[plot.crop]||g.plots?.[action.index]!==null||!increase(old.stats?.harvest,g.stats?.harvest))return null;
  const count=increase(old.stock?.[plot.crop],g.stock?.[plot.crop]);
  if(!count)return null;
  title='收获入仓';items.push(`${CROPS[plot.crop].name} +${count}`);break;
 }
 case 'gift':
  if(!g.daily?.gift||(old.daily?.gift&&old.daily.day===g.daily.day))return null;
  title='今日补给已领取';break;
 case 'quest':
  if(!g.daily?.claimed?.includes(action.id)||(old.daily?.day===g.daily.day&&old.daily?.claimed?.includes(action.id)))return null;
  title='每日目标完成';break;
 case 'achievement':
  if(!g.achievements?.includes(action.id)||old.achievements?.includes(action.id))return null;
  title='新纪念章入册';break;
 case 'journeyClaim':{
  const chapter=JOURNEY.find(c=>c.id===action.id);
  if(!chapter||!g.journey?.claimed.includes(action.id)||old.journey?.claimed.includes(action.id))return null;
  title='收好这一份相遇';items.push(chapter.keepsake);break;
 }
 case 'focusClaim':{
  if(!old.focus||g.focus||!increase(old.stats?.focus,g.stats?.focus))return null;
  const minutes=increase(old.stats?.minutes,g.stats?.minutes);
  if(!minutes)return null;
  title=`完成 ${minutes} 分钟专注`;break;
 }
 case 'todoToggle':{
  const previous=before.todos?.find(t=>t.id===action.id),todo=after.todos?.find(t=>t.id===action.id);
  if(!previous||previous.done||previous.rewarded||!todo?.done||!todo.rewarded)return null;
  title='又完成一件小事';break;
 }
 default:return null;
 }
 const coins=increase(old.coins,g.coins);
 if(coins)items.push(`荔枝币 +${coins}`);
 if(action.type==='gift'){
  const food=increase(old.food,g.food);
  if(food)items.push(`食物 +${food}`);
  for(const [crop,info] of Object.entries(CROPS)){
   const seeds=increase(old.seeds?.[crop],g.seeds?.[crop]);
   if(seeds)items.push(`${info.name}种子 +${seeds}`);
  }
 }
 let levelUp=false;
 const previous=old.pets?.[old.active],pet=g.pets?.[g.active];
 // A refreshed save may select another companion. Their XP is not a reward.
 if(old.active===g.active&&previous&&pet&&previous.species===pet.species){
  const xp=increase(previous.xp,pet.xp);
  if(xp){
   items.push(`${pet.name}成长 +${xp}`);
   levelUp=level(g)>level(old);
   if(levelUp)items.push(`${pet.name}升到 ${level(g)} 级`);
  }
 }
 return items.length?{title,items:items.slice(0,3),levelUp}:null;
}
