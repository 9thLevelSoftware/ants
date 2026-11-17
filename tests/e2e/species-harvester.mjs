// The harvester ant end to end (task docs/design/tasks/species-harvester.md AC4): a new game with Messor barbarus
// founds (cheat.completeFounding: the founding module's own steps, the Messor winter inside the first-brood lapse,
// the hand-over), reaches its first workers, and its foragers bring seeds home along a trail into a granary.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&quality=test&autostart=1&species=messor-barbarus" \
//        --script tests/e2e/species-harvester.mjs --out test-output/species-harvester --script-timeout 3000000
// Screenshots (looked at): 01 a seed carrier on the trunk trail in morning or afternoon light (other carriers on the
// same trail), 02 a real granary chamber (planned from the royal chamber wall, dug by cheat.instantPlan, as the
// colony view's planner would place it) with its seed, camera inside, 03 the castes side by side in daylight (major,
// media, minor; spawned by a cheat because majors appear only from 40 workers), 04 the minor possessed with the two
// larger castes in front of her, 05 the chaff midden (milling makes chaff; required).

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

  // ---- 2. seeds on the trail: step until a seed carrier is out in good light with another carrier near her ----
  // 07:00-11:00 or 15:00-18:30 (low sun, before and after the heat retreat; a game day is 6000 ticks)
  const carrier = () => sim((sm) => {
    const hour = (((sm.state.tick + sm.state.env.calendar.startTick) % 6000) / 6000) * 24;
    if (!((hour >= 7 && hour < 11) || (hour >= 15 && hour < 18.5))) return null;
    const bu = sm.world.bu, c0 = sm.state.colonies[0].id;
    const out = [];
    for (const a of sm.state.ants) {
      if (!a.alive || a.colony !== c0 || a.nestId >= 0 || a.carry.kind !== 'item') continue;
      const it = sm.stores.items.get(a.carry.id);
      if (it && it.kind === 'seed') out.push(a);
    }
    let best = null, bestScore = -1;
    for (const a of out) {
      const near = out.filter((b) => b !== a && Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) < 25 * bu).length;
      const score = near * 2 + (a.caste === 'media' ? 1 : 0);
      if (score > bestScore) { best = a; bestScore = score; }
    }
    if (!best || (bestScore < 2 && out.length > 1)) return out.length === 1 && hour >= 15 ? { id: out[0].id, pos: out[0].pos, up: out[0].up, fwd: out[0].fwd, caste: out[0].caste, near: 0 } : null;
    return { id: best.id, pos: best.pos, up: best.up, fwd: best.fwd, caste: best.caste, near: Math.floor(bestScore / 2) };
  });
  const colonyState = () => sim((sm) => {
    const c0 = sm.state.colonies[0];
    const tasks = {};
    for (const a of sm.state.ants) if (a.alive && a.colony === c0.id && a.caste !== 'queen') { const k = `${a.caste}:${a.task}${a.nestId < 0 ? '@out' : ''}`; tasks[k] = (tasks[k] ?? 0) + 1; }
    const known = c0.knownSourceIds.map((id) => sm.stores.sources.get(id)).filter((s) => s).map((s) => `${s.kind}/${s.unitBulk}`);
    const m = c0.granary;
    return { tick: sm.state.tick, archetype: sm.state.config.world.archetype, tasks, known, stores: { c: +c0.stores.c.toFixed(2), p: +c0.stores.p.toFixed(2) }, paste: m ? +m.pasteLoads.toFixed(2) : 0, trunk: m?.trunk?.length ?? 0 };
  });
  let c = null;
  for (let i = 0; i < 240 && !(c = await carrier()); i++) {
    if (i % 20 === 0) log(`colony: ${JSON.stringify(await colonyState())}`);
    await step(250);
  }
  const granaryNow = () => sim((sm) => {
    const m = sm.state.colonies[0].granary;
    const stock = m ? m.granaries.reduce((a, gr) => a + gr.cohorts.reduce((b, k) => b + k.loads, 0), 0) : 0;
    return { stock, paste: m?.pasteLoads ?? 0, granaries: m?.granaries.map((gr) => gr.chamberId) ?? [] };
  });
  log(`seed carrier: ${JSON.stringify(c)} granary ${JSON.stringify(await granaryNow())}`);
  expect(c, 'no forager carried a seed outside in good light within 60000 ticks');
  result.checks.carrier = c;
  const bu = (await g(() => window.__game.query.world())).bu;
  // low and close, from the side and a little ahead, so the seed in her mandibles and the trail behind her show
  await g(([p, f, b]) => {
    const eye = { x: p.x + f.x * 2.2 * b + f.z * 2.6 * b, y: p.y + 1.4 * b, z: p.z + f.z * 2.2 * b - f.x * 2.6 * b };
    window.__game.camera.setPose(eye, { x: p.x - f.x * 1.5 * b, y: p.y + 0.2 * b, z: p.z - f.z * 1.5 * b });
  }, [c.pos, c.fwd, bu]);
  await step(1);
  await highShot('01-seed-carrier');

  // ---- 3. a real granary chamber with its seed ----
  // the colony has no granary chamber below 30 workers (architect): plan one from the royal chamber's wall as the
  // colony view's planner places it, dig it at once (cheat.instantPlan), and let the seed come in (new seed goes to
  // the granary; seed already in the proto-granary is relocated by granary care)
  // tried from each side of the royal chamber in turn: a side the architect's own plans already use is refused
  // ('overlaps-plan')
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const granaryPlans = () => sim((sm) => sm.state.nests.filter((n) => n.colony === sm.state.colonies[0].id).flatMap((n) => n.digPlans)
    .filter((x) => x.kind === 'chamber' && x.chamberType === 'granary' && !['complete', 'cancelled', 'failed'].includes(x.status)).map((x) => ({ id: x.id, status: x.status })));
  const hasGranary = () => sim((sm) => sm.state.nests.some((n) => n.colony === sm.state.colonies[0].id && n.chambers.some((ch) => ch.type === 'granary')));
  await sim(() => { window.__mbPlanEvents = []; });
  await sim((sm) => { sm.events.on('plan-rejected', (e) => window.__mbPlanEvents.push(e)); });
  for (const [sx, sz] of sides) {
    if (await hasGranary() || (await granaryPlans()).length > 0) break;
    const plan = await sim((sm, d) => {
      const n = sm.state.nests.find((x) => x.alive && x.colony === sm.state.colonies[0].id);
      if (!n) return null;
      const ch = n.chambers.find((x) => x.type === 'royal') ?? n.chambers[0];
      const out = { x: 0, y: 0, z: 0 }, nn = { x: 0, y: 1, z: 0 };
      sm.field.project({ x: ch.center.x + d[0] * ch.radii.x, y: ch.center.y, z: ch.center.z + d[1] * ch.radii.z }, 0, out, nn);
      return { nestId: n.id, anchor: { pos: out, normal: nn } };
    }, [sx, sz]);
    if (!plan) break;
    await g((p) => window.__game.command({ type: 'planDig', nestId: p.nestId, kind: 'chamber', chamberType: 'granary', size: 'm', anchor: p.anchor, yawDeg: 0, priority: 'high', confirmWarnings: true }), plan);
    await step(2);
  }
  const made = await granaryPlans();
  log(`granary plans: ${JSON.stringify(made)} refusals ${JSON.stringify(await g(() => window.__mbPlanEvents))}`);
  for (const p of made) { await raw({ type: 'cheat.instantPlan', planId: p.id }); await step(2); }
  await step(20);
  const granaryChamber = () => sim((sm) => {
    const m = sm.state.colonies[0].granary;
    for (const n of sm.state.nests) for (const ch of n.chambers) {
      if (n.colony !== sm.state.colonies[0].id || ch.type !== 'granary') continue;
      const gr = m?.granaries.find((x) => x.chamberId === ch.id);
      return { id: ch.id, center: ch.center, radii: ch.radii, type: ch.type, stock: gr ? gr.cohorts.reduce((a, k) => a + k.loads, 0) : 0 };
    }
    return null;
  });
  log(`granary chamber after the plan: ${JSON.stringify(await granaryChamber())}`);
  log(`chambers: ${JSON.stringify(await sim((sm) => sm.state.nests.filter((n) => n.colony === sm.state.colonies[0].id).flatMap((n) => n.chambers.map((c) => ({ id: c.id, type: c.type, vol: c.volume })))))}`);
  for (let i = 0; i < 80 && ((await granaryChamber())?.stock ?? 0) < 4; i++) await step(250);
  const gr = await granaryNow();
  result.checks.granary = gr;
  expect(gr.stock > 0, 'no seed reached a granary', gr);
  const chamber = (await granaryChamber()) ?? await sim((sm, id) => {
    for (const n of sm.state.nests) for (const ch of n.chambers) if (ch.id === id) return { id: ch.id, center: ch.center, radii: ch.radii, type: ch.type, stock: -1 };
    return null;
  }, gr.granaries[0]);
  result.checks.granaryChamber = chamber;
  expect(chamber && chamber.type === 'granary' && chamber.stock > 0, 'the seed is not in a granary chamber', chamber);
  log(`granary chamber: ${JSON.stringify(chamber)}`);
  await step(110); // display seeds sync
  // the camera inside the chamber, low over the floor, looking at the seeds lying there (the display seeds that
  // mirror the stock; their centroid, else the floor centre)
  const seedsAt = await sim((sm, id) => {
    const ps = sm.state.items.filter((it) => it.alive && it.kind === 'seed' && it.inNest && it.chamberId === id).map((it) => it.pos);
    if (ps.length === 0) return null;
    const c = ps.reduce((a, p) => ({ x: a.x + p.x / ps.length, y: a.y + p.y / ps.length, z: a.z + p.z / ps.length }), { x: 0, y: 0, z: 0 });
    return { c, n: ps.length };
  }, chamber.id);
  log(`granary seeds on the floor: ${JSON.stringify(seedsAt)}`);
  const look = seedsAt ? seedsAt.c : { x: chamber.center.x, y: chamber.center.y - chamber.radii.y * 0.7, z: chamber.center.z };
  await g(([p, ch, b]) => {
    const dx = ch.center.x - p.x, dz = ch.center.z - p.z, d = Math.max(1e-6, Math.hypot(dx, dz));
    // from the chamber's middle side of the seeds, 2.5 BU off and 1.2 BU up
    const eye = { x: p.x + (dx / d) * 2.5 * b, y: p.y + 1.2 * b, z: p.z + (dz / d) * 2.5 * b };
    window.__game.camera.setPose(eye, p);
  }, [look, chamber, bu]);
  await step(1);
  await highShot('02-granary-chamber');

  // ---- 4. castes side by side (the major is spawned: majors appear from 40 workers), observer and possession ----
  // in daylight: on to the next 10:00
  const tenAm = await sim((sm) => { const t = sm.state.tick + sm.state.env.calendar.startTick; const day = Math.floor(t / 6000); let at = day * 6000 + 2500; if (at <= t) at += 6000; return at - sm.state.env.calendar.startTick; });
  const nowTick = await sim((sm) => sm.state.tick);
  if (tenAm > nowTick) await step(tenAm - nowTick);
  await g(() => window.__game.camera.set('observer'));
  const home = await sim((sm) => { const n = sm.state.nests.find((x) => x.alive && x.colony === sm.state.colonies[0].id); const e = n?.entrances[0]; return e ? e.pos : null; });
  if (home) {
    const at = (dx, dz) => ({ x: home.x + dx * bu, y: home.y, z: home.z + dz * bu });
    await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste: 'major', ageGd: 5, task: 'idle', pos: at(10, 0) });
    await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste: 'media', ageGd: 5, task: 'idle', pos: at(10, 0) });
    await raw({ type: 'cheat.spawnAnts', colonyId, n: 1, caste: 'minor', ageGd: 5, task: 'idle', pos: at(10, 0) });
    await step(1);
    const trio = await sim((sm) => {
      const c0 = sm.state.colonies[0].id;
      const newest = (caste) => sm.state.ants.filter((a) => a.alive && a.colony === c0 && a.caste === caste).sort((a, b) => b.id - a.id)[0];
      return ['major', 'media', 'minor'].map((k) => { const a = newest(k); return a ? { id: a.id, pos: a.pos } : null; });
    });
    // line them up 1.6 BU apart on the ground (teleport), then frame them from the side, low and close
    const base = trio[0]?.pos ?? at(10, 0);
    const place = async (i, p) => { if (trio[i]) await g(([id, q]) => window.__game.teleport(id, q), [trio[i].id, p]); };
    for (let i = 0; i < 3; i++) await place(i, { x: base.x, y: base.y, z: base.z + (i - 1) * 1.6 * bu });
    await step(1);
    const placed = await sim((sm, ids) => ids.map((id) => sm.stores.ants.get(id)?.pos ?? null), trio.map((t) => t?.id ?? -1));
    log(`castes: ${JSON.stringify(placed)}`);
    const mid = placed[1] ?? base;
    await g(([m, b]) => window.__game.camera.setPose({ x: m.x + 3.6 * b, y: m.y + 1.3 * b, z: m.z + 0.4 * b }, { x: m.x, y: m.y + 0.25 * b, z: m.z }), [mid, bu]);
    await render(0.5);
    await highShot('03-castes-side-by-side');
    if (trio[2]) {
      // possess the minor, then stand the media and the major 3 BU ahead of her, either side of her heading
      await g((id) => window.__game.possess(id), trio[2].id);
      await step(2);
      const me = await sim((sm, id) => { const a = sm.stores.ants.get(id); return a ? { pos: a.pos, fwd: a.fwd } : null; }, trio[2].id);
      if (me) {
        const ahead = (side) => ({ x: me.pos.x + me.fwd.x * 3 * bu + me.fwd.z * side * bu, y: me.pos.y, z: me.pos.z + me.fwd.z * 3 * bu - me.fwd.x * side * bu });
        await place(0, ahead(-1.1));
        await place(1, ahead(1.1));
        await step(2);
      }
      await highShot('04-castes-possessed');
      await g(() => window.__game.release());
    }
  }

  // ---- 5. the chaff midden (milled seed makes chaff; give the millers time if there is none yet) ----
  const chaffPos = () => sim((sm) => sm.state.items.filter((it) => it.alive && it.kind === 'chaff' && !it.inNest).map((it) => it.pos).slice(0, 1)[0] ?? null);
  let chaff = await chaffPos();
  for (let i = 0; i < 40 && !chaff; i++) { await step(250); chaff = await chaffPos(); }
  result.checks.chaff = !!chaff;
  result.checks.milling = await sim((sm) => { const m = sm.state.colonies[0].granary; return m ? { paste: m.pasteLoads, milledToday: m.milledToday ?? 0, milledYesterday: m.milledYesterday ?? 0, chaffPending: m.chaffPending ?? 0 } : null; });
  log(`milling: ${JSON.stringify(result.checks.milling)}`);
  expect(chaff, 'no chaff on a midden: nothing was milled', result.checks.milling);
  if (chaff) {
    await g(([p, b]) => window.__game.camera.setPose({ x: p.x + 3 * b, y: p.y + 2.2 * b, z: p.z + 3 * b }, p), [chaff, bu]);
    await step(1);
    await highShot('05-chaff-midden');
  }
  result.checks.summary = await sim((sm) => {
    const c0 = sm.state.colonies[0];
    return { workers: sm.state.ants.filter((a) => a.alive && a.colony === c0.id && a.caste !== 'queen').length, stores: { c: c0.stores.c, p: c0.stores.p } };
  });
  return result;
};
