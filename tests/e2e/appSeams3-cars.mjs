// app-seams-3 item 3: the parked cars of the boundary backdrop (road treatment: an asphalt zone at the map edge).
// World: archetype car-park-verge (edge runs of the road treatment on three sides; seed 1: side 3 is road for its whole length).
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&archetype=car-park-verge&size=compact&autostart=1&quality=test" \
//        --script tests/e2e/appSeams3-cars.mjs --out test-output/app-seams-3/cars --script-timeout 900000
// Pictures: from ant height just inside the edge looking out at the places the cars stand, then from the observer
// camera raised above the nearest edge (the widest view the observer reaches over the edge) and from higher still.
export default async ({ page, log, out, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(20));
  await g(() => { const s = window.__hud.game.session.sim.state; const tpd = 6000; const ct = s.env.calendar.startTick + s.tick; window.__game.command({ type: 'cheat.setTime', tick: Math.floor(ct / tpd) * tpd + 0.55 * tpd }); window.__game.command({ type: 'cheat.setWeather', state: 'clear', intensityClass: 0 }); });
  await g(() => window.__game.step(2));
  const info = await g(async () => {
    const b = await import('/src/render/world/boundary/index.ts');
    const w = window.__hud.game.session.sim.world;
    const runs = b.edgeRuns(w).filter((r) => r.treatment === 'road');
    const { mesh, stats } = b.buildBackdrop(w);
    return { size: w.size, stats, runs: runs.map((r) => ({ side: r.side.index, u0: r.u0, u1: r.u1, out: r.side.out, at0: r.side.at(r.u0), at1: r.side.at(r.u1) })) };
  });
  log('road runs', JSON.stringify(info));
  if (!info.runs.length) return { error: 'no road run in this world' };
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.step(2));
  const run = info.runs.sort((a, b) => (b.u1 - b.u0) - (a.u1 - a.u0))[0];
  const at = (u) => (run.side === 0 ? { x: u, z: 0 } : run.side === 1 ? { x: info.size, z: u } : run.side === 2 ? { x: u, z: info.size } : { x: 0, z: u });
  const out2 = run.out;
  const pose = async (name, u, inset, h, dist, lookH) => {
    const e = at(u);
    const c = { x: e.x - out2.x * inset, z: e.z - out2.z * inset }, t = { x: e.x + out2.x * dist, z: e.z + out2.z * dist };
    const gy = await g((p) => window.__game.query.field(p.x, 0, p.z).height, c);
    await g((a) => window.__game.camera.setPose({ x: a.c.x, y: a.gy + a.h, z: a.c.z }, { x: a.t.x, y: a.gy + a.lookH, z: a.t.z }), { c, t, gy, h, lookH });
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await wait.frames(2);
    await shot(name);
  };
  const L = run.u1 - run.u0;
  for (const [i, f] of [0.2, 0.45, 0.7].entries()) await pose(`ant-${i}`, run.u0 + f * L, 300, 12, 1800, 500);
  await pose('meta-edge', run.u0 + 0.45 * L, 5000, 2500, 2000, 400);
  await pose('meta-high', run.u0 + 0.45 * L, 12000, 9000, 0, 0);
  // the player's own start: ant height at the queen's start, looking at the nearest car of this run (cars stand at about u0 + (i + 0.5) / n * length)
  const start = await g(() => window.__game.query.world().queenStart.pos);
  const along = run.side === 0 || run.side === 2 ? start.x : start.z, inward = run.side === 0 ? start.z : run.side === 2 ? info.size - start.z : run.side === 1 ? info.size - start.x : start.x;
  const nCars = Math.max(1, Math.round(((run.u1 - run.u0) / 1000) * 0.18));
  const carU = run.u0 + (Math.min(nCars - 1, Math.max(0, Math.round((along - run.u0) / (run.u1 - run.u0) * nCars - 0.5))) + 0.5) / nCars * (run.u1 - run.u0);
  log('start', JSON.stringify({ start, along, inward, nCars, carU }));
  const e = at(carU), t = { x: e.x + out2.x * 1700, z: e.z + out2.z * 1700 };
  const gy = await g((p) => window.__game.query.field(p.x, 0, p.z).height, start);
  for (const h of [40, 150]) {
    await g((a) => window.__game.camera.setPose({ x: a.start.x, y: a.gy + a.h, z: a.start.z }, { x: a.t.x, y: a.gy + 700, z: a.t.z }), { start, gy, t, h });
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await wait.frames(2);
    await shot(`start-view-${h}`);
  }
  return { run, start, nCars, carU };
};
