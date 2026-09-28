// 主窗桥的 platform 字段：页面据此只在 macOS 上换文案（见 garden/platform.mjs）。
// 沙箱 preload 里 process.platform 可用；拿不到 process（旧环境、检查脚本的 vm）时必须给空串而不是抛错，
// 否则整座桥都暴露不出来，页面连退出、保存握手都用不了。空串让页面按 Windows 原文显示。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const preload=readFileSync(new URL('./preload.cjs',import.meta.url),'utf8');
function bridgeIn(extra={}){
  let bridge,name;
  vm.runInNewContext(preload,{...extra,require:()=>({contextBridge:{exposeInMainWorld:(key,value)=>{name=key;bridge=value;}},ipcRenderer:{on(){},removeListener(){},send(){},invoke:async()=>{}}})});
  assert.equal(name,'szuDesktop');assert.equal(bridge.shell,'electron');assert.ok(Object.isFrozen(bridge),'页面不能改写桥上的字段');
  return bridge;
}

assert.equal(bridgeIn().platform,'','没有 process 时给空串');
assert.equal(bridgeIn({process:{platform:'darwin'}}).platform,'darwin');
assert.equal(bridgeIn({process:{platform:'win32'}}).platform,'win32');
// process 存在但 platform 不是字符串（被裁剪过的 process）也按拿不到处理。
for(const process of [{},{platform:undefined},{platform:42},{platform:{toString:()=>'darwin'}}])assert.equal(bridgeIn({process}).platform,'',JSON.stringify(process));
assert.equal(typeof Object.getOwnPropertyDescriptor(bridgeIn({process:{platform:'darwin'}}),'platform').value,'string','platform 是数据字段，不是函数或 getter');
console.log('PASS 主窗桥的 platform：沙箱里读 process.platform，拿不到时是空串');
