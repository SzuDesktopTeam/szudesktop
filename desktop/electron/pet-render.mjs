// 宠物窗只接收本地 IPC，逐帧播放器与庭院共用同一套画稿、时序和角色动作。
import {PETS,PET_SPRITES as VIEW_BOX} from './pet-catalog.mjs';
import {PET_SYMBOLS} from './pet-art.mjs';
import {createPetPlayer,petReaction} from './pet-player.mjs';
document.getElementById('pet-sprites').innerHTML=PET_SYMBOLS;

const SAY_SHOW_MS = 8000;

const pet = document.getElementById('pet');
const use = document.getElementById('pet-use');
const bubble = document.getElementById('bubble');
let hideTimer = null;
let currentPet = null;
let player = null;
let motion = true;

// 未知状态保持原样，不伪造立绘（spec §11：读不到就如实未知）。
function setSprite(key) {
  // Static IPC remains a first-paint fallback; 30-second polls never replace a playing frame.
  if (player || !Object.hasOwn(VIEW_BOX, key)) return;
  use.setAttribute('href', '#' + key);
  pet.setAttribute('viewBox', VIEW_BOX[key]);
}

function setBaseAction(view) {
  if (!Object.hasOwn(PETS,view?.species)) return;
  motion=view.motion!==false;
  currentPet = {species:view.species,mood:view.mood,energy:view.energy,sleeping:view.sleeping};
  const options={focus:view.focus,motion:view.motion};
  if(player)player.setPet(currentPet,options);
  else player=createPetPlayer(pet,{pet:currentPet,...options});
}
function playOnce(id) {
  const reaction=petReaction(id,currentPet)||id;
  if(reaction)player?.play(reaction);
}

function setScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  document.documentElement.style.setProperty('--pet-scale', String(n));
}

const reduceMotion = () => !motion||window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 镜像庭院 say() 语义：主进程已截到 60 字，这里再兜底一次；
// prefers-reduced-motion 下不加 .pop 弹出动画，直接显示。
function say(text) {
  const line = String(text).slice(0, 60);
  if (!line) return;
  document.getElementById('bubble-text').textContent = line;
  bubble.title = line;
  bubble.classList.remove('pop');
  bubble.classList.add('show');
  if (!reduceMotion()) {
    void bubble.offsetWidth; // 重启动画
    bubble.classList.add('pop');
  }
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => bubble.classList.remove('show', 'pop'), SAY_SHOW_MS);
}

window.szuPet?.onState(setSprite);
window.szuPet?.onSay(say);
window.szuPet?.onAction(setBaseAction);
window.szuPet?.onScale(setScale);
window.szuPet?.onReaction(playOnce);
window.addEventListener('beforeunload',()=>{player?.destroy();clearTimeout(hideTimer)});

// 单击/右键打开菜单；拖动超过阈值时只移动，不误触菜单。
let pointer = null;
let lastWheel = 0;
pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  pointer = {id: event.pointerId, x: event.screenX, y: event.screenY, moved: false};
  pet.setPointerCapture(event.pointerId);
  window.szuPet?.drag('start', {x:event.screenX, y:event.screenY});
});
pet.addEventListener('pointermove', (event) => {
  if (!pointer || event.pointerId !== pointer.id) return;
  if (Math.hypot(event.screenX - pointer.x, event.screenY - pointer.y) > 5) pointer.moved = true;
  if (pointer.moved) {
    pet.classList.add('dragging');
    window.szuPet?.drag('move', {x:event.screenX, y:event.screenY});
  }
});
function endPointer(event) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const open = !pointer.moved && event.type === 'pointerup';
  pointer = null;
  pet.classList.remove('dragging');
  if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
  window.szuPet?.drag('end', {x:event.screenX, y:event.screenY});
  if (open) {playOnce('look');window.szuPet?.openMenu();}
}
pet.addEventListener('pointerup', endPointer);
pet.addEventListener('pointercancel', endPointer);
pet.addEventListener('contextmenu', (event) => {
  event.preventDefault();window.szuPet?.openMenu();
});
pet.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();window.szuPet?.openMenu();}
});
pet.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (!event.deltaY || Date.now() - lastWheel < 100) return;
  lastWheel = Date.now();
  window.szuPet?.scaleStep(event.deltaY < 0 ? 1 : -1);
}, {passive: false});
pet.addEventListener('lostpointercapture', (event) => {
  if (pointer) endPointer(event);
});
