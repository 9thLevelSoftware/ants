// The opening sequence end to end (task docs/design/tasks/founding.md): the founding queen from the intro card to
// the first workers, through window.__game and the founding flow's hook window.__founding.
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1&quality=test" --script tests/e2e/founding.mjs \
//        --out test-output/founding-e2e --script-timeout 1800000
// Beats (one screenshot each, all looked at): intro card; site read-out; the dug entrance with its mound; the sealed
// chamber with eggs; the time-lapse overlay at three points (eggs, larvae, pupae); the outcome card; the hand-over with
// the first workers at the reopened entrance; a possessed worker; then a second game where the queen dies before
// sealing (failure card, retry). Where a step cannot be done by the player's own actions it records a STAND-IN.
// FOUNDING_SKIP_FAIL=1 skips the failure part while iterating.

const SHAFT_DEPTH_BU = 9; // Lasius D_MIN in open soil is 8 BU
const SHAFT_MAX_BITES = 260;
const SHAFT_SLOPE_DEG = 55;
const ROOM_MAX_ROUNDS = 4;
const SITE_MAX_R_BU = 40;

export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`founding: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const summary = () => g(() => window.__game.summary());
  const view = () => g(() => window.__founding.view());
  const phase = async () => (await view())?.phase ?? null;
  const render = (settle) => g((s) => window.__game.renderFrame(s === undefined ? {} : { settle: s }), settle);
  const step = (n) => g((k) => window.__game.step(k), n);
  const visible = (id) => g((t) => { const e = document.querySelector(`[data-testid="${t}"]`); return !!e && e.getBoundingClientRect().width > 0; }, id);
  const click = (id) => page.click(`[data-testid="${id}"]`);
  const result = { beats: [], standIns: [] };
  const standIn = (feature, detail) => { result.standIns.push({ feature, detail }); log('STAND-IN', feature, '-', detail); };
  const frames = () => g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const beat = async (name, ok) => { await render(0.5); await frames(); await shot(name); result.beats.push(name); expect(ok === undefined || ok, `beat ${name}`); };
  const bu = (await g(() => window.__game.query.world())).bu;

  // --- 1. intro card: the queen on the surface, the plate over the world ----------------------------------------
  let s = await summary();
  expect(s.mode === 'playing', 'not playing after autostart', s.mode);
  expect(await phase() === 'intro-card', 'a new game starts on the intro card', await phase());
  await g(() => window.__game.possess('queen'));
  await step(1);
  await beat('01-intro-card', await visible('founding-intro'));
  await page.keyboard.press('KeyW'); // any key skips the card
  await step(1);
  expect(await phase() === 'dealation', 'the intro card did not close on a key', await phase());
  await step(85); // the wings are shed (8 s), the search begins
  expect(await phase() === 'search', 'dealation did not end in search', await phase());

  // --- 2. find diggable ground near the start and walk there (the start itself may not be diggable) -------------
  const findSite = (o, fromBu, toBu, stepBu) => g(({ o, slope, fromBu, toBu, stepBu }) => {
    const gm = window.__game, bu = gm.query.world().bu, tan = Math.tan((slope * Math.PI) / 180);
    const ground = (x, z) => gm.query.field(x, 0, z).height;
    const clearAbove = (x, z, gy) => [0.3, 1, 2].every((h) => gm.query.dig(x, gy + h * bu, z, bu).prim === null);
    for (let r = fromBu; r <= toBu; r += stepBu) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / stepBu));
      for (let i = 0; i < n; i++) {
        const ph = (i / n) * 2 * Math.PI, sx = o.x + Math.cos(ph) * r * bu, sz = o.z + Math.sin(ph) * r * bu, sy = ground(sx, sz);
        if (!clearAbove(sx, sz, sy) || gm.query.dig(sx, sy - 2 * bu, sz, bu).speed < 0.5) continue;
        for (let a = 0; a < 16; a++) {
          const th = (a / 16) * 2 * Math.PI, hx = Math.cos(th), hz = Math.sin(th);
          let ok = true;
          for (let u = -3; u <= 9 && ok; u += 0.5) {
            const x = sx + hx * u * bu, z = sz + hz * u * bu, gy = ground(x, z);
            if (!clearAbove(x, z, gy)) ok = false;
            if (u >= 0 && ok) {
              const d = gm.query.dig(x, gy - (u * tan + 1) * bu, z, 3 * bu);
              if (d.speed < 0.5 || d.prim !== null) ok = false;
              const deep = gm.query.dig(x, gy - 11 * bu, z, 3 * bu); // the cell at 9-11 BU must be diggable too
              if (deep.speed < 0.5 || deep.prim !== null) ok = false;
            }
          }
          if (ok) return { x: sx, y: sy, z: sz, h: { x: hx, y: 0, z: hz }, rBu: r };
        }
      }
    }
    return null;
  }, { o, slope: SHAFT_SLOPE_DEG, fromBu, toBu, stepBu });
  s = await summary();
  const start = { x: s.possessed.pos[0], y: s.possessed.pos[1], z: s.possessed.pos[2] };
  let site = await findSite(start, 2, SITE_MAX_R_BU, 1);
  if (!site) {
    site = await findSite(start, SITE_MAX_R_BU, 600, 4);
    expect(site, 'no diggable founding site found', start);
    standIn('start placement', `no diggable site within ${SITE_MAX_R_BU} BU of the start: the queen is teleported ${Math.round(site.rBu)} BU (world-population task)`);
    await g((p) => window.__game.teleport('possessed', p), { x: site.x - site.h.x * 2 * bu, y: site.y + 0.5 * bu, z: site.z - site.h.z * 2 * bu });
    await step(5);
  }
  const H = site.h;
  const steerTo = async (gx, gz, tol) => {
    for (let i = 0; i < 600; i++) {
      const p = (await summary()).possessed.pos;
      const dx = gx - p[0], dz = gz - p[2], d = Math.hypot(dx, dz);
      if (d < tol) { await g(() => window.__game.setIntent({})); return true; }
      await g((v) => window.__game.setIntent({ dir: v }), { x: dx / d, y: 0, z: dz / d });
      await step(d > 3 * bu ? 2 : 1);
    }
    await g(() => window.__game.setIntent({}));
    return false;
  };
  const walkDir = async (ticks, v) => { await g((m) => window.__game.setIntent({ dir: m }), v); await step(ticks); await g(() => window.__game.setIntent({})); };
  expect(await steerTo(site.x - H.x * 1.5 * bu, site.z - H.z * 1.5 * bu, 0.8 * bu), 'the queen did not reach the site', site);
  await walkDir(2, H);
  await step(5);
  result.site = { rBu: site.rBu };

  // --- 3. the site read-out: she antennates the ground (T) ---------------------------------------------------------
  await g(() => window.__game.act('sniff'));
  await step(20);
  let v = await view();
  expect(v.site && v.site.active, 'no site read-out after sniffing', v.site);
  result.siteReading = { q: v.site.q, word: v.site.word, factors: v.site.factors.map((f) => `${f.id}:${f.value.toFixed(2)}`) };
  log('site', JSON.stringify(result.siteReading));
  await beat('02-site-readout', await visible('founding-site'));

  // --- 4. dig the shaft with the ramp brush: the first bite starts the founding dig ------------------------------
  s = await summary();
  const mouth = { pos: s.possessed.pos };
  const dig = async (slopeDeg, ticks, h) => g(({ slope, n, h }) => {
    const gm = window.__game, p = gm.summary().possessed;
    if (!p) { gm.possess('queen'); return; }
    const d = 8;
    gm.act({ action: 'dig-bite', target: { kind: 'point', id: -1, pos: { x: p.pos[0] + h.x * d, y: p.pos[1] - Math.tan((slope * Math.PI) / 180) * d, z: p.pos[2] + h.z * d } } });
    gm.step(n);
  }, { slope: slopeDeg, n: ticks, h });
  const depthBu = (p) => (mouth.pos[1] - p[1]) / bu;
  await dig(SHAFT_SLOPE_DEG, 30, H);
  expect(await phase() === 'dig', 'the first bite did not start the dig', await phase());
  // dig until the readiness depth bar is full (the deepest open voxel at D_MIN) and the queen is a little deeper
  let bites = 1, depth = 0, depthBar = 0;
  while (bites < SHAFT_MAX_BITES && (depthBar < 1 || depth < SHAFT_DEPTH_BU - 2)) {
    await dig(SHAFT_SLOPE_DEG, 30, H);
    await walkDir(2, H);
    bites++;
    depth = depthBu((await summary()).possessed.pos);
    depthBar = (await view()).readiness?.depth ?? 0;
  }
  result.shaft = { bites, depthBu: depth, depthBar };
  log('shaft', JSON.stringify(result.shaft));
  expect(depthBar >= 1, 'the shaft did not get deep enough', result.shaft);

  // --- 5. the founding cell: level bites round the shaft's end until the nest module reports it ready -----------
  const rot = (deg) => {
    const c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180);
    return { x: H.x * c - H.z * sn, y: 0, z: H.x * sn + H.z * c };
  };
  // each bite from the room's centre: face the direction, bite level, step back to the centre (the bite's
  // auto-advance carries her into the cut), so the room grows round the shaft's end
  const centre = (await summary()).possessed.pos;
  for (let r = 0; r < ROOM_MAX_ROUNDS && (await phase()) === 'dig'; r++) {
    for (let k = 0; k < 8; k++) {
      if ((await phase()) !== 'dig') break;
      const d = rot(k * 45 + (r % 2) * 22.5);
      await steerTo(centre[0], centre[2], 0.4 * bu);
      await walkDir(1, d);
      for (let b = 0; b < 2; b++) await dig(3, 40, d);
    }
    await step(60);
    v = await view();
    log('readiness', JSON.stringify(v.readiness), 'phase', v.phase);
  }
  if ((await phase()) === 'dig') {
    standIn('cell width', 'the scripted room did not pass the width test; the cell is widened by cheat.carveEllipsoid round the shaft end');
    await g(({ c, bu }) => window.__game.cheat.raw({ type: 'cheat.carveEllipsoid', center: { x: c[0], y: c[1] + 0.2 * bu, z: c[2] }, radii: { x: 2.2 * bu, y: 1.1 * bu, z: 2.4 * bu }, yawDeg: 0 }), { c: centre, bu });
    await steerTo(centre[0], centre[2], 0.4 * bu);
    await step(120);
  }
  v = await view();
  result.readiness = v.readiness;
  expect(v.phase === 'seal', 'the founding cell never became ready', { phase: v.phase, readiness: v.readiness });

  // the dug entrance and its mound from the surface (the observer for one frame, then back to the queen)
  const mounds = await g(() => window.__game.query.mounds());
  result.mound = mounds.map((m) => ({ id: m.id, volume: m.volume }));
  expect(mounds.some((m) => m.volume > 0), 'no founding mound', mounds);
  await g(() => window.__game.release());
  await g(({ m, h, bu }) => window.__game.camera.setPose({ x: m[0] - h.x * 18 * bu, y: m[1] + 12 * bu, z: m[2] - h.z * 18 * bu }, { x: m[0], y: m[1], z: m[2] }), { m: mouth.pos, h: H, bu });
  await beat('03-entrance-mound');
  await g(() => window.__game.possess('queen'));
  await step(2);

  // --- 6. sealing: bites in the throat give pellets (expulsion stops at `ready`); seal-entrance plugs it ------------
  const nest = async () => (await g(() => window.__game.query.nest()))[0];
  const stopDig = async () => { await g(() => window.__game.act({ action: 'dig-bite', phase: 'stop' })); await step(20); };
  await stopDig(); // a held dig repeats until the input is released
  let seals = 0;
  const side = { x: -H.z, y: 0, z: H.x };
  for (let tries = 0; tries < 30 && (await phase()) === 'seal'; tries++) {
    const p = (await summary()).possessed.pos;
    if (depthBu(p) > 2.2) { // climb back up the shaft toward the mouth
      await walkDir(3, { x: -H.x, y: 0, z: -H.z });
      continue;
    }
    // a pellet from the throat's side wall (bites give pellets once the cell is ready), then plug the throat
    await walkDir(1, tries % 2 ? side : { x: -side.x, y: 0, z: -side.z });
    await g(() => window.__game.act({ action: 'dig-bite' }));
    await step(30);
    await stopDig();
    await walkDir(1, { x: -H.x, y: 0, z: -H.z });
    await g(() => window.__game.act('seal-entrance'));
    await step(30);
    seals++;
  }
  result.sealRefusals = await g(() => window.__game.events('action-failed', 12).map((e) => `${e.action}:${e.reason}`));
  log('seal tries', seals, JSON.stringify(result.sealRefusals));
  const goDown = async () => {
    for (let i = 0; i < 40; i++) {
      if (depthBu((await summary()).possessed.pos) >= SHAFT_DEPTH_BU - 1) break;
      await walkDir(3, H);
    }
  };
  if ((await phase()) === 'seal') {
    standIn('seal', `seal-entrance did not close the throat after ${seals} tries; the ramp's mouth is filled by cheat.fillSphere`);
    await goDown();
    const c = Math.cos((SHAFT_SLOPE_DEG * Math.PI) / 180), sn = Math.sin((SHAFT_SLOPE_DEG * Math.PI) / 180);
    for (const u of [0, 1, 2]) {
      const p = { x: mouth.pos[0] + H.x * u * c * bu, y: mouth.pos[1] - u * sn * bu, z: mouth.pos[2] + H.z * u * c * bu };
      await g((q) => window.__game.cheat.raw({ type: 'cheat.fillSphere', pos: q.p, r: q.r, loose: true }), { p, r: 1.8 * bu });
    }
    for (let i = 0; i < 20 && (await phase()) === 'seal'; i++) await step(20);
  }
  expect(await phase() === 'lay', 'not sealed', { phase: await phase(), entrances: (await nest()).entrances });
  result.seal = { seals, entrances: (await nest()).entrances.map((e) => e.status) };
  log('sealed', JSON.stringify(result.seal));

  // --- 7. back down into the cell; the first clutch (lay-egg: a batch of 6 per action) -------------------------------
  await stopDig();
  await goDown();
  for (let b = 0; b < 4; b++) {
    await g(() => window.__game.act('lay-egg'));
    await step(50);
  }
  v = await view();
  result.clutch = v.clutch;
  log('clutch', JSON.stringify(v.clutch));
  if (!v.clutch || v.clutch.eggs === 0) {
    standIn('lay', 'lay-egg refused in the cell; the queen is moved into the registered founding chamber');
    const cell = (await nest()).chambers.find((c) => c.type === 'founding');
    await g((p) => window.__game.teleport('possessed', p), { x: cell.center.x, y: cell.center.y - cell.radii.y * 0.5, z: cell.center.z });
    for (let b = 0; b < 4; b++) { await g(() => window.__game.act('lay-egg')); await step(50); }
    v = await view();
  }
  expect(v.clutch && v.clutch.eggs >= 6, 'no eggs laid', v.clutch);
  await g(() => window.__game.camera.zoom(1.4));
  await beat('04-sealed-chamber-eggs', await visible('founding-clutch'));

  // --- 8. "Tend the brood": the time-lapse, watched in steps, then skipped ----------------------------------------
  await click('founding-tend');
  await step(1);
  expect(await phase() === 'timelapse', 'Tend the brood did not start the time-lapse', await phase());
  const hashAt = async () => g(() => window.__game.stateHash());
  const lapseAt = async (p) => {
    for (let i = 0; i < 400; i++) {
      const t = (await view()).timelapse;
      if (!t || t.progress >= p) return t;
      await step(250);
    }
    return (await view()).timelapse;
  };
  const stages = [];
  let t = await lapseAt(0.05);
  stages.push({ p: t.progress, ...t.counters });
  await beat('05-timelapse-eggs', await visible('founding-lapse'));
  t = await lapseAt(0.4);
  stages.push({ p: t.progress, ...t.counters });
  await beat('06-timelapse-larvae');
  t = await lapseAt(0.6);
  stages.push({ p: t.progress, ...t.counters });
  await beat('07-timelapse-pupae');
  result.lapseStages = stages;
  log('lapse', JSON.stringify(stages));
  expect(stages[0].eggs > 0 && stages[2].pupae > 0, 'the brood stages did not advance', stages);
  await click('founding-skip');
  await step(1);
  v = await view();
  expect(v.phase === 'handover' || v.phase === 'done', 'skip did not end the lapse', v.phase);
  result.outcome = v.outcome;
  result.handoverHash = await hashAt();
  log('outcome', JSON.stringify(v.outcome));
  await beat('08-outcome-card', await visible('founding-outcome'));
  await click('founding-continue');
  await step(1);

  // --- 9. hand-over: the workers reopen the entrance (their own dig behaviour); then a worker is possessed --------
  expect(await visible('founding-handover'), 'no hand-over banner');
  s = await summary();
  result.afterHandover = { workers: s.colony?.workers, speedAllowed: s.speed?.allowed };
  let opened = false;
  for (let i = 0; i < 40 && !opened; i++) {
    await step(500);
    opened = (await nest()).entrances.some((e) => e.status === 'open');
  }
  result.reopened = opened;
  if (!opened) log('the plug was not reopened within 20000 ticks (worker dig behaviour)');
  const e0 = (await nest()).entrances[0];
  await g(() => window.__game.release());
  await g(({ e, bu }) => window.__game.camera.setPose({ x: e.pos.x + 10 * bu, y: e.pos.y + 8 * bu, z: e.pos.z + 10 * bu }, e.pos), { e: e0, bu });
  await beat('09-handover-entrance');
  await g(() => window.__founding.takeWorker());
  await step(2);
  s = await summary();
  result.possessed = s.possessed?.caste;
  expect(s.possessed?.caste === 'worker', 'possessing a worker failed', s.possessed);
  await beat('10-worker-possessed');
  const ui = await g(() => window.__game.ui.snapshot());
  result.speedAllowed = ui.speed.allowed;
  expect(ui.speed.allowed.includes(4), 'speed controls still locked after the hand-over', ui.speed);

  // --- 10. failure and retry: a second game, the queen dies before sealing -----------------------------------------
  if (!process.env.FOUNDING_SKIP_FAIL) {
    await g((seed) => window.__game.newGame({ seed }), s.seed ?? 1);
    await g(() => window.__founding.skipIntro());
    await step(90);
    await g(() => window.__game.possess('queen'));
    await g(() => window.__game.cheat.raw({ type: 'cheat.killQueen', colonyId: window.__game.query.colony().id, cause: 'predation' }));
    await step(10);
    v = await view();
    expect(v.phase === 'failed', 'the queen died but the opening did not fail', v.phase);
    await beat('11-failed', await visible('founding-failed'));
    await click('founding-retry');
    await page.waitForFunction(() => window.__founding.view()?.phase === 'search', null, { timeout: 60_000 });
    v = await view();
    result.retry = { phase: v.phase, attempt: v.attempt, retriesLeft: v.retriesLeft };
    expect(v.attempt === 2, 'retry did not start attempt 2', result.retry);
    await beat('12-retry-search');
  }
  log('result', JSON.stringify(result));
  return result;
};
