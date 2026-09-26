import assert from 'node:assert/strict';
import {act,createState,normalize,settle,dayKey} from './assets/garden/engine.mjs';

const now=new Date(2026,8,27,12).getTime(),day=dayKey(now);
const roundTrip=(state,time=now)=>normalize(JSON.parse(JSON.stringify(state)),time);
const fixture=(values,time=now)=>{
 const state=createState(time);
 state.game.puzzle.board=[...values,...Array(16-values.length).fill(0)];
 return state;
};
let checks=0;
function test(name,work){work();checks++;console.log('PASS',name)}

test('schema 3 saves gain a playable board, frozen orders and independent dialogue cursors',()=>{
 const old=createState(now);delete old.game.puzzle;delete old.game.orders;
 old.game.pets.forEach(p=>delete p.dialogue);
 old.game.coins=73;old.game.stock.radish=5;old.game.active=1;old.game.pets[1].name='老朋友';
 const state=roundTrip(old);
 assert.equal(state.schema,3);assert.equal(state.game.puzzle.board.filter(Boolean).length,2);
 assert.equal(state.game.orders.offers.length,3);assert.equal(state.game.orders.day,day);
 assert.equal(state.game.coins,73);assert.equal(state.game.stock.radish,5);
 assert.equal(state.game.active,1);assert.equal(state.game.pets[1].name,'老朋友');
 assert.ok(state.game.pets.every(p=>Object.keys(p.dialogue).length===0));
 assert.deepEqual(roundTrip(state),state);
});

test('engine moves save the exact board and PRNG, and an ineffective move stays ineffective',()=>{
 const before=fixture([2,2]),after=act(before,{type:'puzzleMove',direction:'left'},now);
 assert.equal(before.game.puzzle.moves,0);assert.equal(after.game.puzzle.moves,1);
 assert.equal(after.game.puzzle.score,4);assert.equal(after.game.puzzle.undo.board[1],2);
 const restored=roundTrip(after);
 assert.deepEqual(restored.game.puzzle,after.game.puzzle);
 const next={type:'puzzleMove',direction:'down'};
 assert.deepEqual(act(restored,next,now).game.puzzle,act(after,next,now).game.puzzle);
 const still=fixture([2]);
 assert.deepEqual(act(still,{type:'puzzleMove',direction:'left'},now).game.puzzle,still.game.puzzle);
});

test('a saved high tile from yesterday does not qualify for today without a fresh 128 merge',()=>{
 let state=fixture([128,0,64,64],now-86400000);
 state.game.puzzle.qualifiedDay=dayKey(now-86400000);state.game.puzzle.earnedDay=dayKey(now-86400000);
 state=roundTrip(state);
 assert.throws(()=>act(state,{type:'puzzleClaim'},now),/今天合成/);
 state=act(state,{type:'puzzleMove',direction:'right'},now);
 assert.equal(state.game.puzzle.qualifiedDay,day);
 assert.equal(state.game.puzzle.earnedDay,dayKey(now-86400000));
 const coins=state.game.coins;
 state=act(state,{type:'puzzleClaim'},now);
 assert.equal(state.game.coins,coins+8);assert.equal(state.game.puzzle.earnedDay,day);
});

test('claim survives reload, undo and restart without awarding duplicate currency or bond',()=>{
 let state=act(fixture([64,64]),{type:'puzzleMove',direction:'left'},now);
 const coins=state.game.coins,bond=state.game.pets[0].bond;
 state=act(state,{type:'puzzleClaim'},now);
 assert.equal(state.game.coins,coins+8);assert.equal(state.game.pets[0].bond,bond+2);
 for(const action of [{type:'puzzleUndo'},{type:'puzzleMove',direction:'left'},{type:'puzzleRestart'}]){
  state=roundTrip(act(roundTrip(state),action,now));
  assert.equal(state.game.puzzle.earnedDay,day);assert.equal(state.game.puzzle.qualifiedDay,day);
  assert.throws(()=>act(state,{type:'puzzleClaim'},now),/已经领取/);
  assert.equal(state.game.coins,coins+8);assert.equal(state.game.pets[0].bond,bond+2);
 }
});

test('undo before claiming preserves the earned opportunity, without creating a second one',()=>{
 let state=act(fixture([64,64]),{type:'puzzleMove',direction:'left'},now);
 state=act(state,{type:'puzzleUndo'},now);
 assert.equal(Math.max(...state.game.puzzle.board),64);assert.equal(state.game.puzzle.qualifiedDay,day);
 state=act(roundTrip(state),{type:'puzzleClaim'},now);
 assert.equal(state.game.coins,48);
 state=act(state,{type:'puzzleMove',direction:'left'},now);
 assert.throws(()=>act(state,{type:'puzzleClaim'},now),/已经领取/);
});

test('chat rotates after reopening and each companion owns its dialogue progress',()=>{
 let state=act(createState(now),{type:'chat'},now);
 const first=state.game.pets[0].say;
 assert.equal(state.game.pets[0].dialogue.idle,1);
 state=act(roundTrip(state),{type:'chat'},now);
 assert.notEqual(state.game.pets[0].say,first);assert.equal(state.game.pets[0].dialogue.idle,2);
 state=act(state,{type:'switchPet',index:1},now);
 state=act(roundTrip(state),{type:'chat'},now);
 assert.equal(state.game.pets[1].dialogue.idle,1);assert.equal(state.game.pets[0].dialogue.idle,2);
 state=act(state,{type:'switchPet',index:0},now);
 const before=state.game.coins;
 state=act(roundTrip(state),{type:'chat'},now);
 assert.equal(state.game.pets[0].dialogue.idle,3);assert.equal(state.game.pets[1].dialogue.idle,1);
 assert.equal(state.game.coins,before,'conversation does not create a reward loop');
});

test('harvest, order delivery and keepsakes use existing inventory and survive reopening',()=>{
 const time=now+60000;
 let state=act(createState(now),{type:'harvest',index:0},time);
 const order=state.game.orders.offers[0],coins=state.game.coins;
 assert.deepEqual(order.needs,{radish:2});assert.equal(state.game.stock.radish,2);
 state=act(state,{type:'orderDeliver',id:order.id},time);
 assert.equal(state.game.stock.radish,0);assert.equal(state.game.coins,coins+order.coins);
 assert.equal(state.game.orders.total,1);assert.deepEqual(state.game.orders.keepsakes,['first-basket']);
 const restored=roundTrip(state,time);
 assert.deepEqual(restored.game.orders,state.game.orders);assert.equal(restored.game.coins,state.game.coins);
 assert.throws(()=>act(restored,{type:'orderDeliver',id:order.id},time),/已经交付/);
 const tomorrow=roundTrip(restored,now+86400000);
 assert.equal(tomorrow.game.orders.completed.length,0);assert.equal(tomorrow.game.orders.total,1);
 assert.deepEqual(tomorrow.game.orders.keepsakes,['first-basket']);
 assert.throws(()=>act(tomorrow,{type:'orderDeliver',id:order.id},now+86400000),/没有找到/);
});

test('failed order delivery and invalid puzzle commands do not mutate the caller save',()=>{
 const state=settle(createState(now),now),copy=structuredClone(state),id=state.game.orders.offers[0].id;
 assert.throws(()=>act(state,{type:'orderDeliver',id},now),/还不够/);
 assert.throws(()=>act(state,{type:'puzzleMove',direction:'diagonal'},now),/有效的移动方向/);
 assert.throws(()=>act(state,{type:'puzzleClaim'},now),/今天合成/);
 assert.deepEqual(state,copy);
});

console.log(`\n${checks} garden arcade integration checks passed.`);
