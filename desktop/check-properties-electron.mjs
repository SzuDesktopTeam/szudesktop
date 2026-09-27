// Electron 主进程纯策略模块的性质测试：listen-url / pet-policy / pet-settings / desktop-settings / window-policy / quit-coordinator。
// 这些模块都不 import electron，注入替身即可在纯 Node 下跑。公共小件见 desktop/property-testing.mjs。
// 文末带 “（修复前失败）” 的用例是随机测试找到、经人工复核确认的真实问题的最小回归用例。
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEndpointParser,parseSidecarEndpoint,parseListenUrl,redactToken,startupFailureReason,lastStderrLine,STARTUP_REASON_MAX,STDERR_DETAIL_MAX,launchUrl} from './electron/listen-url.mjs';
import {petWindowBounds,petScaleClamp,petPresetFor,pointInBounds,petIgnoresMouse,petSay,activePetOf,PET_SCALE_MIN,PET_SCALE_MAX,PET_SCALE_DEFAULT,PET_SCALE_PRESETS,PET_WIDTH,PET_HEIGHT} from './electron/pet-policy.mjs';
import {readPetSettings,writePetSettings} from './electron/pet-settings.mjs';
import {DESKTOP_DEFAULTS,readDesktopSettings,writeDesktopSettings,validateDesktopPatch,sidecarArgs,startupApprovedEnabled,isQuietStartup} from './electron/desktop-settings.mjs';
import {isAppUrl} from './electron/window-policy.mjs';
import {createQuitCoordinator,QUIT_SAVE_TIMEOUT_MS} from './electron/quit-coordinator.mjs';
import {Rng,forAll,forAllAsync,test,testAsync,report,PROTO_KEYS} from './property-testing.mjs';

// ───────────────────────── listen-url.mjs ─────────────────────────
const HEX=Array.from({length:64},(_,i)=>'0123456789abcdef'[i%16]).join('');
const hex64=rng=>rng.array(64,()=>'0123456789abcdef'[rng.int(0,15)]).join('');
// 一行输出：合法协议行、“差一点”的伪造行、普通日志、超长垃圾行
function genLine(rng){
  return rng.weighted([
    [3,()=>`szuDesktop ${rng.pick(['已启动','已复用'])}: http://${rng.pick(['127.0.0.1','localhost'])}:${rng.int(1,65535)}`],
    [3,()=>`szuDesktop 会话: ${hex64(rng)}`],
    [2,()=>rng.pick([' szuDesktop 已启动: http://127.0.0.1:8080','szuDesktop 已启动: http://127.0.0.1:0','szuDesktop 已启动: http://127.0.0.1:65536','szuDesktop 已启动: http://127.0.0.1:99999','szuDesktop 已启动: https://127.0.0.1:8080','szuDesktop 已启动: http://127.0.0.2:8080','szuDesktop 已启动: http://127.0.0.1:8080/','szuDesktop 已启动: http://127.0.0.1:8080 ','szuDesktop 已启动: http://evil.test:8080','SZUDESKTOP 已启动: http://127.0.0.1:8080','szuDesktop 会话: '+HEX.toUpperCase(),'szuDesktop 会话: '+HEX.slice(1),'szuDesktop 会话: '+HEX+'0','szuDesktop 会话:'+HEX,'日志 szuDesktop 已启动: http://127.0.0.1:8080','szuDesktop 已启动: http://127.0.0.1:8080 szuDesktop 会话: '+HEX])],
    [2,()=>rng.text(30)],
    [1,()=>rng.ascii(3).repeat(200)+rng.pick(['','szuDesktop 已启动: http://127.0.0.1:8080'])],
  ]);
}
// 参考实现：整段文本按 \n 切成完整的行（最后一段是半行，不看），各取第一条合格的
const ENDPOINT=/^szuDesktop (已启动|已复用): http:\/\/(?:127\.0\.0\.1|localhost):(\d{1,5})\r?$/,SESSION=/^szuDesktop 会话: ([0-9a-f]{64})\r?$/;
function reference(text){
  const lines=text.split('\n');lines.pop();
  let endpoint=null,token=null;
  for(const line of lines){
    if(!endpoint){const m=ENDPOINT.exec(line);const port=m?Number(m[2]):0;if(port>=1&&port<=65535){endpoint={baseUrl:`http://127.0.0.1:${port}`,owned:m[1]==='已启动'};continue}}
    if(!token){const m=SESSION.exec(line);if(m)token=m[1]}
  }
  return endpoint&&token?{...endpoint,token}:null;
}
function genOutput(rng,size){
  const lines=rng.array(rng.int(0,Math.round(2+size*10)),()=>genLine(rng));
  const sep=rng.pick(['\n','\n','\r\n']);
  let text=lines.join(sep)+(rng.bool(0.8)?sep:'');
  if(rng.bool(0.2))text+=rng.pick(['szuDesktop 会话: '+HEX.slice(0,40),'szuDesktop 已启动: http://127.0.0.1:80','半行']);// 结尾半行
  // 切块方式：随机长度块（含 1 字符与空块），或整段一次喂入
  const cuts=[];if(rng.bool(0.9)){let at=0;while(at<text.length){const step=rng.weighted([[3,()=>rng.int(1,3)],[2,()=>rng.int(1,40)],[1,0],[1,()=>rng.int(1,600)]]);cuts.push(text.slice(at,at+step));at+=step}}else cuts.push(text);
  return {text,cuts};
}
forAll('createEndpointParser：任意切块（逐字符、空块、跨行、超长行）与整段解析结果相同；半行永不被接受；结果里的端口与凭据都来自完整合格的行',genOutput,({text,cuts})=>{
  const expected=reference(text),parser=createEndpointParser();
  let result=null,firstAt=-1;
  cuts.forEach((chunk,i)=>{const out=parser(chunk);if(out&&firstAt<0)firstAt=i;if(out)assert.deepEqual(out,result??out,'一旦就绪结果不再变化');result=out??result;if(!out)assert.equal(result,null,'就绪后不该又变回 null')});
  assert.deepEqual(result,expected,'切块解析应与参考实现一致');
  assert.deepEqual(parseSidecarEndpoint(text),expected);assert.equal(parseListenUrl(text),expected?.baseUrl??null);
  if(expected){
    assert.ok(text.includes(`:${expected.baseUrl.split(':')[2]}`)&&text.includes(expected.token));
    const fed=cuts.slice(0,firstAt+1).join('');assert.deepEqual(reference(fed),expected,'首次就绪时已喂入的完整行足以得出同一结果');
    assert.equal(launchUrl(expected),expected.baseUrl+'/?launch='+expected.token);
  }
});
forAll('redactToken：输出不含凭据；空凭据或非字符串凭据时原样返回；startupFailureReason/lastStderrLine 长度受限、不以标点结尾、不抛错',rng=>({text:rng.text(40),token:rng.weighted([[3,()=>hex64(rng)],[1,''],[1,null],[1,()=>rng.ascii(3)]]),stderr:rng.weighted([[2,()=>rng.array(rng.int(0,4),()=>rng.pick(['panic: x','启动失败: 端口被占用。','启动失败：'+rng.text(400),'  启动失败 : 原因 ;; ',rng.text(20),'']) ).join(rng.pick(['\n','\r\n'])).toWellFormed()],[1,null],[1,()=>rng.text(500).toWellFormed()]])}),({text,token,stderr})=>{
  const mixed=text+String(token??'')+text;
  const out=redactToken(mixed,token);
  if(typeof token==='string'&&token){assert.ok(!out.includes(token),'凭据必须被抹掉');assert.equal(out,mixed.split(token).join('<会话凭据>'))}else assert.equal(out,mixed);
  assert.equal(redactToken(null,token),'');
  // stderr 来自 utf8 解码，不会带孤立代理项（缩小器删字符可能造出来，这里先规整）
  if(typeof stderr==='string')stderr=stderr.toWellFormed();
  const reason=startupFailureReason(stderr),detail=lastStderrLine(stderr);
  assert.ok(reason.length<=STARTUP_REASON_MAX&&detail.length<=STDERR_DETAIL_MAX);
  for(const v of [reason,detail]){assert.equal(typeof v,'string');if(v)assert.doesNotMatch(v,/[。.！!；;，,\s]$/,'不以标点或空白结尾');if(v)assert.ok(v.isWellFormed(),'截断不该切开代理对')}
  if(reason)assert.ok(String(stderr).includes(reason.slice(0,20)),'原因来自 stderr');
  if(String(stderr||'').trim()==='')assert.equal(detail,'');
});

// ───────────────────────── pet-policy.mjs ─────────────────────────
const genNumberish=rng=>rng.weighted([[5,()=>rng.int(-3000,4000)],[2,()=>rng.float()*3000-500],[1,()=>rng.pick([NaN,Infinity,-Infinity,null,undefined,'12','x',0,-0])]]);
forAll('petWindowBounds：任意工作区/缩放/位置下窗口整个落在工作区内，宽高≥1，缩放已夹紧；有效位置被保留或夹到边缘',rng=>({area:rng.bool(0.1)?rng.pick([null,undefined,{},'x']):{x:genNumberish(rng),y:genNumberish(rng),width:rng.weighted([[4,()=>rng.int(1,4000)],[1,()=>rng.pick([0,0.5,-10,NaN,undefined,1e9])]]),height:rng.weighted([[4,()=>rng.int(1,3000)],[1,()=>rng.pick([0,0.5,-10,NaN,undefined,1e9])]])},scale:rng.weighted([[4,()=>rng.float()*3],[1,()=>rng.pick([NaN,'1.5',null,-1,100,PET_SCALE_MIN,PET_SCALE_MAX])]]),position:rng.weighted([[3,()=>({x:genNumberish(rng),y:genNumberish(rng)})],[1,null],[1,undefined],[1,()=>({x:'1',y:2})]])}),({area,scale,position})=>{
  const b=petWindowBounds(area,scale,position);
  for(const k of ['x','y','width','height'])assert.ok(Number.isInteger(b[k]),`${k}=${b[k]} 应为整数`);
  assert.ok(b.width>=1&&b.height>=1);
  const a=area&&typeof area==='object'?area:{};
  const ax=Number.isFinite(a.x)?Math.round(a.x):0,ay=Number.isFinite(a.y)?Math.round(a.y):0,aw=Number.isFinite(a.width)?Math.max(1,Math.floor(a.width)):1,ah=Number.isFinite(a.height)?Math.max(1,Math.floor(a.height)):1;
  assert.ok(b.x>=ax&&b.x+b.width<=ax+aw,`横向应在工作区内: ${JSON.stringify(b)} vs ${JSON.stringify({ax,aw})}`);
  assert.ok(b.y>=ay&&b.y+b.height<=ay+ah,`纵向应在工作区内: ${JSON.stringify(b)} vs ${JSON.stringify({ay,ah})}`);
  const s=petScaleClamp(scale);assert.ok(b.width<=Math.round(PET_WIDTH*s)&&b.height<=Math.round(PET_HEIGHT*s),'不放大超过缩放后的基准尺寸');
  assert.equal(b.width/b.height>0,true);
  if(Number.isFinite(position?.x)&&Number.isFinite(position?.y)){const px=Math.round(position.x),py=Math.round(position.y);assert.equal(b.x,Math.min(ax+aw-b.width,Math.max(ax,px)));assert.equal(b.y,Math.min(ay+ah-b.height,Math.max(ay,py)))}
  assert.deepEqual(petWindowBounds(area,scale,position),b,'确定性');
  assert.equal(pointInBounds({x:b.x,y:b.y},b),true);assert.equal(pointInBounds({x:b.x+b.width,y:b.y},b),false,'右边界不含');assert.equal(pointInBounds({x:b.x,y:b.y+b.height},b),false,'下边界不含');
});
forAll('petScaleClamp：幂等、落在 [MIN,MAX]、两位小数；petPresetFor 与预设一致；petIgnoresMouse 只认字面 true；petSay 不超过 60 码元',rng=>({v:rng.weighted([[4,()=>rng.float()*4-1],[2,()=>rng.pick([NaN,Infinity,-Infinity,null,undefined,'0.6','abc',1e300,0.405,0.6,1,1.5])],[1,()=>rng.pick(PET_SCALE_PRESETS).scale]]),hit:rng.pick([true,false,'true',1,null,undefined]),dragging:rng.pick([true,false,'x',0]),menu:rng.pick([true,false,{}]),text:rng.text(80)}),({v,hit,dragging,menu,text})=>{
  const s=petScaleClamp(v);
  assert.ok(s>=PET_SCALE_MIN&&s<=PET_SCALE_MAX);assert.equal(petScaleClamp(s),s,'幂等');assert.equal(Math.round(s*100)/100,s,'两位小数');
  if(!Number.isFinite(Number(v)))assert.equal(s,PET_SCALE_DEFAULT);
  const preset=petPresetFor(v);assert.ok(preset===null||PET_SCALE_PRESETS.some(p=>p.id===preset&&p.scale===s));
  for(const p of PET_SCALE_PRESETS)assert.equal(petPresetFor(p.scale),p.id);
  assert.equal(petIgnoresMouse({hit,dragging,menu}),!(hit===true||dragging===true||menu===true));
  assert.ok(petSay(text).length<=60&&text.startsWith(petSay(text)));
  assert.equal(activePetOf({pets:[],active:0}),null);assert.equal(activePetOf(null),null);
});

// ───────────────────────── pet-settings.mjs / desktop-settings.mjs（临时目录里真实读写） ─────────────────────────
const dir=mkdtempSync(join(tmpdir(),'szu-properties-'));
process.on('exit',()=>{try{rmSync(dir,{recursive:true,force:true})}catch{}});
forAll('pet-settings：写入后读回等于返回的载荷（缩放已夹紧，位置只在有限时保留），任意输入都不抛错',rng=>({scale:rng.weighted([[4,()=>rng.float()*3],[1,()=>rng.pick([NaN,Infinity,'1','x',null,undefined,-2,1e9])]]),position:rng.weighted([[3,()=>({x:rng.int(-5000,5000)+rng.pick([0,0.5]),y:rng.int(-5000,5000)})],[1,()=>({x:NaN,y:1})],[1,null],[1,undefined],[1,()=>({x:'1',y:'2'})],[1,()=>({x:1e300*10,y:0})]])}),({scale,position})=>{
  const sub=join(dir,'pet');
  const payload=writePetSettings(sub,scale,position),back=readPetSettings(sub);
  assert.equal(payload.version,1);assert.equal(payload.scale,petScaleClamp(scale));
  const hasPosition=Number.isFinite(position?.x)&&Number.isFinite(position?.y);
  assert.equal('position' in payload,hasPosition);
  assert.deepEqual(back,hasPosition?{scale:payload.scale,position:payload.position}:{scale:payload.scale},'读回应与写入一致');
  assert.deepEqual(readPetSettings(sub),back,'读取是纯函数');
},{cases:300});
const PREFS=['focusNotifications','doNotDisturb','petVisible','petAlwaysOnTop','autoConnectCampus'];
forAll('desktop-settings：写入任意 JSON 后返回值键集固定、开关全为布尔、lastNotifiedFocus 为 null 或 ≤80 字符串，读回一致；validateDesktopPatch 只放行布尔开关',(rng,size)=>({value:rng.weighted([[3,()=>Object.fromEntries([...PREFS,'lastNotifiedFocus','version','extra',rng.pick(PROTO_KEYS)].filter(()=>rng.bool(0.7)).map(k=>[k,rng.weighted([[3,()=>rng.bool()],[1,()=>rng.pick(['true',1,0,null,undefined,'x'.repeat(rng.int(0,100))])],[1,()=>rng.json(1)]])]))],[1,()=>rng.json(2,{keys:PREFS,allowSpecial:true})]]),patch:rng.weighted([[3,()=>Object.fromEntries([...PREFS,'launchAtLogin','other',rng.pick(PROTO_KEYS)].filter(()=>rng.bool(0.4)).map(k=>[k,rng.weighted([[4,()=>rng.bool()],[1,()=>rng.pick(['true',1,null])]])]))],[1,()=>rng.pick([null,[],'x',5,undefined])]])}),({value,patch})=>{
  const sub=join(dir,'desk');
  const settings=writeDesktopSettings(sub,value);
  assert.deepEqual(Object.keys(settings).sort(),Object.keys(DESKTOP_DEFAULTS).sort(),'键集固定');
  for(const k of PREFS){assert.equal(typeof settings[k],'boolean');assert.equal(settings[k],typeof value?.[k]==='boolean'?value[k]:DESKTOP_DEFAULTS[k])}
  assert.ok(settings.lastNotifiedFocus===null||(typeof settings.lastNotifiedFocus==='string'&&settings.lastNotifiedFocus.length<=80));
  assert.deepEqual(readDesktopSettings(sub),settings,'读回一致');
  assert.deepEqual(writeDesktopSettings(sub,settings),settings,'幂等');
  const valid=patch&&typeof patch==='object'&&!Array.isArray(patch)&&Object.entries(patch).every(([k,v])=>[...PREFS,'launchAtLogin'].includes(k)&&typeof v==='boolean');
  if(valid){const out=validateDesktopPatch(patch);assert.deepEqual(out,patch);assert.notEqual(out,patch,'返回副本')}else assert.throws(()=>validateDesktopPatch(patch),/桌面设置/);
},{cases:300});
test('sidecarArgs / isQuietStartup / startupApprovedEnabled 的真值表',()=>{
  const rng=new Rng(11);
  for(let i=0;i<300;i++){
    const smoke=rng.pick([true,false,undefined]),auto=rng.pick([true,false,'true',1,undefined]);
    const args=sidecarArgs({smoke,autoConnectCampus:auto});assert.equal(args[0],'--no-open');assert.equal(args.includes('--no-auto-login'),!!smoke||auto!==true,'只有明确开启且非冒烟时才自动登录');
    const argv=rng.array(rng.int(0,3),()=>rng.pick(['--autostart','--smoke','x','--autostart=1']));assert.equal(isQuietStartup(argv),argv.includes('--autostart'));
    const byte=rng.int(0,255),text=rng.bool(0.8)?`  name REG_BINARY ${byte.toString(16).padStart(2,'0')}0000`:rng.pick(['',null,'garbage','REG_SZ 02']);
    const out=startupApprovedEnabled(text);assert.equal(typeof out,'boolean');if(text&&/REG_BINARY/.test(text))assert.equal(out,(byte&1)===0);else assert.equal(out,true);
  }
});

// ───────────────────────── window-policy.mjs ─────────────────────────
forAll('isAppUrl：同源且无凭据的本机地址放行，任何其他来源、协议、主机、端口或带凭据的地址都拒绝，垃圾输入不抛错',rng=>{
  const port=rng.int(1,65535),base=`http://127.0.0.1:${port}`;
  const url=rng.weighted([[3,()=>base+rng.pick(['','/','/#garden','/?launch=abc','/a/b?c=d#e','/%20x'])],[1,()=>`http://127.0.0.1:${rng.int(1,65535)}/`],[1,()=>rng.pick(['https://','http://','file://','javascript:','data:'])+rng.pick(['127.0.0.1','localhost','127.0.0.1.evil.test','evil.test','[::1]'])+':'+port+'/'],[1,()=>`http://${rng.pick(['user','user:pw',''])}@127.0.0.1:${port}/`],[1,()=>rng.text(15)],[1,()=>rng.pick([null,undefined,42,{},'',' '])]]);
  return {url,base,badBase:rng.bool(0.1)};
},({url,base,badBase})=>{
  const baseUrl=badBase?'http://localhost:1234':base;
  let ok;assert.doesNotThrow(()=>{ok=isAppUrl(url,baseUrl)});assert.equal(typeof ok,'boolean');
  let expected=false;try{const t=new URL(url),b=new URL(baseUrl);expected=b.protocol==='http:'&&b.hostname==='127.0.0.1'&&t.origin===b.origin&&!t.username&&!t.password}catch{}
  assert.equal(ok,expected);
  if(ok){const t=new URL(url);assert.equal(t.origin,base);assert.equal(t.username,'');assert.equal(t.password,'')}
});

// ───────────────────────── quit-coordinator.mjs（注入替身，随机事件序列） ─────────────────────────
// 事件：请求退出、页面回执（正确编号 / 伪造编号 / 旧编号 / 非布尔 ok）、保存超时、系统注销、对话框选择
const EVENTS=['beforeQuit','beforeQuit','prepared-ok','prepared-ok','prepared-fail','prepared-forged','prepared-stale','prepared-garbage','timeout','sessionEnd','tick','tick'];
function makeQuit({closeFails=false,stopFails=false,answer=1}={}){
  const calls=[],timers=[],sent=[];let crashed=false;
  const wc={isDestroyed:()=>false,isCrashed:()=>crashed,send:(channel,id)=>{sent.push(id);calls.push('send')}};
  const win={webContents:wc,isDestroyed:()=>false};
  const quit=createQuitCoordinator({app:{quit:()=>calls.push('app.quit')},dialog:{showMessageBox:async()=>{calls.push('dialog');return {response:answer}}},getMainWindow:()=>win,showMainWindow:()=>calls.push('show'),
    closeWindows:async()=>{calls.push('closeWindows');if(closeFails)throw Error('窗口已销毁')},stopEngine:async()=>{calls.push('stopEngine');if(stopFails)throw Error('引擎未退出')},
    setTimer:(fn,ms)=>{assert.equal(ms,QUIT_SAVE_TIMEOUT_MS);const t={fn,active:true};timers.push(t);return t},clearTimer:t=>{t.active=false}});
  return {quit,calls,timers,sent,fireTimer:()=>{const t=timers.findLast(t=>t.active);if(t){t.active=false;t.fn()}}};
}
const tick=()=>new Promise(r=>setImmediate(r));
// main.mjs 的 stopEngine 自己兜住异常从不 reject，这里同样不让它失败；closeWindows 失败的情形见文末回归用例
await forAllAsync('quit-coordinator：伪造/过期/非布尔回执不生效；保存回执后按 closeWindows→stopEngine→app.quit 顺序各一次；用户选择返回时不退出并可再次发起；不放行退出就不调用 app.quit',rng=>({events:rng.array(rng.int(1,12),()=>rng.pick(EVENTS)),answer:rng.pick([0,1,1])}),async({events,answer})=>{
  const h=makeQuit({answer}),unhandled=[];
  const onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
  try{
    let expectedQuit=false;
    for(const ev of events){
      const id=h.sent.at(-1);
      switch(ev){
        case 'beforeQuit':h.quit.beforeQuit({preventDefault(){}});break;
        case 'prepared-ok':h.quit.prepared({id,ok:true});break;
        case 'prepared-fail':h.quit.prepared({id,ok:false,message:'x'.repeat(300)});break;
        case 'prepared-forged':h.quit.prepared({id:(id??0)+7,ok:true});h.quit.prepared({id:'1',ok:true});break;
        case 'prepared-stale':h.quit.prepared({id:(id??1)-1,ok:true});break;
        case 'prepared-garbage':for(const g of [null,undefined,{},{id},{id,ok:'true'},{id,ok:1},[],'x',{id:String(id),ok:true},{ok:true}])assert.doesNotThrow(()=>h.quit.prepared(g));break;
        case 'timeout':h.fireTimer();break;
        case 'sessionEnd':h.quit.sessionEnd();expectedQuit=true;break;
        case 'tick':break;
      }
      await tick();await tick();
    }
    for(let i=0;i<6;i++)await tick();
    const count=name=>h.calls.filter(c=>c===name).length;
    assert.ok(count('closeWindows')<=1&&count('stopEngine')<=1,'关窗与停引擎各最多一次');
    if(count('closeWindows'))assert.ok(h.calls.indexOf('closeWindows')<h.calls.indexOf('stopEngine')&&h.calls.indexOf('stopEngine')<h.calls.lastIndexOf('app.quit'),'顺序 closeWindows→stopEngine→app.quit');
    assert.equal(count('stopEngine')>0,h.quit.isQuitting(),'isQuitting 与是否进入关闭流程一致');
    if(count('app.quit')&&!expectedQuit)assert.ok(count('stopEngine')===1,'不放行退出就不调用 app.quit');
    if(count('dialog'))assert.ok(count('show')>=1,'对话框前先显示主窗');
    // 选择“返回处理”后不得退出；之后再次请求并拿到保存成功的回执（或系统注销）才可以
    if(answer===0&&count('dialog')&&!events.includes('prepared-ok')&&!events.includes('sessionEnd'))assert.equal(count('stopEngine'),0,'用户选择返回处理时不退出');
    if(answer===0&&count('dialog'))assert.ok(h.sent.length>=count('dialog'),'返回处理后再次请求退出会重新向页面要保存回执');
    // 每次发出的请求编号严格递增，伪造编号永远不等于真实编号
    assert.deepEqual(h.sent,[...h.sent].sort((a,b)=>a-b));assert.equal(new Set(h.sent).size,h.sent.length);
    assert.deepEqual(unhandled,[],'不该留下未处理的 Promise 拒绝');
  }finally{process.off('unhandledRejection',onUnhandled)}
},{cases:300});

test('lastStderrLine/startupFailureReason 先去尾部标点再截断，截断后的结果又可能以标点或半个 emoji 结尾（修复前失败）',()=>{
  // tidy=(line,max)=>line.replace(/[。.！!；;，,\s]+$/,'').slice(0,max)：应先截断再清理尾部，并按码点截断。
  const line='原因'.repeat(99)+', '+'x'.repeat(100);
  assert.doesNotMatch(lastStderrLine(line),/[，,\s]$/,JSON.stringify(lastStderrLine(line).slice(-5)));
  const emoji='启动失败: '+'😀'.repeat(160);
  assert.ok(startupFailureReason(emoji).isWellFormed(),'按码元截断切开了 emoji');
});

await testAsync('quit-coordinator：closeWindows 抛错后仍然要停引擎并放行退出，否则以后再也退不出去（修复前失败）',async()=>{
  // beforeQuit 里只有 stopEngine 被 try/finally 保护；closeWindows、showMainWindow、dialog 任一拒绝都会让 shutdownPromise 永远停在 rejected，
  // 之后每次 before-quit 都因为 shutdownPromise 非空而直接返回：托盘“退出”与页面“退出应用”都失效，只能任务管理器结束进程。
  const h=makeQuit({closeFails:true}),unhandled=[];
  const onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
  try{
    h.quit.beforeQuit({preventDefault(){}});await tick();h.quit.prepared({id:h.sent.at(-1),ok:true});
    for(let i=0;i<6;i++)await tick();
    h.quit.beforeQuit({preventDefault(){}});for(let i=0;i<6;i++)await tick();
    assert.ok(h.calls.includes('closeWindows'));
    assert.ok(h.calls.includes('stopEngine'),`closeWindows 失败后仍应停引擎：${JSON.stringify(h.calls)}`);
    assert.ok(h.calls.includes('app.quit'),`closeWindows 失败后仍应放行退出：${JSON.stringify(h.calls)}`);
    assert.deepEqual(unhandled.map(e=>e.message),[],'不该留下未处理的 Promise 拒绝');
  }finally{process.off('unhandledRejection',onUnhandled)}
});

report();
