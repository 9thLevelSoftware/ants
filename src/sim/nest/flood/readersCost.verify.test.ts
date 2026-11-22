// Independent review after colony-life round 8 (F1, `runtime.ts spillForReaders`). F1 makes every flood reader
// (locomotion's water speed through isUnderWater, flee water, flood evacuation, the queen's dry place) answer the
// nest's *current* geometry through `spillFor`, which rebuilds the spill cache (`buildSpill`: a flood fill over the
// whole nest cavity with a substrate-field evaluation per sample) whenever a carve touched the nest's box. The flood
// model itself still rebuilds at most once per FLOOD_REBUILD_TICKS on the nest's rebuild slot (GDD 03 §11.2
// "throttled to 5 game s"), and before F1 the readers used whatever that throttled build left.
//
// Question checked: while a digger works in a wet nest (one bite = one carve; a bite lasts 7-41 ticks, GDD 03 App. E
// 2), do the readers rebuild the geometry more often than the throttled flood model does? This file measures it on
// the small test nest with a carve every 10 ticks and one reader call per tick (in a game: one per walker in water
// per tick). It reports the counts and the build time; the assertion is the GDD's throttle.

import { describe, expect, it } from 'vitest';
import type { Nest, Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { FLOOD_REBUILD_TICKS } from '@/sim/balance/weather';
import { carveSphere } from '../carveOps';
import { playerNest } from '../nestTestKit';
import { floodCheats } from './cheats';
import { neutralSite } from './floodTestKit';
import { floodSystem } from './index';
import { buildSpill } from './spill';
import { spillForReaders, spillPeek } from './runtime';

const SYSTEMS = [commandsSystem, floodSystem];
const RUN_TICKS = 300;
const CARVE_EVERY = 10;

function wetNest(): { sim: Sim; nest: Nest } {
  const sim = makeTestSim({ nest: 'small', systems: SYSTEMS });
  neutralSite(sim);
  floodCheats(sim.state).rainI = 1;
  floodCheats(sim.state).drainScale = 0;
  for (let i = 0; i < 400; i++) sim.tick();
  const nest = playerNest(sim);
  expect(nest.flood.water).toBeGreaterThan(0);
  return { sim, nest };
}

/** Digs a side tunnel out of the lowest chamber, one small sphere every CARVE_EVERY ticks; counts cache rebuilds. */
function dig(readers: boolean): { builds: number; carves: number } {
  const { sim, nest } = wetNest();
  const low = [...nest.chambers].sort((p, q) => p.center.y - q.center.y)[0];
  const bu = sim.world.bu;
  let last = spillPeek(sim, nest.id);
  let builds = 0, carves = 0;
  for (let t = 0; t < RUN_TICKS; t++) {
    if (t % CARVE_EVERY === 0) {
      const x = low.center.x + low.radii.x + (0.3 * carves) * bu;
      carveSphere(sim, { x, y: low.center.y, z: low.center.z }, 0.9 * bu);
      carves++;
    }
    sim.tick();
    if (readers) spillForReaders(sim, nest); // one walker in the water, once a tick
    const now = spillPeek(sim, nest.id);
    if (now !== last) builds++;
    last = now;
  }
  return { builds, carves };
}

describe('review colony-life round 8: F1 readers and the flood rebuild throttle', () => {
  it('a digger in a wet nest: readers rebuild the spill geometry no more often than the throttled flood model', () => {
    const model = dig(false), withReaders = dig(true);
    const { sim, nest } = wetNest();
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) buildSpill(sim, nest);
    const msPerBuild = (performance.now() - t0) / 5;
    const throttleMax = Math.ceil(RUN_TICKS / FLOOD_REBUILD_TICKS) + 1;
    const msg = `${RUN_TICKS} ticks, ${withReaders.carves} carves: flood model alone ${model.builds} builds, with one reader `
      + `a tick ${withReaders.builds} builds (throttle allows ${throttleMax}); buildSpill ${msPerBuild.toFixed(2)} ms on the `
      + `small test nest (${spillForReaders(sim, nest).si.length} samples)`;
    console.log(msg);
    expect(model.builds, msg).toBeLessThanOrEqual(throttleMax);
    expect(withReaders.builds, msg).toBeLessThanOrEqual(throttleMax);
  });
});
