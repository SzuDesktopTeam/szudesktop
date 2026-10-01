// Invoked only by the isolated application smoke mode, including the final NSIS package.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {readPetSettings} from './pet-settings.mjs';
import {readDesktopSettings} from './desktop-settings.mjs';
import {petWindowBounds,petClickThroughSupported} from './pet-policy.mjs';
import {PETS,AVAILABLE_PETS,DEFAULT_PET} from './pet-catalog.mjs';
import {PET_CLIPS} from './pet-animation.mjs';
import {TOKEN_HEADER} from './listen-url.mjs';

// 冒烟里对页面执行脚本都要有上限：渲染进程崩溃或页面卡死时 executeJavaScript 永远不返回，
// 以前只会表现为“报告一直没出现”。超时后带上窗口与渲染进程状态报错，写进失败报告。
const goneRenderers=new WeakMap();
function watchRenderer(win){
  const wc=win.webContents;
  if(!goneRenderers.has(wc)){goneRenderers.set(wc,null);wc.on('render-process-gone',(_e,details)=>goneRenderers.set(wc,details));}
}
function evalWithin(win,label,source,ms=15000){
  watchRenderer(win);
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
    const wc=win.webContents,gone=goneRenderers.get(wc);
    const state={destroyed:win.isDestroyed(),visible:!win.isDestroyed()&&win.isVisible(),loading:!wc.isDestroyed()&&wc.isLoading(),crashed:!wc.isDestroyed()&&wc.isCrashed(),gone:gone?`${gone.reason}/${gone.exitCode}`:null};
    reject(Error(`${label} 窗口执行脚本 ${ms/1000} 秒未返回：${JSON.stringify(state)}；脚本开头 ${String(source).slice(0,80)}`));
  },ms);});
  return Promise.race([win.webContents.executeJavaScript(source),timeout]).finally(()=>clearTimeout(timer));
}

// 慢环境（Apple 芯片上经 Rosetta 跑 x64 包）由冒烟脚本放宽等待；没设置时仍是 6 秒，Windows 冒烟不受影响。
const WAIT_SCALE=Math.max(1,Number(process.env.SZU_SMOKE_WAIT_SCALE)||1);
async function until(read, message) {
  const end=Date.now()+6000*WAIT_SCALE;
  while(Date.now()<end){if(await read())return;await new Promise(r=>setTimeout(r,50));}
  throw Error(message);
}

// 首次打开有欢迎引导。选「去认识我的伙伴」后，页面要等主窗口画出下一帧才收到引导的 close 事件（Chromium 把它排在动画帧里），
// 然后保存「已看过引导」、切到伙伴小屋。这次保存不经过页面的写入锁：主窗口在页面处理完它的回应之前就藏起的话
// （macOS 上藏起的页面调度优先级被降低，机器一忙就要拖几百毫秒到几秒），接着的宠物指令会带着旧修订号保存，被引擎按冲突（409）拒掉。
// 用户关引导时主窗口就在眼前；冒烟也按这个顺序：引擎里已记下「已看过引导」，页面也切到了伙伴小屋
// （路由在这次保存返回、换上新修订号之后才切），才返回让调用方藏主窗口。
// 存档里已经看过引导时（重开、升级存档、Windows 安装版冒烟）页面不弹引导，直接返回 false。
export async function waitGuideSaved({main,onboarded,until}){
  if(await onboarded())return false;
  await until(()=>main("Boolean(document.querySelector('#guide[open]'))"),'first-run guide did not open');
  await main(`document.querySelector('#guide[open] button[value="garden"]').click()`);
  await until(async()=>await onboarded()&&await main("!document.querySelector('#guide[open]')&&location.hash==='#garden/pet'"),'first-run guide choice was not saved before hiding the main window');
  return true;
}

// 页面执行完宠物指令会经 petResult 回报结果，主进程据此让宠物说话。冒烟旁听主窗口发出的这条消息（只多挂一个监听，不改变消息去向），
// 指令没生效时在报错里写明：页面回报了什么（忙碌被拒、存档冲突等），还是点击之后一直没有回报（页面还没处理这条指令或它的保存回应）。
const petReplyLogs=new WeakMap();
export function listenPetReplies(webContents){
  if(!petReplyLogs.has(webContents)){
    const log=[];
    petReplyLogs.set(webContents,log);
    webContents.on('ipc-message',(_event,channel,result)=>{if(channel==='szu:pet-result')log.push({at:Date.now(),ok:result?.ok===true,message:String(result?.message??'')});});
  }
  return petReplyLogs.get(webContents);
}
export function describePetReplies(replies,clickedAt,now=Date.now()){
  const seconds=ms=>(ms/1000).toFixed(1);
  if(!replies.length)return `点击后 ${seconds(now-clickedAt)} 秒内页面没有回报结果`;
  return replies.map(reply=>`页面在点击后 ${seconds(reply.at-clickedAt)} 秒回报${reply.ok?'成功':'失败'}：${reply.message||'（无文字）'}`).join('；');
}
// 依次点宠物菜单里的指令。点下一项之前先等页面回报上一项：回报发出时页面的写入锁已经放开，早一步点就会被「正在保存或处理上一项操作」拒掉。
// 主窗口藏起、机器又忙时，页面要过十几秒才回报，宠物窗却可能先由每 30 秒的定时刷新换上新立绘，只看立绘或存档就会点得太早。
// 返回这条指令之后用的等待：超时的报错带上页面对这条指令的回报，或者写明点击后一直没有回报。
// 菜单里点已经在陪伴的伙伴不会发出指令，调用方传 expectReply:false，下一项就不等它的回报。
export function createPetCommands({click,replies,until}){
  let unfinished=null;
  return async function petCommand(id,{expectReply=true}={}){
    if(unfinished)await unfinished();
    const since=replies.length,clickedAt=Date.now();
    click(id);
    const after=(read,message)=>until(read,message).catch(error=>{error.message+='；'+describePetReplies(replies.slice(since),clickedAt);throw error;});
    unfinished=expectReply?()=>after(()=>replies.length>since,`main window did not report the result of ${id}`):null;
    return after;
  };
}

// Migration adds only these defaults to old personal records. Keep every old
// field in the comparison so accepting new fields cannot hide lost user data.
function personalAfterMigration(data){
  return {...data,
    preferences:{noticeSource:'undergrad',studentLevel:'undergrad',...data.preferences},
    todos:data.todos.map(todo=>({date:'',createdAt:0,completedAt:0,archived:false,...todo})),
  };
}

// Exercise the same download, file input and confirmation used by users. This
// module only runs with the isolated smoke profile; no real account is loaded.
// 主进程直接调本机服务要带 sidecar 交来的凭据；页面里的请求靠首次加载换来的 Cookie。
const localApi=(baseUrl,token)=>(endpoint,options={})=>fetch(baseUrl+endpoint,{...options,headers:{...options.headers,[TOKEN_HEADER]:token}});
async function checkBackup(mainWin,baseUrl,token,evidenceDir){
  const main=source=>evalWithin(mainWin,'主',source);
  const api=localApi(baseUrl,token);
  const snapshot=async()=>{const r=await api('/api/workspace');assert.ok(r.ok);return r.json();};
  const seed=await snapshot();
  const original=structuredClone(seed.data);
  seed.data.profile.name='备份验收';
  seed.data.todos=[{id:'backup-task',text:'验收后恢复学习记录',done:false,rewarded:false,date:'',createdAt:0,completedAt:0,archived:false}];
  seed.data.courses=[{code:'backup-course',name:'合成课程',credit:2,point:3.5}];
  const saved=await api('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(seed)});
  assert.ok(saved.ok,'synthetic backup fixture saved');
  await mainWin.loadURL(baseUrl+'/?smoke=backup#settings/data');
  await until(()=>main("location.hash==='#settings/data' && Boolean(document.querySelector('#import-file') && document.querySelector('[data-action=\"export\"]'))"),'backup settings section not loaded');
  const file=path.join(evidenceDir,'workspace-backup.json');
  let completed=false,downloadState='';
  const onDownload=(_event,item)=>{
    item.setSavePath(file);
    item.once('done',(_event,state)=>{downloadState=state;completed=true;});
  };
  mainWin.webContents.session.once('will-download',onDownload);
  try{
    await main("document.querySelector('[data-action=\"export\"]').click()");
    await until(()=>completed,'backup file was not downloaded');
  }finally{mainWin.webContents.session.removeListener('will-download',onDownload);}
  assert.equal(downloadState,'completed');
  const backup=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(backup.profile.name,'备份验收');
  assert.equal(backup.todos[0].id,'backup-task');
  assert.equal(backup.courses[0].code,'backup-course');
  assert.deepEqual(backup.game.pets.map(p=>p.species),seed.data.game.pets.map(p=>p.species),'backup preserves the whole companion roster');
  const expectedSeed=personalAfterMigration(seed.data);
  for(const key of ['profile','preferences','todos','reminders','semester'])assert.deepEqual(backup[key],expectedSeed[key],'export preserves '+key);
  for(const key of ['coins','food','seeds','stock','plots','stats'])assert.deepEqual(backup.game[key],seed.data.game[key],'export preserves garden '+key);
  assert.equal(backup.password,undefined);
  assert.equal(backup.account,undefined);
  await until(()=>main("Boolean(document.querySelector('[data-action=\"settingsTab\"][data-tab=\"appearance\"]:not(:disabled)'))"),'appearance settings navigation is not ready');
  await main("document.querySelector('[data-action=\"settingsTab\"][data-tab=\"appearance\"]').click()");
  await until(()=>main("document.querySelector('#display-name')?.value==='备份验收'"),'backup fixture not loaded into appearance settings');
  await main("document.querySelector('#display-name').value='恢复前';document.querySelector('#profile-form').requestSubmit()");
  await until(async()=>(await snapshot()).data.profile.name==='恢复前','profile change not saved');
  await until(()=>main("Boolean(document.querySelector('[data-action=\"settingsTab\"][data-tab=\"data\"]:not(:disabled)'))"),'profile save did not unlock data settings navigation');
  await main("document.querySelector('[data-action=\"settingsTab\"][data-tab=\"data\"]').click()");
  const ready=()=>until(()=>main("Boolean(document.querySelector('#import-file') && !document.querySelector('#import-file').disabled)"),'backup controls did not become ready');
  const importFile=async(data=backup)=>{
    // A disk write may be visible before the renderer consumes its response.
    // Follow the enabled file input, as a user would, instead of racing it.
    await ready();
    await main(`(()=>{const input=document.querySelector('#import-file'),files=new DataTransfer();files.items.add(new File([${JSON.stringify(JSON.stringify(data))}],'backup.json',{type:'application/json'}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  await importFile();
  await until(()=>main("Boolean(document.querySelector('#confirm[open]'))"),'restore confirmation not shown');
  await main("document.querySelector('#confirm button[value=cancel]').click()");
  await until(()=>main("document.querySelector('#import-file')?.value===''") ,'cancelled restore did not reset the picker');
  assert.equal((await snapshot()).data.profile.name,'恢复前','cancel preserves the current save');
  await importFile();
  await until(()=>main("Boolean(document.querySelector('#confirm[open]'))"),'restore confirmation not shown again');
  await main("document.querySelector('#confirm button[value=ok]').click()");
  await until(async()=>(await snapshot()).data.profile.name==='备份验收','backup not restored through the real API');
  const restored=(await snapshot()).data;
  for(const key of ['profile','preferences','todos','courses','reminders','semester'])assert.deepEqual(restored[key],backup[key],key+' restored');
  for(const key of ['coins','food','seeds','stock','plots','stats'])assert.deepEqual(restored.game[key],backup.game[key],'garden '+key+' restored');
  assert.deepEqual(restored.game.pets.map(p=>[p.species,p.name,p.xp]),backup.game.pets.map(p=>[p.species,p.name,p.xp]),'companion identity and growth restored');
  // Leave the upgrade fixture intact for the installer's preservation checks.
  const beforeReset=await snapshot();
  await importFile(original);
  await until(()=>main("Boolean(document.querySelector('#confirm[open]'))"),'original save confirmation not shown');
  await main("document.querySelector('#confirm button[value=ok]').click()");
  await until(async()=>(await snapshot()).revision>beforeReset.revision,'original upgrade fixture not restored');
  await ready();
  const reset=(await snapshot()).data;
  const expectedOriginal=personalAfterMigration(original);
  for(const key of ['profile','preferences','todos','courses','reminders','semester'])assert.deepEqual(reset[key],expectedOriginal[key],'original '+key+' retained');
}

export async function checkPetRuntime({mainWin,petWin,tray,getMenu,getPetMenu,getPetMouse,getPetHitLog,screen,initialScale,userData,evidenceDir,baseUrl,token}){
  const api=localApi(baseUrl,token);
  const trace=stage=>writeFileSync(path.join(evidenceDir,'pet-progress.json'),JSON.stringify({stage,bounds:petWin?.getBounds(),visible:petWin?.isVisible()}));
  trace('start');
  assert.ok(petWin&&!petWin.isDestroyed()&&petWin.isVisible(),'pet window exists');
  assert.ok(tray&&!tray.isDestroyed(),'packaged tray icon loads');
  assert.ok(petWin.isAlwaysOnTop(),'pet stays on top');
  const main=source=>evalWithin(mainWin,'主',source);
  const pet=source=>evalWithin(petWin,'桌宠',source);
  const menu=label=>getMenu().items.find(item=>item.label===label);
  const sizeItems=()=>menu('宠物大小').submenu.items;
  const workspace=async()=>{const r=await api('/api/workspace');assert.ok(r.ok);return (await r.json()).data;};
  await waitGuideSaved({main,onboarded:async()=>(await workspace()).preferences?.onboarded===true,until});
  await until(()=>pet("Boolean(window.szuPet && document.querySelector('#pet-use')?.getAttribute('href'))"),'pet preload/render not ready');
  assert.equal(await main('window.szuDesktop.petScale()'),initialScale);
  assert.equal(readPetSettings(userData).scale,initialScale,'scale loaded from previous launch');
  const stored=readPetSettings(userData);
  if(stored.position){
    const bounds=petWin.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
    assert.deepEqual(bounds,petWindowBounds(area,initialScale,stored.position),'saved position restored');
  }

  mainWin.close();
  trace('main-hidden');
  assert.ok(!mainWin.isDestroyed()&&!mainWin.isVisible(),'close hides main without destroying it');
  const target=await pet("(()=>{const r=document.querySelector('#pet').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  // 透明区域默认点穿；指针进入立绘后才接收点击，离开后恢复穿透。支持转发鼠标移动的平台（Windows、macOS）都要验。
  let clickThrough=null;
  if(petClickThroughSupported(process.platform)){
    assert.equal(getPetMouse().ignoring,true,'transparent pet area lets clicks through by default');
    // CI 桌面上真实光标的位置也会经 forward 转发进来，可能紧跟着触发 pointerleave；所以检查进出记录，而不是轮询瞬时状态。
    const seen=getPetHitLog().length;
    petWin.webContents.sendInputEvent({type:'mouseMove',...target});
    await until(()=>getPetHitLog().slice(seen).some(e=>e.inside&&e.ignoring===false),'pointer over the companion did not make it clickable');
    const entered=getPetHitLog().length;
    petWin.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});
    await until(()=>getPetHitLog().slice(entered-1).some(e=>!e.inside&&e.ignoring===true)&&getPetMouse().ignoring===true,'leaving the companion did not restore click-through');
    clickThrough=true;
  }
  trace('click-through');
  const beforeDrag=petWin.getBounds(),dragArea=screen.getDisplayMatching(beforeDrag).workArea;
  const globalPoint={globalX:beforeDrag.x+target.x,globalY:beforeDrag.y+target.y};
  const dragPoint={globalX:globalPoint.globalX-48,globalY:globalPoint.globalY-36};
  petWin.webContents.sendInputEvent({type:'mouseDown',...target,...globalPoint,button:'left',clickCount:1});
  petWin.webContents.sendInputEvent({type:'mouseMove',x:target.x-48,y:target.y-36,...dragPoint,button:'left',modifiers:['leftButtonDown']});
  petWin.webContents.sendInputEvent({type:'mouseUp',x:target.x-48,y:target.y-36,...dragPoint,button:'left',clickCount:1});
  const dragged=petWindowBounds(dragArea,initialScale,{x:beforeDrag.x-48,y:beforeDrag.y-36});
  await until(()=>{const p=readPetSettings(userData).position;return p?.x===dragged.x&&p?.y===dragged.y;},'drag did not persist the pointer movement');
  assert.deepEqual(petWin.getBounds(),dragged,'drag follows both pointer axes');
  assert.equal(getPetMenu(),null,'drag must not open the click menu');
  trace('dragged');
  petWin.webContents.sendInputEvent({type:'mouseDown',...target,button:'left',clickCount:1});
  petWin.webContents.sendInputEvent({type:'mouseUp',...target,button:'left',clickCount:1});
  trace('clicked');
  await until(()=>Boolean(getPetMenu()?.getMenuItemById('feed')),'click did not open the pet menu');
  assert.equal(mainWin.isVisible(),false,'click opens a menu without opening main');
  getPetMenu().closePopup(petWin);
  trace('menu-closed');
  const game=async()=>(await workspace()).game;
  const active=g=>g.pets[g.active]||g.pets[0];
  const petCommand=createPetCommands({click:id=>getPetMenu().getMenuItemById(id).click(),replies:listenPetReplies(mainWin.webContents),until});
  for(let i=0;i<2;i++){
    trace('sleep-'+i);
    const before=active(await game()).sleeping;
    const afterSleep=await petCommand('sleep');
    await afterSleep(async()=>active(await game()).sleeping!==before,'pet sleep menu did not save');
    const savedPet=active(await game());
    await afterSleep(()=>pet(`document.querySelector('#bubble-text').textContent===${JSON.stringify(savedPet.say.slice(0,60))}`),'saved personality dialogue did not reach the pet bubble');
  }
  const beforeFeed=await game(),canFeed=!active(beforeFeed).sleeping&&active(beforeFeed).hunger<98&&beforeFeed.food>0;
  trace('feed');
  const afterFeed=await petCommand('feed');
  await afterFeed(async()=>{
    if(canFeed){
      const current=await game();
      // The previous action's bubble also matches its previous saved line.
      // Wait for this meal to commit before comparing its personality text.
      if(current.food!==beforeFeed.food-1)return false;
      return pet(`document.querySelector('#bubble-text').textContent===${JSON.stringify(active(current).say.slice(0,60))}`);
    }
    return pet("/吃饱|唤醒|食物用完/.test(document.querySelector('#bubble-text').textContent)");
  },'feed result was not shown');
  assert.equal((await game()).food,beforeFeed.food-(canFeed?1:0),'food changes only after a valid meal');
  assert.equal(mainWin.isVisible(),false,'care works with the main window hidden');
  const companions=(await game()).pets;
  trace('companion-menu-selection');
  const companionSpecies=companions.map(p=>p.species);
  assert.ok(AVAILABLE_PETS.every(id=>companionSpecies.includes(id)),'every default companion is available');
  assert.ok(companionSpecies.every(id=>Object.hasOwn(PETS,id)),'old companions still have registered artwork');
  for(const [index,companion] of [...companions.entries()].reverse()){
    const sprite=PETS[companion.species].sprite;
    const afterChoice=await petCommand(`switchPet:${index}`,{expectReply:(await game()).active!==index});
    await afterChoice(async()=>(await game()).active===index,'menu choice did not persist');
    await afterChoice(()=>pet(`document.querySelector('#pet').dataset.species===${JSON.stringify(companion.species)} && /^#(?:petanim-)?${sprite}-/.test(document.querySelector('#pet-use').getAttribute('href'))`),'desktop frame did not follow the choice');
    const rendered=await pet("(()=>{const svg=document.querySelector('#pet'),use=document.querySelector('#pet-use'),box=use.getBBox();return {sprite:use.getAttribute('href').slice(1),action:svg.dataset.action,viewBox:svg.getAttribute('viewBox'),width:box.width,height:box.height}})()");
    assert.equal(rendered.viewBox,PETS[companion.species].viewBox,'desktop uses the catalog viewBox');
    if(rendered.sprite.startsWith('petanim-'))assert.ok(PET_CLIPS[companion.species][rendered.action].frames.some(f=>f.id===rendered.sprite),'desktop renders a registered frame');
    assert.ok(rendered.width>0&&rendered.height>0,'selected companion resolves to visible SVG artwork');
    assert.equal(mainWin.isVisible(),false,'switching companions need not open the main window');
    await pet('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    writeFileSync(path.join(evidenceDir,`companion-${sprite}.png`),(await petWin.webContents.capturePage()).toPNG());
  }
  const afterGarden=await petCommand('garden');
  await afterGarden(()=>main(`document.querySelectorAll('.companion-choice').length===${companions.length}`),'companion picker did not render the saved roster');
  // navigate() renders before its async command finishes. Its result confirms
  // that the main window has released the command lock and accepts the click.
  await afterGarden(()=>pet("document.querySelector('#bubble-text').textContent==='伙伴小屋已打开'"),'garden menu command did not complete');
  for(const species of ['pingu','skipper','chestnut',DEFAULT_PET]){
    trace('garden-selection-'+species);
    const index=companionSpecies.indexOf(species),sprite=PETS[species].sprite;
    assert.ok(index>=0,'garden includes '+species);
    await until(()=>main(`document.querySelector('.companion-choice[data-index="${index}"]')?.disabled===false`),'companion picker is still saving');
    await main(`document.querySelector('.companion-choice[data-index="${index}"]').click()`);
    await until(()=>pet(`document.querySelector('#pet').dataset.species===${JSON.stringify(species)} && /^#(?:petanim-)?${sprite}-/.test(document.querySelector('#pet-use').getAttribute('href'))`),'garden selection did not update desktop: '+species);
    assert.equal((await game()).active,index,'garden selection persists '+species);
  }
  await main("document.querySelector('.pet-roster-card').scrollIntoView({block:'center'})");
  await main('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
  writeFileSync(path.join(evidenceDir,'companion-picker.png'),(await mainWin.webContents.capturePage()).toPNG());
  const picker=await main("(()=>{const r=document.querySelector('.pet-roster-card').getBoundingClientRect();return {x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.floor(r.width),height:Math.floor(r.height)}})()");
  writeFileSync(path.join(evidenceDir,'companion-roster.png'),(await mainWin.webContents.capturePage(picker)).toPNG());
  const mainSize=mainWin.getSize();
  mainWin.setMinimumSize(390,600);mainWin.setSize(420,780);
  await main("document.querySelector('.pet-roster-card').scrollIntoView({block:'center'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  assert.ok(await main('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),'companion page overflows in a narrow window');
  writeFileSync(path.join(evidenceDir,'companion-narrow.png'),(await mainWin.webContents.capturePage()).toPNG());
  mainWin.setSize(...mainSize);
  getPetMenu().getMenuItemById('farm').click();
  trace('farm');
  await until(()=>main("location.hash==='#garden/farm' && Boolean(document.querySelector('#seed-choice'))"),'farm menu did not select the farm');
  getPetMenu().getMenuItemById('study').click();
  await until(()=>main("location.hash==='#study/focus'"),'study menu did not navigate');
  getPetMenu().getMenuItemById('home').click();
  await until(()=>main("location.hash==='#home'"),'main menu did not restore home');
  await until(()=>mainWin.isVisible(),'pet menu cannot restore main window');
  await until(async()=>['idle','sad','sleep','focus'].includes(await pet("document.querySelector('#pet').dataset.action")),'one-shot action never returns to base');
  // The upgrade fixture deliberately has motion disabled. Exercise the real
  // setting and IPC path temporarily, then retain all original preferences.
  const preferences=async()=>{const response=await api('/api/workspace');assert.ok(response.ok);return (await response.json()).data.preferences;};
  const originalPreferences=await preferences();
  const setMotion=async value=>{
    await main("document.querySelector('[data-action=\"navigate\"][data-page=\"settings\"]').click()");
    await until(()=>main("Boolean(document.querySelector('[data-action=\"settingsTab\"][data-tab=\"appearance\"]:not(:disabled)'))"),'appearance settings navigation is not ready');
    await main("document.querySelector('[data-action=\"settingsTab\"][data-tab=\"appearance\"]').click()");
    await until(()=>main("Boolean(document.querySelector('#profile-form input[name=motion]') && !document.querySelector('#profile-form button').disabled)"),'animation setting is not ready');
    await main(`(()=>{const form=document.querySelector('#profile-form');form.querySelector('input[name=motion]').checked=${JSON.stringify(value)};form.requestSubmit();})()`);
    await until(async()=>(await preferences()).motion===value,'animation preference did not save');
    // A persisted write can become visible before the UI finishes its response.
    await until(()=>main("Boolean(document.querySelector('#profile-form button') && !document.querySelector('#profile-form button').disabled)"),'animation setting save did not finish');
  };
  const reducedMotion=()=>pet("matchMedia('(prefers-reduced-motion: reduce)').matches");
  const animationFrames={verified:false,systemReducedMotion:await reducedMotion(),emulationUsed:false,
    environment:'system',systemReducedMotionRespected:null,mediaRestored:false,preferenceRestored:false};
  const debuggerClient=petWin.webContents.debugger;
  let debuggerAttached=false;
  try{
    await setMotion(true);
    if(animationFrames.systemReducedMotion){
      await until(()=>pet("!document.querySelector('#pet-use').getAttribute('href').startsWith('#petanim-')"),'system reduced-motion setting must retain static artwork');
      animationFrames.systemReducedMotionRespected=true;
      // Only this isolated renderer receives a CSS media override; Windows
      // preferences and application behavior outside smoke remain untouched.
      // https://www.electronjs.org/docs/latest/api/debugger
      // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setEmulatedMedia
      assert.equal(debuggerClient.isAttached(),false,'animation smoke owns its debugger session');
      debuggerClient.attach('1.3');debuggerAttached=true;
      await debuggerClient.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      animationFrames.emulationUsed=true;
      animationFrames.environment='renderer-media-emulation';
      await until(async()=>!await reducedMotion(),'renderer media override did not take effect');
    }
    await until(()=>pet("document.querySelector('#pet-use').getAttribute('href').startsWith('#petanim-')"),'enabling animation did not reach the desktop companion without navigation');
    const frame=()=>pet("(()=>{const svg=document.querySelector('#pet'),use=document.querySelector('#pet-use'),box=use.getBBox();return {id:use.getAttribute('href').slice(1),species:svg.dataset.species,action:svg.dataset.action,width:box.width,height:box.height}})()");
    const first=await frame();
    writeFileSync(path.join(evidenceDir,'pet-animation-before.png'),(await petWin.webContents.capturePage()).toPNG());
    let second;
    await until(async()=>{second=await frame();return second.id!==first.id;},'desktop frame clock did not advance');
    writeFileSync(path.join(evidenceDir,'pet-animation-after.png'),(await petWin.webContents.capturePage()).toPNG());
    for(const current of [first,second]){
      assert.ok(PET_CLIPS[current.species]?.[current.action]?.frames.some(f=>f.id===current.id),'animation resolves to a registered drawing');
      assert.ok(current.width>0&&current.height>0,'animated frame has visible SVG artwork');
    }
    assert.notEqual(first.id,second.id,'two distinct drawings are rendered');
    animationFrames.frameIds=[first.id,second.id];
    animationFrames.verified=true;
  }finally{
    try{
      if(debuggerAttached){
        try{await debuggerClient.sendCommand('Emulation.setEmulatedMedia',{features:[]});}
        finally{debuggerClient.detach();}
        assert.equal(debuggerClient.isAttached(),false,'animation debugger is detached');
      }
      await until(async()=>(await reducedMotion())===animationFrames.systemReducedMotion,'original system media preference was not restored');
      animationFrames.mediaRestored=true;
    }finally{
      if(originalPreferences.motion!==true)await setMotion(originalPreferences.motion);
      assert.deepEqual(await preferences(),originalPreferences,'animation check restores every upgrade preference');
      if(originalPreferences.motion===false||animationFrames.systemReducedMotion)await until(()=>pet("!document.querySelector('#pet-use').getAttribute('href').startsWith('#petanim-')"),'restoring reduced motion did not reach the desktop companion without navigation');
      animationFrames.preferenceRestored=true;
    }
  }
  mainWin.close();
  menu('打开主窗口').click();
  assert.ok(mainWin.isVisible(),'tray opens main');
  menu('隐藏宠物').click();
  assert.equal(petWin.isVisible(),false);
  assert.equal(readDesktopSettings(userData).petVisible,false,'tray hide survives restart');
  menu('显示宠物').click();
  assert.equal(petWin.isVisible(),true);
  assert.equal(readDesktopSettings(userData).petVisible,true,'tray show persists the choice');
  const initialDesktop=await main('window.szuDesktop.desktopSettings()');
  await main('window.szuDesktop.setDesktopSettings({petAlwaysOnTop:false,doNotDisturb:true,focusNotifications:false})');
  assert.equal(petWin.isAlwaysOnTop(),false,'always-on-top can be disabled');
  const quiet=readDesktopSettings(userData);
  assert.equal(quiet.petAlwaysOnTop,false);assert.equal(quiet.doNotDisturb,true);assert.equal(quiet.focusNotifications,false);
  await main(`window.szuDesktop.setDesktopSettings(${JSON.stringify({petAlwaysOnTop:initialDesktop.petAlwaysOnTop,doNotDisturb:initialDesktop.doNotDisturb,focusNotifications:initialDesktop.focusNotifications})})`);
  assert.equal(petWin.isAlwaysOnTop(),initialDesktop.petAlwaysOnTop,'restore the chosen window level');

  for(const scale of [0.6,1,1.5]){
    sizeItems().find(item=>item.label.includes(`${scale*100}%`)).click();
    assert.equal(await main('window.szuDesktop.petScale()'),scale);
    assert.equal(sizeItems().filter(item=>item.checked).length,1);
  }
  await main("document.querySelector('[data-action=\"navigate\"][data-page=\"settings\"]').click()");
  await until(()=>main("Boolean(document.querySelector('[data-action=\"settingsTab\"][data-tab=\"desktop\"]:not(:disabled)'))"),'desktop settings navigation is not ready');
  await main("document.querySelector('[data-action=\"settingsTab\"][data-tab=\"desktop\"]').click()");
  await until(()=>main("document.querySelector('#pet-scale')?.value==='1.5'"),'settings slider did not bind after rendering');
  for(const scale of [0.4,2,1.7]){
    await main(`(()=>{const input=document.querySelector('#pet-scale');input.value='${scale}';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(async()=>await main('window.szuDesktop.petScale()')===scale,'settings scale did not reach main process');
    await until(()=>pet(`Number(getComputedStyle(document.documentElement).getPropertyValue('--pet-scale'))===${scale}`),'pet CSS scale did not update');
    const bounds=petWin.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
    const settings=readPetSettings(userData);
    assert.deepEqual(bounds,petWindowBounds(area,scale,settings.position),'pet bounds follow display work area and saved position');
    assert.equal(sizeItems().filter(item=>item.checked).length,0,'custom scale has no false preset check');
    assert.equal(readPetSettings(userData).scale,scale,'scale persisted');
    petWin.webContents.send('pet:say','嗨，今天也一起加油。');
    await until(()=>pet("document.querySelector('#bubble').classList.contains('show') && !document.querySelector('#bubble').getAnimations().some(a=>a.playState==='running')"),'pet bubble did not settle');
    await pet('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    writeFileSync(path.join(evidenceDir,`pet-${Math.round(scale*100)}.png`),(await petWin.webContents.capturePage()).toPNG());
  }
  writeFileSync(path.join(evidenceDir,'pet-settings.png'),(await mainWin.webContents.capturePage()).toPNG());
  await main("document.querySelector('[data-action=\"navigate\"][data-page=\"study\"]').click()");
  await main("document.querySelector('[data-action=\"studyTab\"][data-tab=\"timetable\"]').click()");
  assert.ok(await main("Boolean(document.querySelector('#official-account [data-action=\"official-open\"]'))"),'school login entry rendered');
  assert.equal(await main("Boolean(document.querySelector('#session-cookie'))"),false,'installed UI does not ask for cookies');
  await main('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
  writeFileSync(path.join(evidenceDir,'school-account.png'),(await mainWin.webContents.capturePage()).toPNG());
  trace('backup-restore');
  // 没有凭据的请求必须被拒绝：只挡跨站不够，本机其他用户的进程也能直接连端口。
  const anonymous=await fetch(baseUrl+'/api/workspace');
  assert.equal(anonymous.status,401,'local API rejects callers without the session token');
  await anonymous.body?.cancel();
  await checkBackup(mainWin,baseUrl,token,evidenceDir);
  await checkNotebookReload({mainWin,main,api,evidenceDir});
  await main("document.querySelector('[data-action=\"navigate\"][data-page=\"home\"]').click()");
  return {rendered:true,tray:true,closeAndReopen:true,hideAndShow:true,actionsReturnToBase:true,animationFrames,
    initialScale,finalScale:1.7,settingsAndPresets:true,petMenu:true,hiddenCare:true,feedUsesInventory:true,menuNavigation:true,petSelection:true,petSelectionSync:true,companionSpecies,defaultCompanions:AVAILABLE_PETS,penguinSelection:true,notebookReload:true,backupRestore:true,drag:true,positionPersistence:true,clickThrough,displayCount:screen.getAllDisplays().length};
}

// Runs in the real Electron renderer against the Go notebook API. Synthetic data only.
async function checkNotebookReload({mainWin,main,api,evidenceDir}){
  const snapshot=async()=>{const r=await api('/api/notebook');assert.ok(r.ok);return r.json();};
  const before=await snapshot();
  const original=before.data||{courses:[],notes:[],preferences:{selectedNoteId:'',selectedCourseId:''}};
  await mainWin.loadURL(mainWin.webContents.getURL().split('#')[0]+'#home');
  await until(()=>main('Boolean(document.querySelector("[data-action=notebookLecture]:not(:disabled)"))'),'first-minute lecture entry missing or still loading');
  await main('document.querySelector("[data-action=notebookLecture]").click()');
  await until(()=>main('Boolean(document.querySelector("#note-body"))'),'lecture editor not opened');
  const body='Synthetic native lecture draft '+Date.now();
  await main('(()=>{const area=document.querySelector("#note-body");area.value='+JSON.stringify(body)+';area.dispatchEvent(new Event("input",{bubbles:true}));})()');
  // Navigate immediately, before the autosave timer, then use the user's reload button.
  await main('document.querySelector("[data-action=navigate][data-page=settings]").click()');
  await until(()=>main('Boolean(document.querySelector("[data-action=reload]"))'),'safe reload entry missing');
  const reloaded=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{mainWin.webContents.removeListener('did-finish-load',done);reject(Error('safe reload timed out'));},15000);
    const done=()=>{clearTimeout(timer);resolve();};
    mainWin.webContents.once('did-finish-load',done);
  });
  await main('document.querySelector("[data-action=reload]").click()');
  await reloaded;
  await until(()=>main('Boolean(document.querySelector("[data-action=navigate][data-page=home]"))'),'reloaded workspace not ready');
  await main('document.querySelector("[data-action=navigate][data-page=home]").click()');
  await until(()=>main('Boolean(document.querySelector("[data-action=notebookResume]"))'),'resume entry missing');
  await main('document.querySelector("[data-action=notebookResume]").click()');
  await until(()=>main('document.querySelector("#note-body")?.value==='+JSON.stringify(body)),'draft not restored after native reload');
  const saved=await snapshot();
  assert.ok(saved.data.notes.some(n=>n.body===body),'real Go API persisted the draft');
  writeFileSync(path.join(evidenceDir,'notebook-reload.png'),(await mainWin.webContents.capturePage()).toPNG());
  const restored=await api('/api/notebook',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,revision:saved.revision,data:original})});
  assert.ok(restored.ok,'synthetic smoke note cleanup failed');
  await mainWin.loadURL(mainWin.webContents.getURL().split('#')[0]+'#home');
  await until(()=>main('Boolean(document.querySelector("[data-action=navigate][data-page=home]"))'),'workspace did not reload after cleanup');
}
