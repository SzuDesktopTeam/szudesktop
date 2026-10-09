// 注入到被采集页面的「虚拟时钟」：在任何页面脚本之前运行（evaluateOnNewDocument）。
// - live 模式：虚拟时间跟着真实时间走，页面像平常一样运行（用于准备状态）。
// - manual 模式：时间只在 Node 端调用 step() 时前进，逐帧确定地推进 JS 定时器、rAF、
//   CSS 动画与过渡（Web Animations API 暂停后按帧设 currentTime），再截图，得到稳定的 60fps。
// 墙钟（Date）= 起始墙钟 + 已过虚拟时间 + 额外偏移（延时摄影时只推墙钟）。
// 本文件以 __CFG__ 占位，由 harness 在注入前替换为 JSON。
(() => {
  if (window.__promoClock) return;
  const CFG = __CFG__;
  const RealDate = Date;
  const rST = window.setTimeout.bind(window);
  const rSI = window.setInterval.bind(window);
  const rCI = window.clearInterval.bind(window);
  const rNow = performance.now.bind(performance);
  const C = {
    wallStart: CFG.wallStart,
    perf: 0,
    wallExtra: 0,
    anim: 0,
    mode: 'live',
    timers: new Map(),
    seq: 1,
    rafs: new Map(),
    rafSeq: 1,
    lastReal: rNow(),
    lastRafAt: 0,
    tracked: new Map(),
    liveTimer: 0,
    running: false,
  };
  const wall = () => Math.round(C.wallStart + C.perf + C.wallExtra);

  function FakeDate(...args) {
    if (!new.target) return new RealDate(wall()).toString();
    return args.length ? new RealDate(...args) : new RealDate(wall());
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => wall();
  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  Object.defineProperty(FakeDate, 'name', { value: 'Date' });
  window.Date = FakeDate;
  try { performance.now = () => C.perf; } catch {}

  const report = e => { try { window.reportError ? window.reportError(e) : console.error(e); } catch {} };
  function addTimer(fn, delay, args, repeat) {
    const id = C.seq++;
    const d = Math.max(0, Number(delay) || 0);
    C.timers.set(id, { id, fn, args, due: C.perf + d, interval: repeat ? Math.max(1, d) : 0, order: id });
    return id;
  }
  window.setTimeout = (fn, delay, ...args) => addTimer(fn, delay, args, false);
  window.setInterval = (fn, delay, ...args) => addTimer(fn, delay, args, true);
  window.clearTimeout = window.clearInterval = id => { C.timers.delete(id); };
  window.requestAnimationFrame = cb => { const id = C.rafSeq++; C.rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { C.rafs.delete(id); };
  window.requestIdleCallback = (cb, opts) => addTimer(() => cb({ didTimeout: false, timeRemaining: () => 8 }), 1, [], false);
  window.cancelIdleCallback = id => { C.timers.delete(id); };

  const macrotask = () => new Promise(resolve => { const mc = new MessageChannel(); mc.port1.onmessage = () => { mc.port1.close(); resolve(); }; mc.port2.postMessage(0); });

  function nextDue(target) {
    let next = null;
    for (const t of C.timers.values()) if (t.due <= target && (!next || t.due < next.due || (t.due === next.due && t.order < next.order))) next = t;
    return next;
  }
  function fire(t) {
    if (t.interval) { t.due += t.interval; t.order = C.seq++; } else C.timers.delete(t.id);
    try { typeof t.fn === 'function' ? t.fn(...t.args) : (0, eval)(String(t.fn)); } catch (e) { report(e); }
  }
  async function runTimers(target, yieldBetween) {
    for (let guard = 0; guard < 20000; guard++) {
      const t = nextDue(target);
      if (!t) break;
      if (t.due > C.perf) C.perf = t.due;
      fire(t);
      if (yieldBetween) await macrotask();
    }
    if (target > C.perf) C.perf = target;
  }
  function runRafs() {
    if (!C.rafs.size) return;
    const list = [...C.rafs.values()];
    C.rafs.clear();
    for (const cb of list) { try { cb(C.perf); } catch (e) { report(e); } }
  }
  function syncAnimations() {
    const seen = new Set();
    for (const a of document.getAnimations()) {
      seen.add(a);
      let start = C.tracked.get(a);
      if (start === undefined) {
        const ct = typeof a.currentTime === 'number' ? a.currentTime : 0;
        start = C.anim - ct;
        C.tracked.set(a, start);
      }
      try {
        if (a.playState !== 'paused') a.pause();
        const local = C.anim - start;
        const end = a.effect?.getComputedTiming?.().endTime;
        if (Number.isFinite(end) && local >= end) { a.currentTime = end; a.finish(); C.tracked.delete(a); }
        else a.currentTime = local;
      } catch {}
    }
    for (const a of [...C.tracked.keys()]) if (!seen.has(a)) C.tracked.delete(a);
  }
  function releaseAnimations() {
    for (const [a, start] of C.tracked) { try { a.currentTime = C.anim - start; a.play(); } catch {} }
    C.tracked.clear();
  }

  async function liveTick() {
    if (C.mode !== 'live' || C.running) return;
    C.running = true;
    try {
      const real = rNow();
      const dt = Math.min(250, Math.max(0, real - C.lastReal));
      C.lastReal = real;
      const target = C.perf + dt;
      C.anim += dt;
      await runTimers(target, false);
      if (C.perf - C.lastRafAt >= 15) { C.lastRafAt = C.perf; runRafs(); }
    } finally { C.running = false; }
  }
  C.liveTimer = rSI(liveTick, 6);

  window.__promoClock = {
    get perf() { return C.perf; },
    get wall() { return wall(); },
    get mode() { return C.mode; },
    manual() {
      if (C.mode === 'manual') return;
      C.mode = 'manual';
      rCI(C.liveTimer);
      syncAnimations();
    },
    live() {
      if (C.mode === 'live') return;
      releaseAnimations();
      C.mode = 'live';
      C.lastReal = rNow();
      C.liveTimer = rSI(liveTick, 6);
    },
    // 推进 ms 毫秒：按到期顺序执行定时器（之间让出一次宏任务，让 Promise 链跑完），再跑一次 rAF 与 CSS 动画。
    async step(ms = 1000 / 60, { wallExtra = 0, fireEvery = 0 } = {}) {
      const target = C.perf + ms;
      C.wallExtra += wallExtra;
      await runTimers(target, true);
      if (fireEvery) { for (const t of [...C.timers.values()]) if (t.interval === fireEvery && C.timers.has(t.id)) { try { t.fn(...t.args); } catch (e) { report(e); } await macrotask(); } }
      C.anim += ms;
      runRafs();
      syncAnimations();
      await macrotask();
    },
    addWall(ms) { C.wallExtra += ms; },
    timerCount() { return C.timers.size; },
    realSetTimeout: rST,
  };
})();
