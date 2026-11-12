// Regression checks for the review fixes (one settings object, import staging and confirmation, loading a save).
//   node tools/harness/play.mjs --root spikes/ui-demo --script spikes/ui-demo/scripts/fixes.mjs --query screen=title
export default async ({ page, log, url }) => {
  const base = url.split('?')[0];
  const failures = [];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)));
  const check = (name, ok, detail) => {
    if (!ok) failures.push(name);
    log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
  };
  const go = async (q) => {
    await page.goto(`${base}?${q}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
    await page.waitForTimeout(200);
  };
  const calls = () => page.evaluate('window.__uiDemo.facade.calls.slice()');
  const rootPx = () => page.evaluate('parseFloat(document.documentElement.style.fontSize)');

  // 1. UI -> game: Gameplay > Autosave writes GameSettings.gameplay.autosaveMin; nothing goes to a private store
  await go('screen=settings&tab=gameplay&reducedMotion=1');
  await page.getByRole('radio', { name: '10 min' }).click();
  const st = await page.evaluate('window.__uiDemo.facade.getSettings().gameplay.autosaveMin');
  const priv = await page.evaluate("localStorage.getItem('foundress.ui.v1')");
  check('settings: Autosave 10 min is stored in the game settings, not in a UI-only key', st === 10 && priv === null, { autosaveMin: st, privateKey: priv });

  // 2. game -> UI: a change made through the game's settings (the debug hook, a loaded file) reaches the UI at the next refresh
  await go('screen=title&reducedMotion=1');
  const before = await rootPx();
  await page.evaluate("window.__uiDemo.facade.setSettings({ accessibility: { uiScale: 150 } }); window.__uiDemo.facade.quitToTitle();");
  await page.waitForTimeout(300);
  const after = await rootPx();
  check('settings: UI scale 150 % set through the game settings is applied by the UI', after > before * 1.3, { before, after });

  // 3. Accessibility > UI scale slider writes percent into the game settings
  await go('screen=settings&tab=accessibility&reducedMotion=1');
  const slider = page.getByRole('slider', { name: 'UI scale' });
  await slider.focus();
  await page.keyboard.press('End');
  const pct = await page.evaluate('window.__uiDemo.facade.getSettings().accessibility.uiScale');
  check('settings: the UI scale slider stores a percent (150) in the game settings', pct === 150, { pct });

  // 4. Import: a chosen file waits for a target; an occupied slot asks; success raises no error
  await go('screen=save-load&tab=transfer&from=title&reducedMotion=1');
  const errs0 = pageErrors.length;
  await page.setInputFiles('[data-testid=import-file]', { name: 'x.foundress', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3, 4]) });
  await page.waitForSelector('[data-testid=import-staged]');
  await page.click('[data-testid=import-go]');
  check('import: Import without a target is refused with a hint', (await page.locator('.ui-text-error').innerText()).includes('where to store') && (await calls()).every((c) => !c.startsWith('import')), await calls());
  await page.click('[aria-label="Store the imported colony in"]');
  await page.locator('.ui-select-opt').filter({ hasText: 'Slot 1' }).click();
  await page.click('[data-testid=import-go]');
  await page.waitForSelector('.ui-modal');
  check('import: an occupied slot asks before it is overwritten', (await page.locator('.ui-modal').innerText()).includes('already holds a colony') && (await calls()).every((c) => !c.startsWith('import')));
  await page.getByRole('button', { name: 'Overwrite' }).click();
  await page.waitForTimeout(300);
  const imp = (await calls()).filter((c) => c.startsWith('import'));
  check('import: after confirming, the bytes go to that slot and no error is raised', imp.length === 1 && imp[0].endsWith('-> slot-1') && pageErrors.length === errs0, { imp, errors: pageErrors.slice(errs0) });
  // an empty slot needs no confirmation
  await page.setInputFiles('[data-testid=import-file]', { name: 'y.foundress', mimeType: 'application/octet-stream', buffer: Buffer.from([5, 6, 7]) });
  await page.waitForSelector('[data-testid=import-staged]');
  await page.click('[aria-label="Store the imported colony in"]');
  await page.locator('.ui-select-opt').filter({ hasText: 'Slot 2' }).click();
  await page.click('[data-testid=import-go]');
  await page.waitForTimeout(300);
  check('import: an empty slot is filled without a dialog', (await page.locator('.ui-modal').count()) === 0 && (await calls()).filter((c) => c.startsWith('import')).length === 2, await calls());

  // 5. Loading a save shows that save and the load wording; a failure offers Back only
  await go('screen=title&reducedMotion=1');
  await page.click('[data-testid=menu-continue]');
  await page.waitForSelector('[data-screen=loading]');
  const h1 = await page.locator('.ui-loading h1').innerText();
  const summary = await page.locator('[data-testid=loading-save-summary]').count();
  check('loading: Continue shows the load wording and the save summary', h1.includes('Loading your colony') && summary === 1, { h1, summary });
  await go('screen=loading-load-error&reducedMotion=1');
  const btns = await page.locator('.ui-loading button').allInnerTexts();
  const h2 = await page.locator('.ui-loading h1').innerText();
  check('loading: a failed load says so and offers Back only', h2.includes('could not be loaded') && btns.map((b) => b.trim()).includes('Back') && !btns.some((b) => b.includes('another seed')), { h2, btns });

  log(`${failures.length} failing`);
  if (failures.length) throw new Error(`fix checks failed: ${failures.join('; ')}`);
  return { failures };
};
