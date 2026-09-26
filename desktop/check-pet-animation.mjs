import assert from 'node:assert/strict';
import {PETS,PET_SPRITES} from './assets/garden/pet-catalog.mjs';
import {PET_ACTIONS,PET_CLIPS,animationClip,animationFrame,idleAction} from './assets/garden/pet-animation.mjs';
import {ANIMATION_FRAMES,ANIMATION_SYMBOLS,animationSymbols,animationContactSheet} from './assets/garden/pet-animation-art.mjs';

let checks=0;
function test(name,run){run();checks++;console.log('PASS',name)}

test('every registered companion has all twelve complete six-frame clips',()=>{
  assert.equal(PET_ACTIONS.length,12);
  assert.equal(ANIMATION_FRAMES.length,Object.keys(PETS).length*PET_ACTIONS.length*6);
  const ids=new Set();
  for(const frame of ANIMATION_FRAMES){
    assert.equal(ids.has(frame.id),false,`duplicate ${frame.id}`);ids.add(frame.id);
    const clip=PET_CLIPS[frame.species][frame.action];
    assert.equal(clip.frames[frame.index].id,frame.id);assert.equal(frame.viewBox,PETS[frame.species].viewBox);
    assert.match(ANIMATION_SYMBOLS,new RegExp(`id="${frame.id}"`));
    assert.doesNotMatch(frame.art,/<(?:use|image|script|foreignObject|animate)\b|(?:href|style|transform)=/i,'each frame must draw its own pixels, not transform/reference one still');
  }
  for(const species of Object.keys(PETS))for(const action of PET_ACTIONS){
    const frames=ANIMATION_FRAMES.filter(f=>f.species===species&&f.action===action);
    assert.equal(frames.length,6);
    assert.ok(new Set(frames.map(f=>f.art)).size>=4,`${species}/${action} must contain distinct authored poses`);
    assert.equal(PET_CLIPS[species][action].duration,PET_CLIPS[species][action].frames.reduce((sum,f)=>sum+f.duration,0));
  }
});

test('every limb, prop and expression remains on its integer pixel canvas',()=>{
  for(const frame of ANIMATION_FRAMES){
    const [,,width,height]=frame.viewBox.split(' ').map(Number);
    for(const rect of frame.art.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)){
      const [,x,y,w,h]=Array.from(rect,(v,i)=>i?Number(v):v);
      assert.ok(w>0&&h>0&&x+w<=width&&y+h<=height,frame.id);
    }
    for(const polygon of frame.art.matchAll(/<polygon points="([^"]+)"/g))for(const point of polygon[1].split(' ')){
      const [x,y]=point.split(',').map(Number);
      assert.ok(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<=width&&y<=height,frame.id);
    }
  }
  assert.equal(PETS.chestnut.viewBox,'0 0 20 22','栗栗 must keep the deliberately coarse original grid');
});

test('the frame clock changes exactly at frame boundaries and loops without drift',()=>{
  for(const species of Object.keys(PETS)){
    const clip=animationClip(species,'idle');let time=0;
    for(let index=0;index<clip.frames.length;index++){
      assert.equal(animationFrame(species,'idle',time).index,index);
      assert.equal(animationFrame(species,'idle',time+clip.frames[index].duration-1).index,index);
      time+=clip.frames[index].duration;
    }
    assert.equal(animationFrame(species,'idle',time).index,0);
    assert.deepEqual(animationFrame(species,'idle',37),animationFrame(species,'idle',time*120+37));
    assert.equal(animationFrame(species,'idle',time*20).done,false);
  }
});

test('finite gestures hold their last frame and finish once, without overflowing',()=>{
  for(const species of Object.keys(PETS))for(const action of ['pat','eat','play','wake','celebrate','greet']){
    const clip=animationClip(species,action);
    assert.equal(clip.loop,false);
    assert.equal(animationFrame(species,action,clip.duration-1).done,false);
    assert.equal(animationFrame(species,action,clip.duration).done,true);
    assert.equal(animationFrame(species,action,clip.duration*100).id,clip.frames.at(-1).id);
  }
});

test('reduced motion uses real static art and is available for every companion',()=>{
  for(const species of Object.keys(PETS))for(const action of PET_ACTIONS){
    const frame=animationFrame(species,action,200,{reducedMotion:true});
    assert.ok(Object.hasOwn(PET_SPRITES,frame.id));
    assert.deepEqual(frame,animationFrame(species,action,2000,{reducedMotion:true}));
    if(action==='sleep')assert.ok(frame.id.endsWith('-sleep'));
  }
});

test('action aliases and species temperament are shared by courtyard and desktop',()=>{
  assert.equal(animationClip('pingu','feed'),animationClip('pingu','eat'));
  assert.equal(animationClip('skipper','think'),animationClip('skipper','focus'));
  assert.equal(animationClip('egret','happy'),animationClip('egret','celebrate'));
  assert.ok(animationClip('turtle','walk').duration>animationClip('pingu','walk').duration);
  assert.equal(animationFrame('unknown','unknown',-99).id,PET_CLIPS.libao.idle.frames[0].id);
  assert.equal(animationFrame('libao','idle',NaN).index,0);
  for(const species of Object.keys(PETS))for(let cycle=-2;cycle<20;cycle++)assert.ok(PET_ACTIONS.includes(idleAction(species,cycle)));
  assert.notDeepEqual(Array.from({length:5},(_,i)=>idleAction('pingu',i)),Array.from({length:5},(_,i)=>idleAction('turtle',i)));
});

test('contact sheets contain all actual frame drawings without remote assets',()=>{
  for(const species of Object.keys(PETS)){
    const symbols=animationSymbols(species);
    assert.equal((symbols.match(/<symbol\b/g)||[]).length,72);
    assert.doesNotMatch(symbols,new RegExp(`id="petanim-${PETS[species==='libao'?'chestnut':'libao'].sprite}-`));
    const sheet=animationContactSheet(species);
    assert.equal((sheet.match(/<svg\b/g)||[]).length,73);
    assert.doesNotMatch(sheet,/<image|<use|href=/);
    assert.match(sheet,/72 帧/);
  }
});
console.log(`\n${checks} pet animation checks passed; ${ANIMATION_FRAMES.length} complete frames.`);
