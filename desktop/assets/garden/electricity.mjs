import {esc} from './html.mjs';

// Electricity has its own anonymous intranet connection. Never import the
// teaching-system session or persist room readings into the garden save.
export function createElectricityUI({api}){
 let configured=false,checked=false,entry='',campuses=[],buildings=[],client='',building='',room='',manual=false;
 let from='',to='',result=null,error='',message='',menuBusy=false,queryBusy=false,generation=0,menuGeneration=0,enterPromise=null;
 const localDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 const today=new Date(),week=new Date(today);week.setDate(week.getDate()-6);from=localDate(week);to=localDate(today);
 const field=(id,label,value,type='text',extra='')=>`<div><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
 const choices=(items,value)=>items.map(item=>`<option value="${esc(item.value)}"${item.value===value?' selected':''}>${esc(item.name)}</option>`).join('');
 const quantity=value=>typeof value==='number'&&Number.isFinite(value)?`${esc(value)} kWh`:'未提供';
 function readings(){
  if(!result)return '';
  if(!result.recorded_at)return '<section aria-label="电量查询结果"><p role="status" class="notice">这段日期内没有记录，未把它当成零电量。可以调整日期后再查。</p></section>';
  return `<section aria-label="电量查询结果"><h3>剩余电量：${quantity(result.remaining_kwh)}</h3><p>学校记录时间：${esc(result.recorded_at)}</p><p>累计用电：${quantity(result.total_used_kwh)} · 累计购电：${quantity(result.total_purchased_kwh)}</p><p class="muted">累计值来自电表历史，不能当作所选日期内的用电量。学校更新可能有延迟。</p></section>`;
 }
 function content(){
  const busy=menuBusy||queryBusy;
  return `<div class="card-head"><h2>宿舍电量</h2><span class="badge" data-tone="info">只读查询 · kWh</span></div><p>查看自己宿舍的剩余电量和电表记录。需要能直连学校电量系统的校园网络。</p>
  <details${checked&&!configured?' open':''}><summary>${configured?'更换本机电量入口':'首次设置本机电量入口'}</summary><p class="muted">从学校官方电量查询页复制完整地址，只保存在这台电脑的独立设置里。这里不需要教务账号或密码。</p>${field('electricity-entry','学校电量查询入口',entry,'url','autocomplete="off" placeholder="学校电量查询页的完整网址"')}<div class="actions"><button type="button" data-action="electricity-save"${busy?' disabled':''}>保存本机入口</button></div></details>
  <div class="actions"><button type="button" data-action="electricity-options"${busy?' disabled':''}>${campuses.length?'刷新校区与楼栋':'读取校区与楼栋'}</button></div>
  ${configured?`<div class="grid">${campuses.length&&!manual?`<div><label for="electricity-client">校区</label><select id="electricity-client">${choices(campuses,client)}</select></div><div><label for="electricity-building">楼栋</label><select id="electricity-building"><option value="">请选择楼栋</option>${choices(buildings,building)}</select></div>`:`${field('electricity-manual-client','校区值（学校页面的 client）',client,'text','maxlength="80"')}${field('electricity-manual-building','楼栋值（学校页面的 roomId）',building,'text','maxlength="20" inputmode="numeric"')}`}${field('electricity-room','自己的宿舍房号',room,'text','maxlength="40" autocomplete="off"')}${field('electricity-from','开始日期',from,'date')}${field('electricity-to','结束日期',to,'date')}</div>${manual?'<p class="muted">菜单暂时无法读取时，可从学校查询页的参数中填写校区值与楼栋值。它们不是校区名称或房号。</p>':''}<div class="actions"><button type="button" class="primary" data-action="electricity-query"${busy?' disabled':''}>查询电量</button></div>`:''}
  <div id="electricity-status">${statusHTML()}</div>${readings()}<p class="muted">数值单位为 kWh（度），不是人民币余额。这里只查电量，充值请使用学校官方渠道。</p>`;
 }
 function statusHTML(){return `${menuBusy||queryBusy?'<p role="status">正在读取学校电量系统…</p>':''}${error?`<p role="status" class="notice error">${esc(error)}</p>`:''}${message?`<p role="status" class="notice">${esc(message)}</p>`:''}`}
 function section(){return `<section class="card" id="electricity-panel">${content()}</section>`}
 function paint(){const el=globalThis.document?.getElementById('electricity-panel');if(el)el.innerHTML=content()}
 function invalidateQuery(){generation++;queryBusy=false;result=null;error='';message=''}
 function invalidateMenu(){menuGeneration++;menuBusy=false;invalidateQuery()}
 async function settings(gen){const s=await api('/api/electricity/settings');if(gen!==menuGeneration)return;configured=!!s.configured;checked=true;return configured}
 async function loadOptions(selected=''){
  const requested=selected||client,changed=!!requested&&requested!==client;
  invalidateMenu();if(changed){client=requested;buildings=[];building=''}const gen=menuGeneration;menuBusy=true;paint();
  try{
   if(!configured){const saved=await settings(gen);if(gen!==menuGeneration)return;if(!saved){message='请先设置这台电脑使用的学校电量查询入口';return}}
   const out=await api('/api/electricity/options'+(requested?'?client='+encodeURIComponent(requested):''));
   if(gen!==menuGeneration)return;
   const previousBuilding=client===out.client?building:'';
   campuses=Array.isArray(out.campuses)?out.campuses:[];buildings=Array.isArray(out.buildings)?out.buildings:[];client=out.client||'';
   building=buildings.some(item=>item.value===previousBuilding)?previousBuilding:'';manual=!!out.manual||!campuses.length;
   if(!building)message=manual?'请核对校区值和楼栋值，再填写自己的宿舍房号':'请选择楼栋，再填写自己的宿舍房号';
  }catch(e){if(gen!==menuGeneration)return;manual=true;buildings=[];error=e.message||'校区与楼栋暂时无法读取';checked=true}
  finally{if(gen===menuGeneration){menuBusy=false;paint()}}
 }
 function enter(){if(!enterPromise)enterPromise=loadOptions(client);return enterPromise}
 async function click(action){
  if(!action.startsWith('electricity-'))return false;
  if(action==='electricity-options'){await loadOptions(client);return true}
  if(action==='electricity-save'){
   invalidateMenu();const gen=menuGeneration;menuBusy=true;paint();
   try{await api('/api/electricity/settings',{entry_url:entry},'POST');if(gen!==menuGeneration)return true;entry='';configured=checked=true;campuses=[];buildings=[];client=building='';manual=false;message='入口已保存在这台电脑，可以读取校区与楼栋'}
   catch(e){if(gen===menuGeneration)error=e.message||'本机入口没有保存成功'}
   finally{if(gen===menuGeneration){menuBusy=false;paint()}}
   return true;
  }
  if(action==='electricity-query'){
   invalidateQuery();if(!client||!building||!room.trim()){error='请填写校区、楼栋和自己的宿舍房号';paint();return true}
   const gen=generation,payload={client,building_id:building,room:room.trim(),from,to};queryBusy=true;paint();
   try{const out=await api('/api/electricity/query',payload,'POST');if(gen===generation)result=out}
   catch(e){if(gen===generation)error=e.message||'这次没有读到电量，请稍后重试'}
   finally{if(gen===generation){queryBusy=false;paint()}}
   return true;
  }
  return false;
 }
 function update(event){
  const {id,value}=event.target||{};const fields={'electricity-entry':'entry','electricity-manual-client':'client','electricity-manual-building':'building','electricity-room':'room','electricity-from':'from','electricity-to':'to','electricity-building':'building'};
  if(!fields[id])return false;
  if(fields[id]==='entry'||fields[id]==='client')invalidateMenu();else invalidateQuery();
  if(fields[id]==='entry')entry=value;else if(fields[id]==='client')client=value;else if(fields[id]==='building')building=value;else if(fields[id]==='room')room=value;else if(fields[id]==='from')from=value;else if(fields[id]==='to')to=value;
  // Preserve the actively edited input; only remove the previous result/status.
  const el=globalThis.document?.getElementById('electricity-panel');if(el){for(const node of el.querySelectorAll?.('[aria-label="电量查询结果"]')||[])node.remove();for(const button of el.querySelectorAll?.('button')||[])button.disabled=menuBusy||queryBusy}
  const status=globalThis.document?.getElementById('electricity-status');if(status)status.innerHTML=statusHTML();
  return true;
 }
 async function change(event){if(event.target?.id==='electricity-client'){await loadOptions(event.target.value);return true}return update(event)}
 function input(event){return update(event)}
 async function submit(){return false}
 return {section,click,change,input,submit,enter,load:enter};
}
