// A coarse "human grid" over a site (HUMAN_GRID_MM cells, GDD 04 digest): where a person can stand, and the longest
// walk across it (the lane a pass follows). Pure; built once per world.

import type { WorldData } from '@/sim/types';
import { NAV_CLASSES } from '@/sim/types';
import { HUMAN_GRID_MM, HUMAN_LANE_THIN } from '@/sim/balance/human';

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Pt { x: number; z: number }

/** A walkable mask over a rectangle, row-major nx x nz from (x0, z0). */
export interface HumanGrid {
  x0: number; z0: number; cell: number; nx: number; nz: number;
  free: Uint8Array;
}

const BLOCKED = NAV_CLASSES.indexOf('blocked-solid');
const WATER = NAV_CLASSES.indexOf('water-body');
const HOLE = NAV_CLASSES.indexOf('hole');

/** Zone id at (x, z) from the zone raster, -1 off the map. */
export function zoneIdAt(world: WorldData, x: number, z: number): number {
  const m = world.maps.zone;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  if (ix < 0 || iz < 0 || ix >= m.nx || iz >= m.nz) return -1;
  return m.data[iz * m.nx + ix];
}

/** True when the coarse nav grid lets a person stand at (x, z) (no tall solid, water or hole). */
export function standable(world: WorldData, x: number, z: number): boolean {
  const c = world.nav.cls;
  const ix = Math.floor(x / c.cell), iz = Math.floor(z / c.cell);
  if (ix < 0 || iz < 0 || ix >= c.nx || iz >= c.nz) return false;
  const v = c.data[iz * c.nx + ix];
  return v !== BLOCKED && v !== WATER && v !== HOLE;
}

/** Bounding rectangle of every zone id (scan of the zone raster), keyed by id; zones with no cell are absent. */
export function zoneBounds(world: WorldData): Map<number, Rect & { cells: number }> {
  const m = world.maps.zone, out = new Map<number, Rect & { cells: number }>();
  for (let iz = 0; iz < m.nz; iz++) {
    for (let ix = 0; ix < m.nx; ix++) {
      const id = m.data[iz * m.nx + ix];
      let b = out.get(id);
      if (!b) { b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, cells: 0 }; out.set(id, b); }
      const x = ix * m.cell, z = iz * m.cell;
      if (x < b.x0) b.x0 = x;
      if (z < b.z0) b.z0 = z;
      if (x + m.cell > b.x1) b.x1 = x + m.cell;
      if (z + m.cell > b.z1) b.z1 = z + m.cell;
      b.cells++;
    }
  }
  return out;
}

/** Human grid over `r` where the zone is one of `zoneIds` and a person can stand. */
export function zoneGrid(world: WorldData, r: Rect, zoneIds: readonly number[]): HumanGrid {
  const cell = HUMAN_GRID_MM;
  const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / cell)), nz = Math.max(1, Math.ceil((r.z1 - r.z0) / cell));
  const free = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const x = r.x0 + (i + 0.5) * cell, z = r.z0 + (k + 0.5) * cell;
      if (zoneIds.includes(zoneIdAt(world, x, z)) && standable(world, x, z)) free[k * nx + i] = 1;
    }
  }
  return { x0: r.x0, z0: r.z0, cell, nx, nz, free };
}

export function gridCentre(g: HumanGrid, c: number): Pt {
  return { x: g.x0 + ((c % g.nx) + 0.5) * g.cell, z: g.z0 + (Math.floor(c / g.nx) + 0.5) * g.cell };
}

export function gridCellAt(g: HumanGrid, x: number, z: number): number {
  const i = Math.floor((x - g.x0) / g.cell), k = Math.floor((z - g.z0) / g.cell);
  if (i < 0 || k < 0 || i >= g.nx || k >= g.nz) return -1;
  return k * g.nx + i;
}

export function isFreeAt(g: HumanGrid, x: number, z: number): boolean {
  const c = gridCellAt(g, x, z);
  return c >= 0 && g.free[c] === 1;
}

export function freeCount(g: HumanGrid): number {
  let n = 0;
  for (let i = 0; i < g.free.length; i++) n += g.free[i];
  return n;
}

/** BFS (8-neighbour, no corner cutting) from `start`: hop distances (-1 unreached) and parents. */
function bfs(g: HumanGrid, start: number): { dist: Int32Array; from: Int32Array } {
  const n = g.nx * g.nz, dist = new Int32Array(n).fill(-1), from = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++], ci = c % g.nx, ck = Math.floor(c / g.nx);
    for (let dk = -1; dk <= 1; dk++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dk) continue;
        const i = ci + di, k = ck + dk;
        if (i < 0 || k < 0 || i >= g.nx || k >= g.nz) continue;
        const j = k * g.nx + i;
        if (!g.free[j] || dist[j] >= 0) continue;
        if (di && dk && (!g.free[ck * g.nx + i] || !g.free[k * g.nx + ci])) continue;
        dist[j] = dist[c] + 1;
        from[j] = c;
        queue[tail++] = j;
      }
    }
  }
  return { dist, from };
}

function farthest(dist: Int32Array): number {
  let best = -1, bd = -1;
  for (let i = 0; i < dist.length; i++) if (dist[i] > bd) { bd = dist[i]; best = i; }
  return best;
}

/**
 * The longest walk across the grid's largest walkable patch (double BFS approximates the diameter), as a polyline
 * of cell centres (every HUMAN_LANE_THIN-th cell, ends kept). Empty when the grid has no free cell.
 */
export function longestLane(g: HumanGrid): Pt[] {
  let seed = -1;
  // start in the middle of the free cells (stable choice), then hop to the far end twice
  const order: number[] = [];
  for (let i = 0; i < g.free.length; i++) if (g.free[i]) order.push(i);
  if (order.length === 0) return [];
  seed = order[Math.floor(order.length / 2)];
  const a = farthest(bfs(g, seed).dist);
  const fromA = bfs(g, a);
  const b = farthest(fromA.dist);
  const cells: number[] = [];
  for (let c = b; c >= 0; c = c === a ? -1 : fromA.from[c]) cells.push(c);
  const out: Pt[] = [];
  for (let i = 0; i < cells.length; i++) if (i % HUMAN_LANE_THIN === 0 || i === cells.length - 1) out.push(gridCentre(g, cells[i]));
  return out;
}

/** Length of a polyline, mm. */
export function polylineLength(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return s;
}

/** Point and unit tangent at arc length `d` along a polyline (clamped to its ends). */
export function pointAlong(pts: readonly Pt[], d: number, out: { x: number; z: number; tx: number; tz: number }): typeof out {
  if (pts.length === 1) { out.x = pts[0].x; out.z = pts[0].z; out.tx = 1; out.tz = 0; return out; }
  let rest = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (rest <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, rest / l) : 0;
      out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
      out.tx = l > 0 ? (b.x - a.x) / l : 1; out.tz = l > 0 ? (b.z - a.z) / l : 0;
      return out;
    }
    rest -= l;
  }
  return out;
}
