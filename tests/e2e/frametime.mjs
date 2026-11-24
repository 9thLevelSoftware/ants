// Frame time after the hand-over on the seed 1 colony (task gate-close-app step 5), by the app gate report's method
// (gate-1B-app-report §5: renderFrame({settle: 0}) wall time per frame, renderer statistics from perf()), at low,
// medium and high: median and p95 over FRAMETIME_N frames (default 600), draw calls and triangles. One sim tick between
// frames so the colony moves. Numbers are SwiftShader on a shared 4-core machine: the runner logs the load beside them.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/frametime.mjs \
//        --out test-output/gate-close/app/frametime --timeout 900000 --script-timeout 7200000
export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const N = Number(process.env.FRAMETIME_N ?? 600);
  const qualities = (process.env.FRAMETIME_Q ?? 'low,medium,high').split(',');
  const result = { n: N, standIns: ['opening completed by cheat.completeFounding + time-lapse skip'] };
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.cheat.completeFounding(10));
  const handedOver = () => g(() => { const op = window.__hud.game.session.sim.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
  for (let i = 0; i < 200 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  const cont = page.locator('[data-testid="founding-continue"]');
  if (await cont.count()) await cont.first().click().catch(() => {});
  log('handed over', JSON.stringify(await g(() => ({ tick: window.__hud.game.session.sim.state.tick }))));
  await g(() => window.__game.step(600)); // a game minute of colony life
  // the observer over the nest (the view a player watches the colony from)
  const bu = (await g(() => window.__game.query.world())).bu;
  const nests = await g(() => window.__game.query.nest());
  const o = nests[0].entrances[0]?.pos ?? nests[0].origin;
  await g(() => window.__game.release());
  await g(() => window.__game.camera.set('observer'));
  await g(({ o, bu }) => window.__game.camera.setPose({ x: o.x - 25 * bu, y: o.y + 15 * bu, z: o.z - 25 * bu }, o), { o, bu });
  // FRAMETIME_HOUR=<hour of the summer day>, FRAMETIME_WEATHER=clear|overcast|rain: the same scene at another light (look pass 6: the night lighting at low)
  if (process.env.FRAMETIME_HOUR) {
    await g((h) => window.__game.cheat.setTime(8 * 6000 + Math.round((h / 24) * 6000)), Number(process.env.FRAMETIME_HOUR));
    await g((w) => window.__game.cheat.setWeather(w), process.env.FRAMETIME_WEATHER ?? 'clear');
    result.light = { hour: Number(process.env.FRAMETIME_HOUR), weather: process.env.FRAMETIME_WEATHER ?? 'clear' };
  }
  result.ants = (await g(() => window.__game.perf())).ants ?? null;
  for (const q of qualities) {
    await g((id) => window.__game.quality(id), q);
    const ms = await g(async (n) => {
      const out = [];
      for (let i = 0; i < 10; i++) window.__game.renderFrame({ settle: 0 }); // warm-up: shaders, streaming
      for (let i = 0; i < n; i++) {
        window.__game.step(1);
        out.push(window.__game.renderFrame({ settle: 0 }).ms);
        if (i % 50 === 49) await new Promise((r) => setTimeout(r, 0)); // let the page breathe (no page-timeouts)
      }
      return out;
    }, N);
    log(q, 'frames done', ms.length);
    const p = await g(() => window.__game.perf());
    const sorted = [...ms].sort((a, b) => a - b);
    const at = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
    result[q] = { median: at(0.5), p95: at(0.95), min: sorted[0], max: sorted[sorted.length - 1], drawCalls: p.drawCalls, triangles: p.triangles };
    log(q, JSON.stringify(result[q]));
  }
  return result;
};
