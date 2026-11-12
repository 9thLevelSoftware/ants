// Behaviour checks in a real browser: keyboard interaction of the components, focus trap and restore, Esc layering,
// screen transitions, rebinding with conflict handling, save / load / export / import flows, UI scale, reduced
// motion, contrast mode, fonts and "no remote requests".
//   node tools/harness/play.mjs --root spikes/ui-demo --script spikes/ui-demo/scripts/behaviour.mjs --query screen=title
// The script throws when a check fails; every check prints one line.
export default async ({ page, log, url }) => {
  const base = url.split('?')[0];
  const results = [];
  const failures = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    if (!ok) failures.push(`${name}${detail ? ': ' + detail : ''}`);
    log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : detail ? ' -> ' + detail : ''}`);
  };
  const remote = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (!u.startsWith(base.replace(/\/$/, ''))) remote.push(u);
  });
  const go = async (q) => {
    await page.goto(`${base}?${q}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
    await page.waitForTimeout(150);
  };
  const active = () => page.evaluate(`(() => { const e = document.activeElement; if (!e || e === document.body) return null; return { tag: e.tagName, role: e.getAttribute('role'), text: (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50), checked: e.getAttribute('aria-checked'), now: e.getAttribute('aria-valuenow'), expanded: e.getAttribute('aria-expanded') }; })()`);
  const q = (sel) => page.locator(sel);
  // focus is restored a frame after a layer closes; poll for it instead of guessing a delay (the machine may be loaded)
  const focusText = async (prefix) => {
    try { await page.waitForFunction((p) => (document.activeElement?.textContent ?? '').trim().startsWith(p), prefix, { timeout: 3000 }); } catch { /* reported by the caller */ }
    return active();
  };
  const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); };
  const calls = () => page.evaluate('window.__uiDemo.facade.calls');
  const screenOf = () => page.evaluate(`document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null`);

  // ---------- title ----------
  await go('screen=title-empty&reducedMotion=1');
  let a = await active();
  check('title (no saves): initial focus is New colony', a?.text === 'New colony', JSON.stringify(a));
  check('title (no saves): Continue is disabled and not focusable', await page.evaluate(`(() => { const b = document.querySelector('[data-testid=menu-continue]'); return b.disabled === true && b.tabIndex !== 0 || b.disabled; })()`));
  check('title (no saves): Lineage is hidden', (await q('[data-testid=menu-lineage]').count()) === 0);
  const seq = [];
  for (let i = 0; i < 5; i++) { await press('Tab'); seq.push((await active())?.text); }
  check('title: Tab visits Load, Codex, Settings, Credits and returns to New colony', JSON.stringify(seq) === JSON.stringify(['Load', 'Codex', 'Settings', 'Credits', 'New colony']), JSON.stringify(seq));
  await press('Escape');
  check('title: Esc does nothing', (await screenOf()) === 'title' && (await q('.ui-book').count()) === 0);
  await go('screen=title&reducedMotion=1');
  a = await active();
  check('title (saves): initial focus is Continue', a?.text.startsWith('Continue'), JSON.stringify(a));
  await press('ArrowDown');
  check('title: arrow keys move through the menu', (await active())?.text === 'New colony');
  check('title: Continue line names species, date, population', (await q('[data-testid=menu-continue]').innerText()).includes('Lasius niger'));
  // open and close with focus restore
  await press('Enter');
  await page.waitForSelector('.ui-newgame');
  check('title: Enter on New colony opens New Game', true);
  a = await active();
  check('new game: initial focus is the chosen species card', a?.role === 'radio' && a?.checked === 'true', JSON.stringify(a));
  await press('Escape');
  await page.waitForSelector('.ui-newgame', { state: 'detached' });
  a = await focusText('New colony');
  check('new game: Esc returns to the title and focus returns to the opener', a?.text === 'New colony', JSON.stringify(a));

  // ---------- new game ----------
  await go('screen=new-game&reducedMotion=1');
  await q('[data-testid=seed-field]').fill('oak-17');
  check('new game: typed seed text shows its resolved code', (await q('[data-testid=seed-code]').innerText()).includes('from your text'));
  await q('[data-testid=seed-field]').fill('4f7a-21c9');
  check('new game: an 8-hex code is used as is', (await q('[data-testid=seed-code]').innerText()).includes('4F7A-21C9'));
  await q('[data-testid=randomise]').click();
  const seedVal = await q('[data-testid=seed-field]').inputValue();
  check('new game: Randomise writes a fresh code', /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(seedVal) && seedVal !== '4F7A-21C9', seedVal);
  check('new game: unreleased species are not selectable and say so', (await q('.ui-species-flag').count()) === 3 && (await q('[role=radiogroup][aria-label=Species] [role=radio][aria-disabled=true]').count()) === 3);
  await q('[role=radiogroup][aria-label=Difficulty] [role=radio]').nth(2).click();
  check('new game: choosing a preset selects its card', (await q('[role=radiogroup][aria-label=Difficulty] [role=radio][aria-checked=true]').innerText()).startsWith('Harsh'));
  await q('[data-testid=custom-toggle]').click();
  await page.locator('.ui-custom-body .ui-stepper').first().focus();
  await press('ArrowDown');
  check('new game: editing a custom rule switches the card to Custom', (await q('[role=radiogroup][aria-label=Difficulty] [role=radio][aria-checked=true]').innerText()).startsWith('Custom'));
  await q('[data-testid=begin]').click();
  await page.waitForSelector('.ui-loading');
  const c = (await calls()).find((x) => x.startsWith('newGame'));
  const req = JSON.parse(c.slice('newGame '.length));
  check('new game: Begin sends the resolved seed, options and the rule overrides', req.seed === parseInt(seedVal.replace('-', ''), 16) && req.difficulty === 'harsh' && req.customRules?.rivals === 3 && req.species === 'lasius-niger', JSON.stringify(req));
  check('loading: shows the stage, the summary and a field note', (await q('[data-testid=loading-stage]').innerText()).length > 0 && (await q('.ui-summary').innerText()).includes('Suburban Garden') && (await q('.ui-note').count()) === 1);
  await q('[data-testid=loading-cancel]').click();
  await page.waitForSelector('.ui-newgame');
  check('loading: Cancel returns to New Game with every field preserved', (await q('[data-testid=seed-field]').inputValue()) === seedVal && (await q('[role=radiogroup][aria-label=Difficulty] [role=radio][aria-checked=true]').innerText()).startsWith('Custom'));

  // ---------- pause + settings layering ----------
  await go('screen=pause&reducedMotion=1');
  a = await active();
  check('pause: focus starts on Resume', a?.text === 'Resume', JSON.stringify(a));
  await page.evaluate(`window.__escSeen = 0; window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escSeen++; });`);
  await press('Escape');
  check('pause: Esc passes through to the game (it resumes)', (await page.evaluate('window.__escSeen')) === 1);
  await q('[data-testid=pause-settings]').focus();
  await press('Enter');
  await page.waitForSelector('.ui-book');
  await page.evaluate('window.__escSeen = 0');
  await press('Escape');
  await page.waitForSelector('.ui-book', { state: 'detached' });
  check('settings over pause: Esc closes Settings and the game never sees it', (await page.evaluate('window.__escSeen')) === 0);
  a = await focusText('Settings');
  check('settings over pause: focus returns to Settings', a?.text === 'Settings', JSON.stringify(a));
  await q('[data-testid=pause-title]').click();
  await page.waitForSelector('.ui-modal');
  await page.waitForFunction(`!!document.activeElement.closest('.ui-modal')`);
  a = await active();
  check('pause: leaving with stale save asks first, focus on Cancel', a?.text === 'Cancel', JSON.stringify(a));
  const modalTabs = [];
  for (let i = 0; i < 8; i++) { await press('Tab'); modalTabs.push(await page.evaluate(`!!document.activeElement.closest('.ui-modal')`)); }
  check('modal: Tab never leaves the dialog (focus trap)', modalTabs.every(Boolean));
  await press('Shift+Tab', 3);
  check('modal: Shift+Tab stays inside too', await page.evaluate(`!!document.activeElement.closest('.ui-modal')`));
  await press('Escape');
  await page.waitForSelector('.ui-modal', { state: 'detached' });
  a = await focusText('Return to title');
  check('modal: Esc closes it and focus returns to the opener', a?.text === 'Return to title', JSON.stringify(a));

  // ---------- settings controls ----------
  await go('screen=settings&tab=graphics&reducedMotion=1');
  const slider = q('[role=slider][aria-label], [role=slider]').nth(0);
  await slider.focus();
  const v0 = Number(await slider.getAttribute('aria-valuenow'));
  await press('ArrowLeft');
  const v1 = Number(await slider.getAttribute('aria-valuenow'));
  await press('PageDown');
  const v2 = Number(await slider.getAttribute('aria-valuenow'));
  await press('Home');
  const v3 = Number(await slider.getAttribute('aria-valuenow'));
  await press('End');
  const v4 = Number(await slider.getAttribute('aria-valuenow'));
  check('slider: arrow = 1 step, PageDown = 10 steps, Home / End = ends', v1 === v0 - 5 && v2 === Math.max(50, v1 - 50) && v3 === 50 && v4 === 100, JSON.stringify([v0, v1, v2, v3, v4]));
  check('slider: changes reach the game immediately', (await calls()).some((x) => x.includes('resolutionScale')));
  const seg = q('[role=radiogroup] [role=radio]').first();
  await seg.focus();
  await press('ArrowRight');
  a = await active();
  check('segmented control: arrow moves and selects', a?.text === 'Low' && a?.checked === 'true', JSON.stringify(a));
  check('segmented control: the choice is sent to the game', (await calls()).some((x) => x.includes('"quality":"low"')));
  const toggle = q('[role=switch]').first();
  await toggle.focus();
  const t0 = await toggle.getAttribute('aria-checked');
  await press('Space');
  check('toggle: Space flips it', (await toggle.getAttribute('aria-checked')) !== t0);
  await press('e');
  check('tabs: E switches to the next tab, Q back', (await q('[role=tab][aria-selected=true]').innerText()) === 'Audio');
  await press('q');
  check('tabs: Q returns', (await q('[role=tab][aria-selected=true]').innerText()) === 'Graphics');
  await q('[role=tab]').nth(4).focus();
  await press('ArrowUp');
  check('tabs: arrow keys move and activate', (await q('[role=tab][aria-selected=true]').innerText()) === 'Accessibility');
  await go('screen=settings&tab=gameplay&reducedMotion=1');
  const sel = q('.ui-select-btn').first();
  await sel.focus();
  await press('Enter');
  await page.waitForSelector('.ui-select-list');
  await page.waitForFunction("document.activeElement?.getAttribute('role') === 'listbox'"); // focus lands a frame after the list mounts
  await press('n');
  check('select: type-ahead moves the highlight', (await q('.ui-select-opt.is-active').innerText()).startsWith('Never'));
  await press('Enter');
  check('select: Enter chooses and closes', (await sel.innerText()).includes('Never') && (await q('.ui-select-list').count()) === 0);
  await press('Enter');
  await page.waitForSelector('.ui-select-list');
  await page.waitForFunction("document.activeElement?.getAttribute('role') === 'listbox'");
  await press('Escape');
  check('select: Esc closes only the list, not the screen', (await q('.ui-select-list').count()) === 0 && (await q('.ui-book').count()) === 1);

  // ---------- rebinding ----------
  await go('screen=settings&tab=controls&reducedMotion=1');
  await q('[data-testid=group-P]').click();
  await q('[data-testid="bind-dig-0"]').click();
  check('rebinding: clicking a binding starts listening', (await q('.ui-keybind-slot.is-listening').count()) === 1 && (await q('.ui-keybind-note').first().innerText()).includes('Press a key'));
  await press('Escape');
  check('rebinding: Esc cancels listening and keeps the screen', (await q('.ui-keybind-slot.is-listening').count()) === 0 && (await q('.ui-book').count()) === 1);
  await q('[data-testid="bind-dig-0"]').click();
  await press('d');
  const note = await q('.ui-keybind-note').first().innerText();
  check('rebinding: a conflict names the other action and offers Swap / Unbind other / Cancel', note.includes('D is already Move right') && (await q('[data-testid=conflict-swap]').count()) === 1, note);
  const before = await page.evaluate('window.__uiDemo.facade.bindings.kbm.dig[0].code');
  check('rebinding: nothing changes until the player chooses', before === 'KeyF');
  await q('[data-testid=conflict-swap]').click();
  const after = await page.evaluate('[window.__uiDemo.facade.bindings.kbm.dig[0].code, window.__uiDemo.facade.bindings.kbm["move.right"][0].code]');
  check('rebinding: Swap gives Dig = D and Move right = F', after[0] === 'KeyD' && after[1] === 'KeyF', JSON.stringify(after));
  await q('[data-testid="bind-interact-0"]').focus();
  await press('Delete');
  await q('[data-testid=settings-back]').click();
  await page.waitForSelector('.ui-modal');
  check('rebinding: Settings refuses to close while a required key is unbound', (await q('.ui-modal').innerText()).includes('Interact') && (await q('.ui-book').count()) === 1);
  await press('Escape');
  await page.waitForSelector('.ui-modal', { state: 'detached' });
  await q('[data-testid="bind-interact-0"]').click();
  await press('e');
  await q('[data-testid=settings-back]').click();
  await page.waitForSelector('.ui-book', { state: 'detached' });
  check('rebinding: closes once every required action has a key again', true);
  await go('screen=settings&tab=controls&reducedMotion=1');
  await q('[data-testid=reset-all]').click();
  await page.waitForSelector('.ui-modal');
  await page.waitForFunction(`!!document.activeElement.closest('.ui-modal')`);
  await press('Tab');
  check('reset all: confirm dialog traps focus', await page.evaluate(`!!document.activeElement.closest('.ui-modal')`));

  // ---------- save / load ----------
  await go('screen=save-load&tab=save&nodownload=1&reducedMotion=1');
  await q('[data-testid=save-slot-2]').click();
  await page.waitForFunction(`document.querySelector('[data-testid=saves-message]').textContent.includes('Saved')`);
  check('save: an empty slot saves without asking', (await q('[data-testid=saves-message]').innerText()).includes('Slot 2'));
  await q('[data-testid=save-slot-1]').click();
  await page.waitForSelector('.ui-modal');
  check('save: an occupied slot asks before overwriting', (await q('.ui-modal').innerText()).includes('Overwrite'));
  await press('Escape');
  a = await focusText('Save here');
  check('save: Esc cancels and focus returns to the button', a?.text === 'Save here', JSON.stringify(a));
  await q('[role=tab]').filter({ hasText: 'Load' }).click();
  await q('[data-testid=load-quick]').click();
  await page.waitForSelector('.ui-modal');
  check('load: unsaved progress older than 60 s asks first', (await q('.ui-modal').innerText()).includes('Progress since your last save will be lost'));
  await press('Escape');
  await page.waitForSelector('.ui-modal', { state: 'detached' });
  await q('[role=tab]').filter({ hasText: 'Import / Export' }).click();
  await q('[data-testid=export-file]').click();
  await page.waitForSelector('.ui-modal');
  const exportText = await q('[data-testid=export-text]').inputValue();
  check('export: with ?nodownload=1 the text-export modal opens with FOUNDRESS1: text and a size', exportText.startsWith('FOUNDRESS1:') && (await q('.ui-modal').innerText()).includes('KB'));
  await q('[data-testid=export-copy]').click();
  await page.waitForTimeout(100);
  check('export: Copy reports success or the Ctrl+C fallback', /Copied|Ctrl\+C/.test(await q('.ui-modal').innerText()));
  await press('Escape');
  await page.waitForSelector('.ui-modal', { state: 'detached' });
  await q('[data-testid=import-text]').fill('not a save');
  await q('[data-testid=import-go]').click();
  check('import: bad text is explained inline and nothing is sent', (await q('.ui-text-error').innerText()).includes('FOUNDRESS1:') && !(await calls()).some((x) => x.startsWith('import')));
  await q('[data-testid=import-text]').fill(exportText);
  await q('[data-testid=import-go]').click();
  check('import: nothing is stored until a target is chosen', (await q('.ui-text-error').innerText()).includes('where to store') && !(await calls()).some((x) => x.startsWith('import')));
  await q('[aria-label="Store the imported colony in"]').click();
  await q('.ui-select-opt').filter({ hasText: 'Slot 4' }).click();
  await q('[data-testid=import-go]').click();
  await page.waitForTimeout(150);
  check('import: pasted text goes to the game', (await calls()).some((x) => x.startsWith('import text:')));

  // ---------- credits ----------
  await go('screen=credits&reducedMotion=1');
  const credits = await q('.ui-credits').innerText();
  check('credits: generated from CREDITS.md plus fonts and libraries', credits.includes('Poly Haven') && credits.includes('ambientCG') && credits.includes('Source Serif 4') && (await q('.ui-credits-row').count()) > 40);

  // ---------- scale, motion, contrast, font ----------
  await page.setViewportSize({ width: 1280, height: 720 });
  await go('screen=title&scale=150');
  let env = await page.evaluate(`({ px: getComputedStyle(document.documentElement).fontSize, layout: document.documentElement.dataset.layout })`);
  check('UI scale 150 %: root font 24 px and compact layout', env.px === '24px' && env.layout === 'compact', JSON.stringify(env));
  await go('screen=title&scale=80');
  env = await page.evaluate(`({ px: getComputedStyle(document.documentElement).fontSize, layout: document.documentElement.dataset.layout })`);
  check('UI scale 80 %: root font 12.8 px, standard layout', env.px === '12.8px' && env.layout === 'standard', JSON.stringify(env));
  await go('screen=title&text=130');
  check('text size 130 %', (await page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--text-scale')`)).trim() === '1.3');
  await go('screen=new-game&reducedMotion=1');
  await page.waitForTimeout(250);
  env = await page.evaluate(`({ motion: document.documentElement.dataset.motion, anim: getComputedStyle(document.querySelector('.ui-book')).animationName, trans: getComputedStyle(document.querySelector('.ui-btn')).transitionDuration })`);
  check('reduced motion: fades only (animation ui-fade, 120 ms transitions)', env.motion === 'reduced' && env.anim.includes('ui-fade') && env.trans.startsWith('0.12s'), JSON.stringify(env));
  await go('screen=title');
  env = await page.evaluate(`document.documentElement.dataset.motion`);
  check('motion is normal without the flag', env === 'normal');
  await go('screen=settings&tab=accessibility&contrast=high&font=hyperlegible&reducedMotion=1');
  env = await page.evaluate(`({ c: document.documentElement.dataset.contrast, panel: getComputedStyle(document.documentElement).getPropertyValue('--c-panel').trim(), font: document.documentElement.dataset.font, sans: getComputedStyle(document.documentElement).getPropertyValue('--font-sans') })`);
  check('high contrast and the hyperlegible font apply', env.c === 'high' && env.panel === '#000000' && env.font === 'hyperlegible' && env.sans.includes('Atkinson'), JSON.stringify(env));
  const picked = await page.evaluate(`(async () => { document.querySelector('[role=radio]'); return true; })()`);
  await go('screen=title&reducedMotion=1');
  const fonts = await page.evaluate(`(async () => { await document.fonts.ready; return { inter: document.fonts.check('16px "Inter Variable"'), serif: document.fonts.check('44px "Source Serif 4 Variable"'), loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family) }; })()`);
  check('fonts: Inter and Source Serif 4 are bundled and loaded', fonts.inter && fonts.serif && fonts.loaded.some((f) => f.includes('Inter')) && fonts.loaded.some((f) => f.includes('Source Serif')), JSON.stringify(fonts));
  check('no remote requests at all (fonts and icons are bundled)', remote.length === 0, remote.join(', '));

  log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  if (failures.length) throw new Error(`behaviour checks failed:\n${failures.join('\n')}`);
  return { checks: results.length, remote: remote.length };
};
