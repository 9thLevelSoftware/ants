// app-seams-2 review, second pass: focus-line click opens Journal > Aims; the minimap hides in the compact layout
// (window 700 x 400 px = 933 x 533 dp at the 0.75 scale floor); a minimap click while possessing the founding queen.
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=low" --script tests/e2e/appSeams2-review2.mjs \
//        --out test-output/app-seams-2-review/hud2 --timeout 300000 --script-timeout 900000
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
  const frames = (n = 3) => g(async (k) => { for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(() => r())); }, n);
  const mm = () => g(() => {
    const m = document.querySelector('[data-testid="minimap"]');
    return { layout: document.documentElement.dataset.layout ?? null, mounted: !!m, shown: !!m && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().width > 0 };
  });
  const result = {};
  await frames(4);
  await g(() => window.__hud.game.setSettings({ gameplay: { minimap: 'always', focusLine: 'auto' } }));
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await frames(6);

  // focus line click -> Journal, Aims tab
  await page.locator('[data-testid="focus-line"]').click();
  await frames(4);
  result.journal = await g(() => ({ book: !!document.querySelector('.ui-book'), tab: document.querySelector('.ui-book [role="tab"][aria-selected="true"]')?.textContent ?? null }));
  log('focus click', JSON.stringify(result.journal));
  await shot('s01-focus-click-journal');
  await page.keyboard.press('Escape');
  await frames(4);

  // compact layout
  await page.setViewportSize({ width: 700, height: 400 });
  await frames(8);
  result.compact = await mm();
  log('compact', JSON.stringify(result.compact));
  await shot('s02-compact');
  await page.setViewportSize({ width: 1280, height: 720 });
  await frames(8);
  result.standard = await mm();

  // a minimap click while possessing the founding queen
  result.beforeClick = await g(() => ({ possessed: window.__game.summary().possessed?.id ?? null, view: window.__game.camera.view?.() ?? null, phase: window.__hud.game.session.sim.state.player.opening?.phase ?? null }));
  const box = await page.locator('.fd-minimap-box').boundingBox();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await g(() => window.__game.renderFrame());
  await frames(6);
  result.afterClick = await g(() => ({ possessed: window.__game.summary().possessed?.id ?? null, view: window.__game.camera.view?.() ?? null, phase: window.__hud.game.session.sim.state.player.opening?.phase ?? null }));
  log('click while possessing', JSON.stringify(result.beforeClick), JSON.stringify(result.afterClick));
  await shot('s03-minimap-click-while-possessing');
  return result;
};
