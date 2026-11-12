// Test support: a busy mixed locomotion scenario for determinism, soak and performance tests. N workers start in
// the small nest of a test world with terrain, rocks and the standard features; each gets seeded random requests
// (surface trips, wander, trips back into chambers, retrace home) and a new one whenever the last ended.

import { rngFork, rngFloat, rngInt, type RngState } from '@/core/rng';
import type { Ant, Sim } from '@/sim/types';
import { locoSim, playerNest, workers } from './testkit';
import { navRetrace, navTo, navToTarget, navWander, setLocoObserver } from './index';

export interface Scenario {
  sim: Sim;
  ants: Ant[];
  rng: RngState;
  /** Issues new requests to walkers whose last request ended. */
  feed(): void;
}

export function busyScenario(n: number, seed = 11, sizeBu = 700): Scenario {
  let sim = locoSim({ nest: 'small', workers: n, sizeBu, terrain: 'noise', prims: 60, features: 'all', seed });
  const bu = sim.world.bu, size = sim.world.size;
  const ants = workers(sim);
  const rng = rngFork(seed, 'loco-scenario');
  const nest = playerNest(sim);
  const margin = 40 * bu;
  const point = () => {
    const x = margin + rngFloat(rng) * (size - 2 * margin), z = margin + rngFloat(rng) * (size - 2 * margin);
    return { x, y: sim.field.height(x, z), z };
  };
  const issue = (a: Ant) => {
    const r = rngFloat(rng);
    const speed = (4 + 4 * rngFloat(rng)) * bu;
    if (r < 0.45) navTo(sim, a, point(), 3 * bu, { speed });
    else if (r < 0.7) navWander(sim, a, point(), 20 * bu + rngFloat(rng) * 40 * bu, { speed });
    else if (r < 0.9) {
      const c = nest.chambers[rngInt(rng, 0, nest.chambers.length - 1)];
      navToTarget(sim, a, { kind: 'chamber', id: c.id, pos: c.center }, bu, { speed });
    } else if (!navRetrace(sim, a, { speed })) navTo(sim, a, point(), 3 * bu, { speed });
  };
  // the observer (camera focus) at the nest: the far map runs at coarse LOD
  setLocoObserver(sim, nest.origin);
  const sc: Scenario = {
    get sim() { return sim; },
    set sim(v: Sim) { sim = v; },
    ants, rng,
    feed() {
      for (const a of ants) {
        const s = a.nav.status;
        // wanderers get a new job now and then, everybody else when the last request ended
        if (s !== 'moving' || (a.nav.mode === 'wander' && rngFloat(rng) < 0.002)) issue(a);
      }
    },
  };
  return sc;
}
