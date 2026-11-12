// Path distances on the coarse nav grid (GDD 04 §11) for validation: 8-neighbour moves over walkable cells (open,
// step; no corner cutting past blocked cells), the climb over a step adds its height, and micro-connection portals
// join their mouth cells (skipped when narrower than the caller's clearance). Distances in BU.

import type { GenContext } from '../kit/context';
import { MinHeap } from '../kit/heap';
import { walkable } from '../maps/nav';
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
  const { navN } = ctx.dims;
  const nn = navN * navN;
  const cls = ctx.world.nav.cls.data, cost = ctx.world.nav.cost.data, gy = ctx.world.nav.groundY!;
  const bu = ctx.dims.bu;
  const cellBu = ctx.dims.navCell / bu;
  const clearance = opts.clearanceBu ?? NAV.clearanceBu;
  const maxBu = opts.maxBu ?? Infinity;
  const ports = portals(ctx).filter((p) => p.microId !== opts.skipMicro && p.clearanceBu >= clearance);
  const portOf = new Map<number, Portal[]>();
  for (const p of ports) for (const c of [p.a, p.b]) { const l = portOf.get(c) ?? []; l.push(p); portOf.set(c, l); }
  const dist = new Float64Array(nn).fill(Infinity);
  const heap = new MinHeap(4096);
  for (const s of starts) if (s >= 0 && s < nn) { dist[s] = 0; heap.push(0, 0, s); }
  const ok = (c: number) => walkable(cls[c]);
  while (heap.size > 0) {
    const d = heap.topKey(), c = heap.topValue();
    heap.pop();
    if (d > dist[c] || d > maxBu) continue;
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
      const dh = Math.abs(gy[j] - gy[c]) / bu;
      if (dh > NAV.stepBu) len += opts.useCost ? NAV.climbCostPerBu * dh : dh;
      const nd = d + len;
      if (nd < dist[j]) { dist[j] = nd; heap.push(nd, 0, j); }
    }
    const pl = portOf.get(c);
    if (pl) for (const p of pl) {
      const j = p.a === c ? p.b : p.a;
      const nd = d + p.lenBu;
      if (nd < dist[j]) { dist[j] = nd; heap.push(nd, 0, j); }
    }
  }
  return dist;
}
