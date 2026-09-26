// One shared SVG frame player for the courtyard and the transparent desktop window.
import {animationClip,animationFrame,idleAction} from './pet-animation.mjs';
import {animationSymbols} from './pet-animation-art.mjs';

export function createPetPlayer(svg,{pet,focus=false,motion=true,document:doc=svg.ownerDocument,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const use=svg.querySelector('use'),media=doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
 let current=pet,focused=focus,enabled=motion,action='idle',started=now(),timer=null,once=false,cycle=0,destroyed=false;
 const base=()=>current?.sleeping?'sleep':focused?'focus':current?.mood<35?'sad':'idle';
 const reduced=()=>!enabled||!!media?.matches;
 function install(){
  let defs=doc.getElementById('pet-animation-sprites');
  if(!defs){defs=doc.createElementNS('http://www.w3.org/2000/svg','defs');defs.id='pet-animation-sprites';doc.getElementById('pet-sprites').parentElement.append(defs)}
  if(defs.dataset.species!==current?.species){defs.innerHTML=animationSymbols(current?.species);defs.dataset.species=current?.species||'libao'}
 }
 function begin(id,transient=false){action=animationClip(current?.species,id).action;once=transient;started=now();paint()}
 function paint(){
  cancel(timer);if(destroyed)return;
  // With motion disabled there is no timer to finish a gesture. Resolve it now,
  // so a later sleep/focus update is not blocked by a permanently active reaction.
  if(reduced()&&once){once=false;action=base();started=now()}
  const clip=animationClip(current?.species,action),elapsed=Math.max(0,now()-started);
  if(!reduced()&&once&&elapsed>=clip.duration){begin(base());return}
  // Quiet personalities have longer frame timings; only the active portrait moves.
  if(!once&&action==='idle'&&elapsed>=clip.duration*2){const next=idleAction(current?.species,++cycle);begin(next,next!=='idle');return}
  const frame=animationFrame(current?.species,action,elapsed,{reducedMotion:reduced()});
  use.setAttribute('href','#'+frame.id);svg.setAttribute('viewBox',frame.viewBox);svg.dataset.action=action;svg.dataset.frame=String(frame.index);svg.dataset.species=current?.species||'libao';
  if(doc.hidden||reduced())return;
  let remainder=elapsed%clip.duration;for(let i=0;i<frame.index;i++)remainder-=clip.frames[i].duration;
  timer=schedule(paint,Math.max(16,clip.frames[frame.index].duration-remainder));
 }
 function reset(){begin(base())}
 function visibility(){if(doc.hidden){cancel(timer);return}reset()}
 doc.addEventListener('visibilitychange',visibility);media?.addEventListener?.('change',reset);
 install();reset();
 return {
  setPet(next,{focus:nextFocus=focused,motion:nextMotion=enabled}={}){
   const previousBase=base(),changed=next?.species!==current?.species;
   current=next;focused=nextFocus;enabled=nextMotion;
   // Polls update care values without cutting off a confirmed interaction.
   if(changed)install();
   if(changed||!once&&previousBase!==base())reset();else paint();
  },
  play(id){if(current?.sleeping&&!['sleep','wake','greet'].includes(id))return;begin(id,true)},
  destroy(){destroyed=true;cancel(timer);doc.removeEventListener('visibilitychange',visibility);media?.removeEventListener?.('change',reset)},
 };
}

export function petReaction(action,pet){
 if(action==='sleep')return pet?.sleeping?'sleep':'wake';
 return ({pat:'pat',feed:'eat',play:'play',chat:'look',switchPet:'greet',focusStart:'focus',focusClaim:'celebrate',harvest:'celebrate',quest:'celebrate',achievement:'celebrate',todoToggle:'celebrate',orderDeliver:'celebrate',puzzleClaim:'celebrate'})[action];
}
