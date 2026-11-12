// Reviewer checks (ui-shell verify) that need a real browser. Each check prints ok / FAIL; the script throws when any
// check fails, so it stays red until the bugs it demonstrates are fixed.
//   node tools/harness/play.mjs --root spikes/ui-demo --script spikes/ui-demo/scripts/review.verify.mjs --query screen=title
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
  const active = () => page.evaluate(`(() => { const e = document.activeElement; if (!e || e === document.body) return null; return (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40); })()`);
  const selectedTab = () => page.evaluate(`document.querySelector('[role=tab][aria-selected=true]')?.textContent ?? null`);
  const calls = () => page.evaluate('window.__uiDemo.facade.calls.slice()');

  // 1. GDD 08 3.3: focus starts on Continue when a save exists, also when the save list arrives late (IndexedDB)
  await go('screen=pause&reducedMotion=1');
  await page.evaluate(`(() => { const f = window.__uiDemo.facade; const orig = f.listSaves.bind(f); f.listSaves = () => new Promise((r) => setTimeout(() => r(orig()), 300)); f.quitToTitle(); })()`);
  await page.waitForTimeout(900);
  const f1 = await active();
  check('title: initial focus is Continue when saves arrive after the first frame', (f1 ?? '').startsWith('Continue'), { focus: f1 });

  // 2. Q / E must not switch Settings tabs underneath an open dialog (focus trap, GDD 08 2.7 Modal)
  await go('screen=settings&tab=controls&reducedMotion=1');
  await page.click('[data-testid=reset-all]');
  await page.waitForSelector('.ui-modal');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const t2 = await selectedTab();
  const m2 = await page.locator('.ui-modal').count();
  const f2 = await active();
  check('settings: E with the Reset-all dialog open leaves the tab and the dialog alone', t2 === 'Controls' && m2 === 1 && f2 !== null, { tab: t2, modal: m2, focus: f2 });

  // 3. Typing a letter in an open Select is type-ahead (GDD 08 2.7), not a tab switch
  await go('screen=settings&tab=gameplay&reducedMotion=1');
  await page.click('.ui-select-btn');
  await page.waitForSelector('.ui-select-list');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const t3 = await selectedTab();
  const f3 = await active();
  check('settings: E inside an open Select does not switch the book tab or drop focus', t3 === 'Gameplay' && f3 !== null, { tab: t3, focus: f3 });

  // 4. Import from a file: no uncaught error (the real game turns it into the fatal error overlay) ...
  await go('screen=save-load&tab=transfer&from=title&reducedMotion=1');
  const errsBefore = pageErrors.length;
  await page.setInputFiles('[data-testid=import-file]', { name: 'x.foundress', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3, 4]) });
  await page.waitForTimeout(400);
  check('save-load: importing a file raises no uncaught error', pageErrors.length === errsBefore, pageErrors.slice(errsBefore));
  // ... and nothing is overwritten before the player confirms (GDD 08 7.6) — slot 1 already holds a colony
  const imp = (await calls()).filter((c) => c.startsWith('import'));
  const modal4 = await page.locator('.ui-modal').count();
  check('save-load: importing into an occupied slot asks before overwriting it', imp.length === 0 || modal4 > 0, { imports: imp, modal: modal4 });

  // 5. Epitaph -> New colony opens the New Game setup (GDD 08 3.1 flow: epitaph -> new-game), it does not start a default game
  await go('screen=epitaph&reducedMotion=1');
  await page.click('[data-testid=epitaph-new]');
  await page.waitForTimeout(300);
  const ng = (await calls()).filter((c) => c.startsWith('newGame'));
  check('epitaph: New colony opens the setup screen instead of generating with defaults', ng.length === 0 && (await page.locator('.ui-newgame').count()) === 1, { newGameCalls: ng });

  // 6. GDD 08 2.3: "Window too small" follows the window size, not only the next snapshot
  await go('screen=title&reducedMotion=1');
  await page.setViewportSize({ width: 400, height: 250 });
  await page.waitForTimeout(500);
  const small = await page.locator('[data-testid=too-small]').count();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  const grown = await page.locator('[data-testid=too-small]').count();
  check('too-small notice appears on shrink and disappears on grow', small === 1 && grown === 0, { afterShrink: small, afterGrow: grown });

  // 7. Esc while a binding is listening cancels only the listening (GDD 08 7.5)
  await go('screen=settings&tab=controls&reducedMotion=1');
  await page.click('[data-testid="bind-pause-toggle-1"]');
  await page.waitForSelector('[data-listening="1"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const book7 = await page.locator('.ui-book').count();
  const listen7 = await page.locator('[data-listening="1"]').count();
  check('controls: Esc cancels listening and keeps Settings open', book7 === 1 && listen7 === 0, { book: book7, listening: listen7 });

  log(`${failures.length} failing`);
  if (failures.length) throw new Error(`review checks failed: ${failures.join('; ')}`);
  return { failures };
};
