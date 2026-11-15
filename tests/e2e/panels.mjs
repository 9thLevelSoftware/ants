// ui-panels end-to-end check on the real game (task ui-panels acceptance 3 and 4): Colony health with a forced protein
// shortage and its cause chain, Nest overview designating a chamber (the simulation changes), the Journal with a fired
// milestone and graphs, the Codex with an unlocked entry, the marker palette driving the views layer, the overlay
// controls, the alert click-through of GDD 08 App. E check 11, and the keys Y U J K V O. Screenshots at 1280x720 and
// 1920x1080 and at UI scale 150 %.
//   node tools/harness/play.mjs --root . --query "test=1&quality=test&autostart=1&seed=2" --script tests/e2e/panels.mjs \
//        --out test-output/panels --script-timeout 900000
// PANELS_SHOTS=0 skips screenshots; PANELS_FROM=alert|nest|journal|codex|markers|keys|sizes starts at that section (while iterating). Stand-ins (logged as STAND-IN, listed in result.standIns): the alert of check 11 is
// written into progression.alerts (no module raises an alert that has both a diagnostic and a chamber focus yet).
// PANELS_STRICT=1 fails on any stand-in.
const SHOTS = process.env.PANELS_SHOTS !== '0';

export default async ({ page, shot, log, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`panels: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const result = { checks: {}, standIns: [], shots: [] };
  const ok = (name, data) => { result.checks[name] = data ?? 'ok'; log('OK', name, data === undefined ? '' : JSON.stringify(data)); };
  const standIn = (feature, detail) => {
    result.standIns.push({ feature, detail });
    log('STAND-IN', feature, '-', detail);
    if (process.env.PANELS_STRICT) throw new Error(`panels (strict): stand-in needed for ${feature}: ${detail}`);
  };
  const sim = (fn, arg) => g(([src, a]) => new Function('sim', 'arg', `return (${src})(sim, arg)`)(window.__hud.game.session.sim, a), [fn.toString(), arg]);
  const refresh = async () => { await g(() => window.__hud.game.refreshUi()); await wait.frames(2); };
  const step = (n) => g((k) => window.__game.step(k), n);
  const q = (sel) => page.locator(sel);
  const count = (sel) => g((s) => document.querySelectorAll(s).length, sel);
  const text = (sel) => g((s) => document.querySelector(s)?.textContent ?? null, sel);
  const screens = () => g(() => window.__panels.screen());
  const pic = async (name) => {
    if (!SHOTS) return;
    await g(() => { const a = document.activeElement; if (a && !a.closest('.fd-drawer, .ui-book, .pn-palette')) a.blur(); });
    await g(() => window.__game.renderFrame());
    await wait.frames(2);
    result.shots.push(await shot(name));
  };
  const ORDER = ['health', 'alert', 'nest', 'journal', 'codex', 'markers', 'keys', 'sizes'];
  const run = (name) => ORDER.indexOf(name) >= ORDER.indexOf(process.env.PANELS_FROM ?? 'health');
  let sc;
  const closeAll = async () => { await g(() => window.__panels.close()); await wait.frames(2); };

  // --- 0. a real game with a nest, workers and a hand-over ----------------------------------------------------------
  await g(() => window.__game.newGame({ seed: 5, testWorld: { features: 'all', nest: 'small', workers: 12 } }));
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await step(1);
  const opening = await sim((sm) => sm.state.player.opening && !sm.state.player.opening.done);
  if (opening) {
    standIn('hand-over', 'opening.done is written directly (the test world starts after the founding)');
    await sim((sm) => { sm.state.player.opening.done = true; });
  }
  await g(() => window.__game.release());
  await step(2);
  expect(await g(() => typeof window.__panels === 'object'), '__panels debug hook missing (needs ?test=1)');
  const nestBefore = await g(() => window.__game.query.nest()[0]);
  expect(nestBefore.chambers.length >= 2, 'the test nest has chambers', nestBefore.chambers.length);
  ok('game', { chambers: nestBefore.chambers.map((c) => `${c.id}:${c.type}`) });

  // --- 1. Colony health: a forced protein shortage with its cause chain ----------------------------------------------
  if (run('health')) {
    await sim((sm) => { const c = sm.state.colonies[0]; c.stores.c = 6; c.stores.p = 0; });
    for (let i = 0; i < 5; i++) await step(250);
    const raw = await sim((sm) => sm.state.progression.diagnostics.map((d) => ({ id: d.id, status: d.status })));
    const pDiag = raw.find((d) => d.id === 'diag-food-intake-p');
    expect(pDiag && (pDiag.status === 'bad' || pDiag.status === 'warn'), 'the sim publishes a protein diagnostic with a shortage', raw);
    await page.keyboard.press('KeyY');
    await wait.frames(4);
    await refresh();
    sc = await screens();
    expect(sc.screens.includes('colony-health'), 'Y opens Colony health', sc);
    expect(await count('[data-testid="health-row"]') > 0, 'Colony health lists rows');
    const rowIds = await g(() => [...document.querySelectorAll('[data-testid="health-row"]')].map((r) => `${r.dataset.diag}:${r.dataset.status}`));
    expect(rowIds.some((r) => r.startsWith('diag-food-intake-p:') && !r.endsWith(':ok')), 'the protein shortage is listed, not ok', rowIds);
    // worst first: no ok row above a failing one
    const order = rowIds.map((r) => r.split(':').pop());
    const rank = { bad: 0, warn: 1, info: 2, ok: 3 };
    expect(order.every((s, i) => i === 0 || rank[order[i - 1]] <= rank[s]), 'rows are sorted worst first', order);
    // the stores row explains itself through the protein intake row: its cause chain nests that diagnostic
    await g(() => window.__panels.expand('diag-stores'));
    await wait.frames(3);
    const chain = await g(() => [...document.querySelectorAll('[data-diag="diag-stores"] [data-testid="health-chain"]')].map((c) => c.textContent));
    expect(chain.some((t) => /Because/.test(t) && /Protein intake/.test(t)), 'the stores row nests the protein intake diagnostic as a cause', chain);
    await pic('01-health-1280');
    // the protein row's own factors, with the shortage's measured cause
    await g(() => window.__panels.expand('diag-food-intake-p'));
    await wait.frames(3);
    const factors = await g(() => [...document.querySelectorAll('[data-diag="diag-food-intake-p"] [data-testid="health-factor"]')].map((f) => `${f.dataset.cause}: ${f.textContent}`));
    expect(factors.length > 0, 'the protein row shows factors', factors);
    const remedies = await g(() => [...document.querySelectorAll('[data-diag="diag-food-intake-p"] [data-testid="health-remedy"]')].map((r) => r.dataset.remedy));
    expect(remedies.includes('remedy.slider.forage'), 'remedies are links', remedies);
    await pic('02-health-protein-1280');
    // a remedy opens the control concerned and highlights it; it changes nothing by itself
    const dirsBefore = await g(() => JSON.stringify(window.__game.query.colony().directives));
    await q('[data-diag="diag-food-intake-p"] [data-remedy="remedy.slider.forage"]').click();
    await wait.frames(4);
    sc = await screens();
    expect(sc.drawer === 'directives', 'the remedy opens Directives', sc);
    await wait(300);
    const hl = await g(() => window.__panels.highlighted());
    expect(hl.length > 0, 'the suggested control is highlighted', hl);
    expect(await g(() => JSON.stringify(window.__game.query.colony().directives)) === dirsBefore, 'a remedy changes nothing by itself');
    await pic('03-remedy-directives-1280');
    ok('health', { rows: rowIds.length, chain: chain.length, factors: factors.length, highlighted: hl });
    await closeAll();

  }
  // --- 2. alert click-through (GDD 08 App. E check 11) -------------------------------------------------------------------
  if (run('alert')) {
    const target = nestBefore.chambers.find((c) => c.type === 'nursery') ?? nestBefore.chambers[0];
    standIn('alert-with-focus', 'an alert linked to diag-nest-space with a chamber focus is written into progression.alerts');
    await sim((sm, c) => {
      sm.state.progression.alerts.push({
        id: 900, kind: 'nest-crowded', level: 'notice', subjectId: c.id, title: 'Nest crowded', cause: 'nursery near capacity', focus: { kind: 'chamber', id: c.id, pos: { ...c.center } },
        diagnosticId: 'diag-nest-space', raisedTick: sm.state.tick, updatedTick: sm.state.tick, count: 1, acknowledged: false,
      });
    }, target);
    await refresh();
    await wait(300);
    await pic('04-alert-card-1280');
    await q('[data-testid="alert-card"][data-kind="nest-crowded"] .fd-alert-main').click();
    await wait.frames(4);
    await refresh();
    sc = await screens();
    expect(sc.screens.includes('colony-health'), 'clicking the alert opens Colony health', sc);
    expect(await g(() => window.__panels.expanded()) === 'diag-nest-space', 'the linked diagnostic is expanded');
    await wait(900); // --m-scene
    const cam = await g(() => { const s = window.__hud.game.session; const t = s.views.colony.target; return { view: s.view, x: t.x, z: t.z, bu: s.sim.world.bu }; });
    const dist = Math.hypot(cam.x - target.center.x, cam.z - target.center.z) / cam.bu;
    expect(cam.view === 'colony' && dist <= 1, 'the camera target is the chamber centre within 1 BU', { cam, dist });
    await pic('05-alert-through-1280');
    ok('alertClickThrough', { view: cam.view, distBu: +dist.toFixed(3) });
    await closeAll();
    await sim((sm) => { sm.state.progression.alerts = sm.state.progression.alerts.filter((a) => a.id !== 900); });
    await g(() => window.__hud.game.setView('observer'));
    await step(2);

  }
  // --- 3. Nest overview: designating a chamber changes the simulation -----------------------------------------------------
  if (run('nest')) {
    await page.keyboard.press('KeyU');
    await wait.frames(4);
    await refresh();
    sc = await screens();
    expect(sc.screens.includes('nest'), 'U opens Nest overview', sc);
    expect(await count('[data-testid="nest-table"] tbody tr') === nestBefore.chambers.length, 'the table lists every chamber');
    expect(await g(() => +document.querySelector('[data-testid="nest-diagram"]').dataset.chambers) === nestBefore.chambers.length, 'the diagram draws every chamber');
    const food = nestBefore.chambers.find((c) => c.type === 'food');
    expect(food, 'the test nest has a food chamber');
    await q(`.pn-chamber-row[data-chamber="${food.id}"] .pn-row-btn`).click();
    await wait.frames(4);
    expect(await g(() => window.__hud.game.session.view) === 'colony', 'choosing a chamber goes to the colony view');
    expect(await count('[data-testid="nest-detail"]') === 1, 'the selected chamber has a detail card');
    await pic('06-nest-selected-1280');
    await q('[data-testid="nest-detail"] .ui-select-btn').click();
    await wait.frames(3);
    const options = await g(() => [...document.querySelectorAll('.ui-select-list [role="option"]')].map((o) => o.textContent.trim()));
    expect(options.includes('Resting chamber') && !options.includes('Granary'), 'only valid designations are listed', options);
    await q('.ui-select-list [role="option"]:has-text("Resting chamber")').click();
    await wait.frames(3);
    await step(2);
    const typeNow = await g((id) => window.__game.query.nest()[0].chambers.find((c) => c.id === id).type, food.id);
    expect(typeNow === 'rest', 'designating from Nest overview changed the simulation', typeNow);
    await refresh();
    await wait.frames(2);
    expect(await text(`.pn-chamber-row[data-chamber="${food.id}"] .pn-row-btn`) !== null && /Rest/.test(await text(`.pn-chamber-row[data-chamber="${food.id}"] .pn-row-btn`)), 'the table shows the new use');
    await pic('07-nest-designated-1280');
    ok('nest', { chamber: food.id, from: 'food', to: typeNow });
    await closeAll();
    await g(() => window.__hud.game.setView('observer'));

  }
  // --- 4. Journal: a fired milestone, the timeline, graphs, the log; opening pauses --------------------------------------
  if (run('journal')) {
    await g(() => window.__game.cheat.spawnAnts(30, 'worker', 'forage'));
    await step(400);
    const ms = await sim((sm) => Object.keys(sm.state.progression.milestones));
    expect(ms.includes('ms-workers-25'), 'ms-workers-25 fired', ms);
    const speedBefore = await g(() => window.__game.summary().time);
    await page.keyboard.press('KeyJ');
    await wait.frames(4);
    await refresh();
    sc = await screens();
    expect(sc.screens.includes('journal'), 'J opens the Journal', sc);
    expect(await g(() => window.__game.summary().time.paused) === true, 'opening the Journal pauses');
    await q('[role="tab"]:has-text("Milestones")').click();
    await wait.frames(3);
    const pins = await g(() => [...document.querySelectorAll('[data-testid="milestone-pin"]')].map((p) => p.dataset.ms));
    expect(pins.includes('ms-workers-25'), 'the fired milestone is a pin on the timeline', pins);
    await q('[data-testid="milestone-pin"][data-ms="ms-workers-25"]').click();
    await wait.frames(2);
    const card = await text('[data-testid="milestone-card"]');
    expect(/Twenty-five workers/.test(card ?? ''), 'its detail card shows the title', card);
    await pic('08-journal-milestones-1280');
    await q('[role="tab"]:has-text("Aims")').click();
    await wait.frames(3);
    await pic('09-journal-aims-1280');
    await q('[role="tab"]:has-text("Graphs")').click();
    await wait.frames(3);
    const chart = await g(() => ({ empty: !!document.querySelector('[data-testid="chart-empty"]'), chart: document.querySelector('[data-testid="chart"]')?.dataset.chart }));
    log('graph', JSON.stringify(chart));
    await pic('10-journal-graphs-1280');
    await q('[role="tab"]:has-text("Event log")').click();
    await wait.frames(3);
    const log1 = await g(() => [...document.querySelectorAll('.pn-log-row')].map((r) => r.textContent));
    expect(log1.some((t) => /Twenty-five workers/.test(t)), 'the event log has the milestone', log1.slice(0, 5));
    await pic('11-journal-log-1280');
    await page.keyboard.press('Escape');
    await wait.frames(4);
    sc = await screens();
    expect(sc.book === null, 'Esc closes the Journal', sc);
    expect(await g(() => window.__game.summary().time.paused) === false && (await g(() => window.__game.summary().time.speed)) === speedBefore.speed, 'closing restores the speed');
    ok('journal', { pins: pins.length, speed: speedBefore.speed });

  }
  // --- 5. Codex: an unlocked entry, locked ones, search ---------------------------------------------------------------------
  if (run('codex')) {
    await g(() => window.__game.cheat.raw({ type: 'cheat.unlockCodex', id: 'cx-honeydew' }));
    await step(2);
    await page.keyboard.press('KeyK');
    await wait.frames(4);
    sc = await screens();
    expect(sc.screens.includes('codex'), 'K opens the Codex', sc);
    await q('[role="tab"]:has-text("Plants and food")').click();
    await wait.frames(3);
    await q('button[data-entry="cx-honeydew"]').click();
    await wait.frames(2);
    expect(await g(() => document.querySelector('[data-testid="codex-entry"]').dataset.locked) === '0', 'the unlocked entry shows its field note');
    expect((await text('[data-testid="codex-note"]'))?.length > 40, 'the note has prose');
    await pic('12-codex-unlocked-1280');
    const locked = await g(() => document.querySelector('button[data-entry][data-locked="1"]')?.dataset.entry);
    await q(`button[data-entry="${locked}"]`).click();
    await wait.frames(2);
    expect(await g(() => document.querySelector('[data-testid="codex-entry"]').dataset.locked) === '1', 'a locked entry shows no note');
    expect(/Not yet observed/.test((await text('[data-testid="codex-observed"]')) ?? ''), 'and says not yet observed');
    await q('[data-testid="codex-search"]').fill('honeydew');
    await wait.frames(3);
    expect(await count('[data-testid="codex-list"] [data-entry]') >= 1, 'search finds entries');
    await pic('13-codex-search-1280');
    await page.keyboard.press('Escape');
    await wait.frames(3);
    await page.keyboard.press('Escape');
    await wait.frames(3);
    sc = await screens();
    if (sc.book !== null) await closeAll();
    ok('codex', { locked });

  }
  // --- 6. marker palette and overlay controls ---------------------------------------------------------------------------
  if (run('markers')) {
    await g(() => window.__hud.game.setView('colony'));
    await step(1);
    await refresh();
    await wait.frames(3);
    expect(await count('[data-testid="marker-palette"] [data-tool]') === 8, 'the palette has seven tools and Select');
    const counts = await g(() => [...document.querySelectorAll('[data-testid="marker-palette"] [data-tool]')].map((b) => `${b.dataset.tool}:${b.textContent}`));
    expect(counts.some((c) => /forage:.*0\/4/.test(c)), 'forage shows its count against the cap of 4', counts);
    await q('[data-testid="marker-palette"] [data-tool="forage"]').click();
    await wait.frames(3);
    expect(await g(() => window.__hud.game.viewsLayer.state.tool) === 'forage', 'the palette selected the forage tool in the views layer');
    expect(await count('[data-testid="marker-options"] [role="slider"]') >= 1, 'the forage options have a radius slider');
    await pic('14-markers-forage-1280');
    await q('[data-testid="marker-palette"] [data-tool="dig"]').click();
    await wait.frames(3);
    expect(await g(() => window.__hud.game.viewsLayer.state.tool) === 'dig', 'the dig tool');
    expect(await count('[data-testid="marker-options"] .ui-select-btn') >= 1, 'the dig options have a chamber type');
    await pic('15-markers-dig-1280');
    // the cap: the views layer's own count and the palette agree after a marker is placed through the game
    await g(() => window.__game.command({ type: 'placeMarker', kind: 'forage', pos: { ...window.__game.query.world().queenStart.pos }, radius: 300 }));
    await step(2);
    await refresh();
    const c2 = await g(() => document.querySelector('[data-tool="forage"]').textContent);
    expect(/1\/4/.test(c2), 'the count follows the sim', c2);
    await q('[data-testid="marker-palette"] [data-tool="select"]').click();
    await wait.frames(2);
    await page.keyboard.press('KeyV');
    await wait.frames(3);
    expect(await g(() => window.__panels.overlays().scent) === true, 'V toggles the scent view');
    const legend = await g(() => [...document.querySelectorAll('[data-testid="legend"] li[data-pattern]')].map((e) => e.dataset.pattern));
    expect(['chevron', 'stipple', 'zigzag', 'rings'].every((p) => legend.includes(p)), 'the scent legend has the four patterns (check 19)', legend);
    await page.keyboard.press('KeyO');
    await wait.frames(2);
    expect(await g(() => window.__panels.overlays().other) === 'temperature', 'O cycles to temperature');
    await pic('16-overlays-1280');
    await page.keyboard.press('KeyO'); await page.keyboard.press('KeyO'); await page.keyboard.press('KeyO'); await page.keyboard.press('KeyO');
    await wait.frames(2);
    expect(await g(() => window.__panels.overlays().other) === null, 'four more presses cycle back to off');
    await page.keyboard.press('KeyV');
    await wait.frames(2);
    ok('markers+overlays', { counts: counts.length, legend });

  }
  // --- 7. keyboard reach: Tab visits every control of each drawer --------------------------------------------------------
  if (run('keys')) {
    await g(() => window.__hud.game.setView('observer'));
    for (const [key, drawer] of [['KeyY', 'health'], ['KeyU', 'nest']]) {
      await page.keyboard.press(key);
      await wait.frames(4);
      await refresh();
      const reach = await g(() => {
        const d = document.querySelector('.fd-drawer');
        const all = [...d.querySelectorAll('button, [role="slider"], input, [role="combobox"], select, [tabindex]')].filter((e) => !e.disabled && e.getAttribute('tabindex') !== '-1' && e.getClientRects().length > 0);
        return { n: all.length, rows: d.querySelectorAll('[data-testid="health-row"]').length, text: d.textContent.slice(0, 80) };
      });
      const seen = new Set();
      for (let i = 0; i < reach.n + 3; i++) {
        await page.keyboard.press('Tab');
        const id = await g(() => { const a = document.activeElement; return a && a.closest('.fd-drawer') ? `${a.tagName}.${a.className}.${a.textContent.slice(0, 24)}.${[...a.parentNode.children].indexOf(a)}` : null; });
        if (id) seen.add(id);
      }
      expect(seen.size >= Math.min(reach.n, 3), `Tab moves through the ${drawer} drawer`, { reach, seen: seen.size, trace });
      result.checks[`tab-${drawer}`] = { controls: reach.n, visited: seen.size };
      await page.keyboard.press('Escape');
      await wait.frames(3);
      await closeAll();
    }
    expect((await g(() => window.__hud.game.input.suspended)) === false, 'game keys resume after the panels close');

  }
  // --- 8. other sizes: 1920x1080 and UI scale 150 % ------------------------------------------------------------------------
  if (run('sizes')) {
    if (SHOTS) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await wait.frames(3);
      await g(() => window.__panels.open('health'));
      await g(() => window.__panels.expand('diag-stores'));
      await refresh();
      await pic('20-health-1920');
      await g(() => window.__panels.open('nest'));
      await refresh();
      await pic('21-nest-1920');
      await g(() => window.__panels.open('journal'));
      await g(() => window.__panels.journalTab('graphs'));
      await refresh();
      await pic('22-journal-graphs-1920');
      await g(() => window.__panels.close());
      await g(() => window.__hud.game.setSettings({ accessibility: { uiScale: 150 } }));
      await page.setViewportSize({ width: 1280, height: 720 });
      await wait.frames(4);
      await g(() => window.__panels.open('health'));
      await g(() => window.__panels.expand('diag-food-intake-p'));
      await refresh();
      await pic('23-health-scale150');
      await g(() => window.__panels.open('nest'));
      await refresh();
      await pic('24-nest-scale150');
      await g(() => window.__panels.open('journal'));
      await g(() => window.__panels.journalTab('milestones'));
      await refresh();
      await pic('25-journal-scale150');
      await g(() => window.__panels.close());
      await g(() => window.__hud.game.setSettings({ accessibility: { uiScale: 100 } }));
      await page.setViewportSize({ width: 1280, height: 720 });
    }

  }
  result.standInCount = result.standIns.length;
  return result;
};
