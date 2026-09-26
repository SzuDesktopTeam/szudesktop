// 伙伴扩展入口：新增种类只需在此登记元数据/台词，并提供同名 sprite 的立绘。
// ID 是存档的一部分。停用伙伴应设 available:false，保留定义以读取旧记录。
export const DEFAULT_PET='libao';
export const PETS={
 libao:{name:'荔宝',sprite:'libao',viewBox:'0 0 52 56',states:true,available:true,description:'荔枝庭院的老朋友，热情又爱笑。',greeting:'嗨，我是荔宝！今天也一起加油。',lines:{
  pat:['嘿嘿，叶子都被你摸歪啦。','今天也收到你的摸摸头了，开心！'],feed:['甜甜的！这一口留在好心情里。','吃饱啦，我可以陪你再做一件小事。'],play:['接住！这次换我把开心传给你。','我们绕庭院跑一小圈吧！'],sleep:['给我留一点晚风，梦里见。','叶子收好啦，我先睡一会儿。'],wake:['我醒啦！今天有什么新鲜事？','伸个懒腰，重新出发！'],focus:['这一段认真，我陪你一起收好了。','完成啦！要不要站起来喝口水？'],harvest:['满满一小篮！留一点给伙伴吧。','你看，认真照顾的种子真的长大了。'],
 }},
 chestnut:{name:'栗栗',sprite:'cat',viewBox:'0 0 32 36',states:true,available:true,description:'歪耳朵、圆肚皮，慢半拍的小猫有自己的主意。',greeting:'喵？刚刚叫我了吗……哦，坐下吧。',lines:{
  pat:['这只耳朵本来就是歪的……再摸一下也行。','呼噜。眼睛还没跟上，肚子先开心了。'],feed:['我只是肚子圆，点心还是装得下的。','吃到了。等一下，嘴角是不是还有一粒？'],play:['接住了！……是用肚皮接住的。','我没摔倒，我在检查地板。'],sleep:['脑袋下班了，肚皮还在值班。','歪耳朵折好，今天先睡成一团。'],wake:['喵……脸醒了，另一只耳朵还没有。','先伸左爪，再伸右爪。怎么又躺下了？'],focus:['你刚刚很认真。我也很认真地没有捣乱。','时间到了！我盯着你，盯成了斗鸡眼。'],harvest:['这根萝卜有点像我。都是圆圆的。','我来守篮子。别担心，我只是坐歪了。'],
 }},
 egret:{name:'小白',sprite:'egret',viewBox:'0 0 32 32',states:true,available:true,description:'文山湖边的白鹭，踱着细步替你守住一小片安静。',greeting:'湖边的风很舒服，陪你坐一会儿。',lines:{
  pat:['风碰过羽毛，你的手也很轻。','别急，我就在湖边等你。'],feed:['谢谢。吃完再去水边走一走。','这一小份刚好，剩下的慢慢来。'],play:['跟着我的影子，走过这一小段。','抬头看看，有一片云像我们的庭院。'],sleep:['湖面安静下来了，我也歇一会儿。','翅膀收好，等下一阵风。'],wake:['风换了方向，我们也活动一下吧。','我醒了。湖边还是一样安静。'],focus:['安静的一段时间，已经留下了痕迹。','辛苦了，望一望远处再继续吧。'],harvest:['种子等过风和阳光，现在轮到收获了。','把小篮子放稳，我们一份一份收好。'],
 }},
 pingu:{name:'Pingu',sprite:'pingu',viewBox:'0 0 32 40',states:true,available:true,description:'红嘴巴的小企鹅，走路摇摇晃晃，一高兴就 Noot Noot。',greeting:'Noot Noot！这块位置，可以留给我吗？',lines:{
  pat:['Noot！脑袋圆圆的，摸起来是不是刚刚好？','Noot Noot！翅膀举起来，表示很开心。'],feed:['啊呜……Noot！再看看盘子里有没有。','小肚子鼓起来了。摇两下，装好了！'],play:['Noot Noot！看我滑过去——咦，没有冰？','翅膀摆好，摇摇晃晃也能赶上你！'],sleep:['Noot……嘴巴收好，睡成一个小饭团。','把小脚藏起来，梦里继续滑冰。'],wake:['Noot！谁把太阳放到窗户里啦？','醒啦！先抖抖肚皮，再认真走两步。'],focus:['Noot Noot！刚才没出声，现在大声给你鼓掌！','这段时间完成啦！我陪你摇摇晃晃地休息一下。'],harvest:['Noot！篮子比我的肚子还圆！','这颗最饱满！抱不住的话，就用两只翅膀。'],
 }},
 skipper:{name:'Skipper',sprite:'skipper',viewBox:'0 0 32 40',states:true,available:true,description:'《马达加斯加》的企鹅队长，眉头很认真，照顾伙伴更认真。',greeting:'队长就位。今天的任务，我们一件一件来。',lines:{
  pat:['咳，这是士气补给。批准再来一次。','发型没有乱。好吧，有一点。'],feed:['补给收到。先吃饱，再制定计划。','确认完毕，点心安全。队长亲自吃掉。'],play:['行动开始！目标：让你笑一下。','保持队形——算了，追那片叶子！'],sleep:['巡逻结束。队长也需要闭眼充电。','今晚解除警戒，放心睡吧。'],wake:['报告，精神已恢复。先活动一下肩膀。','全员集合！哦，只有我们两个，那正好。'],focus:['任务完成。表现很好，现在允许休息。','这一段专注有结果了。下一步先喝水。'],harvest:['收成清点完毕，一颗也没落下。','任务成功！把最圆的那颗留给伙伴。'],
 }},
 turtle:{name:'阿青',sprite:'turtle',viewBox:'0 0 32 32',states:true,available:false,description:'老庭院里的小龟，依然会慢慢陪着已经认识它的人。',greeting:'不着急，我们一步一步来。',lines:{
  pat:['嗯……我有感觉到，谢谢你。','慢慢摸就好，我不赶时间。'],feed:['让我慢慢嚼，这一口很好吃。','肚子暖了，今天又多一点力气。'],play:['走慢一点也算比赛，我来啦。','这一步，再下一步。到了！'],sleep:['先把脑袋缩回去，待会儿见。','今天走过的路，睡醒再接着走。'],wake:['醒了醒了，我把四只脚都伸出来。','休息够啦，下一件事从小小的一步开始。'],focus:['一步一步的，你已经走完这一段了。','不用马上开始下一段，先歇一下。'],harvest:['等它长大，再慢慢收下，刚刚好。','不是长得最快的种子，收成也很好。'],
 }},
};
export const AVAILABLE_PETS=Object.keys(PETS).filter(id=>PETS[id].available);
// 保留早期最多八个记录的兼容性；名册扩展后上限随之增加，无需各处修改魔数。
export const PET_LIMIT=Math.max(8,Object.keys(PETS).length);
export const PET_MOODS=['normal','happy','sad','sleep'];
export const PET_SPRITES=Object.fromEntries(Object.values(PETS).flatMap(p=>[
 [p.sprite,p.viewBox],...(p.states?PET_MOODS.map(state=>[`${p.sprite}-${state}`,p.viewBox]):[]),
]));
export function petDefinition(species){return Object.hasOwn(PETS,species)?PETS[species]:PETS[DEFAULT_PET]}
export function petViewBox(pet){return petDefinition(typeof pet==='string'?pet:pet?.species).viewBox}
export function petSprite(pet){
 const spec=petDefinition(pet?.species);
 if(!spec.states)return spec.sprite;
 return spec.sprite+'-'+(pet?.sleeping?'sleep':pet?.mood<35?'sad':pet?.mood>65?'happy':'normal');
}
