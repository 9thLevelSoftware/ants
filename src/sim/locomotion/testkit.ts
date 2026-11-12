// Test support for locomotion tests (not used by the game): sims that run only the locomotion system, worker
// placement in a chamber, stepping until every walker finished, and the kernel's free-space check.

import type { Vec3 } from '@/core/math/vec3';
import { rngFork, rngRange } from '@/core/rng';
import type { Ant, Chamber, Nest, Sim, Walker } from '@/sim/types';
import { makeTestSim, type TestSimOptions } from '@/sim/testing/testWorld';
import { commandsSystem } from '@/sim/systems';
import { locomotionSystem } from './system';
import { placeOnSurface } from './index';

/** A test sim that runs only the commands and locomotion systems. */
export function locoSim(opts: TestSimOptions = {}): Sim {
  return makeTestSim({ systems: [commandsSystem, locomotionSystem], ...opts });
}

export function workers(sim: Sim): Ant[] {
  return sim.state.ants.filter((a) => a.alive && a.caste === 'worker');
}

export function playerNest(sim: Sim): Nest {
  const n = sim.stores.nests.get(sim.state.colonies[0].nestIds[0]);
  if (!n) throw new Error('no player nest');
  return n;
}

/** The deepest chamber of the small test nest. */
export function deepestChamber(nest: Nest): Chamber {
  return nest.chambers.reduce((a, c) => (c.center.y < a.center.y ? c : a));
}

/** Places the ants on the floor of a chamber at seeded random spots (nestId / chamberId set). */
export function placeInChamber(sim: Sim, ants: readonly Ant[], nest: Nest, c: Chamber, seed = 3): void {
  const rng = rngFork(seed, 'loco-test-place');
  for (const a of ants) {
    const ang = rngRange(rng, 0, 2 * Math.PI), s = Math.sqrt(rngRange(rng, 0, 1)) * 0.6;
    const p = { x: c.center.x + Math.cos(ang) * c.radii.x * s, y: c.center.y, z: c.center.z + Math.sin(ang) * c.radii.z * s };
    if (!placeOnSurface(sim, a, p, { x: 0, y: -1, z: 0 })) throw new Error('placeInChamber: no floor');
    a.nestId = nest.id;
    a.chamberId = c.id;
  }
}

/** Steps until no walker in `list` is 'moving' (or maxTicks). Calls onTick after each tick. Returns ticks run. */
export function runUntilDone(sim: Sim, list: readonly Walker[], maxTicks: number, onTick?: (t: number) => void): number {
  let t = 0;
  for (; t < maxTicks; t++) {
    sim.tick();
    onTick?.(t + 1);
    let moving = false;
    for (const w of list) if (w.nav.status === 'moving') { moving = true; break; }
    if (!moving) return t + 1;
  }
  return t;
}

/** f(p) of a walker relative to its foot offset (>= 0.3 = the kernel's guard). */
export function clearance(sim: Sim, w: Walker): number {
  return sim.field.sample(w.pos) / w.footOffset;
}

export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
