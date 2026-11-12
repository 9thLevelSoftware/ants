// Top-surface rasterisation (GDD 04 §4.2 step 6, §11): for every 4 BU terrain cell centre, where the walkable
// ground is (terrain, a floor slab, or the top of a low object standing on it), whether a tall object blocks it,
// what covers it overhead (shelter, founding ceiling) and the highest solid (for shade).
//
// Every primitive's columns are computed once (closed form, kit/column.ts) into flat per-primitive lists, then
// the passes (ground, two contact passes for one level of stacking, overheads) read the lists.

import type { GenContext, DerivedCache } from '../kit/context';
import { primColumnAnalytic, type ColumnFn, type ColumnHit } from '../kit/column';
import { primIndex } from '../kit/surface';
import { NAV, CEILING_MATERIALS, SUIT, WARM_COVER_MATERIALS } from '../tuning/maps';
import { PrimFlag, type MaterialId } from '@/sim/types';

export const OVER_SHELTER = 1;
export const OVER_WARM = 2;

export interface Columns extends DerivedCache {
  /** Ground under objects: terrain or a ground-defining primitive (floor slab), per terrain cell, mm. */
  base: Float32Array;
  /**
   * 1 where the walkable surface is the top of a primitive the AI may not climb (no CLIMBABLE flag, or SLIPPERY):
   * a step up onto it is not a climbable face (GDD 04 §11). Terrain materials all have grip >= 0.6 (GDD 04 §3).
   */
  noClimb: Uint8Array;
}

const WOOD: readonly MaterialId[] = ['wood-decayed', 'wood-sound'];

/** Columns of every solid primitive at the terrain cell centres it covers: prim pi owns [start[pi], start[pi+1]). */
export interface PrimColumns {
  start: Int32Array;
  cell: Int32Array;
  bottom: Float64Array;
  top: Float64Array;
}

/** Rasterises every non-visual primitive once with `column` (the analytic routine by default). */
export function rasterPrims(ctx: GenContext, column: ColumnFn = primColumnAnalytic): PrimColumns {
  const { cells, cell } = ctx.dims;
  const ix = primIndex(ctx);
  const prims = ctx.world.prims, P = prims.length;
  const start = new Int32Array(P + 1);
  let cap = 1 << 16, n = 0;
  let cellArr = new Int32Array(cap), bot = new Float64Array(cap), top = new Float64Array(cap);
  const col: ColumnHit = { hit: false, bottom: 0, top: 0 };
  for (let pi = 0; pi < P; pi++) {
    start[pi] = n;
    if ((prims[pi].flags & PrimFlag.VISUAL_ONLY) !== 0) continue;
    const e = ix.entries[pi];
    const i0 = Math.max(0, Math.floor(e.minX / cell)), i1 = Math.min(cells - 1, Math.floor(e.maxX / cell));
    const k0 = Math.max(0, Math.floor(e.minZ / cell)), k1 = Math.min(cells - 1, Math.floor(e.maxZ / cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      column(e, (i + 0.5) * cell, (k + 0.5) * cell, col);
      if (!col.hit) continue;
      if (n === cap) {
        cap *= 2;
        const c2 = new Int32Array(cap), b2 = new Float64Array(cap), t2 = new Float64Array(cap);
        c2.set(cellArr); b2.set(bot); t2.set(top);
        cellArr = c2; bot = b2; top = t2;
      }
      cellArr[n] = k * cells + i; bot[n] = col.bottom; top[n] = col.top;
      n++;
    }
  }
  start[P] = n;
  return { start, cell: cellArr.subarray(0, n), bottom: bot.subarray(0, n), top: top.subarray(0, n) };
}

export function rasterColumns(ctx: GenContext, column: ColumnFn = primColumnAnalytic): Columns {
  const { cells, samples, bu } = ctx.dims;
  const n = cells * cells;
  const H = ctx.world.terrain.data;
  const base = new Float32Array(n), contact = new Float32Array(n), topAll = new Float32Array(n);
  const overMin = new Float32Array(n).fill(Infinity);
  const coverCeil = new Uint8Array(n), over = new Uint8Array(n);
  const wood = new Int32Array(n).fill(-1);
  const top = new Int32Array(n).fill(-1); // primitive whose top is the walkable surface, -1 terrain
  for (let k = 0; k < cells; k++) for (let i = 0; i < cells; i++) {
    const s = k * samples + i;
    base[k * cells + i] = (H[s] + H[s + 1] + H[s + samples] + H[s + samples + 1]) / 4;
  }
  const prims = ctx.world.prims, P = prims.length;
  const pc = rasterPrims(ctx, column);
  const { start, cell: cj, bottom: cb, top: ct } = pc;
  const isGround = new Uint8Array(P);
  for (let pi = 0; pi < P; pi++) isGround[pi] = ctx.groundPrims.has(prims[pi].id) ? 1 : 0;
  // 1. ground-defining primitives (floor slabs) replace the terrain as the ground
  for (let pi = 0; pi < P; pi++) {
    if (!isGround[pi]) continue;
    for (let q = start[pi]; q < start[pi + 1]; q++) {
      const j = cj[q];
      if (ct[q] > base[j]) { base[j] = ct[q]; top[j] = pi; }
    }
  }
  contact.set(base);
  topAll.set(base);
  // 2. objects standing on the ground (or within the clearance of it), then one level of stacking
  const clear = NAV.clearanceBu * bu;
  for (let pass = 0; pass < 2; pass++) {
    for (let pi = 0; pi < P; pi++) {
      if (isGround[pi]) continue;
      for (let q = start[pi]; q < start[pi + 1]; q++) {
        const j = cj[q], t = ct[q];
        if (cb[q] <= contact[j] + clear && t > contact[j]) { contact[j] = t; top[j] = pi; }
      }
    }
  }
  // 3. overheads, cover, wood, highest solid
  const ceilMax = SUIT.ceilingMaxBu * bu;
  const overMaxMm = NAV.overMaxBu * bu, crawl = NAV.crawlGapBu * bu;
  const tallLow = new Uint8Array(n);
  for (let pi = 0; pi < P; pi++) {
    if (isGround[pi]) continue;
    const m = prims[pi].material;
    const ceiling = CEILING_MATERIALS.includes(m), warm = WARM_COVER_MATERIALS.includes(m), isWood = WOOD.includes(m);
    const decayed = m === 'wood-decayed';
    for (let q = start[pi]; q < start[pi + 1]; q++) {
      const j = cj[q], b = cb[q], t = ct[q];
      if (t > topAll[j]) topAll[j] = t;
      if (b > contact[j] && b < overMin[j]) overMin[j] = b;
      if (b <= contact[j] + crawl && t - base[j] > overMaxMm) tallLow[j] = 1;
      if (ceiling && (b <= base[j] + clear || b - contact[j] <= ceilMax)) {
        coverCeil[j] = 1;
        if (warm) over[j] |= OVER_WARM;
      }
      if (isWood && (wood[j] < 0 || decayed)) wood[j] = pi;
    }
  }
  // per primitive, so the cell loop below reads no imported binding (module getters are slow in hot loops)
  const climbable = PrimFlag.CLIMBABLE, slippery = PrimFlag.SLIPPERY;
  const primNoClimb = new Uint8Array(P);
  for (let pi = 0; pi < P; pi++) {
    const f = prims[pi].flags;
    primNoClimb[pi] = (f & climbable) === 0 || (f & slippery) !== 0 ? 1 : 0;
  }
  const walkTop = new Float32Array(n), noClimb = new Uint8Array(n);
  for (let j = 0; j < n; j++) {
    const c = contact[j];
    walkTop[j] = c - base[j] > overMaxMm || tallLow[j] !== 0 ? NaN : c;
    const o = overMin[j];
    if (o !== Infinity && o > c) over[j] |= OVER_SHELTER;
    const t = top[j];
    if (t >= 0) noClimb[j] = primNoClimb[t];
  }
  return { base, walkTop, topAll, coverCeil, over, wood, noClimb };
}
