import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PET_ACTIONS,PET_CLIPS} from '../assets/garden/pet-animation.mjs';
import {PETS,PET_MOODS,PET_SPRITES} from '../assets/garden/pet-catalog.mjs';
import {PET_SYMBOLS} from '../assets/garden/pet-art.mjs';

const here = new URL('.', import.meta.url);
const read = name => readFileSync(new URL(name, here), 'utf8');
const html = read('pet.html');
const render = read('pet-render.mjs');
const preload = read('pet-preload.cjs');
const gardenHTML = read('../index.html');
const frames=new Map([...PET_SYMBOLS.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g)].map(([,attrs,body])=>[
 attrs.match(/\bid="([^"]+)"/)?.[1],{attrs,body},
]));
assert.equal(frames.size,[...PET_SYMBOLS.matchAll(/<symbol\b/g)].length,'立绘 ID 不得重复');
assert.deepEqual([...frames.keys()].sort(),Object.keys(PET_SPRITES).sort(),'名册与画稿必须一一对应');
for (const [id,viewBox] of Object.entries(PET_SPRITES)) {
  const frame=frames.get(id);
  assert.equal(frame?.attrs.match(/\bviewBox="([^"]+)"/)?.[1],viewBox,`${id} 的画布必须匹配名册`);
  assert.doesNotMatch(frame.body,/<use\b/,`${id} 应可独立导出明信片`);
  const definition = new RegExp(`<symbol\\b[^>]*\\bid="${id}"`);
  assert.doesNotMatch(html,definition,`桌宠不应重复维护 ${id}`);
  assert.doesNotMatch(gardenHTML,definition,`庭院不应重复维护 ${id}`);
}
for(const [species,spec] of Object.entries(PETS)){
 if(!spec.states)continue;
 const states=PET_MOODS.map(state=>frames.get(`${spec.sprite}-${state}`).body);
 assert.equal(new Set(states).size,PET_MOODS.length,`${species} 四帧必须各有形态`);
}
for(const page of [html,gardenHTML])assert.match(page,/<defs\b[^>]*\bid="pet-sprites"/,'两处界面都需共享立绘挂载点');
assert.match(render,/from ['"]\.\/pet-art\.mjs['"]/,'桌宠必须加载共享画稿');
assert.match(render,/from ['"]\.\/pet-catalog\.mjs['"]/,'桌宠必须加载共享名册');
assert.match(render,/PET_SPRITES/,'桌宠视框必须来自名册');

// 两个窗口使用真实逐帧画稿，旧的整图缩放/晃动动画不得叠在新动画上。
assert.doesNotMatch(html,/@keyframes pet-|animation:\s*pet-/);
assert.match(render,/from ['"]\.\/pet-player\.mjs['"]/);
assert.match(render,/createPetPlayer\(pet,\{pet:currentPet/);
assert.match(render,/player\.setPet\(currentPet,options\)/);
for(const species of Object.keys(PETS))for(const action of PET_ACTIONS)assert.ok(PET_CLIPS[species][action].frames.length>=4);

// 缩放必须经由 CSS 变量，且默认值为 1。
assert.match(html,/:root\s*\{\s*--pet-scale:\s*1;/);
assert.ok(html.includes('calc(150px * var(--pet-scale))'), '立绘宽高必须随缩放变化');
assert.ok(html.includes('calc(232px * var(--pet-scale))'), '气泡宽度必须随缩放变化');

// CSP 不变：禁内联脚本、default-src 'none'。
assert.match(html,/default-src 'none'/);
assert.match(html,/script-src 'self'/);
assert.doesNotMatch(html,/onclick=/);

// 减少动态效果时气泡不弹出；角色帧由共享播放器降为静态。
assert.match(html,/@media \(prefers-reduced-motion: reduce\)/);
assert.match(html,/#bubble\.pop \{ animation: none; \}/);

// 渲染层只选状态，不自己发请求。
assert.doesNotMatch(render, /\bfetch\s*\(/, '宠物窗渲染层不得发网络请求');

// 一次性动作播放期间不得被主进程轮询打断。
assert.match(render,/if \(player \|\| !Object\.hasOwn\(VIEW_BOX, key\)\) return;/);
assert.match(render,/window\.szuPet\?\.onReaction\(playOnce\)/);

// preload 不暴露任意设置值或 IPC；仅允许固定的缩放步进、拖动阶段和菜单请求。
assert.match(preload,/onScale: \(cb\) =>/);
assert.match(preload,/onAction: \(cb\) =>/);
assert.doesNotMatch(preload,/setPetScale|pet-scale-set/, '宠物窗不得拥有任意设置写入能力');
assert.match(preload,/direction === 1 \|\| direction === -1/);
assert.match(preload,/\['start', 'move', 'end'\]\.includes\(phase\)/);
assert.match(render,/pointer\.moved/,'拖动后不得误开菜单');
assert.match(html,/aria-haspopup="menu"/);

// 设置页滑杆必须被 electron 门禁，浏览器模式下不得出现。
const app=read('../assets/garden/app.mjs');
assert.match(app,/from ['"]\.\/pet-art\.mjs['"]/,'庭院必须加载相同画稿');
for(const renderer of [app,render]){
 assert.match(renderer,/['"]pet-sprites['"]/,'渲染层需使用共享立绘挂载点');
 assert.match(renderer,/\.innerHTML\s*=\s*PET_SYMBOLS/,'共享立绘必须实际挂载到页面');
}
const settings=app.slice(app.indexOf('function settings(){'),app.indexOf('function render(){'));
assert.match(settings,/globalThis\.szuDesktop\?\.shell==='electron'/,'滑杆必须只在安装版渲染');
assert.ok(settings.includes('id="pet-scale"'),'设置页缺少宠物大小滑杆');
assert.ok(settings.includes('id="pet-scale-value"'),'设置页缺少百分比显示');
assert.ok(settings.includes('min="0.4"')&&settings.includes('max="2"'),'滑杆范围必须与 PET_SCALE_MIN/MAX 一致');

// 主进程推物种和上下文，具体动作/时序由两个窗口共享的播放器决定。
const main=read('main.mjs');
assert.match(main,/sendPet\('pet:action',\{species:pet\.species,mood:Number\(pet\.mood\)/,'主进程必须推送真实伙伴和心情');
assert.match(main,/motion:workspace\.preferences\.motion!==false/);
assert.match(main,/focus:Boolean\(game\.focus&&game\.focus\.end>Date\.now\(\)\)/);
assert.match(main,/care\('聊两句','chat'\)/);
assert.match(main,/sendPet\('pet:react',result\.action\)/);
assert.match(main,/sendPet\('pet:scale',Math\.min\(petScale/,'主进程必须推送适合当前屏幕的缩放');
assert.match(main,/ipcMain\.handle\('szu:pet-scale-get'/);
assert.match(main,/ipcMain\.handle\('szu:pet-scale-set'/);
assert.match(main,/screen\.on\('display-metrics-changed'/,'DPI 变化必须重算布局');
// 绝不开启原生缩放。
assert.doesNotMatch(main,/resizable:\s*true/);
assert.match(main,/petWin\.setBounds\(petWindowBounds\(workArea,petScale,petPosition\)\)/,'显示器变化必须保持可见位置');

// 主窗桥：读回当前值 + 写回归一化值，且不得把宠物大小写进 Go workspace。
const mainPreload=read('preload.cjs');
assert.match(mainPreload,/petScale: \(\) =>/);
assert.match(mainPreload,/setPetScale: \(value\) =>/);

// The bridge drops Electron events and extra data, but keeps the action/species
// required for animation. A failed or malformed result must not become a gesture.
let bridge;const listeners=new Map();
vm.runInNewContext(preload,{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value}},ipcRenderer:{on:(channel,fn)=>listeners.set(channel,fn),send(){}}})});
const states=[],reactions=[];bridge.onAction(value=>states.push(value));bridge.onReaction(value=>reactions.push(value));
listeners.get('pet:action')({private:true},{species:'pingu',mood:88,energy:70,sleeping:false,focus:true,motion:false,secret:'excluded'});
assert.deepEqual(JSON.parse(JSON.stringify(states)),[{species:'pingu',mood:88,energy:70,sleeping:false,focus:true,motion:false}]);
for(const action of ['eat','celebrate','wake',{},'../secret',''])listeners.get('pet:react')({private:true},action);
assert.deepEqual(reactions,['eat','celebrate','wake']);

const packaging=read('electron-builder.yml');
for(const name of ['pet-player.mjs','pet-animation.mjs','pet-animation-art.mjs','pet-dialogue.mjs'])assert.ok(packaging.includes('      - '+name),'renderer package needs '+name);
for(const name of ['pet-dialogue.mjs','puzzle2048.mjs','garden-orders.mjs'])assert.ok(packaging.includes('    to: '+name),'engine package needs '+name);
assert.ok(packaging.includes('to: licenses/2048-MIT.txt'),'the adapted game license ships in the installer');
console.log('Pet view: shared frame player, scale variables, IPC reactions and packaged dependencies passed');
