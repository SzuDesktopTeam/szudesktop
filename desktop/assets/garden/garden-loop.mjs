// Shared garden goals are derived from the existing inventory and collections.
// Projects use decor/equipped; their materials never create a second currency.

// The only crop table. engine.mjs re-exports it as CROPS and every screen derives
// names, unlock levels and yields from it. It lives in this dependency-free module
// because the packaged desktop menu copies the engine's imports one by one.
// Crops may be added but never removed: strict loading still rejects a plot
// planted with an unknown crop, so a retired crop would push every save that
// planted it into lenient recovery (check-garden-progress pins released saves).
export const CROPS={
 radish:{name:'小萝卜',icon:'radish',time:60000,price:4,sell:3,yield:2,level:1,xp:1},
 strawberry:{name:'草莓',icon:'strawberry',time:300000,price:12,sell:12,yield:2,level:1,xp:5},
 blueberry:{name:'蓝莓',icon:'blueberry',time:1200000,price:24,sell:38,yield:2,level:2,xp:20},
 lychee:{name:'荔枝',icon:'lychee',time:3600000,price:40,sell:70,yield:3,level:3,xp:60},
};
export const cropName=id=>Object.hasOwn(CROPS,id)?CROPS[id].name:'作物';
export const PROJECTS={
 picnic:{id:'picnic',name:'湖畔野餐角',price:60,needs:{radish:4,strawberry:2},requirement:{kind:'harvest',count:3},description:'把亲手种的点心摆好，给伙伴留一块可以围坐的野餐毯。',icon:'i-chest'},
 seedrack:{id:'seedrack',name:'窗边育苗架',price:120,needs:{strawberry:4,blueberry:3},requirement:{kind:'orders',count:3},description:'把种子袋与小花盆放上窗台，让下一轮收成也有一个家。',icon:'i-flower'},
 lakeLights:{id:'lakeLights',name:'湖畔灯径',price:240,needs:{blueberry:4,lychee:3},requirement:{kind:'orders',count:8},description:'沿着回小屋的路点亮几盏灯，晚归时也能看见庭院的暖光。',icon:'i-lantern'},
};

export function projectStatus(game,id){
 const project=PROJECTS[id];
 if(!project)throw Error('没有这项庭院建设');
 const owned=game.decor.includes(id),equipped=game.equipped.includes(id);
 const requirementProgress=project.requirement.kind==='harvest'?game.stats.harvest:game.orders?.total||0;
 const unlocked=requirementProgress>=project.requirement.count;
 const missing=Object.entries(project.needs).map(([crop,need])=>({crop,need,have:game.stock[crop]||0,missing:Math.max(0,need-(game.stock[crop]||0))}));
 const coinShort=Math.max(0,project.price-game.coins);
 return {project,owned,equipped,unlocked,ready:!owned&&unlocked&&!coinShort&&missing.every(item=>item.missing===0),requirementProgress,missing,coinShort};
}

export function nextProject(game){return Object.values(PROJECTS).find(project=>!game.decor.includes(project.id))||null}

function pendingOrders(game){return (game.orders?.offers||[]).filter(order=>!game.orders.completed.includes(order.id))}

export function reservedStock(game){
 const reserved=Object.fromEntries(Object.keys(CROPS).map(crop=>[crop,0]));
 const reserve=needs=>{for(const [crop,quantity] of Object.entries(needs))if(Object.hasOwn(reserved,crop))reserved[crop]+=quantity};
 for(const order of pendingOrders(game))reserve(order.needs);
 const project=nextProject(game);
 if(project)reserve(project.needs);
 return reserved;
}

export function sellableStock(game,crop){return Math.max(0,(game.stock[crop]||0)-(reservedStock(game)[crop]||0))}

export function puzzleSupply(game){
 const level=game.gardenLevel||1,demand=Object.fromEntries(Object.keys(CROPS).map(crop=>[crop,0]));
 // Existing seeds and planted crops count toward the coming harvest, so a
 // reward helps a real shortage instead of endlessly adding redundant seeds.
 const supply=Object.fromEntries(Object.entries(CROPS).map(([crop,plan])=>[crop,(game.stock[crop]||0)+(game.seeds[crop]||0)*plan.yield+game.plots.filter(plot=>plot&&plot!=='locked'&&plot.crop===crop).length*plan.yield]));
 const goals=pendingOrders(game).map(order=>({needs:order.needs,target:order.title,reason:'给伙伴的收获委托补一颗种子'}));
 const project=nextProject(game);
 if(project)goals.push({needs:project.needs,target:project.name,reason:'为下一项庭院建设准备种子'});
 for(const goal of goals){
  // A request naming a crop that is no longer in CROPS is skipped, not a crash.
  const needs=Object.entries(goal.needs).filter(([crop])=>Object.hasOwn(CROPS,crop));
  for(const [crop,quantity] of needs)demand[crop]+=quantity;
  const crop=needs.map(([crop])=>crop).find(crop=>CROPS[crop].level<=level&&demand[crop]>supply[crop]);
  if(crop)return {crop,quantity:1,reason:goal.reason,target:goal.target};
 }
 return {crop:'radish',quantity:1,reason:'需要的收成已经备好，再为下次播种留一颗',target:'下一轮播种'};
}
