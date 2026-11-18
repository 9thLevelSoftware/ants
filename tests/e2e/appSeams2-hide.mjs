// app-seams-2 fix, item 12(b): which scene part draws the pale slab? Screenshots of the opening with one named part hidden at a time.
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=low" --script tests/e2e/appSeams2-hide.mjs --out test-output/app-seams-2-fix/hide
export default async ({ page, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await page.keyboard.press('KeyH'); // HUD off
  for (const name of (process.env.HIDE_PARTS ?? 'none,world:sky,boundary:backdrop,boundary:skirt').split(',')) {
    await g((n) => {
      const sc = window.__hud.game.scene;
      sc.traverse((o) => { if (o.isMesh && o.name) o.visible = !(n !== 'none' && o.name.startsWith(n)); });
    }, name);
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await page.screenshot({ path: `${out}/hide-${name.replace(/:/g, '-')}.png`, timeout: 300000 });
  }
};
