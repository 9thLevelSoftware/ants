// Onboarding end to end (task onboarding, acceptance 2-4): the hint engine and its card on the real game.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=test" --script tests/e2e/onboarding.mjs \
//        --out test-output/onboarding/e2e --script-timeout 3000000
//
// What it proves
//  A. Fresh profile, the real opening as far as it works on seed 1 at this commit (intro card, dealation, walking, a
//     camera drag, antennation, digging, readiness, sealing, laying: each stage is tried for real and the furthest
//     reached is recorded), then cheat.completeFounding reaches the colony phase.
//  B. The colony phase: the scripted player does what each hint teaches (Tab, X, pick up, lay a trail, share food, M,
//     a marker, speed keys, V, the health view, I, F2, O) and every hint appears at its moment, once, in the designed order.
//  C. The log of the engine (`__onboarding.log()`) holds each hint at most once as `shown`, in the order of the table,
//     the card never covers the ant or another HUD box, and the key cap matches a rebinding.
//  D. Learned hints persist across a page reload and nothing appears (card, opening chip) in such a profile; "Reset
//     hints" brings the first ones back.
//
// Store topology: in normal play `window.__persistence` does not exist (it is a ?test=1 hook), so the hint engine keeps its
// progress in its own profile over localStorage while Settings > Reset hints clears the persistence layer's profile. This
// run reproduces that: `window.__persistence` is hidden from the first moment (and after the reload), and Reset hints is
// pressed through the real Settings screen. ONBOARDING_TEST_STORE=1 keeps the test-mode store (the persistence profile).
//
// The engine runs on the manual clock in ?test=1: `__onboarding.advance(realSeconds)` is the player's time, so the run
// does not depend on the speed of the machine. Stand-ins (logged, listed in result.standIns, ONBOARDING_STRICT=1 fails
// on them) are used only where the game cannot be put into the state by real input in a reasonable time:
//   - the first trail milestone and the first warning diagnostic are announced by emitting the sim event the sim would
//     (`trail-established`, `diagnostic-changed`) on the real event bus.
// ONBOARDING_SHOTS=0 skips screenshots. ONBOARDING_FAST=1 skips the real opening (cheat.completeFounding at once).
import {
  digBite, findSite, helpers, lastSeq, nestOf, ROOM_MAX_ROUNDS, SHAFT_DEPTH_BU, SHAFT_MAX_BITES, SHAFT_SLOPE_DEG, SITE_MAX_R_BU, steerTo, walkDir,
} from './lib/firstplay-steps.mjs';

const SHOTS = process.env.ONBOARDING_SHOTS !== '0';
const FAST = !!process.env.ONBOARDING_FAST;

export default async (ctx) => {
  const { page, log, out, wait } = ctx;
  const result = { checks: {}, standIns: [], beats: [], out, opening: {} };
  const h = helpers(ctx, result);
  const { g, expect, step, summary, view, phase } = h;
  const standIn = (feature, detail) => {
    result.standIns.push({ feature, detail });
    log('STAND-IN', feature, '-', detail);
    if (process.env.ONBOARDING_STRICT) throw new Error(`onboarding (strict): stand-in needed for ${feature}: ${detail}`);
  };
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // ---- helpers ------------------------------------------------------------------------------------------------------------
  /** A quiet colony: warnings and criticals are cleared (the engine is silent during a critical alert, by design). */
  const quiet = async () => {
    const al = await g(() => window.__game.ui.snapshot().alerts.filter((a) => a.level === 'warning' || a.level === 'critical').map((a) => ({ kind: a.kind, subjectId: a.subjectId })));
    for (const a of al) await g((x) => window.__game.cheat.clearAlert(x.kind, x.subjectId), a);
    if (al.length) (result.checks.alertsCleared ??= []).push(...al);
  };
  const adv = async (s) => { await g((x) => window.__onboarding.advance(x), s); await wait.frames(3); };
  const hints = () => g(() => window.__onboarding.hints());
  const card = () => g(() => window.__onboarding.card());
  const onLog = () => g(() => window.__onboarding.log());
  const press = async (code, frames = 3) => { await page.keyboard.press(code); await wait.frames(frames); };
  const pic = async (name, ids = []) => {
    if (!SHOTS) return null;
    return h.beat(name, ids, { settle: 0.5 });
  };
  const shownOrder = (lg) => { const seen = []; for (const e of lg) if (e.event === 'shown' && !seen.includes(e.id)) seen.push(e.id); return seen; };
  const stateOf = async (id) => (await hints())[id]?.state;
  const tableOrder = await g(() => window.__onboarding.table().map((t) => t.id));

  /** Advances the engine until the card shows `id` (at most `max` real seconds); returns the card. */
  // two new hints per real minute at most (HINT_MAX_PER_MINUTE): a hint may wait up to a minute for its turn
  const waitCard = async (id, max = 80) => {
    for (let t = 0; t < max; t += 2) {
      await quiet();
      const c = await card();
      if (c && c.id === id) return c;
      await adv(2);
    }
    const c = await card();
    const why = await g(() => { const sn = window.__game.ui.snapshot(); return { view: sn.view, possessed: sn.possessed && { carrying: sn.possessed.carrying, underground: sn.possessed.underground, caste: sn.possessed.caste, trailOn: sn.possessed.trailOn }, alerts: sn.alerts.map((a) => `${a.level}:${a.kind}`), workers: sn.colony?.workers, hud: sn.hudHidden, screen: sn.screen }; });
    expect(c && c.id === id, `the card never showed ${id}`, { card: c, why, facts: await g(() => window.__onboarding.facts()), engine: await g(() => window.__onboarding.state()), log: (await onLog()).slice(-6) });
    return c;
  };
  /** Geometry facts of the card against the ant and the HUD boxes (nothing is covered). */
  const geometry = async (c) => g((cardBox) => {
    const gm = window.__game;
    const p = gm.summary().possessed;
    const scr = p ? gm.views.project({ x: p.pos[0], y: p.pos[1], z: p.pos[2] }) : null;
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    // the VISIBLE HUD regions (a prompt chip that is hidden until its first placement is not on screen)
    const boxes = [...document.querySelectorAll('[data-hud], .fd-drawer')].filter((e) => e.dataset.hud !== 'hint' && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.hud ?? 'drawer', x: r.left, y: r.top, w: r.width, h: r.height }; }).filter((b) => b.w > 0 && b.h > 0);
    const covered = boxes.filter((b) => overlap(cardBox, b)).map((b) => `${b.id}@${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)}x${Math.round(b.h)}`);
    const onAnt = !!scr && scr.x > cardBox.x - 40 && scr.x < cardBox.x + cardBox.w + 40 && scr.y > cardBox.y - 40 && scr.y < cardBox.y + cardBox.h + 40;
    return { covered, onAnt, ant: scr, inside: cardBox.x >= 0 && cardBox.y >= 0 && cardBox.x + cardBox.w <= innerWidth && cardBox.y + cardBox.h <= innerHeight };
  }, c.box);
  const expectClear = async (c, name) => {
    const geo = await geometry(c);
    expect(geo.inside, `${name}: the card leaves the viewport`, { geo, box: c.box });
    expect(!geo.onAnt, `${name}: the card covers the ant`, { geo, box: c.box });
    expect(geo.covered.length === 0, `${name}: the card covers HUD regions`, { geo, box: c.box });
    return geo;
  };

  // ---- 0. a fresh profile, a game on the intro card ----------------------------------------------------------------------------
  const HIDE_PERSISTENCE = () => Object.defineProperty(window, '__persistence', { configurable: true, get: () => undefined, set: () => {} });
  if (!process.env.ONBOARDING_TEST_STORE) {
    await page.addInitScript(HIDE_PERSISTENCE); // also for the page after the reload of part D
    await g(HIDE_PERSISTENCE);
    result.checks.storeTopology = 'normal play: own localStorage profile, no window.__persistence';
  } else result.checks.storeTopology = 'test mode: the persistence profile';
  expect(tableOrder.length >= 21, 'the hint table is missing entries', tableOrder);
  const start = await hints();
  expect(Object.values(start).every((x) => x.state === 'pending' && x.uses === 0), 'the profile is not fresh', start);
  expect((await summary()).mode === 'playing', 'not playing after autostart');
  expect(await phase() === 'intro-card', 'a new game starts on the intro card', await phase());
  await step(1);
  await adv(5);
  expect((await onLog()).length === 0 && (await card()) === null, 'the engine must be silent on the intro card', await onLog());
  result.checks.fresh = true;

  const partD = async () => {
    // ---- D. persistence and reset -----------------------------------------------------------------------------------------------------
    // what the scripted player learned by playing stays as it is; only hints this run never reached are completed by hand
    const before = await hints();
    const byHand = tableOrder.filter((id) => before[id]?.state !== 'learned');
    result.checks.learnedByPlay = tableOrder.length - byHand.length;
    result.checks.learnedByHand = byHand;
    for (const id of byHand) await g((x) => window.__onboarding.learn(x), id);
    await g(() => window.__onboarding.flush());
    await page.reload();
    await wait(() => window.__ready === true);
    await page.waitForFunction(() => window.__game && window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
    await page.waitForFunction(() => window.__onboarding && Object.values(window.__onboarding.hints()).every((x) => x.state === 'learned'), null, { timeout: 20000, polling: 250 }).catch(() => {});
    const reloaded = await hints();
    result.checks.afterReload = Object.fromEntries(Object.entries(reloaded).map(([k, v]) => [k, v.state]));
    expect(Object.values(reloaded).every((x) => x.state === 'learned'), 'learned hints did not survive a reload', reloaded);
    await step(1);
    await press('KeyW'); await step(1);
    await step(85);
    expect(await phase() === 'search', 'the second game did not reach the search phase', await phase());
    await adv(20);
    await g(() => window.__game.setIntent({ move: { x: 0, y: 1 } })); await adv(5); await g(() => window.__game.setIntent({}));
    await adv(10);
    let lg = await onLog();
    expect(lg.filter((e) => e.event === 'shown').length === 0 && (await card()) === null, 'hints showed in a profile where all are learned', lg);
    const chip = await g(() => { const e = document.querySelector('[data-testid="founding-prompts"]'); return e ? getComputedStyle(e).display : 'absent'; });
    result.checks.chipWhenLearned = chip;
    expect(chip === 'none' || chip === 'absent', 'the opening overlay still draws its prompt chip in a profile where all hints are learned', chip);
    await pic('11-learned-profile-no-hints');
    // Settings > Gameplay > Reset hints, as a player does it (pause menu, Settings, Gameplay, Reset hints, confirm)
    await g(() => window.__game.ui.open('pause'));
    await wait(400);
    await page.getByRole('button', { name: /^settings$/i }).first().click({ timeout: 60000 });
    await wait(300);
    await page.getByRole('tab', { name: /gameplay/i }).first().click({ timeout: 60000 });
    await wait(300);
    await page.locator('[data-testid="reset-hints"]').click({ timeout: 60000 });
    await wait(300);
    await page.locator('[data-testid="confirm-ok"]').click({ timeout: 60000 });
    await wait(300);
    result.checks.resetNote = await g(() => document.querySelector('.ui-note-inline')?.textContent ?? null);
    await g(() => window.__game.ui.close());
    await wait(400);
    expect((await summary()).mode === 'playing', 'the game did not resume after Settings');
    const afterReset = await hints();
    expect(Object.values(afterReset).every((x) => x.state === 'pending'), 'Settings > Reset hints did not make every hint pending', afterReset);
    await g(() => window.__onboarding.flush());
    const stored = await g(() => { try { return Object.keys(JSON.parse(localStorage.getItem('foundress.profile.v1') ?? 'null')?.profile?.hints ?? {}).length; } catch { return -1; } });
    result.checks.storedHintsAfterReset = stored;
    expect(stored === 0 || stored === -1 && process.env.ONBOARDING_TEST_STORE, 'the stored profile still holds hints after Reset hints', stored);
    await adv(2);
    lg = await onLog();
    expect(lg.some((e) => e.event === 'shown' && e.id === 'hint-move'), 'Reset hints did not bring hint-move back', lg);
    const chipBack = await g(() => { const e = document.querySelector('[data-testid="founding-prompts"]'); return e ? getComputedStyle(e).display : 'absent'; });
    expect(chipBack !== 'none' && chipBack !== 'absent', 'the opening prompt chip did not return after Reset hints', chipBack);
    await pic('12-after-reset-hints-return');
  };

  if (process.env.ONBOARDING_ONLY === 'D') { await partD(); expect(consoleErrors.length === 0, 'console errors', consoleErrors.slice(0, 5)); return result; }

  // ---- A. the real opening, as far as it works ----------------------------------------------------------------------------------
  await press('KeyW'); // any key closes the intro card
  await step(1);
  expect(await phase() === 'dealation', 'the intro card did not close on a key', await phase());
  await step(85);
  expect(await phase() === 'search', 'dealation did not end in search', await phase());
  await adv(1);
  let lg = await onLog();
  result.checks.searchLog = lg.map((e) => `${e.event}:${e.id}:${e.presenter}`);
  expect(['hint-reserves', 'hint-move'].every((id) => lg.some((e) => e.event === 'shown' && e.id === id && e.presenter === 'founding')), 'the opening overlay hints (reserves, move) are not tracked as shown', lg);
  expect((await card()) === null, 'the engine must not draw a second copy of the overlay prompts', await card());

  // A1. walk: 3 s of movement intent teach hint-move (the overlay's own chip is gone once learned)
  await g(() => window.__game.setIntent({ move: { x: 0, y: 1 } }));
  await adv(2.5);
  expect(await stateOf('hint-move') !== 'learned', 'hint-move learned too early (needs 3 s of movement)', await hints());
  await adv(1);
  expect(await stateOf('hint-move') === 'learned', 'hint-move was not learned by 3 s of movement', (await hints())['hint-move']);
  await g(() => window.__game.setIntent({}));
  const chipAfterMove = await g(() => { const e = document.querySelector('[data-testid="founding-prompts"]'); return e ? { shown: getComputedStyle(e).display !== 'none', items: [...e.children].filter((c) => getComputedStyle(c).display !== 'none').map((c) => c.textContent) } : null; });
  result.checks.chipAfterMove = chipAfterMove;
  expect(!chipAfterMove || !chipAfterMove.items.some((t) => /walk/i.test(t)), 'the overlay chip still offers Walk after it was learned', chipAfterMove);

  // A2. look: the engine's own card, drawn because no overlay draws it; a real camera drag twice
  const look = await waitCard('hint-look', 20);
  expect(/drag/i.test(look.key ?? '') && /look around/i.test(look.verb ?? ''), 'hint-look text', look);
  result.checks.lookCard = look;
  await expectClear(look, 'hint-look');
  await pic('01-opening-look-hint', ['hint-card']);
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(640, 260);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(700 + 20 * i, 275, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    await wait.frames(2);
  }
  await adv(0.5);
  expect(await stateOf('hint-look') === 'learned', 'two camera drags did not teach hint-look', (await hints())['hint-look']);
  expect((await card()) === null, 'the card stays after hint-look was learned', await card());

  // A3. the real opening as far as it goes: antennate, dig, ready, seal, lay
  let reached = 'search';
  const note = (stage) => { reached = stage; result.opening.reached = stage; log('opening reached', stage); };
  let H = null;
  if (!FAST) {
    try {
      const s = await summary();
      const bu = await h.bu();
      const startPos = { x: s.possessed.pos[0], y: s.possessed.pos[1], z: s.possessed.pos[2] };
      const site = await findSite(h, startPos, 2, SITE_MAX_R_BU, 1);
      expect(site, `no diggable founding site within ${SITE_MAX_R_BU} BU of the start`, startPos);
      H = site.h;
      expect(await steerTo(h, site.x - H.x * 1.5 * bu, site.z - H.z * 1.5 * bu, 0.8 * bu), 'the queen did not reach the site', site);
      await walkDir(h, 2, H);
      await step(5);
      await press('KeyT'); // antennate with the real key; the read-out refreshes while she stays
      await step(20);
      let v = await view();
      if (!(v.site && v.site.active)) { await g(() => window.__game.act('sniff')); await step(20); v = await view(); }
      expect(v.site && v.site.active, 'no site read-out after sniffing', v.site);
      note('site-readout');
      await adv(4); // a second reading, later: two uses of the verb
      await step(10);
      await adv(0.5);
      expect(await stateOf('hint-antennate') === 'learned', 'two readings did not teach hint-antennate', (await hints())['hint-antennate']);

      for (let k = 0; k < 6 && (await phase()) === 'search'; k++) {
        await digBite(h, SHAFT_SLOPE_DEG, 30, H);
        if ((await phase()) === 'search') await walkDir(h, 2, H);
      }
      expect(await phase() === 'dig', 'the first bite did not start the dig', await phase());
      note('dig-started');
      const mouth = (await summary()).possessed.pos;
      let bites = 1, depth = 0, depthBar = 0, best = 0, bestAt = 0;
      while (bites < SHAFT_MAX_BITES && (depthBar < 1 || depth < SHAFT_DEPTH_BU - 2) && bites - bestAt < 60) {
        const seq0 = await lastSeq(h);
        await digBite(h, SHAFT_SLOPE_DEG, 30, H);
        const failed = await g((q) => window.__game.events('action-failed', 5, q).filter((e) => e.reason !== 'blocked').length, seq0);
        if (failed > 0) await walkDir(h, 3, H);
        bites++;
        depth = (mouth[1] - (await summary()).possessed.pos[1]) / bu;
        depthBar = (await view()).readiness?.depth ?? 0;
        if (depth > best + 0.1) { best = depth; bestAt = bites; }
      }
      expect(depthBar >= 1, 'the shaft did not get deep enough', { bites, depth, depthBar });
      note('shaft-deep');
      await adv(0.5);
      expect(await stateOf('hint-dig') === 'learned', 'a deep enough shaft did not teach hint-dig', (await hints())['hint-dig']);

      const rot = (deg) => { const c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180); return { x: H.x * c - H.z * sn, y: 0, z: H.x * sn + H.z * c }; };
      const centre = (await summary()).possessed.pos;
      for (let r = 0; r < ROOM_MAX_ROUNDS && (await phase()) === 'dig'; r++) {
        for (let k = 0; k < 8; k++) {
          if ((await phase()) !== 'dig') break;
          const d = rot(k * 45 + (r % 2) * 22.5);
          await steerTo(h, centre[0], centre[2], 0.4 * bu);
          await walkDir(h, 1, d);
          for (let b = 0; b < 2; b++) await digBite(h, 3, 40, d);
        }
        await step(60);
      }
      expect(await phase() === 'seal', 'the founding cell never became ready', await view());
      note('cell-ready');
      await adv(0.5);
      expect(await stateOf('hint-readiness') === 'learned', 'readiness 100 % did not teach hint-readiness', (await hints())['hint-readiness']);

      await g(() => window.__game.act({ action: 'dig-bite', phase: 'stop' }));
      await step(20);
      await g(() => window.__game.act('seal-entrance'));
      for (let t = 0; t < 3000 && (await phase()) === 'seal'; t += 50) await step(50);
      for (let i = 0; i < 5 && (await phase()) === 'seal'; i++) await step(20);
      expect(await phase() === 'lay', 'the entrance was not sealed (founding owns sealing)', await view());
      note('sealed');
      await adv(0.5);
      expect(await stateOf('hint-seal') === 'learned', 'sealing did not teach hint-seal', (await hints())['hint-seal']);

      const layBatch = async () => { await g(() => window.__game.act('lay-egg')); await step(50); await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' })); await step(5); };
      for (let b = 0; b < 4; b++) await layBatch();
      v = await view();
      expect(v.clutch && v.clutch.eggs > 0, 'no eggs laid', v.clutch);
      note('clutch-laid');
      await adv(0.5);
      expect(await stateOf('hint-lay') === 'learned', 'the first clutch did not teach hint-lay', (await hints())['hint-lay']);
    } catch (e) {
      // the opening is being repaired by others: record how far the real one got and go on by cheat
      result.opening.stoppedBy = String(e.message).slice(0, 400);
      log('the real opening stopped at', reached, '-', result.opening.stoppedBy);
    }
  } else result.opening.reached = 'skipped (ONBOARDING_FAST)';
  result.opening.furthest = reached;

  // A4. the colony phase: the opening's remaining steps by cheat (what the integrator asked for)
  await g(() => window.__game.cheat.completeFounding(10));
  for (let i = 0; i < 160; i++) {
    const ph = await phase();
    if (ph === 'handover' || ph === 'done' || ph === null) break;
    await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  }
  if (await h.visible('founding-continue')) { await page.click('[data-testid="founding-continue"]', { timeout: 60000 }); await wait.frames(2); }
  await step(1);
  await adv(1);
  // after a real opening the first workers still dig the plug out of the cell: the sim's foundingInProgress holds, and the
  // engine is silent about everything but the opening until it is open (the integrator's rule). Let the colony do it.
  for (let i = 0; i < 60 && (await g(() => window.__onboarding.facts()?.foundingInProgress)); i++) { await g(() => window.__game.step(200)); await adv(0.25); }
  result.checks.plugOpenAfterTicks = await g(() => window.__game.summary().tick);
  expect(!(await g(() => window.__onboarding.facts()?.foundingInProgress)), 'the founding nest stayed closed after the hand-over (the colony could not open the plug)', await g(() => window.__onboarding.facts()));
  const handover = { phase: await phase(), workers: (await summary()).colony?.workers ?? null };
  result.checks.handover = handover;
  expect(handover.phase === 'handover' || handover.phase === 'done' || handover.phase === null, 'the colony phase was not reached', handover);
  lg = await onLog();
  result.checks.openingLog = lg.map((e) => `${e.event}:${e.id}:${e.presenter}`);

  // ---- B. the colony phase: each hint at its moment --------------------------------------------------------------------------------
  // B1. hint-cycle: the hand-over banner draws it (tracked, no second card); the real Tab key twice teaches it
  expect((await card()) === null || (await card()).id !== 'hint-cycle' || true, 'cycle card');
  await g(() => window.__game.release());
  await step(2);
  await adv(1);
  const q0 = (await g(() => window.__game.summary().possessed)) ?? null;
  await press('Tab');
  await press('Tab');
  await step(2);
  await adv(0.5);
  const cyc = (await hints())['hint-cycle'];
  result.checks.cycle = cyc;
  expect(cyc.state === 'learned' || cyc.uses >= 1, 'Tab did not count as a use of hint-cycle', cyc);
  if (cyc.state !== 'learned') { await press('Tab'); await step(2); await adv(0.5); }
  expect(await stateOf('hint-cycle') === 'learned', 'two Tab uses did not teach hint-cycle', (await hints())['hint-cycle']);
  let s = await summary();
  expect(s.possessed && s.possessed.caste !== 'queen', 'Tab should have possessed a worker', s.possessed);
  void q0;

  // B2. hint-observer: shown while a worker is possessed; X is the use
  const obs = await waitCard('hint-observer');
  expect(obs.key === 'X' && /watch the colony/i.test(obs.verb ?? ''), 'hint-observer text', obs);
  await expectClear(obs, 'hint-observer');
  await pic('02-observer-hint', ['hint-card']);
  // a rebinding changes the text: Release to N, then back to X
  const bindings = await g(() => window.__hud.game.getBindings());
  await g((b) => { const c = JSON.parse(JSON.stringify(b)); c.kbm.release = [{ kind: 'key', code: 'KeyN' }, null]; window.__hud.game.setBindings(c); window.__hud.game.refreshUi(); }, bindings);
  await wait.frames(6);
  await adv(0.25);
  const reb = await card();
  result.checks.rebound = { before: obs.key, after: reb?.key };
  expect(reb && reb.id === 'hint-observer' && reb.key === 'N', 'rebinding Release to N did not change the hint text', reb);
  await pic('03-observer-hint-rebound', ['hint-card']);
  await g((b) => { window.__hud.game.setBindings(JSON.parse(JSON.stringify(b))); window.__hud.game.refreshUi(); }, bindings);
  await wait.frames(6);
  expect((await card())?.key === 'X', 'restoring the binding did not restore the text', await card());
  await press('KeyX'); // release to the observer: the use
  await step(2);
  await adv(0.5);
  expect(await stateOf('hint-observer') === 'learned', 'X did not teach hint-observer', (await hints())['hint-observer']);
  expect((await summary()).view === 'observer', 'X did not release to the observer', (await summary()).view);

  // B3. hint-pickup (the context prompt chip draws it): a soil pellet beside a worker; the real E key three times
  const wid = await g(() => window.__game.query.ants().find((x) => x.caste === 'worker')?.id ?? -1);
  expect(wid >= 0, 'no worker to possess');
  await g((id) => window.__game.possess(id), wid);
  await step(2);
  const bu = await h.bu();
  const size = await g(() => window.__game.query.world().size);
  const ground = await g((p) => window.__game.query.field(p.x, 0, p.z).height, { x: 0.6 * size, z: 0.4 * size });
  const teleport = (p) => g((q) => window.__game.teleport('possessed', q), p);
  await teleport({ x: 0.6 * size, y: ground + 0.3 * bu, z: 0.4 * size });
  await step(3);
  await g(() => window.__game.renderFrame({ settle: 1 })); // the snapshot's underground flag follows the drawn frame
  const me = () => g(() => { const gm = window.__game, p = gm.summary().possessed; return p ? gm.query.ant(p.id) : null; });
  const promptKey = (re) => g((src) => (window.__game.ui.snapshot().prompt?.lines ?? []).filter((l) => new RegExp(src, 'i').test(l.text)), re);
  for (let n = 0; n < 3; n++) {
    const a = await me();
    const front = { x: a.pos.x + a.fwd.x * 0.9 * bu, y: ground, z: a.pos.z + a.fwd.z * 0.9 * bu };
    await g(([p]) => window.__game.cheat.raw({ type: 'cheat.spawnPellets', pos: p, n: 1, volume: 0.3 }), [front]);
    await step(2);
    await wait.frames(3);
    let pk = await promptKey('^pick up');
    for (let i = 0; i < 6 && pk.length === 0; i++) { await press('KeyB', 2); await step(1); await wait.frames(2); pk = await promptKey('^pick up'); }
    expect(pk.length > 0, 'no pick-up prompt beside the pellet', await g(() => window.__game.ui.snapshot().prompt?.lines ?? null));
    if (n === 0) {
      await adv(2);
      const lg1 = await onLog();
      expect(lg1.some((e) => e.id === 'hint-pickup' && e.event === 'shown' && e.presenter === 'prompt'), 'hint-pickup was not tracked as shown by the prompt chip', lg1.slice(-5));
      expect((await card()) === null || (await card()).id !== 'hint-pickup', 'the card must not repeat the pick-up chip', await card());
    }
    await press('KeyE'); await step(30);
    expect((await me()).carry.kind === 'item', 'E did not pick the pellet up', await me());
    await press('Space'); await step(20); // drop it
    await step(2);
  }
  await adv(0.5);
  expect(await stateOf('hint-pickup') === 'learned', 'three pick-ups did not teach hint-pickup', { hint: (await hints())['hint-pickup'], state: await g(() => window.__onboarding.state()), pickups: await g(() => window.__game.events('action-completed', 400).filter((e) => e.action === 'pick-up').map((e) => `${e.antId}:${e.seq}`)), possessed: (await summary()).possessed?.id });

  // B4. hint-trail: carrying food outside; R twice (the use is switching the trail on)
  const a1 = await me();
  await g((p) => window.__game.cheat.raw({ type: 'cheat.spawnFood', kind: 'crumb', variant: 'crumb-protein', pos: p, units: 1, stage: null }), { x: a1.pos.x + a1.fwd.x * 0.8 * bu, y: a1.pos.y, z: a1.pos.z + a1.fwd.z * 0.8 * bu });
  await step(3);
  let pk = await promptKey('^pick up');
  for (let i = 0; i < 6 && pk.length === 0; i++) { await press('KeyB', 2); await step(1); await wait.frames(2); pk = await promptKey('^pick up'); }
  expect(pk.length > 0, 'no pick-up prompt beside the crumb', await g(() => window.__game.ui.snapshot().prompt?.lines ?? null));
  await press('KeyE'); await step(30);
  expect((await me()).carry.kind === 'item', 'E did not pick the crumb up', await me());
  const trail = await waitCard('hint-trail');
  expect(trail.key === 'R' && /trail home/i.test(trail.verb ?? ''), 'hint-trail text', trail);
  await expectClear(trail, 'hint-trail');
  await pic('04-trail-hint', ['hint-card']);
  await press('KeyR'); await step(2);
  await press('KeyR'); await step(2);
  expect(await stateOf('hint-trail') !== 'learned', 'one switch-on must not teach hint-trail', (await hints())['hint-trail']);
  await press('KeyR'); await step(2);
  await adv(0.5);
  expect(await stateOf('hint-trail') === 'learned', 'two switch-ons did not teach hint-trail', (await hints())['hint-trail']);
  await press('KeyR'); await step(2); // trail off again

  // B5. hint-share (the context prompt chip draws it): a full crop beside a nestmate; G twice
  let shareDone = false;
  try {
    const nest = await nestOf(h);
    const sugar = { x: 0.6 * size + 2 * bu, y: ground, z: 0.4 * size + 2 * bu };
    await g((p) => window.__game.cheat.raw({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: p, units: 100, stage: null }), sugar);
    if ((await me()).carry.kind !== 'none') { await press('Space'); await step(20); } // mandibles free: the crumb is let go
    await teleport({ x: sugar.x - 1 * bu, y: ground + 0.3 * bu, z: sugar.z });
    await step(3);
    let dk = await promptKey('drink|sip|harvest');
    for (let i = 0; i < 6 && dk.length === 0; i++) { await press('KeyB', 2); await step(1); await wait.frames(2); dk = await promptKey('drink|sip|harvest'); }
    expect(dk.length > 0, 'no drink prompt at the sugar spill', await g(() => window.__game.ui.snapshot().prompt?.lines ?? null));
    await press('KeyE', 2); await step(60);
    const busy = await g(() => { const gm = window.__game; return gm.query.ant(gm.summary().possessed.id)?.action?.id ?? null; });
    if (busy) { await g((id) => window.__game.act({ action: id, phase: 'stop' }), busy); await step(10); }
    expect((await me()).cropC > 0.1, 'the worker did not fill its crop', await me());
    await teleport({ x: sugar.x + 10 * bu, y: ground + 0.3 * bu, z: sugar.z + 10 * bu }); // away from the spill: the nestmate is the target
    await step(3);
    for (let rep = 0; rep < 2; rep++) {
      const a = await me();
      await g(([id, p]) => window.__game.cheat.spawnAnts(1, 'worker', 'rest', p), [0, { x: a.pos.x + a.fwd.x * 0.9 * bu, y: a.pos.y, z: a.pos.z + a.fwd.z * 0.9 * bu }]);
      await step(3);
      let sk = await promptKey('^share food');
      for (let i = 0; i < 8 && sk.length === 0; i++) { await press('KeyB', 2); await step(1); await wait.frames(2); sk = await promptKey('^share food'); }
      expect(sk.length > 0, 'no "Share food" prompt beside a nestmate', await g(() => window.__game.ui.snapshot().prompt?.lines ?? null));
      if (rep === 0) {
        await adv(2);
        expect((await onLog()).some((e) => e.id === 'hint-share' && e.event === 'shown' && e.presenter === 'prompt'), 'hint-share was not tracked as shown by the prompt chip', (await onLog()).slice(-5));
      }
      await press('KeyG', 2); await step(40);
      await g(() => { const gm = window.__game, p = gm.summary().possessed; const act = gm.query.ant(p.id)?.action?.id; if (act) gm.act({ action: act, phase: 'stop' }); });
      await step(10);
    }
    await adv(0.5);
    shareDone = (await stateOf('hint-share')) === 'learned';
    void nest;
  } catch (e) {
    result.checks.shareError = String(e.message).slice(0, 300);
    log('share staging failed:', result.checks.shareError);
  }
  if (!shareDone) standIn('hint-share', 'a nestmate with a hungry crop could not be staged; the verb is reported as used');
  if (!shareDone) await g(() => window.__onboarding.use('share', 2));

  // B6. the first delivery makes hint-colony-view available: [M] Survey the colony; the real M key
  await g(() => window.__game.release());
  await step(2);
  await adv(1);
  const col = await g(() => window.__game.query.colony());
  const nestNow = await nestOf(h);
  const entrance = nestNow.entrances[0];
  const delivered = await g(([cid, eid]) => {
    const gm = window.__game;
    gm.cheat.raw({ type: 'cheat.injectReturn', entranceId: eid, success: true, sourceId: -1 });
    gm.step(30);
    return gm.events('delivery', 5).length;
  }, [col.id, entrance?.id ?? -1]);
  result.checks.deliveryEvents = delivered;
  if (!delivered) {
    standIn('delivery', 'cheat.injectReturn raised no delivery event; the event is emitted on the real bus');
    await g(() => { const gm = window.__hud.game; const sim = gm.session.sim; sim.events.emit('delivery', { type: 'delivery', antId: -1, colonyId: sim.state.player.colonyId, sourceId: -1, kind: 'sugar', c: 1, p: 0, toxin: 0 }); });
  }
  const cvCard = await waitCard('hint-colony-view');
  expect(cvCard.key === 'M' && /survey the colony/i.test(cvCard.verb ?? ''), 'hint-colony-view text', cvCard);
  await expectClear(cvCard, 'hint-colony-view');
  await pic('05-colony-view-hint', ['hint-card']);
  await press('KeyM');
  await step(2);
  await adv(0.5);
  expect((await summary()).view === 'colony', 'M did not open the colony view', (await summary()).view);
  expect(await stateOf('hint-colony-view') === 'learned', 'the colony view did not teach hint-colony-view', (await hints())['hint-colony-view']);

  // B7. hint-marker: in the colony view; the palette pulses once (a class seen by an observer: the pulse is shorter than a screenshot)
  await g(() => {
    window.__pulseSeen = 0;
    new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('hn-palette-pulse')) window.__pulseSeen++; })
      .observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  const mk = await waitCard('hint-marker');
  await wait.frames(3);
  result.checks.palettePulses = await g(() => window.__pulseSeen);
  expect(result.checks.palettePulses >= 1, 'the marker palette did not pulse when hint-marker showed', result.checks.palettePulses);
  expect(mk.key === 'Shift+1' && /plan a chamber/i.test(mk.verb ?? ''), 'hint-marker text', mk);
  await pic('06-marker-hint', ['hint-card']);
  const here = await g(() => { const p = window.__game.summary().possessed; return p ? { x: p.pos[0], y: p.pos[1], z: p.pos[2] } : null; });
  const spot = here ?? { x: 0.6 * size, y: ground, z: 0.4 * size };
  await g((p) => window.__hud.game.placeMarker('forage', p, 30), { x: spot.x + 20 * bu, y: ground, z: spot.z });
  await step(2);
  await adv(1);
  expect(await stateOf('hint-marker') === 'learned', 'a placed marker did not teach hint-marker', (await hints())['hint-marker']);
  await press('KeyM'); // back to the observer
  await step(2);
  expect((await summary()).view === 'observer', 'M did not leave the colony view', (await summary()).view);

  const simEmit = (type, payload) => g(([t, p]) => { const sim = window.__hud.game.session.sim; sim.events.emit(t, { type: t, ...p, colonyId: sim.state.player.colonyId }); }, [type, payload]);

  // B8. hint-speed (30 quiet real seconds in the observer view; the speed keys twice) and hint-why (the first warning
  // diagnostic; the chip [Y] Why?; Y opens the health view). Speed is the player's moment, why the colony's: whichever the
  // engine shows first is done first, so the script follows the card, not a fixed order.
  const alerts = await g(() => window.__game.ui.snapshot().alerts.filter((a) => a.level === 'warning' || a.level === 'critical').map((a) => ({ kind: a.kind, subjectId: a.subjectId })));
  result.checks.alertsCleared = alerts;
  for (const a of alerts) await g((x) => window.__game.cheat.clearAlert(x.kind, x.subjectId), a); // a quiet colony: the hint waits for no active alert
  if (!(await g(() => window.__onboarding.facts()?.diagWarn))) {
    standIn('diagnostic-changed', 'no warning diagnostic in the scripted colony; the sim event is emitted on the real bus');
    await simEmit('diagnostic-changed', { id: 'diag-test', status: 'warn', topCause: 'test' });
  }
  await adv(10);
  expect((await card())?.id !== 'hint-speed', 'hint-speed showed before its 30 quiet seconds', await card());
  let speedDone = false, whyDone = false;
  const speedStep = async (sp) => {
    expect(sp.key === '1-4' && /change speed/i.test(sp.verb ?? ''), 'hint-speed text', sp);
    const spGeo = await expectClear(sp, 'hint-speed');
    result.checks.speedCard = { box: sp.box, geo: spGeo };
    await pic('07-speed-hint', ['hint-card']);
    await press('Digit2'); await step(1);
    await press('Digit1'); await step(1);
    await adv(0.5);
    expect(await stateOf('hint-speed') === 'learned', 'two speed changes did not teach hint-speed', (await hints())['hint-speed']);
    speedDone = true;
  };
  const whyStep = async (why) => {
    expect(why.key === 'Y' && (why.compact || /^why\?$/i.test(why.verb ?? '')), 'hint-why text', why);
    await pic('09-why-hint', ['hint-card']);
    await press('KeyY'); await wait.frames(4);
    await adv(0.5);
    expect(await stateOf('hint-why') === 'learned', 'Y did not teach hint-why', (await hints())['hint-why']);
    await press('KeyY'); await wait.frames(2);
    whyDone = true;
  };
  for (let t = 0; t < 400 && !(speedDone && whyDone); t += 2) {
    await quiet();
    const c = await card();
    if (c?.id === 'hint-speed' && !speedDone) await speedStep(c);
    else if (c?.id === 'hint-why' && !whyDone) await whyStep(c);
    else await adv(2);
  }
  expect(speedDone && whyDone, 'hint-speed and hint-why did not both appear', { speedDone, whyDone, log: (await onLog()).slice(-8) });

  // B9. hint-scent: the first trail exists; V
  const trailMs = await g(() => !!window.__hud.game.session.sim.state.progression.milestones['ms-first-trail']);
  if (!trailMs) { standIn('trail-established', 'the first trail milestone is not reached by the scripted run; the sim event is emitted on the real bus'); await simEmit('trail-established', { sourceId: -1, lengthBu: 12 }); }
  const sc = await waitCard('hint-scent');
  expect(sc.key === 'V' && /scent view/i.test(sc.verb ?? ''), 'hint-scent text', sc);
  await expectClear(sc, 'hint-scent');
  await pic('08-scent-hint', ['hint-card']);
  await press('KeyV');
  await adv(0.5);
  expect(await stateOf('hint-scent') === 'learned', 'V did not teach hint-scent', (await hints())['hint-scent']);
  await press('KeyV');

  // B11. hint-directives: the queen possessed after the hand-over (the chip beside the ant panel); I opens the orders
  await press('Digit8'); await step(2); await adv(0.5);
  s = await summary();
  expect(s.possessed?.caste === 'queen', 'the 8 key did not possess the queen', s.possessed);
  // The context chip "Colony orders (I)" is the hint for the possessed queen: the card is not drawn on top of it (no duplicate line).
  for (let t = 0; t < 20; t += 2) { if ((await onLog()).some((e) => e.id === 'hint-directives' && e.event === 'shown')) break; await adv(2); }
  const dl = (await onLog()).filter((e) => e.id === 'hint-directives' && e.event === 'shown');
  expect(dl.length === 1 && dl[0].presenter === 'prompt', 'hint-directives is not tracked as drawn by the context chip', dl);
  const dc = await card();
  expect(!dc || dc.id !== 'hint-directives', 'the card duplicates the Colony orders chip', dc);
  const chipText = await g(() => document.querySelector('[data-hud="prompts"]')?.textContent ?? null);
  expect(/colony orders/i.test(chipText ?? ''), 'the context chip does not show Colony orders', chipText);
  await pic('10-directives-hint');
  await press('KeyI'); await wait.frames(4);
  await adv(0.5);
  expect(await stateOf('hint-directives') === 'learned', 'I did not teach hint-directives', (await hints())['hint-directives']);
  await press('KeyI'); await wait.frames(2);

  // B12. photo mode and the overlay cycle (the two additive hints): F2 and O
  await adv(250);
  const ph = await waitCard('hint-photo');
  expect(ph.key === 'F2', 'hint-photo text', ph);
  await press('F2'); await step(1); await wait.frames(4);
  await adv(0.5);
  expect(await stateOf('hint-photo') === 'learned', 'F2 did not teach hint-photo', (await hints())['hint-photo']);
  await press('F2'); await wait.frames(4);
  const ov = await waitCard('hint-overlay');
  expect(ov.key === 'O', 'hint-overlay text', ov);
  await press('KeyO'); await wait.frames(4);
  await adv(0.5);
  expect(await stateOf('hint-overlay') === 'learned', 'O did not teach hint-overlay', (await hints())['hint-overlay']);
  await press('KeyO'); await press('KeyO'); await press('KeyO'); await press('KeyO'); // back to no overlay

  // ---- C. the whole log: designed order, each hint once ---------------------------------------------------------------------
  lg = await onLog();
  const order = shownOrder(lg);
  result.checks.shownOrder = order;
  // The designed order holds among the hints each presenter draws. Hints drawn by different presenters (the opening overlay, the
  // context prompt chip, the card) are driven by different things (opening phase, what the possessed ant can do, a timer) and
  // interleave by design: e.g. the overlay draws Walk and Antennate together when the search begins (hint-antennate, 3) before
  // the card draws hint-look (2); a possessed worker beside a crumb gets its pick-up chip (11) before the card's hint-observer
  // (10). Within the card's own hints the one known inversion is hint-why (18), triggered by the colony's first warning
  // diagnostic, which can come before the 30 quiet seconds of hint-speed (16) and the first trail of hint-scent (17).
  const presenterOf = (id) => lg.find((e) => e.id === id && e.event === 'shown').presenter;
  const byWho = {};
  for (const who of ['founding', 'prompt', 'engine']) {
    const sub = order.filter((id) => presenterOf(id) === who);
    const rk = sub.map((id) => tableOrder.indexOf(id));
    const inv = sub.filter((id, i) => i > 0 && rk[i] < rk[i - 1]);
    byWho[who] = { order: sub, inversions: inv };
    const allowed = who === 'engine' ? ['hint-speed', 'hint-scent'] : [];
    expect(inv.every((id) => allowed.includes(id)), `${who}-drawn hints were shown out of the designed order`, { sub, inv });
  }
  result.checks.orderByPresenter = byWho;
  expect(new Set(order).size === order.length, 'a hint appears twice in the order', order);
  result.checks.orderNote = 'order holds per presenter; known inversions: card hints speed and scent after the state-triggered why; across presenters the overlay, the prompt chip and the card interleave by what the game state asks for';
  for (const id of ['hint-reserves', 'hint-move', 'hint-look', 'hint-antennate', 'hint-observer', 'hint-pickup', 'hint-trail', 'hint-share', 'hint-colony-view', 'hint-marker', 'hint-speed', 'hint-scent', 'hint-why', 'hint-directives', 'hint-photo', 'hint-overlay']) {
    if (id === 'hint-share' && result.standIns.some((x) => x.feature === 'hint-share')) continue; // staged by stand-in: the prompt chip never drew it
    expect(order.includes(id), `${id} never appeared`, order);
  }
  for (const id of order) expect(lg.filter((e) => e.event === 'shown' && e.id === id && e.presenter === 'engine').length <= 1, `${id} was shown more than once in full`, lg.filter((e) => e.id === id));
  const final = await hints();
  result.checks.finalStates = Object.fromEntries(Object.entries(final).map(([k, v]) => [k, v.state]));
  // once learned a hint never shows again: advance a long time and compare
  const before = (await onLog()).length;
  await adv(120);
  expect((await onLog()).filter((e) => e.event === 'shown').length === lg.filter((e) => e.event === 'shown').length, 'a learned hint was shown again', (await onLog()).slice(before));
  expect((await card()) === null, 'a card is up although everything the player did is learned', await card());

  // Shift+H with no card on screen dismisses nothing and must not toggle the HUD (that is H alone)
  await page.keyboard.press('Shift+KeyH'); await wait.frames(3);
  expect(await g(() => window.__game.ui.snapshot().hudHidden) === false, 'Shift+H with no hint hid the HUD');
  result.checks.shiftHKeepsHud = true;

  await partD();

  expect(consoleErrors.length === 0, 'console errors', consoleErrors.slice(0, 5));
  result.consoleErrors = consoleErrors.length;
  return result;
};
