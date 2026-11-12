// beh-nest acceptance 3 (GDD 02 §10.4.1, App. E 19; GDD 03 App. E 21): with the deep (royal) chamber warm and the
// shallow (nursery) cold, nurses move the brood to the warm chamber; reversed, they move it back. GDD 02 E19 gives
// 180 s for 10 larvae and 2 nurses; GDD 03 E21 a job within 250 ticks and >= 8 larvae moved within 3,000 ticks.
// Plus unit checks of the sorting score and its trigger margin.
import { describe, expect, it } from 'vitest';
import type { Chamber } from '@/sim/types';
import { chamberScore } from './sorting';
import { boardOf, Job } from './board';
import { forceClimate, makeNestColony } from './testkit';

function chamberLike(type: Chamber['type'], temp: number, rh: number): Chamber {
  const load = () => ({ adults: 0, brood: 0, food: 0, other: 0 });
  return {
    id: 1, type, designatedBy: 'auto', center: { x: 0, y: 0, z: 0 }, radii: { x: 1, y: 1, z: 1 }, volume: 100, floorArea: 1,
    depthBu: 10, depthMm: 40, roofMin: 5, covered: false, seedVoxel: 0, voxelCount: 1, capacity: { ...load(), brood: 150 },
    occupancy: load(), temp, humidity: rh, wetUntilTick: -1, flooded: 0, floodRisk: 0, flags: 0, createdTick: 0,
  };
}

describe('brood sorting score (GDD 02 §10.4.1)', () => {
  it('warmer (to the r(T) plateau) and humid chambers score higher; food chambers never hold brood', () => {
    const k = makeNestColony({ workers: 0 });
    const def = k.sim.species;
    const cold = chamberScore(def, chamberLike('general', 17, 0.85), 1, 0, 0);
    const warm = chamberScore(def, chamberLike('general', 27, 0.85), 1, 0, 0);
    expect(warm).toBeGreaterThan(cold * 1.15 + 0.05);
    expect(chamberScore(def, chamberLike('general', 27, 0.45), 1, 0, 0)).toBeLessThan(warm);
    expect(chamberScore(def, chamberLike('food', 27, 0.85), 1, 0, 0)).toBe(0);
    // nursery bonus, royal egg bonus, crowding
    expect(chamberScore(def, chamberLike('nursery', 27, 0.85), 1, 0, 0)).toBeCloseTo(warm + 0.1, 6);
    expect(chamberScore(def, chamberLike('royal', 27, 0.85), 0, 0, 0)).toBeCloseTo(chamberScore(def, chamberLike('general', 27, 0.85), 0, 0, 0) + 0.1, 6);
    expect(chamberScore(def, chamberLike('general', 27, 0.85), 1, 150, 0)).toBeCloseTo(0, 9);
  });
});

describe('beh-nest brood sorting by microclimate (acceptance 3)', () => {
  it('nurses move brood to the warm chamber, and back when the temperatures are reversed', () => {
    const k = makeNestColony({
      workers: 40, stores: { c: 200, p: 200 },
      brood: [{ stage: 'larva', n: 10, chamber: 'nursery', progress: 0.3 }, { stage: 'pupa', n: 6, chamber: 'nursery', progress: 0.1 }],
    });
    const { sim, nursery, royal } = k;
    // fed larvae, so the first minutes are about sorting (GDD 02 E19 has no feeding pressure)
    for (const b of sim.stores.brood.list) if (b.stage === 'larva') { b.gutC = 0.08; b.gutP = 0.22; }
    const inRoom = (id: number, stage: string) => sim.stores.brood.list.filter((b) => b.alive && b.stage === stage && b.chamberId === id && b.carriedBy < 0).length;
    const timeline: Record<string, number> = {};
    const phase = (warm: Chamber, cold: Chamber, label: string): void => {
      forceClimate(k, (id) => (id === warm.id ? [27, 0.85] : id === cold.id ? [17, 0.85] : null));
      const t0 = sim.state.tick;
      let jobAt = -1, most = -1, all = -1;
      for (let t = 0; t < 6000 && all < 0; t++) {
        sim.tick();
        if (jobAt < 0 && boardOf(sim, sim.state.colonies[0].id)!.jobs.some((j) => j.kind === Job.move)) jobAt = sim.state.tick - t0;
        const brood = sim.stores.brood.list.filter((b) => b.alive && b.stage !== 'egg');
        const there = brood.filter((b) => b.chamberId === warm.id && b.carriedBy < 0).length;
        if (most < 0 && there >= 0.8 * brood.length) most = sim.state.tick - t0;
        if (there >= brood.length && brood.length > 0) all = sim.state.tick - t0;
      }
      timeline[`${label}.firstMoveJobTicks`] = jobAt;
      timeline[`${label}.eightyPercentTicks`] = most;
      timeline[`${label}.allTicks`] = all;
      timeline[`${label}.larvae`] = inRoom(warm.id, 'larva');
      timeline[`${label}.pupae`] = inRoom(warm.id, 'pupa');
    };
    phase(royal, nursery, 'deepWarm');
    phase(nursery, royal, 'reversed');
    console.log('[beh-nest AC3]', JSON.stringify(timeline));
    for (const label of ['deepWarm', 'reversed']) {
      expect(timeline[`${label}.firstMoveJobTicks`]).toBeGreaterThanOrEqual(0);
      expect(timeline[`${label}.firstMoveJobTicks`]).toBeLessThanOrEqual(250);
      expect(timeline[`${label}.eightyPercentTicks`]).toBeGreaterThanOrEqual(0);
      expect(timeline[`${label}.eightyPercentTicks`]).toBeLessThanOrEqual(3000);
      expect(timeline[`${label}.allTicks`]).toBeGreaterThanOrEqual(0);
    }
  }, 600_000);
});
