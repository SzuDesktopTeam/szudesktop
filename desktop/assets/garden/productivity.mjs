import {dayKey,activePet,petSprite,journeyList} from './engine.mjs';
import {petViewBox} from './pet-catalog.mjs';
import {nextProject,projectStatus} from './garden-loop.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,action,attrs='',cls='quiet')=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const dateLabel=value=>value?new Date(value).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'}):'';

export function todoView(state,filter='open',now=Date.now(),includeForm=true){
 const today=dayKey(now),counts={open:state.todos.filter(t=>!t.done&&!t.archived).length,done:state.todos.filter(t=>t.done&&!t.archived).length,archive:state.todos.filter(t=>t.archived).length};
 const items=state.todos.filter(t=>filter==='archive'?t.archived:!t.archived&&(filter==='done'?t.done:!t.done));
 return `${includeForm?`<form id="todo-form" class="todo-add"><label class="sr-only" for="todo-text">新增待办</label><input id="todo-text" name="todo" placeholder="留一件值得完成的小事" maxlength="120" required><label class="sr-only" for="todo-date">计划日期</label><input id="todo-date" name="date" type="date" value="${today}" aria-label="计划日期（可留空）"><button class="primary">添加</button></form>`:''}<div class="todo-state">
 <div class="todo-filters" aria-label="小事分类">${Object.entries({open:'待完成',done:'已完成',archive:'归档'}).map(([k,label])=>button(`${label} ${counts[k]}`,'todoFilter',`data-filter="${k}" aria-pressed="${filter===k}"`,filter===k?'active':'quiet')).join('')}</div>
 <ul class="todos">${items.map(t=>`<li class="${t.done?'done':''}"><input type="checkbox" aria-label="完成：${esc(t.text)}" data-action="todoToggle" data-id="${esc(t.id)}" ${t.done?'checked':''} ${t.archived?'disabled':''}><div class="todo-copy"><span>${esc(t.text)}</span><small>${t.done?(t.completedAt?'完成于 '+dateLabel(t.completedAt):'已完成 · 早期记录未记日期'):t.date?(t.date===today?'今天':t.date<today?'尚未完成 · '+esc(t.date):'计划于 '+esc(t.date)):'未指定日期'}</small></div><div class="todo-actions">${!t.archived?button('编辑','todoEditOpen',`data-id="${esc(t.id)}"`):''}${t.done||t.archived?button(t.archived?'移出归档':'归档','todoArchive',`data-id="${esc(t.id)}" data-archived="${!t.archived}"`):''}${button('删除','todoDelete',`data-id="${esc(t.id)}"`)}</div></li>`).join('')}</ul>
 ${!items.length?`<p class="empty">${filter==='open'?'清单轻轻的。从一件小事开始。':filter==='done'?'完成的小事会留在这里。':'归档让清单整洁，记录仍然保留。'}</p>`:''}${filter==='done'&&counts.done?button('把已完成的小事归档','todoArchiveDone'):''}</div>`;
}

export function weeklySummary(state,now=Date.now()){
 const first=new Date(now);first.setHours(0,0,0,0);first.setDate(first.getDate()-6);
 const history=(state.game.focusHistory||[]).filter(x=>x.endedAt>=first.getTime()&&x.endedAt<=now);
 const days=Array.from({length:7},(_,i)=>{const d=new Date(first);d.setDate(d.getDate()+i);const key=dayKey(d.getTime());return {day:key,label:d.toLocaleDateString('zh-CN',{weekday:'short'}),minutes:history.filter(x=>dayKey(x.endedAt)===key).reduce((n,x)=>n+x.minutes,0)}});
 return {days,history,minutes:history.reduce((n,x)=>n+x.minutes,0),tasks:state.todos.filter(t=>t.done&&t.completedAt>=first.getTime()&&t.completedAt<=now).length};
}

export function weeklyView(state,now=Date.now()){
 const week=weeklySummary(state,now),max=Math.max(25,...week.days.map(x=>x.minutes));
 return `<section class="card weekly-card"><div class="card-head"><h2>这一周，慢慢积累</h2><small>最近 7 天</small></div><div class="week-totals"><span><strong>${week.minutes}</strong> 分钟专注</span><span><strong>${week.tasks}</strong> 件小事</span></div><div class="week-bars" aria-label="最近七天专注分钟">${week.days.map(d=>`<div><span>${d.minutes||'—'}</span><div class="week-bar-track"><i style="height:${Math.max(3,d.minutes/max*100)}%"></i></div><small>${d.label}</small></div>`).join('')}</div><p class="muted">只记录你完成并领取的专注。早期没有日期的记录保留在累计值里。</p><details><summary>最近完成的专注</summary>${week.history.length?`<ul class="focus-history">${week.history.slice().sort((a,b)=>b.endedAt-a.endedAt).slice(0,10).map(x=>`<li><time>${dateLabel(x.endedAt)}</time><span>${esc(x.task||'给自己的一段时间')}</span><strong>${x.minutes} 分钟</strong></li>`).join('')}</ul>`:'<p class="empty">完成第一段专注后，这里就有记录了。</p>'}</details></section>`;
}

export function focusView(state){
 const g=state.game,f=g.focus;
 const project=nextProject(g),gap=project?Math.ceil(projectStatus(g,project.id).coinShort):0;
 return `<section class="card focus-studio"><p class="eyebrow">把这一刻留给自己</p><h2>专注一下</h2><div class="timer" id="focus-clock">25:00</div><p class="timer-label">${f?esc(f.task||'正在陪你完成这一段时间'):'选一件小事，或者只给自己留点时间。'}</p>${f?`<div class="actions focus-actions">${button('完成并领取奖励','focusClaim','id="focus-claim"','primary')}${button('结束本次专注','focusCancel')}</div>`:`<label for="focus-task">这次想做什么？</label><select id="focus-task"><option value="">不关联待办</option>${state.todos.filter(t=>!t.done&&!t.archived).map(t=>`<option value="${esc(t.id)}">${esc(t.text)}</option>`).join('')}</select><div class="actions focus-actions">${[5,25,45].map(n=>button(n+' 分钟','focusStart',`data-minutes="${n}"`,n===25?'primary':'')).join('')}</div><form id="focus-form" class="focus-custom"><label for="focus-minutes">自定时长</label><input id="focus-minutes" name="minutes" type="number" min="1" max="120" step="1" value="25" required><span>分钟</span><button>开始</button></form>`}<p class="focus-note">每完成 1 分钟，获得 1 荔枝币与 1 点成长。${g.stats.minutes?'已累计 '+g.stats.minutes+' 分钟。':''}计时不监测你的学习行为。</p>${project?`<div class="focus-garden-note"><span>${gap?`这份积累可以用来准备${esc(project.name)}，还差 ${gap} 荔枝币。`:`${esc(project.name)}的材料钱已攒够，接下来慢慢备齐收成。`}</span>${button('看看庭院心愿 →','gardenRoute','data-tab="journal" data-anchor="garden-projects"')}</div>`:''}${f?'<p class="muted">计时已保存。安装版保持运行时可以在后台提醒；完全退出应用后不会发送通知。</p>':''}</section>`;
}

export function journeyView(g){
 const chapters=journeyList(g),next=chapters.find(x=>!x.claimed)||chapters.at(-1);
 return `<section class="card journey-card"><div class="card-head"><div><p class="eyebrow">荔园拾光</p><h2>和伙伴留下七份小记忆</h2></div><span class="badge">${chapters.filter(x=>x.claimed).length} / 7</span></div><p class="muted">每个来过的日子，翻开一页。无需连续签到，晚回来也没关系。</p><div class="journey-feature"><span class="journey-stamp" aria-hidden="true">${String(next.visit).padStart(2,'0')}</span><div><h3>${esc(next.title)}</h3><p>${next.available||next.claimed?esc(next.story):'下一次回来，听伙伴讲一段新的校园小故事。'}</p><small>${esc(next.keepsake)}</small><div class="actions">${button(next.claimed?'已放入回忆册':next.available?'收下这份小记忆':'下次来访再翻开','journeyClaim',`data-id="${esc(next.id)}" ${next.claimed||!next.available?'disabled':''}`,next.available&&!next.claimed?'primary':'quiet')}</div></div></div><details><summary>我的回忆册</summary><ol class="journey-list">${chapters.map(x=>`<li><strong>${esc(x.title)}</strong><span>${x.claimed?esc(x.story):x.available?'已可翻开':'还未翻开'}</span><small>${x.claimed?esc(x.keepsake):'第 '+x.visit+' 次来访'}</small>${x.available&&!x.claimed?button('收下','journeyClaim',`data-id="${esc(x.id)}"`):''}</li>`).join('')}</ol></details></section>`;
}

// Share only the selected companion and garden progress. School/profile data never enters the card.
export async function exportGardenCard(state,documentRef=document){
 const g=state.game,p=activePet(g),id=petSprite(p),baseID=id.split('-')[0],base=id!==baseID?documentRef.getElementById(baseID)?.outerHTML||'':'',symbol=(documentRef.getElementById(id)?.outerHTML||'')+base;
 if(!symbol)throw Error('伙伴画面还没准备好，请稍后重试');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs>${symbol}</defs><path d="M22 460h1156v318H22z" fill="#faf0d5"/><path d="M22 456h1156v8H22z" fill="#b88b52"/><rect x="60" y="58" width="372" height="67" fill="#385543" stroke="#d2bb80" stroke-width="3"/><g font-family="Microsoft YaHei, sans-serif"><text x="84" y="102" font-size="28" fill="#fff0cd">szuDesktop · 荔枝庭院</text><text x="70" y="539" font-size="46" font-weight="bold" fill="#314f3e">在荔园，过好每一天。</text><text x="73" y="592" font-size="24" fill="#72684d">一段安静的时间，一点看得见的成长。</text><text x="73" y="663" font-size="29" fill="#314f3e">${g.stats.minutes} 分钟专注 · ${g.stats.harvest} 次收获</text><text x="73" y="705" font-size="22" fill="#52664b">${g.discovered.length} 种作物 · ${g.plots.filter(x=>x!=='locked').length} 块小田</text><text x="73" y="752" font-size="18" fill="#827357">学生自制 · 本机庭院 · 与深圳大学官方无关</text></g><path d="M860 714h248v13H860z" fill="#d7c99e"/><svg x="885" y="486" width="200" height="228" viewBox="${petViewBox(p)}"><use href="#${id}"/></svg><rect x="14" y="14" width="1172" height="772" fill="none" stroke="#bc955d" stroke-width="16"/><rect x="24" y="24" width="1152" height="752" fill="none" stroke="#e7ce94" stroke-width="2"/></svg>`;
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{
  const image=new Image(),campus=new Image();image.src=url;campus.src=new URL('./campus.png',import.meta.url).href;await Promise.all([image.decode(),campus.decode()]);
  const canvas=documentRef.createElement('canvas');canvas.width=1200;canvas.height=800;
  const ctx=canvas.getContext('2d'),scale=Math.max(1200/campus.naturalWidth,465/campus.naturalHeight),width=campus.naturalWidth*scale,height=campus.naturalHeight*scale;
  ctx.fillStyle='#395745';ctx.fillRect(0,0,1200,800);ctx.imageSmoothingEnabled=false;ctx.drawImage(campus,(1200-width)/2,(465-height)/2,width,height);ctx.drawImage(image,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('导出没有完成，请重试');
  const now=new Date(),stamp=[now.getHours(),now.getMinutes(),now.getSeconds()].map(x=>String(x).padStart(2,'0')).join('');
  return {url:URL.createObjectURL(blob),filename:'荔枝庭院-'+dayKey(now.getTime())+'-'+stamp+'.png'};
 }finally{URL.revokeObjectURL(url)}
}
