import assert from 'node:assert/strict';
import {createCommandWake} from './main-window.mjs';
const changes=[],timers=new Map(),timeouts=[];
let timerId=0;
const wake=createCommandWake({setThrottling:v=>changes.push(v),onTimeout:id=>timeouts.push(id),
  schedule:(fn,ms)=>{assert.equal(ms,30000);const id=++timerId;timers.set(id,fn);return id;},cancel:id=>timers.delete(id)});
const first=wake.begin(),second=wake.begin();
assert.notEqual(first,second);assert.deepEqual(changes,[false]);
wake.finish(undefined);wake.finish(999);assert.deepEqual(changes,[false]);
wake.finish(second);assert.deepEqual(changes,[false],'busy second click does not suspend the first save');
wake.finish(first);assert.deepEqual(changes,[false,true]);assert.equal(timers.size,0);
wake.finish(first);assert.deepEqual(changes,[false,true],'late/duplicate result is ignored');
const third=wake.begin();[...timers.values()][0]();
assert.deepEqual(timeouts,[third]);assert.deepEqual(changes,[false,true,false,true]);
const fourth=wake.begin(),stale=[...timers.values()][0];wake.clear();stale();
assert.equal(timers.size,0);assert.deepEqual(timeouts,[third],'window destruction cannot emit a stale timeout');
assert.deepEqual(changes,[false,true,false,true,false,true]);
console.log('Hidden command wake: correlated replies, overlapping/busy commands, bounded timeout and destruction cleanup');
