/**
 * Shared frame clock for courtyard and desktop companions. No DOM, timers,
 * storage or random choices: both windows can play the exact same clip.
 * Frame artwork lives in pet-animation-art.mjs. Add a drawing function there
 * and a species to the catalog to register a new companion.
 */
import {PETS, DEFAULT_PET, petDefinition} from './pet-catalog.mjs';

export const PET_ACTIONS = Object.freeze(['idle','look','walk','pat','eat','play','sleep','wake','celebrate','focus','sad','greet','water','harvest','gift','build','ponder','signature']);
export const ACTION_LABELS = Object.freeze({idle:'发呆',look:'张望',walk:'散步',pat:'摸摸头',eat:'吃点心',play:'玩耍',sleep:'睡觉',wake:'伸懒腰',celebrate:'庆祝',focus:'陪伴专注',sad:'有点低落',greet:'打招呼',water:'浇浇水',harvest:'抱回收成',gift:'递个小礼物',build:'一起布置',ponder:'想点事情',signature:'拿手动作'});
export const ACTION_GROUPS = Object.freeze([
  Object.freeze({label:'日常',actions:Object.freeze(['idle','look','walk','sleep','wake','focus','sad','ponder'])}),
  Object.freeze({label:'互动',actions:Object.freeze(['greet','pat','eat','play','celebrate','signature'])}),
  Object.freeze({label:'庭院',actions:Object.freeze(['water','harvest','gift','build'])}),
]);
const SIGNATURE_LABELS = Object.freeze({libao:'给你加个油',chestnut:'检查一下纸箱',egret:'理一理羽毛',pingu:'Noot 一下',skipper:'队长，侦察一下',turtle:'顶起小叶伞'});
export function signatureLabel(species){return SIGNATURE_LABELS[species]||'看拿手动作'}
const TIMINGS = {
  idle: [1500,320,180,130,220,1450], look:[760,230,700,210,700,350],
  walk:[150,130,150,150,130,150], pat:[200,170,230,200,230,330],
  eat:[240,220,180,230,180,470], play:[190,170,140,220,160,320],
  sleep:[900,850,750,900,850,750], wake:[260,230,340,360,240,350],
  celebrate:[180,170,180,170,220,400], focus:[1800,280,900,190,800,1300],
  sad:[1100,500,220,260,500,900], greet:[240,230,180,230,180,450],
  water:[350,240,320,280,310,480], harvest:[280,240,310,260,380,540],
  gift:[320,240,300,440,300,460], build:[340,250,220,280,340,500],
  ponder:[1500,400,850,320,900,1300], signature:[430,260,300,360,280,620],
};
const LOOPS = new Set(['idle','look','walk','sleep','focus','sad','ponder']);
const SPECIES_PACE = {libao:1, chestnut:1.16, egret:1.3, pingu:.9, skipper:.95, turtle:1.7};
export const ACTION_ALIASES = Object.freeze({feed:'eat',happy:'celebrate',victory:'celebrate',win:'celebrate',lose:'sad',blink:'idle',hop:'play',stretch:'wake',peek:'look',nap:'sleep',wave:'greet',normal:'idle',think:'ponder',thinking:'ponder'});

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
  libao:['idle','look','idle','greet','idle','ponder','idle','signature','idle','look','idle','wake'],
  chestnut:['idle','look','idle','ponder','idle','wake','idle','signature','idle','look','idle','idle'],
  egret:['idle','look','idle','walk','idle','idle','ponder','idle','idle','signature','idle','look'],
  pingu:['idle','look','idle','greet','idle','ponder','idle','signature','idle','walk','idle','look'],
  skipper:['idle','look','idle','ponder','idle','walk','idle','signature','idle','look','idle','greet'],
  turtle:['idle','idle','look','idle','ponder','idle','idle','idle','signature','idle','look','idle'],
};
/** Deterministic routines make a companion's personality visible without saving animation state. */
export function idleAction(species,cycle=0){
  const routine=Object.hasOwn(IDLE_ROUTINES,species)?IDLE_ROUTINES[species]:IDLE_ROUTINES[DEFAULT_PET];
  return routine[((Math.floor(Number(cycle)||0)%routine.length)+routine.length)%routine.length];
}
