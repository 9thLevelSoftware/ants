// Stage 1A gate, application half (task int-1A-app): the running game on the real world, nest and ant renderers.
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1&quality=test" --script tests/e2e/stage1a.mjs \
//        --out test-output/stage1a --script-timeout 1500000
// Flow: a generated world, the founding queen possessed and walking, a dig site chosen clear of plants and stones,
// digging with the action primitive (ramp brush) until the shaft is SHAFT_DEPTH_BU deep, a widened room at its end,
// pellets and a growing spoil mound, an egg, workers drawn and moving, time controls, pause, observer and colony
// views, runtime quality switches (test / low / high) without errors or GPU leaks, frame statistics with 60 workers,
// and two high-quality beauty shots. Every screenshot must be looked at.
//
// Stand-ins: where a Stage 1A simulation feature is missing (the founding flow, chamber / entrance registration of a
// player-dug nest, worker behaviours, pellet hauling) the script uses a cheat or the player instead and records it
// in result.standIns (also logged). STAGE1A_STRICT=1 fails on any stand-in: the gate as written in the task spec.
// STAGE1A_SKIP_HIGH=1 skips the (slow) high-quality part while iterating.

const DAY = 6000; // ticks per game day
const START = 2 * DAY + (7 / 24) * DAY; // calendar tick: day 3, 07:00 (the first digging then happens in daylight)
const NOON = 2 * DAY + DAY / 2;
const SHAFT_DEPTH_BU = 6; // the shaft is done at this depth below its mouth
const SHAFT_MAX_BITES = 90; // fail (with the refusals) if the shaft is not done after this many bites
const SHAFT_SLOPE_DEG = 55;
const ROOM_MIN_BU3 = 12; // the widened end must add at least the sim's smallest chamber (CHAMBER_MIN_VOLUME, BU^3)
const SITE_MAX_R_BU = 30; // dig-site search radius around the nest origin (the queen walks there)
const SITE_FAR_R_BU = 1000; // beyond the walking radius the queen is teleported (a recorded stand-in)
const OPENING_MAX_BITES = 200; // egg step: bites to deepen the shaft to the founding depth (Lasius D_MIN 8 BU)
const OPENING_ROOM_ROUNDS = 4; // egg step: rounds of level bites round the shaft's end until the cell is ready

export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`stage1a: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const summary = () => g(() => window.__game.summary());
  const render = (settle) => g((s) => window.__game.renderFrame(s === undefined ? {} : { settle: s }), settle);
  const step = (n) => g((k) => window.__game.step(k), n);
  const refusals = () => g(() => window.__game.events('action-failed', 4).map((e) => `${e.action}:${e.reason}`));
  const result = { shots: {}, standIns: [] };
  const standIn = (feature, detail, owner) => {
    result.standIns.push({ feature, detail, owner });
    log('STAND-IN', feature, '-', detail, `(needs ${owner})`);
    if (process.env.STAGE1A_STRICT) throw new Error(`stage1a (strict): stand-in needed for ${feature}: ${detail}`);
  };
  const timed = async (name, fn) => { const t0 = Date.now(); const r = await fn(); result.shots[name] = Date.now() - t0; return r; };

  // --- 1. real renderers on a generated world --------------------------------------------------------------------
  const s0 = await summary();
  expect(s0.mode === 'playing', 'not playing after autostart', s0.mode);
  expect(s0.renderers.world === 'world' && s0.renderers.nest === 'nest' && s0.renderers.ants === 'ants', 'real renderers not registered', s0.renderers);
  result.renderers = s0.renderers;
  const q0 = await g(() => window.__game.quality());
  expect(q0.quality === 'test', 'expected the test preset', q0);
  const bu = (await g(() => window.__game.query.world())).bu;

  // a generated world whose founding site has diggable soil within walking distance: the autostarted seed, else the
  // next seeds (worldgen is still changing what a seed holds; a start indoors on a floor slab cannot dig)
  // rings around o, `stepBu` apart; per position a cheap test of the column, then the full test of the ramp along
  // 16 headings: diggable soil along the ramp, no primitive over the approach, the mouth or the ramp
  const findSite = (o, fromBu, toBu, stepBu) => g(({ o, slope, fromBu, toBu, stepBu }) => {
    const gm = window.__game, bu = gm.query.world().bu, tan = Math.tan((slope * Math.PI) / 180);
    const ground = (x, z) => gm.query.field(x, 0, z).height;
    const clearAbove = (x, z, gy) => [0.3, 1, 2].every((h) => gm.query.dig(x, gy + h * bu, z, bu).prim === null);
    for (let r = fromBu; r <= toBu; r += stepBu) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / stepBu));
      for (let i = 0; i < n; i++) {
        const ph = (i / n) * 2 * Math.PI, sx = o.x + Math.cos(ph) * r * bu, sz = o.z + Math.sin(ph) * r * bu, sy = ground(sx, sz);
        if (!clearAbove(sx, sz, sy) || gm.query.dig(sx, sy - 2 * bu, sz, bu).speed < 0.3) continue;
        for (let a = 0; a < 16; a++) {
          const th = (a / 16) * 2 * Math.PI, hx = Math.cos(th), hz = Math.sin(th);
          let ok = true;
          for (let u = -3; u <= 7 && ok; u += 0.5) { // u: BU along the heading from the mouth (negative: the approach)
            const x = sx + hx * u * bu, z = sz + hz * u * bu, gy = ground(x, z);
            if (!clearAbove(x, z, gy)) ok = false;
            if (u >= 0 && ok) {
              const d = gm.query.dig(x, gy - (u * tan + 1) * bu, z, 2.5 * bu); // buried slabs and kerbs: 2.5 BU clear
              if (d.speed < 0.3 || d.prim !== null) ok = false;
            }
          }
          if (ok) return { x: sx, y: sy, z: sz, h: { x: hx, y: 0, z: hz }, rBu: r };
        }
      }
    }
    return null;
  }, { o, slope: SHAFT_SLOPE_DEG, fromBu, toBu, stepBu });
  const originOf = async () => {
    const n = (await g(() => window.__game.query.nest()))[0];
    return n?.origin ?? (await g(() => { const q = window.__game.query.ants().find((a) => a.caste === 'queen'); return q ? q.pos : null; }));
  };
  let origin = await originOf();
  let site = await findSite(origin, 0, SITE_MAX_R_BU, 1);
  result.seed = s0.seed;
  for (const seed of [2, 3, 4, 5, 6, 7, 8].filter((k) => k !== s0.seed)) {
    if (site) break;
    log(`seed ${result.seed}: no dig site within ${SITE_MAX_R_BU} BU of the founding site; trying seed ${seed}`);
    await g((k) => window.__game.newGame({ seed: k }), seed);
    result.seed = seed;
    origin = await originOf();
    site = await findSite(origin, 0, SITE_MAX_R_BU, 1);
  }
  log('world', JSON.stringify({ seed: result.seed, siteRBu: site?.rBu ?? null }));
  await g((t) => window.__game.cheat.setTime(t), START);
  const tick0 = (await summary()).tick - (START - NOON); // the tick at which it was (virtually) noon of day 3
  // noon of the coming day (digging takes game hours): surface shots in daylight
  const toNoon = async () => {
    const t = (await summary()).tick;
    await g((c) => window.__game.cheat.setTime(c), NOON + Math.ceil((t - tick0) / DAY) * DAY);
  };

  // --- 2. the founding queen possessed, upright, walking -----------------------------------------------------------
  await g(() => window.__game.possess('queen'));
  let s = await summary();
  expect(s.possessed?.caste === 'queen' && s.view === 'possess', 'queen not possessed', s.possessed);
  expect(s.possessed.up[1] > 0.7, 'queen not upright at the start', s.possessed.up);
  const walkFrom = s.possessed.pos;
  await g(() => window.__game.setIntent({ move: { x: 0, y: 1 } })); // camera-relative forward
  await step(30);
  await g(() => window.__game.setIntent({}));
  s = await summary();
  result.walkedMm = Math.hypot(...s.possessed.pos.map((v, i) => v - walkFrom[i]));
  expect(result.walkedMm > 1.5 * bu, 'queen did not walk', result.walkedMm);
  const perfStart = await g(() => window.__game.perf());
  expect(perfStart.renderers.world.terrainTriangles > 0, 'world renderer drew no terrain', perfStart.renderers.world);
  await render(1);
  await timed('surface', () => shot('01-surface-third-person'));
  const clear0 = await g(() => window.__game.camera.clearance());
  expect(clear0.f >= clear0.radius * 0.5, 'camera inside solid on the surface', clear0);

  // --- 3. the dig site chosen above (or, failing that, the nearest one, reached by teleport) -----------------------
  if (!site) {
    // the start is far from soil (e.g. indoors on a floor slab): teleport to the nearest site instead of walking
    site = await findSite(origin, SITE_MAX_R_BU, SITE_FAR_R_BU, 4);
    expect(site, `no diggable site clear of primitives within ${SITE_FAR_R_BU} BU of the nest origin`, origin);
    standIn('start placement', `no diggable soil within ${SITE_MAX_R_BU} BU of the start; the queen is teleported ${Math.round(site.rBu)} BU to the nearest site`, 'worldgen / F-int new-game placement');
    await g((p) => window.__game.teleport('possessed', p), { x: site.x - site.h.x * 2 * bu, y: site.y + 0.5 * bu, z: site.z - site.h.z * 2 * bu });
    await step(10);
  }
  const H = site.h;
  // steer to 1.5 BU before the mouth (world-space intent), then face the heading
  const steerTo = async (gx, gz, tol) => {
    for (let i = 0; i < 400; i++) {
      const p = (await summary()).possessed.pos;
      const dx = gx - p[0], dz = gz - p[2], d = Math.hypot(dx, dz);
      if (d < tol) { await g(() => window.__game.setIntent({})); return true; }
      await g((v) => window.__game.setIntent({ dir: v }), { x: dx / d, y: 0, z: dz / d });
      await step(d > 3 * bu ? 2 : 1); // a queen walks about 0.6 BU per tick: single ticks near the goal, no overshoot loop
    }
    await g(() => window.__game.setIntent({}));
    return false;
  };
  const walkDir = async (ticks, v) => { await g((m) => window.__game.setIntent({ dir: m }), v); await step(ticks); await g(() => window.__game.setIntent({})); };
  const reached = await steerTo(site.x - H.x * 1.5 * bu, site.z - H.z * 1.5 * bu, 0.8 * bu);
  expect(reached, 'the queen did not reach the dig site', { site, queen: (await summary()).possessed });
  await walkDir(2, H);
  await step(5);
  s = await summary();
  const mouth = { pos: s.possessed.pos, fwd: [H.x, 0, H.z] };
  result.site = { rBu: site.rBu, mouth: mouth.pos };
  log('dig site', JSON.stringify(result.site));

  // --- 4. dig the shaft with the ramp brush (dig-bite aimed below ahead), stepping into the cut -------------------
  const dig = async (slopeDeg, ticks, h) => g(({ slope, n, h }) => {
    const gm = window.__game, p = gm.summary().possessed;
    if (!p) { gm.possess('queen'); return; }
    const d = 8;
    gm.act({ action: 'dig-bite', target: { kind: 'point', id: -1, pos: { x: p.pos[0] + h.x * d, y: p.pos[1] - Math.tan((slope * Math.PI) / 180) * d, z: p.pos[2] + h.z * d } } });
    gm.step(n);
  }, { slope: slopeDeg, n: ticks, h });
  const depthBu = (p) => (mouth.pos[1] - p[1]) / bu;
  // observer pose `back` BU from the mouth and `up` BU above it, looking at it: behind the shaft if the line of
  // sight is clear of plants and stones, else the nearest clear direction around it (the field sampled along it)
  const poseCache = {};
  const entrancePose = async (up, back) => {
    const key = `${up}:${back}`;
    if (!poseCache[key]) {
      poseCache[key] = await g(({ m, h, up, back }) => {
        const gm = window.__game, bu = gm.query.world().bu, l = { x: m[0], y: m[1], z: m[2] };
        const base = Math.atan2(-h.z, -h.x);
        let best = null;
        for (let k = 0; k < 16 && !best; k++) {
          const th = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
          const a = { x: m[0] + Math.cos(th) * back * bu, y: m[1] + up * bu, z: m[2] + Math.sin(th) * back * bu };
          let clear = true;
          for (let i = 0; i < 48 && clear; i++) { // up to 1 BU before the mouth
            const t = (i / 48) * (1 - bu / Math.hypot(a.x - l.x, a.y - l.y, a.z - l.z));
            if (gm.query.field(a.x + (l.x - a.x) * t, a.y + (l.y - a.y) * t, a.z + (l.z - a.z) * t).f < 0.3 * bu) clear = false;
          }
          if (clear) best = { a, l };
        }
        return best ?? { a: { x: m[0] - h.x * back * bu, y: m[1] + up * bu, z: m[2] - h.z * back * bu }, l };
      }, { m: mouth.pos, h: H, up, back });
    }
    return poseCache[key];
  };
  const open0 = s.nest.openVolumeBu3; // the world starts with natural cavities: everything below is a delta
  let bites = 0, depth = 0, freshShot = false, tunnelShot = false, midShaft = null;
  while (bites < SHAFT_MAX_BITES && depth < SHAFT_DEPTH_BU) {
    await dig(SHAFT_SLOPE_DEG, 60, H);
    await walkDir(2, H);
    bites++;
    s = await summary();
    depth = depthBu(s.possessed.pos);
    if (!midShaft && depth > 2.5) midShaft = { pos: s.possessed.pos, up: s.possessed.up };
    if (!freshShot && depth > 2) { // the fresh entrance from the surface
      freshShot = true;
      await g(() => window.__game.release());
      await g(({ a, l }) => window.__game.camera.setPose(a, l), await entrancePose(14, 22));
      await render(0.5);
      await timed('entranceFresh', () => shot('02a-entrance-fresh'));
      expect((await summary()).camera.underground === false, 'the entrance view should be above ground');
      await g(() => window.__game.possess('queen'));
    }
    if (!tunnelShot && depth > 4) { // well inside the shaft: the possession camera in the tunnel (GDD 01 E12, one frame)
      tunnelShot = true;
      await render(1);
      await timed('tunnel', () => shot('03-inside-tunnel'));
      const c = await g(() => window.__game.camera.clearance());
      expect(c.f >= c.radius * 0.5, 'camera inside solid in the tunnel', c);
      const t = await summary();
      const L = t.possessed.lengthBu * bu, cp = t.camera.pos, ap = t.possessed.pos;
      result.tunnelCamera = { state: t.camera.state, distL: Math.hypot(cp[0] - ap[0], cp[1] - ap[1], cp[2] - ap[2]) / L, clearance: c, underground: t.camera.underground };
      log('tunnel camera', JSON.stringify(result.tunnelCamera));
    }
  }
  s = await summary();
  result.shaft = { bites, depthBu: depth, dugBu3: s.nest.openVolumeBu3 - open0, underground: s.possessed.underground, refusals: await refusals() };
  log('shaft', JSON.stringify(result.shaft));
  expect(depth >= SHAFT_DEPTH_BU, `the shaft did not reach ${SHAFT_DEPTH_BU} BU in ${SHAFT_MAX_BITES} bites`, result.shaft);
  expect(s.possessed.underground, 'the queen is not underground at the end of the shaft', result.shaft);
  expect(result.shaft.dugBu3 > 0.5 * SHAFT_DEPTH_BU, 'the shaft opened (almost) no volume', result.shaft);

  // --- 5. a room at the end of the shaft: level bites in eight directions, twice round -----------------------------
  const rot = (deg) => {
    const c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180);
    return { x: H.x * c - H.z * sn, y: 0, z: H.x * sn + H.z * c };
  };
  const shaftOpen = s.nest.openVolumeBu3;
  for (let r = 0; r < 2; r++) {
    for (const deg of [0, 90, -90, 180, 45, -45, 135, -135]) {
      const d = rot(deg);
      await walkDir(3, d);
      for (let k = 0; k < 2; k++) await dig(5, 60, d);
    }
  }
  await step(100); // chamber detection runs every CHAMBER_DETECT_TICKS on a changed nest
  s = await summary();
  result.room = { dugBu3: s.nest.openVolumeBu3 - shaftOpen, chambers: s.nest.chambers, entrances: s.nest.entrances, depthBu: depthBu(s.possessed.pos) };
  log('room', JSON.stringify(result.room));
  expect(result.room.dugBu3 >= ROOM_MIN_BU3, `the room added less than ${ROOM_MIN_BU3} BU^3 to the shaft`, result.room);
  if (result.room.entrances === 0) standIn('entrance', 'no entrance registered for the dug shaft (its cavity is not in the nest\'s nav component)', 'nestops / founding (1B)');
  if (result.room.chambers === 0) standIn('chamber', 'the widened end is not registered as a chamber', 'nestops / founding (1B)');

  // --- 6. pellets and the spoil mound --------------------------------------------------------------------------------
  // Every bite made a soil pellet; the ones dropped on the surface settle into the spoil mound. Hauling the
  // tunnel's pellets out is the beh-nest task (Stage 1B), so cheat.spawnPellets stands in for the haulers here:
  // pellets dumped at the entrance rim settle (PELLET_SETTLE_S) and the mound must grow and be drawn.
  result.items = await g(() => window.__game.query.items());
  expect((result.items['soil-pellet'] ?? 0) >= 5, 'digging made (almost) no pellets', result.items);
  const moundVol = (list) => list.reduce((v, m) => v + m.volume, 0);
  const mounds0 = await g(() => window.__game.query.mounds());
  const side = { x: -H.z, z: H.x };
  const rim = { x: mouth.pos[0] + side.x * 6 * bu, y: mouth.pos[1], z: mouth.pos[2] + side.z * 6 * bu }; // beside the entrance
  // Haulers (beh-nest, 1B): the founding queen has no workers yet, so six are spawned in the dug room with the haul
  // task (scenario setup, recorded in result.setup); they must carry the tunnel's pellets out to the mound. Only if
  // they do not is the old stand-in used (cheat.spawnPellets beside the entrance; strict mode fails there).
  const inNest = () => g(() => window.__game.query.pellets().underground);
  const qpos = (await summary()).possessed.pos;
  const col = await g(() => window.__game.query.colony()?.id ?? -1);
  const spawned = await g(([c, p]) => window.__game.cheat.raw({ type: 'cheat.spawnAnts', colonyId: c, n: 6, caste: 'worker', ageGd: 5, task: 'haul', pos: p }), [col, { x: qpos[0], y: qpos[1], z: qpos[2] }]);
  (result.setup ??= []).push({ what: '6 hauling workers spawned in the dug room (the founding queen has none)', spawned });
  const pelletsIn0 = await inNest();
  let mounds1 = mounds0;
  for (let k = 0; k < 12 && moundVol(mounds1) <= moundVol(mounds0); k++) { await step(500); mounds1 = await g(() => window.__game.query.mounds()); }
  result.hauling = { pelletsInNest: [pelletsIn0, await inNest()], moundBefore: moundVol(mounds0), moundAfter: moundVol(mounds1) };
  log('hauling', JSON.stringify(result.hauling));
  if (moundVol(mounds1) <= moundVol(mounds0)) {
    standIn('pellet hauling', `no hauler carried a pellet out in 6000 ticks (${JSON.stringify(result.hauling)}); cheat.spawnPellets dumps 100 pellets beside the entrance`, 'beh-nest (1B)');
    for (let k = 0; k < 4; k++) await g((p) => window.__game.cheat.raw({ type: 'cheat.spawnPellets', pos: p, n: 25, volume: 0.85 }), rim);
    await step(3500);
    mounds1 = await g(() => window.__game.query.mounds());
  }
  result.mound = { before: moundVol(mounds0), after: moundVol(mounds1), count: mounds1.length };
  log('pellets', JSON.stringify(result.items), 'mound', JSON.stringify(result.mound));
  expect(result.mound.after > result.mound.before, 'the spoil mound did not grow', result.mound);

  // --- the opening, played for real from the dug shaft (used by the egg step) --------------------------------------
  const opPhase = () => g(() => window.__founding?.view()?.phase ?? null);
  const readiness = () => g(() => window.__founding?.view()?.readiness ?? null);
  // one bite at the face (held digs repeat at their first target: release at once, wait for the bite to finish)
  const bite = async (slopeDeg, h) => g(({ slope, h }) => {
    const gm = window.__game, p = gm.summary().possessed;
    if (!p) { gm.possess('queen'); return; }
    const d = 8;
    gm.act({ action: 'dig-bite', target: { kind: 'point', id: -1, pos: { x: p.pos[0] + h.x * d, y: p.pos[1] - Math.tan((slope * Math.PI) / 180) * d, z: p.pos[2] + h.z * d } } });
    gm.step(2);
    gm.act({ action: 'dig-bite', phase: 'stop' });
    for (let t = 0; t < 60; t += 2) { if (!gm.query.ant(p.id)?.action) break; gm.step(2); }
  }, { slope: slopeDeg, h });
  let cellCentre = null; // the founding cell's centre, where the queen lays (set by playOpeningToLay)
  const playOpeningToLay = async () => {
    const log1 = [];
    if (!(await summary()).possessed) await g(() => window.__game.possess('queen'));
    if ((await opPhase()) === 'intro-card') { await g(() => window.__game.command({ type: 'openingSkipIntro' })); await step(1); }
    for (let t = 0; t < 400 && (await opPhase()) === 'dealation'; t += 20) await step(20);
    log1.push(`after intro: ${await opPhase()}`);
    for (let k = 0; k < 8 && (await opPhase()) === 'search'; k++) { await bite(SHAFT_SLOPE_DEG, H); if ((await opPhase()) === 'search') await walkDir(2, H); }
    log1.push(`after first bite: ${await opPhase()}`);
    // deepen the shaft until the readiness depth bar is full, then widen the end until the cell is ready (seal phase)
    for (let b = 0; b < OPENING_MAX_BITES && (await opPhase()) === 'dig' && ((await readiness())?.depth ?? 0) < 1; b++) {
      await bite(SHAFT_SLOPE_DEG, H);
      await walkDir(3, H);
    }
    log1.push(`depth bar ${JSON.stringify(await readiness())}`);
    const centre = (await summary()).possessed.pos;
    for (let r = 0; r < OPENING_ROOM_ROUNDS && (await opPhase()) === 'dig'; r++) {
      for (let k = 0; k < 8 && (await opPhase()) === 'dig'; k++) {
        const d = rot(k * 45 + (r % 2) * 22.5);
        await steerTo(centre[0], centre[2], 0.4 * bu);
        await walkDir(1, d);
        for (let n = 0; n < 2; n++) await bite(3, d);
      }
      await step(60);
    }
    log1.push(`room: ${await opPhase()} ${JSON.stringify(await readiness())}`);
    if ((await opPhase()) === 'seal') {
      await g(() => window.__game.act({ action: 'dig-bite', phase: 'stop' }));
      await step(20);
      await g(() => window.__game.act('seal-entrance'));
      for (let t = 0; t < 3000 && (await opPhase()) === 'seal'; t += 50) await step(50);
      log1.push(`after seal: ${await opPhase()}`);
    }
    if ((await opPhase()) === 'lay') await steerTo(centre[0], centre[2], 0.6 * bu); // back down into the cell to lay
    cellCentre = centre;
    return log1;
  };
  // after the clutch: Tend the brood starts the time-lapse, skipped (the same ticks), so the opening's speed limits end
  // before the time-control checks below (8x in the observer). The lapse may fail on its own rules: this queen dug
  // the whole 1A shaft and room before her opening began and enters the lapse with almost no reserves; that is the
  // founding model's verdict (founding.mjs plays a full opening to the first workers), recorded in result.egg.lapse.
  const openingState = () => g(() => {
    const op = window.__hud.game.session.sim.state.player.opening;
    return op ? { phase: op.phase, done: !!op.done, outcome: op.lapse?.outcome ?? null, failCause: window.__founding?.view()?.failCause ?? null } : null;
  });
  const finishOpening = async () => {
    const left = (o) => !o || o.done || ['handover', 'done', 'failed'].includes(o.phase);
    if (left(await openingState())) return openingState();
    // Tend the brood: refused while her lay-egg action still runs ('busy'), so ask again a few ticks later
    const tendRefusals = [];
    for (let k = 0; k < 20 && (await openingState())?.phase === 'lay'; k++) {
      const seq = await g(() => { const e = window.__game.events(undefined, 1); return e.length ? e[e.length - 1].seq : 0; });
      await g(() => window.__game.command({ type: 'openingBeginTimelapse' }));
      await step(1);
      tendRefusals.push(...(await g((q) => window.__game.events('command-rejected', 3, q).map((e) => `${e.commandType}:${e.reason}`), seq)));
      if ((await openingState())?.phase === 'lay') await step(20);
    }
    if ((await openingState())?.phase === 'lay') return { ...(await openingState()), left: false, tendRefusals };
    for (let i = 0; i < 200 && !left(await openingState()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
    const cont = page.locator('[data-testid="founding-continue"]');
    if (await cont.count()) await cont.first().click().catch(() => {});
    await step(2);
    const o = await openingState();
    return { ...o, left: left(o), tendRefusals };
  };

  // --- 7. an egg ---------------------------------------------------------------------------------------------------
  // the player colony's brood (summary().brood counts every colony's; seed 1 has a neighbouring colony whose brood changes)
  const ownBrood = () => g(() => window.__game.query.broodList().length);
  const brood0 = await ownBrood();
  await g(() => window.__game.act({ action: 'dig-bite', phase: 'stop' }));
  await step(20);
  if (!(await summary()).possessed) await g(() => window.__game.possess('queen'));
  // A founding queen lays only in the opening's lay phase (GDD 06 §5, claustral founding): asked outside it the game must refuse.
  // That refusal is the rule working, not a stand-in (its reason id is `budget`, the colony's canLay saying no), so it is a check here
  // and the egg itself comes from the real opening below. (app-seams-3 item 4: the strict stand-in message used to quote this refusal.)
  await g(() => window.__game.act('lay-egg'));
  await step(300);
  s = await summary();
  let laid = await ownBrood();
  result.egg = { before: brood0, refusedOutsideLayPhase: laid <= brood0, refusals: await refusals() };
  expect(laid <= brood0, 'a founding queen laid an egg outside the opening\'s lay phase', result.egg);
  // Play the real opening from where the queen stands: close the card, shed the wings, take the dig over in this shaft, deepen
  // it until the founding cell is ready, seal (E), lay (the real lay-egg). No cheat on this path.
  result.egg.phaseBefore = await opPhase();
  result.egg.opening = await playOpeningToLay();
  result.egg.phaseAtLay = await opPhase();
  if (result.egg.phaseAtLay === 'lay') {
    await g(() => window.__game.act('lay-egg'));
    await step(50);
    await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' }));
    await step(5);
    laid = await ownBrood();
    result.egg.laidInOpening = laid;
  }
  log('egg path', JSON.stringify(result.egg));
  if (laid <= brood0) {
    const why = `the real opening did not reach a laid clutch (phase at lay: ${result.egg.phaseAtLay}; steps: ${result.egg.opening.join(' | ')}; refusals: ${(await refusals()).join(', ') || 'none'})`;
    standIn('egg', `${why}; 6 eggs cheat-spawned at the queen`, 'founding (1B)');
    const col = await g(() => window.__game.query.colony()?.id ?? -1);
    await g((c) => window.__game.cheat.raw({ type: 'cheat.spawnBrood', colonyId: c, stage: 'egg', n: 6, chamberId: -1, progress: 0, destined: null }), col);
    s = await summary();
  }
  laid = await ownBrood();
  result.egg.after = laid;
  log('egg', JSON.stringify(result.egg));
  expect(laid > brood0, 'no eggs', result.egg);
  if (result.egg.laidInOpening !== undefined) {
    result.egg.lapse = await finishOpening();
    const q = await g(() => window.__game.summary().colony?.queen ?? null);
    log('opening after the clutch', JSON.stringify(result.egg.lapse), 'queen', JSON.stringify(q));
    expect(result.egg.lapse.left, 'the opening is still in its lay phase after the time-lapse', result.egg);
    if (!(await summary()).possessed) await g(() => window.__game.possess('queen'));
    await step(2);
    // after the hand-over she idles where she likes (often up in the narrow ramp shaft): walk her back into the cell
    // for the chamber shot
    if (cellCentre) result.egg.backInCell = await steerTo(cellCentre[0], cellCentre[2], 0.6 * bu);
  }

  // inside the dug room with the queen and the eggs (possession camera)
  await g(() => window.__game.camera.zoom(1.6));
  await render(1);
  await timed('chamber', () => shot('04-chamber-queen'));
  const c4 = await g(() => window.__game.camera.clearance());
  // look pass 6: in the cell the rig's camera is squeezed against the ant and the cell camera cuts the soil between camera and ant away
  // (cutAway), as views.mjs accepts it; a camera in solid with no cutaway is still the failure
  if (c4.f < c4.radius * 0.5 && !c4.cutAway) {
    // diagnosis for the report: is the queen herself inside solid (sim), or only the camera (rig)?
    result.chamberCamera = await g(() => {
      const gm = window.__game, s = gm.summary(), p = s.possessed?.pos;
      return { queenF: p ? gm.query.field(p[0], p[1], p[2]).f : null, queen: s.possessed && { pos: s.possessed.pos, up: s.possessed.up, task: s.possessed.task ?? null }, camera: s.camera, clearance: gm.camera.clearance() };
    });
    log('chamber camera', JSON.stringify(result.chamberCamera));
  }
  expect(c4.f >= c4.radius * 0.5 || c4.cutAway, 'camera inside solid in the chamber (no cutaway)', c4);
  expect((await summary()).camera.underground === true, 'the chamber view is not marked underground');
  // colony view from the possessed queen underground: the cutaway slice opens the ground over the nest
  result.colonyView = await g(() => window.__game.camera.set('colony'));
  if (result.colonyView === 'colony') {
    await g(() => window.__game.camera.zoom(0.3));
    await render(1);
    await timed('colony', () => shot('07-colony-view'));
    await g(() => window.__game.camera.set('possess'));
    await step(1);
  }
  // the shaft interior from a free observer camera in the dug space, looking down at the queen
  const queenNow = (await summary()).possessed;
  await g(() => window.__game.release());
  const eye = { x: midShaft.pos[0] + midShaft.up[0] * 0.6 * bu, y: midShaft.pos[1] + midShaft.up[1] * 0.6 * bu, z: midShaft.pos[2] + midShaft.up[2] * 0.6 * bu };
  await g(({ a, l }) => window.__game.camera.setPose(a, l), { a: eye, l: { x: queenNow.pos[0], y: queenNow.pos[1], z: queenNow.pos[2] } });
  await render(0.5);
  await timed('shaftInterior', () => shot('03b-shaft-interior-observer'));
  const c3b = await g(() => window.__game.camera.clearance());
  result.shaftInteriorCamera = { clearance: c3b, underground: (await summary()).camera.underground };
  log('shaft interior camera', JSON.stringify(result.shaftInteriorCamera));
  expect(c3b.f > 0, 'the observer camera in the shaft is inside solid', c3b);
  expect(result.shaftInteriorCamera.underground === true, 'the shaft-interior view is not marked underground', result.shaftInteriorCamera);

  // --- 8. the entrance and its mound, from the surface (observer) ---------------------------------------------------
  await toNoon();
  await g(({ a, l }) => window.__game.camera.setPose(a, l), await entrancePose(14, 22));
  await render(0.5);
  await timed('entrance', () => shot('02-entrance-mound'));
  s = await summary();
  expect(s.camera.underground === false, 'the entrance view should be above ground', s.camera);

  // --- 9. workers: cheat-spawned on the surface near the entrance, drawn and moving --------------------------------
  const crowd = { x: mouth.pos[0] - H.x * 6 * bu, y: mouth.pos[1], z: mouth.pos[2] - H.z * 6 * bu };
  const sp = await g((p) => window.__game.cheat.spawnAnts(60, 'worker', null, p), crowd);
  expect(sp.ok, 'spawnAnts refused', sp);
  const ants0 = await g(() => window.__game.query.ants());
  await step(100);
  const ants1 = await g(() => window.__game.query.ants());
  const byId = new Map(ants0.map((a) => [a.id, a.pos]));
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  // the player colony's workers only (seed 1 has a neighbouring colony whose foragers are on the surface too)
  const myCol = await g(() => window.__hud.game.session.sim.state.colonies[0]?.id ?? -1);
  const workers = ants1.filter((a) => a.caste === 'worker' && a.colony === myCol && byId.has(a.id));
  const autonomous = workers.filter((a) => dist(a.pos, byId.get(a.id)) > 0.5 * bu).length;
  // a worker walked by the player: the real model moves (gait, pose) on the ground. A worker above ground, walked
  // along its own heading (with behaviours, some workers are already in the shaft, where any fixed heading is a wall)
  const above = await g((list) => list.filter((a) => window.__game.query.field(a.pos.x, a.pos.y, a.pos.z).substrate > 0).map((a) => a.id), workers);
  // prefer workers above ground; a refused possession (recorded) moves on to the next candidate
  const candidates = [...workers.filter((a) => above.includes(a.id)), ...workers.filter((a) => !above.includes(a.id))];
  let w = candidates[0], wa = null;
  result.possessTries = [];
  for (const c of candidates.slice(0, 8)) {
    const r = await g((id) => window.__game.possess(id), c.id);
    await step(1);
    wa = await summary();
    result.possessTries.push({ id: c.id, r, possessed: wa.possessed?.id ?? null });
    if (wa.possessed && wa.possessed.id === c.id) { w = c; break; }
  }
  log('possess tries', JSON.stringify(result.possessTries));
  expect(wa?.possessed && wa.possessed.id === w.id, 'no spawned worker could be possessed', result.possessTries);
  const wFrom = wa.possessed.pos, wf = wa.possessed.fwd, wh = Math.hypot(wf[0], wf[2]) || 1;
  await g((v) => window.__game.setIntent({ dir: v }), { x: wf[0] / wh, y: 0, z: wf[2] / wh });
  await step(50);
  await g(() => window.__game.setIntent({}));
  const wTo = (await summary()).possessed.pos;
  const walked = Math.hypot(wTo[0] - wFrom[0], wTo[1] - wFrom[1], wTo[2] - wFrom[2]) / bu;
  result.workers = { spawned: workers.length, movedOnTheirOwn: autonomous, aboveGround: above.length, possessedId: w.id, possessedWalkedBu: walked };
  log('workers', JSON.stringify(result.workers));
  expect(walked > 2, 'a possessed worker did not walk', result.workers);
  if (autonomous === 0) standIn('worker autonomy', 'no cheat-spawned worker moved on its own in 100 ticks (no behaviours); one worker was walked by the player instead', 'beh-forage / beh-nest (1B)');
  await g(() => window.__game.release());
  await g(({ a, l }) => window.__game.camera.setPose(a, l), await entrancePose(14, 22));
  await render(0.5);
  await timed('workers', () => shot('05-workers'));
  result.perf60 = await g(() => window.__game.perf());
  expect(result.perf60.ants >= 61, 'workers missing from perf()', result.perf60.ants);
  expect(result.perf60.renderers.ants.lod0 + result.perf60.renderers.ants.lod1 + result.perf60.renderers.ants.lod2 + result.perf60.renderers.ants.lod3 > 10, 'workers not drawn', result.perf60.renderers.ants);

  // --- 10. time controls, pause, observer and colony views ---------------------------------------------------------
  await g(() => window.__game.setSpeed(8));
  expect((await summary()).time.speed === 8, '8x refused in the observer view');
  await g(() => window.__game.setSpeed(0));
  expect((await summary()).time.paused === true, 'pause failed');
  await g(() => window.__game.setSpeed(1));
  await g(() => window.__game.camera.free());
  await g(() => window.__game.camera.zoom(1));
  await render(0.5);
  await timed('observer', () => shot('06-observer-surroundings'));

  // --- 11. runtime quality switches without errors or leaks --------------------------------------------------------
  const mem = async () => (await g(() => window.__game.perf())).memory;
  result.quality = [];
  // The first visit to each quality uploads what only that quality draws (the shadow map, the post chain's targets, the textures of
  // materials first drawn there, their programs) and three keeps it: a one-off warm-up, measured in test-output/look3fix/qs3.log (textures
  // 37 -> 46 and programs 47 -> 71 on the FIRST cycle, then 46 / 71 / 77 / 86 on the second and third, to the unit). A leak is growth that
  // goes on, so the baseline is taken after one full warm cycle, and the checked cycle must add nothing.
  for (const q of ['low', 'high', 'test']) {
    const r = await g((id) => window.__game.quality(id), q);
    expect(r.ok && r.quality === q, `quality warm-up switch to ${q} failed`, r);
    await render(0.25);
  }
  const m0 = await mem();
  for (const q of ['low', 'high', 'test', 'low', 'test']) {
    const r = await g((id) => window.__game.quality(id), q);
    expect(r.ok && r.quality === q, `quality switch to ${q} failed`, r);
    await render(0.25);
    result.quality.push({ q, ...(await mem()) });
  }
  const m1 = await mem();
  result.memory = { before: m0, after: m1 };
  expect(m1.geometries <= m0.geometries + 8 && m1.textures <= m0.textures + 4 && m1.programs <= m0.programs + 4, 'GPU resources grew across quality switches', result.memory);
  expect((await g(() => window.__game.quality('ultra-max'))).ok === false, 'an unknown quality id was accepted');

  // --- 12. high-quality beauty shots: surface and underground ------------------------------------------------------
  if (!process.env.STAGE1A_SKIP_HIGH) {
    await toNoon();
    await g(() => window.__game.quality('high'));
    await g(({ a, l }) => window.__game.camera.setPose(a, l), await entrancePose(5, 22));
    await render(0.5);
    await timed('highSurface', () => shot('08-high-surface'));
    await g(() => window.__game.possess('queen'));
    await render(1);
    await timed('highUnderground', () => shot('09-high-underground'));
    await g(() => window.__game.quality('test'));
    await render();
  }

  log('stand-ins used:', JSON.stringify(result.standIns.map((x) => x.feature)));
  result.final = await summary();
  return result;
};
