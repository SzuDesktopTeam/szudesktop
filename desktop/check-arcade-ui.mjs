import assert from 'node:assert/strict';
import {arcadeView,ordersView,bindArcade,paintArcade} from './assets/garden/arcade-ui.mjs';
import {createPuzzle,movePuzzle} from './assets/garden/puzzle2048.mjs';
import {createOrders,dailyOrders,deliverOrder} from './assets/garden/garden-orders.mjs';

const crops={radish:{name:'小萝卜',sell:6,level:1},strawberry:{name:'草莓',sell:12,level:1}},date=new Date();
const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const game={puzzle:createPuzzle(17),pets:[{species:'libao',name:'<新名字>',say:'<一句话>'}],active:0,coins:0,stock:{radish:0,strawberry:0},orders:createOrders()};
dailyOrders(game,day,crops,1);
let passed=0;const check=(title,fn)=>{fn();passed++;console.log('PASS',title);};

check('view renders all cells, controls, and escaped companion details',()=>{
 const html=arcadeView(game,{petHTML:'<svg id="existing-pet"></svg>'});
 assert.equal((html.match(/role="gridcell"/g)||[]).length,16);
 assert.equal((html.match(/role="row"/g)||[]).length,4);
 for(const direction of ['up','down','left','right'])assert.ok(html.includes(`data-dir="${direction}"`));
 assert.ok(html.includes('id="existing-pet"'));assert.ok(html.includes('&lt;新名字&gt;'));assert.ok(html.includes('&lt;一句话&gt;'));
 assert.ok(!html.includes('<新名字>'));assert.ok(!html.includes('data-action="puzzle'));
});
check('daily reward depends on today’s earned qualification, not an old large tile',()=>{
 game.puzzle.board[0]=128;
 assert.match(arcadeView(game),/class="arcade-claim " disabled/);
 game.puzzle.qualifiedDay=day;assert.match(arcadeView(game),/class="arcade-claim primary" >领取今天的小礼/);
 game.puzzle.earnedDay=day;assert.match(arcadeView(game),/class="arcade-claim " disabled>今天已领取/);
});
check('orders display insufficient materials, real payouts and completed deliveries',()=>{
 let html=ordersView(game,{crops});assert.match(html,/材料还没齐/);assert.match(html,/还差/);
 const order=game.orders.offers[0];Object.assign(game.stock,order.needs);
 html=ordersView(game,{crops});assert.ok(html.includes(`data-id="${order.id}"  class="primary"`));assert.ok(html.includes(`含额外答谢 ${order.bonus} 币`));
 deliverOrder(game,order.id,day,crops,1);html=ordersView(game,{crops});assert.match(html,/已送达，谢谢你/);assert.match(html,/第一张感谢便笺/);
});

// Deliberately tiny event/element surface. Browser layout and animation are checked in the real UI.
function element(){return {listeners:new Map(),dataset:{},innerHTML:'',textContent:'',disabled:false,classList:{toggle(){}},addEventListener(name,fn){this.listeners.set(name,fn)},removeEventListener(name,fn){if(this.listeners.get(name)===fn)this.listeners.delete(name)}};}
const board=element(),shell=element(),nodes=new Map();
board.focus=()=>{board.focused=true};board.setPointerCapture=id=>{board.captured=id};
shell.matches=selector=>selector==='.garden-arcade';shell.querySelectorAll=()=>[];
shell.querySelector=selector=>{if(selector==='.arcade-board')return board;if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
const calls=[],cleanup=bindArcade(shell,{onMove:direction=>calls.push(direction),onUndo:()=>calls.push('undo'),onRestart:()=>calls.push('restart'),onClaim:()=>calls.push('claim'),reducedMotion:true});
check('keyboard is scoped to the focused board and preserves page inputs and shortcuts',()=>{
 let prevented=0;const send=(key,target=board,extra={})=>board.listeners.get('keydown')({key,target,preventDefault(){prevented++},...extra});
 send('ArrowLeft');send('W');send('ArrowUp',{});send('a',board,{ctrlKey:true});send(' ');
 assert.deepEqual(calls,['left','up']);assert.equal(prevented,2);
});
check('buttons and deliberate swipes call one action; taps and cancelled swipes do not move',()=>{
 const click=(name,disabled=false)=>shell.listeners.get('click')({target:{closest:()=>({disabled,dataset:{dir:'right'},matches:selector=>selector===name})}});
 click('.arcade-move');click('.arcade-undo');click('.arcade-restart');click('.arcade-claim');click('.arcade-claim',true);
 const down=(x,y)=>board.listeners.get('pointerdown')({isPrimary:true,button:0,pointerType:'touch',pointerId:3,clientX:x,clientY:y});
 const up=(x,y)=>board.listeners.get('pointerup')({pointerId:3,clientX:x,clientY:y});
 down(50,50);up(52,52);down(50,50);up(50,90);down(50,50);board.listeners.get('pointercancel')();up(90,50);
 assert.deepEqual(calls,['left','up','right','undo','restart','claim','down']);assert.equal(board.focused,true);
});
check('paint reflects the committed board and messages without mutating state or replacing companion',()=>{
 game.puzzle=createPuzzle(17);game.puzzle.board=[2,2,0,0,...Array(12).fill(0)];const result=movePuzzle(game.puzzle,'left');game.puzzle=result.state;
 const snapshot=JSON.stringify(game),portrait={};nodes.set('.arcade-partner-portrait',portrait);
 paintArcade(shell,game,{result,reducedMotion:true});
 assert.equal(JSON.stringify(game),snapshot);assert.equal(shell.querySelector('[data-arcade-score]').textContent,game.puzzle.score);
 assert.equal((shell.querySelector('.arcade-grid').innerHTML.match(/role="gridcell"/g)||[]).length,16);
 assert.equal(shell.querySelector('[data-arcade-say]').textContent,game.pets[0].say);
 assert.equal(shell.querySelector('.arcade-partner-portrait'),portrait);assert.equal(shell.querySelector('.arcade-undo').disabled,false);
 assert.match(shell.querySelector('.arcade-feedback').textContent,/＋4/);
});
check('cleanup removes every installed input listener',()=>{cleanup();assert.equal(shell.listeners.size,0);assert.equal(board.listeners.size,0);});
console.log(`${passed} arcade UI checks passed`);
