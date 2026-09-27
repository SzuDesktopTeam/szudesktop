import assert from 'node:assert/strict';
import {createReleaseUI,compareVersions} from './assets/garden/release-ui.mjs';
globalThis.document={getElementById:()=>null};
assert.equal(compareVersions('beta0.10.0','beta0.9.10'),1);
assert.equal(compareVersions('v1.0.0','beta1.0.0'),1);
assert.equal(compareVersions('unknown','beta0.9.2'),null);
let calls=[],failure=false,response={available:true,version:'beta0.10.0',url:'https://github.com/SzuDesktopTeam/szudesktop/releases/tag/beta0.10.0',prerelease:true};
const ui=createReleaseUI({getVersion:()=> 'beta0.9.2',api:async path=>{calls.push(path);if(failure)throw Error('无法连接发布服务');return response}});
assert.equal(calls.length,0);assert.match(ui.card(),/点击后才联网/);
await ui.click('release-check');assert.equal(calls.at(-1),'/api/releases?channel=beta');assert.match(ui.card(),/发现新版本/);
ui.change({target:{id:'release-channel',value:'stable'}});assert.doesNotMatch(ui.card(),/发现新版本/);assert.equal(calls.length,1);
response={available:false,message:'目前还没有正式版'};await ui.click('release-check');assert.match(ui.card(),/还没有正式版/);assert.equal(calls.at(-1),'/api/releases?channel=stable');
failure=true;await ui.click('release-check');assert.match(ui.card(),/无法连接发布服务/);assert.doesNotMatch(ui.card(),/已是此渠道最新版本/);
// 连不上 GitHub 时服务端沿用早先的结果并标 stale：页面照常给出结论，再用弱提示说明这是多久以前的结果（消息要转义）。
failure=false;response={available:true,stale:true,version:'beta0.9.2',url:'https://github.com/SzuDesktopTeam/szudesktop/releases/tag/beta0.9.2',message:'GitHub 暂时不可用，显示的是 15 分钟前的检查结果。<b>'};
await ui.click('release-check');assert.match(ui.card(),/已是此渠道最新版本/);assert.ok(ui.card().includes('<p class="muted">GitHub 暂时不可用，显示的是 15 分钟前的检查结果。&lt;b&gt;</p>'),ui.card());
response={available:true,version:'beta0.9.2',url:'https://github.com/SzuDesktopTeam/szudesktop/releases/tag/beta0.9.2',message:'新鲜结果不显示附言'};
await ui.click('release-check');assert.match(ui.card(),/已是此渠道最新版本/);assert.doesNotMatch(ui.card(),/新鲜结果不显示附言|暂时不可用/);
console.log('PASS release channels, numeric comparison, manual-only fetch, stale results and truthful failures');
