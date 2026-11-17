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

const FRASS_STEPS = 240; // x 250 ticks: at most 10 game days of colony life to see a frass pile outside
const FRASS_UNITS_WANTED = 1; // GDD 07 §6.2.3: 10 frass items make one pile unit (items settled INTO a pile, not loose)

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
  await outsidePose(e.pos, e.dir, 7, 3);
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
  // the media and the major stand ahead of her in the camera's view, one to each side, side-on (profile) so the three
  // sizes compare: positions from the camera's real view direction (the possession rig decides where it looks)
  await render(0.5);
  const cam = await g(() => window.__game.camera.pose());
  const ahead = await sim((sm, [id, dir]) => {
    const a = sm.stores.ants.get(id);
    const b = sm.world.bu;
    const u = a.up;
    const dot = dir.x * u.x + dir.y * u.y + dir.z * u.z;
    let f = { x: dir.x - u.x * dot, y: dir.y - u.y * dot, z: dir.z - u.z * dot };
    const fl = Math.sqrt(f.x * f.x + f.y * f.y + f.z * f.z) || 1;
    f = { x: f.x / fl, y: f.y / fl, z: f.z / fl };
    const side = { x: u.y * f.z - u.z * f.y, y: u.z * f.x - u.x * f.z, z: u.x * f.y - u.y * f.x };
    const at = (k, s) => ({ x: a.pos.x + (f.x * k + side.x * s) * b, y: a.pos.y + (f.y * k + side.y * s) * b + 0.2 * b, z: a.pos.z + (f.z * k + side.z * s) * b });
    const big = sm.state.ants.filter((x) => x.alive && x.colony === a.colony && (x.caste === 'media' || x.caste === 'major'));
    return big.map((x) => ({ id: x.id, pos: x.caste === 'media' ? at(1.6, 0.9) : at(3.0, -1.1), fwd: x.caste === 'media' ? side : { x: -side.x, y: -side.y, z: -side.z } }));
  }, [minorId, cam.dir]);
  for (const t of ahead) await g(([id, p]) => window.__game.teleport(id, p), [t.id, t.pos]);
  await step(1);
  const placed = await sim((sm, [id, list]) => {
    const a = sm.stores.ants.get(id), b = sm.world.bu;
    return list.map((t) => { const x = sm.stores.ants.get(t.id); return x ? { caste: x.caste, lengthBu: x.lengthBu, fromMinorBu: Math.hypot(x.pos.x - a.pos.x, x.pos.y - a.pos.y, x.pos.z - a.pos.z) / b } : null; });
  }, [minorId, ahead]);
  log(`castes placed: ${JSON.stringify(placed)}`);
  result.checks.castesPlaced = placed;
  // side-on, and kept still for the picture (their own work would turn them around)
  await sim((sm, list) => { for (const t of list) { const x = sm.stores.ants.get(t.id); if (x) x.fwd = { ...t.fwd }; } return true; }, ahead);
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
    x: ch.center.x, z: ch.center.z, distBu: 14, pitchDeg: 60, yawDeg: 30, cutaway: 'slice', planeYBu: ch.center.y / b + 0.3, radiusBu: 10,
  }), [c, bu]);
  await step(1);
  await highShot('03-cell-cutaway');
  await g(() => window.__game.camera.set('observer'));

  // ---- 5. frass: carried out of the wood and dropped on a pile at the foot of the log ----
  const frassNow = () => sim((sm) => {
    const c0 = sm.state.colonies[0];
    const mine = new Set(c0.nestIds);
    const piles = sm.state.worldDelta.mounds.filter((m) => m.material === 'frass' && mine.has(m.nestId));
    const loose = sm.state.items.filter((it) => it.alive && it.kind === 'frass' && !it.inNest && it.carrierIds.length === 0);
    const inNest = sm.state.items.filter((it) => it.alive && it.kind === 'frass' && it.inNest).length;
    // the pile's mass centre: the h-weighted centroid of its grid (the record's centre is the entrance it serves)
    const massAt = (m) => {
      const x0 = m.centerX - ((m.n - 1) * m.cell) / 2, z0 = m.centerZ - ((m.n - 1) * m.cell) / 2;
      let w = 0, x = 0, z = 0, top = 0;
      for (let i = 0; i < m.h.length; i++) {
        const h = m.h[i];
        if (h <= 0) continue;
        w += h; x += (x0 + (i % m.n) * m.cell) * h; z += (z0 + Math.floor(i / m.n) * m.cell) * h; top = Math.max(top, h);
      }
      return w > 0 ? { x: x / w, z: z / w, topMm: top } : { x: m.centerX, z: m.centerZ, topMm: 0 };
    };
    const w = c0.wood;
    return {
      piles: piles.map((m) => ({ id: m.id, items: m.absorbed, units: m.absorbed / 10, volumeBu3: m.volume, mass: massAt(m), nestId: m.nestId })),
      pileUnits: piles.reduce((u, m) => u + m.absorbed / 10, 0),
      loose: loose.length, loosePos: loose[0]?.pos ?? null, inNest, visibility: w?.frassVisibility ?? null,
      tallyUnits: w ? (w.frassUnitsOutdoor ?? 0) + (w.frassUnitsInterior ?? 0) : null,
    };
  }, nest.id);
  // live on until the dropped frass has settled INTO a pile of at least one pile unit (10 items absorbed by the
  // pile; loose items do not count), or the step budget runs out
  let fr = await frassNow();
  for (let i = 0; i < FRASS_STEPS && !(fr.pileUnits >= FRASS_UNITS_WANTED); i++) { await step(250); fr = await frassNow(); }
  log(`frass: ${JSON.stringify(fr)}`);
  result.checks.frass = fr;
  expect(fr.pileUnits >= FRASS_UNITS_WANTED, 'no frass pile of one pile unit outside the wood', fr);
  const best = fr.piles.reduce((a, b) => (b.items > a.items ? b : a));
  // the pile lies at the foot of the wood: on the ground, outside the log
  const foot = await sim((sm, [m, pid]) => {
    const y = sm.field.height(m.x, m.z);
    const prim = sm.world.prims.find((q) => q.id === pid);
    const inLog = prim ? sm.field.primAt({ x: m.x, y: y + 0.3 * sm.world.bu, z: m.z }, 0)?.id === pid : false;
    return { x: m.x, y, z: m.z, inLog };
  }, [best.mass, nest.prim.id]);
  result.checks.frassFoot = foot;
  expect(!foot.inLog, 'the frass pile lies under the log, not at its foot', foot);
  const at = foot;
  await g(([p, b]) => window.__game.camera.setPose({ x: p.x + 5 * b, y: p.y + 4 * b, z: p.z + 5 * b }, p), [at, bu]);
  await step(1);
  await highShot('04-frass-pile');

  result.checks.summary = await sim((sm) => {
    const c0 = sm.state.colonies[0];
    return { workers: sm.state.ants.filter((a) => a.alive && a.colony === c0.id && a.caste !== 'queen').length, stores: { c: c0.stores.c, p: c0.stores.p }, sites: c0.wood?.sites.length ?? 0 };
  });
  return result;
};
