/**
 * Shared frame clock for courtyard and desktop companions. No DOM, timers,
 * storage or random choices: both windows can play the exact same clip.
 * Frame artwork lives in pet-animation-art.mjs. Add a drawing function there
 * and a species to the catalog to register a new companion.
 */
import {PETS, DEFAULT_PET, petDefinition} from './pet-catalog.mjs';

export const PET_ACTIONS = Object.freeze(['idle','look','walk','pat','eat','play','sleep','wake','celebrate','focus','sad','greet']);
export const ACTION_LABELS = Object.freeze({idle:'发呆',look:'张望',walk:'散步',pat:'摸摸头',eat:'吃点心',play:'玩耍',sleep:'睡觉',wake:'伸懒腰',celebrate:'庆祝',focus:'陪伴专注',sad:'有点低落',greet:'打招呼'});
const TIMINGS = {
  idle: [1500,320,180,130,220,1450], look:[760,230,700,210,700,350],
  walk:[150,130,150,150,130,150], pat:[200,170,230,200,230,330],
  eat:[240,220,180,230,180,470], play:[190,170,140,220,160,320],
  sleep:[900,850,750,900,850,750], wake:[260,230,340,360,240,350],
  celebrate:[180,170,180,170,220,400], focus:[1800,280,900,190,800,1300],
  sad:[1100,500,220,260,500,900], greet:[240,230,180,230,180,450],
};
const LOOPS = new Set(['idle','look','walk','sleep','focus','sad']);
const SPECIES_PACE = {libao:1, chestnut:1.16, egret:1.3, pingu:.9, skipper:.95, turtle:1.7};
export const ACTION_ALIASES = Object.freeze({feed:'eat',happy:'celebrate',harvest:'celebrate',victory:'celebrate',win:'celebrate',lose:'sad',blink:'idle',hop:'play',stretch:'wake',peek:'look',nap:'sleep',wave:'greet',normal:'idle',think:'focus',thinking:'focus'});

export const PET_CLIPS = Object.freeze(Object.fromEntries(Object.entries(PETS).map(([species, pet])=>[
  species, Object.freeze(Object.fromEntries(PET_ACTIONS.map(action=>{
    const frames = TIMINGS[action].map((duration,index)=>Object.freeze({
      id:`petanim-${pet.sprite}-${action}-${index}`,
      duration:Math.round(duration*(SPECIES_PACE[species]||1)),
    }));
    return [action, Object.freeze({species,action,frames:Object.freeze(frames),duration:frames.reduce((sum,f)=>sum+f.duration,0),loop:LOOPS.has(action),viewBox:pet.viewBox})];
  }))),
])));

export function animationClip(species, action='idle') {
  const id=Object.hasOwn(PET_CLIPS,species)?species:DEFAULT_PET;
  const key=ACTION_ALIASES[action]||action;
  return PET_CLIPS[id][Object.hasOwn(PET_CLIPS[id],key)?key:'idle'];
}

/** Looping clips wrap; gestures hold the final pose until their caller restores idle. */
export function animationFrame(species, action, elapsedMs, {reducedMotion=false}={}) {
  const clip=animationClip(species,action);
  if(reducedMotion)return {id:petDefinition(clip.species).sprite+'-'+(clip.action==='sleep'?'sleep':clip.action==='sad'?'sad':'normal'),viewBox:clip.viewBox,done:!clip.loop,index:0};
  const elapsed=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0;
  const done=!clip.loop&&elapsed>=clip.duration;
  let remainder=clip.loop?elapsed%clip.duration:Math.min(elapsed,clip.duration-1);
  let index=0;
  while(index<clip.frames.length-1&&remainder>=clip.frames[index].duration){remainder-=clip.frames[index].duration;index++}
  return {id:clip.frames[index].id,viewBox:clip.viewBox,done,index};
}

const IDLE_ROUTINES={
  libao:['idle','look','greet','idle','play'], chestnut:['idle','look','idle','wake','focus'],
  egret:['idle','look','walk','idle','focus'], pingu:['idle','greet','walk','look','play'],
  skipper:['idle','look','focus','walk','greet'], turtle:['idle','focus','look','idle','walk'],
};
/** Deterministic routines make a companion's personality visible without saving animation state. */
export function idleAction(species,cycle=0){
  const routine=Object.hasOwn(IDLE_ROUTINES,species)?IDLE_ROUTINES[species]:IDLE_ROUTINES[DEFAULT_PET];
  return routine[((Math.floor(Number(cycle)||0)%routine.length)+routine.length)%routine.length];
}
