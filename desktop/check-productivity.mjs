import assert from 'node:assert/strict';
import {createState,dayKey} from './assets/garden/engine.mjs';
import {todoView,focusView,weeklySummary,weeklyView,journeyView} from './assets/garden/productivity.mjs';

const now=new Date(2026,8,27,12).getTime(),today=dayKey(now);
let checks=0;
function check(name,work){work();checks++;console.log('PASS',name)}
const todo=(id,extra={})=>({id,text:id,done:false,archived:false,date:'',completedAt:0,...extra});

check('todo views separate open, completed and archived items without losing dates',()=>{
 const state=createState(now);
 state.todos=[todo('today-task',{date:today}),todo('overdue-task',{date:'2026-09-26'}),todo('future-task',{date:'2026-09-28'}),todo('undated-task'),todo('done-task',{done:true,completedAt:now}),todo('legacy-done',{done:true}),todo('archived-task',{done:true,archived:true,completedAt:now})];
 const open=todoView(state,'open',now),done=todoView(state,'done',now),archived=todoView(state,'archive',now);
 assert.match(open,/待完成 4/);assert.match(open,/已完成 2/);assert.match(open,/归档 1/);
 assert.match(open,/今天/);assert.match(open,/尚未完成 · 2026-09-26/);assert.match(open,/计划于 2026-09-28/);assert.match(open,/未指定日期/);
 assert.match(open,new RegExp(`id="todo-date"[^>]*value="${today}"`));
 assert.doesNotMatch(open,/data-id="done-task"|data-id="archived-task"/);
 assert.match(done,/完成于/);assert.match(done,/早期记录未记日期/);assert.match(done,/data-action="todoArchiveDone"/);
 assert.doesNotMatch(done,/data-id="today-task"|data-id="archived-task"/);
 assert.match(archived,/data-action="todoToggle"[^>]*disabled/);assert.match(archived,/移出归档/);
 assert.doesNotMatch(archived,/data-action="todoEditOpen"|data-action="todoArchiveDone"/);
});
check('empty todo categories explain themselves and text and attributes are escaped',()=>{
 const state=createState(now);
 for(const [filter,message] of [['open','从一件小事开始'],['done','完成的小事会留在这里'],['archive','记录仍然保留']])assert.ok(todoView(state,filter,now).includes(message));
 state.todos=[todo('quoted"id',{text:'<script>计划 & 阅读</script>'})];
 const html=todoView(state,'open',now);
 assert.match(html,/data-id="quoted&quot;id"/);
 assert.match(html,/&lt;script&gt;计划 &amp; 阅读&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
 const refreshed=todoView(state,'open',now,false);
 assert.match(refreshed,/class="todo-state"/);assert.match(refreshed,/data-id="quoted&quot;id"/);
 assert.doesNotMatch(refreshed,/<form|id="todo-text"|id="todo-date"/,'局部更新清单时不能附带第二个输入表单');
});
check('weekly totals use seven local calendar days and exclude future and lifetime-only records',()=>{
 const state=createState(now),start=new Date(2026,8,21).getTime();
 state.game.stats.minutes=9999;
 state.game.focusHistory=[{endedAt:start-1,minutes:90},{endedAt:start,minutes:5},{endedAt:new Date(2026,8,24,22).getTime(),minutes:25},{endedAt:now,minutes:45},{endedAt:now+1,minutes:80}];
 state.todos=[todo('old',{done:true,completedAt:start-1}),todo('start',{done:true,completedAt:start}),todo('archived-completion',{done:true,archived:true,completedAt:now}),todo('future',{done:true,completedAt:now+1}),todo('legacy',{done:true}),todo('reopened',{completedAt:now})];
 const result=weeklySummary(state,now);
 assert.equal(result.days.length,7);assert.equal(result.days[0].day,'2026-09-21');assert.equal(result.days[6].day,today);
 assert.equal(result.minutes,75);assert.equal(result.tasks,2);assert.equal(result.history.length,3);
 assert.equal(result.days[0].minutes,5);assert.equal(result.days[3].minutes,25);assert.equal(result.days[6].minutes,45);
 assert.deepEqual(result.days.filter(d=>!d.minutes).map(d=>d.day),['2026-09-22','2026-09-23','2026-09-25','2026-09-26']);
 assert.match(weeklyView(state,now),/早期没有日期的记录保留在累计值里/);
});
check('weekly history displays latest ten in order and escapes task snapshots',()=>{
 const state=createState(now);
 state.game.focusHistory=Array.from({length:12},(_,i)=>({endedAt:now-i*60000,minutes:1,task:i===0?'<img src=x>':`focus-record-${i}`})).reverse();
 const html=weeklyView(state,now);
 assert.equal((html.match(/<li>/g)||[]).length,10);
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>|focus-record-10|focus-record-11/);
 assert.ok(html.indexOf('focus-record-1')<html.indexOf('focus-record-9'));
 assert.match(html,/<strong>12<\/strong> 分钟专注/,'totals include all weekly records, not only the displayed ten');
 assert.match(weeklyView(createState(now),now),/完成第一段专注后/);
});
check('focus form offers only open tasks and switches to the running session controls',()=>{
 const state=createState(now);
 state.todos=[todo('open-task',{text:'<阅读>'}),todo('done-task',{done:true}),todo('archived-task',{done:true,archived:true})];
 let html=focusView(state);
 assert.match(html,/<option value="open-task">&lt;阅读&gt;<\/option>/);assert.doesNotMatch(html,/value="done-task"|value="archived-task"/);
 assert.match(html,/id="focus-minutes"[^>]*min="1" max="120" step="1"/);assert.doesNotMatch(html,/data-action="focusClaim"/);
 state.game.focus={end:now+60000,duration:1,task:'<专注小事>'};html=focusView(state);
 assert.match(html,/&lt;专注小事&gt;/);assert.match(html,/data-action="focusClaim"/);assert.match(html,/data-action="focusCancel"/);
 assert.doesNotMatch(html,/id="focus-task"|id="focus-form"/);assert.match(html,/完全退出应用后不会发送通知/);
});
check('journey shows claimable progress without revealing locked stories or requiring a streak',()=>{
 const state=createState(now),html=journeyView(state.game);
 assert.match(html,/无需连续签到/);assert.match(html,/data-action="journeyClaim" data-id="hello"/);
 assert.match(html,/还未翻开/);assert.doesNotMatch(html,/小白在湖边停下来，等一圈水纹慢慢散开/);
 state.game.journey.claimed=['hello'];
 const next=journeyView(state.game);
 assert.match(next,/初见小灯/);assert.match(next,/下次来访再翻开/);assert.match(next,/data-id="lake" disabled/);
});
console.log(`${checks} productivity view checks passed`);
