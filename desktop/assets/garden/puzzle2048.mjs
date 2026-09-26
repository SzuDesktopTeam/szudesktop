// 2048 rules adapted from Gabriele Cirulli's original, reworked as pure data.
// Source: https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc
// Original files: js/game_manager.js, js/grid.js, js/tile.js.
// Copyright (c) 2014 Gabriele Cirulli. MIT; see licenses/2048-MIT.txt.
export const PUZZLE_MILESTONES=[128,256,512,1024,2048];
const DIRECTIONS=['up','right','down','left'];
const emptyBoard=()=>Array(16).fill(0);
const maximum=board=>Math.max(...board);
const validTile=n=>n===0||(Number.isSafeInteger(n)&&n>=2&&Number.isInteger(Math.log2(n)));
const natural=n=>Number.isSafeInteger(n)&&n>=0;
function check(ok,message){if(!ok)throw Error(message)}
function random(rng){
 // A stored Mulberry32 state makes save/undo deterministic; not a security RNG.
 const next=(rng+0x6D2B79F5)>>>0;let t=next;
 t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
 return {rng:next,value:((t^(t>>>14))>>>0)/4294967296};
}
function addTile(state){
 const cells=state.board.map((v,i)=>v===0?i:-1).filter(i=>i>=0);
 if(!cells.length)return null;
 const valueRoll=random(state.rng),positionRoll=random(valueRoll.rng);
 const value=valueRoll.value<0.9?2:4,index=cells[Math.floor(positionRoll.value*cells.length)];
 state.rng=positionRoll.rng;state.board[index]=value;return {index,value};
}
export function puzzleCanMove(board){
 if(board.includes(0))return true;
 for(let i=0;i<16;i++)if((i%4<3&&board[i]===board[i+1])||(i<12&&board[i]===board[i+4]))return true;
 return false;
}
export function createPuzzle(seed=Date.now()){
 const state={board:emptyBoard(),score:0,best:0,rng:Number(seed)>>>0,moves:0,over:false,won:false,milestones:[],undo:null,earnedDay:'',qualifiedDay:'',supplyClaim:null};
 addTile(state);addTile(state);return state;
}
function snapshot(raw){
 check(raw&&Array.isArray(raw.board)&&raw.board.length===16&&raw.board.every(validTile),'2048 棋盘存档格式错误');
 for(const key of ['score','moves'])check(natural(raw[key]),'2048 分数或步数格式错误');
 check(natural(raw.rng)&&raw.rng<=0xffffffff,'2048 随机状态格式错误');
 const board=[...raw.board];
 return {board,score:raw.score,rng:raw.rng,moves:raw.moves,over:!puzzleCanMove(board),won:maximum(board)>=2048};
}
export function normalizePuzzle(raw,seed){
 if(raw==null)return createPuzzle(seed);
 const state=snapshot(raw);
 check(natural(raw.best),'2048 最佳分数格式错误');
 return {...state,best:Math.max(raw.best,state.score),
  milestones:[...new Set((Array.isArray(raw.milestones)?raw.milestones:[]).filter(n=>PUZZLE_MILESTONES.includes(n)))].sort((a,b)=>a-b),
  undo:raw.undo?snapshot(raw.undo):null,
  earnedDay:typeof raw.earnedDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.earnedDay)?raw.earnedDay:'',
  qualifiedDay:typeof raw.qualifiedDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.qualifiedDay)?raw.qualifiedDay:'',
  supplyClaim:raw.supplyClaim&&raw.supplyClaim.day===raw.earnedDay&&/^\d{4}-\d{2}-\d{2}$/.test(raw.supplyClaim.day)&&['radish','strawberry','blueberry','lychee'].includes(raw.supplyClaim.crop)&&raw.supplyClaim.quantity===1?{day:raw.supplyClaim.day,crop:raw.supplyClaim.crop,quantity:1}:null,
 };
}
function lineIndexes(direction,line){
 return Array.from({length:4},(_,n)=>direction===0?n*4+line:direction===1?line*4+3-n:direction===2?(3-n)*4+line:line*4+n);
}
export function movePuzzle(input,direction){
 const dir=typeof direction==='string'?DIRECTIONS.indexOf(direction):direction;
 check(Number.isInteger(dir)&&dir>=0&&dir<4,'请选择有效的移动方向');
 const before=normalizePuzzle(input),state=structuredClone(before),merges=[],moves=[];
 const result=(changed,newTile=null,newMilestones=[])=>({state,changed,merges,moves,newTile,maxTile:maximum(state.board),newMilestones,over:state.over});
 if(state.over)return result(false);
 const board=emptyBoard();let score=0;
 for(let line=0;line<4;line++){
  const indexes=lineIndexes(dir,line),tiles=indexes.filter(index=>before.board[index]).map(index=>({index,value:before.board[index]}));
  let write=0;
  for(let i=0;i<tiles.length;i++){
   const current=tiles[i],next=tiles[i+1],to=indexes[write++];
   if(next&&next.value===current.value){
    const value=current.value*2;board[to]=value;score+=value;
    merges.push({from:[current.index,next.index],to,value});
    moves.push({from:current.index,to,value:current.value,merged:true},{from:next.index,to,value:next.value,merged:true});i++;
   }else{board[to]=current.value;if(current.index!==to)moves.push({from:current.index,to,value:current.value,merged:false})}
  }
 }
 if(board.every((value,index)=>value===before.board[index]))return result(false);
 state.undo=snapshot(before);state.board=board;state.score+=score;state.best=Math.max(state.best,state.score);state.moves++;
 const newTile=addTile(state),maxTile=maximum(state.board);
 const newMilestones=PUZZLE_MILESTONES.filter(value=>value<=maxTile&&!state.milestones.includes(value));
 state.milestones.push(...newMilestones);state.milestones.sort((a,b)=>a-b);
 state.over=!puzzleCanMove(state.board);state.won=maxTile>=2048;
 return result(true,newTile,newMilestones);
}
export function undoPuzzle(input){
 const state=normalizePuzzle(input);
 if(!state.undo)return state;
 // Records and daily rewards are outside the reversible board snapshot.
 return {...state,...state.undo,best:state.best,milestones:[...state.milestones],earnedDay:state.earnedDay,qualifiedDay:state.qualifiedDay,undo:null};
}
export function restartPuzzle(input,seed){
 const previous=normalizePuzzle(input),state=createPuzzle(seed);
 state.best=previous.best;state.milestones=[...previous.milestones];state.earnedDay=previous.earnedDay;state.qualifiedDay=previous.qualifiedDay;state.supplyClaim=previous.supplyClaim;
 return state;
}
