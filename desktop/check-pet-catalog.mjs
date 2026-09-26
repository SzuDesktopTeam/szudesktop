import assert from 'node:assert/strict';
import {PETS,AVAILABLE_PETS,DEFAULT_PET,PET_LIMIT,PET_SPRITES,petDefinition,petSprite,petViewBox} from './assets/garden/pet-catalog.mjs';
import {createState,normalize,act,activePet} from './assets/garden/engine.mjs';
import {petSpriteFor} from './electron/pet-policy.mjs';

const now=new Date('2026-09-27T12:00:00').getTime();
let checks=0;
function test(name,run){run();checks++;console.log('PASS',name)}

test('the new roster has two distinct penguins and retains the retired turtle definition',()=>{
 assert.deepEqual(AVAILABLE_PETS,['libao','chestnut','egret','pingu','skipper']);
 assert.deepEqual(createState(now).game.pets.map(p=>p.species),AVAILABLE_PETS);
 assert.equal(DEFAULT_PET,'libao');assert.equal(PETS.turtle.available,false);
 assert.equal(PETS.pingu.name,'Pingu');assert.equal(PETS.skipper.name,'Skipper');
 assert.equal(PET_LIMIT,Math.max(8,Object.keys(PETS).length));
});

test('old four-pet saves append penguins without changing names, active indices, growth or daily care',()=>{
 const old=createState(now);
 const sample=old.game.pets[0];
 old.game.pets=['chestnut','turtle','libao','egret'].map((species,i)=>({...sample,species,name:'老朋友'+i,xp:37+i,bond:51+i,mood:44+i,say:'原来那句话'+i}));
 old.game.active=1;old.game.daily.pats=[1,3,2,1];
 const current=normalize(old,now);
 assert.deepEqual(current.game.pets.slice(0,4),old.game.pets);
 assert.deepEqual(current.game.pets.map(p=>p.species),['chestnut','turtle','libao','egret','pingu','skipper']);
 assert.equal(current.game.active,1);assert.equal(activePet(current.game).species,'turtle');
 assert.deepEqual(current.game.daily.pats,[1,3,2,1]);
 const pet=act(current,{type:'pat'},now).game.pets[1];
 assert.equal(pet.xp,old.game.pets[1].xp,'migration must not reset a used daily reward allowance');
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(current)),now),current,'a second reload must not append duplicate companions');
});

test('new saves and older partial saves do not automatically add the retired turtle',()=>{
 const partial=createState(now);partial.game.pets=partial.game.pets.slice(0,2);partial.game.active=1;
 const restored=normalize(partial,now);
 assert.deepEqual(restored.game.pets.map(p=>p.species),AVAILABLE_PETS);
 assert.equal(restored.game.active,1);
 assert.equal(restored.game.pets.some(p=>p.species==='turtle'),false);
});

test('full legacy saves retain all records even when there is no room for a new species',()=>{
 const old=createState(now),sample=old.game.pets[1];
 old.game.pets=Array.from({length:PET_LIMIT},(_,i)=>({...sample,name:'栗栗'+i,xp:i+10}));
 old.game.active=PET_LIMIT-1;old.game.daily.pats=Array(PET_LIMIT).fill(2);
 const current=normalize(old,now);
 assert.deepEqual(current.game.pets,old.game.pets);
 assert.equal(current.game.active,PET_LIMIT-1);assert.deepEqual(current.game.daily.pats,old.game.daily.pats);
});

test('both penguins earn their own care and keep progress through switching and reload',()=>{
 let state=createState(now);
 for(const species of ['pingu','skipper']){
  const index=state.game.pets.findIndex(p=>p.species===species);
  state=act(state,{type:'switchPet',index},now);
  assert.equal(activePet(state.game).xp,0);
  state=act(state,{type:'pat'},now);
  assert.equal(activePet(state.game).xp,2);assert.equal(state.game.daily.pats[index],1);
  state=act(state,{type:'feed'},now);assert.equal(activePet(state.game).xp,10);
  state=normalize(JSON.parse(JSON.stringify(state)),now);
  assert.equal(activePet(state.game).species,species);assert.equal(activePet(state.game).xp,10);
  assert.throws(()=>act(state,{type:'pat'},now),/10 秒/);
 }
 assert.equal(state.game.pets.find(p=>p.species==='pingu').xp,10);
 assert.equal(state.game.pets[0].xp,0);
});

test('switching to an awake companion uses its greeting library while sleeping companions stay asleep',()=>{
 let state=createState(now);
 for(let index=1;index<state.game.pets.length;index++){
  state=act(state,{type:'switchPet',index},now);
  const pet=activePet(state.game);
  assert.ok(PETS[pet.species].lines.greet.includes(pet.say));assert.equal(pet.saidAt,now);
 }
 state.game.pets[0].sleeping=true;
 state=act(state,{type:'switchPet',index:0},now);
 assert.equal(activePet(state.game).sleeping,true);
 assert.ok(PETS[activePet(state.game).species].lines.sleep.includes(activePet(state.game).say));
});

test('catalog entries supply complete short dialogue for all care and reward actions',()=>{
 for(const [species,spec] of Object.entries(PETS)){
  assert.ok(spec.name&&spec.description&&spec.greeting,species);
  for(const action of ['pat','feed','play','sleep','wake','focus','harvest']){
   const lines=spec.lines[action];
   assert.ok(lines.length>=6,species+' '+action);
   assert.ok(lines.every(line=>typeof line==='string'&&line.length>0&&line.length<=60),species+' '+action);
   assert.equal(new Set(lines).size,lines.length,species+' '+action);
  }
 }
});

test('desktop and garden share every species state and viewBox, including the retired turtle',()=>{
 for(const [species,spec] of Object.entries(PETS)){
  for(const [mood,sleeping,state] of [[34,false,'sad'],[35,false,'normal'],[65,false,'normal'],[66,false,'happy'],[90,true,'sleep']]){
   const pet={species,mood,sleeping},sprite=petSprite(pet);
   assert.equal(sprite,`${spec.sprite}-${state}`);assert.equal(petSpriteFor(pet),sprite);
   assert.equal(PET_SPRITES[sprite],spec.viewBox);assert.equal(petViewBox(pet),spec.viewBox);
  }
 }
 assert.equal(petViewBox('chestnut'),'0 0 20 22');
 assert.equal(petViewBox('pingu'),'0 0 32 40');assert.equal(petViewBox('skipper'),'0 0 32 40');
 for(const id of ['constructor','toString','__proto__','unknown'])assert.equal(petDefinition(id),PETS[DEFAULT_PET]);
});

console.log(`${checks} pet catalog checks passed`);
