// app-seams-2 review pictures (independent of the implementer's appSeams2.mjs):
//  r01 the intro card with no context prompt over it;  r02 the opening: focus line + minimap;
//  r03 after the hand-over (cheat): a NEW aim opens behind an older open one: does the Auto focus line show?
//  r04 the same game in a compact window (900 x 500): the minimap must be hidden;  r05 Settings > Gameplay rows.
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=low" --script tests/e2e/appSeams2-review.mjs \
//        --out test-output/app-seams-2-review/hud --timeout 300000 --script-timeout 1500000
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
  const frames = (n = 3) => g(async (k) => { for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(() => r())); }, n);
  const hud = () => g(() => ({
    prompts: document.querySelectorAll('[data-hud="prompts"]').length,
    focus: document.querySelector('[data-testid="focus-line"]')?.textContent ?? null,
    minimapMounted: !!document.querySelector('[data-testid="minimap"]'),
    minimapShown: (() => { const m = document.querySelector('[data-testid="minimap"]'); return !!m && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().width > 0; })(),
    layout: document.documentElement.dataset.layout ?? null,
  }));
  const result = {};

  await frames(4);
  await g(() => window.__hud.game.setSettings({ gameplay: { minimap: 'always', focusLine: 'auto' } }));
  await frames(4);
  result.intro = await hud();
  log('r01', JSON.stringify(result.intro));
  await shot('r01-intro');

  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await frames(6);
  result.opening = await hud();
  log('r02', JSON.stringify(result.opening));
  await shot('r02-opening');

  // hand-over by cheat, then let the HUD settle on the current top aim
  await g(() => window.__game.cheat.completeFounding(10));
  const handedOver = () => g(() => { const op = window.__hud.game.session.sim.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
  for (let i = 0; i < 200 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  const cont = page.locator('[data-testid="founding-continue"]');
  if (await cont.count()) await cont.first().click().catch(() => {});
  await g(() => window.__game.step(20));
  await frames(6);
  // wait out any 30 s window of the hand-over itself
  await page.waitForTimeout(32000);
  await g(() => window.__game.step(2));
  await frames(4);
  result.beforeNewAim = { ...(await hud()), aims: await g(() => window.__hud.game.session.sim.state.progression.aims.map((a) => `${a.id}:${a.state}`)) };
  log('r03 before', JSON.stringify(result.beforeNewAim));
  // a new aim opens while the older ones stay open (what the sim does when a later aim becomes eligible)
  await g(() => {
    const sim = window.__hud.game.session.sim;
    const open = sim.state.progression.aims.filter((a) => a.state === 'open');
    if (open.length >= 3) { open[open.length - 1].state = 'done'; } // keep a free slot; the OLDEST stays open
    sim.state.progression.aims.push({ id: 'aim-midden', state: 'open', openedTick: sim.state.tick, doneTick: -1 });
    window.__game.step(2);
    window.__hud.game.refreshUi();
  });
  await frames(6);
  result.afterNewAim = { ...(await hud()), aims: await g(() => window.__hud.game.session.sim.state.progression.aims.map((a) => `${a.id}:${a.state}`)) };
  log('r03 after', JSON.stringify(result.afterNewAim));
  await shot('r03-new-aim-behind-older');

  // compact layout: the minimap must hide
  await page.setViewportSize({ width: 900, height: 500 });
  await frames(8);
  result.compact = await hud();
  log('r04', JSON.stringify(result.compact));
  await shot('r04-compact');
  await page.setViewportSize({ width: 1280, height: 720 });
  await frames(6);

  await g(() => window.__game.ui.open('pause'));
  await page.waitForSelector('[data-testid="pause-settings"]', { timeout: 60000 });
  await page.locator('[data-testid="pause-settings"]').click();
  await page.locator('.ui-book [role="tab"]', { hasText: 'Gameplay' }).click();
  await frames(5);
  result.settings = await g(() => ({ crit: window.__hud.game.settings.get().gameplay.autoSlowCritical, warn: window.__hud.game.settings.get().gameplay.autoSlowWarning }));
  log('r05', JSON.stringify(result.settings));
  await shot('r05-settings-gameplay');
  return result;
};
