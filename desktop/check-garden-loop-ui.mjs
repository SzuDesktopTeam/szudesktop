import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
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
check('garden images stay small enough to ship inside the exe',()=>{
 // Every garden image, in any subfolder, is embedded in the Go sidecar and the
 // installer. The painted courtyard is a 256-colour palette PNG (about 0.95 MB,
 // PSNR ≥ 35 dB against the 2.8 MB true-colour original); a new true-colour
 // drop or a large JPEG/WebP fails here. Re-encoding dropped the original's
 // C2PA content-credentials chunk (caBX), whose hash binding no longer held;
 // the image's origin is recorded in docs/STATUS.md.
 const dir=new URL('./assets/garden/',import.meta.url),root=fileURLToPath(dir),images=[];
 const walk=folder=>{for(const entry of readdirSync(join(root,folder),{withFileTypes:true})){const name=folder?folder+'/'+entry.name:entry.name;if(entry.isDirectory())walk(name);else if(/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(entry.name))images.push(name)}};
 walk('');
 assert.ok(images.includes('courtyard.png')&&images.includes('campus.png'),'the walk finds the garden images');
 for(const name of images){
  const image=readFileSync(join(root,name));
  assert.ok(image.length<=1024*1024,name+' is '+image.length+' bytes; quantize it or shrink it before shipping');
  if(/\.png$/i.test(name)&&image.length>256*1024)assert.equal(image[25],3,name+' should be a palette PNG');
 }
 const courtyard=readFileSync(new URL('courtyard.png',dir));
 assert.deepEqual([courtyard.readUInt32BE(16),courtyard.readUInt32BE(20)],[1536,1024],'the farm backdrop keeps its full width for cover scaling');
});
console.log(`${passed} garden loop UI checks passed`);
