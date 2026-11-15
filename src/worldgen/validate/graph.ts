// Path distances on the coarse nav grid (GDD 04 §11) for validation: 8-neighbour moves over walkable cells (open,
// step; no corner cutting past blocked cells), the climb over a step adds its height (x NAV_CLIMB_COST with
// travel costs) or is blocked when the higher cell's surface is not climbable, and micro-connection portals join
// their mouth cells (skipped when narrower than the caller's clearance). Distances in BU.

import type { GenContext } from '../kit/context';
import { MinHeap } from '../kit/heap';
import { walkable } from '../maps/nav';
import { hasMapState, mapState } from '../maps/state';
import { NAV } from '../tuning/maps';

export interface Portal { a: number; b: number; lenBu: number; clearanceBu: number; microId: number }

export interface DistanceOptions {
  /** Standard worker 0.45 BU by default; the queen uses 0.9 BU. */
  clearanceBu?: number;
  /** Multiply move lengths by the cell cost (travel cost) instead of pure length. */
  useCost?: boolean;
  /** Ignore this micro-connection (usefulness test). */
  skipMicro?: number;
  /** Stop expanding beyond this distance, BU. */
  maxBu?: number;
}

export function cellAt(ctx: GenContext, x: number, z: number): number {
  const { navN, navCell } = ctx.dims;
  const i = Math.min(navN - 1, Math.max(0, Math.floor(x / navCell))), k = Math.min(navN - 1, Math.max(0, Math.floor(z / navCell)));
  return k * navN + i;
}

/** The cell itself if walkable, else the nearest walkable cell within `r` cells (ties: lower index), or -1. */
export function snapWalkable(ctx: GenContext, c: number, r = 2): number {
  const { navN } = ctx.dims;
  const cls = ctx.world.nav.cls.data;
  if (walkable(cls[c])) return c;
  const ci = c % navN, ck = Math.floor(c / navN);
  let best = -1, bd = Infinity;
  for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
    const x = ci + di, z = ck + dk;
    if (x < 0 || z < 0 || x >= navN || z >= navN) continue;
    const j = z * navN + x, d = di * di + dk * dk;
    if (walkable(cls[j]) && (d < bd || (d === bd && j < best))) { best = j; bd = d; }
  }
  return best;
}

/** Micro-connection portals between the walkable cells at (or next to) their mouths. */
export function portals(ctx: GenContext): Portal[] {
  const out: Portal[] = [];
  for (const m of ctx.world.micro) {
    const a = snapWalkable(ctx, cellAt(ctx, m.posA.x, m.posA.z)), b = snapWalkable(ctx, cellAt(ctx, m.posB.x, m.posB.z));
    if (a >= 0 && b >= 0 && a !== b) out.push({ a, b, lenBu: m.lengthBu, clearanceBu: m.minClearanceBu, microId: m.id });
  }
  return out;
}

/** Multi-source shortest distances (BU) from `starts`; Infinity where unreachable. */
export function navDistances(ctx: GenContext, starts: readonly number[], opts: DistanceOptions = {}): Float64Array {
  const nn = ctx.dims.navN * ctx.dims.navN;
  const dist = new Float64Array(nn).fill(Infinity);
  search(ctx, starts, opts, portals(ctx), dist, null, -1);
  return dist;
}

/** Reusable state of single-target queries (navDistanceTo), keyed by grid size. */
let scratch: { dist: Float64Array; touched: number[] } | null = null;

/**
 * Shortest distance (BU) from cell `from` to cell `to`, Infinity if unreachable within opts.maxBu. For many
 * queries on one map (micro-connection usefulness): pass the map's portals once, and the search stops at the
 * target and reuses its buffers instead of allocating a whole-grid array per query.
 */
export function navDistanceTo(ctx: GenContext, from: number, to: number, opts: DistanceOptions = {}, ports: readonly Portal[] = portals(ctx)): number {
  const nn = ctx.dims.navN * ctx.dims.navN;
  if (!scratch || scratch.dist.length !== nn) scratch = { dist: new Float64Array(nn).fill(Infinity), touched: [] };
  const { dist, touched } = scratch;
  const d = search(ctx, [from], opts, ports, dist, touched, to);
  for (const c of touched) dist[c] = Infinity;
  touched.length = 0;
  return d;
}

/**
 * Calls `visit` for every cell within opts.maxBu (required) of cell `from`, with its distance. Reuses the buffers
 * of navDistanceTo, so many small searches on one map (food around each source) allocate nothing per query.
 */
export function forEachWithin(
  ctx: GenContext, from: number, opts: DistanceOptions & { maxBu: number }, visit: (cell: number, distBu: number) => void,
  ports: readonly Portal[] = portals(ctx),
): void {
  const nn = ctx.dims.navN * ctx.dims.navN;
  if (!scratch || scratch.dist.length !== nn) scratch = { dist: new Float64Array(nn).fill(Infinity), touched: [] };
  const { dist, touched } = scratch;
  search(ctx, [from], opts, ports, dist, touched, -1);
  for (const c of touched) {
    if (dist[c] <= opts.maxBu) visit(c, dist[c]);
    dist[c] = Infinity;
  }
  touched.length = 0;
}

/**
 * Connected components of the walkable grid with the searches' moves but no portals (label per cell, -1 where not
 * walkable). With the portals as extra edges this answers "is there any path" without a whole-map search.
 */
export function groundComponents(ctx: GenContext): Int32Array {
  const nn = ctx.dims.navN * ctx.dims.navN, cls = ctx.world.nav.cls.data;
  const label = new Int32Array(nn).fill(-1);
  const dist = new Float64Array(nn).fill(Infinity), touched: number[] = [];
  let n = 0;
  for (let c = 0; c < nn; c++) {
    if (label[c] >= 0 || !walkable(cls[c])) continue;
    search(ctx, [c], {}, [], dist, touched, -1);
    for (const t of touched) { label[t] = n; dist[t] = Infinity; }
    touched.length = 0;
    n++;
  }
  return label;
}

/** Dijkstra over the nav grid into `dist` (all Infinity on entry); records written cells in `touched` if given. */
function search(
  ctx: GenContext, starts: readonly number[], opts: DistanceOptions, allPorts: readonly Portal[],
  dist: Float64Array, touched: number[] | null, target: number,
): number {
  const { navN } = ctx.dims;
  const nn = navN * navN;
  const cls = ctx.world.nav.cls.data, cost = ctx.world.nav.cost.data, gy = ctx.world.nav.groundY!;
  const bu = ctx.dims.bu;
  const cellBu = ctx.dims.navCell / bu;
  const clearance = opts.clearanceBu ?? NAV.clearanceBu;
  const maxBu = opts.maxBu ?? Infinity;
  const portOf = new Map<number, Portal[]>();
  for (const p of allPorts) {
    if (p.microId === opts.skipMicro || p.clearanceBu < clearance) continue;
    for (const c of [p.a, p.b]) { const l = portOf.get(c) ?? []; l.push(p); portOf.set(c, l); }
  }
  const heap = new MinHeap(4096);
  const set = (c: number, d: number) => { if (touched && dist[c] === Infinity) touched.push(c); dist[c] = d; };
  for (const s of starts) if (s >= 0 && s < nn) { set(s, 0); heap.push(0, 0, s); }
  const ok = (c: number) => walkable(cls[c]);
  const noClimb = hasMapState(ctx) ? mapState(ctx).nav.noClimb : null;
  while (heap.size > 0) {
    const d = heap.topKey(), c = heap.topValue();
    heap.pop();
    if (d > dist[c] || d > maxBu) continue;
    if (c === target) return d;
    const ci = c % navN, ck = Math.floor(c / navN);
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      if (!di && !dk) continue;
      const x = ci + di, z = ck + dk;
      if (x < 0 || z < 0 || x >= navN || z >= navN) continue;
      const j = z * navN + x;
      if (!ok(j)) continue;
      if (di && dk && (!ok(ck * navN + x) || !ok(z * navN + ci))) continue;
      let len = cellBu * (di && dk ? Math.SQRT2 : 1);
      if (opts.useCost) len *= (cost[c] + cost[j]) / (2 * NAV.costUnit);
      const rise = (gy[j] - gy[c]) / bu, dh = Math.abs(rise);
      if (dh > NAV.stepBu) {
        // the face of a step belongs to the higher cell; a face the AI may not climb blocks the edge both ways
        if (noClimb && noClimb[rise > 0 ? j : c]) continue;
        len += opts.useCost ? NAV.climbCostPerBu * dh : dh;
      }
      const nd = d + len;
      if (nd < dist[j]) { set(j, nd); heap.push(nd, 0, j); }
    }
    const pl = portOf.get(c);
    if (pl) for (const p of pl) {
      const j = p.a === c ? p.b : p.a;
      const nd = d + p.lenBu;
      if (nd < dist[j]) { set(j, nd); heap.push(nd, 0, j); }
    }
  }
  return target >= 0 ? dist[target] : Infinity;
}
