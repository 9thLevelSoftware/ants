// look-pass-4: pose shots. env: POSES = comma list of names from the table below; HUD off. Works on the opening (cheat-free) state.
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=high" --script tests/e2e/look4-pose.mjs --out test-output/look4/<dir>
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  const render = () => g(() => window.__game.renderFrame({ settle: 1 }));
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  if (!process.env.KEEP_HUD) await page.keyboard.press('KeyH');
  await render(); await shot('opening');
  await g(() => window.__game.camera.orbit(0, -75)); await render(); await shot('from-above');
  await g(() => window.__game.camera.zoom(0.4)); await render(); await shot('from-above-close');
};
