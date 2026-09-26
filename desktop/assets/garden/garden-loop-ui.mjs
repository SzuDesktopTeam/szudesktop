import {PROJECTS,projectStatus,nextProject} from './garden-loop.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cropNames={radish:'小萝卜',strawberry:'草莓',blueberry:'蓝莓',lychee:'荔枝'};
const cropLevels={radish:1,strawberry:1,blueberry:2,lychee:3};
const art={
 picnic:'<path fill="#9ca575" d="M4 22h40v3H4z"/><path fill="#bd6459" d="M5 12h35v11H5z"/><path fill="#f4deae" d="M5 14h35v2H5zm0 5h35v2H5zM10 12h2v11h-2zm12 0h2v11h-2zm12 0h2v11h-2z"/><path fill="#715036" d="M21 7h13v9H21zM24 3h7v2h-7zm-2 2h2v5h-2zm9 0h2v5h-2z"/><path fill="#bd8b52" d="M23 8h9v6h-9z"/><path fill="#e4bd73" d="M23 10h9v2h-9z"/><path fill="#92a15b" d="M25 7h3v4h-3z"/><path fill="#d98568" d="M28 7h3v4h-3z"/><path fill="#ead294" d="M7 8h9v5H7zm29 9h8v5h-8z"/><path fill="#956a43" d="M8 10h7v1H8zm29 9h6v1h-6z"/>',
 seedrack:'<path fill="#90996a" d="M7 25h34v2H7z"/><path fill="#6f4f36" d="M10 3h3v23h-3zm24 0h3v23h-3zM7 13h33v3H7zm0 9h33v3H7z"/><path fill="#c2935e" d="M8 12h31v2H8zm0 9h31v2H8z"/><path fill="#d0ad72" d="M15 4h7v8h-7zm11 0h6v8h-6z"/><path fill="#f2dfae" d="M16 5h5v5h-5zm11 0h4v5h-4z"/><path fill="#85a45d" d="M18 7h2v3h-2zm10-1h2v3h-2z"/><path fill="#b96946" d="M13 17h6v5h-6zm13 0h6v5h-6z"/><path fill="#73904d" d="M15 14h2v4h-2zm-2 0h3v2h-3zm14 0h3v4h-3zm2-2h3v2h-3z"/>',
 lakeLights:'<path fill="#719785" d="M1 24h46v3H1z"/><path fill="#a9c5a0" d="M5 25h10v1H5zm19 0h8v1h-8z"/><path fill="#755136" d="M4 4h2v22H4zm36 0h2v22h-2zM6 5h7v1H6zm7 1h8v1h-8zm8 1h11v1H21zm11-1h8v1h-8z"/><path fill="#c3904a" d="M11 8h6v7h-6zm12 1h6v7h-6zm12-1h6v7h-6z"/><path fill="#ffe4a1" d="M12 9h4v5h-4zm12 1h4v5h-4zm12-1h4v5h-4z"/><path fill="#917541" d="M13 6h2v2h-2zm12 2h2v1h-2zm12-1h2v1h-2z"/><path fill="#d2b66c" d="M13 17h2v1h-2zm12 1h2v1h-2zm12-1h2v1h-2z"/>',
};
export function projectArt(id){return `<svg class="project-pixel-art" viewBox="0 0 48 28" aria-hidden="true" shape-rendering="crispEdges">${art[id]||''}</svg>`;}
const requirementText=status=>status.project.requirement.kind==='harvest'?`收获 ${Math.min(status.requirementProgress,status.project.requirement.count)} / ${status.project.requirement.count} 次`:`交付 ${Math.min(status.requirementProgress,status.project.requirement.count)} / ${status.project.requirement.count} 份委托`;
function projectAction(status,game){
 const {project,owned,equipped,ready,unlocked,coinShort}=status,missing=status.missing.filter(item=>item.missing>0);
 if(owned)return `<button type="button" data-action="decor" data-id="${esc(project.id)}" class="quiet">${equipped?'收起来':'摆回庭院'}</button>`;
 if(ready)return `<button type="button" data-action="decor" data-id="${esc(project.id)}" class="primary">布置${esc(project.name)} →</button>`;
 if(missing.length){const first=missing.find(item=>cropLevels[item.crop]<=(game.gardenLevel||1));return first?`<button type="button" data-action="gardenRoute" data-tab="farm" data-crop="${esc(first.crop)}">去准备${cropNames[first.crop]} →</button>`:`<button type="button" data-action="navigate" data-page="study" data-tab="focus">陪伙伴成长 · 解锁${cropNames[missing[0].crop]}</button>`;}
 if(!unlocked)return `<button type="button" data-action="gardenRoute" data-tab="${project.requirement.kind==='harvest'?'farm':'market'}">${project.requirement.kind==='harvest'?'去农田收获':'去交付委托'} →</button>`;
 return `<button type="button" data-action="gardenRoute" data-tab="market">交付委托 · 还差 ${coinShort} 币</button>`;
}
function projectSummary(status){
 if(status.ready)return '收成和荔枝币都齐了，今天就能摆进庭院。';
 const parts=status.missing.filter(item=>item.missing>0).map(item=>`${cropNames[item.crop]}还差 ${item.missing} 个`);
 if(!status.unlocked)parts.push(requirementText(status));
 if(status.coinShort)parts.push(`还差 ${status.coinShort} 荔枝币`);
 return parts.join(' · ');
}
/** One focused construction goal. All mutations are handled by the existing app actions. */
export function projectView(game,{cropIcon}={}){
 const project=nextProject(game),statuses=Object.keys(PROJECTS).map(id=>projectStatus(game,id)),owned=statuses.filter(status=>status.owned);
 const status=project?projectStatus(game,project.id):null;
 return `<section id="garden-projects" class="card garden-projects" aria-labelledby="project-title"><div class="project-heading"><div><p class="eyebrow">一起把庭院住成家</p><h2 id="project-title">${project?'下一处小变化':'庭院已经有你的样子'}</h2></div><span class="project-count">${owned.length} / ${statuses.length} 已拥有</span></div>${status?`<div class="project-feature"><div class="project-art-card">${projectArt(project.id)}<span>完成后出现在庭院</span></div><div class="project-copy"><h3>${esc(project.name)}</h3><p>${esc(project.description)}</p><ul class="project-materials">${Object.entries(project.needs).map(([crop,need])=>`<li>${cropIcon?cropIcon(crop):''}<span>${cropNames[crop]} <strong>${Math.min(game.stock[crop]||0,need)} / ${need}</strong></span></li>`).join('')}<li><span>荔枝币 <strong>${Math.min(Math.floor(game.coins),project.price)} / ${project.price}</strong></span></li></ul><p class="project-requirement ${status.unlocked?'is-met':''}">${status.unlocked?'✓ ':''}${requirementText(status)}</p><div class="project-bottom"><span>${esc(projectSummary(status))}</span>${projectAction(status,game)}</div></div></div>`:'<p class="project-finished">野餐垫、种子架和湖边小灯都准备好了。喜欢的摆出来，庭院可以随时换个样子。</p>'}${owned.length?`<div class="project-owned" aria-label="已经拥有的庭院布置">${owned.map(item=>`<div>${projectArt(item.project.id)}<span><strong>${esc(item.project.name)}</strong><small>${item.equipped?'正在庭院里':'已经收好'}</small></span>${projectAction(item,game)}</div>`).join('')}</div>`:''}</section>`;
}
export function projectStrip(game){
 const project=nextProject(game);if(!project)return '';
 const status=projectStatus(game,project.id);
 const missing=status.missing.filter(item=>item.missing>0),locked=missing.find(item=>cropLevels[item.crop]>(game.gardenLevel||1));
 const summary=status.ready?'收成已齐，可以布置了':locked?`${cropNames[locked.crop]}待解锁 · Lv.${cropLevels[locked.crop]}`:missing.length?`收成 ${status.missing.length-missing.length} / ${status.missing.length} 种已备好`:!status.unlocked?requirementText(status):`收成已齐 · 还差 ${status.coinShort} 币`;
 return `<aside class="garden-project-strip" aria-label="当前庭院建设">${projectArt(project.id)}<div><small>${esc(project.name)}</small><p>${esc(summary)}</p></div><button type="button" class="quiet" data-action="gardenRoute" data-tab="journal" data-anchor="garden-projects">看看建设 →</button></aside>`;
}
/** Decorative and pointer-transparent: the farm's selection buttons remain usable. */
export function projectScene(game,{surface='farm'}={}){
 const installed=Object.keys(PROJECTS).filter(id=>{const status=projectStatus(game,id);return status.owned&&status.equipped;});
 if(!installed.length)return '';
 return `<div class="garden-built-scene garden-built-scene--${esc(surface)}" role="img" aria-label="庭院布置：${installed.map(id=>PROJECTS[id].name).join('、')}">${installed.map(id=>`<span class="garden-built-piece garden-built-piece--${id}" title="${esc(PROJECTS[id].name)}">${projectArt(id)}</span>`).join('')}</div>`;
}
