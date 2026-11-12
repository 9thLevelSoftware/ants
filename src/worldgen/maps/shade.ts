// Shade samples (GDD 04 §12.3): for the sun at 06, 08 ... 18 h, a ray from each nav cell's ground toward the sun
// over the highest-solid map (half-cell steps) plus tree canopy discs (transmittance 0.3). 0 = full sun,
// 255 = full shade; interior cells are full shade. maps.shade is the 08:00-18:00 mean. The march skips blocks of
// cells that lie wholly below the ray (exact: the same samples decide as in a plain march).

import type { ByteMap } from '@/sim/types';
import type { GenContext } from '../kit/context';
import type { Columns } from './columns';
import { SHADE, SHADE_MEAN_FROM_INDEX, SUN_DIRS, SUN_HOURS } from '../tuning/maps';

export interface ShadeResult {
  /** 0..1 mean shade 08:00-18:00 per nav cell. */
  mean: Float32Array;
  /** 0..1 canopy shading per nav cell (for shelter). */
  canopy: Float32Array;
}

/** Sides of the two levels of max blocks the ray march skips over, nav cells (powers of two: shifts). */
const FINE_SHIFT = 3;
const COARSE_SHIFT = 6;

interface Blocks { side: number; n: number; max: Float32Array }

/** Highest solid per side x side block of nav cells. */
function blockMax(top: Float32Array, navN: number, shift: number): Blocks {
  const side = 1 << shift;
  const n = Math.ceil(navN / side);
  const max = new Float32Array(n * n).fill(-Infinity);
  for (let k = 0; k < navN; k++) for (let i = 0; i < navN; i++) {
    const b = Math.floor(k / side) * n + Math.floor(i / side), v = top[k * navN + i];
    if (v > max[b]) max[b] = v;
  }
  return { side, n, max };
}

/**
 * Roughly the parameter t at which the ray (x0 + ux t, z0 + uz t) leaves block (bi, bk) of side bs mm (iux = 1 / ux,
 * Infinity for 0: multiplications, as only a jump target with a margin of whole steps depends on it).
 */
function blockExit(bi: number, bk: number, bs: number, x0: number, z0: number, ux: number, uz: number, iux: number, iuz: number): number {
  const tx = ux > 0 ? ((bi + 1) * bs - x0) * iux : ux < 0 ? (bi * bs - x0) * iux : Infinity;
  const tz = uz > 0 ? ((bk + 1) * bs - z0) * iuz : uz < 0 ? (bk * bs - z0) * iuz : Infinity;
  return tx < tz ? tx : tz;
}

/** What the ray march reads (one object, so the march is a small function V8 optimises on its own). */
interface RayGrid {
  top: Float32Array; navN: number; navCell: number; step: number; lift: number; globalTop: number; topMax: number; skip: boolean;
  fineMax: Float32Array; fineN: number; fineMm: number; coarseMax: Float32Array; coarseN: number; coarseMm: number;
}

/**
 * 1 if the ray from (x0, y0, z0) along the horizontal unit direction (ux, uz), rising `rise` per mm, clears every
 * solid; 0 if a sample lands below a cell's highest solid (+ lift). Samples at t = s x step (exact: step is a whole
 * number of mm). Only the solids can stop the march, so it ends once the ray clears the highest one; a sample
 * whose coarse or fine block lies wholly below the ray lets the march jump to just before that block's exit (the
 * ray only rises). The same samples decide as in a plain march (`skip` false).
 */
function sunlit(g: RayGrid, x0: number, z0: number, y0: number, ux: number, uz: number, rise: number): number {
  const { top, navN, navCell, step, lift, globalTop, topMax, skip, fineMax, fineN, fineMm, coarseMax, coarseN, coarseMm } = g;
  const iux = 1 / ux, iuz = 1 / uz, istep = 1 / step;
  for (let s = 1; ; s++) {
    const t = s * step;
    const y = y0 + t * rise;
    if (y > globalTop || (skip && y + lift >= topMax)) return 1;
    const x = x0 + ux * t, z = z0 + uz * t;
    const i = Math.floor(x / navCell), k = Math.floor(z / navCell);
    if (i < 0 || k < 0 || i >= navN || k >= navN) return 1;
    const level = y + lift;
    if (top[k * navN + i] > level) return 0;
    if (!skip) continue;
    let exit = -1;
    const ci = i >> COARSE_SHIFT, ck = k >> COARSE_SHIFT;
    if (coarseMax[ck * coarseN + ci] <= level) exit = blockExit(ci, ck, coarseMm, x0, z0, ux, uz, iux, iuz);
    else {
      const fi = i >> FINE_SHIFT, fk = k >> FINE_SHIFT;
      if (fineMax[fk * fineN + fi] <= level) exit = blockExit(fi, fk, fineMm, x0, z0, ux, uz, iux, iuz);
    }
    if (exit > 0) {
      const last = Math.floor(exit * istep) - 2; // a whole step inside the block, clear of rounding at its border
      if (last > s) s = last;
    }
  }
}

export function buildShade(ctx: GenContext, col: Columns, skip = true): ShadeResult {
  const { navN, navCell, cells, sub, bu } = ctx.dims;
  const nn = navN * navN;
  const w = ctx.world;
  // highest solid per nav cell
  const top = new Float32Array(nn).fill(-Infinity);
  let globalTop = -Infinity;
  for (let k = 0; k < cells; k++) for (let i = 0; i < cells; i++) {
    const c = Math.floor(k / sub) * navN + Math.floor(i / sub), t = col.topAll[k * cells + i];
    if (t > top[c]) top[c] = t;
    if (t > globalTop) globalTop = t;
  }
  for (const d of ctx.canopies) globalTop = Math.max(globalTop, d.y);
  const groundY = w.nav.groundY!;
  const interior = ctx.layout.zones.map((z) => z.type === 'interior');
  const maps: ByteMap[] = SUN_HOURS.map(() => ({ cell: navCell, nx: navN, nz: navN, data: new Uint8Array(nn) }));
  const mean = new Float32Array(nn), canopy = new Float32Array(nn);
  const meanCount = SUN_HOURS.length - SHADE_MEAN_FROM_INDEX;
  const lift = 0.5 * bu;
  const step = SHADE.stepCells * navCell;
  const fine = blockMax(top, navN, FINE_SHIFT), coarse = blockMax(top, navN, COARSE_SHIFT);
  let topMax = -Infinity;
  for (let c = 0; c < nn; c++) if (top[c] > topMax) topMax = top[c];
  const g: RayGrid = {
    top, navN, navCell, step, lift, globalTop, topMax, skip,
    fineMax: fine.max, fineN: fine.n, fineMm: fine.side * navCell, coarseMax: coarse.max, coarseN: coarse.n, coarseMm: coarse.side * navCell,
  };
  const sun = SUN_DIRS.map(([dx, dy, dz]) => {
    const horiz = Math.sqrt(dx * dx + dz * dz);
    return horiz > 1e-9 ? { dx, dy, dz, ux: dx / horiz, uz: dz / horiz, rise: dy / horiz, flat: false } : { dx, dy, dz, ux: 0, uz: 0, rise: 0, flat: true };
  });
  // imported bindings and context fields read once (module getters are slow in hot loops under Vitest)
  const hours = SUN_HOURS.length, meanFrom = SHADE_MEAN_FROM_INDEX, interiorShade = SHADE.interior;
  const navZone = ctx.layout.nav, canopies = ctx.canopies;
  for (let c = 0; c < nn; c++) {
    if (interior[navZone[c]]) {
      for (const m of maps) m.data[c] = interiorShade;
      mean[c] = 1;
      continue;
    }
    const x0 = ((c % navN) + 0.5) * navCell, z0 = (Math.floor(c / navN) + 0.5) * navCell;
    const y0 = (Number.isFinite(groundY[c]) ? groundY[c] : 0) + lift;
    let canopyMin = 1;
    for (let h = 0; h < hours; h++) {
      const { dx, dy, dz, ux, uz, rise, flat } = sun[h];
      let light = flat ? 1 : sunlit(g, x0, z0, y0, ux, uz, rise);
      if (light > 0) {
        for (const d of canopies) {
          if (d.y <= y0) continue;
          const t = (d.y - y0) / dy;
          const px = x0 + dx * t - d.x, pz = z0 + dz * t - d.z;
          if (px * px + pz * pz <= d.r * d.r) light *= d.transmittance;
        }
      }
      const sh = 1 - light;
      maps[h].data[c] = Math.round(sh * 255);
      if (h >= meanFrom) mean[c] += sh / meanCount;
    }
    for (const d of canopies) {
      if (d.y <= y0) continue;
      const px = x0 - d.x, pz = z0 - d.z;
      if (px * px + pz * pz <= d.r * d.r) canopyMin = Math.min(canopyMin, d.transmittance);
    }
    canopy[c] = 1 - canopyMin;
  }
  w.maps.shadeHours = { hours: [...SUN_HOURS], maps };
  for (let c = 0; c < nn; c++) w.maps.shade.data[c] = Math.round(mean[c] * 255);
  return { mean, canopy };
}
