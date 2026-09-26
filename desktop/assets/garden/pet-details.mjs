import {petDefinition} from './pet-catalog.mjs';
import {PET_ACTIONS,ACTION_LABELS,animationClip} from './pet-animation.mjs';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function frameStrip(species,action='idle'){
 const clip=animationClip(species,action);
 return `<p class="muted">${ACTION_LABELS[clip.action]} · ${clip.frames.length} 帧 · ${(clip.duration/1000).toFixed(1)} 秒${clip.loop?'循环':''}</p><div class="pet-frame-strip">${clip.frames.map((f,i)=>`<figure><svg viewBox="${clip.viewBox}" aria-label="${ACTION_LABELS[clip.action]}第 ${i+1} 帧"><use href="#${f.id}"></use></svg><figcaption>${String(i+1).padStart(2,'0')}<small>${f.duration} ms</small></figcaption></figure>`).join('')}</div>`;
}
export function petDetails(p){
 const personality=petDefinition(p.species).personality;
 return `<section class="card pet-personality"><p class="eyebrow">认识一下 ${esc(p.name)}</p><h2>${esc(personality.identity)}</h2><div class="pet-traits">${personality.traits.map(t=>`<span>${esc(t)}</span>`).join('')}</div><p>喜欢：${personality.likes.map(esc).join('、')}。</p><div class="actions"><button data-action="chat">聊两句</button><button data-action="gardenTab" data-tab="arcade">一起玩 2048 →</button></div><small class="muted">不消耗体力，睡着时会轻声回应。</small><details class="pet-action-book"><summary>翻翻动作册 · 12 种动作</summary><p class="muted">点一个动作，看看它怎样动起来。每帧都可以单独看。</p><div class="pet-action-tabs">${PET_ACTIONS.map(a=>`<button data-action="petPreview" data-clip="${a}" aria-pressed="${a==='idle'}">${ACTION_LABELS[a]}</button>`).join('')}</div><div id="pet-animation-frames">${frameStrip(p.species)}</div></details></section>`;
}
