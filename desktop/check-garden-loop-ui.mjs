import assert from 'node:assert/strict';
import {createState} from './assets/garden/engine.mjs';
import {PROJECTS} from './assets/garden/garden-loop.mjs';
import {projectView,projectStrip,projectScene} from './assets/garden/garden-loop-ui.mjs';
import {PET_ACTIONS} from './assets/garden/pet-animation.mjs';
import {petDetails} from './assets/garden/pet-details.mjs';

let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS',name);};
const fresh=()=>createState(Date.now()).game;
check('missing project materials route to the first actual shortage',()=>{
 const game=fresh();game.stock.radish=4;
 const html=projectView(game);
 assert.match(html,/id="garden-projects"/);
 assert.match(html,/data-action="gardenRoute" data-tab="farm" data-crop="strawberry"/);
 assert.doesNotMatch(html,/小萝卜还差 0/);
});
check('complete materials lead to the remaining requirement or coins, never more planting',()=>{
 const game=fresh();Object.assign(game.stock,PROJECTS.picnic.needs);game.coins=60;
 assert.match(projectView(game),/去农田收获/);
 assert.doesNotMatch(projectView(game),/data-crop=/);
 game.stats.harvest=3;game.coins=12;
 assert.match(projectView(game),/交付委托 · 还差 48 币/);
 game.coins=60;
 assert.match(projectView(game),/data-action="decor" data-id="picnic" class="primary"/);
});
check('owned construction can be placed away and returns to the same scene',()=>{
 const game=fresh();game.decor.push('picnic');game.equipped.push('picnic');
 const snapshot=JSON.stringify(game);
 for(const surface of ['farm','room','home']){
  const html=projectScene(game,{surface});
  assert.match(html,new RegExp('garden-built-scene--'+surface));
  assert.match(html,/湖畔野餐角/);assert.match(html,/garden-built-piece--picnic/);
  assert.doesNotMatch(html,/garden-built-piece--seedrack/);
 }
 assert.equal(JSON.stringify(game),snapshot);
 game.equipped=[];assert.equal(projectScene(game), '');
 assert.match(projectView(game),/摆回庭院/);
});
check('a locked crop leads to companion growth rather than an impossible planting task',()=>{
 const game=fresh();game.decor.push('picnic');game.stock.strawberry=4;
 assert.match(projectView(game),/data-action="navigate" data-page="study" data-tab="focus"/);
 assert.match(projectStrip(game),/蓝莓待解锁 · Lv\.2/);
 game.gardenLevel=2;
 assert.match(projectView(game),/data-action="gardenRoute" data-tab="farm" data-crop="blueberry"/);
});
check('the compact strip has one quiet overview link without competing planting or building actions',()=>{
 const game=fresh();
 for(const ready of [false,true]){
  if(ready){Object.assign(game.stock,PROJECTS.picnic.needs);game.coins=60;game.stats.harvest=3;}
  const html=projectStrip(game);
  assert.equal((html.match(/<button/g)||[]).length,1);
  assert.match(html,/class="quiet" data-action="gardenRoute" data-tab="journal" data-anchor="garden-projects">看看建设 →/);
  assert.doesNotMatch(html,/data-crop=|data-action="decor"|data-page="study"/);
 }
});
check('completed projects have a finished view and no empty preparation strip',()=>{
 const game=fresh();game.decor=Object.keys(PROJECTS);game.equipped=[...game.decor];
 assert.equal(projectStrip(game),'');
 assert.match(projectView(game),/庭院已经有你的样子/);
 assert.match(projectScene(game),/garden-built-piece--lakeLights/);
});
check('pet actions remain playable while frame timing is tucked inside another disclosure',()=>{
 const pet=fresh().pets[0],html=petDetails(pet);
 assert.equal((html.match(/data-action="petPreview"/g)||[]).length,PET_ACTIONS.length);
 assert.match(html,/<details class="pet-frame-details"><summary>细看/);
 assert.doesNotMatch(html,/一起玩 2048/);
});
console.log(`${passed} garden loop UI checks passed`);
