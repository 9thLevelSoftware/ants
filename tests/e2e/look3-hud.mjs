// Look pass 3, item 6: the speed control flashes once on an automatic slow-down, and the sim event `time.auto-slow` is
// emitted (GDD 06 4.5). Runs on the real game with synthetic alert events (the sim raises most alert kinds only in
// situations a short script cannot stage). The flash is a 900 ms animation and a SwiftShader frame takes seconds, so the
// whole check (event, HUD refresh, one animation frame, DOM read) happens in ONE page call.
//
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=test" --script tests/e2e/look3-hud.mjs \
//        --out test-output/look3/hud --timeout 300000 --script-timeout 900000
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.cheat.completeFounding(10));
  const handedOver = () => g(() => { const op = window.__hud.game.session.sim.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
  for (let i = 0; i < 200 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  const cont = page.locator('[data-testid="founding-continue"]');
  if (await cont.count()) await cont.first().click().catch(() => {});
  await g(() => window.__game.step(2));
  await g(() => window.__game.setSpeed(8));
  const read = await g(async () => {
    const game = window.__hud.game, sim = game.session.sim;
    const events = [];
    const off = sim.events?.on ? sim.events.on('time.auto-slow', (e) => events.push(e)) : null;
    const speedBefore = window.__game.summary().time.speed;
    const alert = { id: 91001, kind: 'nest-collapse-risk', level: 'critical', subjectId: 1, title: 't', cause: 'c', focus: null, diagnosticId: null, raisedTick: sim.state.tick, updatedTick: sim.state.tick, count: 1, acknowledged: false };
    sim.emit({ type: 'alert', op: 'raise', alert });
    sim.events.flush();
    game.refreshUi();
    await new Promise((r) => requestAnimationFrame(() => r()));
    const btn = document.querySelector('.fd-speed-btn.is-selected');
    const res = {
      speedBefore, speedAfter: window.__game.summary().time.speed,
      flashClass: !!btn?.classList.contains('is-flash'), animation: btn ? getComputedStyle(btn).animationName : null, selected: btn?.getAttribute('aria-label') ?? btn?.textContent ?? null,
      flashes: game.autoSlowFlashes, events,
    };
    if (off) off();
    return res;
  });
  log('hud', JSON.stringify(read));
  await page.screenshot({ path: `${out}/speed-flash.png`, timeout: 300000 });
  if (read.speedAfter !== 1) throw new Error(`look3-hud: auto-slow did not drop to 1x ${JSON.stringify(read)}`);
  if (!read.flashClass) throw new Error(`look3-hud: the selected speed button did not flash ${JSON.stringify(read)}`);
  if (!(read.flashes >= 1)) throw new Error(`look3-hud: no flash counted ${JSON.stringify(read)}`);
  return read;
};
