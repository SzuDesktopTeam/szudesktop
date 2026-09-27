import assert from 'node:assert/strict';
import {petSprite} from '../assets/garden/engine.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPetController} from './pet-controller.mjs';
import {registerIpcRoutes} from './ipc-routes.mjs';
import {FakeIpcMain,fakeDialog,fakeMenu,fakeScreen,fakeWindowClass} from './testdata/fake-electron.mjs';
import {petWindowOptions,petWindowBounds,petScaleClamp,petSay,petSpriteFor,activePetOf,isPetSender,petIgnoresMouse,petClickThroughSupported,pointInBounds,PET_WIDTH,PET_HEIGHT,PET_MARGIN,PET_SAY_MAX,PET_SCALE_MIN,PET_SCALE_MAX,PET_SCALE_DEFAULT,PET_SCALE_PRESETS,petPresetFor} from './pet-policy.mjs';

// 窗口选项：spec §7 的每一项都要钉死。
const wa={x:0,y:0,width:1920,height:1080};
const o=petWindowOptions(wa);
assert.equal(o.frame,false);
assert.equal(o.transparent,true);
assert.equal(o.alwaysOnTop,true);
assert.equal(o.skipTaskbar,true);
assert.equal(o.resizable,false);
assert.equal(o.focusable,false);
assert.equal(o.hasShadow,false);
assert.equal(o.width,PET_WIDTH);
assert.equal(o.height,PET_HEIGHT);
// 贴主工作区右下角（留 PET_MARGIN 边距）。
assert.equal(o.x,wa.x+wa.width-PET_WIDTH-PET_MARGIN);
assert.equal(o.y,wa.y+wa.height-PET_HEIGHT-PET_MARGIN);
// 副屏 workArea 的原点非 0 时也要算对。
const wa2={x:1920,y:-300,width:1280,height:1024};
const o2=petWindowOptions(wa2);
assert.equal(o2.x,1920+1280-PET_WIDTH-PET_MARGIN);
assert.equal(o2.y,-300+1024-PET_HEIGHT-PET_MARGIN);

// 台词：60 字上限，镜像 engine.mjs 的 say()。
assert.equal(petSay('嗨，我是荔宝！'),'嗨，我是荔宝！');
assert.equal(petSay('a'.repeat(PET_SAY_MAX)).length,PET_SAY_MAX);
assert.equal(petSay('a'.repeat(PET_SAY_MAX)).length,60);
assert.equal(petSay('荔'.repeat(61)),'荔'.repeat(60));
assert.equal(petSay('b'.repeat(120)).length,60);
assert.equal(petSay(2026),'2026');

// 立绘映射：荔宝与栗栗都按 sleeping/mood 四帧。
assert.equal(petSpriteFor({species:'libao',mood:5,sleeping:true}),'libao-sleep');
assert.equal(petSpriteFor({species:'libao',mood:34}),'libao-sad');
assert.equal(petSpriteFor({species:'libao',mood:35}),'libao-normal');
assert.equal(petSpriteFor({species:'libao',mood:65}),'libao-normal');
assert.equal(petSpriteFor({species:'libao',mood:66}),'libao-happy');
for(const species of ['egret','turtle'])for(const [mood,sleeping,state] of [[34,false,'sad'],[35,false,'normal'],[65,false,'normal'],[66,false,'happy'],[90,true,'sleep']]){
  const pet={species,mood,sleeping};
  assert.equal(petSpriteFor(pet),`${species}-${state}`);
  assert.equal(petSpriteFor(pet),petSprite(pet),'庭院和桌面伙伴状态必须一致');
}
assert.equal(petSpriteFor({species:'chestnut',sleeping:true,mood:90}),'cat-sleep');
assert.equal(petSpriteFor({species:'chestnut',sleeping:false,mood:34}),'cat-sad');
assert.equal(petSpriteFor({species:'chestnut',sleeping:false,mood:35}),'cat-normal');
assert.equal(petSpriteFor({species:'chestnut',sleeping:false,mood:50}),'cat-normal');
assert.equal(petSpriteFor({species:'chestnut',sleeping:false,mood:65}),'cat-normal');
assert.equal(petSpriteFor({species:'chestnut',sleeping:false,mood:66}),'cat-happy');
// 未知/缺失种类回退默认荔宝（与 engine 的 PETS[DEFAULT_PET] 兜底一致）。
assert.equal(petSpriteFor({species:'unknown',sleeping:false,mood:90}),'libao-happy');
assert.equal(petSpriteFor({}),'libao-normal');

// activePet：镜像 engine.mjs 的 activePet()，读不到返回 null 不伪造。
const pets=[{species:'libao'},{species:'chestnut',mood:90,sleeping:false}];
assert.equal(activePetOf({pets,active:1}),pets[1]);
assert.equal(activePetOf({pets,active:9}),pets[0]);
assert.equal(activePetOf({pets:[]}),null);
assert.equal(activePetOf(null),null);
assert.equal(activePetOf({}),null);

// 可信来源：结构与 check-window-policy.mjs 的 isTrustedSender 测试一致。
const petUrl='file:///D:/szudesktop/desktop/electron/pet.html';
const frame={url:petUrl},wc={mainFrame:frame},win={webContents:wc};
assert.equal(isPetSender({sender:wc,senderFrame:frame},win,petUrl),true);
assert.equal(isPetSender({sender:wc,senderFrame:{url:petUrl}},win,petUrl),false);
assert.equal(isPetSender({sender:{},senderFrame:frame},win,petUrl),false);
assert.equal(isPetSender({sender:wc,senderFrame:frame},null,petUrl),false);
frame.url='https://szu.edu.cn/';
assert.equal(isPetSender({sender:wc,senderFrame:frame},win,petUrl),false);
frame.url='file:///D:/evil/pet.html';
assert.equal(isPetSender({sender:wc,senderFrame:frame},win,petUrl),false);

// 缩放：归一化。越界夹紧、非有限值回落默认、保留 2 位小数。
assert.equal(petScaleClamp(0.4),0.4);
assert.equal(petScaleClamp(2),2);
assert.equal(petScaleClamp(0.1),PET_SCALE_MIN);
assert.equal(petScaleClamp(9),PET_SCALE_MAX);
assert.equal(petScaleClamp(1.23456),1.23);
assert.equal(petScaleClamp('1.5'),1.5);
assert.equal(petScaleClamp(NaN),PET_SCALE_DEFAULT);
// ±Infinity 也不是有限数，和 NaN 一样回落默认值——不会悄悄变成 2.0。
assert.equal(petScaleClamp(Infinity),PET_SCALE_DEFAULT);
assert.equal(petScaleClamp(-Infinity),PET_SCALE_DEFAULT);
assert.equal(petScaleClamp(undefined),PET_SCALE_DEFAULT);
// Number(null)===0 是有限数，会被夹到下界而不是回落默认值——这是有意行为，钉死它。
assert.equal(petScaleClamp(null),PET_SCALE_MIN);
assert.equal(petScaleClamp({}),PET_SCALE_DEFAULT);

// 预设档位：三个、id 唯一、scale 都在合法区间内。
assert.deepEqual(PET_SCALE_PRESETS.map(p=>p.id),['small','medium','large']);
assert.equal(new Set(PET_SCALE_PRESETS.map(p=>p.id)).size,3);
for(const p of PET_SCALE_PRESETS){
  assert.ok(p.scale>=PET_SCALE_MIN&&p.scale<=PET_SCALE_MAX,p.id);
  assert.equal(petScaleClamp(p.scale),p.scale,p.id);
}

// 窗口几何：基准 × scale，贴 workArea 右下角。
const b1=petWindowBounds(wa,1);
assert.deepEqual(b1,{x:1636,y:736,width:260,height:320});
const bSmall=petWindowBounds(wa,0.4);
assert.deepEqual(bSmall,{x:1792,y:928,width:104,height:128});
const bLarge=petWindowBounds(wa,2);
assert.deepEqual(bLarge,{x:1376,y:416,width:520,height:640});
// 副屏 workArea 原点非 0。
assert.deepEqual(petWindowBounds(wa2,1),{x:2916,y:380,width:260,height:320});
// 右下角锚定：scale 变化时右边缘与下边缘不动。
for(const s of [0.4,0.6,1,1.5,2]){
  const b=petWindowBounds(wa,s);
  assert.equal(b.x+b.width,wa.width-PET_MARGIN,`scale ${s} 右边缘`);
  assert.equal(b.y+b.height,wa.height-PET_MARGIN,`scale ${s} 下边缘`);
}
// 极端 scale 也不产生 0 或负尺寸。
for(const s of [PET_SCALE_MIN,PET_SCALE_MAX]){
  const b=petWindowBounds(wa,s);
  assert.ok(b.width>0&&b.height>0);
}

// 向后兼容：不传 scale 必须与今天的输出逐字段相同。
const legacy=petWindowOptions(wa);
assert.equal(legacy.width,PET_WIDTH);
assert.equal(legacy.height,PET_HEIGHT);
assert.equal(legacy.x,wa.x+wa.width-PET_WIDTH-PET_MARGIN);
assert.equal(legacy.y,wa.y+wa.height-PET_HEIGHT-PET_MARGIN);
assert.equal(legacy.frame,false);
assert.equal(legacy.resizable,false);
// 传 scale 时窗口尺寸随之变化，安全项不变。
const scaled=petWindowOptions(wa,2);
assert.equal(scaled.width,520);
assert.equal(scaled.height,640);
assert.equal(scaled.x,1376);
assert.equal(scaled.y,416);
assert.equal(scaled.resizable,false);
assert.equal(scaled.focusable,false);
assert.equal(scaled.transparent,true);
// workArea 缺字段时不抛异常。
const partial=petWindowBounds({width:1920,height:1080},1);
assert.deepEqual(partial,{x:1636,y:736,width:260,height:320});

// 拖动后的位置恢复；放大或断开副屏后，整个窗口仍留在目标工作区。
assert.deepEqual(petWindowBounds(wa,1,{x:200,y:300}),{x:200,y:300,width:260,height:320});
assert.deepEqual(petWindowBounds(wa,2,{x:1700,y:900}),{x:1400,y:440,width:520,height:640});
assert.deepEqual(petWindowBounds(wa,1,{x:-1200,y:-900}),{x:0,y:0,width:260,height:320});
assert.deepEqual(petWindowBounds(wa2,1,{x:2100.4,y:-299.6}),{x:2100,y:-300,width:260,height:320});
assert.equal(petWindowOptions(wa,1,{x:100,y:200}).x,100);
assert.equal(petWindowOptions(wa,1,{x:100,y:200}).y,200);
// 只接受完整的有限数坐标；旧配置和无效位置仍按默认停靠。
for(const position of [undefined,null,{}, {x:5}, {x:5,y:Infinity}, {x:'5',y:6}]){
  assert.deepEqual(petWindowBounds(wa,1,position),b1);
}
// 极小工作区按比例收缩有效尺寸，不能因 24px 留白或负坐标被挤出屏幕。
const tiny={x:-100,y:50,width:100,height:80};
assert.deepEqual(petWindowBounds(tiny,2,{x:999,y:-999}),{x:-65,y:50,width:65,height:80});
for(const area of [tiny,{x:20,y:-40,width:260,height:320},{width:1,height:1},{}]){
  const b=petWindowBounds(area,2,{x:-99999,y:99999});
  const x=area.x||0,y=area.y||0,width=area.width||1,height=area.height||1;
  assert.ok(b.x>=x&&b.y>=y,'窗口左上角在工作区内');
  assert.ok(b.x+b.width<=x+width&&b.y+b.height<=y+height,'窗口右下角在工作区内');
  assert.ok(b.width>=1&&b.height>=1,'窗口尺寸始终为正');
}

// 逐帧动作与物种节奏由共享 check-pet-animation.mjs 覆盖。

// 预设反查：命中档位返回 id，自定义值返回 null。
assert.equal(petPresetFor(0.6),'small');
assert.equal(petPresetFor(1),'medium');
assert.equal(petPresetFor(1.5),'large');
assert.equal(petPresetFor(1.23),null);
assert.equal(petPresetFor(0.4),null);
assert.equal(petPresetFor(NaN),null);

// 点击穿透：透明窗默认不拦截下层点击；指针在立绘上、拖动中或菜单打开时才接收。
assert.equal(petIgnoresMouse(),true);
assert.equal(petIgnoresMouse({}),true);
assert.equal(petIgnoresMouse({hit:true}),false);
assert.equal(petIgnoresMouse({dragging:true}),false,'drag keeps the window clickable even if the pointer outruns it');
assert.equal(petIgnoresMouse({menu:true}),false,'menu keeps the window clickable');
assert.equal(petIgnoresMouse({hit:'yes',dragging:1,menu:{}}),true,'only real booleans enable clicks');
assert.equal(petClickThroughSupported('win32'),true);
assert.equal(petClickThroughSupported('darwin'),true);
assert.equal(petClickThroughSupported('linux'),false,'Linux cannot forward mouse moves, keep the old clickable window');
const petBox={x:10,y:20,width:260,height:320};
for(const point of [{x:10,y:20},{x:269,y:339},{x:140,y:180}])assert.equal(pointInBounds(point,petBox),true,JSON.stringify(point));
for(const point of [{x:9,y:20},{x:270,y:100},{x:100,y:340},{x:NaN,y:30},null,{}])assert.equal(pointInBounds(point,petBox),false,JSON.stringify(point));
assert.equal(pointInBounds({x:1,y:1},null),false);
/// 宠物窗接线（pet-controller + ipc-routes，用假窗口运行，不启动 Electron）：创建即穿透、只收布尔、只认宠物窗，
// 拖动开始/结束与菜单开关都会重新计算。
const petHtml=path.resolve('pet-check','pet.html'),petHtmlUrl=pathToFileURL(petHtml).href;
function petWiring(platform,overrides={}){
  const {FakeWindow,windows}=fakeWindowClass(),{Menu,built}=fakeMenu(),screen=fakeScreen(wa),ipc=new FakeIpcMain(),saved=[];
  const pet=createPetController({BrowserWindow:FakeWindow,Menu,screen,dialog:fakeDialog(),platform,html:petHtml,preload:'/pet-preload.cjs',
    gardenEngine:Promise.resolve({}),loadWorkspace:async()=>({data:null}),readPreferences:()=>({petVisible:true,petAlwaysOnTop:true}),
    changeSettings(){},saveSettings:(scale,position)=>saved.push({scale,position}),isQuitting:()=>false,observeWorkspace(){},
    dispatch(){},refreshTray(){},publishScale(){},quit(){},setInterval:()=>({unref(){}}),clearInterval(){},...overrides});
  registerIpcRoutes({ipcMain:ipc,app:{},isTrusted:()=>false,quit:{},pet,preferences:{},getOfficial:()=>null});
  return {pet,windows,built,screen,ipc,saved};
}
{
  const linux=petWiring('linux');await linux.pet.create();
  assert.deepEqual(linux.windows[0].mouse,[],'Linux keeps the whole window clickable');
  const {pet,windows,built,screen,ipc,saved}=petWiring('win32');
  assert.equal(pet.isSender({sender:{},senderFrame:{url:petHtmlUrl}}),false,'no pet window yet');
  await pet.create();
  const petWin=windows[0],pwc=petWin.webContents;
  assert.deepEqual(petWin.options.webPreferences,{preload:'/pet-preload.cjs',contextIsolation:true,nodeIntegration:false,sandbox:true});
  assert.deepEqual(petWin.loaded,[petHtml]);assert.equal(petWin.visible,true);assert.equal(petWin.level,'screen-saver');
  // 宠物窗不加载任何远程内容：拦截一切导航与新窗请求。
  assert.deepEqual(pwc.openHandler({url:'https://evil.test/'}),{action:'deny'});
  for(const name of ['will-navigate','will-redirect']){let prevented=false;pwc.emit(name,{preventDefault(){prevented=true;}},'https://evil.test/');assert.ok(prevented,name);}
  pwc.mainFrame.url=petHtmlUrl;
  const petEvent={sender:pwc,senderFrame:pwc.mainFrame},last=()=>petWin.mouse.at(-1);
  assert.deepEqual(petWin.mouse[0],{ignore:true,forward:true},'new pet windows start click-through with forwarded moves');
  ipc.emit('pet:hit',petEvent,true);assert.equal(last().ignore,false,'pointer over the pet accepts clicks');
  ipc.emit('pet:hit',petEvent,false);assert.equal(last().ignore,true,'leaving the pet restores click-through');
  const before=petWin.mouse.length;
  for(const value of ['true',1,null,{}])ipc.emit('pet:hit',petEvent,value);
  ipc.emit('pet:hit',{sender:{},senderFrame:pwc.mainFrame},true);
  ipc.emit('pet:hit',{sender:pwc,senderFrame:{url:petHtmlUrl}},true);
  pwc.mainFrame.url='file:///D:/evil/pet.html';ipc.emit('pet:hit',petEvent,true);pwc.mainFrame.url=petHtmlUrl;
  assert.equal(petWin.mouse.length,before,'only booleans from the pet main frame are accepted');
  const box=petWin.getBounds(),inside={x:box.x+100,y:box.y+100},outside={x:box.x-500,y:box.y-500};
  screen.cursor=inside;
  ipc.emit('pet:drag',petEvent,'start',inside);assert.equal(last().ignore,false,'dragging keeps clicks');
  ipc.emit('pet:hit',petEvent,false);assert.equal(last().ignore,false,'pointer leaving mid-drag does not drop the drag');
  ipc.emit('pet:drag',petEvent,'move',{x:inside.x-40,y:inside.y-20});
  const dragged=petWindowBounds(wa,1,{x:box.x-40,y:box.y-20});
  assert.deepEqual(petWin.getBounds(),dragged,'drag follows both pointer axes');
  ipc.emit('pet:drag',petEvent,'end',{x:inside.x-40,y:inside.y-20});assert.equal(last().ignore,true,'drag end returns to click-through');
  assert.deepEqual(saved,[{scale:1,position:{x:dragged.x,y:dragged.y}}],'a moved pet saves its new position');
  ipc.emit('pet:drag',petEvent,'start',inside);ipc.emit('pet:drag',petEvent,'end',inside);
  assert.equal(saved.length,1,'a click without moving saves nothing');
  const openMenu=async()=>{await pet.openMenu();return built.at(-1).popups.at(-1);};
  let popup=await openMenu();
  assert.equal(popup.window,petWin);assert.equal(last().ignore,false,'open menu keeps clicks');assert.equal(petWin.focusable,true);
  popup.callback();assert.equal(last().ignore,true);assert.equal(petWin.focusable,false,'menu close gives focus back');
  // 拖到屏幕边缘或点了远处的菜单项后指针已在窗外，立绘收不到 pointerleave：以系统光标为准恢复穿透。
  ipc.emit('pet:hit',petEvent,true);
  ipc.emit('pet:drag',petEvent,'start',inside);screen.cursor=outside;
  ipc.emit('pet:drag',petEvent,'end',outside);
  assert.equal(pet.mouse().hit,false);assert.equal(last().ignore,true,'pointer left during the drag: click-through again');
  ipc.emit('pet:hit',petEvent,true);popup=await openMenu();popup.callback();
  assert.equal(last().ignore,true,'menu closed with the pointer elsewhere: click-through again');
  screen.cursor=inside;ipc.emit('pet:hit',petEvent,true);popup=await openMenu();popup.callback();
  assert.equal(last().ignore,false,'pointer still over the pet stays clickable');
  ipc.emit('pet:drag',petEvent,'start',inside);ipc.emit('pet:drag',petEvent,'end',inside);
  assert.equal(last().ignore,false);assert.deepEqual(pet.mouse(),{hit:true,ignoring:false});
  // 隐藏宠物后立绘收不到 pointerleave：直接恢复穿透。
  pet.applyPreferences({petVisible:false,petAlwaysOnTop:true});
  assert.equal(petWin.visible,false);assert.deepEqual(pet.mouse(),{hit:false,ignoring:true});
  // 退出时停掉刷新并关窗；之后宠物窗消息一律忽略。
  pet.destroy();assert.equal(petWin.destroyed,true);assert.equal(pet.window(),null);
  const afterDestroy=petWin.mouse.length;ipc.emit('pet:hit',petEvent,true);assert.equal(petWin.mouse.length,afterDestroy);
}
// 位置写不进配置目录时如实告诉用户，拖动状态照常收尾。
{
  const {pet,windows,ipc}=petWiring('win32',{saveSettings:()=>{throw Error('只读目录');}});
  await pet.create();
  const petWin=windows[0],pwc=petWin.webContents;pwc.mainFrame.url=petHtmlUrl;
  const petEvent={sender:pwc,senderFrame:pwc.mainFrame},box=petWin.getBounds();
  ipc.emit('pet:drag',petEvent,'start',{x:box.x+5,y:box.y+5});
  ipc.emit('pet:drag',petEvent,'move',{x:box.x-5,y:box.y-5});
  ipc.emit('pet:drag',petEvent,'end',{x:box.x-5,y:box.y-5});
  assert.equal(pwc.last('pet:say'),'位置没有保存成功，下次打开可能回到原处。');
  assert.equal(petWin.mouse.at(-1).ignore,true);
}
console.log('Pet policy: window options, say cap, sprite mapping, sender checks and pet window wiring (click-through, drag, menu) passed');
