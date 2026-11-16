// Derived, never-persisted helpers of the nest module, one set per Sim (created on first use, so a Sim built by
// createSim after a load starts from scratch). Nothing here may change simulation results: every cache is a pure
// function of the persisted state (the detection caches are dropped for every chunk a carve can affect). The
// "detection due" flag that schedules chamber detection is persisted (Nest.detectDue), not kept here: a restored
// game must detect, and refresh volumeOpen, on exactly the ticks the uninterrupted game does.

import type { Mound, Sim } from '@/sim/types';
import { MOUND_MASK_CARVE_REACH_BU } from '@/sim/balance/nest';
import type { CarveChange } from './carve/grid';
import { chunkKey, type VoxelBox } from './carve/keys';
import { CORE_APRON, nestSampleBox } from './chambers/detect';
import { PassGrid } from './chambers/tiles';
import { FlagStore } from './flags';
import type { MoundMask } from './moundRelax';
import type { PlanCache } from './plans/targets';

export interface NestRuntime {
  flags: FlagStore;
  /** Chamber core samples (packed keys) per carve chunk; dropped for chunks near a carve (detect.ts). */
  coreByChunk: Map<number, number[]>;
  /**
   * Wall samples per carve chunk (open, a non-open sample below, a non-open horizontal neighbour): i, j, k and
   * the neighbour's direction index, in scan order (architect candidates.ts); dropped for chunks near a carve.
   */
  wallByChunk: Map<number, number[]>;
  /** Scratch arrays of the detection pass (reused). */
  passGrid: PassGrid;
  /** Per nest and chunk: the open-volume split of upkeep.ts nestOpenVolume. */
  deepVolByNest: Map<number, Map<number, ChunkVolume>>;
  /** The nest sample box each deepVolByNest cache was computed with (a changed box drops the cache). */
  deepVolBox: Map<number, string>;
  /** Breach records of the carve grid already turned into entrances (or found not to be one). */
  breachSeen: number;
  /** Plan geometry and target voxels by plan id (rebuilt from the plan record). */
  geom: Map<number, PlanCache>;
  /** cheat.setChamberClimate overrides (debug only, not saved). */
  climate: Map<number, { temp: number; rh: number }>;
  /**
   * Kept-clear masks of mound grids (moundRelax.ts), valid while the entrances on the grid and the breach list are
   * unchanged (`sig`) and no carve near the ground surface touched the grid (dropped by the carve listener).
   */
  moundMasks: Map<number, { sig: string; mask: MoundMask }>;
  /** Nest owning the holes a dig bite's brush opens while it runs (ownership.ts withDigOwner), -1 none. */
  digOwner: number;
  /** Entrances that closed without a plug this tick, reported at the end of the nest system (entrances.ts). */
  closedPending: { nestId: number; entranceId: number }[];
  /**
   * Per nest: a counter bumped by every carve or fill that touches its sample box (+ DIRTY_PAD), so nest-local
   * caches (deadEnd.ts) are not dropped by digging in other nests. Starts at 0 for a nest not seen yet.
   */
  carveStamp: Map<number, number>;
  /**
   * Per carve chunk: a counter bumped by every carve or fill whose box (+1 sample) reaches the chunk, so local
   * memos (tamp.ts retries) see any change of the samples they read. Starts at 0 for a chunk not seen yet.
   */
  chunkStamp: Map<number, number>;
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
    coreByChunk: new Map(),
    wallByChunk: new Map(),
    passGrid: new PassGrid(),
    deepVolByNest: new Map(),
    deepVolBox: new Map(),
    breachSeen: sim.carve.breaches.length,
    geom: new Map(),
    climate: new Map(),
    moundMasks: new Map(),
    digOwner: -1,
    closedPending: [],
    carveStamp: new Map(),
    chunkStamp: new Map(),
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
  dropChunks(rt.wallByChunk, box, 1);
  dropMoundMasks(sim, rt, box);
  for (const m of rt.deepVolByNest.values()) dropChunks(m, box, 0);
  bumpChunks(rt.chunkStamp, box, 1);
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    const b = nestSampleBox(sim, nest);
    if (b.i0 - DIRTY_PAD <= box.i1 && b.i1 + DIRTY_PAD >= box.i0 && b.j0 - DIRTY_PAD <= box.j1 && b.j1 + DIRTY_PAD >= box.j0
      && b.k0 - DIRTY_PAD <= box.k1 && b.k1 + DIRTY_PAD >= box.k0) {
      nest.detectDue = true;
      rt.carveStamp.set(nest.id, (rt.carveStamp.get(nest.id) ?? 0) + 1);
    }
  }
}

/**
 * Drops the cached masks of mound grids a carve box can change: it overlaps the grid in x / z and reaches up to
 * the ground near the grid's lowest base (the mask probes the cavity just under the ground, MOUND_HOLE_PROBE_DEPTH).
 * Digging deep under a mound does not touch its mask.
 */
function dropMoundMasks(sim: Sim, rt: NestRuntime, box: VoxelBox): void {
  if (rt.moundMasks.size === 0) return;
  const v = sim.carve.voxel, reach = MOUND_MASK_CARVE_REACH_BU * sim.world.bu;
  for (const id of [...rt.moundMasks.keys()]) {
    const m = sim.state.worldDelta.mounds.find((x) => x.id === id);
    if (!m) { rt.moundMasks.delete(id); continue; }
    const half = ((m.n - 1) * m.cell) / 2;
    if (box.i1 * v < m.centerX - half || box.i0 * v > m.centerX + half || box.k1 * v < m.centerZ - half || box.k0 * v > m.centerZ + half) continue;
    if (box.j1 * v < lowestBase(m) - reach) continue;
    rt.moundMasks.delete(id);
  }
}

function lowestBase(m: Mound): number {
  let low = Infinity;
  for (let i = 0; i < m.base.length; i++) if (m.base[i] < low) low = m.base[i]; // NaN compares false
  return low === Infinity ? -Infinity : low;
}

/** Deletes the entries of every chunk within `pad` samples of the box. */
function dropChunks(map: Map<number, unknown>, box: VoxelBox, pad: number): void {
  if (map.size === 0) return;
  for (let cz = (box.k0 - pad) >> 4; cz <= (box.k1 + pad) >> 4; cz++)
    for (let cy = (box.j0 - pad) >> 4; cy <= (box.j1 + pad) >> 4; cy++)
      for (let cx = (box.i0 - pad) >> 4; cx <= (box.i1 + pad) >> 4; cx++) map.delete(chunkKey(cx, cy, cz));
}

/** Increments the stamp of every chunk within `pad` samples of the box. */
function bumpChunks(map: Map<number, number>, box: VoxelBox, pad: number): void {
  for (let cz = (box.k0 - pad) >> 4; cz <= (box.k1 + pad) >> 4; cz++)
    for (let cy = (box.j0 - pad) >> 4; cy <= (box.j1 + pad) >> 4; cy++)
      for (let cx = (box.i0 - pad) >> 4; cx <= (box.i1 + pad) >> 4; cx++) {
        const key = chunkKey(cx, cy, cz);
        map.set(key, (map.get(key) ?? 0) + 1);
      }
}

/** Sum of the chunk stamps over a sample box (a change of any sample in the box changes it). */
export function chunkStampSum(sim: Sim, box: VoxelBox): number {
  const map = nestRuntime(sim).chunkStamp;
  let s = 0;
  for (let cz = box.k0 >> 4; cz <= box.k1 >> 4; cz++)
    for (let cy = box.j0 >> 4; cy <= box.j1 >> 4; cy++)
      for (let cx = box.i0 >> 4; cx <= box.i1 >> 4; cx++) s += map.get(chunkKey(cx, cy, cz)) ?? 0;
  return s;
}

/** Marks one nest for re-detection (mound or cover changes that the carve listener does not see). */
export function markNestDirty(sim: Sim, nestId: number): void {
  const nest = sim.stores.nests.get(nestId);
  if (nest) nest.detectDue = true;
}

/** Should the nest's chambers be re-detected? Clears the flag (a save without the field counts as due). */
export function takeNestDirty(sim: Sim, nestId: number): boolean {
  const nest = sim.stores.nests.get(nestId);
  if (!nest || nest.detectDue === false) return false;
  nest.detectDue = false;
  return true;
}
