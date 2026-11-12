// Derived, never-persisted helpers of the nest module, one set per Sim (created on first use, so a Sim built by
// createSim after a load starts from scratch). Nothing here may change simulation results: every cache is a pure
// function of the persisted state, and the dirty flags only let the system skip work whose result would be the
// same (all nests start dirty).

import type { Sim } from '@/sim/types';
import type { CarveChange } from './carve/grid';
import { FlagStore } from './flags';
import type { PlanCache } from './plans/targets';

export interface NestRuntime {
  flags: FlagStore;
  /** Nests whose carved space (or mound, cover) changed since their last chamber detection. */
  dirtyNests: Set<number>;
  /** Every nest is dirty (new runtime, bulk edit). */
  allDirty: boolean;
  /** Breach records of the carve grid already turned into entrances (or found not to be one). */
  breachSeen: number;
  /** Plan geometry and target voxels by plan id (rebuilt from the plan record). */
  geom: Map<number, PlanCache>;
  /** cheat.setChamberClimate overrides (debug only, not saved). */
  climate: Map<number, { temp: number; rh: number }>;
}

const RUNTIMES = new WeakMap<Sim, NestRuntime>();

export function nestRuntime(sim: Sim): NestRuntime {
  let rt = RUNTIMES.get(sim);
  if (rt) return rt;
  const made: NestRuntime = {
    flags: new FlagStore(sim.state.worldDelta.carveFlags),
    dirtyNests: new Set(),
    allDirty: true,
    breachSeen: sim.carve.breaches.length,
    geom: new Map(),
    climate: new Map(),
  };
  sim.carve.addListener((_c: CarveChange) => { made.allDirty = true; });
  RUNTIMES.set(sim, made);
  return made;
}

/** Marks one nest for re-detection (mound or cover changes that the carve listener does not see). */
export function markNestDirty(sim: Sim, nestId: number): void {
  nestRuntime(sim).dirtyNests.add(nestId);
}

/** Should the nest's chambers be re-detected? Clears the flag. */
export function takeNestDirty(sim: Sim, nestId: number): boolean {
  const rt = nestRuntime(sim);
  if (rt.allDirty) {
    rt.allDirty = false;
    // every other nest stays dirty until its own turn
    for (const n of sim.state.nests) if (n.alive && n.id !== nestId) rt.dirtyNests.add(n.id);
    return true;
  }
  return rt.dirtyNests.delete(nestId);
}
