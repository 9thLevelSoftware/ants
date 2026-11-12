// Zone queries and edits of the terrain grids for placers (run in steps 3-5, before the derived maps): repaint
// ground layers (slab bedding under a paving grid, loam in a planter), set heights in a rectangle, cut terrain
// holes (gully pots, drains: GDD 04 §13.2; the hole must be enclosed by primitives, check v-enclose).

import type { MaterialId, ZoneType, ZoneVariant } from '@/sim/types';
import { materialCode } from '@/sim/types';
import type { GenContext } from './context';
import type { LayoutZone, Rect } from '../layout/types';
import { qmm } from './quantize';

/** Zone of the terrain cell containing (x, z) (clamped to the map). */
export function zoneAt(ctx: GenContext, x: number, z: number): LayoutZone {
  const { cell, cells } = ctx.dims;
  const i = Math.min(cells - 1, Math.max(0, Math.floor(x / cell)));
  const k = Math.min(cells - 1, Math.max(0, Math.floor(z / cell)));
  return ctx.layout.zones[ctx.layout.cells[k * cells + i]];
}

export function zoneTypeAt(ctx: GenContext, x: number, z: number): ZoneType {
  return zoneAt(ctx, x, z).type;
}

/** True if (x, z) lies in a zone of one of the types (and variants, when given). */
export function inZones(ctx: GenContext, x: number, z: number, types: readonly ZoneType[], variants?: readonly ZoneVariant[]): boolean {
  const zn = zoneAt(ctx, x, z);
  return types.includes(zn.type) && (!variants || variants.includes(zn.variant));
}

/** Terrain-cell index range covered by a rect (cells whose centre lies inside). */
function cellRange(ctx: GenContext, r: Rect): [number, number, number, number] {
  const { cell, cells } = ctx.dims;
  const lo = (v: number) => Math.max(0, Math.ceil(v / cell - 0.5));
  const hi = (v: number) => Math.min(cells - 1, Math.ceil(v / cell - 0.5) - 1);
  return [lo(r.x0), hi(r.x1), lo(r.z0), hi(r.z1)];
}

export interface GroundPaint { surface?: MaterialId; crustMm?: number; subsoil?: MaterialId }

/** Repaints the ground layers of every terrain cell whose centre lies in the rect. */
export function paintGround(ctx: GenContext, r: Rect, g: GroundPaint): void {
  const { cells } = ctx.dims;
  const gl = ctx.world.ground;
  const [i0, i1, k0, k1] = cellRange(ctx, r);
  const s = g.surface !== undefined ? materialCode(g.surface) : -1;
  const b = g.subsoil !== undefined ? materialCode(g.subsoil) : -1;
  const c = g.crustMm !== undefined ? Math.max(0, Math.min(255, Math.round(g.crustMm))) : -1;
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const j = k * cells + i;
    if (s >= 0) gl.surface.data[j] = s;
    if (b >= 0) gl.subsoil.data[j] = b;
    if (c >= 0) gl.crustMm.data[j] = c;
  }
}

/** Sets heightfield samples inside the rect to f(x, z, old) (quantised), mm. */
export function editHeights(ctx: GenContext, r: Rect, f: (x: number, z: number, old: number) => number): void {
  const t = ctx.world.terrain;
  const i0 = Math.max(0, Math.ceil(r.x0 / t.cell)), i1 = Math.min(t.nx - 1, Math.floor(r.x1 / t.cell));
  const k0 = Math.max(0, Math.ceil(r.z0 / t.cell)), k1 = Math.min(t.nz - 1, Math.floor(r.z1 / t.cell));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const j = k * t.nx + i;
    t.data[j] = qmm(f(i * t.cell, k * t.cell, t.data[j]));
  }
}

/** Marks terrain cells of the rect as holes (the ground term is removed there; primitives must enclose it). */
export function cutTerrainHole(ctx: GenContext, r: Rect): void {
  const { cell, cells } = ctx.dims;
  if (!ctx.world.terrainHoles) ctx.world.terrainHoles = { cell, nx: cells, nz: cells, data: new Uint8Array(cells * cells) };
  const h = ctx.world.terrainHoles.data;
  const [i0, i1, k0, k1] = cellRange(ctx, r);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) h[k * cells + i] = 1;
  ctx.provides.add('holes');
}
