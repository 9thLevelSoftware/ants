// The leafcutter end to end (task docs/design/tasks/species-leafcutter.md AC4): a new game with Atta texana founds
// with its fungus pellet (cheat.completeFounding: the founding module's own steps; the queen plants the pellet, the
// garden is established before she lays, most of the clutch is eaten, the first-brood lapse runs in the real
// environment, then the hand-over), reaches its first workers (minims), and the minims cut leaf fragments, carry them
// home along their route and plant them in the garden.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&quality=test&autostart=1&species=atta-texana" \
//        --script tests/e2e/species-leafcutter.mjs --out test-output/species-leafcutter --script-timeout 3000000
// One forced step: the seal. The founding module's automatic seal never plugs the 35 BU Atta shaft (core defect,
// reported; reproduced without the fungus rules), so when the opening reaches `seal` the entrance is declared sealed
// by cheat.setFoundingState, exactly as tools/sim/life.ts does. Everything after the seal is the game's own.
// Screenshots (each looked at): 01 leaf carriers on their way home (the natural minims of the first brood), 02 the
// garden chamber with its pale garden mass, 03 the castes in possession view (the possessed minim with a small
// media, a media and a major beside her; the larger castes spawned by a cheat because they come only with a larger
// colony: majors from 400 workers), 04 the refuse heap of garden waste outside, if one exists by then.

export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`species-leafcutter: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
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
  expect(species === 'atta-texana', 'the game did not start with the leafcutter', species);
  const bu = (await g(() => window.__game.query.world())).bu;

  // ---- 1. founding with the pellet to the first workers ----
  const phase = () => sim((sm) => { const op = sm.state.player.opening; return op ? (op.done ? 'done' : op.phase) : 'none'; });
  await cheat('completeFounding', 10);
  let forced = false;
  for (let i = 0; i < 600; i++) {
    const p = await phase();
    if (p === 'handover' || p === 'done' || p === 'failed' || p === 'none') break;
    if (p === 'seal' && !forced) { await raw({ type: 'cheat.setFoundingState', nestId: -1, state: 'sealed' }); forced = true; }
    await g(() => { window.__founding?.skipLapse?.(); window.__game.step(250); });
  }
  const founding = await sim((sm) => {
    const op = sm.state.player.opening;
    const c = sm.state.colonies[0];
    return { phase: op?.phase ?? 'none', garden: op?.garden ?? null, gardens: c.fungus?.gardens.map((x) => ({ ch: x.chamberId, state: x.state, G: +x.biomass.toFixed(2) })) ?? [] };
  });
  log(`founding: ${JSON.stringify(founding)} (seal forced: ${forced})`);
  expect(founding.phase !== 'failed', 'the founding failed', founding);
  expect(founding.garden?.planted && founding.garden?.established, 'the pellet was not planted and established', founding);
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
    return { workers: ws.length, castes: [...new Set(ws.map((a) => a.caste))], tick: sm.state.tick };
  });
  log(`first workers: ${JSON.stringify(first)}`);
  expect(first.workers >= 1, 'no first workers after the founding', first);
  result.checks.firstWorkers = first.workers;
  result.checks.sealForced = forced;

  // ---- 2. leaf carriers outside: step until two fragments are on the way home near each other ----
  const carriers = () => sim((sm) => {
    const c0 = sm.state.colonies[0].id;
    const hour = (((sm.state.tick + sm.state.env.calendar.startTick) % 6000) / 6000) * 24;
    const out = [];
    for (const a of sm.state.ants) {
      if (!a.alive || a.colony !== c0 || a.nestId >= 0 || a.carry.kind !== 'item') continue;
      const it = sm.stores.items.get(a.carry.id);
      if (it && it.kind === 'leaf-fragment') out.push({ id: a.id, pos: a.pos, fwd: a.fwd, caste: a.caste, len: it.lengthMm, body: a.lengthBu });
    }
    let best = null, bestN = -1;
    for (const a of out) {
      const near = out.filter((b) => b !== a && Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) < 25 * sm.world.bu).length;
      if (near > bestN) { best = a; bestN = near; }
    }
    return { hour, n: out.length, best, near: bestN, all: out.map((a) => a.pos) };
  });
  const chain = () => sim((sm) => { const ch = sm.state.colonies[0].fungus?.chain; return ch ? { cut: ch.cut + (ch.last?.cut ?? 0), carried: ch.carried + (ch.last?.carried ?? 0), planted: ch.planted + (ch.last?.planted ?? 0), narrow: ch.narrow } : null; });
  let c = null, fallback = null;
  for (let i = 0; i < 120; i++) {
    const r = await carriers();
    if (r.n >= 1 && !fallback) fallback = r;
    if (r.n >= 2 && r.near >= 1) { c = r; break; }
    if (r.n >= 1 && i > 60) { c = r; break; }
    if (i % 12 === 0) log(`colony t${i}: carriers ${r.n} hour ${r.hour.toFixed(1)} chain ${JSON.stringify(await chain())}`);
    await step(250);
  }
  c = c ?? fallback;
  log(`leaf carriers: ${JSON.stringify(c)}`);
  expect(c && c.best, 'no worker carried a leaf fragment outside within 30000 ticks', c);
  result.checks.carriers = { n: c.n, near: c.near, hour: c.hour, caste: c.best.caste, fragmentMm: c.best.len };
  // low and close (scaled to the carrier's body: a minim is a third of a BU), from the side and a little ahead of the
  // leading carrier, looking back along its path so the fragment and the next carrier show
  await g(([p, f, b, body]) => {
    const k = Math.max(0.35, body) * b;
    const eye = { x: p.x + f.x * 2.4 * k + f.z * 1.8 * k, y: p.y + 1.0 * k, z: p.z + f.z * 2.4 * k - f.x * 1.8 * k };
    window.__game.camera.setPose(eye, { x: p.x - f.x * 0.8 * k, y: p.y + 0.1 * k, z: p.z - f.z * 0.8 * k });
  }, [c.best.pos, c.best.fwd, bu, c.best.body]);
  await step(1);
  await highShot('01-leaf-carriers');
  // the same carrier from its own possession camera (the fragment held over its head)
  await g((id) => window.__game.possess(id), c.best.id);
  await step(2);
  await highShot('01b-leaf-carrier-possessed');
  await g(() => window.__game.release());
  await g(() => window.__game.camera.set('observer'));
  result.checks.chain = await chain();

  // ---- 3. the garden chamber ----
  await step(110); // garden display lumps follow the garden record
  const garden = await sim((sm) => {
    const c0 = sm.state.colonies[0];
    const gr = c0.fungus?.gardens.find((x) => x.state !== 'dead');
    if (!gr) return null;
    let ch = null;
    for (const n of sm.state.nests) for (const x of n.chambers) if (x.id === gr.chamberId) ch = x;
    const lumps = sm.state.items.filter((it) => it.alive && it.kind === 'fungus-piece' && it.inNest && it.chamberId === gr.chamberId).map((it) => it.pos);
    const cen = lumps.length ? lumps.reduce((a, p) => ({ x: a.x + p.x / lumps.length, y: a.y + p.y / lumps.length, z: a.z + p.z / lumps.length }), { x: 0, y: 0, z: 0 }) : null;
    return { chamberId: gr.chamberId, type: ch?.type, state: gr.state, G: gr.biomass, h: gr.health, lumps: lumps.length, cen, center: ch?.center, radii: ch?.radii };
  });
  log(`garden: ${JSON.stringify(garden)}`);
  expect(garden && garden.lumps > 0, 'no garden mass to show', garden);
  result.checks.garden = { chamberId: garden.chamberId, type: garden.type, state: garden.state, G: garden.G, lumps: garden.lumps };
  await g(([p, ch, b]) => {
    const dx = p.x - ch.x, dz = p.z - ch.z, d = Math.max(1e-6, Math.hypot(dx, dz));
    // from the far side of the chamber, low, looking at the garden heap
    const eye = { x: p.x - (dx / d) * 3.2 * b - 1.0 * b, y: p.y + 1.6 * b, z: p.z - (dz / d) * 3.2 * b + 0.6 * b };
    window.__game.camera.setPose(eye, { x: p.x, y: p.y + 0.4 * b, z: p.z });
  }, [garden.cen, garden.center, bu]);
  await step(1);
  await highShot('02-garden-chamber');

  // ---- 4. castes in possession view (the larger castes spawned: majors come from 400 workers) ----
  const colonyId = await sim((sm) => sm.state.colonies[0].id);
  const home = await sim((sm) => { const n = sm.state.nests.find((x) => x.alive && x.colony === sm.state.colonies[0].id); const e = n?.entrances[0]; return e ? e.pos : null; });
  if (home) {
    const at = { x: home.x + 9 * bu, y: home.y, z: home.z };
    for (const [caste, len] of [['major', 1.8], ['media', 1.1], ['media', 0.7], ['minor', 0.35]]) {
      await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste, ageGd: 5, task: 'idle', pos: at });
      await step(1);
      // the spawn draws a size of the caste; set the one wanted (a small media is a media under 0.8 BU)
      await sim((sm, a) => {
        const c0 = sm.state.colonies[0].id;
        const ant = sm.state.ants.filter((x) => x.alive && x.colony === c0 && x.caste === a.caste).sort((x, y) => y.id - x.id)[0];
        if (ant) { ant.lengthBu = a.len; ant.sizeClass = a.caste === 'media' && a.len < 0.8 ? 'small-media' : null; }
      }, { caste, len });
    }
    await step(1);
    const four = await sim((sm) => {
      const c0 = sm.state.colonies[0].id;
      const mine = sm.state.ants.filter((a) => a.alive && a.colony === c0 && a.caste !== 'queen').sort((a, b) => b.id - a.id).slice(0, 4);
      return mine.map((a) => ({ id: a.id, caste: a.caste, len: a.lengthBu }));
    });
    log(`spawned for the caste picture: ${JSON.stringify(four)}`);
    const minim = four.find((a) => a.caste === 'minor');
    if (minim) {
      await g((id) => window.__game.possess(id), minim.id);
      await step(2);
      const me = await sim((sm, id) => { const a = sm.stores.ants.get(id); return a ? { pos: a.pos, fwd: a.fwd } : null; }, minim.id);
      const others = four.filter((a) => a.id !== minim.id);
      if (me) {
        const sides = [-1.5, 0, 1.5];
        for (let i = 0; i < others.length; i++) {
          const s = sides[i] ?? 0;
          const p = { x: me.pos.x + me.fwd.x * 3.2 * bu + me.fwd.z * s * bu, y: me.pos.y, z: me.pos.z + me.fwd.z * 3.2 * bu - me.fwd.x * s * bu };
          await g(([id, q]) => window.__game.teleport(id, q), [others[i].id, p]);
        }
        await step(2);
      }
      await highShot('03-castes-possessed');
      await g(() => window.__game.release());
    }
  }

  // ---- 5. the refuse heap (garden waste carried out): wait up to 1 GD for the first dump ----
  const heapNow = () => sim((sm) => {
    const ps = sm.state.items.filter((it) => it.alive && it.kind === 'garden-waste' && !it.inNest && it.hardness !== 0).map((it) => it.pos);
    return ps.length ? { n: ps.length, p: ps[0] } : null;
  });
  let heap = await heapNow();
  for (let i = 0; i < 12 && !heap; i++) { await step(500); heap = await heapNow(); }
  log(`refuse heap: ${JSON.stringify(heap)}`);
  result.checks.refuseHeap = heap ? heap.n : 0;
  if (heap) {
    await g(() => window.__game.camera.set('observer'));
    await g(([p, b]) => window.__game.camera.setPose({ x: p.x + 2.5 * b, y: p.y + 2.0 * b, z: p.z + 2.5 * b }, p), [heap.p, bu]);
    await step(1);
    await highShot('04-refuse-heap');
  }
  result.checks.summary = await sim((sm) => {
    const c0 = sm.state.colonies[0];
    const m = c0.fungus;
    return {
      workers: sm.state.ants.filter((a) => a.alive && a.colony === c0.id && a.caste !== 'queen').length,
      gardens: m?.gardens.map((x) => ({ state: x.state, G: +x.biomass.toFixed(2), h: +x.health.toFixed(2) })),
      staphylae: m?.staphylae ?? 0, stores: { c: c0.stores.c, p: c0.stores.p },
    };
  });
  log(`summary: ${JSON.stringify(result.checks.summary)}`);
  return result;
};
