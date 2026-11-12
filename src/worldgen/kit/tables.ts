// Placement tables (GDD 04 §4.1 thinning, §4.2 step 4): a catalogue category declares its zones, density per
// m^2, minimum spacing and a template factory; placeTables thins all tables of a budget category together
// (E = sum density x zone area; if E > budget every density is multiplied by budget / E), Poisson-samples each
// table's zones and places objects with collision tests and per-object RNG sub-streams.

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { ZoneType, ZoneVariant } from '@/sim/types';
import type { GenContext } from './context';
import type { ObjectTemplate, PlaceOptions } from './template';
import { placeObject } from './template';
import { poissonDisk } from './poisson';
import { inZones } from './terrainEdit';
import { PLACE, type BudgetCategory } from '../tuning/pipeline';
import type { Rect } from '../layout/types';

export interface PlacementTable {
  /** Table id (also the RNG label suffix: `wg/<step>/<id>`). */
  id: string;
  category: BudgetCategory;
  zones: readonly ZoneType[];
  variants?: readonly ZoneVariant[];
  /** Objects per m^2 of the eligible zone area. */
  densityPerM2: number;
  /** Minimum spacing between objects of this table, mm. */
  spacingMm: number;
  /** Optional extra eligibility (slope, distance to an edge, under canopy ...). */
  eligible?: (ctx: GenContext, x: number, z: number) => boolean;
  /** Builds the template for object i with its own RNG sub-stream. */
  template: (rng: RngState, i: number) => ObjectTemplate;
  /** Placement options for object i at (x, z) (yaw, embed, tilt ...); collide defaults to true. */
  options?: (rng: RngState, x: number, z: number) => Partial<PlaceOptions>;
  /** Hard cap on the number of objects. */
  max?: number;
}

/** Eligible area of a table, m^2 (terrain cells of its zones), and the bounding rect of those cells, mm. */
function tableExtent(ctx: GenContext, t: PlacementTable): { areaM2: number; rect: Rect | null } {
  const { cell, cells } = ctx.dims;
  const ok = new Uint8Array(ctx.layout.zones.length);
  for (const z of ctx.layout.zones) ok[z.id] = t.zones.includes(z.type) && (!t.variants || t.variants.includes(z.variant)) ? 1 : 0;
  let n = 0, i0 = cells, i1 = -1, k0 = cells, k1 = -1;
  const c = ctx.layout.cells;
  for (let k = 0; k < cells; k++) for (let i = 0; i < cells; i++) {
    if (!ok[c[k * cells + i]]) continue;
    n++;
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k;
  }
  const rect = n > 0 ? { x0: i0 * cell, z0: k0 * cell, x1: (i1 + 1) * cell, z1: (k1 + 1) * cell } : null;
  return { areaM2: (n * cell * cell) / 1e6, rect };
}

/** Eligible area of a table, m^2 (terrain cells of its zones). */
export function tableAreaM2(ctx: GenContext, t: PlacementTable): number {
  return tableExtent(ctx, t).areaM2;
}

/** Density multiplier per category so expected counts fit the remaining budgets. */
export function thinning(ctx: GenContext, tables: readonly PlacementTable[]): Record<BudgetCategory, number> {
  const expected: Record<BudgetCategory, number> = { props: 0, plants: 0, trees: 0, structures: 0 };
  for (const t of tables) expected[t.category] += t.densityPerM2 * tableAreaM2(ctx, t);
  const out = { props: 1, plants: 1, trees: 1, structures: 1 };
  for (const k of Object.keys(out) as BudgetCategory[]) {
    const left = ctx.budget.limit[k] - ctx.budget.used[k];
    if (expected[k] > left && expected[k] > 0) out[k] = Math.max(0, left) / expected[k];
  }
  return out;
}

/** Places every table (in the given order); returns the number of objects placed per table id. */
export function placeTables(ctx: GenContext, step: string, tables: readonly PlacementTable[]): Record<string, number> {
  const thin = thinning(ctx, tables);
  const placed: Record<string, number> = {};
  for (const t of tables) {
    const label = `wg/${step}/${t.id}`;
    const { areaM2: area, rect } = tableExtent(ctx, t);
    const wanted = t.densityPerM2 * thin[t.category];
    if (!rect || !(wanted > 0)) { placed[t.id] = 0; continue; }
    const accept = (x: number, z: number) => inZones(ctx, x, z, t.zones, t.variants) && (!t.eligible || t.eligible(ctx, x, z));
    const spacing = Math.max(t.spacingMm, Math.sqrt(PLACE.tableFill / (wanted / 1e6)));
    const pts = poissonDisk(ctx.rng(label), rect, spacing, accept);
    const poissonDensity = area > 0 ? pts.length / area : 0;
    const p = poissonDensity > 0 ? wanted / poissonDensity : 0;
    const choose = ctx.rng(`${label}/accept`);
    let n = 0;
    for (let i = 0; i < pts.length; i++) {
      if (rngFloat(choose) >= p) continue;
      if (t.max !== undefined && n >= t.max) break;
      const rng = ctx.rngFor(label, i);
      const tpl = t.template(rng, i);
      const opts = { collide: true, category: t.category, ...(t.options ? t.options(rng, pts[i].x, pts[i].z) : {}), x: pts[i].x, z: pts[i].z };
      if (placeObject(ctx, tpl, opts) >= 0) n++;
    }
    placed[t.id] = n;
  }
  return placed;
}
