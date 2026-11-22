// Derived spatial lookup over sources: X/Z buckets of SOURCE_GRID_CELL_BU. Odour radii reach 100 BU, far beyond
// the entity index's small cells, so perception queries use this coarse grid instead. Runtime cache only (WeakMap
// per state), never persisted.
//
// The grid is kept current incrementally (colony-life round 12, direction 26a item 0): on the first query of a tick
// it walks the source list once and moves only the sources whose bucket changed (added, removed, moved). It used to
// clear every bucket of the world and re-bucket every source on the first query of each tick; once every outside
// worker smelled for food (R38 item 5) some worker queried on nearly every tick and the rebuild cost the behaviours
// system 0.4 ms a tick. Query results are the same: every caller filters by distance and sorts by (distance, id),
// so the order of ids inside a bucket does not matter.

import type { FoodSource, Sim, SimState } from '@/sim/types';
import { LARGE_CARCASS_TYPES, SOURCE_CATALOGUE, SOURCE_GRID_CELL_BU } from '@/sim/balance/ecology';

interface Grid {
  /** Tick of the last sync (-1 never). */
  tick: number;
  len: number;
  lastId: number;
  cell: number;
  nx: number;
  buckets: number[][];
  /** Bucket each bucketed source sits in, by source id. */
  where: Map<number, number>;
  /**
   * What the last sync saw at each index of the source list (id, alive, x, z): a source whose four values are
   * unchanged is skipped without touching the map, so a sync costs one pass of plain compares.
   */
  seenId: Float64Array;
  seenAlive: Uint8Array;
  seenX: Float64Array;
  seenZ: Float64Array;
}

const grids = new WeakMap<SimState, Grid>();

/** Largest odour radius any source can have, BU (catalogue plus large-carcass types). */
export const MAX_ODOUR_BU = Math.max(
  ...Object.values(SOURCE_CATALOGUE).map((d) => d.odourBu), ...Object.values(LARGE_CARCASS_TYPES).map((t) => t.odourBu),
);

function removeFromBucket(bucket: number[], id: number): void {
  const i = bucket.indexOf(id);
  if (i < 0) return;
  bucket[i] = bucket[bucket.length - 1];
  bucket.pop();
}

/** Every bucket cleared and every live source re-bucketed (first use, or ids left the list unseen). */
function rebuild(sim: Sim, g: Grid): void {
  for (const b of g.buckets) b.length = 0;
  g.where.clear();
  const list = sim.stores.sources.list;
  ensureSeen(g, list.length);
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    g.seenId[i] = s.id; g.seenAlive[i] = s.alive ? 1 : 0; g.seenX[i] = s.pos.x; g.seenZ[i] = s.pos.z;
    if (!s.alive) continue;
    const b = bucketIndex(g, s.pos.x, s.pos.z);
    g.buckets[b].push(s.id);
    g.where.set(s.id, b);
  }
}

function ensureSeen(g: Grid, n: number): void {
  if (g.seenId.length >= n) return;
  const cap = Math.max(n, g.seenId.length * 2, 64);
  const id = new Float64Array(cap).fill(-1), alive = new Uint8Array(cap), x = new Float64Array(cap), z = new Float64Array(cap);
  id.set(g.seenId); alive.set(g.seenAlive); x.set(g.seenX); z.set(g.seenZ);
  g.seenId = id; g.seenAlive = alive; g.seenX = x; g.seenZ = z;
}

/** Moves the sources whose bucket changed since the last sync; drops the dead ones. */
function sync(sim: Sim, g: Grid): void {
  const list = sim.stores.sources.list;
  ensureSeen(g, list.length);
  let alive = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const a = s.alive ? 1 : 0;
    alive += a;
    if (g.seenId[i] === s.id && g.seenAlive[i] === a && g.seenX[i] === s.pos.x && g.seenZ[i] === s.pos.z) continue;
    g.seenId[i] = s.id; g.seenAlive[i] = a; g.seenX[i] = s.pos.x; g.seenZ[i] = s.pos.z;
    const prev = g.where.get(s.id);
    if (!s.alive) {
      if (prev !== undefined) { removeFromBucket(g.buckets[prev], s.id); g.where.delete(s.id); }
      continue;
    }
    const b = bucketIndex(g, s.pos.x, s.pos.z);
    if (prev === b) continue;
    if (prev !== undefined) removeFromBucket(g.buckets[prev], s.id);
    g.buckets[b].push(s.id);
    g.where.set(s.id, b);
  }
  // a source that died and was swept between two syncs is still bucketed: start again (rare)
  if (g.where.size !== alive) rebuild(sim, g);
  g.tick = sim.state.tick;
  g.len = list.length;
  g.lastId = list.length > 0 ? list[list.length - 1].id : -1;
}

/** Bucket of (x, z); positions outside the world go to the edge buckets. */
function bucketIndex(g: Grid, x: number, z: number): number {
  const ix = Math.min(g.nx - 1, Math.max(0, Math.floor(x / g.cell)));
  const iz = Math.min(g.nx - 1, Math.max(0, Math.floor(z / g.cell)));
  return iz * g.nx + ix;
}

function gridOf(sim: Sim): Grid {
  let g = grids.get(sim.state);
  if (!g) {
    const cell = SOURCE_GRID_CELL_BU * sim.world.bu;
    const nx = Math.max(1, Math.ceil(sim.world.size / cell));
    g = { tick: -1, len: -1, lastId: -1, cell, nx, buckets: Array.from({ length: nx * nx }, () => []), where: new Map(),
      seenId: new Float64Array(0), seenAlive: new Uint8Array(0), seenX: new Float64Array(0), seenZ: new Float64Array(0) };
    grids.set(sim.state, g);
  }
  const list = sim.stores.sources.list;
  const lastId = list.length > 0 ? list[list.length - 1].id : -1;
  if (g.tick !== sim.state.tick || g.len !== list.length || g.lastId !== lastId) sync(sim, g);
  return g;
}

/** Calls fn for every live source whose position lies within the X/Z square of half-size r around (x, z). */
export function forEachSourceNear(sim: Sim, x: number, z: number, r: number, fn: (s: FoodSource) => void): void {
  const g = gridOf(sim);
  const i0 = Math.max(0, Math.floor((x - r) / g.cell)), i1 = Math.min(g.nx - 1, Math.floor((x + r) / g.cell));
  const k0 = Math.max(0, Math.floor((z - r) / g.cell)), k1 = Math.min(g.nx - 1, Math.floor((z + r) / g.cell));
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      for (const id of g.buckets[k * g.nx + i]) {
        const s = sim.stores.sources.get(id);
        if (s) fn(s);
      }
    }
  }
}

/** Radius that covers every odour, mm. */
export function maxOdourMm(bu: number): number {
  return MAX_ODOUR_BU * bu;
}
