// ui-hud end-to-end check on the real game (task ui-hud acceptance 2-5): the HUD while possessing, Colony orders
// opened from the queen's prompt and by its key, a slider changing the simulation's directives, pause and speed
// buttons, the possessed-ant panel following possession, the Roster, the inspect card and stacking alerts, with
// screenshots at 1280x720 and 1920x1080 and UI scale 80 / 150 %.
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1&quality=test" --script tests/e2e/hud.mjs \
//        --out test-output/hud/real --script-timeout 900000
// Stand-ins (logged as STAND-IN and listed in result.standIns): the founding flow is not finished, so the hand-over
// (opening.done) is written directly; the alert system is not publishing yet, so alerts are pushed into
// progression.alerts. HUD_STRICT=1 fails on any stand-in. HUD_SHOTS=0 skips screenshots.
const SHOTS = process.env.HUD_SHOTS !== '0';

export default async ({ page, shot, log, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`hud: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const result = { checks: {}, standIns: [], shots: [] };
  const standIn = (feature, detail) => {
    result.standIns.push({ feature, detail });
    log('STAND-IN', feature, '-', detail);
    if (process.env.HUD_STRICT) throw new Error(`hud (strict): stand-in needed for ${feature}: ${detail}`);
  };
  const summary = () => g(() => window.__game.summary());
  const sim = (fn, arg) => g(([src, a]) => { const sm = window.__hud.game.session.sim; return new Function('sim', 'arg', `return (${src})(sim, arg)`)(sm, a); }, [fn.toString(), arg]);
  const refresh = async () => { await g(() => window.__hud.game.refreshUi()); await wait.frames(2); };
  const render = () => g(() => window.__game.renderFrame());
  // a possession starts a camera transition that needs many frames; underground frames cost seconds in software GL, so settle it at once
  const settle = () => g(() => window.__game.renderFrame({ settle: 2 }));
  // screenshots: the scene is drawn first (heavy under software GL), focus rings of earlier clicks are cleared unless a drawer owns focus
  const pic = async (name, { draw = true } = {}) => {
    if (!SHOTS) return;
    await g(() => { const a = document.activeElement; if (a && !a.closest('.fd-drawer')) a.blur(); });
    if (draw) { await render(); await wait.frames(2); }
    result.shots.push(await shot(name));
  };
  const dirs = () => g(() => JSON.parse(JSON.stringify(window.__game.query.colony().directives)));
  const q = (sel) => page.locator(sel);
  const count = (sel) => g((s) => document.querySelectorAll(s).length, sel);
  const text = (sel) => g((s) => document.querySelector(s)?.textContent ?? null, sel);

  // --- 0. the HUD is up on the real game ----------------------------------------------------------------------------
  const s0 = await summary();
  expect(s0.mode === 'playing', 'not playing after autostart', s0.mode);
  expect(await g(() => typeof window.__hud === 'object'), '__hud debug hook missing (needs ?test=1)');
  await refresh();
  expect(await count('[data-testid="hud-root"]') === 1, 'HUD root not mounted');
  const date = await text('[data-testid="hud-date"]');
  expect(/^(Spring|Summer|Autumn|Winter) · Day \d+ · Year \d+/.test(date ?? ''), 'date line', date);
  expect(/^\d\d:\d\d$/.test(await text('.fd-clock') ?? ''), 'clock');
  await pic('01-possession-1280');
  result.checks.hud = { date };

  // --- 1. the queen: colony-orders doorway ----------------------------------------------------------------------------
  let p = (await summary()).possessed;
  expect(p && p.caste === 'queen', 'the autostart game should possess the queen', p && p.caste);
  const queenId = p.id;
  let opening = await sim((sm) => sm.state.player.opening && !sm.state.player.opening.done);
  if (opening) {
    await g(() => window.__game.cheat.completeFounding?.(10));
    await g(() => window.__game.step(1));
    opening = await sim((sm) => sm.state.player.opening && !sm.state.player.opening.done);
  }
  if (opening) {
    standIn('hand-over', 'cheat.completeFounding does not finish the opening yet; opening.done is written directly');
    await sim((sm) => { sm.state.player.opening.done = true; });
  }
  await g(() => window.__game.step(1));
  await refresh();
  const prompts = await g(() => window.__hud.prompts());
  expect(prompts.some((l) => l.input === 'directives' && /Colony orders/.test(l.text)), 'queen prompt lacks Colony orders', prompts);
  expect(await count('[data-testid="colony-orders-button"]') === 1, 'possessed panel lacks the Colony orders button');
  const anchor = await g(() => document.querySelector('[data-testid="prompts"]')?.dataset.anchor ?? null);
  result.checks.promptAnchor = anchor;
  log('prompt anchor mode', anchor);
  await pic('02-queen-prompt-1280');

  // the key opens Directives without releasing her or changing the speed or the directives record
  // the Directives data is built only while the drawer is open (it costs a pass over the colony)
  expect(await g(() => window.__hud.snapshot().directives) === null, 'the directives slice is built while the drawer is closed');
  const before = { dirs: await dirs(), speed: (await summary()).time.speed, id: (await summary()).possessed.id };
  await page.keyboard.press('KeyI');
  await wait.frames(3);
  expect(await count('[data-testid="dir-workforce"]') === 1, 'I did not open Directives');
  expect(await g(() => window.__hud.snapshot().directives !== null), 'the drawer opened without data (no refresh on open)');
  const afterOpen = { dirs: await dirs(), speed: (await summary()).time.speed, id: (await summary()).possessed.id };
  expect(JSON.stringify(afterOpen) === JSON.stringify(before), 'opening Directives changed the game', { before, afterOpen });
  expect(afterOpen.id === queenId, 'the queen is no longer possessed');
  await pic('03-directives-1280');
  // focus inside the drawer: the game's own keys (Tab cycles ants, arrows orbit) are suspended, and resume on close
  expect(await g(() => window.__hud.game.input.suspended) === true, 'game keys stay live while focus is inside the drawer');
  await page.keyboard.press('KeyI');
  await wait.frames(3);
  expect(await count('[data-testid="dir-workforce"]') === 0, 'I did not close Directives');
  // the prompt line and the panel button open it too
  await q('[data-testid="colony-orders-button"]').click();
  await wait.frames(3);
  expect(await count('[data-testid="dir-workforce"]') === 1, 'the Colony orders button did not open Directives');

  // a slider moves the simulation's directives (read back through the colony query)
  await g(() => window.__game.cheat.spawnAnts(40, 'worker', 'forage'));
  await g(() => window.__game.step(20));
  await refresh();
  const d0 = await dirs();
  const slider = q('[data-group="forage"] [role="slider"]');
  await slider.focus();
  const v0 = Number(await slider.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await wait(700); // 300 ms commit
  await wait.frames(3);
  const d1 = await dirs();
  expect(d1.allocation !== 'auto' && typeof d1.allocation === 'object', 'moving a slider did not switch to manual allocation', d1.allocation);
  const total = Object.values(d1.allocation).reduce((a, b) => a + b, 0);
  expect(Math.round(total) === 100, 'ordered shares do not sum to 100', d1.allocation);
  expect(Math.abs(d1.allocation.forage - (v0 + 10)) < 1.5 || d1.allocation.forage > (d0.allocation === 'auto' ? 0 : d0.allocation.forage), 'forage share did not rise', { v0, d1: d1.allocation });
  const sliderNow = Number(await slider.getAttribute('aria-valuenow'));
  result.checks.slider = { before: v0, after: sliderNow, allocation: d1.allocation };
  // the diet control and the architect also reach the simulation
  await q('[data-testid="dir-diet"] [role="switch"]').click(); // Auto off
  await wait(500);
  expect((await dirs()).diet !== 'auto', 'diet Auto did not switch off', (await dirs()).diet);
  await pic('04-directives-manual-1280');
  await page.keyboard.press('Escape');
  await wait.frames(3);
  expect(await count('[data-testid="dir-workforce"]') === 0, 'Esc did not close Directives');
  expect(await g(() => window.__hud.game.input.suspended) === false, 'game keys did not resume after the drawer closed');

  // --- 2. time controls ----------------------------------------------------------------------------------------------
  await q('[data-testid="speed-pause"]').click();
  await wait.frames(3);
  let t = (await summary()).time;
  expect(t.paused === true, 'the pause button did not pause', t);
  // a mouse click must not leave the focus on the chip: Space ("let go") would press it again, Tab would walk the HUD
  const focusAfterClick = await g(() => { const a = document.activeElement; return a && a !== document.body && a.tagName !== 'CANVAS' ? `${a.tagName}.${a.className}` : null; });
  expect(focusAfterClick === null, 'a mouse click left the focus on a HUD chip', focusAfterClick);
  await page.keyboard.press('Space');
  await wait.frames(3);
  expect((await summary()).time.paused === true, 'Space un-paused the game after a click on the pause button');
  // (Tab is the game's cycle-ant key while the game has the focus: it is not pressed here)
  const chipsTabbable = await g(() => [...document.querySelectorAll('.fd-root button, .fd-root [tabindex], .fd-root input')].filter((el) => !el.closest('.fd-drawer, .fd-alert-menu') && el.tabIndex >= 0).length);
  expect(chipsTabbable === 0, 'HUD chips are in the tab order', chipsTabbable);
  result.checks.focus = { afterClick: focusAfterClick, chipsInTabOrder: chipsTabbable };
  await q('[data-testid="speed-2"]').click();
  await wait.frames(3);
  t = (await summary()).time;
  expect(!t.paused && t.speed === 2, 'the 2x button did not set 2x', t);
  expect(await g(() => document.querySelector('[data-testid="speed-8"]').getAttribute('aria-disabled')) === 'true', '8x should be disabled while possessing');
  await q('[data-testid="speed-1"]').click();
  await wait.frames(2);
  result.checks.time = { speed: (await summary()).time.speed };

  // --- 3. the possessed-ant panel follows possession --------------------------------------------------------------------
  expect(/^Queen \d{4}$/.test(await text('[data-testid="possessed-name"]') ?? ''), 'panel does not show the queen', await text('[data-testid="possessed-name"]'));
  const pw = await g(() => window.__game.possess('forager'));
  await g(() => window.__game.step(1));
  await settle();
  await refresh();
  const wid = (await summary()).possessed.id;
  expect(wid !== queenId, 'possess(forager) kept the queen');
  const nameW = await text('[data-testid="possessed-name"]');
  expect(nameW === `Worker ${String(wid).padStart(4, '0')}`, 'panel did not follow the possession', { nameW, wid });
  expect(await count('[data-testid="colony-orders-button"]') === 0, 'a worker must not get the Colony orders button');
  await g(() => window.__hud.open('directives'));
  await wait.frames(2);
  expect(await count('[data-testid="dir-workforce"]') === 1, 'I must open Directives with a worker possessed too');
  await g(() => window.__hud.close());
  await pic('05-worker-possessed-1280');
  result.checks.possession = { queenId, workerId: wid, via: pw };

  // --- 4. roster ---------------------------------------------------------------------------------------------------------
  await g(() => window.__game.cheat.spawnAnts(400, 'worker', 'forage'));
  await g(() => window.__game.step(2));
  await page.keyboard.press('KeyL');
  await wait.frames(4);
  await refresh();
  await wait.frames(2);
  expect(await count('[data-testid="roster-body"]') === 1, 'L did not open the Roster');
  const rows = await count('[data-testid="roster-row"]');
  const total2 = await text('[data-testid="roster-count"]');
  expect(rows > 0 && rows <= 60, 'roster DOM rows out of budget', rows);
  expect(/^\d+ ants$/.test(total2 ?? '') && Number(total2.split(' ')[0]) > 400, 'roster count', total2);
  await pic('06-roster-1280');
  // quick-possess button and a row's Possess button
  await q('[data-testid="roster-quick-digger"]').click().catch(() => {});
  const row = q('[data-testid="roster-row"]').nth(2);
  const rowId = Number(await row.getAttribute('data-id'));
  await row.locator('[data-testid="roster-possess"]').dispatchEvent('click');
  await g(() => window.__game.step(1));
  await settle();
  await refresh();
  expect((await summary()).possessed.id === rowId, 'the row Possess button did not possess that ant', { rowId, now: (await summary()).possessed.id });
  // sort by health, then filter to the queen
  await q('[data-testid="roster-sort-health"]').dispatchEvent('click');
  await refresh();
  await wait.frames(2);
  result.checks.roster = { rows, total: total2, possessedViaRow: rowId };
  await page.keyboard.press('Escape');
  await wait.frames(3);
  expect(await count('[data-testid="roster-body"]') === 0, 'Esc did not close the Roster');

  // --- 5. inspect card ---------------------------------------------------------------------------------------------------
  const target = await g(() => window.__game.query.ants().find((a) => a.caste === 'worker').id);
  await g((id) => window.__hud.inspect({ kind: 'ant', id }), target);
  await wait.frames(3);
  await refresh();
  expect(await count('[data-testid="inspect-card"]') === 1, 'no inspect card');
  const header = await text('[data-testid="inspect-title"]');
  expect(header === `Worker ${String(target).padStart(4, '0')}`, 'inspect header', header);
  expect(await count('.fd-ins-row') >= 6, 'inspect rows');
  await pic('07-inspect-1280');
  // Esc unpins the card (and does not open the pause menu while it does)
  await page.keyboard.press('Escape');
  await wait.frames(3);
  expect(await g(() => window.__hud.screen().drawer === null && !document.querySelector('.ui-pausecard')), 'Esc opened the pause menu instead of unpinning the card');
  await wait(600);
  await refresh();
  expect(await count('[data-testid="inspect-card"]') === 0, 'Esc did not unpin the inspect card');
  // a pinned card whose target dies goes away by itself
  const victim = await g(() => window.__game.query.ants().filter((a) => a.caste === 'worker')[1].id);
  await g((id) => window.__hud.inspect({ kind: 'ant', id }), victim);
  await refresh();
  expect(await count('[data-testid="inspect-card"]') === 1, 'no card for the second target');
  await g((id) => window.__game.cheat.kill?.(id), victim);
  await g(() => window.__game.step(2));
  await wait(1400);
  await refresh();
  expect(await count('[data-testid="inspect-card"]') === 0, 'the pinned card of a dead target stayed');
  await g(() => window.__hud.inspect(null));
  await wait(600);

  // --- 6. alerts stacking -------------------------------------------------------------------------------------------------
  standIn('alerts', 'the alert system does not publish yet; alerts are pushed into progression.alerts');
  await sim((sm) => {
    const mk = (id, kind, level, title, cause, count = 1) => ({ id, kind, level, subjectId: id, title, cause, focus: null, diagnosticId: null, raisedTick: sm.state.tick + id, updatedTick: sm.state.tick, count, acknowledged: false });
    sm.state.progression.alerts.push(
      mk(9001, 'food-p-low', 'warning', 'Protein short for the larvae', '18 larvae, 0.3 P stored', 3),
      mk(9002, 'source-found', 'notice', 'New food found', 'honeydew, 140 BU north-east'),
      mk(9003, 'nest-crowded', 'notice', 'Nest crowded', 'general chamber at 140 % capacity'),
      mk(9004, 'weather-change', 'notice', 'Rain coming', 'within 2 game hours'),
      mk(9005, 'trail-lost', 'notice', 'Trail broken', 'rain washed out the trail to the aphids'),
    );
  });
  await refresh();
  await wait.frames(3);
  const feed = await g(() => window.__hud.alerts());
  expect(feed.cards.length === 3, 'feed should show 3 cards', feed.cards.length);
  expect(feed.more === 2, 'the +n chip should show 2', feed.more);
  await pic('08-alerts-1280', { draw: false }); // alerts age in real time (notices leave after 12 s): shoot at once, the scene is already drawn
  result.checks.alerts = { cards: feed.cards.map((c) => c.kind), more: feed.more, toasts: feed.toasts.length };
  // HUD hidden (H): only critical alerts show, as one pinned card (GDD 08 3.4)
  await sim((sm) => {
    const mk = (id, kind, title) => ({ id, kind, level: 'critical', subjectId: id, title, cause: 'test', focus: null, diagnosticId: null, raisedTick: sm.state.tick + id, updatedTick: sm.state.tick, count: 1, acknowledged: false });
    sm.state.progression.alerts.push(mk(9101, 'queen-in-danger', 'Queen in danger'), mk(9102, 'nest-flooding', 'Nest flooding'));
  });
  await g(() => window.__hud.game.toggleHud());
  await refresh();
  await wait.frames(3);
  const hiddenFeed = await g(() => window.__hud.alerts());
  expect(hiddenFeed.cards.length === 1 && hiddenFeed.cards[0].level === 'critical', 'a hidden HUD should show one pinned critical card', hiddenFeed.cards.map((c) => `${c.kind}:${c.level}`));
  await g(() => window.__hud.game.toggleHud());
  result.checks.hiddenCriticals = { cards: hiddenFeed.cards.length, more: hiddenFeed.more };
  await sim((sm) => { sm.state.progression.alerts.length = 0; });
  await refresh();

  // --- 7. no forced reflow from the HUD in the frame loop --------------------------------------------------------
  await g(() => window.__game.release());
  await g(() => window.__game.possess('queen'));
  await g(() => window.__game.step(1));
  await settle();
  await refresh();
  const reflow = await g(async () => {
    const hits = [];
    const wrap = (proto, name) => {
      const d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d) return () => {};
      const patched = { ...d };
      if (d.get) patched.get = function () { const st = new Error().stack ?? ''; if (/\/src\/ui\/hud\/|\/src\/ui\/panels\//.test(st) && !/useAnchor|ResizeObserver/.test(st)) hits.push(`${name}@${st.split('\n')[2]?.trim()}`); return d.get.call(this); };
      else if (typeof d.value === 'function') patched.value = function (...a) { const st = new Error().stack ?? ''; if (/\/src\/ui\/hud\/|\/src\/ui\/panels\//.test(st) && !/ResizeObserver/.test(st)) hits.push(`${name}@${st.split('\n')[2]?.trim()}`); return d.value.apply(this, a); };
      Object.defineProperty(proto, name, patched);
      return () => Object.defineProperty(proto, name, d);
    };
    const undo = [wrap(HTMLElement.prototype, 'offsetWidth'), wrap(HTMLElement.prototype, 'offsetHeight'), wrap(Element.prototype, 'clientWidth'), wrap(Element.prototype, 'clientHeight'), wrap(Element.prototype, 'getBoundingClientRect'), wrap(Element.prototype, 'scrollTop')];
    await new Promise((r) => { let n = 0; const f = () => (++n >= 90 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    undo.forEach((u) => u());
    return hits;
  });
  expect(reflow.length === 0, 'the HUD read layout inside the frame loop', reflow.slice(0, 5));
  result.checks.reflow = { hudLayoutReadsIn90Frames: reflow.length };

  // --- 8. sizes and scales ------------------------------------------------------------------------------------------------
  if (SHOTS) {
    await g(() => window.__hud.open('directives'));
    await wait.frames(3);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await wait.frames(4);
    await pic('09-directives-1920');
    await g(() => window.__hud.close());
    await g(() => window.__hud.open('roster'));
    await refresh();
    await wait.frames(3);
    await pic('10-roster-1920');
    await g(() => window.__hud.close());
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const scale of [80, 150]) {
      await g((s) => window.__hud.game.setSettings({ accessibility: { uiScale: s } }), scale);
      await wait.frames(4);
      await pic(`11-possession-1280-s${scale}`);
      await g(() => window.__hud.open('directives'));
      await wait.frames(3);
      await pic(`12-directives-1280-s${scale}`);
      await g(() => window.__hud.close());
    }
    await g(() => window.__hud.game.setSettings({ accessibility: { uiScale: 100 } }));
  }

  result.final = (await summary()).time;
  return result;
};
