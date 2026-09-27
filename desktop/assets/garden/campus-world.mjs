import {HOME_SKIN_DETAILS,homeSkinDetails} from './home-skins.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ROOMS={
 study:{name:'庭院书屋',detail:'把想弄明白的，留在这张书桌上。',icon:'i-book',objects:['i-book','i-mug','i-quill']},
 services:{name:'荔园告示板',detail:'校园里的新消息，和想去的地方。',icon:'i-sign',objects:['i-mail','i-bell','i-flower']},
 network:{name:'连接小站',detail:'在校园里，也与更远的地方保持联系。',icon:'i-crystal',objects:['i-compass','i-crystal','i-lantern']},
 garden:{name:'伙伴的后院',detail:'一起种下小小期待。',icon:'i-water',objects:['i-seed','i-water','i-flower']},
 settings:{name:'我的小屋',detail:'收好回忆，让这里更像自己。',icon:'i-workbench',objects:['i-chest','i-heart','i-lantern']},
};

// All rooms look out onto the same selected campus. The window is the only
// scene host on a business page, so the existing renderer lifecycle is reused.
// sprite and right are trusted markup produced by the host application.
export function campusRoomHeader({page,title,eyebrow='',description='',skin='pixel',right='',sprite=()=>''}={}){
 const room=ROOMS[page]||ROOMS.study;
 const selected=Object.hasOwn(HOME_SKIN_DETAILS,skin)?skin:'pixel';
 const scenery=homeSkinDetails(selected);
 const landscape=selected==='pixel'?'':`<div class="home-scene campus-room-scene" data-home-scene="${selected}" role="img" aria-label="${esc(scenery.description)}"><p class="scene-loading" role="status">窗外的荔园正在展开…</p></div>`;
 return `<header class="campus-room pagehead" data-room="${esc(page)}">
  <div class="campus-room-copy"><div class="campus-room-location"><button type="button" data-action="navigate" data-page="home" aria-label="回到庭院首页">${sprite('i-cottage','item-icon')}庭院</button><span aria-hidden="true">/</span><span>${room.name}</span></div><h1>${esc(title||room.name)}</h1><p class="muted">${esc(description||room.detail)}</p></div>
  <div class="campus-room-window" aria-label="${esc(scenery.name)}的窗景">${landscape}<span class="campus-window-label">${esc(scenery.name)}</span><div class="campus-room-sill" aria-hidden="true">${room.objects.map(id=>sprite(id,'room-object')).join('')}</div></div>
  ${right?`<div class="campus-room-actions">${right}</div>`:''}
 </header>`;
}

// Scene shortcuts are ordinary, focusable HTML controls. The same routes remain
// available in the persistent navigation; scenery never gates a useful action.
export function campusSceneLinks({sprite=()=>''}={}){
 return `<div class="campus-scene-links" role="group" aria-label="庭院里的去处">
  <button type="button" class="campus-scene-link scene-link-study" data-action="navigate" data-page="study" data-tab="notes"><span class="scene-link-icon">${sprite('i-book')}</span><span><strong>去书屋写笔记</strong><small>课程 · 笔记 · 共学</small></span><span class="scene-link-arrow" aria-hidden="true">↗</span></button>
  <button type="button" class="campus-scene-link scene-link-services" data-action="navigate" data-page="services"><span class="scene-link-icon">${sprite('i-sign')}</span><span><strong>看看告示板</strong><small>学校公告与空间</small></span><span class="scene-link-arrow" aria-hidden="true">↗</span></button>
  <button type="button" class="campus-scene-link scene-link-garden" data-action="navigate" data-page="garden" data-tab="farm"><span class="scene-link-icon">${sprite('i-water')}</span><span><strong>去后院转转</strong><small>伙伴和小菜畦</small></span><span class="scene-link-arrow" aria-hidden="true">↗</span></button>
 </div>`;
}
