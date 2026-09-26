import assert from 'node:assert/strict';
import {act,createState,settle,normalize,activePet,dayKey} from './assets/garden/engine.mjs';
import {PET_DIALOGUE} from './assets/garden/pet-dialogue.mjs';

const now=new Date(2026,8,27,12).getTime();
const fresh=()=>settle(createState(now),now);
const lineIs=(pet,context)=>assert.ok(PET_DIALOGUE[pet.species][context].includes(pet.say),`${pet.species} should use ${context} dialogue`);
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name)}

check('plant and water tell their own story without changing the economy',()=>{
 let state=fresh();state.game.plots[1]=null;
 const before=structuredClone(state.game),pet=activePet(before);
 state=act(state,{type:'plant',index:1,crop:'radish'},now);
 lineIs(activePet(state.game),'plant');
 state=act(state,{type:'water',index:1},now);
 lineIs(activePet(state.game),'water');
 assert.equal(state.game.coins,before.coins);
 assert.equal(activePet(state.game).xp,pet.xp);
 assert.equal(activePet(state.game).bond,pet.bond);
 assert.equal(state.game.seeds.radish,before.seeds.radish-1);
 assert.equal(state.game.plots[1].ready,now+45000);
 const restored=normalize(JSON.parse(JSON.stringify(state)),now);
 assert.equal(activePet(restored.game).dialogue.plant,1);
 assert.equal(activePet(restored.game).dialogue.water,1);
 const snapshot=structuredClone(state);
 assert.throws(()=>act(state,{type:'water',index:1},now),/浇过水/);
 assert.deepEqual(state,snapshot,'failed actions do not consume the next line');
});

check('free signature interaction rotates after a reload without farming rewards',()=>{
 let state=fresh();state.game.active=state.game.pets.findIndex(p=>p.species==='pingu');
 const before=structuredClone(state.game),heard=[];
 for(let i=0;i<12;i++){
  state=act(normalize(JSON.parse(JSON.stringify(state)),now),{type:'petSignature'},now);
  lineIs(activePet(state.game),'signature');heard.push(activePet(state.game).say);
 }
 assert.equal(new Set(heard).size,12);
 for(const key of ['coins','food','seeds','stock','daily','stats'])assert.deepEqual(state.game[key],before[key]);
 for(const key of ['xp','bond','hunger','energy','mood'])assert.equal(activePet(state.game)[key],activePet(before)[key]);
 assert.equal(activePet(state.game).dialogue.signature,12);
});

check('signature respects sleep and ongoing focus without advancing dialogue',()=>{
 let state=fresh();activePet(state.game).sleeping=true;
 assert.throws(()=>act(state,{type:'petSignature'},now),/睡觉/);
 assert.equal(activePet(state.game).dialogue.signature,undefined);
 activePet(state.game).sleeping=false;
 state=act(state,{type:'focusStart',minutes:5},now);lineIs(activePet(state.game),'focusStart');
 assert.throws(()=>act(state,{type:'petSignature'},now+1000),/专注/);
 state=act(state,{type:'petSignature'},now+300000);lineIs(activePet(state.game),'signature');
});

check('an order gives a thank-you to its real recipient, preserving the active companion',()=>{
 const before=fresh(),current=activePet(before.game),order=before.game.orders.offers.find(o=>o.pet!==current.species);
 for(const [crop,n] of Object.entries(order.needs))before.game.stock[crop]=n;
 const after=act(before,{type:'orderDeliver',id:order.id},now),recipient=after.game.pets.find(p=>p.species===order.pet);
 lineIs(recipient,'order');assert.equal(recipient.dialogue.order,1);
 assert.equal(after.game.active,before.game.active);
 assert.equal(activePet(after.game).say,current.say);
 assert.equal(activePet(after.game).dialogue.order,undefined);
});

check('construction and supply dialogue only accompany successful inventory changes',()=>{
 let state=fresh();state.game.stats.harvest=3;state.game.coins=100;state.game.stock.radish=4;state.game.stock.strawberry=2;
 state=act(state,{type:'decor',id:'picnic'},now);lineIs(activePet(state.game),'build');
 const line=activePet(state.game).say;
 state=act(state,{type:'decor',id:'picnic'},now);
 assert.equal(activePet(state.game).say,line);assert.equal(activePet(state.game).dialogue.build,1);
 state=act(state,{type:'gift'},now);lineIs(activePet(state.game),'supply');
 assert.equal(activePet(state.game).dialogue.supply,1);
 state.game.puzzle.qualifiedDay=dayKey(now);
 state=act(state,{type:'puzzleClaim'},now);lineIs(activePet(state.game),'supply');
 assert.equal(activePet(state.game).dialogue.supply,2);
 assert.throws(()=>act(state,{type:'puzzleClaim'},now),/已经领取/);
});

console.log(`${checks} companion life integration checks passed.`);
