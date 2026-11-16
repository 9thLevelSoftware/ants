import { writeFileSync } from 'node:fs';
// Acceptance screenshots of the fx demo on the test world (real sim, real trail laid by the colony's foragers).
// Usage (from the project root; one harness at a time):
//   node tools/harness/play.mjs --root spikes/fx-demo --query "test=1&ticks=2000" --script spikes/fx-demo/scripts/shots.mjs \
//        --out test-output/scent-fx/shots --timeout 120000 --script-timeout 900000
// Optional env FX_SHOTS=trail,alarm to take a subset.
const W = (fn, arg) => [fn.toString(), arg];

/** PNG of the canvas taken in the same task as the render (page screenshots time out on a loaded machine). */
const png = () => document.querySelector('canvas').toDataURL('image/png');

export default async ({ page, log, out }) => {
  const only = (process.env.FX_SHOTS ?? '').split(',').filter(Boolean);
  const want = (name) => !only.length || only.some((o) => name.includes(o));
  const result = {};
  const run = async (name, fn, arg) => {
    if (!want(name)) return;
    const [info, data] = await page.evaluate(([src, a, cap]) => {
      const r = (0, eval)(`(${src})`)(window.__fx, a);
      return [r, (0, eval)(`(${cap})`)()];
    }, [...W(fn, arg), png.toString()]);
    log(name, JSON.stringify(info));
    result[name] = info;
    writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  };


  await page.evaluate(() => window.__fx.effects(true, true));

  await run('01-trail-scent', (fx) => {
    fx.view('trail'); fx.overlay('scent', true);
    fx.render(0);
    return fx.stats().fx;
  });
  await run('02-wall-scent', (fx) => { fx.view('wall'); fx.render(0); return fx.stats().fx; });
  await run('03-home-range', (fx) => { fx.view('home'); fx.render(0); return fx.stats().fx; });

  // alarm: a worker outside releases alarm and sprays acid; effects advance with the sim for a few ticks
  await run('04-alarm-puff', (fx) => {
    const s = fx.scenario();
    fx.overlay('scent', false);
    const bu = fx.sim().world.bu;
    const p = { x: s.entrance.pos.x - 20 * bu, y: 0, z: s.entrance.pos.z - 12 * bu };
    fx.possessNear(p, { x: -0.6, y: 0, z: 0.8 });
    fx.setCamera({ x: p.x + 9 * bu, y: 6 * bu, z: p.z + 11 * bu }, { x: p.x, y: 0.8 * bu, z: p.z });
    fx.act('release-alarm');
    fx.play(14);
    fx.act('spray-acid');
    fx.play(4);
    return fx.stats().fx;
  });
  await run('05-alarm-scent', (fx) => { fx.overlay('scent', true); fx.render(0); return fx.stats().fx; });

  // dig debris: a worker bites into the loam outside
  await run('06-dig-debris', (fx) => {
    fx.clear();
    const s = fx.scenario();
    const bu = fx.sim().world.bu;
    const p = { x: s.entrance.pos.x + 10 * bu, y: 0, z: s.entrance.pos.z + 16 * bu };
    const id = fx.possessNear(p, { x: 0, y: 0, z: 1 });
    fx.setCamera({ x: p.x + 6 * bu, y: 4.5 * bu, z: p.z - 5 * bu }, { x: p.x, y: 0, z: p.z + 1 * bu });
    fx.act('dig-bite');
    const before = fx.stats().fx.emitted;
    fx.play(30, 0.05, false);
    // frame the moment just after one of this ant's bites: grains in the air and the earlier ones settled
    const pool = fx.fx.parts.particles.fx;
    const near = () => { let n = 0; for (let i = 0; i < pool.count; i++) if (Math.abs(pool.position[i * 3] - p.x) < 6 * bu && Math.abs(pool.position[i * 3 + 2] - p.z - 2 * bu) < 6 * bu) n++; return n; };
    for (let k = 0; k < 80; k++) { const n0 = near(); fx.play(1, 0.05, false); if (near() > n0) break; }
    fx.play(3, 0.05);
    const ant = fx.sim().stores.ants.get(id);
    const parts = [];
    for (let i = 0; i < Math.min(4, pool.count); i++) parts.push([pool.position[i * 3], pool.position[i * 3 + 1], pool.position[i * 3 + 2]].map((v) => +v.toFixed(1)));
    return { ...fx.stats().fx, emittedHere: fx.stats().fx.emitted - before, ant: [ant.pos.x, ant.pos.y, ant.pos.z].map((v) => +v.toFixed(1)), action: ant.action?.id ?? null, possessed: fx.sim().state.player.possessedAntId === id, parts };
  });

  // underground motes around a brood pile in the royal chamber, with the queen
  await run('07-motes-brood', (fx) => {
    fx.clear();
    const sim = fx.sim(), s = fx.scenario();
    const nest = sim.stores.nests.get(s.colony.nestIds[0]);
    const royal = nest.chambers.find((c) => c.type === 'royal');
    fx.command({ type: 'cheat.spawnBrood', colonyId: s.colony.id, stage: 'larva', n: 10, chamberId: royal.id, progress: 0.5, destined: null });
    fx.command({ type: 'cheat.spawnBrood', colonyId: s.colony.id, stage: 'egg', n: 12, chamberId: royal.id, progress: 0.3, destined: null });
    const queen = sim.state.ants.find((a) => a.caste === 'queen');
    fx.command({ type: 'cheat.teleport', antId: queen.id, pos: { x: royal.center.x + royal.radii.x * 0.4, y: royal.center.y - royal.radii.y, z: royal.center.z } });
    fx.step(3);
    fx.view('royal');
    fx.settle(14);
    fx.play(20, 0.1, false);
    fx.render(0);
    return { ...fx.stats().fx, brood: sim.state.brood.filter((b) => b.alive).length };
  });
  await run('08-motes-scent', (fx) => { fx.overlay('scent', true); fx.render(0); return fx.stats().fx; });

  // temperature and moisture: shots-garden.mjs (varied surfaces); here the threat overlay
  await run('10-threats', (fx) => {
    const sim = fx.sim(), s = fx.scenario(), bu = sim.world.bu;
    fx.command({ type: 'cheat.spawnCreature', kind: 'wolf-spider', variant: null, pos: { x: s.entrance.pos.x - 6 * bu, y: 0, z: s.entrance.pos.z + 40 * bu }, state: null });
    fx.step(2);
    fx.view('overview');
    fx.overlay('threats', true);
    fx.render(0);
    return { ...fx.stats().fx, creatures: sim.state.creatures.filter((c) => c.alive).map((c) => c.kind) };
  });
  await run('11-pattern-only', (fx) => {
    fx.clear();
    fx.palette('pattern-only');
    fx.view('trail');
    fx.overlay('scent', true);
    fx.render(0);
    fx.palette('okabe-ito');
    return fx.stats().fx;
  });
  await page.evaluate(() => window.__fx.dispose());
  return result;
};
