// Behaviour checks of the panels demo (task ui-panels acceptance 4): every control of Colony health, Nest overview, the
// Journal, the Codex, the marker palette and the overlay controls reachable from the keyboard with a visible focus ring, Q / E
// and Esc in the books, the graph cursor on the arrow keys, remedies that open and highlight but change nothing, designation
// and entrance calls recorded on the bridge, the codex search never reaching into locked text, gamepad movement in a
// drawer, legends with distinct patterns in every palette, no remote requests.
//   node tools/harness/play.mjs --root spikes/panels-demo --script spikes/panels-demo/scripts/behaviour.mjs --query "scene=health"
export default async ({ page, log, wait, context, url }) => {
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`panels-behaviour: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const out = {};
  const remote = [];
  context.on('request', (r) => { const u = r.url(); if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(u)) remote.push(u); });
  const base = new URL(url);
  const goto = async (query) => {
    const u = new URL(base); u.search = query;
    await page.goto(u.toString());
    await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
    await wait.frames(4);
  };
  const active = () => g(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const revisit = el.dataset.pnSeen === '1';
    el.dataset.pnSeen = '1';
    return { revisit, tag: el.tagName, label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '', ring: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' || !!el.closest('.ui-slider-track') };
  });
  const tabAll = async (scopeSel, limit = 80) => {
    await g(() => document.querySelectorAll('[data-pn-seen]').forEach((e) => e.removeAttribute('data-pn-seen')));
    const seen = [];
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press('Tab');
      const a = await active();
      if (!a) continue;
      if (a.revisit) break;
      const inside = await g((s) => !!document.activeElement.closest(s), scopeSel);
      if (inside) seen.push(a);
    }
    return seen;
  };
  const focusables = (scopeSel) => g((s) => [...document.querySelector(s).querySelectorAll('button, [role="slider"], input, a[href], [tabindex]')]
    .filter((e) => !e.disabled && e.getAttribute('tabindex') !== '-1' && e.getClientRects().length > 0).length, scopeSel);

  // --- Colony health ------------------------------------------------------------------------------------------------------
  await goto('scene=health');
  expect(await g(() => document.activeElement?.className.includes('pn-diag-head')), 'initial focus is the first diagnostic row');
  let seen = await tabAll('.fd-drawer');
  const total = await focusables('.fd-drawer');
  expect(seen.length >= total - 1, 'Tab reaches every control of Colony health', { seen: seen.length, total });
  expect(seen.every((s) => s.ring), 'every control shows a focus ring', seen.filter((s) => !s.ring));
  out.healthTab = { visited: seen.length, controls: total };
  // Enter on a row opens its cause chain; the chain nests diagnostics and has bars with percentages
  await g(() => { document.querySelector('[data-diag="diag-stores"]')?.querySelector('button')?.focus(); });
  await page.keyboard.press('Enter');
  await wait.frames(3);
  expect(await g(() => window.__panels.expanded()) === 'diag-stores', 'Enter expands a row');
  await page.keyboard.press('Enter');
  await wait.frames(3);
  expect(await g(() => window.__panels.expanded()) === null, 'Enter again collapses it');
  await g(() => window.__panels.expand('diag-brood-growth'));
  await wait.frames(3);
  const chain = await g(() => ({
    factors: document.querySelectorAll('[data-diag="diag-brood-growth"] > .pn-diag-body > .pn-factors > .pn-factor').length,
    nested: document.querySelectorAll('[data-diag="diag-brood-growth"] [data-testid="health-chain"]').length,
    deep: document.querySelectorAll('[data-diag="diag-brood-growth"] [data-testid="health-chain"] [data-testid="health-chain"]').length,
    other: document.querySelector('[data-diag="diag-brood-growth"] .pn-factor.is-other')?.textContent ?? null,
  }));
  expect(chain.factors === 6 && chain.nested >= 1 && chain.deep >= 1, 'five factors and the Other line, a nested chain two levels deep', chain);
  expect(/Other \(1 %\)/.test(chain.other ?? ''), 'the sixth factor folds into Other (1 %)', chain);
  out.chain = chain;
  // a remedy opens the control, highlights it, changes nothing
  await g(() => window.__panelsDemo.facade.calls.length = 0);
  await page.locator('[data-diag="diag-brood-growth"] [data-remedy="remedy.slider.nurse"]').click();
  await wait.frames(4);
  expect(await g(() => window.__panels.screen().drawer) === 'directives', 'the remedy opened Directives');
  await wait(200);
  expect(await g(() => document.querySelector('[data-group="nurse"]')?.classList.contains('pn-highlight')), 'the Nurse share is highlighted');
  expect(await g(() => window.__panelsDemo.facade.calls.filter((c) => /setDirectives|command/.test(c)).length) === 0, 'a remedy applied nothing');
  await wait(4300);
  expect(await g(() => !document.querySelector('.pn-highlight')), 'the highlight ends after 4 real seconds');
  // gamepad: the D-pad moves focus inside the open drawer
  await goto('scene=health');
  await g(() => { window.__fakePad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0], connected: true, id: 'test pad', index: 0, mapping: 'standard' }; navigator.getGamepads = () => [window.__fakePad]; });
  const press = async (i) => { await g((k) => { window.__fakePad.buttons[k].pressed = true; }, i); await wait(120); await g((k) => { window.__fakePad.buttons[k].pressed = false; }, i); await wait(120); };
  const first = await active();
  await press(13);
  const second = await active();
  expect(second && first && second.label !== first.label, 'D-pad down moved focus to the next row', { first, second });
  out.padFocus = second.label;
  await g(() => { delete window.__fakePad; });

  // --- Nest overview -------------------------------------------------------------------------------------------------------
  await goto('scene=nest&select=3');
  seen = await tabAll('.fd-drawer');
  const nestTotal = await focusables('.fd-drawer');
  expect(seen.length >= nestTotal - 1, 'Tab reaches every control of Nest overview', { seen: seen.length, total: nestTotal });
  out.nestTab = { visited: seen.length, controls: nestTotal };
  await g(() => window.__panelsDemo.bridge.calls.length = 0);
  await page.locator('.pn-chamber-row[data-chamber="4"] .pn-row-btn').click();
  await wait.frames(2);
  expect(await g(() => window.__panelsDemo.bridge.calls.includes('jumpToChamber 4')), 'choosing a chamber asks the game for the colony view at it');
  await page.locator('[data-testid="nest-detail"] .ui-select-btn').click();
  await wait.frames(2);
  const opts = await g(() => [...document.querySelectorAll('.ui-select-list [role="option"]')].map((o) => o.textContent.trim()));
  expect(!opts.includes('Granary') && opts.includes('Nursery'), 'only the species\' valid uses are offered', opts);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await wait.frames(3);
  const calls = await g(() => window.__panelsDemo.bridge.calls.filter((c) => c.startsWith('designate')));
  expect(calls.length === 1, 'one designateChamber call', calls);
  out.designate = calls[0];
  await page.locator('[data-testid="nest-entrance-toggle"]').first().click();
  await wait.frames(2);
  expect(await g(() => window.__panelsDemo.bridge.calls.some((c) => /^toggleEntrance 1 sealed/.test(c))), 'the entrance can be sealed');
  // risk words and shapes, comfort mark
  const risks = await g(() => [...document.querySelectorAll('.pn-risk')].map((r) => r.textContent));
  expect(risks.includes('Flooded') && risks.includes('Flood risk') && risks.includes('Dry') && risks.includes('Crowded'), 'risk words', risks);
  out.risks = risks;

  // --- Journal -------------------------------------------------------------------------------------------------------------
  await goto('scene=journal&tab=aims');
  await page.keyboard.press('KeyE');
  await wait.frames(3);
  expect(await g(() => window.__panels.journalTab()) === 'milestones', 'E switches to the next tab');
  await page.keyboard.press('KeyE');
  await wait.frames(3);
  expect(await g(() => window.__panels.journalTab()) === 'graphs', 'E again: Graphs');
  await page.keyboard.press('KeyQ');
  await wait.frames(2);
  await page.keyboard.press('KeyE');
  await wait.frames(2);
  seen = await tabAll('.ui-book');
  const bookTotal = await focusables('.ui-book');
  expect(seen.length >= bookTotal - 2, 'Tab reaches every control of the Graphs tab', { seen: seen.length, total: bookTotal });
  // the cursor follows the arrow keys on the chart
  await g(() => document.querySelector('[data-testid="chart-focus"]').focus());
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const cur = await g(() => document.querySelector('[data-testid="chart-cursor"]').textContent);
  expect(/^Day \d+, \d\d:00$/.test(cur), 'arrow keys move the cursor and name the day', cur);
  const legendNow = await g(() => [...document.querySelectorAll('.pn-legend-now')].map((e) => e.textContent));
  out.cursor = { cur, legendNow };
  // every chart and range draws (labelled axes, no NaN)
  for (const chart of ['population', 'brood', 'stores', 'intake', 'deaths', 'nest-volume', 'nest-temp']) {
    for (const range of ['3d', 'year', 'all']) {
      await goto(`scene=journal&tab=graphs`);
      await page.locator('.pn-graph-controls .ui-select-btn').click();
      await wait.frames(2);
      const label = await g((c) => ({ population: 'Population by caste', brood: 'Brood by stage', stores: 'Stores', intake: 'Intake per game day', deaths: 'Deaths by cause', 'nest-volume': 'Nest volume', 'nest-temp': 'Nest and surface temperature' }[c]), chart);
      await page.locator(`.ui-select-list [role="option"]:has-text("${label}")`).first().click();
      await wait.frames(2);
      const rangeLabel = { '3d': '3 days', year: 'Year', all: 'All' }[range];
      await page.locator(`[role="radio"]:has-text("${rangeLabel}"), button:has-text("${rangeLabel}")`).first().click();
      await wait.frames(2);
      const svg = await g(() => { const s = document.querySelector('.pn-chart-svg'); return s ? { html: s.innerHTML.includes('NaN'), ticks: s.querySelectorAll('.pn-grid').length, axisText: s.querySelectorAll('.pn-axis-text').length, title: s.querySelector('.pn-axis-title')?.textContent } : { empty: !!document.querySelector('[data-testid="chart-empty"]') }; });
      expect(svg.html !== true, `${chart}/${range}: no NaN in the drawing`, svg);
      expect(svg.empty || (svg.ticks >= 3 && svg.axisText >= 4 && svg.title), `${chart}/${range}: labelled axes`, svg);
    }
  }
  out.charts = 'all 21 combinations drew with labelled axes';
  await page.keyboard.press('Escape');
  await wait.frames(3);
  expect(await g(() => window.__panels.screen().book) === null, 'Esc closes the Journal');
  await goto('scene=journal&tab=graphs&young=1');
  expect(await g(() => !!document.querySelector('[data-testid="chart"]') || !!document.querySelector('[data-testid="chart-empty"]')), 'a young game draws or says so');
  await goto('scene=journal&tab=milestones&young=1');
  expect(await g(() => document.querySelectorAll('[data-testid="milestone-pin"]').length) === 2, 'a young game has two pins');

  // --- Codex ---------------------------------------------------------------------------------------------------------------
  await goto('scene=codex&seen=none&entry=cx-honeydew');
  expect(await g(() => document.querySelector('[data-testid="codex-entry"]').dataset.locked) === '1', 'a locked entry');
  expect(await g(() => !document.querySelector('[data-testid="codex-note"]')), 'a locked entry shows no field note');
  await g(() => document.querySelector('.pn-codex-search input').focus());
  await page.keyboard.type('trophallaxis');
  await wait.frames(3);
  expect(await g(() => document.querySelectorAll('[data-testid="codex-list"] [data-entry]').length) === 0, 'search does not reach into locked text');
  await page.locator('[data-testid="codex-search"]').fill('mouth');
  await wait.frames(3);
  expect(await g(() => document.querySelectorAll('[data-testid="codex-list"] [data-entry]').length) >= 1, 'search matches the title');
  await goto('scene=codex&entry=cx-interface-why');
  expect((await g(() => document.querySelector('[data-testid="codex-entry"]').dataset.locked)) === '0', 'the manual is always open');
  expect(await g(() => document.querySelectorAll('.pn-controls li').length) >= 1, 'an Interface entry lists its controls');
  const keys = await g(() => [...document.querySelectorAll('.pn-controls kbd')].map((k) => k.textContent));
  out.controls = keys;
  await g(() => { document.querySelector('button[data-entry="cx-interface-why"]').focus(); });
  await page.keyboard.press('ArrowDown');
  await wait.frames(2);
  expect(await g(() => window.__panels.codexSelection()) !== 'cx-interface-why', 'arrows move the selection in the list');
  seen = await tabAll('.ui-book');
  expect(seen.length >= 5, 'Tab walks through the codex', seen.length);
  await goto('scene=codex&entry=cx-jumping-spider&comfort=ring&seen=none');
  expect(await g(() => document.querySelector('.pn-plate-ring-label')?.textContent) === 'Spider', 'spider comfort draws the plain ring in place of a silhouette');

  // --- marker palette and overlay controls -----------------------------------------------------------------------------------
  await goto('scene=markers&tool=forage');
  seen = await tabAll('.pn-palette, .pn-tool-options, .ov-controls');
  const palTotal = await g(() => [...document.querySelectorAll('.pn-palette button, .pn-tool-options [role="slider"], .pn-tool-options button, .ov-controls button')].length);
  expect(seen.length >= palTotal - 1, 'Tab reaches every palette, option and overlay control in the colony view', { seen: seen.length, total: palTotal });
  expect(seen.every((s) => s.ring), 'with a focus ring', seen.filter((s) => !s.ring));
  out.paletteTab = { visited: seen.length, controls: palTotal };
  await g(() => { window.__panelsDemo.bridge.calls.length = 0; document.activeElement?.blur(); });
  await page.locator('[data-testid="marker-palette"] [data-tool="rally"]').click();
  await page.locator('[data-testid="marker-palette"] [data-tool="rally"]').click();
  const bc = await g(() => window.__panelsDemo.bridge.calls);
  expect(bc.join('|') === 'selectTool rally|selectTool null', 'clicking a tool selects it, clicking again returns to the pointer', bc);
  expect(await g(() => document.activeElement === document.body || !document.activeElement?.closest('.pn-palette')), 'a mouse click leaves the focus where it was');
  const full = await g(() => document.querySelector('[data-tool="forage"]').getAttribute('aria-label'));
  expect(/4 of 4 placed, limit reached/.test(full), 'a full tool says so in words', full);
  for (const palette of ['okabe-ito', 'high-contrast', 'pattern-only']) {
    await goto(`scene=overlays&overlay=scent&palette=${palette}&view=colony`);
    const pats = await g(() => [...document.querySelectorAll('[data-testid="legend"] li[data-pattern]')].map((e) => e.dataset.pattern));
    expect(new Set(pats).size === pats.length && ['chevron', 'stipple', 'zigzag', 'rings'].every((p) => pats.includes(p)), `${palette}: four distinct patterns`, pats);
    const inks = await g(() => [...document.querySelectorAll('[data-testid="legend"] .ov-swatch')].map((e) => e.style.color));
    if (palette === 'pattern-only') expect(new Set(inks).size === 1, 'pattern-only: one ink', inks);
    out[`palette-${palette}`] = { patterns: pats, inks: new Set(inks).size };
  }

  expect(remote.length === 0, 'no remote requests', remote);
  return out;
};
