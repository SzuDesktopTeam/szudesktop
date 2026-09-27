// Original offline garden orders. Crop prices and unlock levels come from CROPS;
// no separate inventory or currency, and no school/network dependency.
const BONUSES=[3,3,4];
const REQUESTS=[
 {pet:'chestnut',title:'纸箱里的野餐',text:'这个纸箱够大。点心放左边，我坐右边。'},
 {pet:'egret',title:'湖畔果篮',text:'准备一小篮，走到湖边时刚好歇一会儿。'},
 {pet:'pingu',title:'摇摇晃晃的点心袋',text:'Noot！小袋子张开啦，给下午留一点好吃的。'},
 {pet:'skipper',title:'今日补给清单',text:'队长已确认：补给要够，休息也不能少。'},
 {pet:'libao',title:'分给朋友的一小份',text:'留一点给朋友，一起吃的时候更开心。'},
];
export const ORDER_KEEPSAKES=[
 {id:'first-basket',total:1,name:'第一张感谢便笺',icon:'i-quill'},
 {id:'picnic-note',total:3,name:'湖畔野餐邀请',icon:'i-chest'},
 {id:'garden-helper',total:8,name:'庭院好邻居木牌',icon:'i-cottage'},
 {id:'full-table',total:15,name:'伙伴围坐小相框',icon:'i-heart'},
];
function check(ok,message){if(!ok)throw Error(message)}
const natural=n=>Number.isSafeInteger(n)&&n>=0;
function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day}
export function createOrders(){return {day:'',offers:[],completed:[],total:0,keepsakes:[]}}
// An offer saved under older rules (bonuses, requesting pets or crops that have
// since changed) is not an error: the day's board is simply regenerated.
function currentOffer(offer,index,day,crops){
 if(!offer||typeof offer!=='object'||offer.id!==day+':'+index||!REQUESTS.some(p=>p.pet===offer.pet))return null;
 if(!offer.needs||typeof offer.needs!=='object'||Array.isArray(offer.needs))return null;
 const entries=Object.entries(offer.needs);
 if(!(entries.length>=1&&entries.length<=2&&entries.every(([id,n])=>Object.hasOwn(crops,id)&&Number.isInteger(n)&&n>0&&n<=4)))return null;
 if(!(offer.bonus===BONUSES[index]&&natural(offer.coins)&&offer.coins>=offer.bonus))return null;
 return {id:offer.id,pet:offer.pet,title:String(offer.title||'伙伴委托').slice(0,40),text:String(offer.text||'').slice(0,120),needs:Object.fromEntries(entries),coins:offer.coins,bonus:offer.bonus};
}
export function normalizeOrders(raw,crops){
 if(raw==null)return createOrders();
 check(raw&&typeof raw==='object'&&(raw.day===''||validDay(raw.day)),'委托日期存档格式错误');
 check(Array.isArray(raw.offers),'委托清单存档格式错误');
 check(natural(raw.total),'委托累计次数格式错误');
 // Offers are derived data, rebuilt by dailyOrders for the same saved day. The
 // day and its delivered IDs stay, so a regenerated board cannot pay twice.
 const current=raw.day&&raw.offers.length===BONUSES.length?raw.offers.map((offer,index)=>currentOffer(offer,index,raw.day,crops)):[];
 const offers=current.length&&current.every(Boolean)?current:[];
 const ids=raw.day?BONUSES.map((_,index)=>raw.day+':'+index):[];
 const completed=[...new Set((Array.isArray(raw.completed)?raw.completed:[]).filter(id=>ids.includes(id)))];
 const keepsakes=[...new Set((Array.isArray(raw.keepsakes)?raw.keepsakes:[]).filter(id=>ORDER_KEEPSAKES.some(k=>k.id===id&&k.total<=raw.total)))];
 return {day:raw.day,offers,completed,total:Math.max(raw.total,completed.length),keepsakes};
}
function dayNumber(day){return Math.floor(Date.parse(day+'T12:00:00Z')/86400000)}
export function dailyOrders(game,day,crops,level=game.gardenLevel||1){
 check(validDay(day),'请选择有效的委托日期');
 if(!game.orders)game.orders=createOrders();
 const orders=game.orders;
 // A clock rollback cannot replace today's completed order IDs.
 if(orders.day&&day<=orders.day&&orders.offers.length)return orders.offers;
 // A saved day whose offers were cleared on load is rebuilt for that same day.
 if(orders.day>day)day=orders.day;
 const kept=day===orders.day?orders.completed:[];
 const available=Object.keys(crops).filter(id=>crops[id].level<=level);
 check(available.length>0,'庭院还没有可用于委托的作物');
 const ordinal=dayNumber(day),quantity=id=>crops[id].sell<=12?2:1;
 const offers=BONUSES.map((bonus,index)=>{
  const request=REQUESTS[(ordinal+index)%REQUESTS.length];
  // Keep the first request approachable: it always uses the earliest crop.
  const first=available[index===0?0:(ordinal+index)%available.length],needs={[first]:quantity(first)};
  if(index===2&&available.length>1){const other=available[(available.indexOf(first)+1)%available.length];needs[other]=1}
  const coins=Object.entries(needs).reduce((sum,[id,n])=>sum+crops[id].sell*n,bonus);
  return {id:day+':'+index,...request,needs,coins,bonus};
 });
 orders.day=day;orders.offers=offers;orders.completed=kept.filter(id=>offers.some(o=>o.id===id));
 return offers;
}
export function orderKeepsakes(game){return ORDER_KEEPSAKES.filter(k=>game.orders?.keepsakes.includes(k.id))}
export function deliverOrder(game,id,day,crops,level=game.gardenLevel||1){
 const offers=dailyOrders(game,day,crops,level),order=offers.find(o=>o.id===id),orders=game.orders;
 check(orders.day===day,'请按当前庭院日期交付委托');
 check(order,'没有找到这份委托');check(!orders.completed.includes(id),'这份委托已经交付过啦');
 for(const [crop,n] of Object.entries(order.needs))check((game.stock[crop]||0)>=n,'收获篮里的'+crops[crop].name+'还不够');
 for(const [crop,n] of Object.entries(order.needs))game.stock[crop]-=n;
 game.coins+=order.coins;orders.completed.push(id);orders.total++;
 const newKeepsakes=ORDER_KEEPSAKES.filter(k=>orders.total>=k.total&&!orders.keepsakes.includes(k.id));
 orders.keepsakes.push(...newKeepsakes.map(k=>k.id));
 return {order,newKeepsakes};
}
