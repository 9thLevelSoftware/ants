// Look-pass-4 fix: the opening view at every quality tier (fence boards, far structures, near ground), same pose, plus the cost line.
//   TIERS=test,low,medium,high node tools/harness/play.mjs --root . --query "test=1&seed=2&autostart=1&quality=test" --script tests/e2e/look4-tiers.mjs --out <dir>
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(20));
  await g(() => { const s = window.__hud.game.session.sim.state; const tpd = 6000; const ct = s.env.calendar.startTick + s.tick; window.__game.command({ type: 'cheat.setTime', tick: Math.floor(ct / tpd) * tpd + 0.55 * tpd }); window.__game.command({ type: 'cheat.setWeather', state: 'clear', intensityClass: 0 }); });
  await g(() => window.__game.step(2));
  for (const q of (process.env.TIERS ?? 'test,low,medium,high').split(',')) {
    await g((id) => window.__game.quality(id), q);
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await shot(`opening-${q}`);
    log(q, JSON.stringify(await g(() => { const p = window.__game.perf(); return { drawCalls: p.drawCalls, triangles: p.triangles }; })));
  }
};
