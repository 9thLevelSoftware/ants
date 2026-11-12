// Top-surface rasterisation (GDD 04 §4.2 step 6, §11): for every 4 BU terrain cell centre, where the walkable
// ground is (terrain, a floor slab, or the top of a low object standing on it), whether a tall object blocks it,
// what covers it overhead (shelter, founding ceiling) and the highest solid (for shade).

import type { GenContext, DerivedCache } from '../kit/context';
import { primColumn, type ColumnHit } from '../kit/column';
import { primIndex } from '../kit/surface';
import { NAV, CEILING_MATERIALS, SUIT, WARM_COVER_MATERIALS } from '../tuning/maps';
import { PrimFlag, type MaterialId } from '@/sim/types';

export const OVER_SHELTER = 1;
export const OVER_WARM = 2;

export interface Columns extends DerivedCache {
  /** Ground under objects: terrain or a ground-defining primitive (floor slab), per terrain cell, mm. */
  base: Float32Array;
}

const WOOD: readonly MaterialId[] = ['wood-decayed', 'wood-sound'];

export function rasterColumns(ctx: GenContext): Columns {
  const { cells, cell, samples, bu } = ctx.dims;
  const n = cells * cells;
  const H = ctx.world.terrain.data;
  const base = new Float32Array(n), contact = new Float32Array(n), topAll = new Float32Array(n);
  const overMin = new Float32Array(n).fill(Infinity);
  const coverCeil = new Uint8Array(n), over = new Uint8Array(n);
  const wood = new Int32Array(n).fill(-1);
  for (let k = 0; k < cells; k++) for (let i = 0; i < cells; i++) {
    const s = k * samples + i;
    base[k * cells + i] = (H[s] + H[s + 1] + H[s + samples] + H[s + samples + 1]) / 4;
  }
  const ix = primIndex(ctx);
  const prims = ctx.world.prims;
  const col: ColumnHit = { hit: false, bottom: 0, top: 0 };
  const clear = NAV.clearanceBu * bu;
  const forCells = (pi: number, fn: (j: number, b: number, t: number) => void) => {
    const e = ix.entries[pi];
    const i0 = Math.max(0, Math.floor(e.minX / cell)), i1 = Math.min(cells - 1, Math.floor(e.maxX / cell));
    const k0 = Math.max(0, Math.floor(e.minZ / cell)), k1 = Math.min(cells - 1, Math.floor(e.maxZ / cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      primColumn(e, (i + 0.5) * cell, (k + 0.5) * cell, col);
      if (col.hit) fn(k * cells + i, col.bottom, col.top);
    }
  };
  const solid = (pi: number) => (prims[pi].flags & PrimFlag.VISUAL_ONLY) === 0;
  // 1. ground-defining primitives (floor slabs) replace the terrain as the ground
  for (let pi = 0; pi < prims.length; pi++) {
    if (!solid(pi) || !ctx.groundPrims.has(prims[pi].id)) continue;
    forCells(pi, (j, _b, t) => { if (t > base[j]) base[j] = t; });
  }
  contact.set(base);
  topAll.set(base);
  // 2. objects standing on the ground (or within the clearance of it), then one level of stacking
  const contactPass = (pi: number) => forCells(pi, (j, b, t) => {
    if (b <= contact[j] + clear && t > contact[j]) contact[j] = t;
  });
  for (let pi = 0; pi < prims.length; pi++) if (solid(pi) && !ctx.groundPrims.has(prims[pi].id)) contactPass(pi);
  for (let pi = 0; pi < prims.length; pi++) if (solid(pi) && !ctx.groundPrims.has(prims[pi].id)) contactPass(pi);
  // 3. overheads, cover, wood, highest solid
  const ceilMax = SUIT.ceilingMaxBu * bu;
  const overMaxMm = NAV.overMaxBu * bu, crawl = NAV.crawlGapBu * bu;
  const tallLow = new Uint8Array(n);
  for (let pi = 0; pi < prims.length; pi++) {
    if (!solid(pi) || ctx.groundPrims.has(prims[pi].id)) continue;
    const m = prims[pi].material;
    const ceiling = CEILING_MATERIALS.includes(m), warm = WARM_COVER_MATERIALS.includes(m), isWood = WOOD.includes(m);
    forCells(pi, (j, b, t) => {
      if (t > topAll[j]) topAll[j] = t;
      const onGround = b <= base[j] + clear;
      if (b > contact[j] && b < overMin[j]) overMin[j] = b;
      if (b <= contact[j] + crawl && t - base[j] > overMaxMm) tallLow[j] = 1;
      if (ceiling && (onGround || b - contact[j] <= ceilMax)) {
        coverCeil[j] = 1;
        if (warm) over[j] |= OVER_WARM;
      }
      if (isWood && (wood[j] < 0 || prims[pi].material === 'wood-decayed')) wood[j] = pi;
    });
  }
  const walkTop = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    walkTop[j] = contact[j] - base[j] > overMaxMm || tallLow[j] ? NaN : contact[j];
    if (overMin[j] < Infinity && overMin[j] > contact[j]) over[j] |= OVER_SHELTER;
  }
  return { base, walkTop, topAll, coverCeil, over, wood };
}
