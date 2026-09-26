import {CROPS,PETS,dayKey} from './engine.mjs';
import {nextProject,projectStatus,puzzleSupply} from './garden-loop.mjs';

export const pendingOrders=g=>(g.orders?.offers||[]).filter(o=>!g.orders.completed.includes(o.id));
export const readyOrders=g=>pendingOrders(g).filter(o=>Object.entries(o.needs).every(([id,n])=>g.stock[id]>=n));
export function cropPurpose(g,crop){
 const orders=pendingOrders(g).filter(o=>o.needs[crop]);
 const count=orders.reduce((sum,o)=>sum+o.needs[crop],0),project=nextProject(g);
 const parts=[];
 if(count)parts.push(`${orders.map(o=>PETS[o.pet].name).join('、')}的委托需要 ${count} 个`);
 if(project?.needs[crop])parts.push(`${project.name}需要 ${project.needs[crop]} 个`);
 return parts.length?parts.join('；'):'可以留给伙伴作点心，或卖出换下一颗种子。';
}
const garden=(title,detail,label,extra={})=>({title,detail,label,action:'gardenRoute',tab:'farm',icon:'i-seed',...extra});
export function gardenNextStep(state,now=Date.now()){
 const g=state.game,pet=g.pets[g.active],project=nextProject(g);
 if(g.focus)return {title:g.focus.end<=now?'这一段专注完成了':'先安心做眼前这一件事',detail:g.focus.end<=now?`${g.focus.duration} 荔枝币和成长等你领取，回来继续准备庭院。`:'田里的作物会继续长，成熟后也不会枯萎。',label:g.focus.end<=now?'领取专注收获':'回到专注',action:'navigate',page:'study',tab:'focus',icon:'i-book'};
 const ripe=g.plots.findIndex(p=>p&&p!=='locked'&&p.ready<=now);
 if(ripe>=0){const crop=g.plots[ripe].crop;return garden(`${CROPS[crop].name}可以收了`,cropPurpose(g,crop),'去收获',{crop,index:ripe,icon:'i-chest'})}
 const order=readyOrders(g)[0];
 if(order)return garden(`${PETS[order.pet].name}的收成准备好了`,`${order.title} · 送达后获得 ${order.coins} 币，也让这位伙伴更亲近。`,'交付给伙伴',{tab:'market',order:order.id,icon:'i-heart'});
 if(project&&projectStatus(g,project.id).ready)return garden(`${project.name}可以建好了`,'材料和荔枝币都已备齐，建成后会真实出现在庭院里。','一起建设',{tab:'journal',anchor:'garden-projects',icon:'i-cottage'});
 if(g.puzzle.qualifiedDay===dayKey(now)&&g.puzzle.earnedDay!==dayKey(now)){const supply=puzzleSupply(g);return garden('伙伴已经帮你备好一颗种子',`${CROPS[supply.crop].name}种子可以带回农田，继续准备收成。`,'领取备种礼',{action:'puzzleClaim',icon:'i-seed'})}
 // Existing plants count toward the request: never ask for another planting
 // merely because a growing crop has not reached the basket yet.
 const needs=[...pendingOrders(g).map(o=>({name:PETS[o.pet].name+'的委托',needs:o.needs})),...(project?[{name:project.name,needs:project.needs}]:[])];
 const empty=g.plots.findIndex(p=>p===null);
 let lockedCrop;
 for(const goal of needs)for(const [crop,n] of Object.entries(goal.needs)){
  const growing=g.plots.filter(p=>p&&p!=='locked'&&p.crop===crop).length*CROPS[crop].yield;
  if(g.stock[crop]+growing>=n)continue;
  if(CROPS[crop].level>(g.gardenLevel||1)){lockedCrop??=crop;continue}
  if(empty>=0&&g.seeds[crop]>0)return garden(`种一点${CROPS[crop].name}，准备${goal.name}`,`篮子里有 ${g.stock[crop]} 个，还在生长 ${growing} 个。收获后就能接着做。`,'带着需求去播种',{crop,index:empty});
  if(empty>=0&&g.coins>=CROPS[crop].price)return garden(`给${goal.name}补一颗种子`,`${CROPS[crop].name}种子 ${CROPS[crop].price} 币${g.puzzle.earnedDay===dayKey(now)?'，买好就能去播种。':'；也可以去伙伴小桌一起备种。'}`,'去种子铺',{tab:'market',crop,anchor:'seed-shop'});
  if(empty>=0&&!g.daily.gift)return {title:'今天的补给还在门口',detail:'种子和食物可以直接带回庭院，先把手边的需求照顾好。',label:'领取今日补给',action:'gift',icon:'i-chest'};
  if(empty>=0)return {title:`为${CROPS[crop].name}攒一颗种子钱`,detail:`种子 ${CROPS[crop].price} 币，还差 ${Math.ceil(CROPS[crop].price-g.coins)} 币。完成专注会获得等量荔枝币，也让伙伴成长。`,label:'安排一段专注',action:'navigate',page:'study',tab:'focus',icon:'i-book'};
 }
 if(lockedCrop)return {title:`下一份期待是${CROPS[lockedCrop].name}`,detail:`伙伴达到 Lv.${CROPS[lockedCrop].level} 后可购买这种种子。专注或陪伴伙伴都能获得成长，已解锁的作物不会因切换伙伴而锁回去。`,label:'陪伙伴专注一会儿',action:'navigate',page:'study',tab:'focus',icon:'i-book'};
 if(project){const status=projectStatus(g,project.id);if(!status.unlocked)return garden(`慢慢准备${project.name}`,project.requirement.kind==='orders'?`送出 ${status.requirementProgress} / ${project.requirement.count} 份收成，伙伴就来一起帮忙。`:`收获 ${status.requirementProgress} / ${project.requirement.count} 次，先熟悉这片小田。`,project.requirement.kind==='orders'?'看看伙伴的委托':'去照料农田',{tab:project.requirement.kind==='orders'?'market':'farm',icon:'i-cottage'});
  if(status.coinShort>0)return {title:`为${project.name}攒一点材料钱`,detail:`还差 ${Math.ceil(status.coinShort)} 币。专注、交付收成或出售多余作物都能慢慢攒齐。`,label:'安排一段专注',action:'navigate',page:'study',tab:'focus',icon:'i-book'};
 }
 return {title:g.plots.some(p=>p&&p!=='locked')?'种子正在长，你也可以歇一会儿':`${pet.name}在庭院等你`,detail:'专注一会儿，或者陪伙伴玩一局。下一次回来，仍可以接着今天的进度。',label:'安排一段专注',action:'navigate',page:'study',tab:'focus',icon:'i-book'};
}
