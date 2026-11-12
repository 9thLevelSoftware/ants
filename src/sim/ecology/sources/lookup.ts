// Derived spatial lookup over sources: X/Z buckets of SOURCE_GRID_CELL_BU, rebuilt lazily once per tick (or when
// a source was added). Odour radii reach 100 BU, far beyond the entity index's small cells, so perception
// queries use this coarse grid instead. Runtime cache only (WeakMap per state), never persisted.

import type { FoodSource, Sim, SimState } from '@/sim/types';
import { LARGE_CARCASS_TYPES, SOURCE_CATALOGUE, SOURCE_GRID_CELL_BU } from '@/sim/balance/ecology';

interface Grid {
  tick: number;
  len: number;
  lastId: number;
  cell: number;
  nx: number;
  buckets: number[][];
}

const grids = new WeakMap<SimState, Grid>();

/** Largest odour radius any source can have, BU (catalogue plus large-carcass types). */
export const MAX_ODOUR_BU = Math.max(
  ...Object.values(SOURCE_CATALOGUE).map((d) => d.odourBu), ...Object.values(LARGE_CARCASS_TYPES).map((t) => t.odourBu),
);

function build(sim: Sim, g: Grid): void {
  for (const b of g.buckets) b.length = 0;
  const list = sim.stores.sources.list;
  for (const s of list) {
    if (!s.alive) continue;
    g.buckets[bucketIndex(g, s.pos.x, s.pos.z)].push(s.id);
  }
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
    g = { tick: -1, len: -1, lastId: -1, cell, nx, buckets: Array.from({ length: nx * nx }, () => []) };
    grids.set(sim.state, g);
  }
  const list = sim.stores.sources.list;
  const lastId = list.length > 0 ? list[list.length - 1].id : -1;
  if (g.tick !== sim.state.tick || g.len !== list.length || g.lastId !== lastId) build(sim, g);
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
