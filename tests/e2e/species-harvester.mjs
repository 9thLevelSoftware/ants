// The harvester ant end to end (task docs/design/tasks/species-harvester.md AC4): a new game with Messor barbarus
// founds (cheat.completeFounding: the founding module's own steps, the Messor winter inside the first-brood lapse,
// the hand-over), reaches its first workers, and its foragers bring seeds home along a trail into a granary.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&quality=test&autostart=1&species=messor-barbarus" \
//        --script tests/e2e/species-harvester.mjs --out test-output/species-harvester --script-timeout 3000000
// Screenshots (looked at): 01 a seed carrier on the surface (observer), 02 the granary chamber with its seed (colony
// view, cutaway), 03 the castes side by side in a possession view (minor, media, major; the major is spawned by a
// cheat because majors appear only from 40 workers), 04 the chaff midden by the entrance when there is one.

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
  const carrier = () => sim((sm) => {
    for (const a of sm.state.ants) {
      if (!a.alive || a.colony !== sm.state.colonies[0].id || a.nestId >= 0 || a.carry.kind !== 'item') continue;
      const it = sm.stores.items.get(a.carry.id);
      if (it && it.kind === 'seed') return { id: a.id, pos: a.pos, up: a.up, fwd: a.fwd, caste: a.caste };
    }
    return null;
  });
  let c = null;
  for (let i = 0; i < 120 && !(c = await carrier()); i++) await step(250);
  const granaryNow = () => sim((sm) => {
    const m = sm.state.colonies[0].granary;
    const stock = m ? m.granaries.reduce((a, gr) => a + gr.cohorts.reduce((b, k) => b + k.loads, 0), 0) : 0;
    return { stock, paste: m?.pasteLoads ?? 0, granaries: m?.granaries.map((gr) => gr.chamberId) ?? [] };
  });
  log(`seed carrier: ${JSON.stringify(c)} granary ${JSON.stringify(await granaryNow())}`);
  expect(c, 'no forager carried a seed outside within 30000 ticks');
  const bu = (await g(() => window.__game.query.world())).bu;
  await g(([p, f, b]) => {
    const eye = { x: p.x - f.x * 14 * b, y: p.y + 7 * b, z: p.z - f.z * 14 * b };
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
  await g(() => window.__game.camera.set('colony'));
  await step(1);
  await g(([ch, b]) => window.__game.views.colonyCamera({
    x: ch.center.x, z: ch.center.z, distBu: 26, pitchDeg: 50, yawDeg: 35, cutaway: 'slice', planeYBu: ch.center.y / b + ch.radii.y / b, radiusBu: 18,
  }), [chamber, bu]);
  await step(1);
  await highShot('02-granary-chamber');

  // ---- 4. castes in a possession view (the major is spawned: majors appear from 40 workers) ----
  await g(() => window.__game.camera.set('observer'));
  const home = await sim((sm) => { const n = sm.state.nests.find((x) => x.alive && x.colony === sm.state.colonies[0].id); const e = n?.entrances[0]; return e ? e.pos : null; });
  if (home) {
    await raw({ type: 'cheat.spawnAnts', colonyId: await sim((sm) => sm.state.colonies[0].id), n: 1, caste: 'major', ageGd: 5, task: 'idle', pos: { x: home.x + 3 * bu, y: home.y, z: home.z } });
    await raw({ type: 'cheat.spawnAnts', colonyId: await sim((sm) => sm.state.colonies[0].id), n: 1, caste: 'media', ageGd: 5, task: 'idle', pos: { x: home.x + 5 * bu, y: home.y, z: home.z } });
    await step(2);
    const minorId = await sim((sm) => sm.state.ants.find((a) => a.alive && a.colony === sm.state.colonies[0].id && a.caste === 'minor')?.id ?? -1);
    if (minorId >= 0) {
      await g(([id, p]) => window.__game.teleport(id, p), [minorId, { x: home.x + 1 * bu, y: home.y, z: home.z }]);
      await g((id) => window.__game.possess(id), minorId);
      await step(2);
      await highShot('03-castes-possessed');
      await g(() => window.__game.release());
    }
  }

  // ---- 5. the chaff midden ----
  const chaff = await sim((sm) => sm.state.items.filter((it) => it.alive && it.kind === 'chaff').map((it) => it.pos).slice(0, 1)[0] ?? null);
  result.checks.chaff = !!chaff;
  if (chaff) {
    await g(([p, b]) => window.__game.camera.setPose({ x: p.x + 10 * b, y: p.y + 9 * b, z: p.z + 10 * b }, p), [chaff, bu]);
    await step(1);
    await highShot('04-chaff-midden');
  }
  result.checks.summary = await sim((sm) => {
    const c0 = sm.state.colonies[0];
    return { workers: sm.state.ants.filter((a) => a.alive && a.colony === c0.id && a.caste !== 'queen').length, stores: { c: c0.stores.c, p: c0.stores.p } };
  });
  return result;
};
