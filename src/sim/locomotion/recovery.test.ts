// Criterion 5: carving and filling tunnels while walkers are en route triggers recovery; every walker arrives or
// reports 'failed' within a bound. Also the recovery ladder on a walker that cannot make progress.
import { describe, expect, it } from 'vitest';
import { nestFieldId } from '@/sim/types';
import { locoStats, navTo, navToTarget } from './index';
import { clearance, deepestChamber, locoSim, placeInChamber, playerNest, runUntilDone, v3, workers } from './testkit';

const EXIT = { kind: 'exit', id: -1 } as const;
/** Every request ends within this many ticks (bounded by stuck episodes, relocations and the request timeout). */
const BOUND = 6000;

describe('recovery when the nest changes under walkers', () => {
  it('criterion 5a: a tunnel filled shut while walkers climb out: those above arrive, those below fail', () => {
    const sim = locoSim({ nest: 'small', workers: 40, sizeBu: 300 });
    const bu = sim.world.bu;
    const nest = playerNest(sim), deep = deepestChamber(nest), e = nest.entrances[0];
    const ants = workers(sim);
    placeInChamber(sim, ants, nest, deep);
    const target = v3(e.pos.x - 60 * bu, 0, e.pos.z);
    for (const a of ants) navTo(sim, a, target, 3 * bu, { speed: 6 * bu });
    for (let t = 0; t < 10; t++) sim.tick(); // the first are in the tunnel above the royal chamber, most still inside it
    // fill the tunnel between the nursery and the royal chamber
    const [, nursery, royal] = [...nest.chambers].sort((a, b) => b.center.y - a.center.y);
    const mid = v3((nursery.center.x + royal.center.x) / 2, (nursery.center.y - nursery.radii.y + royal.center.y - royal.radii.y) / 2 + bu,
      (nursery.center.z + royal.center.z) / 2);
    sim.kernel.fillSphere(mid, 3 * bu, {});
    expect(sim.nestNav.distanceAt(nestFieldId(nest.id, EXIT), royal.center)).toBe(Infinity);
    const ticks = runUntilDone(sim, ants, BOUND);
    expect(ticks).toBeLessThan(BOUND);
    const arrived = ants.filter((a) => a.nav.status === 'arrived').length, failed = ants.filter((a) => a.nav.status === 'failed').length;
    // eslint-disable-next-line no-console
    console.log(`LOCO_FILL arrived ${arrived} failed ${failed} in ${ticks} ticks`, JSON.stringify(locoStats(sim)));
    expect(arrived + failed).toBe(ants.length);
    expect(failed).toBeGreaterThan(0);
    for (const a of ants) expect(clearance(sim, a)).toBeGreaterThanOrEqual(0.3);
  });

  it('criterion 5b: carving away the floor of the shaft under walkers: they fall, re-attach, replan and arrive', () => {
    const sim = locoSim({ nest: 'small', workers: 30, sizeBu: 300 });
    const bu = sim.world.bu;
    const nest = playerNest(sim), deep = deepestChamber(nest), e = nest.entrances[0];
    const ants = workers(sim);
    placeInChamber(sim, ants, nest, deep);
    const target = v3(e.pos.x - 60 * bu, 0, e.pos.z);
    for (const a of ants) navTo(sim, a, target, 3 * bu, { speed: 6 * bu });
    const before = locoStats(sim).surfaceChanged;
    // carve big holes along the climb while they walk (the shaft and the food chamber get a new shape)
    for (let t = 0; t < 400; t++) {
      if (t === 60) sim.kernel.carveSphere(v3(e.pos.x + 1.5 * bu, e.pos.y - 3 * bu, e.pos.z + 0.5 * bu), 3 * bu, { force: true });
      if (t === 120) sim.kernel.carveSphere(nest.chambers[0].center, 5 * bu, { force: true });
      sim.tick();
    }
    const ticks = runUntilDone(sim, ants, BOUND);
    expect(ticks).toBeLessThan(BOUND);
    const st = locoStats(sim);
    // eslint-disable-next-line no-console
    console.log(`LOCO_CARVE ${ants.filter((a) => a.nav.status === 'arrived').length}/30 arrived`, JSON.stringify(st));
    expect(st.surfaceChanged).toBeGreaterThan(before);
    for (const a of ants) expect(['arrived', 'failed']).toContain(a.nav.status);
    expect(ants.filter((a) => a.nav.status === 'arrived').length).toBeGreaterThanOrEqual(28);
    for (const a of ants) expect(clearance(sim, a)).toBeGreaterThanOrEqual(0.3);
  });

  it('the ladder escalates and ends with failed for an unreachable goal, never looping', () => {
    const sim = locoSim({ nest: 'small', workers: 4, sizeBu: 300 });
    const bu = sim.world.bu;
    const nest = playerNest(sim), deep = deepestChamber(nest);
    const ants = workers(sim);
    placeInChamber(sim, ants, nest, deep);
    // seal the only exit (fill the shaft mouth): the exit field and every trip out become impossible
    const e = nest.entrances[0];
    sim.kernel.fillSphere(v3(e.pos.x + 0.75 * bu, e.pos.y - 1.5 * bu, e.pos.z + 0.25 * bu), 2.5 * bu, {});
    for (const a of ants) navToTarget(sim, a, { kind: 'point', id: -1, pos: v3(e.pos.x - 50 * bu, 0, e.pos.z) }, 2 * bu, { speed: 6 * bu });
    const ticks = runUntilDone(sim, ants, BOUND);
    expect(ticks).toBeLessThan(BOUND);
    for (const a of ants) expect(a.nav.status).toBe('failed');
  });
});
