import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReleaseUI,compareVersions} from './assets/garden/release-ui.mjs';
const version=readFileSync(new URL('../internal/version/VERSION',import.meta.url),'utf8').trim();
globalThis.document={getElementById:()=>null};
assert.equal(compareVersions('beta0.10.0','beta0.9.10'),1);
assert.equal(compareVersions('v1.0.0','beta1.0.0'),1);
assert.equal(compareVersions('unknown','beta0.9.2'),null);
// 默认渠道跟着当前构建走：测试版（beta0.9.7）默认查测试版，正式版（v1.0.0）默认只查正式版。
// 以前下面写死了 beta，VERSION 一改成 v1.0.0，发版 PR 的检查就变红，而产品逻辑本身是对的。
for(const [current,expected] of [['beta0.9.7','beta'],['v1.0.0','stable']]){const seen=[],probe=createReleaseUI({getVersion:()=>current,api:async path=>{seen.push(path);return {available:false}}});assert.ok(probe.card().includes(`<option value="${expected}" selected>`),current);await probe.click('release-check');assert.deepEqual(seen,['/api/releases?channel='+expected],current)}
const channel=version.startsWith('beta')?'beta':'stable',other=channel==='beta'?'stable':'beta',newer=(channel==='beta'?'beta':'v')+'99.0.0';
let calls=[],failure=false,response={available:true,version:newer,url:'https://github.com/SzuDesktopTeam/szudesktop/releases/tag/'+newer,prerelease:channel==='beta'};
const ui=createReleaseUI({getVersion:()=> version,api:async path=>{calls.push(path);if(failure)throw Error('无法连接发布服务');return response}});
assert.equal(calls.length,0);assert.match(ui.card(),/点击后才联网/);
await ui.click('release-check');assert.equal(calls.at(-1),'/api/releases?channel='+channel);assert.match(ui.card(),/发现新版本/);
ui.change({target:{id:'release-channel',value:other}});assert.doesNotMatch(ui.card(),/发现新版本/);assert.equal(calls.length,1);
response={available:false,message:'这个渠道还没有发布'};await ui.click('release-check');assert.match(ui.card(),/这个渠道还没有发布/);assert.equal(calls.at(-1),'/api/releases?channel='+other);
failure=true;await ui.click('release-check');assert.match(ui.card(),/无法连接发布服务/);assert.doesNotMatch(ui.card(),/已是此渠道最新版本/);
// 连不上 GitHub 时服务端沿用早先的结果并标 stale：页面照常给出结论，再用弱提示说明这是多久以前的结果（消息要转义）。
failure=false;response={available:true,stale:true,version,url:`https://github.com/SzuDesktopTeam/szudesktop/releases/tag/${version}`,message:'GitHub 暂时不可用，显示的是 15 分钟前的检查结果。<b>'};
await ui.click('release-check');assert.match(ui.card(),/已是此渠道最新版本/);assert.ok(ui.card().includes('<p class="muted">GitHub 暂时不可用，显示的是 15 分钟前的检查结果。&lt;b&gt;</p>'),ui.card());
response={available:true,version,url:`https://github.com/SzuDesktopTeam/szudesktop/releases/tag/${version}`,message:'新鲜结果不显示附言'};
await ui.click('release-check');assert.match(ui.card(),/已是此渠道最新版本/);assert.doesNotMatch(ui.card(),/新鲜结果不显示附言|暂时不可用/);
console.log('PASS release channels, numeric comparison, manual-only fetch, stale results and truthful failures');
