// Coarse 16 BU navigation grid (GDD 04 §11): class, cost, walkable ground height and flags per cell, from the
// 4 BU column raster. `edge` outside the soft margin (and partial cells beyond L), `blocked-solid` where at least
// half the cell is under tall objects or they cut it with a full row or column, `hole` / `water-body` from terrain holes and static water, `step` where the
// ground differs from a neighbour by more than 2 BU (edges pay the climb in validate/graph.ts).

import { MATERIAL_IDS, NAV_CELL_FLAGS, NAV_CLASSES, materialFromCode, type NavClass } from '@/sim/types';
import type { GenContext } from '../kit/context';
import type { Columns } from './columns';
import { OVER_SHELTER } from './columns';
import { HOT_MATERIALS, MULCH, NAV, SURFACE_COST, SURFACE_COST_MATERIAL, SURFACE_COST_VARIANT } from '../tuning/maps';

const HOT_CODE = Uint8Array.from(MATERIAL_IDS, (m) => (HOT_MATERIALS.includes(m) ? 1 : 0));

export const CLS = Object.fromEntries(NAV_CLASSES.map((c, i) => [c, i])) as Record<NavClass, number>;

export interface NavDerived {
  /** Mean ground (terrain / floor) height per nav cell, mm (water routing, hollows). */
  baseY: Float32Array;
  /** Share 0..1 of each nav cell under an overhead primitive. */
  shelterShare: Float32Array;
  /** 1 where most of the walkable ground is a non-climbable primitive top: steps onto the cell are blocked. */
  noClimb: Uint8Array;
}

export function buildNav(ctx: GenContext, col: Columns): NavDerived {
  const { navN, navCell, cells, sub, size: L, bu } = ctx.dims;
  const w = ctx.world, lay = ctx.layout;
  const nn = navN * navN;
  const cls = w.nav.cls.data, cost = w.nav.cost.data;
  const groundY = new Float32Array(nn);
  const flags = new Uint8Array(nn);
  const baseY = new Float32Array(nn), shelterShare = new Float32Array(nn), noClimb = new Uint8Array(nn);
  const holes = w.terrainHoles?.data;
  const margin = NAV.edgeMarginBu * bu;
  for (let k = 0; k < navN; k++) for (let i = 0; i < navN; i++) {
    const c = k * navN + i;
    let blocked = 0, total = 0, walk = 0, nWalk = 0, b = 0, hole = 0, shel = 0, hot = 0, slick = 0, maxTop = -Infinity;
    for (let dk = 0; dk < sub; dk++) for (let di = 0; di < sub; di++) {
      const ti = i * sub + di, tk = k * sub + dk;
      if (ti >= cells || tk >= cells) continue;
      const j = tk * cells + ti;
      total++;
      b += col.base[j];
      if (col.topAll[j] > maxTop) maxTop = col.topAll[j];
      if (Number.isNaN(col.walkTop[j])) blocked++; else { walk += col.walkTop[j]; nWalk++; slick += col.noClimb[j]; }
      if (holes && holes[j]) hole++;
      if (col.over[j] & OVER_SHELTER) shel++;
      hot += HOT_CODE[w.ground.surface.data[j]];
    }
    baseY[c] = total > 0 ? b / total : 0;
    shelterShare[c] = total > 0 ? shel / total : 0;
    groundY[c] = nWalk > 0 ? walk / nWalk : maxTop;
    noClimb[c] = nWalk > 0 && slick * 2 >= nWalk ? 1 : 0;
    const cx = (i + 0.5) * navCell, cz = (k + 0.5) * navCell;
    let cl: NavClass = 'open';
    if (cx < margin || cz < margin || cx > L - margin || cz > L - margin || (i + 1) * navCell > L + 1e-6 || (k + 1) * navCell > L + 1e-6) cl = 'edge';
    else if (hole * 2 >= total && hole > 0) cl = 'hole';
    else if (blocked >= NAV.blockedShare * total || crossesCell(col.walkTop, cells, i * sub, k * sub, sub)) cl = 'blocked-solid';
    cls[c] = CLS[cl];
    const zn = lay.zones[lay.nav[c]];
    let mult = SURFACE_COST[zn.type] ?? 1;
    mult = SURFACE_COST_VARIANT[zn.variant] ?? mult;
    if (zn.type === 'garden-bed' && zn.mulched) mult = MULCH.cost;
    const centre = Math.min(cells - 1, k * sub + (sub >> 1)) * cells + Math.min(cells - 1, i * sub + (sub >> 1));
    mult = Math.max(mult, SURFACE_COST_MATERIAL[materialFromCode(w.ground.surface.data[centre])] ?? 1);
    cost[c] = Math.min(254, Math.round(mult * NAV.costUnit));
    let f = shel * 2 >= total ? NAV_CELL_FLAGS.SHELTER : NAV_CELL_FLAGS.EXPOSED;
    if (zn.type === 'interior') f |= NAV_CELL_FLAGS.INTERIOR;
    if (hot * 2 >= total) f |= NAV_CELL_FLAGS.HOT;
    flags[c] = f;
  }
  // static water bodies
  for (const wb of w.waterBodies) markDisc(ctx, wb.pos.x, wb.pos.z, wb.radius, (c) => { cls[c] = CLS['water-body']; flags[c] |= NAV_CELL_FLAGS.WATER; });
  // steps: walkable cells whose ground differs from a walkable neighbour by more than NAV_STEP_BU
  const stepMm = NAV.stepBu * bu;
  for (let k = 0; k < navN; k++) for (let i = 0; i < navN; i++) {
    const c = k * navN + i;
    if (cls[c] !== CLS.open) continue;
    let step = false;
    for (let dk = -1; dk <= 1 && !step; dk++) for (let di = -1; di <= 1 && !step; di++) {
      const x = i + di, z = k + dk;
      if ((!di && !dk) || x < 0 || z < 0 || x >= navN || z >= navN) continue;
      const o = z * navN + x;
      if ((cls[o] === CLS.open || cls[o] === CLS.step) && Math.abs(groundY[o] - groundY[c]) > stepMm) step = true;
    }
    if (step) cls[c] = CLS.step;
  }
  w.nav.groundY = groundY;
  w.nav.flags = { cell: navCell, nx: navN, nz: navN, data: flags };
  return { baseY, shelterShare, noClimb };
}

/**
 * A full row or column of blocked 4 BU samples across a nav cell: a thin barrier (a door leaf, a panel) that
 * covers less than half the cell but still cuts it (the same rule as the runtime grid's crossesCell).
 */
function crossesCell(walkTop: Float32Array, cells: number, ti0: number, tk0: number, sub: number): boolean {
  if (ti0 + sub > cells || tk0 + sub > cells) return false; // partial cells are `edge` anyway
  for (let a = 0; a < sub; a++) {
    let row = true, col = true;
    for (let b = 0; b < sub && (row || col); b++) {
      if (!Number.isNaN(walkTop[(tk0 + a) * cells + ti0 + b])) row = false;
      if (!Number.isNaN(walkTop[(tk0 + b) * cells + ti0 + a])) col = false;
    }
    if (row || col) return true;
  }
  return false;
}

/** Calls fn for nav cells whose centre lies within r of (x, z). */
export function markDisc(ctx: GenContext, x: number, z: number, r: number, fn: (c: number) => void): void {
  const { navN, navCell } = ctx.dims;
  const i0 = Math.max(0, Math.floor((x - r) / navCell)), i1 = Math.min(navN - 1, Math.floor((x + r) / navCell));
  const k0 = Math.max(0, Math.floor((z - r) / navCell)), k1 = Math.min(navN - 1, Math.floor((z + r) / navCell));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const dx = (i + 0.5) * navCell - x, dz = (k + 0.5) * navCell - z;
    if (dx * dx + dz * dz <= r * r) fn(k * navN + i);
  }
}

/** True if the class is walkable for travel (open or step). */
export function walkable(clsByte: number): boolean {
  return clsByte === CLS.open || clsByte === CLS.step;
}
