// look-pass-4: pose shots on the opening (no cheats). env SHOTS = comma list of: opening, above, wide. HUD stays (KEEP_HUD=0 hides it with the setting).
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=high&archetype=suburban-garden" --script tests/e2e/look4-pose.mjs --out test-output/look4/<dir>
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  const render = () => g(() => window.__game.renderFrame({ settle: 1 }));
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  const want = (process.env.SHOTS ?? 'opening').split(',');
  const name = process.env.SHOT_NAME ?? '';
  if (want.includes('opening')) { await render(); await shot(`${name}opening`); }
  if (want.includes('above')) {
    await g(() => window.__game.camera.orbit(0, -75)); await render(); await shot(`${name}from-above`);
    await g(() => window.__game.camera.zoom(0.4)); await render(); await shot(`${name}from-above-close`);
  }
  log('summary', JSON.stringify(await g(() => { const s = window.__game.summary(); return { arch: window.__hud.game.session.sim.world.params?.archetype, pos: s.possessed?.pos }; })));
};
