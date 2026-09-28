// 只给 check-main-wiring.mjs 的子进程用（node --import 这个文件的 file URL）：按 SZU_FORCE_PLATFORM 改写 process.platform，
// 在任何宿主上都能把 main.mjs 按 win32 或 darwin 的分支装配一遍。只改这一个值——path、os 等在启动时已按真实平台确定，
// 所以模拟只能证明 main.mjs 把各平台的依赖接对了，不能当作平台行为本身的证据。
const platform=process.env.SZU_FORCE_PLATFORM;
if(platform)Object.defineProperty(process,'platform',{value:platform,configurable:true,enumerable:true,writable:false});
