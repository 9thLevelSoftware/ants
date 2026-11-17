// The harvester ant end to end (task docs/design/tasks/species-harvester.md AC4): a new game with Messor barbarus
// founds (cheat.completeFounding: the founding module's own steps, the Messor winter inside the first-brood lapse,
// the hand-over), reaches its first workers, and its foragers bring seeds home along a trail into a granary.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&quality=test&autostart=1&species=messor-barbarus" \
//        --script tests/e2e/species-harvester.mjs --out test-output/species-harvester --script-timeout 3000000
// Screenshots (looked at): 01 a seed carrier on the surface in daylight, 02 the granary (or proto-granary) chamber
// with its display seeds, camera inside the chamber, 03 the castes side by side (major, media, minor; spawned by a
// cheat because majors appear only from 40 workers), 04 the same minor possessed, 05 the chaff midden if there is one.

export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`species-harvester: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const sim = (fn, arg) => g(([src, a]) => { const sm = window.__hud.game.session.sim; return new Function('sim', 'arg', `return (${src})(sim, arg)`)(sm, a); }, [fn.toString(), arg]);
  const step = (n) => g((k) => window.__game.step(k), n);
  const render = (settle) => g((s) => window.__game.renderFrame(s === undefined ? {} : { settle: s }), settle);
  const cheat = (name, ...args) => g(([n, a]) => window.__game.cheat[n](...a), [name, args]);
  const raw = (cmd) => g((c) => window.__game.cheat.raw(c), cmd);
  const frames = () => g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const result = { checks: {}, shots: [] };
  const highShot = async (name) => {
    await g(() => window.__game.quality('high'));
    await render(0.5);
    await frames();
    await shot(name);
    result.shots.push(name);
    await g(() => window.__game.quality('test'));
  };

  const species = await sim((sm) => sm.state.colonies[0].species);
  expect(species === 'messor-barbarus', 'the game did not start with the harvester', species);

  // ---- 1. founding to the first workers (the lapse includes the winter jump) ----
  const handedOver = () => sim((sm) => { const op = sm.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done' || op.phase === 'failed'; });
  await cheat('completeFounding', 10);
  for (let i = 0; i < 400 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  const op = await sim((sm) => ({ phase: sm.state.player.opening?.phase ?? 'none', done: sm.state.player.opening?.done ?? true }));
  expect(op.phase !== 'failed', 'the founding failed', op);
  for (const id of ['founding-continue', 'founding-stay']) {
    const b = page.locator(`[data-testid="${id}"]`);
    if (await b.count()) await b.first().click();
    await step(1);
  }
  await g(() => window.__game.release());
  await g(() => window.__game.camera.set('observer'));
  const first = await sim((sm) => {
    const c = sm.state.colonies[0];
    const ws = sm.state.ants.filter((a) => a.alive && a.colony === c.id && ['minor', 'media', 'major'].includes(a.caste));
    return { workers: ws.length, castes: ws.map((a) => a.caste), tick: sm.state.tick };
  });
  log(`first workers: ${JSON.stringify(first)}`);
  expect(first.workers >= 1, 'no first workers after the founding', first);
  result.checks.firstWorkers = first.workers;

  // The real founding yields only 1-3 first workers today (report: founding hazard paid per day of a cold spring
  // cell). For the trail and granary pictures a working column is spawned at the entrance by cheat: media and
  // minors on `forage` (caste `worker` does not exist for this species).
  const entrance = await sim((sm) => { const n = sm.state.nests.find((x) => x.alive && x.colony === sm.state.colonies[0].id); const e = n?.entrances[0]; return e ? e.pos : null; });
  const colonyId = await sim((sm) => sm.state.colonies[0].id);
  if (entrance) {
    await raw({ type: 'cheat.spawnAnts', colonyId, n: 10, caste: 'media', ageGd: 4, task: 'forage', pos: entrance });
    await raw({ type: 'cheat.spawnAnts', colonyId, n: 6, caste: 'minor', ageGd: 4, task: 'forage', pos: entrance });
    await step(2);
  }

  // ---- 2. seeds on the trail: step until a forager carries a seed outside ----
  // daylight only (06:00-19:00), so the picture shows the seed (a game day is 6000 ticks)
  const carrier = () => sim((sm) => {
    const hour = (((sm.state.tick + sm.state.env.calendar.startTick) % 6000) / 6000) * 24;
    if (hour < 6 || hour > 19) return null;
    for (const a of sm.state.ants) {
      if (!a.alive || a.colony !== sm.state.colonies[0].id || a.nestId >= 0 || a.carry.kind !== 'item') continue;
      const it = sm.stores.items.get(a.carry.id);
      if (it && it.kind === 'seed') return { id: a.id, pos: a.pos, up: a.up, fwd: a.fwd, caste: a.caste };
    }
    return null;
  });
  const colonyState = () => sim((sm) => {
    const c0 = sm.state.colonies[0];
    const tasks = {};
    for (const a of sm.state.ants) if (a.alive && a.colony === c0.id && a.caste !== 'queen') { const k = `${a.caste}:${a.task}${a.nestId < 0 ? '@out' : ''}`; tasks[k] = (tasks[k] ?? 0) + 1; }
    const known = c0.knownSourceIds.map((id) => sm.stores.sources.get(id)).filter((s) => s).map((s) => `${s.kind}/${s.unitBulk}`);
    return { tick: sm.state.tick, archetype: sm.state.config.world.archetype, tasks, known, stores: { c: +c0.stores.c.toFixed(2), p: +c0.stores.p.toFixed(2) } };
  });
  let c = null;
  for (let i = 0; i < 200 && !(c = await carrier()); i++) {
    if (i % 20 === 0) log(`colony: ${JSON.stringify(await colonyState())}`);
    await step(250);
  }
  const granaryNow = () => sim((sm) => {
    const m = sm.state.colonies[0].granary;
    const stock = m ? m.granaries.reduce((a, gr) => a + gr.cohorts.reduce((b, k) => b + k.loads, 0), 0) : 0;
    return { stock, paste: m?.pasteLoads ?? 0, granaries: m?.granaries.map((gr) => gr.chamberId) ?? [] };
  });
  log(`seed carrier: ${JSON.stringify(c)} granary ${JSON.stringify(await granaryNow())}`);
  expect(c, 'no forager carried a seed outside in daylight within 50000 ticks');
  const bu = (await g(() => window.__game.query.world())).bu;
  await g(([p, f, b]) => {
    const eye = { x: p.x - f.x * 5 * b + f.z * 2 * b, y: p.y + 2.5 * b, z: p.z - f.z * 5 * b - f.x * 2 * b };
    window.__game.camera.setPose(eye, p);
  }, [c.pos, c.fwd, bu]);
  await step(1);
  await highShot('01-seed-carrier');

  // ---- 3. the granary chamber with its seed ----
  for (let i = 0; i < 60 && (await granaryNow()).stock < 3; i++) await step(250);
  const gr = await granaryNow();
  result.checks.granary = gr;
  expect(gr.stock > 0, 'no seed reached a granary', gr);
  const chamber = await sim((sm, id) => {
    for (const n of sm.state.nests) for (const ch of n.chambers) if (ch.id === id) return { center: ch.center, radii: ch.radii, type: ch.type };
    return null;
  }, gr.granaries[0]);
  log(`granary chamber: ${JSON.stringify(chamber)}`);
  await step(110); // display seeds sync
  // the camera inside the chamber, near its wall, looking across the floor where the display seeds lie
  await g(([ch, b]) => {
    const eye = { x: ch.center.x + ch.radii.x * 0.75, y: ch.center.y + ch.radii.y * 0.2, z: ch.center.z + ch.radii.z * 0.3 };
    const look = { x: ch.center.x - ch.radii.x * 0.2, y: ch.center.y - ch.radii.y * 0.6, z: ch.center.z };
    window.__game.camera.setPose(eye, look);
  }, [chamber, bu]);
  await step(1);
  await highShot('02-granary-chamber');

  // ---- 4. castes side by side (the major is spawned: majors appear from 40 workers), observer and possession ----
  await g(() => window.__game.camera.set('observer'));
  const home = await sim((sm) => { const n = sm.state.nests.find((x) => x.alive && x.colony === sm.state.colonies[0].id); const e = n?.entrances[0]; return e ? e.pos : null; });
  if (home) {
    const at = (dx, dz) => ({ x: home.x + dx * bu, y: home.y, z: home.z + dz * bu });
    await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste: 'major', ageGd: 5, task: 'idle', pos: at(10, 0) });
    await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste: 'media', ageGd: 5, task: 'idle', pos: at(10, 3) });
    await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste: 'minor', ageGd: 5, task: 'idle', pos: at(10, 6) });
    await step(1);
    const trio = await sim((sm) => {
      const c0 = sm.state.colonies[0].id;
      const newest = (caste) => sm.state.ants.filter((a) => a.alive && a.colony === c0 && a.caste === caste).sort((a, b) => b.id - a.id)[0];
      return ['major', 'media', 'minor'].map((k) => { const a = newest(k); return a ? { id: a.id, pos: a.pos } : null; });
    });
    log(`castes: ${JSON.stringify(trio)}`);
    const mid = trio[1]?.pos ?? at(10, 3);
    await g(([m, b]) => window.__game.camera.setPose({ x: m.x + 7 * b, y: m.y + 4 * b, z: m.z }, m), [mid, bu]);
    await step(1);
    await highShot('03-castes-side-by-side');
    if (trio[2]) {
      await g((id) => window.__game.possess(id), trio[2].id);
      await step(2);
      await highShot('04-castes-possessed');
      await g(() => window.__game.release());
    }
  }

  // ---- 5. the chaff midden ----
  const chaff = await sim((sm) => sm.state.items.filter((it) => it.alive && it.kind === 'chaff').map((it) => it.pos).slice(0, 1)[0] ?? null);
  result.checks.chaff = !!chaff;
  if (chaff) {
    await g(([p, b]) => window.__game.camera.setPose({ x: p.x + 10 * b, y: p.y + 9 * b, z: p.z + 10 * b }, p), [chaff, bu]);
    await step(1);
    await highShot('05-chaff-midden');
  }
  result.checks.summary = await sim((sm) => {
    const c0 = sm.state.colonies[0];
    return { workers: sm.state.ants.filter((a) => a.alive && a.colony === c0.id && a.caste !== 'queen').length, stores: { c: c0.stores.c, p: c0.stores.p } };
  });
  return result;
};
