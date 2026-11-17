// The carpenter ant end to end (task docs/design/tasks/species-carpenter.md AC4): a new game with Camponotus
// pennsylvanicus founds in wood through the opening's own state machine (cheat.completeFounding: the founding cell
// chewed into a log by the wood module's template, the real seal, the queen's own laying, the first-brood lapse in
// the real environment, the hand-over), reaches its first workers, chews in wood and ejects frass to a pile outside.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&quality=test&autostart=1&species=camponotus-pennsylvanicus" \
//        --script tests/e2e/species-carpenter.mjs --out test-output/species-carpenter --script-timeout 2400000
// Screenshots (each looked at): 01 the log with the founding opening (observer), 02 the gallery inside the wood from a
// possessed minor with a media and a major beside her (castes side by side; the large castes are spawned by a cheat
// because they unlock only in colony year 3), 03 the cell cut open in the colony view, 04 the frass pile at the foot
// of the log (observer).

const FRASS_STEPS = 80; // x 250 ticks: about 0.6 game day of colony life to see frass outside

export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`species-carpenter: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
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
  expect(species === 'camponotus-pennsylvanicus', 'the game did not start with the carpenter ant', species);
  const bu = (await g(() => window.__game.query.world())).bu;

  // ---- 1. founding in wood to the first workers ----
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
  const nest = await sim((sm) => {
    const c = sm.state.colonies[0];
    const n = sm.state.nests.find((x) => x.alive && x.colony === c.id);
    const ws = sm.state.ants.filter((a) => a.alive && a.colony === c.id && ['minor', 'media', 'major'].includes(a.caste));
    const ch = n?.chambers[0];
    const e = n?.entrances.find((x) => x.status === 'open') ?? n?.entrances[0];
    // the wood the cell lies in: the primitive at the chamber centre
    const prim = ch ? sm.field.primAt(ch.center, sm.world.bu) : null;
    return {
      id: n?.id ?? -1, substrate: n?.substrate ?? null, workers: ws.length, castes: [...new Set(ws.map((a) => a.caste))],
      chamber: ch ? { id: ch.id, center: ch.center, radii: ch.radii, type: ch.type } : null,
      entrance: e ? { pos: e.pos, dir: e.dir, status: e.status } : null,
      prim: prim ? { id: prim.id, material: prim.material, pos: prim.pos } : null, tick: sm.state.tick,
      wood: prim ? sm.state.worldDelta.wood.find((w) => w.primId === prim.id) ?? null : null,
    };
  });
  log(`nest after hand-over: ${JSON.stringify({ ...nest, wood: nest.wood ? { mc: nest.wood.moisture, decay: nest.wood.decay, placement: nest.wood.placement } : null })}`);
  expect(nest.workers >= 1, 'no first workers after the founding', nest);
  expect(nest.prim && (nest.prim.material === 'wood-decayed' || nest.prim.material === 'wood-sound'), 'the founding cell is not in wood', nest.prim);
  expect(nest.chamber && nest.entrance, 'the wood nest has no chamber or entrance', nest);
  result.checks.firstWorkers = nest.workers;
  result.checks.substrate = nest.prim.material;
  result.checks.woodMc = nest.wood?.moisture ?? null;

  // ---- 2. the log from outside, with its opening ----
  const e = nest.entrance;
  const outsidePose = (p, dir, back, up) => g(([q, d, b, k, h]) => {
    const eye = { x: q.x + d.x * k * b, y: q.y + h * b, z: q.z + d.z * k * b };
    window.__game.camera.setPose(eye, q);
  }, [p, dir, bu, back, up]);
  await outsidePose(e.pos, e.dir, 16, 7);
  await step(1);
  await highShot('01-log-opening');

  // ---- 3. inside the gallery: a possessed minor with a media and a major beside her ----
  const c = nest.chamber;
  const colonyId = await sim((sm) => sm.state.colonies[0].id);
  const floor = { x: c.center.x, y: c.center.y - c.radii.y * 0.6, z: c.center.z };
  await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste: 'media', ageGd: 5, task: 'idle', pos: floor });
  await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste: 'major', ageGd: 5, task: 'idle', pos: floor });
  await step(2);
  const minorId = await sim((sm, nid) => {
    const c0 = sm.state.colonies[0];
    const a = sm.state.ants.find((x) => x.alive && x.colony === c0.id && x.caste === 'minor' && x.nestId === nid)
      ?? sm.state.ants.find((x) => x.alive && x.colony === c0.id && x.caste === 'minor');
    return a?.id ?? -1;
  }, nest.id);
  expect(minorId >= 0, 'no minor to possess');
  await g(([id, p]) => window.__game.teleport(id, p), [minorId, floor]);
  await g((id) => window.__game.possess(id), minorId);
  await step(3);
  const inside = await sim((sm, id) => { const a = sm.stores.ants.get(id); return a ? { nestId: a.nestId, medium: a.medium, pos: a.pos } : null; }, minorId);
  log(`possessed minor: ${JSON.stringify(inside)}`);
  result.checks.possessedInside = inside;
  await highShot('02-gallery-castes-possessed');
  // the possessed minor bites the gallery wall (wood chewing makes frass)
  const bite = await g(() => {
    const gm = window.__game;
    const r = gm.act?.('dig-bite');
    return r ?? null;
  });
  await step(40);
  result.checks.possessedBite = bite;
  await g(() => window.__game.release());

  // ---- 4. the cell cut open in the colony view ----
  await g(() => window.__game.camera.set('colony'));
  await step(1);
  await g(([ch, b]) => window.__game.views.colonyCamera({
    x: ch.center.x, z: ch.center.z, distBu: 24, pitchDeg: 55, yawDeg: 30, cutaway: 'slice', planeYBu: ch.center.y / b + 0.3, radiusBu: 16,
  }), [c, bu]);
  await step(1);
  await highShot('03-cell-cutaway');
  await g(() => window.__game.camera.set('observer'));

  // ---- 5. frass: carried out of the wood and dropped on a pile at the foot of the log ----
  const frassNow = () => sim((sm, nid) => {
    const piles = sm.state.worldDelta.mounds.filter((m) => m.material === 'frass' && m.nestId === nid);
    const loose = sm.state.items.filter((it) => it.alive && it.kind === 'frass' && !it.inNest && it.carrierIds.length === 0);
    const inNest = sm.state.items.filter((it) => it.alive && it.kind === 'frass' && it.inNest).length;
    const w = sm.state.colonies[0].wood;
    return {
      piles: piles.map((m) => ({ id: m.id, x: m.centerX, z: m.centerZ, volume: m.volume })),
      loose: loose.length, loosePos: loose[0]?.pos ?? null, inNest, visibility: w?.frassVisibility ?? null,
      units: w ? (w.frassUnitsOutdoor ?? 0) + (w.frassUnitsInterior ?? 0) : null,
    };
  }, nest.id);
  let fr = await frassNow();
  for (let i = 0; i < FRASS_STEPS && fr.piles.length === 0 && fr.loose === 0; i++) { await step(250); fr = await frassNow(); }
  log(`frass: ${JSON.stringify(fr)}`);
  result.checks.frass = fr;
  expect(fr.piles.length > 0 || fr.loose > 0, 'no frass outside the wood', fr);
  const at = fr.piles.length > 0
    ? await sim((sm, m) => ({ x: m.x, y: sm.field.height(m.x, m.z), z: m.z }), fr.piles[0])
    : fr.loosePos;
  await g(([p, b]) => window.__game.camera.setPose({ x: p.x + 9 * b, y: p.y + 7 * b, z: p.z + 9 * b }, p), [at, bu]);
  await step(1);
  await highShot('04-frass-pile');

  result.checks.summary = await sim((sm) => {
    const c0 = sm.state.colonies[0];
    return { workers: sm.state.ants.filter((a) => a.alive && a.colony === c0.id && a.caste !== 'queen').length, stores: { c: c0.stores.c, p: c0.stores.p }, sites: c0.wood?.sites.length ?? 0 };
  });
  return result;
};
