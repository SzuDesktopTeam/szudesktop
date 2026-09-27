import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {GARDEN_DIR,GARDEN_ENGINE_ENTRY,GARDEN_ENGINE_RESOURCE,gardenEngineResources,moduleClosure,staticImports} from './garden-engine-deps.mjs';
import {appPaths,GARDEN_ENGINE_FILE} from './app-paths.mjs';
import {createPetController,PET_REFRESH_MS} from './pet-controller.mjs';
import {petWindowBounds,PET_WIDTH,PET_HEIGHT} from './pet-policy.mjs';
import {fakeDialog,fakeMenu,fakeScreen,fakeWindowClass} from './testdata/fake-electron.mjs';
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
// 用真实的庭院引擎、一份新存档和假窗口驱动 pet-controller（不启动 Electron）。
{
  const engine=await import('../assets/garden/engine.mjs');
  const data=engine.createState();
  data.game.active=1;data.game.pets[1].mood=88;data.game.pets[1].sleeping=false;
  data.game.focus={end:Date.now()+10*60_000,duration:25};data.preferences.motion=false;
  const area={x:0,y:0,width:1920,height:1080};
  const {FakeWindow,windows}=fakeWindowClass(),{Menu,built}=fakeMenu(),screen=fakeScreen(area);
  const observed=[],dispatched=[],published=[],saved=[],settingsPatches=[];let trays=0,snapshot={data};
  const pet=createPetController({BrowserWindow:FakeWindow,Menu,screen,dialog:fakeDialog(),platform:'win32',html:path.resolve('pet-view','pet.html'),preload:'/pet-preload.cjs',
    gardenEngine:Promise.resolve(engine),loadWorkspace:async()=>structuredClone(snapshot),readPreferences:()=>({petVisible:true,petAlwaysOnTop:true}),
    changeSettings:patch=>settingsPatches.push(patch),saveSettings:(scale,position)=>saved.push({scale,position}),isQuitting:()=>false,
    observeWorkspace:value=>observed.push(value),dispatch:command=>dispatched.push(command),refreshTray:()=>{trays++;},publishScale:scale=>published.push(scale),quit(){},
    setInterval:(_fn,ms)=>{assert.equal(ms,PET_REFRESH_MS);return {unref(){}};},clearInterval(){}});
  await pet.create();
  const petWin=windows[0],pwc=petWin.webContents;
  // 绝不开启原生缩放（透明窗原生缩放在 Windows 上不可靠）。
  assert.equal(petWin.options.resizable,false);
  const expected=engine.settle(engine.normalize(structuredClone(data))),companion=expected.game.pets[1];
  assert.equal(observed.length,1,'the pet refresh also feeds the focus reminder');
  assert.equal(pwc.last('pet:state'),engine.petSprite(companion));
  const action=pwc.last('pet:action');
  assert.deepEqual(Object.keys(action).sort(),['energy','focus','mood','motion','sleeping','species']);
  assert.equal(action.species,'chestnut','主进程必须推送真实伙伴');
  assert.ok(Math.abs(action.mood-companion.mood)<0.01&&Math.abs(action.energy-companion.energy)<0.01,'主进程必须推送真实心情和精力');
  assert.equal(action.focus,true);assert.equal(action.motion,false);assert.equal(action.sleeping,false);
  assert.equal(pwc.last('pet:say'),'我是栗栗。点击我打开菜单，拖动我换个位置。');
  // 缩放按窗口实际尺寸取较小值，保证小屏上也放得下。
  const fit=bounds=>Math.min(pet.scale(),bounds.width/PET_WIDTH,bounds.height/PET_HEIGHT);
  assert.equal(pwc.last('pet:scale'),fit(petWin.getBounds()),'主进程必须推送适合当前屏幕的缩放');
  // 招呼只说一次；专注结束、恢复动态效果照实推送。
  snapshot.data.game.focus=null;snapshot.data.preferences.motion=true;
  const says=()=>pwc.sent.filter(([name])=>name==='pet:say').length,greetings=says();
  await pet.pushState();
  assert.equal(pwc.last('pet:action').focus,false);assert.equal(pwc.last('pet:action').motion,true);assert.equal(says(),greetings);
  // 存档读不到时如实不推，不伪造状态。
  const sentBefore=pwc.sent.length;snapshot={data:null};await pet.pushState();assert.equal(pwc.sent.length,sentBefore);
  snapshot={data};
  // 菜单：照顾动作、切换伙伴、打开页面都交给主窗执行。
  await pet.openMenu();
  const menu=built.at(-1);
  assert.equal(menu.getMenuItemById('chat').label,'聊两句');
  assert.equal(menu.getMenuItemById('feed').label,`喂食（剩余 ${expected.game.food} 份）`);
  assert.equal(menu.getMenuItemById('switchPet:1').checked,true);
  menu.getMenuItemById('chat').click();menu.getMenuItemById('garden').click();
  menu.getMenuItemById('switchPet:1').click();menu.getMenuItemById('switchPet:0').click();
  assert.deepEqual(dispatched,['chat','garden','switchPet:0'],'picking the current companion sends nothing');
  menu.find('隐藏宠物').click();assert.deepEqual(settingsPatches,[{petVisible:false}]);
  // 主窗执行完指令后：先刷新，再说结果；只有成功且带动作时才播放反应。
  await pet.showResult({ok:true,message:'吃饱啦',action:'eat'});
  assert.equal(pwc.last('pet:say'),'吃饱啦');assert.equal(pwc.last('pet:react'),'eat');
  const reactions=()=>pwc.sent.filter(([name])=>name==='pet:react').length,reacted=reactions();
  await pet.showResult({ok:false,message:'食物不够了',action:'eat'});
  assert.equal(pwc.last('pet:say'),'食物不够了');assert.equal(reactions(),reacted);
  // 改大小：底边和水平中心不动，写进设置，刷新托盘并通知主窗滑杆。
  const previous=petWin.getBounds(),size=petWindowBounds(area,1.5);
  const scaled=petWindowBounds(area,1.5,{x:previous.x+(previous.width-size.width)/2,y:previous.y+previous.height-size.height});
  const traysBefore=trays;
  assert.equal(pet.applyScale(1.5),1.5);
  assert.deepEqual(petWin.getBounds(),scaled);assert.deepEqual(saved.at(-1),{scale:1.5,position:{x:scaled.x,y:scaled.y}});
  assert.equal(trays,traysBefore+1);assert.deepEqual(published,[1.5]);assert.equal(pwc.last('pet:scale'),fit(scaled));
  pet.stepScale(1);assert.equal(pet.scale(),1.6);assert.equal(pet.applyScale(9),2);
  // 显示器缩放、增减后按保存的位置与当前缩放重算，保持可见。
  pet.watchDisplays();
  const kept=petWin.getBounds();
  for(const name of ['display-metrics-changed','display-removed','display-added']){
    petWin.setBounds({x:-9999,y:-9999,width:1,height:1});screen.emit(name);
    assert.deepEqual(petWin.getBounds(),petWindowBounds(area,pet.scale(),{x:kept.x,y:kept.y}),'显示器变化必须保持可见位置：'+name);
  }
  // 大小写不进配置目录时如实告诉用户。
  const failing=createPetController({BrowserWindow:FakeWindow,Menu,screen,dialog:fakeDialog(),platform:'win32',html:path.resolve('pet-view','pet.html'),preload:'/pet-preload.cjs',
    gardenEngine:Promise.resolve(engine),loadWorkspace:async()=>({data:null}),readPreferences:()=>({petVisible:true,petAlwaysOnTop:true}),changeSettings(){},
    saveSettings:()=>{throw Error('只读目录');},isQuitting:()=>false,observeWorkspace(){},dispatch(){},refreshTray(){},publishScale(){},quit(){},
    setInterval:()=>({unref(){}}),clearInterval(){}});
  await failing.create();failing.changeSize(1.4);
  assert.equal(windows.at(-1).webContents.last('pet:say'),'大小没有保存成功，请检查本机配置目录后再试。');assert.equal(failing.scale(),1);
}

// 主窗桥：读回当前值 + 写回归一化值，且不得把宠物大小写进 Go workspace。
const mainPreload=read('preload.cjs');
assert.match(mainPreload,/petScale: \(\) =>/);
assert.match(mainPreload,/setPetScale: \(value\) =>/);

// The bridge drops Electron events and extra data, but keeps the action/species
// required for animation. A failed or malformed result must not become a gesture.
let bridge;const listeners=new Map(),sent=[];
vm.runInNewContext(preload,{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value}},ipcRenderer:{on:(channel,fn)=>listeners.set(channel,fn),send:(...args)=>sent.push(args)}})});
const states=[],reactions=[];bridge.onAction(value=>states.push(value));bridge.onReaction(value=>reactions.push(value));
listeners.get('pet:action')({private:true},{species:'pingu',mood:88,energy:70,sleeping:false,focus:true,motion:false,secret:'excluded'});
assert.deepEqual(JSON.parse(JSON.stringify(states)),[{species:'pingu',mood:88,energy:70,sleeping:false,focus:true,motion:false}]);
for(const action of ['eat','celebrate','wake',{},'../secret',''])listeners.get('pet:react')({private:true},action);
assert.deepEqual(reactions,['eat','celebrate','wake']);
// 点击穿透只暴露一个布尔开关：指针是否停在立绘上。
for(const value of [true,false,'true',1,null,{inside:true}])bridge.hit(value);
assert.deepEqual(JSON.parse(JSON.stringify(sent)),[['pet:hit',true],['pet:hit',false]]);
assert.deepEqual(Object.keys(bridge).sort(),['drag','hit','onAction','onReaction','onSay','onScale','onState','openMenu','scaleStep'],'pet bridge stays minimal');
assert.match(render,/pet\.addEventListener\('pointerenter', \(\) => window\.szuPet\?\.hit\(true\)\);/);
assert.match(render,/pet\.addEventListener\('pointerleave', \(\) => window\.szuPet\?\.hit\(false\)\);/);
assert.match(html,/#bubble \{[^}]*pointer-events: none;/,'the speech bubble never blocks clicks underneath');

const packaging=read('electron-builder.yml');
for(const name of ['pet-player.mjs','pet-animation.mjs','pet-animation-art.mjs','pet-dialogue.mjs'])assert.ok(packaging.includes('      - '+name),'renderer package needs '+name);
assert.ok(packaging.includes('to: licenses/2048-MIT.txt'),'the adapted game license ships in the installer');

// 安装版引擎依赖由静态 import 图自动得出：对实际解析结果断言，并按安装后的目录结构真正加载一次。
assert.deepEqual(staticImports("import {a,\n b} from './a.mjs';\nexport * from \"./b.mjs\";\nexport {c as d} from './c.mjs';\nimport './side.mjs';\n// import {x} from './commented.mjs';\nconst s='from ./nope.mjs';"),['./a.mjs','./b.mjs','./c.mjs','./side.mjs']);
assert.throws(()=>staticImports("const m=await import('./late.mjs');"),/动态 import/);
const engineFiles=gardenEngineResources();
const engineTargets=engineFiles.map(item=>item.to);
assert.equal(engineFiles[0].to,GARDEN_ENGINE_RESOURCE,'engine entry keeps the resource name main.mjs loads');
assert.equal(engineFiles[0].from,GARDEN_ENGINE_ENTRY);
for(const name of ['pet-catalog.mjs','pet-dialogue.mjs','puzzle2048.mjs','garden-orders.mjs','garden-loop.mjs'])assert.ok(engineTargets.includes(name),'engine package needs '+name);
assert.equal(new Set(engineTargets).size,engineTargets.length);
for(const {from} of engineFiles)for(const specifier of staticImports(readFileSync(from,'utf8'))){
  const target=path.relative(GARDEN_DIR,path.resolve(path.dirname(from),specifier)).split(path.sep).join('/');
  assert.ok(engineTargets.includes(target),`${path.basename(from)} imports ${specifier}, which must be packaged`);
}
const packagedEngine=mkdtempSync(path.join(tmpdir(),'szu-garden-engine-'));
try{
  for(const {from,to} of engineFiles){mkdirSync(path.dirname(path.join(packagedEngine,to)),{recursive:true});copyFileSync(from,path.join(packagedEngine,to));}
  const engine=await import(pathToFileURL(path.join(packagedEngine,GARDEN_ENGINE_RESOURCE)).href);
  for(const name of ['settle','normalize','petSprite'])assert.equal(typeof engine[name],'function',`packaged engine exports ${name}`);
}finally{rmSync(packagedEngine,{recursive:true,force:true});}
const fakeGarden=path.join(tmpdir(),'szu-fake-garden');
const fakeFiles={[path.join(fakeGarden,'engine.mjs')]:"import {a} from './a.mjs';",[path.join(fakeGarden,'a.mjs')]:"import {e} from './engine.mjs';"};
const fakeIO={root:fakeGarden,read:file=>fakeFiles[file],exists:file=>Object.hasOwn(fakeFiles,file)};
assert.throws(()=>gardenEngineResources({entry:path.join(fakeGarden,'engine.mjs'),...fakeIO}),/反向导入/);
fakeFiles[path.join(fakeGarden,'a.mjs')]="import {b} from './nested/b.mjs';";fakeFiles[path.join(fakeGarden,'nested','b.mjs')]='export const b=1;';
assert.deepEqual(gardenEngineResources({entry:path.join(fakeGarden,'engine.mjs'),...fakeIO}).map(item=>item.to),[GARDEN_ENGINE_RESOURCE,'a.mjs','nested/b.mjs'],'a new relative import is packaged automatically');
assert.throws(()=>moduleClosure(path.join(fakeGarden,'engine.mjs'),{...fakeIO,read:()=>"import {x} from './missing.mjs';"}),/不存在/);
assert.throws(()=>moduleClosure(path.join(GARDEN_DIR,'engine.mjs'),{read:()=>"import three from 'three';"}),/相对路径/);
assert.throws(()=>moduleClosure(path.join(GARDEN_DIR,'engine.mjs'),{read:()=>"import {x} from '../../electron/main.mjs';"}),/庭院目录之外/);
// 构建脚本使用同一份解析结果；yml 不再手写引擎清单，避免两处漂移。
const builder=read('build.mjs');
assert.match(builder,/import \{gardenEngineResources\} from '\.\/garden-engine-deps\.mjs';/);
assert.match(builder,/extends:'file:'\+path\.join\(here,'electron-builder\.yml'\),extraResources:engine/);
assert.match(builder,/'--config',config,/);
const packagingEntries=packaging.split(/\r?\n/).filter(line=>!/^\s*#/.test(line)).join('\n');
for(const {from,to} of engineFiles){
  assert.ok(!packagingEntries.includes('to: '+to+'\n')&&!packagingEntries.includes('/garden/'+path.basename(from)+'\n    to:'),`${to} is resolved by build.mjs, not hand-listed in electron-builder.yml`);
}
// 安装版从 resources 下同名文件加载引擎，开发时直接用源模块。
assert.equal(GARDEN_ENGINE_FILE,GARDEN_ENGINE_RESOURCE,'app-paths loads the resource name build.mjs writes');
assert.equal(appPaths({isPackaged:true,resourcesPath:path.resolve('resources'),here:path.resolve('app.asar'),platform:'win32'}).gardenEngine,path.join(path.resolve('resources'),GARDEN_ENGINE_RESOURCE));
assert.equal(appPaths({isPackaged:false,resourcesPath:'',here:fileURLToPath(here),platform:'win32'}).gardenEngine,GARDEN_ENGINE_ENTRY);
console.log('Pet view: shared frame player, scale variables, IPC reactions, click-through bridge and resolved engine dependencies passed');
