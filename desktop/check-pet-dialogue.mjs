import assert from 'node:assert/strict';
import {PETS} from './assets/garden/pet-catalog.mjs';
import {PET_CONTEXTS,PET_DIALOGUE,PET_PERSONALITIES,pickPetDialogue} from './assets/garden/pet-dialogue.mjs';

const MIN_LINES_PER_CONTEXT=12;
const GARDEN_CONTEXTS=['plant','water','order','build','supply','focusStart','signature'];
assert.equal(new Set(PET_CONTEXTS).size,PET_CONTEXTS.length,'registered contexts are unique');
for(const context of GARDEN_CONTEXTS)assert.ok(PET_CONTEXTS.includes(context),`garden event ${context} is registered`);
assert.deepEqual(Object.keys(PET_DIALOGUE).sort(),Object.keys(PETS).sort(),'every catalog species has its own dialogue library');
let total=0;
const wholeLibrary=[];
for(const [species,definition] of Object.entries(PETS)){
 const personality=PET_PERSONALITIES[species];
 assert.ok(personality?.identity&&personality.voice,`${species}: complete personality`);
 assert.ok(personality.traits.length>=3&&personality.likes.length>=3,`${species}: concrete traits and likes`);
 assert.equal(definition.personality,personality,`${species}: catalog shares personality`);
 assert.equal(definition.lines,PET_DIALOGUE[species],`${species}: catalog shares dialogue`);
 const all=[];
 assert.deepEqual(Object.keys(PET_DIALOGUE[species]).sort(),[...PET_CONTEXTS].sort(),`${species}: exact context coverage`);
 for(const context of PET_CONTEXTS){
  const pool=PET_DIALOGUE[species][context];
  assert.ok(pool?.length>=MIN_LINES_PER_CONTEXT,`${species}/${context}: enough alternatives`);
  assert.equal(new Set(pool).size,pool.length,`${species}/${context}: no duplicate filler`);
  for(const line of pool){
   assert.ok(line.trim()===line&&Array.from(line).length<=60&&line.length>=6,`${species}/${context}: bubble-sized text`);
   assert.ok(!/[<>\r\n]/.test(line),`${species}/${context}: plain dialogue`);
  }
  // A full loop must actually reach every authored line, including after reload.
  let cursor=0,last='';
  const heard=[];
  for(let i=0;i<pool.length*2;i++){
   const options={cursor,last,seed:'test-individual'};
   const result=pickPetDialogue(species,context,options);
   assert.deepEqual(result,pickPetDialogue(species,context,options),'same saved state resumes same sequence');
   assert.equal(result.context,context);
   assert.ok(pool.includes(result.text));
   assert.notEqual(result.text,last,'no immediate repetition, even across loop boundary');
   assert.ok(result.cursor>cursor,'cursor advances');
   heard.push(result.text);cursor=result.cursor;last=result.text;
  }
  assert.equal(new Set(heard.slice(0,pool.length)).size,pool.length,'first cycle covers all choices');
  assert.equal(new Set(heard.slice(pool.length)).size,pool.length,'next cycle covers all choices');
  const first=pickPetDialogue(species,context,{seed:17});
  assert.notEqual(pickPetDialogue(species,context,{seed:17,last:first.text}).text,first.text,'last works independently of cursor');
  total+=pool.length;all.push(...pool);
 }
 assert.equal(new Set(all).size,all.length,`${species}: contexts are individually authored`);
 wholeLibrary.push(...all);
}

assert.ok(total>=Object.keys(PETS).length*PET_CONTEXTS.length*MIN_LINES_PER_CONTEXT,'complete expanded library size derives from coverage');
assert.equal(new Set(wholeLibrary).size,wholeLibrary.length,'species do not share copy-pasted dialogue');
const fallback=pickPetDialogue('missing','not-a-context',{cursor:-1});
assert.equal(fallback.context,'idle');
assert.ok(PET_DIALOGUE.libao.idle.includes(fallback.text));
assert.deepEqual(pickPetDialogue('libao','idle',{cursor:NaN}),pickPetDialogue('libao','idle'));
const catLines=Object.values(PET_DIALOGUE.chestnut).flat();
assert.ok(catLines.every(line=>!/(丑|抽象|斗鸡眼|歪眼|长得|怪脸|傻猫)/.test(line)),'栗栗 does not joke about its own looks');
const pinguLines=Object.values(PET_DIALOGUE.pingu).flat();
assert.ok(pinguLines.filter(line=>/Noot/.test(line)).length<pinguLines.length/3,'Pingu speaks beyond its catchphrase');
const permutations=new Set(Array.from({length:10},(_,seed)=>Array.from({length:PET_DIALOGUE.libao.idle.length},(_,cursor)=>pickPetDialogue('libao','idle',{seed,cursor}).text).join('|')));
assert.ok(permutations.size>=4,'different individual seeds vary the order');
console.log(`Pet dialogue: ${Object.keys(PETS).length} personalities, ${PET_CONTEXTS.length} contexts, ${total} lines; rotation and character checks passed.`);
