import assert from 'node:assert/strict';
import {createPuzzle,normalizePuzzle,movePuzzle,undoPuzzle,restartPuzzle,puzzleCanMove,PUZZLE_MILESTONES} from './assets/garden/puzzle2048.mjs';
import {createOrders,normalizeOrders,dailyOrders,deliverOrder,orderKeepsakes,ORDER_KEEPSAKES} from './assets/garden/garden-orders.mjs';
import {CROPS} from './assets/garden/engine.mjs';

let checks=0;
function test(name,work){work();checks++;console.log('PASS',name)}
const custom=board=>({...createPuzzle(17),board:[...board,...Array(16-board.length).fill(0)],score:0,best:0});
const withoutNewTile=result=>result.state.board.map((value,index)=>index===result.newTile?.index?0:value);
const saved=state=>normalizePuzzle(JSON.parse(JSON.stringify(state)));
const game=level=>({coins:20,gardenLevel:level,stock:{radish:100,strawberry:100,blueberry:100,lychee:100},orders:createOrders()});
const day='2026-09-27';

test('seeded starts have two tiles and serialize without changing the next move',()=>{
 const state=createPuzzle(42);assert.deepEqual(state,createPuzzle(42));
 assert.equal(state.board.filter(Boolean).length,2);assert.ok(state.board.every(n=>[0,2,4].includes(n)));
 for(const direction of ['up','right','down','left'])assert.deepEqual(movePuzzle(state,direction),movePuzzle(saved(state),direction));
 assert.equal(state.moves,0);assert.equal(state.score,0);
});

test('four equal tiles merge once each, preserve input and expose original positions',()=>{
 const before=custom([2,2,2,2]),copy=structuredClone(before),result=movePuzzle(before,'left');
 assert.deepEqual(withoutNewTile(result).slice(0,4),[4,4,0,0]);
 assert.equal(result.state.score,8);assert.equal(result.state.best,8);assert.equal(result.state.moves,1);
 assert.deepEqual(result.merges,[{from:[0,1],to:0,value:4},{from:[2,3],to:1,value:4}]);
 assert.deepEqual(before,copy);assert.equal(result.moves.filter(m=>m.merged).length,4);
});

test('all directions compact toward the correct edge without merging a new tile again',()=>{
 const left=movePuzzle(custom([4,0,4,4]),'left');assert.deepEqual(withoutNewTile(left).slice(0,4),[8,4,0,0]);
 const right=movePuzzle(custom([4,0,4,4]),'right');assert.deepEqual(withoutNewTile(right).slice(0,4),[0,0,4,8]);
 const vertical=custom([2,0,0,0,2,0,0,0,2,0,0,0,2,0,0,0]);
 const up=withoutNewTile(movePuzzle(vertical,'up')),down=withoutNewTile(movePuzzle(vertical,2));
 assert.deepEqual([up[0],up[4],up[8],up[12]],[4,4,0,0]);
 assert.deepEqual([down[0],down[4],down[8],down[12]],[0,0,4,4]);
});

test('ineffective and invalid moves cannot spawn tiles, consume randomness or overwrite undo',()=>{
 const before=custom([2,4,8,16]);before.undo={board:[...before.board],score:0,rng:100,moves:0,over:false,won:false};
 const result=movePuzzle(before,'left');
 assert.equal(result.changed,false);assert.equal(result.newTile,null);assert.deepEqual(result.state,saved(before));
 assert.equal(result.state.rng,before.rng);assert.deepEqual(result.newMilestones,[]);
 for(const direction of ['diagonal',-1,4,null])assert.throws(()=>movePuzzle(before,direction),/方向/);
});

test('full boards end only when no adjacent merge is possible',()=>{
 const blocked=custom([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]);
 assert.equal(puzzleCanMove(blocked.board),false);assert.equal(saved(blocked).over,true);
 const result=movePuzzle(blocked,'right');assert.equal(result.changed,false);assert.equal(result.over,true);
 const open=structuredClone(blocked);open.board[1]=2;
 assert.equal(puzzleCanMove(open.board),true);assert.equal(movePuzzle(open,'left').changed,true);
});

test('undo restores the board, score and random sequence but never unclaims lifetime or daily progress',()=>{
 const before=custom([64,64]),first=movePuzzle(before,'left');
 assert.deepEqual(first.newMilestones,[128]);
 first.state.qualifiedDay=day;first.state.earnedDay=day;
 const undo=undoPuzzle(saved(first.state));
 assert.deepEqual(undo.board,before.board);assert.equal(undo.score,before.score);assert.equal(undo.rng,before.rng);
 assert.equal(undo.best,128);assert.deepEqual(undo.milestones,[128]);
 assert.equal(undo.qualifiedDay,day);assert.equal(undo.earnedDay,day);assert.equal(undo.undo,null);
 assert.deepEqual(undoPuzzle(undo),undo);
 const replay=movePuzzle(undo,'left');assert.deepEqual(replay.state.board,first.state.board);
 assert.equal(replay.state.score,128);assert.deepEqual(replay.newMilestones,[]);
});

test('winning can continue and restarting preserves records without carrying a previous board',()=>{
 const result=movePuzzle(custom([1024,1024]),'left');assert.equal(result.state.won,true);
 assert.deepEqual(result.newMilestones,PUZZLE_MILESTONES);
 assert.equal(movePuzzle(result.state,'right').changed,true,'winning does not lock the board');
 result.state.earnedDay=day;result.state.qualifiedDay=day;
 const restart=restartPuzzle(result.state,29);
 assert.equal(restart.score,0);assert.equal(restart.moves,0);assert.equal(restart.won,false);assert.equal(restart.undo,null);
 assert.equal(restart.best,2048);assert.deepEqual(restart.milestones,PUZZLE_MILESTONES);
 assert.equal(restart.earnedDay,day);assert.equal(restart.qualifiedDay,day);assert.equal(restart.board.filter(Boolean).length,2);
});

test('save normalization rejects damaged boards and strips unrelated imported fields',()=>{
 const before=createPuzzle(4);before.secret='omit';before.unknown={};
 const clean=saved(before);assert.equal(clean.secret,undefined);assert.equal(clean.unknown,undefined);
 const legacy={...clean};delete legacy.qualifiedDay;assert.equal(normalizePuzzle(legacy).qualifiedDay,'');
 for(const board of [[2],Array(16).fill(3),Array(16).fill(-2)])assert.throws(()=>normalizePuzzle({...clean,board}),/棋盘/);
 assert.throws(()=>normalizePuzzle({...clean,score:-1}),/分数/);
 assert.throws(()=>normalizePuzzle({...clean,rng:-1}),/随机/);
 assert.deepEqual(normalizePuzzle(null,42),createPuzzle(42));
});

test('daily orders use unlocked crops, freeze the day and have exactly ten bonus coins in total',()=>{
 const g=game(1),offers=dailyOrders(g,day,CROPS),frozen=structuredClone(offers);
 assert.equal(offers.length,3);assert.deepEqual(offers.map(o=>o.bonus),[3,3,4]);
 for(const offer of offers){
  assert.ok(Object.keys(offer.needs).every(id=>CROPS[id].level<=1));
  assert.equal(offer.coins,Object.entries(offer.needs).reduce((n,[id,count])=>n+CROPS[id].sell*count,offer.bonus));
 }
 g.gardenLevel=3;
 assert.deepEqual(dailyOrders(g,day,CROPS),frozen,'level ups do not reroll existing requests');
 assert.deepEqual(dailyOrders(g,'2026-09-26',CROPS),frozen,'clock rollback cannot reset the board');
 assert.deepEqual(offers[0].needs,{radish:2},'the first harvest can supply the first order');
});

test('delivery consumes all required inventory once, adds the stated amount and cannot be repeated',()=>{
 const g=game(3),orders=dailyOrders(g,day,CROPS),order=orders[2],before=structuredClone(g);
 const result=deliverOrder(g,order.id,day,CROPS);
 for(const crop of Object.keys(CROPS))assert.equal(g.stock[crop],before.stock[crop]-(order.needs[crop]||0));
 assert.equal(g.coins,before.coins+order.coins);assert.equal(g.orders.total,1);
 assert.deepEqual(g.orders.completed,[order.id]);assert.deepEqual(result.newKeepsakes.map(k=>k.id),['first-basket']);
 const paid=structuredClone(g);assert.throws(()=>deliverOrder(g,order.id,day,CROPS),/已经交付/);assert.deepEqual(g,paid);
});

test('missing materials or invalid order IDs leave inventory, coins and completion untouched',()=>{
 const g=game(3),orders=dailyOrders(g,day,CROPS),order=orders[2];
 const missing=Object.keys(order.needs).at(-1);g.stock[missing]=0;const before=structuredClone(g);
 assert.throws(()=>deliverOrder(g,order.id,day,CROPS),/不够/);assert.deepEqual(g,before);
 assert.throws(()=>deliverOrder(g,'absent',day,CROPS),/没有找到/);assert.deepEqual(g,before);
 assert.throws(()=>deliverOrder(g,order.id,'2026-09-26',CROPS),/当前庭院日期/);assert.deepEqual(g,before);
});

test('new days rotate three requests without resetting lifetime keepsakes or restoring old orders',()=>{
 const g=game(3);
 for(let d=27;d<=31;d++){
  const current=d<=30?`2026-09-${d}`:'2026-10-01',offers=dailyOrders(g,current,CROPS);
  for(const order of offers)deliverOrder(g,order.id,current,CROPS);
  g.orders=normalizeOrders(JSON.parse(JSON.stringify(g.orders)),CROPS);
 }
 assert.equal(g.orders.total,15);assert.deepEqual(orderKeepsakes(g),ORDER_KEEPSAKES);
 assert.equal(g.orders.completed.length,3);
 assert.throws(()=>deliverOrder(g,'2026-09-27:0','2026-10-01',CROPS),/没有找到/);
 const records=structuredClone(g.orders.keepsakes);dailyOrders(g,'2026-10-02',CROPS);
 assert.equal(g.orders.completed.length,0);assert.equal(g.orders.total,15);assert.deepEqual(g.orders.keepsakes,records);
});

test('orders round-trip with frozen prices and discard foreign fields without inventing history',()=>{
 const g=game(1);dailyOrders(g,day,CROPS);g.orders.secret='omit';g.orders.offers[0].secret='omit';
 const clean=normalizeOrders(g.orders,CROPS);assert.equal(JSON.stringify(clean).includes('secret'),false);
 assert.deepEqual(normalizeOrders(clean,CROPS),clean);
 assert.deepEqual(normalizeOrders(undefined,CROPS),createOrders());
 const broken=structuredClone(clean);broken.offers[0].needs={unknown:2};
 assert.throws(()=>normalizeOrders(broken,CROPS),/材料/);
});

console.log(`${checks} arcade and order checks passed`);
