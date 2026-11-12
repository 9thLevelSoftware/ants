// Stage 1A gate, application half (task int-1A-app): the running game on the real world, nest and ant renderers.
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1&quality=test" --script tests/e2e/stage1a.mjs \
//        --out test-output/stage1a --script-timeout 1500000
// Flow: a generated world, the founding queen possessed and walking, digging with the action primitive (ramp brush)
// until a shaft and a chamber exist, pellets and a growing spoil mound, an egg, cheat-spawned workers moving, time
// controls, pause, observer and colony views, runtime quality switches (test / low / high) without errors or GPU
// leaks, frame statistics with 60 workers, and two high-quality beauty shots. Every screenshot must be looked at.
// STAGE1A_SKIP_HIGH=1 skips the (slow) high-quality part while iterating.

const NOON = 2 * 6000 + 3000; // calendar tick: day 3, 12:00 (1 game day = 6000 ticks)

export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`stage1a: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const summary = () => g(() => window.__game.summary());
  const render = (settle) => g((s) => window.__game.renderFrame(s === undefined ? {} : { settle: s }), settle);
  const step = (n) => g((k) => window.__game.step(k), n);
  const result = { shots: {} };
  const timed = async (name, fn) => { const t0 = Date.now(); const r = await fn(); result.shots[name] = Date.now() - t0; return r; };

  // --- 1. real renderers on a generated world --------------------------------------------------------------------
  const s0 = await summary();
  expect(s0.mode === 'playing', 'not playing after autostart', s0.mode);
  expect(s0.renderers.world === 'world' && s0.renderers.nest === 'nest' && s0.renderers.ants === 'ants', 'real renderers not registered', s0.renderers);
  result.renderers = s0.renderers;
  const q0 = await g(() => window.__game.quality());
  expect(q0.quality === 'test', 'expected the test preset', q0);
  await g((t) => window.__game.cheat.setTime(t), NOON);
  const tick0 = (await summary()).tick;
  // noon of the coming day (digging takes game hours): surface shots in daylight
  const toNoon = async () => {
    const t = (await summary()).tick;
    await g((c) => window.__game.cheat.setTime(c), NOON + Math.ceil((t - tick0) / 6000) * 6000);
  };

  // --- 2. the founding queen possessed, upright, walking -----------------------------------------------------------
  await g(() => window.__game.possess('queen'));
  let s = await summary();
  expect(s.possessed?.caste === 'queen' && s.view === 'possess', 'queen not possessed', s.possessed);
  expect(s.possessed.up[1] > 0.9, 'queen not upright at the start', s.possessed.up);
  const perfStart = await g(() => window.__game.perf());
  expect(perfStart.renderers.world.terrainTriangles > 0, 'world renderer drew no terrain', perfStart.renderers.world);
  await render();
  await timed('surface', () => shot('01-surface-third-person'));
  const clear0 = await g(() => window.__game.camera.clearance());
  expect(clear0.f >= clear0.radius * 0.5, 'camera inside solid on the surface', clear0);

  // walk onto diggable ground (the start can be on paving): camera-relative forward until the dig prompt is offered
  const digOk = () => g(() => (window.__game.query.prompt()?.extras ?? []).find((e) => e.actionId === 'dig-bite')?.ok === true);
  const walkFrom = s.possessed.pos;
  await g(() => window.__game.setIntent({ move: { x: 0, y: 1 } }));
  for (let i = 0; i < 120 && !(await digOk()); i++) await step(5);
  await step(15);
  await g(() => window.__game.setIntent({}));
  s = await summary();
  result.walkedMm = Math.hypot(...s.possessed.pos.map((v, i) => v - walkFrom[i]));
  expect(result.walkedMm > 5, 'queen did not walk', result.walkedMm);
  expect(await digOk(), 'no diggable ground found ahead of the queen');
  const site = { pos: s.possessed.pos, fwd: s.possessed.fwd };
  const bu = (await g(() => window.__game.query.world())).bu;

  // --- 3. dig a shaft with the ramp brush (dig-bite aimed below ahead), stepping into the cut ---------------------
  const dig = async (slopeDeg, ticks) => g(({ slope, n }) => {
    const gm = window.__game, p = gm.summary().possessed;
    if (!p) { gm.possess('queen'); return; }
    const f = p.fwd, h = Math.hypot(f[0], f[2]) || 1, d = 8;
    gm.act({ action: 'dig-bite', target: { kind: 'point', id: -1, pos: { x: p.pos[0] + (f[0] / h) * d, y: p.pos[1] - Math.tan((slope * Math.PI) / 180) * d, z: p.pos[2] + (f[2] / h) * d } } });
    gm.step(n);
  }, { slope: slopeDeg, n: ticks });
  const walk = async (ticks, move = { x: 0, y: 1 }) => { await g((m) => window.__game.setIntent({ move: m }), move); await step(ticks); await g(() => window.__game.setIntent({})); };
  const depthBu = (p) => (site.pos[1] - p[1]) / bu;
  for (let i = 0; i < 100; i++) {
    await dig(55, 60);
    await walk(2);
    if (i === 60) { // well inside the shaft: the tunnel interior
      await render();
      await timed('tunnel', () => shot('03-inside-tunnel'));
      const c = await g(() => window.__game.camera.clearance());
      expect(c.f >= c.radius * 0.5, 'camera inside solid in the tunnel', c);
    }
  }
  s = await summary();
  result.shaft = { depthBu: depthBu(s.possessed.pos), openBu3: s.nest.openVolumeBu3, underground: s.possessed.underground };
  log('shaft', JSON.stringify(result.shaft));
  expect(result.shaft.depthBu > 3 && s.possessed.underground, 'no shaft: the queen is not underground', result.shaft);

  // --- 4. a chamber: level bites while turning on the spot ---------------------------------------------------------
  const turns = [{ x: 1, y: 0.2 }, { x: 1, y: -0.6 }, { x: -1, y: -0.6 }, { x: -1, y: 0.2 }];
  for (let r = 0; r < 3; r++) {
    for (const m of turns) {
      await walk(4, m);
      for (let k = 0; k < 4; k++) await dig(5, 60);
    }
  }
  s = await summary();
  result.chamber = { openBu3: s.nest.openVolumeBu3, chambers: s.nest.chambers, entrances: s.nest.entrances };
  log('chamber', JSON.stringify(result.chamber));
  expect(s.nest.openVolumeBu3 > result.shaft.openBu3 * 1.3, 'the chamber did not grow the nest', result.chamber);

  // --- 5. pellets and the spoil mound --------------------------------------------------------------------------------
  // Every bite made a soil pellet; the ones dropped on the surface settle into the spoil mound. Hauling the
  // tunnel's pellets out is the beh-nest task (Stage 1B), so cheat.spawnPellets stands in for the haulers here:
  // pellets dumped at the entrance rim settle (PELLET_SETTLE_S) and the mound must grow and be drawn.
  result.items = await g(() => window.__game.query.items());
  expect((result.items['soil-pellet'] ?? 0) > 10, 'digging made no pellets', result.items);
  const moundVol = (list) => list.reduce((v, m) => v + m.volume, 0);
  const mounds0 = await g(() => window.__game.query.mounds());
  const rim = { x: site.pos[0] - (site.fwd[0] / (Math.hypot(site.fwd[0], site.fwd[2]) || 1)) * 5 * bu, y: site.pos[1], z: site.pos[2] - (site.fwd[2] / (Math.hypot(site.fwd[0], site.fwd[2]) || 1)) * 5 * bu };
  for (let k = 0; k < 4; k++) await g((p) => window.__game.cheat.raw({ type: 'cheat.spawnPellets', pos: p, n: 25, volume: 0.85 }), rim);
  await step(3500);
  const mounds1 = await g(() => window.__game.query.mounds());
  result.mound = { before: moundVol(mounds0), after: moundVol(mounds1), count: mounds1.length };
  log('pellets', JSON.stringify(result.items), 'mound', JSON.stringify(result.mound));
  expect(result.mound.after > result.mound.before, 'the spoil mound did not grow', result.mound);

  // --- 6. an egg ---------------------------------------------------------------------------------------------------
  const brood0 = s.brood;
  await g(() => window.__game.act({ action: 'dig-bite', phase: 'stop' }));
  await step(20);
  if (!(await summary()).possessed) await g(() => window.__game.possess('queen'));
  await g(() => window.__game.act('lay-egg'));
  await step(300);
  s = await summary();
  result.egg = { before: brood0, after: s.brood, fail: await g(() => window.__game.events('action-failed', 3).map((e) => `${e.action}:${e.reason}`)) };
  log('egg', JSON.stringify(result.egg));

  // inside the chamber with the queen (and eggs when laid)
  await render();
  await timed('chamber', () => shot('04-chamber-queen'));
  const c4 = await g(() => window.__game.camera.clearance());
  expect(c4.f >= c4.radius * 0.5, 'camera inside solid in the chamber', c4);
  expect((await summary()).camera.underground === true, 'the chamber view is not marked underground');

  // --- 7. the entrance and its mound, from the surface (observer) ---------------------------------------------------
  await g(() => window.__game.release());
  await toNoon();
  const up = 14 * bu, back = 22 * bu, f = site.fwd, h = Math.hypot(f[0], f[2]) || 1;
  const at = { x: site.pos[0] - (f[0] / h) * back, y: site.pos[1] + up, z: site.pos[2] - (f[2] / h) * back };
  const look = { x: site.pos[0], y: site.pos[1], z: site.pos[2] };
  await g(({ a, l }) => window.__game.camera.setPose(a, l), { a: at, l: look });
  await render(0.5);
  await timed('entrance', () => shot('02-entrance-mound'));
  s = await summary();
  expect(s.camera.underground === false, 'the entrance view should be above ground', s.camera);

  // --- 8. workers: cheat-spawned on the surface near the entrance, visible and moving -------------------------------
  const sp = await g((p) => window.__game.cheat.spawnAnts(60, 'worker', null, p), { x: site.pos[0] - (f[0] / h) * 6 * bu, y: site.pos[1], z: site.pos[2] - (f[2] / h) * 6 * bu });
  expect(sp.ok, 'spawnAnts refused', sp);
  const ants0 = await g(() => window.__game.query.ants());
  await step(100);
  const ants1 = await g(() => window.__game.query.ants());
  const byId = new Map(ants0.map((a) => [a.id, a.pos]));
  const moved = ants1.filter((a) => a.caste === 'worker' && byId.has(a.id) && Math.hypot(a.pos.x - byId.get(a.id).x, a.pos.y - byId.get(a.id).y, a.pos.z - byId.get(a.id).z) > 0.5 * bu).length;
  result.workers = { spawned: ants1.filter((a) => a.caste === 'worker').length, moved };
  log('workers', JSON.stringify(result.workers));
  await render(0.5);
  await timed('workers', () => shot('05-workers'));
  result.perf60 = await g(() => window.__game.perf());
  expect(result.perf60.ants >= 61, 'workers missing from perf()', result.perf60.ants);
  expect(result.perf60.renderers.ants.lod0 + result.perf60.renderers.ants.lod1 + result.perf60.renderers.ants.lod2 + result.perf60.renderers.ants.lod3 > 10, 'workers not drawn', result.perf60.renderers.ants);

  // --- 9. time controls, pause, observer and colony views ----------------------------------------------------------
  await g(() => window.__game.setSpeed(8));
  expect((await summary()).time.speed === 8, '8x refused in the observer view');
  await g(() => window.__game.setSpeed(0));
  expect((await summary()).time.paused === true, 'pause failed');
  await g(() => window.__game.setSpeed(1));
  await g(() => window.__game.camera.free());
  await g(() => window.__game.camera.zoom(1));
  await render(0.5);
  await timed('observer', () => shot('06-observer-surroundings'));
  const colony = await g(() => window.__game.camera.set('colony'));
  result.colonyView = colony;
  if (colony === 'colony') {
    await render(1);
    await timed('colony', () => shot('07-colony-view'));
    await g(() => window.__game.camera.set('observer'));
  }

  // --- 10. runtime quality switches without errors or leaks --------------------------------------------------------
  const mem = async () => (await g(() => window.__game.perf())).memory;
  result.quality = [];
  const m0 = await mem();
  for (const q of ['low', 'high', 'test', 'low', 'test']) {
    const r = await g((id) => window.__game.quality(id), q);
    expect(r.ok && r.quality === q, `quality switch to ${q} failed`, r);
    await render(0.25);
    result.quality.push({ q, ...(await mem()) });
  }
  const m1 = await mem();
  result.memory = { before: m0, after: m1 };
  expect(m1.geometries <= m0.geometries + 8 && m1.textures <= m0.textures + 4, 'GPU resources grew across quality switches', result.memory);
  expect((await g(() => window.__game.quality('ultra-max'))).ok === false, 'an unknown quality id was accepted');

  // --- 11. high-quality beauty shots: surface and underground ------------------------------------------------------
  if (!process.env.STAGE1A_SKIP_HIGH) {
    await toNoon();
    await g(() => window.__game.quality('high'));
    await g(({ a, l }) => window.__game.camera.setPose(a, l), { a: { x: at.x, y: site.pos[1] + 5 * bu, z: at.z }, l: look });
    await render(0.5);
    await timed('highSurface', () => shot('08-high-surface'));
    await g(() => window.__game.possess('queen'));
    await render();
    await timed('highUnderground', () => shot('09-high-underground'));
    await g(() => window.__game.quality('test'));
    await render();
  }

  result.final = await summary();
  return result;
};
