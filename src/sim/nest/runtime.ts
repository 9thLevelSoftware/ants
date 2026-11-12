// Derived, never-persisted helpers of the nest module, one set per Sim (created on first use, so a Sim built by
// createSim after a load starts from scratch). Nothing here may change simulation results: every cache is a pure
// function of the persisted state (the detection caches are dropped for every chunk a carve can affect), and the
// dirty flags only let the system skip work whose result would be the same (all nests start dirty).

import type { Sim } from '@/sim/types';
import type { CarveChange } from './carve/grid';
import { chunkKey, type VoxelBox } from './carve/keys';
import { CORE_APRON, nestSampleBox } from './chambers/detect';
import { PassGrid } from './chambers/tiles';
import { FlagStore } from './flags';
import type { PlanCache } from './plans/targets';

export interface NestRuntime {
  flags: FlagStore;
  /** Nests whose carved space (or mound, cover) changed since their last chamber detection. */
  dirtyNests: Set<number>;
  /** Every nest is dirty (new runtime, bulk edit). */
  allDirty: boolean;
  /** Chamber core samples (packed keys) per carve chunk; dropped for chunks near a carve (detect.ts). */
  coreByChunk: Map<number, number[]>;
  /** Scratch arrays of the detection pass (reused). */
  passGrid: PassGrid;
  /** Per nest and chunk: the open-volume split of upkeep.ts nestOpenVolume. */
  deepVolByNest: Map<number, Map<number, ChunkVolume>>;
  /** Breach records of the carve grid already turned into entrances (or found not to be one). */
  breachSeen: number;
  /** Plan geometry and target voxels by plan id (rebuilt from the plan record). */
  geom: Map<number, PlanCache>;
  /** cheat.setChamberClimate overrides (debug only, not saved). */
  climate: Map<number, { temp: number; rh: number }>;
}

/** Open samples of one chunk inside a nest's box: summed where deep under the terrain, listed near the surface. */
export interface ChunkVolume {
  /** Sum of open fractions of the deep samples (solid share 1). */
  deep: number;
  /** Near-surface samples as i, j, k, openness quadruples (their solid share depends on the field: evaluated live). */
  shallow: number[];
}

const RUNTIMES = new WeakMap<Sim, NestRuntime>();

export function nestRuntime(sim: Sim): NestRuntime {
  let rt = RUNTIMES.get(sim);
  if (rt) return rt;
  const made: NestRuntime = {
    flags: new FlagStore(sim.state.worldDelta.carveFlags),
    dirtyNests: new Set(),
    allDirty: true,
    coreByChunk: new Map(),
    passGrid: new PassGrid(),
    deepVolByNest: new Map(),
    breachSeen: sim.carve.breaches.length,
    geom: new Map(),
    climate: new Map(),
  };
  sim.carve.addListener((c: CarveChange) => onCarve(sim, made, c.box));
  RUNTIMES.set(sim, made);
  return made;
}

/** Samples around a nest's box whose change can alter its detection (core apron + dilation). */
const DIRTY_PAD = 8;

/** A carve or fill: drops the detection caches it can affect and marks the nests whose space it touches. */
function onCarve(sim: Sim, rt: NestRuntime, box: VoxelBox): void {
  dropChunks(rt.coreByChunk, box, CORE_APRON);
  for (const m of rt.deepVolByNest.values()) dropChunks(m, box, 0);
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    const b = nestSampleBox(sim, nest);
    if (b.i0 - DIRTY_PAD <= box.i1 && b.i1 + DIRTY_PAD >= box.i0 && b.j0 - DIRTY_PAD <= box.j1 && b.j1 + DIRTY_PAD >= box.j0
      && b.k0 - DIRTY_PAD <= box.k1 && b.k1 + DIRTY_PAD >= box.k0) rt.dirtyNests.add(nest.id);
  }
}

/** Deletes the entries of every chunk within `pad` samples of the box. */
function dropChunks(map: Map<number, unknown>, box: VoxelBox, pad: number): void {
  if (map.size === 0) return;
  for (let cz = (box.k0 - pad) >> 4; cz <= (box.k1 + pad) >> 4; cz++)
    for (let cy = (box.j0 - pad) >> 4; cy <= (box.j1 + pad) >> 4; cy++)
      for (let cx = (box.i0 - pad) >> 4; cx <= (box.i1 + pad) >> 4; cx++) map.delete(chunkKey(cx, cy, cz));
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
