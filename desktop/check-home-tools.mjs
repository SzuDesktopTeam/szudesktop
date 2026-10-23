import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HOME_TOOLS,findHomeTools,homeToolResults,homeToolbox} from './assets/garden/home-tools.mjs';
import {readRoute} from './assets/garden/routes.mjs';

for(const tool of HOME_TOOLS){
 assert.deepEqual(readRoute('#'+tool.page+(tool.tab?'/'+tool.tab:'')),{page:tool.page,tab:tool.tab});
}
assert.equal(new Set(HOME_TOOLS.map(t=>t.id)).size,HOME_TOOLS.length);
assert.equal(findHomeTools('').length,6);
for(const [query,id] of [['查书','library'],['宿舍 电费','electricity'],['GPA','grades'],['GＰＡ','grades'],['培养方案','program'],['借阅','library']]){
 assert.ok(findHomeTools(query).some(t=>t.id===id),query);
}
assert.equal(findHomeTools('不存在的功能').length,0);
const empty=homeToolResults('<img src=x onerror=alert(1)>');
assert.doesNotMatch(empty,/<img/);
assert.match(empty,/没有找到/);
assert.match(homeToolbox({query:'" onfocus="bad'}),/value="&quot; onfocus=&quot;bad"/);
assert.match(homeToolbox(),/aria-live="polite"/);
const scene=readFileSync(new URL('./assets/garden/campus-world.mjs',import.meta.url),'utf8');
assert.match(scene,/data-page="services" data-tab="notices"[^>]*>[\s\S]*?看看告示板/);
console.log('Home tools: valid routes, aliases, token search, safe empty state and notice shortcut passed');
