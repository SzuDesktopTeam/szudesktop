import assert from 'node:assert/strict';
import {act,createState,normalize,settle,dayKey,CROPS,DECOR} from './assets/garden/engine.mjs';
import {PROJECTS,projectStatus,nextProject,reservedStock,sellableStock,puzzleSupply} from './assets/garden/garden-loop.mjs';

const now=new Date(2026,8,27,12).getTime(),day=dayKey(now);
const roundTrip=(state,time=now)=>normalize(JSON.parse(JSON.stringify(state)),time);
const fresh=()=>settle(createState(now),now);
let checks=0;
function test(name,work){work();checks++;console.log('PASS',name)}

test('old saves gain no invented claims or construction, while existing possessions remain',()=>{
 const old=fresh();delete old.game.puzzle.supplyClaim;
 old.game.decor=['flower'];old.game.equipped=['flower'];old.game.coins=77;
 const restored=roundTrip(old);
 assert.equal(restored.game.puzzle.supplyClaim,null);
 assert.deepEqual(restored.game.decor,['flower']);assert.deepEqual(restored.game.equipped,['flower']);
 assert.equal(restored.game.coins,77);assert.equal(nextProject(restored.game).id,'picnic');
 assert.deepEqual(roundTrip(restored),restored);
 assert.deepEqual(Object.values(DECOR).map(item=>item.price),[35,60,90]);
});

test('project status explains the real requirement, material and money shortfall',()=>{
 const game=fresh().game;game.stats.harvest=2;game.stock.radish=3;game.stock.strawberry=2;game.coins=50;
 let status=projectStatus(game,'picnic');
 assert.equal(status.requirementProgress,2);assert.equal(status.unlocked,false);assert.equal(status.ready,false);
 assert.deepEqual(status.missing,[{crop:'radish',need:4,have:3,missing:1},{crop:'strawberry',need:2,have:2,missing:0}]);
 assert.equal(status.coinShort,10);
 game.stats.harvest=3;game.stock.radish=4;game.coins=60;status=projectStatus(game,'picnic');
 assert.equal(status.unlocked,true);assert.equal(status.ready,true);
});

test('all three projects consume their quoted materials once and keep ownership across days',()=>{
 let state=fresh();state.game.stats.harvest=3;state.game.orders.total=8;state.game.coins=1000;
 for(const crop of Object.keys(CROPS))state.game.stock[crop]=100;
 for(const project of Object.values(PROJECTS)){
  const before=structuredClone(state.game);
  state=act(state,{type:'decor',id:project.id},now);
  assert.equal(state.game.coins,before.coins-project.price);
  for(const crop of Object.keys(CROPS))assert.equal(state.game.stock[crop],before.stock[crop]-(project.needs[crop]||0));
  assert.ok(state.game.decor.includes(project.id));assert.ok(state.game.equipped.includes(project.id));
  const owned=structuredClone(state.game);
  state=act(roundTrip(state),{type:'decor',id:project.id},now);
  assert.ok(!state.game.equipped.includes(project.id));assert.equal(state.game.coins,owned.coins);assert.deepEqual(state.game.stock,owned.stock);
  state=act(roundTrip(state),{type:'decor',id:project.id},now);
  assert.ok(state.game.equipped.includes(project.id));assert.equal(state.game.coins,owned.coins);assert.deepEqual(state.game.stock,owned.stock);
 }
 assert.equal(nextProject(state.game),null);
 const tomorrow=roundTrip(state,now+86400000);
 assert.deepEqual(tomorrow.game.decor,Object.keys(PROJECTS));assert.deepEqual(tomorrow.game.equipped,Object.keys(PROJECTS));
 assert.equal(projectStatus(tomorrow.game,'lakeLights').owned,true);assert.equal(projectStatus(tomorrow.game,'lakeLights').ready,false);
});

test('unmet project conditions, missing crops or money never partially spend the save',()=>{
 const state=fresh();state.game.coins=60;state.game.stock.radish=4;state.game.stock.strawberry=2;
 for(const [prepare,message] of [
  [()=>{state.game.stats.harvest=2},/累计收获/],
  [()=>{state.game.stats.harvest=3;state.game.stock.radish=3},/材料/],
  [()=>{state.game.stock.radish=4;state.game.coins=59},/荔枝币/],
 ]){
  prepare();const before=structuredClone(state);
  assert.throws(()=>act(state,{type:'decor',id:'picnic'},now),message);assert.deepEqual(state,before);
 }
 state.game.coins=1000;state.game.stock.strawberry=10;state.game.stock.blueberry=10;
 assert.throws(()=>act(state,{type:'decor',id:'seedrack'},now),/完成 3 份/);
});

test('surplus sale reserves cumulative open orders plus the next construction goal',()=>{
 let state=fresh();const game=state.game;
 game.orders.offers[0].needs={radish:2};game.orders.offers[1].needs={radish:2};game.orders.offers[2].needs={strawberry:1};
 game.stock.radish=15;game.stock.strawberry=3;
 assert.deepEqual(reservedStock(game),{radish:8,strawberry:3,blueberry:0,lychee:0});
 assert.equal(sellableStock(game,'radish'),7);assert.equal(sellableStock(game,'strawberry'),0);
 const coins=game.coins;state=act(state,{type:'sellSurplus',crop:'radish'},now);
 assert.equal(state.game.stock.radish,8);assert.equal(state.game.coins,coins+7*CROPS.radish.sell);
 assert.throws(()=>act(state,{type:'sellSurplus',crop:'radish'},now),/没有多余/);
 state=act(state,{type:'orderDeliver',id:state.game.orders.offers[0].id},now);
 assert.equal(reservedStock(state.game).radish,6);assert.equal(state.game.stock.radish,6);
 state.game.stats.harvest=3;state.game.coins=100;
 state=act(state,{type:'decor',id:'picnic'},now);
 assert.deepEqual(reservedStock(state.game),{radish:2,strawberry:5,blueberry:3,lychee:0});
 assert.equal(state.game.stock.radish,2);
 // The explicit old sell action remains compatible with existing integrations.
 state=act(state,{type:'sell',crop:'radish'},now);assert.equal(state.game.stock.radish,0);
});

test('daily rollover replaces order reservations without losing the next project',()=>{
 let state=fresh();state.game.orders.completed=state.game.orders.offers.map(order=>order.id);state.game.orders.total=3;
 assert.deepEqual(reservedStock(state.game),{radish:4,strawberry:2,blueberry:0,lychee:0});
 state=roundTrip(state,now+86400000);
 const expected={radish:4,strawberry:2,blueberry:0,lychee:0};
 for(const order of state.game.orders.offers)for(const [crop,count] of Object.entries(order.needs))expected[crop]+=count;
 assert.deepEqual(reservedStock(state.game),expected);assert.equal(state.game.orders.completed.length,0);
});

test('supply targets genuine shortages after counting seeds and planted yields',()=>{
 const game=fresh().game;game.seeds={radish:1,strawberry:1,blueberry:0,lychee:0};game.plots[0].crop='radish';
 game.orders.offers=[{id:'r1',needs:{radish:2},title:'第一篮'},{id:'r2',needs:{radish:2},title:'第二篮'},{id:'s',needs:{strawberry:2},title:'莓果篮'}];
 // Two radish requests are covered by one seed and one planted crop; the
 // additional picnic radishes still need another seed.
 assert.deepEqual(puzzleSupply(game),{crop:'radish',quantity:1,reason:'为下一项庭院建设准备种子',target:'湖畔野餐角'});
 game.seeds.radish=3;assert.equal(puzzleSupply(game).crop,'strawberry');
 game.seeds.strawberry=2;assert.equal(puzzleSupply(game).target,'下一轮播种');
 game.seeds.radish=1;game.orders.offers[1].needs={radish:3};assert.equal(puzzleSupply(game).target,'第二篮');
});

test('supply never unlocks a higher crop early and includes the full planted yield',()=>{
 const game=fresh().game;game.decor=['picnic','seedrack','lakeLights'];game.seeds={radish:0,strawberry:0,blueberry:0,lychee:0};game.plots=Array(6).fill(null);
 game.orders.offers=[{id:'b',needs:{blueberry:2},title:'蓝莓篮'}];
 assert.equal(puzzleSupply(game).crop,'radish');
 game.gardenLevel=2;assert.equal(puzzleSupply(game).crop,'blueberry');
 for(const [crop,info] of Object.entries(CROPS)){
  game.gardenLevel=info.level;game.orders.offers=[{id:crop,needs:{[crop]:info.yield},title:crop}];
  game.plots=[{crop},null,null,null,null,null];
  assert.equal(puzzleSupply(game).target,'下一轮播种',crop+' planned yield must match CROPS');
  game.orders.offers[0].needs[crop]++;assert.equal(puzzleSupply(game).target,crop);
 }
});

test('daily seed claim survives reload, undo and restart without multiplying rewards',()=>{
 let state=fresh();state.game.puzzle.board=[64,64,...Array(14).fill(0)];
 state=act(state,{type:'puzzleMove',direction:'left'},now);
 const supply=puzzleSupply(state.game),before=structuredClone(state.game);
 state=act(state,{type:'puzzleClaim'},now);
 const claim={day,crop:supply.crop,quantity:1};
 assert.deepEqual(state.game.puzzle.supplyClaim,claim);
 assert.equal(state.game.seeds[supply.crop],before.seeds[supply.crop]+1);
 assert.equal(state.game.coins,before.coins+8);assert.equal(state.game.pets[state.game.active].bond,before.pets[before.active].bond+2);
 assert.equal(state.game.pets[state.game.active].xp,before.pets[before.active].xp+3);
 assert.equal(state.game.pets[state.game.active].mood,Math.min(100,before.pets[before.active].mood+10));
 assert.equal(state.game.daily.care,before.daily.care+1);
 for(const action of [{type:'puzzleUndo'},{type:'puzzleMove',direction:'left'},{type:'puzzleRestart'}]){
  state=roundTrip(act(roundTrip(state),action,now));
  assert.deepEqual(state.game.puzzle.supplyClaim,claim);
  assert.equal(state.game.seeds[supply.crop],before.seeds[supply.crop]+1);
  assert.equal(state.game.pets[state.game.active].xp,before.pets[before.active].xp+3);
  assert.equal(state.game.pets[state.game.active].bond,before.pets[before.active].bond+2);
  assert.equal(state.game.daily.care,before.daily.care+1);
  assert.throws(()=>act(state,{type:'puzzleClaim'},now),/已经领取/);
 }
 const tomorrow=now+86400000;state=roundTrip(state,tomorrow);
 assert.deepEqual(state.game.puzzle.supplyClaim,claim,'last actual receipt stays visible until a new claim');
 assert.throws(()=>act(state,{type:'puzzleClaim'},tomorrow),/今天合成/);
 state.game.puzzle.board=[64,64,...Array(14).fill(0)];state.game.puzzle.over=false;
 state=act(state,{type:'puzzleMove',direction:'left'},tomorrow);
 const nextSupply=puzzleSupply(state.game),nextSeeds=state.game.seeds[nextSupply.crop];
 state=act(state,{type:'puzzleClaim'},tomorrow);
 assert.deepEqual(state.game.puzzle.supplyClaim,{day:dayKey(tomorrow),crop:nextSupply.crop,quantity:1});
 assert.equal(state.game.seeds[nextSupply.crop],nextSeeds+1);
});

test('order thanks and growth go to the named recipient without switching the active companion',()=>{
 let state=fresh();const order=state.game.orders.offers.find(order=>order.pet!==state.game.pets[state.game.active].species);
 for(const [crop,count] of Object.entries(order.needs))state.game.stock[crop]=count;
 const recipientIndex=state.game.pets.findIndex(pet=>pet.species===order.pet),before=structuredClone(state.game);
 state=act(state,{type:'orderDeliver',id:order.id},now);
 assert.equal(state.game.active,before.active);
 assert.equal(state.game.pets[recipientIndex].xp,before.pets[recipientIndex].xp+5);
 assert.equal(state.game.pets[recipientIndex].bond,before.pets[recipientIndex].bond+3);
 assert.equal(state.game.pets[recipientIndex].dialogue.harvest,1);
 assert.deepEqual(state.game.pets[state.game.active],before.pets[before.active]);
 assert.deepEqual(roundTrip(state).game.pets,state.game.pets);
 assert.throws(()=>act(state,{type:'orderDeliver',id:order.id},now),/已经交付/);
});

console.log(`\n${checks} garden loop checks passed.`);
