// app.mjs 是页面总成：678 行、约 105 KB，十几个检查脚本按函数声明从里面切源码片段。
// 它不能再变胖了。新页面、新逻辑放进独立 .mjs 模块（参考 app-logic.mjs、
// network-status.mjs），app.mjs 只负责组装和接线——Electron 侧 main.mjs 已是这个形状。
//
// 这道护栏不是为了阻止改动，而是让「往单文件里再塞一段」在 CI 里当场被拦下：
// 每多一行，将来把它拆成模块的代价就更大，被源码锚点咬住的检查脚本也更多。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const MAX_LINES=678;
const source=readFileSync(new URL('./assets/garden/app.mjs',import.meta.url),'utf8');
const lines=source.replace(/\r?\n$/,'').split(/\r?\n/).length;

assert.ok(lines<=MAX_LINES,
 `app.mjs 从 ${MAX_LINES} 行涨到了 ${lines} 行。\n`+
 '新页面或新逻辑请放进独立的 .mjs 模块，再由 app.mjs 接线，不要继续加进这个单文件。\n'+
 '确实需要放宽上限时，请在这里写明理由，并同步核对各检查脚本的源码切片锚点。');

console.log(`app.mjs ${lines} 行，未超过 ${MAX_LINES} 行上限`);
