import assert from 'node:assert/strict';
import {createPetPlayer,petReaction} from './assets/garden/pet-player.mjs';
import {animationClip} from './assets/garden/pet-animation.mjs';
import {PETS} from './assets/garden/pet-catalog.mjs';

function fixture(pet={species:'chestnut',mood:80,sleeping:false},motion=true){
 let time=0,serial=0;const timers=new Map(),events=new Map(),defs=new Map();
 const use={attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const parent={append(el){defs.set(el.id,el)}};
 defs.set('pet-sprites',{parentElement:parent});
 const media={matches:false,addEventListener(k,cb){events.set('media:'+k,cb)},removeEventListener(k){events.delete('media:'+k)}};
 const doc={hidden:false,defaultView:{matchMedia:()=>media},getElementById:id=>defs.get(id),createElementNS:()=>({dataset:{}}),addEventListener:(k,cb)=>events.set(k,cb),removeEventListener:k=>events.delete(k)};
 const svg={ownerDocument:doc,dataset:{},attributes:{},querySelector:()=>use,setAttribute(k,v){this.attributes[k]=v}};
 const player=createPetPlayer(svg,{pet,motion,now:()=>time,schedule:(cb,delay)=>{const id=++serial;timers.set(id,{cb,at:time+delay});return id},cancel:id=>timers.delete(id)});
 function advance(ms){const end=time+ms;let safety=10000;while(safety--){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>end)break;timers.delete(entry[0]);time=entry[1].at;entry[1].cb()}assert.ok(safety>0);time=end}
 return {player,svg,use,doc,media,timers,defs,events,advance,emit:k=>events.get(k)?.()};
}
const f=fixture();assert.equal(f.svg.attributes.viewBox,'0 0 20 22');
assert.equal(f.use.attributes.href,'#petanim-cat-idle-0');
f.advance(animationClip('chestnut','idle').frames[0].duration);
assert.equal(f.use.attributes.href,'#petanim-cat-idle-1','clock must advance actual drawings');
f.player.play('pat');f.advance(240);const frame=f.use.attributes.href;
f.player.setPet({species:'chestnut',mood:60,sleeping:false});assert.equal(f.use.attributes.href,frame,'care polls must not cut off gestures');
f.advance(animationClip('chestnut','pat').duration);assert.equal(f.svg.dataset.action,'idle');
f.player.setPet({species:'chestnut',sleeping:true});f.player.play('play');assert.equal(f.svg.dataset.action,'sleep','sleep does not perform awake reactions');
f.player.setPet({species:'pingu',sleeping:false,mood:90});assert.equal(f.svg.attributes.viewBox,'0 0 32 40');assert.equal(f.defs.get('pet-animation-sprites').dataset.species,'pingu');
assert.match(f.defs.get('pet-animation-sprites').innerHTML,/petanim-pingu/);assert.doesNotMatch(f.defs.get('pet-animation-sprites').innerHTML,/petanim-cat/);
f.doc.hidden=true;f.emit('visibilitychange');assert.equal(f.timers.size,0);f.doc.hidden=false;f.emit('visibilitychange');assert.equal(f.timers.size,1);
f.player.setPet({species:'pingu',sleeping:false},{motion:false});assert.equal(f.timers.size,0);assert.equal(f.use.attributes.href,'#pingu-normal');
f.player.play('greet');assert.equal(f.svg.dataset.action,'idle','reduced motion resolves a gesture without a timer');assert.equal(f.timers.size,0);
f.player.setPet({species:'pingu',sleeping:true});assert.equal(f.svg.dataset.action,'sleep');assert.equal(f.use.attributes.href,'#pingu-sleep','disabled-motion gesture must not block a later sleeping state');
f.player.setPet({species:'pingu',sleeping:false},{motion:true,focus:true});assert.equal(f.svg.dataset.action,'focus');assert.equal(f.timers.size,1);
f.media.matches=true;f.emit('media:change');assert.equal(f.timers.size,0);
f.player.destroy();assert.equal(f.timers.size,0);
assert.equal(f.events.size,0,'destroy releases media and visibility handlers');
f.player.play('signature');f.player.setPet({species:'libao',mood:80,sleeping:false});assert.equal(f.timers.size,0,'a destroyed player cannot start again');

const guarded=fixture({species:'pingu',mood:90,sleeping:false});
guarded.player.play('water');assert.equal(guarded.svg.dataset.action,'water');
guarded.player.setPet({species:'pingu',mood:90,sleeping:false},{focus:true});
assert.equal(guarded.svg.dataset.action,'focus','starting focus interrupts a prior garden gesture');
guarded.player.play('signature');guarded.advance(60000);
assert.equal(guarded.svg.dataset.action,'focus','neither explicit nor idle signatures interrupt focus');
guarded.player.setPet({species:'pingu',mood:90,sleeping:false},{focus:false});
guarded.player.play('gift');assert.equal(guarded.svg.dataset.action,'gift');
guarded.player.setPet({species:'pingu',mood:90,sleeping:true});
assert.equal(guarded.svg.dataset.action,'sleep','sleep starts immediately even while carrying a gift');
for(const action of ['greet','wake','signature','ponder','harvest']){
 guarded.player.play(action);assert.equal(guarded.svg.dataset.action,'sleep',`${action} must not wake a sleeping companion`);
}
guarded.player.setPet({species:'pingu',mood:90,sleeping:false});
guarded.player.play('wake');assert.equal(guarded.svg.dataset.action,'wake','the actual wake action can play after sleep is cleared');
guarded.media.matches=true;guarded.emit('media:change');
assert.equal(guarded.use.attributes.href,'#pingu-normal');assert.equal(guarded.timers.size,0);
guarded.player.destroy();

for(const species of Object.keys(PETS)){
 const idle=fixture({species,mood:90,sleeping:false}),seen=new Set();
 for(let elapsed=0;elapsed<600000;elapsed+=250){idle.advance(250);seen.add(idle.svg.dataset.action)}
 assert.ok(seen.has('signature'),`${species} occasionally performs its own signature`);
 assert.ok(seen.has('ponder'),`${species} has quiet thinking moments`);
 assert.equal(idle.timers.size,1,'idle routines keep only one frame timer');
 idle.doc.hidden=true;idle.emit('visibilitychange');idle.advance(60000);
 assert.equal(idle.timers.size,0,'hidden windows do not play ambient routines');
 idle.player.destroy();
}

for(const [action,reaction] of Object.entries({water:'water',harvest:'harvest',plant:'celebrate',decor:'build',orderDeliver:'gift',puzzleClaim:'gift',gift:'gift',chat:'ponder',petSignature:'signature'})){
 assert.equal(petReaction(action,{sleeping:false}),reaction,`${action} should play its meaningful response`);
}
assert.equal(petReaction('sleep',{sleeping:true}),'sleep');
assert.equal(petReaction('sleep',{sleeping:false}),'wake');
console.log('Pet player: frame progression, garden reactions, quiet species routines, sleep/focus priority, cleanup and reduced motion passed');
