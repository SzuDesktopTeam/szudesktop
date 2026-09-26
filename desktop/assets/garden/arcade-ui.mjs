import {PETS} from './pet-catalog.mjs';
import {orderKeepsakes,ORDER_KEEPSAKES} from './garden-orders.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const milestones=[128,256,512,1024,2048];
const milestoneNames=['萝卜小能手','莓好的一局','蓝莓收藏家','荔枝大丰收','庭院合成家'];
const milestoneCrops=['radish','strawberry','blueberry','lychee','lychee'];
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const graphic=(crop,cropIcon)=>cropIcon?cropIcon(crop):'';
const tile=value=>`<span class="arcade-tile" data-value="${value}" ${value?'':'aria-hidden="true"'}>${value?`<strong>${value}</strong><i class="arcade-sprout" aria-hidden="true"></i>`:''}</span>`;
const cells=board=>Array.from({length:4},(_,row)=>`<div class="arcade-row" role="row">${board.slice(row*4,row*4+4).map((value,col)=>`<div class="arcade-cell" role="gridcell" data-cell="${row*4+col}" aria-label="第 ${row+1} 行第 ${col+1} 列，${value||'空格'}">${tile(value)}</div>`).join('')}</div>`).join('');
const reduced=value=>value||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const flights=new WeakMap();

function dailyReward(p,day=today()){
 const claimed=p.earnedDay===day,ready=p.qualifiedDay===day&&!claimed;
 return `<div class="arcade-reward-top"><span class="arcade-stamp ${claimed?'is-collected':''}" aria-hidden="true">${claimed?'✓':'128'}</span><div><h3>今日合成小礼</h3><p>今天合出 128 或更大的数字，就能领一次。</p></div></div><div class="arcade-reward-value"><strong>8 <small>荔枝币</small></strong><span>＋2 伙伴亲密度</span></div><button type="button" class="arcade-claim ${ready?'primary':''}" ${ready?'':'disabled'}>${claimed?'今天已领取':ready?'领取今天的小礼':'合出 128 后可领取'}</button><small class="arcade-kind">每天一份，错过不用补。棋盘会自动保留。</small>`;
}
function stickerShelf(p,cropIcon){return milestones.map((value,i)=>{const done=p.milestones.includes(value);return `<li class="arcade-sticker ${done?'is-earned':''}" aria-label="${milestoneNames[i]}，合出 ${value}，${done?'已收藏':'尚未收藏'}"><span>${graphic(milestoneCrops[i],cropIcon)}<b>${value}</b></span><strong>${milestoneNames[i]}</strong><small>${done?'已收藏':'合出 '+value}</small></li>`;}).join('');}
function boardMessage(p){return p.over?'这局没有可移动的方向了。可以悔棋，或重新开一局。':p.won?'已经合出 2048！可以继续挑战更大的数字，也可以停在这里。':'用方向键 / WASD，或在棋盘上滑动。相同数字碰在一起会合并。';}
function nextMilestone(p){const next=milestones.find(value=>!p.milestones.includes(value));return next?`下一张收藏贴纸 · 合出 ${next}`:'五张合成贴纸已集齐 · 继续挑战自己的纪录';}

/** game is the already-normalized garden game; all writes belong to the caller. */
export function arcadeView(game,{petHTML='',cropIcon}={}){
 const p=game.puzzle,pet=game.pets[game.active];
 return `<section class="garden-arcade" aria-labelledby="arcade-title">
  <div class="arcade-heading"><div><p class="eyebrow">熟悉的 2048 · 和伙伴玩一会儿</p><h2 id="arcade-title">合成菜园</h2><p>把相同数字推到一起，慢慢收集庭院贴纸。</p></div><div class="arcade-scores" aria-label="游戏分数"><div><small>本局得分</small><strong data-arcade-score>${p.score}</strong></div><div><small>最高纪录</small><strong data-arcade-best>${p.best}</strong></div></div></div>
  <div class="arcade-layout"><div class="arcade-table"><div class="arcade-board-top"><span data-arcade-next>${nextMilestone(p)}</span><span><b data-arcade-moves>${p.moves}</b> 步</span></div>
   <div class="arcade-board" tabindex="0" role="group" aria-label="2048 棋盘，点击后用方向键或 WASD 移动" aria-describedby="arcade-instructions"><div class="arcade-grid" role="grid" aria-label="四行四列数字棋盘">${cells(p.board)}</div></div>
   <p class="arcade-feedback ${p.over?'is-over':p.won?'is-won':''}" id="arcade-instructions" role="status" aria-live="polite">${boardMessage(p)}</p>
   <div class="arcade-controls"><div class="arcade-directions" role="group" aria-label="移动数字"><button type="button" class="arcade-move" data-dir="left" aria-label="向左移动">←</button><button type="button" class="arcade-move" data-dir="up" aria-label="向上移动">↑</button><button type="button" class="arcade-move" data-dir="down" aria-label="向下移动">↓</button><button type="button" class="arcade-move" data-dir="right" aria-label="向右移动">→</button></div><div class="arcade-tools"><button type="button" class="arcade-undo" ${p.undo?'':'disabled'}>悔一步</button><button type="button" class="arcade-restart quiet">重新开局</button></div></div>
   <details class="arcade-rules"><summary>怎么玩 · 一分钟就能懂</summary><p>每次移动会把整排数字推向同一方向；相邻的相同数字合成两倍，每块每步只合并一次。移动后会出现一个新的 2 或 4，合并的数字计入得分。</p><p>合出 2048 后还能继续；格子填满且没有可合并的邻居时结束。可以悔一步，但已领取的奖励和贴纸不会退回，也不能重复领取。</p></details>
  </div><aside class="arcade-side"><section class="card arcade-partner">${petHTML?`<div class="arcade-partner-portrait" aria-hidden="true">${petHTML}</div>`:''}<div><small>这一局的搭档</small><h3>${esc(pet.name)}</h3><p>${esc(PETS[pet.species].personality.identity)}</p></div><p class="arcade-partner-say" data-arcade-say role="status">${esc(pet.say||PETS[pet.species].greeting)}</p></section><section class="card arcade-daily">${dailyReward(p)}</section><section class="card arcade-collection"><div class="card-head"><h3>我的合成贴纸</h3><small data-arcade-sticker-count>${p.milestones.length} / 5</small></div><p>第一次合出对应数字，自动收进收藏。</p><ul class="arcade-stickers">${stickerShelf(p,cropIcon)}</ul></section></aside></div>
 </section>`;
}

export function ordersView(game,{cropIcon,crops}={}){
 const orders=game.orders,keepsakes=orderKeepsakes(game);
 return `<section class="card garden-orders" aria-labelledby="orders-title"><div class="orders-heading"><div><p class="eyebrow">收成有了新的去处</p><h2 id="orders-title">伙伴的收获委托</h2><p>看看伙伴需要什么，把篮子里的收成送过去。</p></div><span class="orders-tally">今日 <b>${orders.completed.length} / ${orders.offers.length}</b></span></div><div class="orders-notes">${orders.offers.map((order,index)=>{
  const done=orders.completed.includes(order.id),enough=Object.entries(order.needs).every(([crop,n])=>game.stock[crop]>=n);
  return `<article class="order-note ${done?'is-complete':enough?'is-ready':''}"><div class="order-note-top"><span>${esc(PETS[order.pet].name)}的委托</span><small>0${index+1}</small></div><h3>${esc(order.title)}</h3><p>${esc(order.text)}</p><ul class="order-materials">${Object.entries(order.needs).map(([crop,n])=>`<li>${graphic(crop,cropIcon)}<span><strong>${esc(crops[crop].name)} ×${n}</strong><small>${done?'已经送达':`篮子里有 ${game.stock[crop]} 个`}</small></span><b class="${done||game.stock[crop]>=n?'enough':'short'}">${done?'✓':game.stock[crop]>=n?'齐了':'还差 '+(n-game.stock[crop])}</b></li>`).join('')}</ul><div class="order-payment"><strong>${order.coins} <small>荔枝币</small></strong><span>含额外答谢 ${order.bonus} 币</span></div><button type="button" data-action="orderDeliver" data-id="${esc(order.id)}" ${done||!enough?'disabled':''} class="${!done&&enough?'primary':''}">${done?'已送达，谢谢你':enough?'交付这份收成':'材料还没齐'}</button></article>`;
 }).join('')}</div><div class="orders-footer"><p>每天三份，交付会扣除对应收成。今天的委托不会中途换单，未完成也没有惩罚。</p><span>累计送达 <b>${orders.total}</b> 份</span></div><details class="order-keepsakes"><summary>委托纪念册 <span>${keepsakes.length} / ${ORDER_KEEPSAKES.length}</span></summary><ul>${ORDER_KEEPSAKES.map(item=>{const owned=keepsakes.some(x=>x.id===item.id);return `<li class="${owned?'is-owned':''}"><svg class="sprite" aria-hidden="true"><use href="#${esc(item.icon)}"></use></svg><span><strong>${esc(item.name)}</strong><small>${owned?'已收藏':'累计送达 '+item.total+' 份'}</small></span>${owned?'<b aria-label="已收藏">✓</b>':''}</li>`;}).join('')}</ul></details></section>`;
}

/** Listeners remain bound while paintArcade replaces only cells and status content. */
export function bindArcade(root,{onMove,onUndo,onRestart,onClaim,reducedMotion=false}){
 const shell=root.matches?.('.garden-arcade')?root:root.querySelector('.garden-arcade');
 if(!shell)return()=>{};
 const board=shell.querySelector('.arcade-board');
 let start=null;
 const click=event=>{const button=event.target.closest('button');if(!button||button.disabled)return;if(button.matches('.arcade-move'))onMove(button.dataset.dir);else if(button.matches('.arcade-undo'))onUndo();else if(button.matches('.arcade-restart'))onRestart();else if(button.matches('.arcade-claim'))onClaim();};
 const key=event=>{
  if(event.target!==board||event.altKey||event.ctrlKey||event.metaKey)return;
  const direction={ArrowLeft:'left',ArrowUp:'up',ArrowDown:'down',ArrowRight:'right',a:'left',w:'up',s:'down',d:'right'}[event.key.length===1?event.key.toLowerCase():event.key];
  if(direction){event.preventDefault();onMove(direction);}
 };
 const down=event=>{if(event.isPrimary===false||event.button!==0)return;board.focus({preventScroll:true});if(event.pointerType==='mouse')return;start={x:event.clientX,y:event.clientY,id:event.pointerId};board.setPointerCapture(event.pointerId);};
 const up=event=>{if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;onMove(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');};
 const cancel=()=>{start=null;};
 shell.dataset.reducedMotion=String(!!reduced(reducedMotion));
 shell.addEventListener('click',click);board.addEventListener('keydown',key);board.addEventListener('pointerdown',down);board.addEventListener('pointerup',up);board.addEventListener('pointercancel',cancel);
 return()=>{shell.removeEventListener('click',click);board.removeEventListener('keydown',key);board.removeEventListener('pointerdown',down);board.removeEventListener('pointerup',up);board.removeEventListener('pointercancel',cancel);clearFlight(board);};
}

function clearFlight(board){const active=flights.get(board);if(active){flights.delete(board);active.animations.forEach(animation=>animation.cancel());active.layer.remove();active.arrivals.forEach(tile=>tile.classList.remove('is-arriving'));}}
function animateMove(board,result){
 const grid=board.querySelector('.arcade-grid'),box=grid.getBoundingClientRect(),layer=document.createElement('div');
 layer.className='arcade-flight-layer';layer.setAttribute('aria-hidden','true');grid.append(layer);
 const locations=[...grid.querySelectorAll('.arcade-cell')].map(cell=>{const rect=cell.getBoundingClientRect();return {x:rect.left-box.left,y:rect.top-box.top,width:rect.width,height:rect.height};});
 const incoming=new Set(result.moves.map(move=>move.to));if(result.newTile)incoming.add(result.newTile.index);
 const arrivals=[...incoming].map(index=>grid.querySelector(`[data-cell="${index}"] .arcade-tile`));arrivals.forEach(tile=>tile.classList.add('is-arriving'));
 const animations=[];
 for(const move of result.moves){const from=locations[move.from],to=locations[move.to],node=document.createElement('div');node.className='arcade-flight';node.style.cssText=`left:${from.x}px;top:${from.y}px;width:${from.width}px;height:${from.height}px`;node.innerHTML=tile(move.value);layer.append(node);animations.push(node.animate([{transform:'translate(0,0)'},{transform:`translate(${to.x-from.x}px,${to.y-from.y}px)`}],{duration:145,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'}));}
 const active={layer,animations,arrivals};flights.set(board,active);
 Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{
  if(flights.get(board)!==active)return;flights.delete(board);layer.remove();arrivals.forEach(tile=>tile.classList.remove('is-arriving'));
  for(const merge of result.merges)grid.querySelector(`[data-cell="${merge.to}"] .arcade-tile`).animate([{transform:'scale(.9)'},{transform:'scale(1.08)',offset:.55},{transform:'scale(1)'}],{duration:155,easing:'ease-out'});
  if(result.newTile)grid.querySelector(`[data-cell="${result.newTile.index}"] .arcade-tile`).animate([{transform:'scale(.6)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:150,easing:'ease-out'});
 });
}

/** Call only after the state is saved. No optimistic rewards or pending writes. */
export function paintArcade(root,game,{result,reducedMotion=false}={}){
 const shell=root.matches?.('.garden-arcade')?root:root.querySelector('.garden-arcade');if(!shell)return;
 const p=game.puzzle,board=shell.querySelector('.arcade-board');clearFlight(board);
 const cropIcons=new Map([...shell.querySelectorAll('.arcade-sticker')].map((el,i)=>[milestoneCrops[i],el.querySelector('svg')?.outerHTML||'']));
 shell.querySelector('.arcade-grid').innerHTML=cells(p.board);
 shell.querySelector('[data-arcade-score]').textContent=p.score;shell.querySelector('[data-arcade-best]').textContent=p.best;shell.querySelector('[data-arcade-moves]').textContent=p.moves;
 shell.querySelector('[data-arcade-next]').textContent=nextMilestone(p);
 const pet=game.pets[game.active];shell.querySelector('[data-arcade-say]').textContent=pet.say||PETS[pet.species].greeting;
 const feedback=shell.querySelector('.arcade-feedback');feedback.textContent=boardMessage(p);feedback.classList.toggle('is-over',p.over);feedback.classList.toggle('is-won',p.won&&!p.over);
 if(result?.changed&&!p.over&&!p.won){const gained=result.merges.reduce((sum,merge)=>sum+merge.value,0);feedback.textContent=result.newMilestones.length?`新贴纸收入收藏：${result.newMilestones.join('、')}！` :gained?`合并成功，本步 ＋${gained} 分。`:'位置移好了，继续寻找相同的数字。';}
 shell.querySelector('.arcade-undo').disabled=!p.undo;shell.querySelector('.arcade-daily').innerHTML=dailyReward(p);shell.querySelector('[data-arcade-sticker-count]').textContent=`${p.milestones.length} / 5`;shell.querySelector('.arcade-stickers').innerHTML=stickerShelf(p,crop=>cropIcons.get(crop)||'');
 shell.dataset.reducedMotion=String(!!reduced(reducedMotion));
 if(result?.changed&&result.moves.length&&!reduced(reducedMotion)&&typeof board.animate==='function')animateMove(board,result);
}
