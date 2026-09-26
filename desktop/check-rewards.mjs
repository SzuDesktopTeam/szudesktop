import assert from 'node:assert/strict';
import {act,createState} from './assets/garden/engine.mjs';
import {actionReward} from './assets/garden/rewards.mjs';

const now=new Date(2026,8,26,12).getTime();
let checks=0;
function check(name,work){work();checks++;console.log('PASS',name)}
function apply(before,action,time=now){
 const snapshot=structuredClone(before),after=act(before,action,time);
 const reward=actionReward(before,after,action);
 assert.deepEqual(before,snapshot,'neither the engine nor reward presentation should mutate the input');
 return {after,reward};
}

check('harvest shows the actual crop yield and the active companion growth',()=>{
 const before=createState(now),action={type:'harvest',index:0};
 const {after,reward}=apply(before,action,now+60000);
 assert.deepEqual(reward,{title:'收获入仓',items:['小萝卜 +2','荔宝成长 +1'],levelUp:false});
 assert.equal(after.game.coins,before.game.coins);
 assert.throws(()=>act(after,action,now+60000),/没有成熟/);
 assert.equal(actionReward(after,after,action),null);
});
check('growth crossing a real level threshold celebrates once',()=>{
 const before=createState(now);before.game.pets[0].xp=49;
 const {reward}=apply(before,{type:'harvest',index:0},now+60000);
 assert.equal(reward.levelUp,true);
 assert.deepEqual(reward.items,['小萝卜 +2','荔宝成长 +1','荔宝升到 2 级']);
 before.game.pets[0].xp=999;
 assert.equal(apply(before,{type:'harvest',index:0},now+60000).reward.levelUp,false,'the maximum level must not keep triggering a level-up');
});
check('daily supplies report real inventory increases and cannot be claimed twice',()=>{
 const {after,reward}=apply(createState(now),{type:'gift'});
 assert.deepEqual(reward.items,['荔枝币 +20','食物 +1','小萝卜种子 +2']);
 assert.throws(()=>act(after,{type:'gift'},now),/领过/);
 assert.equal(actionReward(after,after,{type:'gift'}),null);
 const tomorrow=apply(after,{type:'gift'},now+86400000);
 assert.deepEqual(tomorrow.reward.items,reward.items,'the next day grants a new real supply');
});
check('focus rewards use the actual duration and cannot repeat',()=>{
 const start=act(createState(now),{type:'focusStart',minutes:5},now);
 assert.throws(()=>act(start,{type:'focusClaim'},now),/没结束/);
 assert.equal(actionReward(start,start,{type:'focusClaim'}),null);
 const {after,reward}=apply(start,{type:'focusClaim'},now+300000);
 assert.deepEqual(reward,{title:'完成 5 分钟专注',items:['荔枝币 +5','荔宝成长 +5'],levelUp:false});
 assert.throws(()=>act(after,{type:'focusClaim'},now+300000),/没结束/);
 assert.equal(actionReward(after,after,{type:'focusClaim'}),null);
});
check('daily goals and achievements only show their first successful payout',()=>{
 const harvested=act(createState(now),{type:'harvest',index:0},now+60000);
 for(const type of ['quest','achievement']){
  const action={type,id:'harvest'},{after,reward}=apply(harvested,action,now+60000);
  assert.deepEqual(reward.items,[`荔枝币 +${after.game.coins-harvested.game.coins}`]);
  assert.throws(()=>act(after,action,now+60000),/奖励已领取/);
  assert.equal(actionReward(after,after,action),null);
 }
});
check('a todo earns growth once even when undone and completed again',()=>{
 const added=act(createState(now),{type:'todoAdd',id:'one',text:'看完一节课'},now),action={type:'todoToggle',id:'one'};
 const first=apply(added,action);
 assert.deepEqual(first.reward.items,['荔宝成长 +2']);
 const undone=apply(first.after,action);assert.equal(undone.reward,null);
 const redone=apply(undone.after,action);assert.equal(redone.reward,null);
 assert.equal(redone.after.game.pets[0].xp,2);
});
check('switching to a more experienced companion is never growth or a level-up',()=>{
 const before=createState(now);before.game.pets[1].xp=200;
 const selected=apply(before,{type:'switchPet',index:1});
 assert.equal(selected.reward,null);
 const gifted=act(before,{type:'gift'},now);
 gifted.game.active=1;
 const reward=actionReward(before,gifted,{type:'gift'});
 assert.equal(reward.levelUp,false);assert.equal(reward.items.some(item=>/成长|升到/.test(item)),false);
 const harvested=apply(selected.after,{type:'harvest',index:0},now+60000);
 assert.deepEqual(harvested.reward.items,['小萝卜 +2','栗栗成长 +1']);
});
check('missing, failed, unchanged and unrelated actions have no reward',()=>{
 const state=createState(now);
 for(const action of [{type:'gift'},{type:'focusClaim'},{type:'quest',id:'harvest'},{type:'achievement',id:'harvest'},{type:'todoToggle',id:'missing'},{type:'harvest',index:0},{type:'rename',name:'荔荔'}]){
  assert.equal(actionReward(state,state,action),null);
  assert.equal(actionReward(state,null,action),null);
  assert.equal(actionReward(state,{error:'save failed'},action),null);
 }
 assert.equal(actionReward(null,state,{type:'gift'}),null);
 assert.equal(actionReward(state,state,null),null);
});
console.log(`Rewards: ${checks} checks passed`);
