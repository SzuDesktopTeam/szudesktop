import {PET_DIALOGUE,PET_PERSONALITIES} from './pet-dialogue.mjs';
// 伙伴扩展入口：新增种类只需在此登记元数据/台词，并提供同名 sprite 的立绘。
// ID 是存档的一部分。停用伙伴应设 available:false，保留定义以读取旧记录。
export const DEFAULT_PET='libao';
export const PETS={
 libao:{name:'荔宝',sprite:'libao',viewBox:'0 0 52 56',states:true,available:true,description:'荔枝庭院的老朋友，热情又爱笑。',greeting:'嗨，我是荔宝！今天也一起加油。',lines:PET_DIALOGUE.libao,personality:PET_PERSONALITIES.libao},
 chestnut:{name:'栗栗',sprite:'cat',viewBox:'0 0 20 22',states:true,available:true,description:'一脸理所当然的栗色小猫，正认真看守一个空纸箱。',greeting:'喵。这个位置我试过了，可以坐。',lines:PET_DIALOGUE.chestnut,personality:PET_PERSONALITIES.chestnut},
 egret:{name:'小白',sprite:'egret',viewBox:'0 0 32 32',states:true,available:true,description:'文山湖边的白鹭，踱着细步替你守住一小片安静。',greeting:'湖边的风很舒服，陪你坐一会儿。',lines:PET_DIALOGUE.egret,personality:PET_PERSONALITIES.egret},
 pingu:{name:'Pingu',sprite:'pingu',viewBox:'0 0 32 40',states:true,available:true,description:'红嘴巴的小企鹅，走路摇摇晃晃，一高兴就 Noot Noot。',greeting:'Noot Noot！这块位置，可以留给我吗？',lines:PET_DIALOGUE.pingu,personality:PET_PERSONALITIES.pingu},
 skipper:{name:'Skipper',sprite:'skipper',viewBox:'0 0 32 40',states:true,available:true,description:'《马达加斯加》的企鹅队长，眉头很认真，照顾伙伴更认真。',greeting:'队长就位。今天的任务，我们一件一件来。',lines:PET_DIALOGUE.skipper,personality:PET_PERSONALITIES.skipper},
 turtle:{name:'阿青',sprite:'turtle',viewBox:'0 0 32 32',states:true,available:false,description:'老庭院里的小龟，依然会慢慢陪着已经认识它的人。',greeting:'不着急，我们一步一步来。',lines:PET_DIALOGUE.turtle,personality:PET_PERSONALITIES.turtle},
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
