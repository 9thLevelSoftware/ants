// look-pass-4 recon: list named scene parts and hide each one in turn at a fixed pose; HIDE_PARTS=comma list of name prefixes.
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=high" --script tests/e2e/look4-recon.mjs --out test-output/look4/recon
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  const names = await g(() => { const s = window.__hud.game.scene, r = {}; s.traverse((o) => { if (o.isMesh || o.isPoints) r[o.name || o.type] = (r[o.name || o.type] || 0) + 1; }); return r; });
  log('parts', JSON.stringify(names));
  for (const name of (process.env.HIDE_PARTS ?? 'none').split(',')) {
    await g((n) => { window.__hud.game.scene.traverse((o) => { if ((o.isMesh || o.isPoints) && o.name) o.visible = !(n !== 'none' && o.name.startsWith(n)); }); }, name);
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await page.screenshot({ path: `${out}/hide-${name.replace(/:/g, '-')}.png`, timeout: 300000 });
  }
};
