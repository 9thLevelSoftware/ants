// Density tables for scattered props and plants (GDD 04 §4.1 thinning, §4.2 steps 4-5): like the kit's
// placeTables, but each object goes through `commit` so its sockets (under-stone lenses, galleries) and plant host
// data are registered. All tables of a budget category in one call are thinned together.

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { GenContext } from '../../kit/context';
import { poissonDisk } from '../../kit/poisson';
import { PLACE, type BudgetCategory } from '../../tuning/pipeline';
import type { Built } from '../../catalog/outdoor/types';
import type { Rect } from '../../layout/types';
import { commit, type CommitOptions } from './commit';
import { zoneAreaM2, zoneIdAt, zoneRect } from './zones';

export interface OutTable {
  id: string;
  category: BudgetCategory;
  /** Host zone ids. */
  zones: number[];
  densityPerM2: number;
  spacingMm: number;
  /** Extra eligibility of a point. */
  eligible?: (x: number, z: number) => boolean;
  make: (rng: RngState, i: number) => Built;
  /** Placement options besides x, z (yaw, atGround ...). */
  options?: (rng: RngState) => Partial<CommitOptions>;
  max?: number;
}

function unionRect(ctx: GenContext, ids: number[]): Rect | null {
  let r: Rect | null = null;
  for (const id of ids) {
    if (zoneAreaM2(ctx, id) <= 0) continue;
    const z = zoneRect(ctx, id);
    r = r ? { x0: Math.min(r.x0, z.x0), z0: Math.min(r.z0, z.z0), x1: Math.max(r.x1, z.x1), z1: Math.max(r.z1, z.z1) } : { ...z };
  }
  return r;
}

/** Expected and placed counts per table id. */
export interface TableResult { expected: number; placed: number; thin: number; areaM2: number }

export function runTables(ctx: GenContext, step: string, tables: readonly OutTable[]): Record<string, TableResult> {
  const area = (t: OutTable) => t.zones.reduce((s, id) => s + zoneAreaM2(ctx, id), 0);
  const expected: Partial<Record<BudgetCategory, number>> = {};
  for (const t of tables) expected[t.category] = (expected[t.category] ?? 0) + t.densityPerM2 * area(t);
  const thin: Partial<Record<BudgetCategory, number>> = {};
  for (const k of Object.keys(expected) as BudgetCategory[]) {
    const left = ctx.budget.limit[k] - ctx.budget.used[k];
    thin[k] = expected[k]! > left ? Math.max(0, left) / expected[k]! : 1;
  }
  const out: Record<string, TableResult> = {};
  for (const t of tables) {
    const label = `wg/${step}/outdoor/${t.id}`;
    const a = area(t), wanted = t.densityPerM2 * thin[t.category]!;
    const rect = unionRect(ctx, t.zones);
    out[t.id] = { expected: wanted * a, placed: 0, thin: thin[t.category]!, areaM2: a };
    if (!rect || !(wanted > 0) || a <= 0) continue;
    const accept = (x: number, z: number) => t.zones.includes(zoneIdAt(ctx, x, z)) && (!t.eligible || t.eligible(x, z));
    const spacing = Math.max(t.spacingMm, Math.sqrt(PLACE.tableFill / (wanted / 1e6)));
    const pts = poissonDisk(ctx.rng(label), rect, spacing, accept);
    const p = pts.length > 0 ? (wanted * a) / pts.length : 0;
    const choose = ctx.rng(`${label}/accept`);
    let n = 0;
    for (let i = 0; i < pts.length; i++) {
      if (rngFloat(choose) >= p) continue;
      if (t.max !== undefined && n >= t.max) break;
      const rng = ctx.rngFor(label, i);
      const b = t.make(rng, i);
      const o: CommitOptions = { yaw: rngFloat(rng) * 2 * Math.PI, collide: true, category: t.category, ...(t.options ? t.options(rng) : {}), x: pts[i].x, z: pts[i].z };
      if (commit(ctx, b, o) >= 0) n++;
    }
    out[t.id].placed = n;
  }
  return out;
}
