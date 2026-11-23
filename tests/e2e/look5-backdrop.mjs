// look-pass-5 item 2: the boundary backdrop (house facade, fence, shrubs, trees, parked cars) at ant height and raised, at the tiers in TIERS.
//   TREATMENT=road|garden|house|woods|park  TIERS=low,medium,high  node tools/harness/play.mjs --root . \
//     --query "test=1&seed=1&archetype=car-park-verge&size=compact&autostart=1&quality=low" --script tests/e2e/look5-backdrop.mjs --out <dir>
// For each tier: ant-0 (300 mm inside the edge, 12 mm up, looking out at the runs), meta-edge (2.5 m up, 5 m inside) and meta-high (9 m up).
export default async ({ page, log, out, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  const treatment = process.env.TREATMENT ?? 'road';
  const tiers = (process.env.TIERS ?? 'low,medium,high').split(',');
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(20));
  await g(() => { const s = window.__hud.game.session.sim.state; const tpd = 6000; const ct = s.env.calendar.startTick + s.tick; window.__game.command({ type: 'cheat.setTime', tick: Math.floor(ct / tpd) * tpd + 0.55 * tpd }); window.__game.command({ type: 'cheat.setWeather', state: 'clear', intensityClass: 0 }); });
  await g(() => window.__game.step(2));
  const info = await g(async (t) => {
    const b = await import('/src/render/world/boundary/index.ts');
    const w = window.__hud.game.session.sim.world;
    const runs = b.edgeRuns(w).filter((r) => r.treatment === t);
    return { size: w.size, runs: runs.map((r) => ({ side: r.side.index, u0: r.u0, u1: r.u1, out: r.side.out })) };
  }, treatment);
  log('runs', JSON.stringify(info));
  if (!info.runs.length) return { error: `no ${treatment} run in this world` };
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.step(2));
  const run = info.runs.sort((a, b) => (b.u1 - b.u0) - (a.u1 - a.u0))[0];
  const at = (u) => (run.side === 0 ? { x: u, z: 0 } : run.side === 1 ? { x: info.size, z: u } : run.side === 2 ? { x: u, z: info.size } : { x: 0, z: u });
  const o = run.out, L = run.u1 - run.u0;
  const pose = async (name, u, inset, h, dist, lookH) => {
    const e = at(u);
    const c = { x: e.x - o.x * inset, z: e.z - o.z * inset }, t = { x: e.x + o.x * dist, z: e.z + o.z * dist };
    const gy = await g((p) => window.__game.query.field(p.x, 0, p.z).height, c);
    await g((a) => window.__game.camera.setPose({ x: a.c.x, y: a.gy + a.h, z: a.c.z }, { x: a.t.x, y: a.gy + a.lookH, z: a.t.z }), { c, t, gy, h, lookH });
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await wait.frames(2);
    await shot(name);
  };
  for (const q of tiers) {
    await g((id) => window.__game.quality(id), q);
    await pose(`${q}-ant`, run.u0 + 0.45 * L, 300, 12, 1800, 500);
    await pose(`${q}-meta-edge`, run.u0 + 0.45 * L, 5000, 2500, 2000, 400);
    await pose(`${q}-meta-high`, run.u0 + 0.45 * L, 12000, 9000, 0, 0);
  }
  return { run };
};
