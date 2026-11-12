// Shared helpers of the populate step: plots per zone, start distances, zone sampling, the kernel field used to
// keep anchors out of solids and to walk host routes, season masks and anchor records.

import type { Vec3 } from '@/core/math/vec3';
import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { ClimbRoute, FoodKind, FoodVariant, Poi, WorldObject, ZoneType } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { PLOT_BU, SOURCE_CATALOGUE } from '@/sim/balance';
import { createKernel, type Kernel } from '@/sim/kernel';
import { walkRouteUp } from './routeCheck';
import type { GenContext } from '../kit/context';
import { addFoodAnchor } from '../kit/records';
import { supportAt } from '../kit/surface';
import { cellAt, navDistances } from '../validate/graph';
import { walkable } from '../maps/nav';
import { ANCHOR_SURFACE_TOL_MM } from './tuning';

export const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** Plots (100 x 100 BU) of a zone type on the map. */
export function zonePlots(ctx: GenContext): Record<ZoneType, number> {
  const plot = PLOT_BU * ctx.dims.bu;
  const out: Record<string, number> = {};
  for (const z of ctx.world.zones) out[z.type] = (out[z.type] ?? 0) + z.areaMm2 / (plot * plot);
  return out as Record<ZoneType, number>;
}

/** Total plots of the map (cap scaling for compact / large sizes). */
export function mapPlots(ctx: GenContext): number {
  return (ctx.dims.size / (PLOT_BU * ctx.dims.bu)) ** 2;
}

/** Map caps of GDD 05 §1.3 are for a standard map (1600 plots); other sizes scale with the plot count. */
export function scaledCap(ctx: GenContext, cap: number): number {
  return Math.max(1, Math.round((cap * mapPlots(ctx)) / 1600));
}

/** Stochastic rounding. */
export function roundRandom(rng: RngState, x: number): number {
  const f = Math.floor(x);
  return f + (rngFloat(rng) < x - f ? 1 : 0);
}

/** Deterministic Fisher-Yates shuffle (copy). */
export function shuffled<T>(rng: RngState, list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rngInt(rng, 0, i);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function navCentre(ctx: GenContext, c: number): { x: number; z: number } {
  const { navN, navCell } = ctx.dims;
  return { x: ((c % navN) + 0.5) * navCell, z: (Math.floor(c / navN) + 0.5) * navCell };
}

export function startCell(ctx: GenContext): number {
  return cellAt(ctx, ctx.world.queenStart.pos.x, ctx.world.queenStart.pos.z);
}

/** Path distances (BU) from the current start (standard worker clearance). */
export function startDistances(ctx: GenContext, maxBu?: number): Float64Array {
  return navDistances(ctx, [startCell(ctx)], maxBu === undefined ? {} : { maxBu });
}

/** Walkable nav cells of a zone type (ascending). */
export function zoneCells(ctx: GenContext, type: ZoneType): number[] {
  const lay = ctx.layout, cls = ctx.world.nav.cls.data;
  const out: number[] = [];
  for (let c = 0; c < cls.length; c++) if (walkable(cls[c]) && lay.zones[lay.nav[c]].type === type) out.push(c);
  return out;
}

/** Zone type of the nav cell under (x, z). */
export function zoneTypeAtXZ(ctx: GenContext, x: number, z: number): ZoneType {
  const c = cellAt(ctx, x, z);
  return ctx.layout.zones[ctx.layout.nav[c]].type;
}

/** A point inside nav cell c, jittered by the rng, on the support surface. */
export function pointInCell(ctx: GenContext, c: number, rng: RngState): Vec3 {
  const p = navCentre(ctx, c), h = ctx.dims.navCell * 0.35;
  const x = p.x + (rngFloat(rng) * 2 - 1) * h, z = p.z + (rngFloat(rng) * 2 - 1) * h;
  return { x, y: supportAt(ctx, x, z), z };
}

const kernels = new WeakMap<GenContext, { k: Kernel; prims: number }>();

/** A kernel over the world as built so far (field queries, route walking); rebuilt when primitives were added. */
export function kernelOf(ctx: GenContext): Kernel {
  const hit = kernels.get(ctx);
  if (hit && hit.prims === ctx.world.prims.length) return hit.k;
  const w = ctx.world;
  const k = createKernel(w, { voxel: w.bu / 2, keys: [], chunks: [], breaches: [] }, { field: { hashCell: 32 * w.bu } });
  kernels.set(ctx, { k, prims: w.prims.length });
  return k;
}

/** Lifts a point that lies inside a solid onto the surface (anchors are never inside solids); null if it fails. */
export function toSurface(ctx: GenContext, p: Vec3): Vec3 | null {
  const f = kernelOf(ctx).field;
  if (f.sampleXYZ(p.x, p.y, p.z) >= -ANCHOR_SURFACE_TOL_MM) return p;
  for (let lift = 0.25; lift <= 3; lift += 0.25) {
    const y = p.y + lift * ctx.dims.bu;
    if (f.sampleXYZ(p.x, y, p.z) >= 0) return { x: p.x, y, z: p.z };
  }
  return null;
}

const routeOk = new WeakMap<GenContext, Map<number, boolean>>();

/** Whether a kernel walker follows climb route `id` up to its end (cached per context). */
export function routeWalkable(ctx: GenContext, id: number): boolean {
  let m = routeOk.get(ctx);
  if (!m) { m = new Map(); routeOk.set(ctx, m); }
  const hit = m.get(id);
  if (hit !== undefined) return hit;
  const r = byId(ctx.world.climbRoutes, id);
  const ok = !!r && walkRouteUp(kernelOf(ctx), r.points, ctx.dims.bu);
  m.set(id, ok);
  return ok;
}

/** Season bits of a catalogue window in default-year days (null = all seasons but winter for living food). */
export function seasonMaskOf(days: [number, number] | null, allYear = false): number {
  if (!days) return allYear ? (1 << SEASONS.length) - 1 : 0b0111;
  let m = 0;
  for (let d = days[0]; d <= days[1]; d++) m |= 1 << Math.min(SEASONS.length - 1, Math.floor((d - 1) / 7));
  return m;
}

/** Records a food anchor of a catalogue variant (the variant is the first word of initialState). */
export function addAnchor(ctx: GenContext, variant: FoodVariant | null, kind: FoodKind, pos: Vec3, hostObjectId = -1, extra = 'full', seasonMask?: number): number {
  const def = variant ? SOURCE_CATALOGUE[variant] : null;
  const all = kind === 'crumb' || kind === 'sugar' || kind === 'pet-food' || kind === 'dew';
  const mask = seasonMask ?? seasonMaskOf(def?.window ?? null, all);
  return addFoodAnchor(ctx, { kind, pos, up: UP, hostObjectId, seasonMask: mask, initialState: variant ? `${variant} ${extra}` : extra });
}

const idMaps = new WeakMap<readonly { id: number }[], { n: number; m: Map<number, { id: number }> }>();

/** Element with this id of a world registry (objects, routes, POIs are compacted when objects are removed). */
export function byId<T extends { id: number }>(list: readonly T[], id: number): T | undefined {
  const direct = list[id];
  if (direct && direct.id === id) return direct;
  let e = idMaps.get(list);
  if (!e || e.n !== list.length) {
    e = { n: list.length, m: new Map(list.map((x) => [x.id, x])) };
    idMaps.set(list, e);
  }
  return e.m.get(id) as T | undefined;
}

export const objectById = (ctx: GenContext, id: number): WorldObject | undefined => byId(ctx.world.objects, id);
export const poiById = (ctx: GenContext, id: number): Poi | undefined => byId(ctx.world.pois, id);
export const routeById = (ctx: GenContext, id: number): ClimbRoute | undefined => byId(ctx.world.climbRoutes, id);
