// locomotionSystem: determinism (criterion 6), nest membership and the entity index, LOD keeps the kernel's
// invariant, carve changes reach walkers, soak invariants (GDD 04 E20 bounds).
import { describe, expect, it } from 'vitest';
import { rngClone } from '@/core/rng';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { commandsSystem } from '@/sim/systems';
import { collectInvariants } from '@/sim/testing/invariants';
import { locomotionSystem, locoStats, navTo, navToTarget, navWander, notifySurfaceChanged, setLocoObserver } from './index';
import { busyScenario } from './scenario';
import { clearance, deepestChamber, locoSim, playerNest, runUntilDone, v3, workers } from './testkit';

describe('locomotion system', () => {
  it('criterion 6: same seed, same final positions (and the same state hash)', () => {
    const run = () => {
      const sc = busyScenario(120, 21, 500);
      for (let t = 0; t < 600; t++) { sc.feed(); sc.sim.tick(); }
      return { pos: sc.ants.map((a) => [a.pos.x, a.pos.y, a.pos.z]), hash: stateHash(sc.sim.state) };
    };
    const a = run(), b = run();
    expect(a.pos).toEqual(b.pos);
    expect(a.hash).toBe(b.hash);
  }, 120_000);

  it('determinism across save / load: a restored sim continues exactly like the original', () => {
    const sc = busyScenario(150, 13, 500);
    for (let t = 0; t < 300; t++) { sc.feed(); sc.sim.tick(); }
    const bytes = snapshot(sc.sim);
    const rng = rngClone(sc.rng);
    for (let t = 0; t < 300; t++) { sc.feed(); sc.sim.tick(); }
    const h1 = stateHash(sc.sim.state);
    // the copy: restored state, same static world, a fresh runtime (caches rebuilt), the feeder's RNG rewound
    const sim2 = createSim(restore(bytes).state, sc.sim.world, { systems: [commandsSystem, locomotionSystem] });
    const nest = sim2.stores.nests.get(sim2.state.colonies[0].nestIds[0])!;
    setLocoObserver(sim2, nest.origin);
    sc.sim = sim2;
    sc.rng.splice(0, sc.rng.length, ...rng);
    sc.ants.splice(0, sc.ants.length, ...workers(sim2));
    for (let t = 0; t < 300; t++) { sc.feed(); sim2.tick(); }
    expect(stateHash(sim2.state)).toBe(h1);
  }, 120_000);

  it('maintains nestId / chamberId and medium on the way out and back in', () => {
    const sim = locoSim({ nest: 'small', workers: 3, sizeBu: 300 });
    const bu = sim.world.bu;
    const nest = playerNest(sim), deep = deepestChamber(nest);
    const ants = workers(sim);
    const e = nest.entrances[0];
    for (const a of ants) navTo(sim, a, v3(e.pos.x - 40 * bu, 0, e.pos.z), 2 * bu, { speed: 6 * bu });
    const seen = new Set<string>();
    runUntilDone(sim, ants, 2000, () => { for (const a of ants) seen.add(`${a.nestId}:${a.medium}`); });
    for (const a of ants) {
      expect(a.nestId).toBe(-1);
      expect(a.chamberId).toBe(-1);
      expect(a.medium).toBe('surface');
      expect(a.mem.homeEntranceId).toBe(e.id);
    }
    expect(seen.has(`${nest.id}:cavity`)).toBe(true);
    for (const a of ants) navToTarget(sim, a, { kind: 'chamber', id: deep.id, pos: deep.center }, bu, { speed: 6 * bu });
    runUntilDone(sim, ants, 2000);
    for (const a of ants) {
      expect(a.nav.status).toBe('arrived');
      expect(a.nestId).toBe(nest.id);
      expect(a.chamberId).toBe(deep.id);
      expect(a.mem.crumbLen).toBe(0); // crumbs cleared on entering the nest
    }
  });

  it('refreshes the entity index after moving everybody', () => {
    const sim = locoSim({ nest: 'small', workers: 5, sizeBu: 300 });
    const bu = sim.world.bu;
    const a = workers(sim)[0];
    navTo(sim, a, v3(a.pos.x - 40 * bu, 0, a.pos.z), bu, { speed: 6 * bu });
    for (let t = 0; t < 50; t++) sim.tick();
    const ids: number[] = [];
    sim.index.queryAnts(a.pos, 0.5 * bu, ids);
    expect(ids).toContain(a.id);
  });

  it('LOD: far walkers step every 2-4 ticks and still satisfy the free-space invariant', () => {
    const sc = busyScenario(300, 5, 700);
    const free = collectInvariants().filter((i) => i.name === 'walker-free-space' || i.name === 'walker-finite' || i.name === 'walker-in-bounds');
    const bad: string[] = [];
    for (let t = 0; t < 1200; t++) {
      sc.feed(); sc.sim.tick();
      if (t % 100 === 0) for (const inv of free) inv.check(sc.sim, (d) => bad.push(`${inv.name}: ${d}`));
    }
    const st = locoStats(sc.sim);
    expect(bad).toEqual([]);
    expect(st.lodSkipped).toBeGreaterThan(0.1 * st.stepped);
    expect(st.walkerFailed).toBeLessThan(0.001 * st.stepped);
  }, 120_000);

  it('carve changes and notifySurfaceChanged make nearby walkers re-attach and replan', () => {
    const sim = locoSim({ sizeBu: 200 });
    const bu = sim.world.bu;
    const ant = sim.state.ants[0];
    navWander(sim, ant, ant.pos, 0, { speed: 0 });
    sim.tick(); // the locomotion runtime (and its carve listener) exists from the first tick
    const p = { ...ant.pos };
    sim.kernel.carveSphere(v3(p.x, p.y - 0.5 * bu, p.z), 1.5 * bu, { force: true });
    sim.tick();
    expect(locoStats(sim).surfaceChanged).toBeGreaterThan(0);
    for (let t = 0; t < 30; t++) sim.tick();
    expect(clearance(sim, ant)).toBeGreaterThanOrEqual(0.3);
    expect(ant.medium).not.toBe('air');
    notifySurfaceChanged(sim, v3(p.x - bu, p.y - bu, p.z - bu), v3(p.x + bu, p.y + bu, p.z + bu));
    expect(ant.nav.loco?.planTick).toBe(-1);
  });

  it('exports the world-bounds invariant to the soak tool', () => {
    expect(collectInvariants().some((i) => i.name === 'walker-in-bounds')).toBe(true);
  });
});
