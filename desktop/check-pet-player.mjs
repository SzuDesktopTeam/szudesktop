import assert from 'node:assert/strict';
import {createPetPlayer} from './assets/garden/pet-player.mjs';
import {animationClip} from './assets/garden/pet-animation.mjs';

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
 return {player,svg,use,doc,media,timers,defs,advance,emit:k=>events.get(k)?.()};
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
f.player.setPet({species:'pingu',sleeping:false},{motion:true,focus:true});assert.equal(f.svg.dataset.action,'focus');assert.equal(f.timers.size,1);
f.media.matches=true;f.emit('media:change');assert.equal(f.timers.size,0);
f.player.destroy();assert.equal(f.timers.size,0);
console.log('Pet player: real frame progression, gesture priority, sleeping, species change, focus, visibility and reduced motion passed');
