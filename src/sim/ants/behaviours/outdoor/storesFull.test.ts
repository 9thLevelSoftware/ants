// Stores full (GDD 02 §5.5 item 5: "need = 0 and failed unloads suppress activation"; colony-life round 6, fix SF).
// A trip is worth what the stores can take of it when the forager is home: crop food the pool has no room for is
// refused at the unload. Sweep 5: 48 of kitchen-door #1's 155 trips (43 of 79 in kitchen-door #2) came home with
// honeydew to full carbohydrate stores while the protein stores were 0, failed, and aged their ants outside at 3x the
// nest rate. Rules: (1) a source scores by the part of its nutrients the pool has room for; (2) a herd tender does not
// leave for her herd while the pool has no room for her crop.

import { describe, expect, it } from 'vitest';
import { colonySlotBit } from '@/sim/entities';
import { herdSourceOf } from '@/sim/ecology';
import { poolSpace } from '@/sim/colony';
import { addHerd, fixWeather, plantSim, stepTicks } from '@/sim/ecology/plants/testkit';
import { TICKS_PER_DAY } from '@/sim/time';
import { sourceScore } from './choice';
import { announce, forageScenario } from './testkit';

describe('stores full (GDD 02 §5.5 item 5)', () => {
  it('a sugar source is worth nothing while the pool has no room for carbohydrate; a protein source still is', () => {
    const { sim, col, sources } = forageScenario({
      workers: 6, stores: { c: 0.5, p: 0 },
      sources: [
        { kind: 'sugar', variant: 'sugary-spill', distBu: 60, bearingDeg: 0, units: 4 },
        { kind: 'carrion', variant: 'insect-small', distBu: 60, bearingDeg: 90, units: 1 },
      ],
    });
    const [sugar, carrion] = sources;
    announce(sim, col, sugar);
    announce(sim, col, carrion);
    for (let t = 0; t < 120; t++) sim.tick(); // the colony cycle counts the workers and sets the pool capacity
    const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
    expect(sourceScore(sim, ant, sugar)).toBeGreaterThan(0);
    const pBefore = sourceScore(sim, ant, carrion);
    expect(pBefore).toBeGreaterThan(0);
    // carbohydrate up to the pool's room for it (the cheat would book more than the pool holds)
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: poolSpace(col).c, p: 0, toxin: 0 });
    sim.applyPendingCommands();
    expect(poolSpace(col).c).toBeLessThan(1e-6);
    expect(poolSpace(col).p).toBeGreaterThan(0.1); // the stomachs' protein share
    expect(sourceScore(sim, ant, sugar)).toBe(0);
    expect(sourceScore(sim, ant, carrion)).toBeGreaterThan(0);
  });

  it('herd tenders wait in the nest while the pool cannot take their crop, and go out again once it can', () => {
    const restoreWeather = fixWeather(22);
    try {
      const { sim, plants } = plantSim({ workers: 12, sizeBu: 200, herbs: [{ dx: -20, dz: -30 }], seed: 2 });
      const col = sim.state.colonies[0];
      const h = addHerd(sim, plants[0], 100);
      herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
      sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 500, p: 5, toxin: 0 });
      sim.applyPendingCommands();
      const tendersOut = (): number => sim.state.ants.filter((a) => a.alive && a.task === 'tend' && a.nestId < 0).length;
      let maxOut = 0, tenders = 0;
      for (let t = 0; t < 0.15 * TICKS_PER_DAY; t += 50) {
        stepTicks(sim, 50);
        maxOut = Math.max(maxOut, tendersOut());
        tenders = Math.max(tenders, sim.state.ants.filter((a) => a.alive && a.task === 'tend').length);
      }
      expect(poolSpace(col).c).toBeLessThan(1);
      expect(tenders).toBeGreaterThan(0); // the herd is the colony's: tenders are assigned
      expect(maxOut).toBe(0);
      sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 1, p: 1 });
      sim.applyPendingCommands();
      let out = 0;
      for (let t = 0; t < 0.15 * TICKS_PER_DAY && out === 0; t += 50) { stepTicks(sim, 50); out = tendersOut(); }
      expect(out).toBeGreaterThan(0);
    } finally {
      restoreWeather();
    }
  }, 120_000);
});
