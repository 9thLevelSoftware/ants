// Test helpers of the granary module: a Messor colony in the standard small test nest (src/sim/testing/testNest.ts)
// with castes placed by hand, a granary designated in one of its chambers, and seed nodes near the entrance.

import type { Ant, Caste, Chamber, Sim, Task } from '@/sim/types';
import { makeTestSim } from '@/sim/testing/testWorld';
import { installSmallNest, type SmallNest } from '@/sim/testing/testNest';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { spawnAnt } from '@/sim/entities';
import { walkerPlace } from '@/sim/locomotion/walker';
import { granaryParams, type GranaryParams } from './params';
import { ensureGranary } from './state';
import type { GranaryState } from '@/sim/types';

export interface GranaryKit {
  sim: Sim;
  nest: SmallNest;
  g: GranaryParams;
  /** The chamber designated `granary` (the small nest's food chamber). */
  granaryChamber: Chamber;
  granary: GranaryState;
}

/** A Messor test sim with the small nest; the food chamber becomes the granary. Climate: 22 °C, rh 0.3. */
export function messorKit(opts: { seed?: number; rh?: number; tempC?: number } = {}): GranaryKit {
  const sim = makeTestSim({ species: 'messor-barbarus', seed: opts.seed ?? 1, sizeBu: 160 });
  const nest = installSmallNest(sim);
  const rh = opts.rh ?? 0.3, t = opts.tempC ?? 22;
  setClimateOverride(sim, { chamberTemp: () => t, rh: () => rh, pointTemp: () => t });
  const granaryChamber = nest.chambers[0];
  granaryChamber.type = 'granary';
  const col = sim.state.colonies[0];
  const g = granaryParams(sim.getSpecies(col.species))!;
  const granary = ensureGranary(sim, col.granary!, g, granaryChamber.id);
  return { sim, nest, g, granaryChamber, granary };
}

/** Spawns `n` ants of a caste standing in a chamber of the kit's nest. */
export function addAnts(k: GranaryKit, caste: Caste, n: number, chamber: Chamber, task: Task = 'idle', lengthBu?: number): Ant[] {
  const out: Ant[] = [];
  const col = k.sim.state.colonies[0];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const p = { x: chamber.center.x + Math.cos(a) * chamber.radii.x * 0.3, y: chamber.center.y, z: chamber.center.z + Math.sin(a) * chamber.radii.z * 0.3 };
    const ant = spawnAnt(k.sim, {
      colony: col.id, caste, pos: p, task, ageGd: 3, nestId: k.nest.nest.id, chamberId: chamber.id, lengthBu,
    });
    walkerPlace(k.sim.field, ant, p, { dir: { x: 0, y: -1, z: 0 } }, k.sim.kernel.walker);
    out.push(ant);
  }
  col.core!.workers += n;
  return out;
}
