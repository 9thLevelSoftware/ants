// The long arc end to end (task docs/design/tasks/overwinter-repro.md): a forced winter to spring (banner, time-lapse,
// Winter Report), forced alates to a possessed nuptial flight and a Lineage entry, then the queen's death, the orphaned
// decline and the epitaph. Through window.__game (cheats), window.__lifecycle (the flows' own actions) and the sim.
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1&quality=test" --script tests/e2e/lifecycle.mjs \
//        --out test-output/lifecycle --script-timeout 1500000
// Four screenshots are taken at quality=high (the winter overlay, a flight in progress, the Lineage screen, the
// epitaph); the rest of the run stays at quality=test.

export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`lifecycle: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const sim = (fn, arg) => g(([src, a]) => { const sm = window.__hud.game.session.sim; return new Function('sim', 'arg', `return (${src})(sim, arg)`)(sm, a); }, [fn.toString(), arg]);
  const step = (n) => g((k) => window.__game.step(k), n);
  const render = (settle) => g((s) => window.__game.renderFrame(s === undefined ? {} : { settle: s }), settle);
  const cheat = (name, ...args) => g(([n, a]) => window.__game.cheat[n](...a), [name, args]);
  const raw = (cmd) => g((c) => window.__game.cheat.raw(c), cmd);
  const ui = () => g(() => window.__lifecycle.ui());
  const visible = (id) => g((t) => { const e = document.querySelector(`[data-testid="${t}"]`); return !!e && e.getBoundingClientRect().width > 0; }, id);
  const frames = () => g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const result = { checks: {}, shots: [] };
  const highShot = async (name, testId) => {
    await g(() => window.__game.quality('high'));
    await render(0.5);
    await frames();
    await shot(name);
    result.shots.push(name);
    if (testId) expect(await visible(testId), `shot ${name}: ${testId} not on screen`);
    await g(() => window.__game.quality('test'));
  };

  // ---- set-up: the opening handed over (cheat.completeFounding), the queen released, observer camera
  const handedOver = () => sim((sm) => { const op = sm.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
  if (!(await handedOver())) {
    await cheat('completeFounding', 15);
    for (let i = 0; i < 160 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  }
  expect(await handedOver(), 'the opening was not handed over');
  for (const id of ['founding-continue', 'founding-stay']) {
    const b = page.locator(`[data-testid="${id}"]`);
    if (await b.count()) await b.first().click();
    await step(1);
  }
  await g(() => window.__game.release());
  await g(() => window.__game.camera.set('observer'));
  await step(1);
  const colonyId = await sim((sm) => sm.state.colonies[0].id);
  // a small colony as the default start leaves it at winter (integrator addendum): about 15 workers, a few days of stores
  await raw({ type: 'cheat.setStores', colonyId, c: 12, p: 3 });
  log(`set-up: ${JSON.stringify(await sim((sm) => ({ workers: sm.state.ants.filter((a) => a.alive && a.caste === 'worker').length, tick: sm.state.tick })))}`);

  // ---- 1. winter -> spring
  await raw({ type: 'cheat.triggerWinter' });
  await step(1);
  let u = await ui();
  expect(u.winter?.phase === 'banner', 'no winter banner', u.winter);
  await render();
  await frames();
  expect(await visible('winter-banner'), 'banner not on screen');
  await g(() => window.__lifecycle.winter.begin());
  u = await ui();
  expect(u.winter?.phase === 'lapse', 'the lapse did not start', u.winter);
  const season = await sim((sm) => ({ doy: sm.state.env.calendar.startTick, paused: sm.state.env.time.paused, phase: sm.state.env.winter.phase }));
  expect(season.paused && season.phase === 'lapse', 'the clock is not stopped during the lapse', season);
  await g(() => window.__lifecycle.winter.setProgress(0.55));
  await highShot('01-winter-lapse', 'winter-lapse');
  await g(() => window.__lifecycle.winter.skip());
  await render();
  await frames();
  expect(await visible('winter-report'), 'Winter Report not on screen');
  await shot('02-winter-report');
  result.shots.push('02-winter-report');
  const rec = (await g(() => window.__lifecycle.record())).winters[0];
  result.checks.winter = { workers0: rec.workers0, workers1: rec.workers1, losses: rec.losses, c0: rec.c0, c1: rec.c1, queenAlive: rec.queenAlive };
  await g(() => window.__lifecycle.winter.close());
  await step(10);
  const after = await sim((sm) => ({
    season: Math.floor((((sm.state.tick + sm.state.env.calendar.startTick) / 6000) % 28) / 7), paused: sm.state.env.time.paused,
    phase: sm.state.env.winter.phase, winterMs: Object.keys(sm.state.progression.milestones).filter((k) => k.includes('winter')),
  }));
  expect(after.season === 0 && !after.paused && after.phase === 'none', 'not back in spring at 1x', after);
  result.checks.spring = after;
  log(`winter: ${JSON.stringify(result.checks.winter)} spring ${JSON.stringify(after)}`);

  // ---- 2. alates -> a possessed flight -> the Lineage
  await raw({ type: 'cheat.spawnAnts', colonyId, n: 6, caste: 'gyne', ageGd: 1, task: null, pos: null });
  await raw({ type: 'cheat.spawnAnts', colonyId, n: 10, caste: 'male', ageGd: 1, task: null, pos: null });
  await raw({ type: 'cheat.setWeather', state: 'clear', intensityClass: null });
  await raw({ type: 'cheat.forceFlight' });
  await step(1);
  u = await ui();
  expect(u.flight?.launch, 'no take-off prompt', u.flight);
  await render();
  await frames();
  expect(await visible('flight-launch'), 'take-off prompt not on screen');
  await g(() => window.__lifecycle.flight.flyAsQueen());
  await step(1);
  const flying = await sim((sm) => sm.state.colonies[0].lifecycle.flight);
  expect(flying && flying.phase !== 'ended', 'the possessed flight did not start', flying);
  // steer with the intent the possession input actually sends (src/game/intent/possessionInput.ts): a horizontal
  // camera-relative direction, Space held = grip (climb), Shift held = hurry (descend), no flight block. Toward the
  // males above the high ground, climbing to them; near the lek, turn across it so she stays among them.
  const steer = () => sim((sm) => {
    const f = sm.state.colonies[0].lifecycle.flight;
    if (!f || f.phase === 'ended') return null;
    const gy = sm.stores.ants.get(f.gyneId);
    const dx = f.lek.x - gy.pos.x, dz = f.lek.z - gy.pos.z, dy = f.lek.y - gy.pos.y, L = Math.hypot(dx, dz) || 1;
    const near = L < 40 * sm.world.bu;
    const dir = near ? { x: -dz / L, y: 0, z: dx / L } : { x: dx / L, y: 0, z: dz / L };
    const space = !f.mated && dy > 0, shift = f.mated || dy < -30 * sm.world.bu;
    sm.setPlayerIntent({ dir, hurry: shift, grip: space, held: [], flight: null });
    return { phase: f.phase, mating: f.mating, mated: f.mated, energy: f.energy };
  });
  let st = null, shotFlight = false;
  for (let i = 0; i < 160; i++) {
    st = await steer();
    if (!st) break;
    if (!shotFlight && (st.mating > 0.3 || i === 60)) {
      await highShot('03-flight', 'flight-hud');
      shotFlight = true;
    }
    await step(10);
  }
  if (!shotFlight) await highShot('03-flight', 'flight-hud');
  if (st) { await g(() => window.__lifecycle.flight.landNow()); await step(1); }
  await step(700); // the rest of the swarm takes off after the assembly
  const lin = await g(() => window.__lifecycle.record());
  expect(lin.flights.length === 1, 'one flight record', lin.flights.length);
  result.checks.flight = { record: lin.flights[0], daughters: lin.daughters.length, own: lin.flight?.outcome };
  await render();
  await frames();
  expect(await visible('flight-ended'), 'flight end card not on screen');
  await shot('04-flight-ended');
  const prof = await g(() => window.__lifecycle.lineage.profile());
  expect(prof.flights.some((f) => f.id === lin.flights[0].id), 'flight not in the device Lineage', prof.flights.length);
  result.checks.lineage = { colonies: prof.colonies.length, flights: prof.flights.length, daughters: prof.daughters.length };
  await g(() => window.__lifecycle.flight.closeEnded());
  await g(() => window.__lifecycle.lineage.open());
  await highShot('05-lineage', 'lineage-screen');
  await g(() => window.__lifecycle.lineage.close());
  log(`flight: ${JSON.stringify(result.checks.flight)} lineage ${JSON.stringify(result.checks.lineage)}`);

  // ---- 3. queen death -> orphaned decline -> extinction -> epitaph
  const eggsBefore = await sim((sm) => sm.state.brood.filter((b) => b.alive).length);
  await raw({ type: 'cheat.killQueen', colonyId, cause: 'predation' });
  await step(3000);
  const orphan = await sim((sm) => {
    const c = sm.state.colonies[0];
    return { orphanedAt: c.orphanedAtTick, queenId: c.queenId, eggsLaidAfter: sm.state.brood.filter((b) => b.alive && b.laidTick > c.orphanedAtTick).length, milestone: !!sm.state.progression.milestones['ms-queen-lost'] };
  });
  expect(orphan.orphanedAt >= 0 && orphan.queenId === -1 && orphan.eggsLaidAfter === 0, 'not orphaned / eggs after the queen died', orphan);
  result.checks.orphan = { ...orphan, broodBefore: eggsBefore };
  await raw({ type: 'cheat.killAll', colonyId });
  await step(320);
  await render();
  await frames();
  const mode = await g(() => window.__game.summary().mode);
  expect(mode === 'epitaph', 'the game did not enter the epitaph', mode);
  u = await ui();
  expect(u.epitaph?.data?.queenCause === 'predation', 'the epitaph lacks the recorded history', u.epitaph?.data);
  // the epitaph follows the sim's extinction (colony.extinct after the grace), so the cause chain was recorded
  expect(u.epitaph.data.chain.length > 0, 'the epitaph has no cause chain (entered before colony.extinct?)', u.epitaph.data);
  expect(u.epitaph.data.queenDiedYear === 2, 'queen death year (after one winter) should be Year 2', u.epitaph.data.queenDiedYear);
  result.checks.epitaph = {
    cause: u.epitaph.data.cause, chain: u.epitaph.data.chain, days: u.epitaph.data.graph.days, sampleDays: u.epitaph.data.graph.sampleDays,
    winters: u.epitaph.data.figures.winters, flights: u.epitaph.data.figures.flights, causes: u.epitaph.data.causes,
  };
  await highShot('06-epitaph', 'epitaph-screen');
  log(`epitaph: ${JSON.stringify(result.checks.epitaph)}`);
  return result;
};
