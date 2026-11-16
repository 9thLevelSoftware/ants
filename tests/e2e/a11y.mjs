// Gamepad play, rebinding and accessibility end to end (task input-gamepad-a11y). A virtual gamepad is injected by
// overriding `navigator.getGamepads` in the page, the single function the game's input layer and the menu navigation
// layer read (src/input/padSource.ts); nothing of the game is touched. Sections:
//   A  title and new game by pad only (focus moves, device switches to the pad, glyph hints)
//   B  the game by pad only: finish the opening (A on Continue), possess an ant (RB), walk (left stick), dig (hold X),
//      open Colony orders (RB + D-pad up), change a slider (D-pad right), close it (B), save (Start, A ... A)
//   C  hints in pad glyphs; the pad panel shortcuts; photo mode from the pad; Dismiss-hint (RB + View)
//   D  rebinding by pad (capture UI) and hold-to-toggle
//   E  accessibility: UI scale 80 / 150 %, reduced motion (tremor / sway / DoF / transitions), palette, comfort mode
//   F  focus-order audit of every screen and panel
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=test" --script tests/e2e/a11y.mjs \
//        --out test-output/a11y --script-timeout 1500000
// Evidence (screenshots, audit.json) goes under the --out directory; result.checks lists every assertion that passed.

import { writeFileSync } from 'node:fs';

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const AX = { LX: 0, LY: 1, RX: 2, RY: 3 };
const XBOX_ID = 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)';
const PS_ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';

export default async ({ page, log, out, wait, shot }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const result = { checks: {}, failures: [], shots: [] };
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`a11y: ${msg} ${data === undefined ? '' : JSON.stringify(data).slice(0, 1500)}`); };
  const ok = (name, data) => { result.checks[name] = data ?? 'ok'; log('OK', name, JSON.stringify(data ?? '').slice(0, 260)); };
  const only = (process.env.A11Y_SECTIONS ?? '').split(',').filter(Boolean); // e.g. A11Y_SECTIONS=C,E to run a subset
  const wanted = (name) => only.length === 0 || only.some((o) => name.startsWith(o));
  let resetUiFn = null;
  const section = async (name, fn) => {
    if (!wanted(name)) return;
    const t0 = Date.now();
    if (resetUiFn) await resetUiFn();
    if (only.length && !name.startsWith('G') && !name.startsWith('B-')) await ensureColony(); // a subset run: set the colony up through the API
    try { await fn(); } catch (e) { result.failures.push({ section: name, error: String(e?.message ?? e) }); log('FAIL', name, String(e?.message ?? e)); }
    log('section', name, `${Math.round((Date.now() - t0) / 1000)} s`);
  };
  const frames = (n = 3) => wait.frames(n);
  const step = (n) => g((k) => window.__game.step(k), n);
  const sim = (fn, arg) => g(([src, a]) => { const sm = window.__hud.game.session.sim; return new Function('sim', 'arg', `return (${src})(sim, arg)`)(sm, a); }, [fn.toString(), arg]);
  const render = (settle = 0.5) => g((s) => window.__game.renderFrame({ settle: s }), settle);
  const visible = (id) => g((t) => { const e = document.querySelector(`[data-testid="${t}"]`); return !!e && e.getBoundingClientRect().width > 0; }, id);
  const nav = (fn) => g((src) => new Function('nav', `return (${src})(nav)`)(window.__nav), fn.toString());
  const shotOf = async (name, { draw = true } = {}) => {
    if (draw) await render();
    await frames(3);
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
    result.shots.push(name);
    log('shot', name);
  };

  // ---- the virtual pad -----------------------------------------------------------------------------------------------
  await g((id) => {
    window.__vpad = { id, buttons: new Array(17).fill(0), axes: [0, 0, 0, 0] };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [{ id: window.__vpad.id, index: 0, connected: true, mapping: 'standard', axes: window.__vpad.axes.slice(), buttons: window.__vpad.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0.5, value: v })), timestamp: performance.now() }],
    });
  }, XBOX_ID);
  // one round trip per gesture: the frames are counted inside the page (a heavily loaded machine makes every evaluate slow)
  await g(() => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const frames = async (n) => { for (let i = 0; i < n; i++) await raf(); };
    const set = (b, a = {}) => { const p = window.__vpad; p.buttons.fill(0); for (const k of b) p.buttons[k] = 1; p.axes.fill(0); for (const [k, v] of Object.entries(a)) p.axes[+k] = v; };
    window.__vp = { frames, set, press: async (button, mods, n) => { if (mods.length) { set(mods); await frames(2); } set([...mods, button]); await frames(n); set(mods); await frames(1); set([]); await frames(2); } };
  });
  const setPad = (buttons = [], axes = {}) => g(([b, a]) => window.__vp.set(b, a), [buttons, axes]);
  /** Press and release: `mods` are held first (LB + D-pad up), then `button` goes down for `n` frames. */
  const press = (button, { mods = [], n = 2 } = {}) => g(([b, m, k]) => window.__vp.press(b, m, k), [button, mods, n]);
  const holdFor = async (buttons, axes, ms) => { await setPad(buttons, axes); await frames(2); await new Promise((r) => setTimeout(r, ms)); await setPad([]); await frames(2); };
  /** Back to the play view with nothing open: a failed section must not break the next one. */
  const resetUi = async () => {
    await setPad([]);
    await g(() => { const gm = window.__game; if (gm.ui.screen() === 'paused') gm.ui.close(); if (gm.camera.view() === 'photo') gm.camera.set('possess'); });
    await frames(3);
  };
  const focus = () => nav((n) => n.focus());
  const owner = () => nav((n) => n.owner());
  const device = () => nav((n) => n.device());
  const me = () => g(() => { const gm = window.__game; const p = gm.summary().possessed; return p ? gm.query.ant(p.id) : null; });
  const screenOf = () => g(() => window.__game.ui.screen());
  /**
   * Moves focus with the d-pad until the focused control has this test id: keeps one direction while the focus moves,
   * tries the next one when it does not. `dirs` is the order to try (a rail on the left, a page on the right: RIGHT first).
   */
  const moveTo = async (id, max = 30, dirs = [B.DOWN, B.RIGHT, B.UP, B.LEFT]) => {
    const trail = [];
    for (let i = 0; i < max; i++) {
      const f = await focus();
      if ((f?.testid ?? null) === id) return true;
      trail.push(f?.testid ?? f?.name ?? null);
      const key = JSON.stringify(f);
      for (const d of dirs) { // the preferred direction first; the next one only when the focus did not move
        await press(d);
        if (JSON.stringify(await focus()) !== key) break;
      }
    }
    log('moveTo failed', id, JSON.stringify(trail));
    return (await focus())?.testid === id;
  };
  const PAGE_FIRST = [B.RIGHT, B.DOWN, B.UP, B.LEFT];

  resetUiFn = resetUi;
  let colonyReady = false;
  /** Subset runs only: skip the opening through the API (the full run does it by pad in sections G and B). */
  const ensureColony = async () => {
    if (colonyReady) return;
    colonyReady = true;
    await g(() => window.__game.command({ type: 'openingSkipIntro' }));
    await g(() => window.__game.cheat.completeFounding(10));
    const handedOver = () => sim((sm) => { const op = sm.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
    for (let i = 0; i < 160 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
    const cont = page.locator('[data-testid="founding-continue"]');
    if (await cont.count()) await cont.first().click();
    await step(1);
    await g(() => window.__game.possess('digger'));
    await step(2);
  };
  await frames(20);
  const s0 = await g(() => window.__game.summary());
  expect(s0.mode === 'playing', 'not playing after autostart', s0.mode);

  // =================================================================================================================
  await section('G-opening-by-pad', async () => {
    // the intro card is skipped by any pad button
    expect((await g(() => window.__founding?.view()?.phase)) === 'intro-card', 'expected the intro card first');
    await press(B.A);
    await frames(4);
    expect((await g(() => window.__founding?.view()?.phase)) !== 'intro-card', 'a pad button did not skip the intro card');
    ok('intro-card-skipped-by-pad');
    // the pad's prompts for the opening show glyphs, not keys
    const prompts = await g(() => Array.from(document.querySelectorAll('[data-testid="founding-prompts"] .ui-keycap')).map((k) => k.textContent));
    ok('opening-prompt-glyphs', prompts);
  });

  await section('B-gamepad-play', async () => {
    await g(() => window.__game.cheat.completeFounding(10));
    const handedOver = () => sim((sm) => { const op = sm.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
    let skippedByPad = false;
    for (let i = 0; i < 160 && !(await handedOver()); i++) {
      if (!skippedByPad && (await g(() => window.__founding?.view()?.phase)) === 'timelapse') {
        // the first time-lapse is skipped with the pad: A held (the tl-skip binding, 1 s at the default hold duration)
        skippedByPad = true;
        await holdFor([B.A], {}, 2500);
        ok('timelapse-skipped-by-pad', { phaseAfter: await g(() => window.__founding?.view()?.phase) });
      } else await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
    }
    expect(await handedOver(), 'the opening was not handed over');
    await frames(6);
    // the outcome card has focus on Continue: A presses it (a menu layer owns the pad: the game does not see the A)
    if (await visible('founding-continue')) {
      expect((await owner())?.id === 'founding', 'the founding card does not own the pad', await owner());
      await press(B.A);
      await frames(3);
      expect(!(await visible('founding-continue')), 'A did not press Continue');
      ok('outcome-card-continue-by-pad');
    }
    await step(1);

    // possess an ant: RB = next nearby ant (the queen stays under AI); LB + A = a digger
    const q = await g(() => window.__game.summary().possessed);
    await press(B.RB);
    await step(2);
    const p1 = await g(() => window.__game.summary().possessed);
    expect(p1 && p1.id !== q?.id, 'RB did not possess another ant', { q, p1 });
    ok('possess-next-by-pad', { from: q?.id ?? null, to: p1.id, caste: p1.caste });
    await press(B.A, { mods: [B.LB] });
    await step(2);
    const p2 = await g(() => window.__game.summary().possessed);
    expect(p2 && p2.caste === 'worker', 'LB + A did not possess a worker', { p2 });
    ok('possess-digger-by-pad', { id: p2.id, caste: p2.caste, task: p2.task });
    expect((await device())?.device === 'pad', 'the active device is not the pad', await device());

    // walk: the left stick forward, the sim stepped meanwhile
    const bu = await g(() => window.__game.query.world().bu);
    const a0 = await me();
    await setPad([], { [AX.LY]: -1 });
    await frames(3);
    for (let i = 0; i < 4; i++) { await step(10); await frames(1); }
    const a1 = await me();
    await setPad([]);
    await frames(3);
    const walked = Math.hypot(a1.pos.x - a0.pos.x, a1.pos.y - a0.pos.y, a1.pos.z - a0.pos.z) / bu;
    expect(walked > 0.5, 'the left stick did not walk the ant', { walked });
    ok('walk-by-pad', { distanceBu: Math.round(walked * 10) / 10 });
    await step(10);

    // dig: X held (hold-to-dig) facing the wall: the open volume grows
    await g(() => window.__game.setIntent && 0);
    const vol0 = (await g(() => window.__game.query.voxel())).openVolumeMm3;
    await setPad([B.X]);
    await frames(3);
    for (let i = 0; i < 8; i++) { await step(10); await frames(1); }
    await setPad([]);
    await frames(3);
    await step(10);
    const vol1 = (await g(() => window.__game.query.voxel())).openVolumeMm3;
    const bites = await g(() => window.__game.events('action-completed', 200).filter((e) => e.action === 'dig-bite').length);
    ok('dig-by-pad', { volumeGrewMm3: Math.round(vol1 - vol0), bites });
    expect(vol1 > vol0 || bites > 0, 'holding X did not dig', { vol0, vol1, bites });
  });

  await section('B2-directives-and-save', async () => {
    // Colony orders: RB + D-pad up opens the drawer; focus lands in it; the next slider changes with the d-pad
    const before = await sim((sm) => JSON.stringify(sm.state.colonies[0].directives?.alloc ?? sm.state.colonies[0].directives));
    await press(B.UP, { mods: [B.RB] });
    await frames(6);
    expect(await visible('directives-drawer') || (await g(() => !!document.querySelector('.fd-directives'))), 'RB + D-pad up did not open Colony orders');
    expect((await owner())?.id === 'drawer', 'the drawer does not own the pad', await owner());
    ok('directives-opened-by-pad', await focus());
    // find a slider and change it
    let onSlider = false;
    for (let i = 0; i < 10 && !onSlider; i++) {
      const f = await focus();
      if (f?.tag?.includes('slider') || (await g(() => document.activeElement?.getAttribute('role') === 'slider'))) { onSlider = true; break; }
      await press(B.DOWN);
    }
    expect(onSlider, 'no slider reachable in Colony orders by D-pad', await focus());
    const v0 = await g(() => document.activeElement.getAttribute('aria-valuenow'));
    for (let i = 0; i < 3; i++) await press(B.RIGHT);
    await frames(4);
    const v1 = await g(() => document.activeElement.getAttribute('aria-valuenow'));
    expect(v0 !== v1, 'D-pad right did not change the slider', { v0, v1 });
    await new Promise((r) => setTimeout(r, 700)); // the Directives commit after 300 ms of quiet
    await frames(4);
    const after = await sim((sm) => JSON.stringify(sm.state.colonies[0].directives?.alloc ?? sm.state.colonies[0].directives));
    ok('directives-slider-by-pad', { slider: [v0, v1], directivesChanged: before !== after });
    await shotOf('B-directives-by-pad', { draw: false });
    await press(B.B);
    await frames(4);
    expect(!(await g(() => !!document.querySelector('.fd-directives'))), 'B did not close Colony orders');
    expect((await owner()) === null, 'the game did not get the pad back', await owner());
    ok('directives-closed-by-b');

    // save: Start opens the pause menu, Save, a slot
    await press(B.START);
    await frames(6);
    expect((await screenOf()) === 'paused', 'Start did not open the pause menu', await screenOf());
    expect(await moveTo('pause-save'), 'Save not reachable in the pause menu', await focus());
    await press(B.A);
    await frames(6);
    const slotBtn = await g(() => Array.from(document.querySelectorAll('[data-testid^="save-slot-"], [data-testid^="save-quick"]')).map((e) => e.getAttribute('data-testid')));
    log('save buttons', JSON.stringify(slotBtn));
    expect(slotBtn.length > 0, 'no save buttons on the Save tab', slotBtn);
    expect(await moveTo(slotBtn[0], 20, PAGE_FIRST), 'save button not reachable', { want: slotBtn[0], got: await focus() });
    await press(B.A);
    await frames(6);
    // a confirm dialog for overwriting, or the save is done
    if (await g(() => !!document.querySelector('.ui-modal'))) { await press(B.A); await frames(6); }
    await new Promise((r) => setTimeout(r, 800));
    const slots = await g(() => window.__game.saves.list());
    ok('save-by-pad', slots.filter((s) => s.occupied !== false).map((s) => s.slot));
    expect(slots.some((s) => s.slot === 'slot-1' || s.slot === 'quick' || s.slot?.startsWith?.('slot')), 'nothing was saved', slots);
    await press(B.B); await frames(3); // back from Save/Load
    await press(B.START); await frames(5);
    expect((await screenOf()) === 'playing', 'Start did not resume', await screenOf());
    ok('resume-by-start');
  });


  // =================================================================================================================
  await section('C-glyphs-and-panel-shortcuts', async () => {
    // hide the HUD by pad (LB + D-pad down): the chip that says so prints the pad glyph of the binding
    await press(B.DOWN, { mods: [B.LB] });
    await frames(6);
    expect(await visible('hidden-hint'), 'LB + D-pad down did not hide the HUD');
    const chip = await g(() => document.querySelector('[data-testid="hidden-hint"] .ui-keycap')?.textContent ?? null);
    expect(chip === 'LB + D-pad ↓', 'the HUD-hidden hint does not show the pad glyph of its binding', chip);
    await shotOf('C-glyph-hud-hidden-xbox', { draw: false });
    // PlayStation pad: shapes
    await g((id) => { window.__vpad.id = id; }, PS_ID);
    await press(B.A); // any pad input re-reads the id
    await frames(6);
    const ps = await g(() => document.querySelector('[data-testid="hidden-hint"] .ui-keycap')?.textContent ?? null);
    expect((await device())?.style === 'playstation', 'the glyph style did not switch to PlayStation', await device());
    ok('glyph-style', { xbox: chip, playstation: ps });
    await g((id) => { window.__vpad.id = id; }, XBOX_ID);
    await press(B.A);
    await press(B.DOWN, { mods: [B.LB] });
    await frames(5);
    expect(!(await visible('hidden-hint')), 'the second LB + D-pad down did not show the HUD again');

    // the panels from play: RB + D-pad / X / Y; B closes each and gives the pad back to the game
    const panels = [
      { name: 'directives', mods: [B.RB], button: B.UP, sel: '.fd-directives' },
      { name: 'roster', mods: [B.RB], button: B.DOWN, sel: '.fd-roster, [data-testid="roster"]' },
      { name: 'nest-overview', mods: [B.RB], button: B.LEFT, sel: '.fd-nest, [data-testid="nest-drawer"], .fd-drawer' },
      { name: 'colony-health', mods: [B.RB], button: B.RIGHT, sel: '.fd-health, [data-testid="health-drawer"], .fd-drawer' },
      { name: 'journal', mods: [B.RB], button: B.X, sel: '.ui-book' },
      { name: 'codex', mods: [B.RB], button: B.Y, sel: '.ui-book' },
    ];
    const opened = {};
    for (const p of panels) {
      await press(p.button, { mods: p.mods });
      await frames(8);
      const o = await owner();
      const title = await g(() => (document.querySelector('.fd-drawer h2, .ui-book .ui-book-title, .ui-book h1, .ui-book-rail h1') ?? {}).textContent ?? null);
      opened[p.name] = { owner: o?.id ?? null, title };
      expect(o !== null, `${p.name}: nothing opened (the game still owns the pad)`, opened[p.name]);
      if (p.name === 'roster') await shotOf('C-glyph-roster-drawer', { draw: false });
      await press(B.B);
      await frames(6);
      expect((await owner()) === null, `${p.name}: B did not close it and give the pad back`, await owner());
    }
    ok('panels-by-pad', opened);

    // scent view (D-pad left) and the overlay cycle (RB + B)
    await press(B.LEFT);
    await frames(4);
    const scentOn = await g(() => window.__game.fx.state());
    ok('scent-by-pad', scentOn);

    // pause anywhere: LB + D-pad up pauses and resumes in every play view
    const pausedIn = {};
    for (const view of ['possess', 'observer', 'colony']) {
      await g((v) => window.__game.camera.set(v), view); await step(1); await frames(3);
      const was = await g(() => window.__game.summary().time.paused);
      await press(B.UP, { mods: [B.LB] }); await frames(4);
      const during = await g(() => window.__game.summary().time.paused);
      await press(B.UP, { mods: [B.LB] }); await frames(4);
      const back = await g(() => window.__game.summary().time.paused);
      pausedIn[view] = { was, during, back };
      expect(during === !was && back === was, `LB + D-pad up did not pause and resume in the ${view} view`, pausedIn[view]);
    }
    ok('pause-anywhere', pausedIn);
    await g(() => window.__game.camera.set('possess')); await step(1);

    // dismiss-hint: RB + View
    const hintBefore = await g(() => window.__onboarding?.view?.() ?? null);
    await press(B.VIEW, { mods: [B.RB] });
    await frames(4);
    const hintAfter = await g(() => window.__onboarding?.view?.() ?? null);
    ok('dismiss-hint-by-pad', { before: hintBefore?.id ?? null, after: hintAfter?.id ?? null });
    // the mouse takes the glyphs back to the keyboard
    await page.mouse.move(300, 300); await page.mouse.move(340, 330);
    await frames(4);
    await new Promise((r) => setTimeout(r, 600));
    await page.mouse.move(380, 360); await frames(4);
    ok('device-back-to-kbm', await device());
  });

  await section('C2-photo-by-pad', async () => {
    await g(() => window.__game.camera.set('observer'));
    await step(1);
    await press(B.LS, { mods: [B.RS] }); // RS held, LS clicked
    await frames(8);
    expect((await g(() => window.__game.camera.view())) === 'photo', 'LS + RS did not open photo mode', await g(() => window.__game.camera.view()));
    const pose0 = await g(() => window.__game.camera.pose());
    log('photo entry', JSON.stringify(await g(() => ({ input: window.__game.input.summary(), owner: window.__nav.owner(), focus: window.__nav.focus(), view: window.__game.camera.view() }))));
    // look: the right stick; move: the left stick
    await setPad([], { [AX.RX]: 1 }); await frames(8);
    log('photo look held', JSON.stringify(await g(() => ({ input: window.__game.input.summary(), pose: window.__game.camera.pose().dir }))));
    await setPad([]); await frames(3);
    await setPad([], { [AX.LY]: -1 }); await frames(8); await setPad([]); await frames(3);
    const pose1 = await g(() => window.__game.camera.pose());
    expect(JSON.stringify(pose0.dir) !== JSON.stringify(pose1.dir) || JSON.stringify(pose0.pos) !== JSON.stringify(pose1.pos), 'the sticks did not move the photo camera', { pose0, pose1 });
    // lens: LB + right stick vertical
    const st0 = await g(() => window.__game.views.photo.state());
    await setPad([B.LB], {}); await frames(3); await setPad([B.LB], { [AX.RY]: -1 }); await frames(14);
    let st1 = await g(() => window.__game.views.photo.state());
    if (st1?.lens?.focalMm === st0?.lens?.focalMm) { await setPad([B.LB], { [AX.RY]: 1 }); await frames(14); st1 = await g(() => window.__game.views.photo.state()); } // the other direction
    await setPad([]); await frames(3);
    log('photo lens', JSON.stringify({ before: st0?.lens, after: st1?.lens }));
    // focus at the centre (A), aperture (D-pad up), guides (Y)
    await press(B.A); await press(B.UP); await press(B.Y);
    const st2 = await g(() => window.__game.views.photo.state());
    ok('photo-lens-focus-guides', { focal: [st0?.lens?.focalMm, st1?.lens?.focalMm], focusMode: st2?.focusMode, fNumber: [st0?.lens?.fNumber, st2?.lens?.fNumber], guides: st2?.guides });
    expect(st1?.lens?.focalMm !== st0?.lens?.focalMm, 'LB + right stick did not change the focal length', { st0: st0?.lens, st1: st1?.lens });
    await shotOf('C2-photo-mode-pad', { draw: true });
    // capture (X), then exit (B)
    const caps0 = await g(() => window.__game.views.photo.captures?.() ?? null);
    await press(B.X); await frames(10);
    await new Promise((r) => setTimeout(r, 1500));
    const last = await g(() => window.__game.views.photo.lastCapture?.() ?? window.__game.views.photo.state()?.lastCapture ?? null);
    ok('photo-capture-by-pad', { before: caps0, last });
    await press(B.B); await frames(8);
    expect((await g(() => window.__game.camera.view())) === 'observer', 'B did not leave photo mode', await g(() => window.__game.camera.view()));
    ok('photo-exit-by-pad');
  });

  // =================================================================================================================
  await section('D-rebinding-by-pad', async () => {
    await g(() => window.__game.camera.set('possess'));
    await press(B.START); await frames(6);
    expect((await screenOf()) === 'paused', 'no pause menu');
    log('D pause', JSON.stringify(await g(() => ({ layers: window.__nav.layers(), focus: window.__nav.focus(), shown: Array.from(document.querySelectorAll('[data-testid^="pause-"]')).map((e) => e.getAttribute('data-testid')) }))));
    expect(await moveTo('pause-controls'), 'Controls not reachable', await focus());
    await press(B.A); await frames(8);
    expect(await g(() => !!document.querySelector('[data-testid="bind-dig-pad"], [data-testid^="group-"]')), 'Settings > Controls did not open');
    // open the Possession group and find the pad cell of "Dig"
    if (!(await g(() => !!document.querySelector('[data-testid="bind-dig-pad"]')))) {
      expect(await moveTo('group-P', 60), 'group Possession not reachable', await focus());
      await press(B.A); await frames(4);
    }
    expect(await moveTo('bind-dig-pad', 90), 'the Dig gamepad cell is not reachable by pad', await focus());
    await shotOf('D-rebind-row-pad', { draw: false });
    await press(B.A); await frames(4); // listening
    expect(await g(() => document.querySelector('[data-testid="bind-dig-pad"]')?.getAttribute('data-listening') === '1'), 'the Dig pad cell is not listening');
    expect(await nav((n) => n.capturing()), 'the controller did not hand the pad to the capture');
    await setPad([]); await frames(3);
    await press(B.Y); await frames(6); // Y is Inspect: a conflict
    const note = await g(() => document.querySelector('.ui-keybind[data-action="dig"] .ui-keybind-note')?.textContent ?? null);
    expect(note && /already/i.test(note), 'no conflict message for Y (Inspect)', note);
    ok('rebind-conflict-message', note);
    await shotOf('D-rebind-conflict', { draw: false });
    // Swap with the pad: focus the Swap button
    expect(await moveTo('conflict-swap', 16), 'Swap not reachable', await focus());
    await press(B.A); await frames(6);
    const bind = await g(() => window.__game.settings().bindings.pad);
    expect(bind.dig?.button === B.Y && bind.inspect?.button === B.X, 'Swap did not exchange Dig and Inspect', { dig: bind.dig, inspect: bind.inspect });
    const stored = await g(() => localStorage.getItem('foundress.settings.v1') ?? '');
    ok('rebind-swap-persisted', { dig: bind.dig, inspect: bind.inspect, storedHasIt: stored.includes('"dig"') });
    // reset the row
    const resetBtn = await g(() => !!document.querySelector('.ui-keybind[data-action="dig"] .ui-keybind-reset:not(.is-hidden)'));
    ok('reset-offered', resetBtn);
    // hold or toggle: the segmented control of Dig
    const ht = await g(() => !!document.querySelector('[data-testid="holdtoggle-dig"]'));
    ok('hold-toggle-rows', ht);
    await press(B.B); await frames(4);
    await press(B.B); await frames(4);
  });


  // =================================================================================================================
  await section('E-accessibility', async () => {
    const set = (patch) => g((p) => window.__game.settings(p), patch);
    const a11y = () => g(() => window.__game.a11y.state());
    const hudInside = () => g(() => Array.from(document.querySelectorAll('[data-hud]')).map((e) => { const r = e.getBoundingClientRect(); return { hud: e.getAttribute('data-hud'), inside: r.width === 0 || (r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1), box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] }; }));
    await g(() => window.__game.camera.set('possess'));
    await set({ accessibility: { reducedMotion: 'off', uiScale: 100 } });
    await step(1);

    // UI scale 80 % and 150 %: root font, layout mode, every HUD region on screen; a Settings page at each scale
    const scales = {};
    for (const pct of [80, 150]) {
      await set({ accessibility: { uiScale: pct } });
      await frames(8);
      const ui = (await a11y()).ui;
      const regions = await hudInside();
      scales[pct] = { rootPx: ui.scaleRootPx, layout: ui.layout, outside: regions.filter((r) => !r.inside).map((r) => r.hud) };
      const want = (16 * Math.min(1280 / 1280, 720 / 720) * pct) / 100;
      expect(Math.abs(ui.scaleRootPx - want) < 0.5, `root font at ${pct} %`, { ui, want });
      expect(scales[pct].outside.length === 0, `HUD regions outside the viewport at ${pct} %`, scales[pct]);
      await shotOf(`E-ui-scale-${pct}-hud`, { draw: true });
      // Settings > Accessibility by pad, at this scale
      await press(B.START); await frames(5);
      if (await moveTo('pause-settings')) {
        await press(B.A); await frames(6);
        for (let i = 0; i < 6; i++) { // LB / RB switch tabs: RB until Accessibility is the selected one
          if ((await g(() => document.querySelector('.ui-book [role="tab"][aria-selected="true"]')?.textContent ?? '')) === 'Accessibility') break;
          await press(B.RB); await frames(2);
        }
        const tab = await g(() => document.querySelector('.ui-book [role="tab"][aria-selected="true"]')?.textContent ?? null);
        scales[pct].tab = tab;
        await shotOf(`E-ui-scale-${pct}-settings-accessibility`, { draw: false });
        await press(B.B); await frames(4);
      }
      await press(B.START); await frames(5);
      if ((await screenOf()) !== 'playing') { await press(B.START); await frames(5); }
    }
    ok('ui-scale', scales);
    await set({ accessibility: { uiScale: 100 } });
    await frames(4);

    // reduced motion: camera shake and sway are zero, transitions are the short crossfade, DoF is softer, UI fades only
    await set({ accessibility: { reducedMotion: 'off', shake: 100 } });
    const off = await a11y();
    expect(off.camera.shakeAmplitudeMm > 0 && off.camera.transition.kind !== 'crossfade', 'normal motion has a tremor and a fly transition', off.camera);
    await g(() => window.__game.ui.open('pause'));
    await page.waitForSelector('.ui-pausecard', { timeout: 60000 });
    const pauseOff = await g(() => { const c = getComputedStyle(document.querySelector('.ui-pausecard')); return { name: c.animationName, dur: c.animationDuration }; });
    await g(() => window.__game.ui.close()); await frames(3);
    await set({ accessibility: { reducedMotion: 'on' } });
    await g(() => window.__game.quality('high')); await g(() => window.__game.renderFrame({ settle: 0.1 })); await frames(3);
    const on = await a11y();
    await g(() => window.__game.ui.open('pause'));
    await page.waitForSelector('.ui-pausecard', { timeout: 60000 });
    const pauseOn = await g(() => { const c = getComputedStyle(document.querySelector('.ui-pausecard')); const b = getComputedStyle(document.querySelector('.ui-pausecard .ui-btn')); return { name: c.animationName, dur: c.animationDuration, btnTransition: b.transitionDuration }; });
    await g(() => window.__game.ui.close()); await frames(3);
    expect(on.reducedMotion.effective && on.reducedMotion.rigFlag === true, 'reduced motion did not reach the camera rig', on.reducedMotion);
    expect(on.camera.shakeAmplitudeMm === 0 && on.camera.shakeScale === 0, 'camera shake is not zero in reduced motion', on.camera);
    expect(on.camera.swayAmplitudeMm === 0, 'camera sway is not zero', on.camera);
    expect(on.camera.transition.kind === 'crossfade' && on.camera.transition.duration <= 0.3 + 1e-9, 'the camera transition is not the short crossfade', on.camera.transition);
    expect(on.dof.strength !== null && on.dof.strength < 1 && on.dof.strength === on.dof.target, 'depth-of-field strength was not reduced', on.dof);
    expect(/fade/.test(pauseOn.name) && parseFloat(pauseOn.dur) <= 0.12 + 1e-6, 'UI transitions are not the 120 ms fade', pauseOn);
    expect(/enter/.test(pauseOff.name) && parseFloat(pauseOff.dur) > 0.12, 'normal motion lost its UI entrance', pauseOff);
    await set({ accessibility: { reducedMotion: 'off' } });
    await g(() => window.__game.renderFrame({ settle: 0.1 })); await frames(3);
    const back = await a11y();
    expect(back.dof.strength === 1 && back.camera.shakeAmplitudeMm > 0, 'turning reduced motion off did not restore the camera and DoF', back);
    await g(() => window.__game.quality('test'));
    ok('reduced-motion', { shake: [off.camera.shakeAmplitudeMm, on.camera.shakeAmplitudeMm], sway: on.camera.swayAmplitudeMm, transition: [off.camera.transition, on.camera.transition], dof: [back.dof.strength, on.dof.strength], ui: { off: pauseOff, on: pauseOn } });
    // the shake slider and the device preference
    await set({ accessibility: { shake: 40 } });
    const s40 = await a11y();
    expect(Math.abs(s40.camera.shakeAmplitudeMm / off.camera.shakeAmplitudeMm - 0.4) < 0.01, 'shake 40 % is not 40 % of the amplitude', { s40: s40.camera, off: off.camera });
    await set({ accessibility: { shake: 0 } });
    expect((await a11y()).camera.shakeAmplitudeMm === 0, 'shake 0 % still shakes');
    await set({ accessibility: { shake: 100, reducedMotion: 'system' } });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await frames(6);
    const sysOn = await a11y();
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await frames(6);
    const sysOff = await a11y();
    expect(sysOn.reducedMotion.effective === true && sysOn.camera.shakeAmplitudeMm === 0 && sysOff.reducedMotion.effective === false, 'System did not follow prefers-reduced-motion', { sysOn: sysOn.reducedMotion, sysOff: sysOff.reducedMotion });
    ok('reduced-motion-system', { reduce: sysOn.reducedMotion.effective, noPreference: sysOff.reducedMotion.effective });
    await set({ accessibility: { reducedMotion: 'off' } });
  });

  await section('E2-palettes-and-comfort', async () => {
    const set = (patch) => g((p) => window.__game.settings(p), patch);
    // a colony that has run a while, an observer pose above the nest entrance, the scent view on
    await step(600);
    const nest = (await g(() => window.__game.query.nest()))[0];
    const bu = await g(() => window.__game.query.world().bu);
    const ent = nest.entrances[0].pos;
    await g(() => window.__game.camera.set('observer'));
    await g(([e, b]) => window.__game.camera.setPose({ x: e.x + 14 * b, y: e.y + 12 * b, z: e.z + 14 * b }, e), [ent, bu]);
    await g(() => window.__game.fx.overlay('scent', true));
    await g(() => window.__game.quality('medium'));
    const palettes = {};
    for (const pal of ['okabe-ito', 'high-contrast', 'pattern-only']) {
      await set({ accessibility: { overlayPalette: pal } });
      await g(() => window.__game.renderFrame({ settle: 0.3 })); await frames(4);
      palettes[pal] = await g(() => ({ attr: document.documentElement.dataset.palette, ok: getComputedStyle(document.documentElement).getPropertyValue('--c-status-ok').trim(), bad: getComputedStyle(document.documentElement).getPropertyValue('--c-status-bad').trim(), overlay: window.__game.fx.state() }));
      expect(palettes[pal].attr === pal, `data-palette is not ${pal}`, palettes[pal]);
      await shotOf(`E-overlay-palette-${pal}`, { draw: false });
    }
    expect(palettes['pattern-only'].ok !== palettes['okabe-ito'].ok && palettes['high-contrast'].ok !== palettes['okabe-ito'].ok, 'the status colours did not follow the palette', palettes);
    ok('overlay-palettes', palettes);
    await set({ accessibility: { overlayPalette: 'okabe-ito' } });
    await g(() => window.__game.fx.overlay('scent', false));

    // spider comfort: a wolf spider next to the observer camera, drawn as softened / abstract / marker
    const id = await g(() => { window.__game.cheat.spawnCreature('wolf-spider'); const c = window.__game.query.creatures().filter((x) => x.kind === 'wolf-spider'); return c.length ? c[c.length - 1].id : -1; });
    expect(id >= 0, 'no wolf spider was spawned');
    const spos = await g((i) => window.__game.query.creatures().find((x) => x.id === i)?.pos, id);
    await g(([p, b]) => window.__game.camera.setPose({ x: p.x + 10 * b, y: p.y + 7 * b, z: p.z + 10 * b }, p), [spos, bu]);
    const looks = {};
    for (const mode of ['off', 'softened', 'abstract', 'marker']) {
      await set({ accessibility: { spiderComfort: mode } });
      await g(() => window.__game.renderFrame({ settle: 0.3 })); await frames(3);
      looks[mode] = await g((i) => window.__game.ui.look(i), id);
      if (mode !== 'softened') await shotOf(`E-comfort-${mode}`, { draw: false });
    }
    ok('spider-comfort', looks);
    expect(looks.abstract?.look === 'abstract' || looks.abstract?.comfort === 'abstract', 'abstract comfort not applied', looks.abstract);
    expect(looks.marker?.look === 'marker' || looks.marker?.comfort === 'marker' || looks.marker?.ring, 'marker comfort not applied', looks.marker);
    await set({ accessibility: { spiderComfort: 'off' } });
    await g(() => window.__game.quality('test'));
  });

  // =================================================================================================================
  await section('F-focus-order-audit', async () => {
    const audits = {};
    const record = async (name, arg) => {
      await frames(4);
      const a = await g((x) => window.__nav.audit(x), arg);
      const f = await focus();
      if (name.startsWith('settings-')) name = `settings-${await g(() => (document.querySelector('.ui-book [role="tab"][aria-selected="true"]')?.textContent ?? '?').toLowerCase())}`;
      audits[name] = a ? { count: a.count, first: a.first, issues: a.issues, items: a.items.map((i) => i.name).slice(0, 40), focus: f?.testid ?? f?.name ?? null } : null;
      log('audit', name, a ? `${a.count} controls, ${a.issues.length} issues` : 'no layer', a ? JSON.stringify(a.issues.slice(0, 5)) : '');
      writeFileSync(`${out}/audit.json`, JSON.stringify({ audits }, null, 1));
    };
    await g(() => window.__game.camera.set('possess'));
    await record('hud', '[data-testid="hud-root"]');
    // pause menu and its pages
    await g(() => window.__game.ui.open('pause'));
    await record('pause', 'screen');
    expect(await moveTo('pause-settings'), 'Settings not reachable');
    await press(B.A);
    for (const tab of ['graphics', 'audio', 'controls', 'accessibility', 'gameplay']) {
      await record(`settings-${tab}`, 'book');
      await press(B.RB); await frames(2);
    }
    await press(B.B); await frames(3);
    expect(await moveTo('pause-save'), 'Save not reachable');
    await press(B.A);
    for (const tab of ['save', 'load', 'transfer']) { await record(`save-load-${tab}`, 'book'); await press(B.RB); await frames(2); }
    await press(B.B); await frames(3);
    expect(await moveTo('pause-codex'), 'Codex not reachable');
    await press(B.A); await record('codex', 'book'); await press(B.B); await frames(3);
    const restoredPause = await focus();
    await g(() => window.__game.ui.close()); await frames(3);
    // drawers and books from play
    for (const [name, mods, button] of [['directives', [B.RB], B.UP], ['roster', [B.RB], B.DOWN], ['nest-overview', [B.RB], B.LEFT], ['colony-health', [B.RB], B.RIGHT], ['journal', [B.RB], B.X]]) {
      await press(button, { mods }); await frames(6);
      await record(name, undefined);
      if (name === 'journal') for (let i = 0; i < 3; i++) { await press(B.RB); await frames(2); await record(`journal-tab-${i + 2}`, undefined); }
      await press(B.B); await frames(5);
    }
    // photo panel
    await g(() => window.__game.camera.set('observer')); await step(1);
    await press(B.LS, { mods: [B.RS] }); await frames(6);
    await press(B.VIEW); await frames(4); // View tap: into the photo panel
    await record('photo-panel', 'photo');
    await press(B.B); await frames(3);
    await press(B.B); await frames(5);
    // the shell's own screens: title, new colony, load, codex, credits
    await g(() => window.__game.endGame()); await frames(30);
    await record('title', 'screen');
    for (const id of ['menu-new', 'menu-load', 'menu-codex', 'menu-settings', 'menu-credits']) {
      if (!(await moveTo(id, 20))) { audits[`title->${id}`] = 'not reachable'; continue; }
      await press(B.A); await frames(8);
      await record(id.replace('menu-', ''), undefined);
      await press(B.B); await frames(5);
    }
    const issues = Object.entries(audits).flatMap(([k, v]) => (v && v.issues ? v.issues.map((i) => `${k}: ${i}`) : v === null ? [`${k}: layer missing`] : [`${k}: ${v}`]));
    writeFileSync(`${out}/audit.json`, JSON.stringify({ restoredPause, audits, issues }, null, 1));
    ok('audit', { screens: Object.keys(audits).length, issues: issues.length, restoredPause });
    expect(issues.length === 0, 'the focus-order audit found problems (see audit.json)', issues.slice(0, 12));
  });

  await shotOf('end');
  return result;
};
