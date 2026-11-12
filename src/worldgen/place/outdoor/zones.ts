// Zone helpers for the outdoor placers: zones by type, their cells, areas and bounding rects, distance to the
// zone edge (chamfer on the 16 BU raster), random points in a zone, and a deterministic atan2 (DET-4).

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { ZoneType, ZoneVariant } from '@/sim/types';
import type { GenContext } from '../../kit/context';
import type { LayoutZone, Rect } from '../../layout/types';
import { dcos, dsin } from '../../kit/dmath';

export function zonesOf(ctx: GenContext, type: ZoneType, variants?: readonly ZoneVariant[]): LayoutZone[] {
  return ctx.layout.zones.filter((z) => z.type === type && (!variants || variants.includes(z.variant)));
}

interface ZoneStats { cells: Int32Array; rect: Rect[]; }
const statsCache = new WeakMap<GenContext, ZoneStats>();

/** Terrain-cell count and bounding rect per zone id. */
function stats(ctx: GenContext): ZoneStats {
  let s = statsCache.get(ctx);
  if (s) return s;
  const { cells, cell } = ctx.dims;
  const n = ctx.layout.zones.length;
  const cnt = new Int32Array(n);
  const b = Array.from({ length: n }, () => [cells, -1, cells, -1]);
  const c = ctx.layout.cells;
  for (let k = 0; k < cells; k++) for (let i = 0; i < cells; i++) {
    const z = c[k * cells + i];
    cnt[z]++;
    const r = b[z];
    if (i < r[0]) r[0] = i; if (i > r[1]) r[1] = i; if (k < r[2]) r[2] = k; if (k > r[3]) r[3] = k;
  }
  s = { cells: cnt, rect: b.map((r) => ({ x0: r[0] * cell, x1: (r[1] + 1) * cell, z0: r[2] * cell, z1: (r[3] + 1) * cell })) };
  statsCache.set(ctx, s);
  return s;
}

export function zoneAreaM2(ctx: GenContext, zoneId: number): number {
  return (stats(ctx).cells[zoneId] * ctx.dims.cell * ctx.dims.cell) / 1e6;
}
export function zoneRect(ctx: GenContext, zoneId: number): Rect {
  return stats(ctx).rect[zoneId];
}

/** Zone id at (x, z) (terrain raster, clamped). */
export function zoneIdAt(ctx: GenContext, x: number, z: number): number {
  const { cells, cell } = ctx.dims;
  const i = Math.min(cells - 1, Math.max(0, Math.floor(x / cell))), k = Math.min(cells - 1, Math.max(0, Math.floor(z / cell)));
  return ctx.layout.cells[k * cells + i];
}

const edgeCache = new WeakMap<GenContext, Float32Array>();
/** Distance (mm) from each nav cell centre to the nearest nav cell of another zone or the map edge. */
export function edgeDistNav(ctx: GenContext): Float32Array {
  let d = edgeCache.get(ctx);
  if (d) return d;
  const { navN: n, navCell } = ctx.dims;
  const z = ctx.layout.nav;
  d = new Float32Array(n * n).fill(1e9);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const c = k * n + i, me = z[c];
    const border = i === 0 || k === 0 || i === n - 1 || k === n - 1 || z[c - 1] !== me || z[c + 1] !== me || z[c - n] !== me || z[c + n] !== me;
    if (border) d[c] = navCell / 2;
  }
  const a = navCell, b = navCell * Math.SQRT2;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const c = k * n + i;
    if (i > 0) d[c] = Math.min(d[c], d[c - 1] + a);
    if (k > 0) d[c] = Math.min(d[c], d[c - n] + a);
    if (i > 0 && k > 0) d[c] = Math.min(d[c], d[c - n - 1] + b);
    if (i < n - 1 && k > 0) d[c] = Math.min(d[c], d[c - n + 1] + b);
  }
  for (let k = n - 1; k >= 0; k--) for (let i = n - 1; i >= 0; i--) {
    const c = k * n + i;
    if (i < n - 1) d[c] = Math.min(d[c], d[c + 1] + a);
    if (k < n - 1) d[c] = Math.min(d[c], d[c + n] + a);
    if (i < n - 1 && k < n - 1) d[c] = Math.min(d[c], d[c + n + 1] + b);
    if (i > 0 && k < n - 1) d[c] = Math.min(d[c], d[c + n - 1] + b);
  }
  edgeCache.set(ctx, d);
  return d;
}

export function edgeDistAt(ctx: GenContext, x: number, z: number): number {
  const { navN: n, navCell } = ctx.dims;
  const i = Math.min(n - 1, Math.max(0, Math.floor(x / navCell))), k = Math.min(n - 1, Math.max(0, Math.floor(z / navCell)));
  return edgeDistNav(ctx)[k * n + i];
}

/** A random point of the zone (rejection sampling in its rect) that passes `ok`, or null after `tries`. */
export function pointInZone(ctx: GenContext, rng: RngState, zoneId: number, ok: (x: number, z: number) => boolean = () => true, tries = 64): { x: number; z: number } | null {
  const r = zoneRect(ctx, zoneId);
  for (let t = 0; t < tries; t++) {
    const x = r.x0 + rngFloat(rng) * (r.x1 - r.x0), z = r.z0 + rngFloat(rng) * (r.z1 - r.z0);
    if (zoneIdAt(ctx, x, z) === zoneId && ok(x, z)) return { x, z };
  }
  return null;
}

/** True if every sample of the rotated footprint (half extents hx, hz; yaw convention of the kit) lies in `zoneIds`. */
export function footprintIn(ctx: GenContext, x: number, z: number, yaw: number, hx: number, hz: number, zoneIds: readonly number[]): boolean {
  const c = dcos(yaw), s = dsin(yaw);
  for (const u of [-1, 0, 1]) for (const w of [-1, 0, 1]) {
    const lx = u * hx, lz = w * hz;
    if (!zoneIds.includes(zoneIdAt(ctx, x + lx * c + lz * s, z - lx * s + lz * c))) return false;
  }
  return true;
}

/** Deterministic atan2 (polynomial, |error| < 1e-5 rad). */
export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x), ay = Math.abs(y);
  const a = Math.min(ax, ay) / Math.max(ax, ay), s = a * a;
  let r = ((((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s) * a + a);
  // refine with one Newton step on tan(r) = a using polynomial sin/cos
  r -= (dsin(r) - a * dcos(r)) / (dcos(r) + a * dsin(r));
  if (ay > ax) r = Math.PI / 2 - r;
  if (x < 0) r = Math.PI - r;
  return y < 0 ? -r : r;
}

/** Kit yaw (yawQ(a) turns +X toward -Z) that points local +X along the world direction (dx, dz). */
export function yawAlong(dx: number, dz: number): number {
  return datan2(-dz, dx);
}
