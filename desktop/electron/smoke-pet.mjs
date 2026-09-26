// Invoked only by the isolated application smoke mode, including the final NSIS package.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {readPetSettings} from './pet-settings.mjs';
import {readDesktopSettings} from './desktop-settings.mjs';
import {petWindowBounds} from './pet-policy.mjs';
import {PETS,AVAILABLE_PETS,DEFAULT_PET} from './pet-catalog.mjs';
import {PET_CLIPS} from './pet-animation.mjs';

async function until(read, message) {
  const end=Date.now()+6000;
  while(Date.now()<end){if(await read())return;await new Promise(r=>setTimeout(r,50));}
  throw Error(message);
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
async function checkBackup(mainWin,baseUrl,evidenceDir){
  const main=source=>mainWin.webContents.executeJavaScript(source);
  const snapshot=async()=>{const r=await fetch(baseUrl+'/api/workspace');assert.ok(r.ok);return r.json();};
  const seed=await snapshot();
  const original=structuredClone(seed.data);
  seed.data.profile.name='备份验收';
  seed.data.todos=[{id:'backup-task',text:'验收后恢复学习记录',done:false,rewarded:false,date:'',createdAt:0,completedAt:0,archived:false}];
  seed.data.courses=[{code:'backup-course',name:'合成课程',credit:2,point:3.5}];
  const saved=await fetch(baseUrl+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(seed)});
  assert.ok(saved.ok,'synthetic backup fixture saved');
  await mainWin.loadURL(baseUrl+'/?smoke=backup#settings');
  await until(()=>main("document.querySelector('#display-name')?.value==='备份验收'"),'backup fixture not loaded');
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
  await main("document.querySelector('#display-name').value='恢复前';document.querySelector('#profile-form').requestSubmit()");
  await until(async()=>(await snapshot()).data.profile.name==='恢复前','profile change not saved');
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

export async function checkPetRuntime({mainWin,petWin,tray,getMenu,getPetMenu,screen,initialScale,userData,evidenceDir,baseUrl}){
  const trace=stage=>writeFileSync(path.join(evidenceDir,'pet-progress.json'),JSON.stringify({stage,bounds:petWin?.getBounds(),visible:petWin?.isVisible()}));
  trace('start');
  assert.ok(petWin&&!petWin.isDestroyed()&&petWin.isVisible(),'pet window exists');
  assert.ok(tray&&!tray.isDestroyed(),'packaged tray icon loads');
  assert.ok(petWin.isAlwaysOnTop(),'pet stays on top');
  const main=source=>mainWin.webContents.executeJavaScript(source);
  const pet=source=>petWin.webContents.executeJavaScript(source);
  const menu=label=>getMenu().items.find(item=>item.label===label);
  const sizeItems=()=>menu('宠物大小').submenu.items;
  await main("document.querySelector('#guide[open] button')?.click()");
  await until(()=>main("!document.querySelector('#guide[open]')"),'first-run guide did not close');
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
  const game=async()=>{const r=await fetch(baseUrl+'/api/workspace');assert.ok(r.ok);return (await r.json()).data.game;};
  const active=g=>g.pets[g.active]||g.pets[0];
  for(let i=0;i<2;i++){
    trace('sleep-'+i);
    const before=active(await game()).sleeping;
    getPetMenu().getMenuItemById('sleep').click();
    await until(async()=>active(await game()).sleeping!==before,'pet sleep menu did not save');
    const savedPet=active(await game());
    await until(()=>pet(`document.querySelector('#bubble-text').textContent===${JSON.stringify(savedPet.say.slice(0,60))}`),'saved personality dialogue did not reach the pet bubble');
  }
  const beforeFeed=await game(),canFeed=!active(beforeFeed).sleeping&&active(beforeFeed).hunger<98&&beforeFeed.food>0;
  trace('feed');
  getPetMenu().getMenuItemById('feed').click();
  await until(async()=>{
    if(canFeed)return pet(`document.querySelector('#bubble-text').textContent===${JSON.stringify(active(await game()).say.slice(0,60))}`);
    return pet("/吃饱|唤醒|食物用完/.test(document.querySelector('#bubble-text').textContent)");
  },'feed result was not shown');
  assert.equal((await game()).food,beforeFeed.food-(canFeed?1:0),'food changes only after a valid meal');
  assert.equal(mainWin.isVisible(),false,'care works with the main window hidden');
  const companions=(await game()).pets;
  const companionSpecies=companions.map(p=>p.species);
  assert.ok(AVAILABLE_PETS.every(id=>companionSpecies.includes(id)),'every default companion is available');
  assert.ok(companionSpecies.every(id=>Object.hasOwn(PETS,id)),'old companions still have registered artwork');
  for(const [index,companion] of [...companions.entries()].reverse()){
    const sprite=PETS[companion.species].sprite;
    getPetMenu().getMenuItemById(`switchPet:${index}`).click();
    await until(async()=>(await game()).active===index,'menu choice did not persist');
    await until(()=>pet(`document.querySelector('#pet').dataset.species===${JSON.stringify(companion.species)} && /^#(?:petanim-)?${sprite}-/.test(document.querySelector('#pet-use').getAttribute('href'))`),'desktop frame did not follow the choice');
    const rendered=await pet("(()=>{const svg=document.querySelector('#pet'),use=document.querySelector('#pet-use'),box=use.getBBox();return {sprite:use.getAttribute('href').slice(1),action:svg.dataset.action,viewBox:svg.getAttribute('viewBox'),width:box.width,height:box.height}})()");
    assert.equal(rendered.viewBox,PETS[companion.species].viewBox,'desktop uses the catalog viewBox');
    if(rendered.sprite.startsWith('petanim-'))assert.ok(PET_CLIPS[companion.species][rendered.action].frames.some(f=>f.id===rendered.sprite),'desktop renders a registered frame');
    assert.ok(rendered.width>0&&rendered.height>0,'selected companion resolves to visible SVG artwork');
    assert.equal(mainWin.isVisible(),false,'switching companions need not open the main window');
    await pet('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    writeFileSync(path.join(evidenceDir,`companion-${sprite}.png`),(await petWin.webContents.capturePage()).toPNG());
  }
  getPetMenu().getMenuItemById('garden').click();
  await until(()=>main(`document.querySelectorAll('.companion-choice').length===${companions.length}`),'companion picker did not render the saved roster');
  for(const species of ['pingu','skipper','chestnut',DEFAULT_PET]){
    const index=companionSpecies.indexOf(species),sprite=PETS[species].sprite;
    assert.ok(index>=0,'garden includes '+species);
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
  await until(()=>main("location.hash==='#garden' && Boolean(document.querySelector('#seed-choice'))"),'farm menu did not select the farm');
  getPetMenu().getMenuItemById('study').click();
  await until(()=>main("location.hash==='#study'"),'study menu did not navigate');
  getPetMenu().getMenuItemById('home').click();
  await until(()=>main("location.hash==='#home'"),'main menu did not restore home');
  await until(()=>mainWin.isVisible(),'pet menu cannot restore main window');
  await until(async()=>['idle','sad','sleep','focus'].includes(await pet("document.querySelector('#pet').dataset.action")),'one-shot action never returns to base');
  const motion=await pet("!matchMedia('(prefers-reduced-motion: reduce)').matches && document.querySelector('#pet-use').getAttribute('href').startsWith('#petanim-')");
  if(motion){const previous=await pet("document.querySelector('#pet-use').getAttribute('href')");await until(()=>pet(`document.querySelector('#pet-use').getAttribute('href')!==${JSON.stringify(previous)}`),'desktop frame clock did not advance');}
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
  await checkBackup(mainWin,baseUrl,evidenceDir);
  await main("document.querySelector('[data-action=\"navigate\"][data-page=\"home\"]').click()");
  return {rendered:true,tray:true,closeAndReopen:true,hideAndShow:true,actionsReturnToBase:true,
    initialScale,finalScale:1.7,settingsAndPresets:true,petMenu:true,hiddenCare:true,feedUsesInventory:true,menuNavigation:true,petSelection:true,petSelectionSync:true,companionSpecies,defaultCompanions:AVAILABLE_PETS,penguinSelection:true,backupRestore:true,drag:true,positionPersistence:true,displayCount:screen.getAllDisplays().length};
}
