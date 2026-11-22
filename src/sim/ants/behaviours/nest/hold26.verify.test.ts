// Independent review of colony-life round 12 (D32, direction 26 item 4a): an ant outside is held back only from
// water at least FLEE_WATER_DEPTH_BU deep over her destination's floor. The round's own film test
// (hygiene26.test.ts) passes on the round's base tree too (c2ed6cb, where any water > 0 held her), so it does not
// show the fix. This test first measures the water over the destination with the reader the hold uses
// (waterDepthOver through waterView) and requires a real film there (0 < depth < the flee depth), then requires that
// she is not held. On the base tree it must fail; on the round's tree it must pass.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { FLEE_WATER_DEPTH_BU, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { spillFor } from '@/sim/nest/flood/runtime';
import { waterDepthOver } from '@/sim/nest/flood/spill';
import { waterView } from '@/sim/nest/flood/dryPlace';
import { navTo } from '@/sim/locomotion';
import { isFleeingWater } from './fleeWater';
import { makeNestColony, run, type NestColony } from './testkit';

/** Sets the nest's water to the smallest volume that wets the royal floor by more than `minBu` (searching volumes). */
function filmOnRoyal(k: NestColony, minBu: number, maxBu: number, dest: { x: number; y: number; z: number }): number {
  const { sim, nest } = k;
  const cache = spillFor(sim, nest);
  const bu = sim.world.bu;
  for (let i = 1; i < cache.cumVol.length; i++) {
    // try the volumes between two layer marks in tenths
    for (let f = 1; f <= 10; f++) {
      nest.flood.water = cache.cumVol[i - 1] + (f / 10) * (cache.cumVol[i] - cache.cumVol[i - 1]);
      run(sim, FLOOD_STEP_TICKS + 1);
      const w = waterView(sim, nest);
      if (!w) continue;
      const d = waterDepthOver(w.cache, sim.carve.voxel, dest.x, dest.y, dest.z, w.level, -Infinity) / bu;
      if (d > minBu && d < maxBu) return d;
      if (d >= maxBu) return d;
    }
  }
  return -Infinity;
}

function workerOutsideTo(k: NestColony, sim: Sim, dest: { x: number; y: number; z: number }) {
  const bu = sim.world.bu;
  const w = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker' && !isFleeingWater(a))!;
  const x = k.entrance.pos.x + 8 * bu, z = k.entrance.pos.z;
  w.pos = { x, y: sim.field.height(x, z) + w.footOffset, z };
  w.up = { x: 0, y: 1, z: 0 };
  w.nestId = -1; w.chamberId = -1;
  expect(navTo(sim, w, dest, bu)).toBe(true);
  return w;
}

describe('round 12 review: a measured film over the destination floor does not hold a worker outside', () => {
  it('water 0 < depth < FLEE_WATER_DEPTH_BU over her destination: not held', () => {
    const k = makeNestColony({ workers: 6, seed: 3, stores: { c: 100, p: 100 } });
    const { sim } = k;
    floodCheats(sim.state).drainScale = 0;
    floodCheats(sim.state).rainI = 0;
    run(sim, 50);
    const dest = { x: k.royal.center.x, y: k.royal.center.y - k.royal.radii.y, z: k.royal.center.z };
    const depth = filmOnRoyal(k, 0.01, FLEE_WATER_DEPTH_BU, dest);
    // the precondition the round's film test never checked: there is water over her destination, under the flee depth
    expect(depth, 'measured water over the destination, BU').toBeGreaterThan(0.01);
    expect(depth).toBeLessThan(FLEE_WATER_DEPTH_BU);
    const w = workerOutsideTo(k, sim, dest);
    let held = 0;
    for (let t = 0; t < 4; t++) {
      run(sim, FLOOD_STEP_TICKS);
      if (isFleeingWater(w)) held++;
    }
    expect(held).toBe(0);
  }, 120_000);
});
