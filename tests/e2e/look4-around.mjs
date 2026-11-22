// look-pass-4: the opening pose turned round in four quarter turns (far structures in every direction), HUD hidden by the harness only if HUD=0.
//   node tools/harness/play.mjs --root . --query "test=1&seed=2&autostart=1&quality=test&archetype=car-park-verge" --script tests/e2e/look4-around.mjs --out test-output/look4/item2d/around
export default async ({ page, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  for (let i = 0; i < 4; i++) {
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await page.screenshot({ path: `${out}/turn${i}.png`, timeout: 600000 });
    await g(() => window.__game.camera.orbit(90, 0));
  }
};
