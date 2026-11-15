// Browser performance with about 300 ants on a generated world (task int-1B-app, gate 1B step 6), at `test` and `low`:
// frame statistics from perf() (draw calls, triangles, simulation ms per tick, UI bridge ms, render CPU), JS heap
// growth over 5 minutes of 8x play (24 000 ticks, drawn every 1 200), and GPU resource counts after two
// new-game / quit cycles. Numbers are noisy on the shared software-GL machine: timings are minimums of repeats.
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=2&quality=test" --script tests/e2e/perf1b.mjs \
//        --out test-output/perf1b --script-timeout 3000000
// PERF_SHORT=1: 1 200 ticks of 8x instead of 24 000.

export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const result = {};
  const heap = () => g(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null));
  const frameStats = async (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      await g(() => window.__game.step(10));
      const t = await g(() => window.__game.renderFrame({ settle: 0 }));
      const p = await g(() => window.__game.perf());
      out.push({ frameMs: t.ms, drawCalls: p.drawCalls, triangles: p.triangles, simMsPerTick: p.simMsPerTick, renderCpuMs: p.renderCpuMs, ui: p.uiBridgeMs });
    }
    const min = (k) => Math.min(...out.map((o) => o[k]).filter((v) => v !== null));
    return { frames: out.length, frameMs: min('frameMs'), renderCpuMs: min('renderCpuMs'), simMsPerTick: min('simMsPerTick'), drawCalls: Math.max(...out.map((o) => o.drawCalls)), triangles: Math.max(...out.map((o) => o.triangles)) };
  };
  const uiBridge = () => g(() => {
    const t = [];
    for (let i = 0; i < 20; i++) { window.__game.step(1); const t0 = performance.now(); window.__hud?.game?.refreshUi?.(); t.push(performance.now() - t0); }
    t.sort((a, b) => a - b);
    return { min: +t[0].toFixed(3), median: +t[10].toFixed(3) };
  });

  // --- a colony of about 300 ants: the queen plus cheat-spawned workers round the start (setup) --------------------
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(90));
  await g(() => window.__game.cheat.completeFounding(20));
  for (let i = 0; i < 80; i++) {
    const done = await g(() => { const op = window.__game.query.player().opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
    if (done) break;
    await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  }
  const startPos = await g(() => window.__game.query.world().queenStart.pos);
  await g((p) => window.__game.cheat.spawnAnts(280, 'worker', null, p), startPos);
  await g(() => window.__game.step(200));
  await g(() => window.__game.release());
  await g(() => window.__game.camera.set('observer'));
  const pose = await g((p) => { const bu = window.__game.query.world().bu; return window.__game.camera.setPose({ x: p.x + 40 * bu, y: p.y + 30 * bu, z: p.z + 40 * bu }, p); }, startPos);
  void pose;
  result.ants = (await g(() => window.__game.perf())).ants;
  log('ants', result.ants);

  // --- frame statistics at test and low --------------------------------------------------------------------------
  result.test = { ...(await frameStats(6)), uiBridge: await uiBridge() };
  log('test', JSON.stringify(result.test));
  await g(() => window.__game.quality('low'));
  await g(() => window.__game.renderFrame({ settle: 0 }));
  result.low = { ...(await frameStats(6)), uiBridge: await uiBridge() };
  log('low', JSON.stringify(result.low));
  await g(() => window.__game.quality('test'));

  // --- 5 minutes of 8x play: heap and GPU resources, drawn every 1 200 ticks (2 game minutes) -------------------------
  await g(() => window.__game.setSpeed(8));
  const total = process.env.PERF_SHORT ? 1200 : 24000;
  const samples = [];
  for (let t = 0; t < total; t += 1200) {
    const s = await g(() => { const r = window.__game.step(1200); window.__game.renderFrame({ settle: 0 }); return r; });
    const p = await g(() => window.__game.perf());
    samples.push({ tick: s.tick, stepMs: s.ms, heapMb: await heap(), ants: p.ants, memory: p.memory, simMsPerTick: p.simMsPerTick });
    log('8x', JSON.stringify(samples[samples.length - 1]));
  }
  result.play8x = { samples, heapGrowthMb: samples.length > 1 ? +(samples[samples.length - 1].heapMb - samples[0].heapMb).toFixed(1) : null };

  // --- GPU resources across two new-game / quit cycles ---------------------------------------------------------------
  const counts = [];
  const snap = async (label) => { const p = await g(() => window.__game.perf()); counts.push({ label, ...p.memory, heapMb: await heap() }); log('gpu', label, JSON.stringify(p.memory)); };
  await g(() => window.__game.endGame());
  await g(() => window.__game.renderFrame());
  await snap('title-0');
  for (let c = 1; c <= 2; c++) {
    await g(() => window.__game.newGame({ seed: 2 }));
    await g(() => { window.__game.command({ type: 'openingSkipIntro' }); window.__game.step(100); window.__game.renderFrame(); });
    await snap(`game-${c}`);
    await g(() => window.__game.endGame());
    await g(() => window.__game.renderFrame());
    await snap(`title-${c}`);
  }
  result.cycles = counts;
  const t1 = counts.find((x) => x.label === 'title-1'), t2 = counts.find((x) => x.label === 'title-2');
  result.leak = { geometries: t2.geometries - t1.geometries, textures: t2.textures - t1.textures, programs: t2.programs - t1.programs };
  log('result', JSON.stringify(result));
  if (result.leak.geometries > 0 || result.leak.textures > 0) throw new Error(`GPU resources grew over the second game cycle: ${JSON.stringify(result.leak)}`);
  return result;
};
