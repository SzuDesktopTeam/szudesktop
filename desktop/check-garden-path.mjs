import assert from 'node:assert/strict';
import {act,createState,settle,CROPS} from './assets/garden/engine.mjs';
import {PROJECTS} from './assets/garden/garden-loop.mjs';
import {gardenNextStep,cropPurpose} from './assets/garden/garden-path.mjs';
import {actionReward} from './assets/garden/rewards.mjs';

const now=new Date(2026,8,27,12).getTime();
const fresh=()=>settle(createState(now),now);
function quiet(){const state=fresh();state.game.plots=Array(6).fill(null);state.game.orders.completed=state.game.orders.offers.map(order=>order.id);return state}
function oneOrder(state,crop='radish',quantity=2){
 const order=state.game.orders.offers[0];order.needs={[crop]:quantity};state.game.orders.completed=state.game.orders.offers.slice(1).map(order=>order.id);return order;
}
const isFocus=step=>{assert.equal(step.action,'navigate');assert.equal(step.page,'study');assert.equal(step.tab,'focus')};
let checks=0;
function test(name,work){work();checks++;console.log('PASS',name)}

test('an active focus always wins over ripe plants and ready rewards without interrupting it',()=>{
 const state=act(fresh(),{type:'focusStart',minutes:25},now);
 let step=gardenNextStep(state,now+60000);isFocus(step);assert.equal(step.label,'回到专注');
 assert.match(step.detail,/不会枯萎/);
 step=gardenNextStep(state,now+25*60000);isFocus(step);assert.equal(step.label,'领取专注收获');
 assert.ok(state.game.focus,'the helper is a read-only recommendation');
});

test('a ripe crop routes to its actual plot and explains its destination',()=>{
 const state=fresh(),before=structuredClone(state),step=gardenNextStep(state,now+60000);
 assert.equal(step.action,'gardenRoute');assert.equal(step.tab,'farm');assert.equal(step.index,0);assert.equal(step.crop,'radish');
 assert.match(step.title,/可以收/);assert.match(step.detail,/委托|野餐角/);assert.deepEqual(state,before);
});

test('already planted demand is allowed to grow instead of asking for duplicate seeds',()=>{
 const state=quiet();oneOrder(state);state.game.decor=Object.keys(PROJECTS);
 state.game.plots[2]={crop:'radish',planted:now,ready:now+60000,watered:true};
 state.game.seeds.radish=0;state.game.coins=0;state.game.daily.gift=true;
 const step=gardenNextStep(state,now);isFocus(step);assert.match(step.title,/正在长/);assert.notEqual(step.action,'gift');
});

test('ready orders link to the correct recipient before asking for more planting',()=>{
 const state=quiet(),order=oneOrder(state,'strawberry');state.game.stock.strawberry=2;
 const step=gardenNextStep(state,now);
 assert.equal(step.tab,'market');assert.equal(step.order,order.id);assert.equal(step.label,'交付给伙伴');
 assert.match(step.detail,new RegExp(order.title));
});

test('a ready construction points to the construction section, using actual quoted materials',()=>{
 const state=quiet();state.game.stats.harvest=3;state.game.coins=60;state.game.stock.radish=4;state.game.stock.strawberry=2;
 const step=gardenNextStep(state,now);
 assert.equal(step.tab,'journal');assert.equal(step.anchor,'garden-projects');assert.match(step.title,/湖畔野餐角/);
});

test('an affordable seed shortage goes to the shop with the requested crop',()=>{
 const state=quiet();oneOrder(state,'strawberry');state.game.seeds.strawberry=0;state.game.coins=12;
 const step=gardenNextStep(state,now);
 assert.equal(step.tab,'market');assert.equal(step.anchor,'seed-shop');assert.equal(step.crop,'strawberry');
});

test('zero coins and no seed lead to the unclaimed gift or a payable focus, never an empty farm dead end',()=>{
 const state=quiet();oneOrder(state,'strawberry');state.game.seeds.strawberry=0;state.game.coins=0;
 let step=gardenNextStep(state,now);assert.equal(step.action,'gift');
 state.game.daily.gift=true;step=gardenNextStep(state,now);isFocus(step);
 assert.match(step.title,/草莓/);assert.match(step.detail,/还差 12 币/);
});

test('a locked crop leads to growth instead of an unusable seed purchase or planting button',()=>{
 const state=quiet();state.game.decor=['picnic'];state.game.orders.total=3;state.game.stock.strawberry=4;
 state.game.seeds={radish:0,strawberry:0,blueberry:0,lychee:0};state.game.gardenLevel=1;state.game.coins=500;
 const step=gardenNextStep(state,now);isFocus(step);assert.match(step.title,/蓝莓/);assert.match(step.detail,/Lv\.2/);
 assert.notEqual(step.anchor,'seed-shop');
});

test('purpose totals pending requests and stops advertising completed requests',()=>{
 const state=quiet();const a=state.game.orders.offers[0],b=state.game.orders.offers[1];
 a.needs={radish:2};b.needs={radish:3};state.game.orders.completed=[state.game.orders.offers[2].id];
 let purpose=cropPurpose(state.game,'radish');assert.match(purpose,/需要 5 个/);assert.match(purpose,/野餐角需要 4 个/);
 state.game.orders.completed.push(a.id,b.id);purpose=cropPurpose(state.game,'radish');assert.doesNotMatch(purpose,/委托/);
 state.game.decor.push('picnic');assert.match(cropPurpose(state.game,'radish'),/作点心/);
});

test('seed reward reports actual growth and capped bond only after the persisted claim changes',()=>{
 let before=fresh();before.game.pets[before.game.active].xp=48;before.game.pets[before.game.active].bond=99;
 before.game.puzzle.board=[64,64,...Array(14).fill(0)];before=act(before,{type:'puzzleMove',direction:'left'},now);
 const action={type:'puzzleClaim'},after=act(before,action,now),reward=actionReward(before,after,action);
 assert.ok(reward);assert.equal(reward.levelUp,true);assert.match(reward.items[0],/种子 \+1/);assert.equal(reward.items[1],'荔枝币 +8');
 assert.match(reward.items[2],/成长 \+3 · 亲密 \+1/);
 assert.equal(actionReward(before,before,action),null);assert.equal(actionReward(after,after,action),null);
 const failed=structuredClone(after);failed.game.coins=before.game.coins;assert.equal(actionReward(before,failed,action),null);
});

test('order feedback belongs to the recipient, respects level 20, and is absent for failed or repeated writes',()=>{
 const actionState=()=>{const state=fresh(),order=state.game.orders.offers.find(order=>order.pet!==state.game.pets[state.game.active].species);for(const [crop,n] of Object.entries(order.needs))state.game.stock[crop]=n;return {state,order}};
 for(const [xp,expectedLevelUp] of [[48,true],[998,false]]){
  const {state:before,order}=actionState(),recipient=before.game.pets.find(pet=>pet.species===order.pet);recipient.xp=xp;recipient.bond=99;recipient.name='收货朋友';
  const action={type:'orderDeliver',id:order.id},after=act(before,action,now),reward=actionReward(before,after,action);
  assert.equal(reward.title,'收货朋友收到了你的心意');assert.equal(reward.levelUp,expectedLevelUp);
  assert.equal(reward.items[2],'收货朋友成长 +5 · 亲密 +1');assert.equal(after.game.active,before.game.active);
  assert.equal(actionReward(before,before,action),null);assert.equal(actionReward(after,after,action),null);
  const failed=structuredClone(after);failed.game.coins=before.game.coins;assert.equal(actionReward(before,failed,action),null);
 }
});

test('construction and surplus receipts reflect actual spending and never repeat on equip toggles or failed sales',()=>{
 const before=quiet();before.game.coins=100;before.game.stats.harvest=3;before.game.stock.radish=10;before.game.stock.strawberry=2;
 const build={type:'decor',id:'picnic'},after=act(before,build,now),reward=actionReward(before,after,build);
 assert.equal(reward.title,'湖畔野餐角建好啦');assert.equal(reward.items[1],'荔枝币 −60');assert.match(reward.items[0],/小萝卜 −4/);
 assert.equal(actionReward(before,before,build),null);assert.equal(actionReward(after,act(after,build,now),build),null);
 const sale={type:'sellSurplus',crop:'radish'},sold=act(after,sale,now),saleReward=actionReward(after,sold,sale);
 assert.equal(saleReward.items[0],'小萝卜 −6');assert.equal(saleReward.items[1],`荔枝币 +${6*CROPS.radish.sell}`);
 assert.equal(actionReward(after,after,sale),null);
 const failed=structuredClone(sold);failed.game.coins=after.game.coins;assert.equal(actionReward(after,failed,sale),null);
});

console.log(`\n${checks} garden next-step and reward checks passed.`);
