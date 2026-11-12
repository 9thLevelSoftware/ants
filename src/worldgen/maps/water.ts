// Catchment, flood risk and puddle basins on the nav grid (GDD 04 §13.4): priority-flood of the ground height from
// the map border and terrain holes gives the filled surface (puddle depth) and a flow order (each cell drains to
// the cell it was reached from); flow accumulation in reverse order gives the catchment. Walls and the interior
// (no rain indoors) are excluded.

import { MATERIAL_IDS } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { MinHeap } from '../kit/heap';
import { dlog10 } from '../kit/dmath';
import { boxBlur } from '../terrain/distance';
import { CLS } from './nav';
import type { NavDerived } from './nav';
import { PERMEABLE, WATER } from '../tuning/maps';

export interface WaterResult {
  hollow: Float32Array;
  flood: Float32Array;
  permeable: Float32Array;
}

const PERM_CODE = Float32Array.from(MATERIAL_IDS, (m) => PERMEABLE[m] ?? 1);

export function buildWater(ctx: GenContext, nav: NavDerived): WaterResult {
  const { navN, navCell, cells, sub, bu } = ctx.dims;
  const nn = navN * navN;
  const w = ctx.world;
  const cls = w.nav.cls.data;
  const zones = ctx.layout.zones;
  const dry = new Uint8Array(nn); // excluded from water routing
  for (let c = 0; c < nn; c++) {
    if (cls[c] === CLS['blocked-solid'] || zones[ctx.layout.nav[c]].type === 'interior') dry[c] = 1;
  }
  // permeability per nav cell (mean of its terrain cells' surface materials)
  const perm = new Float32Array(nn);
  for (let c = 0; c < nn; c++) {
    const i0 = (c % navN) * sub, k0 = Math.floor(c / navN) * sub;
    let s = 0, n = 0;
    for (let dk = 0; dk < sub; dk++) for (let di = 0; di < sub; di++) {
      if (i0 + di >= cells || k0 + dk >= cells) continue;
      s += PERM_CODE[w.ground.surface.data[(k0 + dk) * cells + i0 + di]];
      n++;
    }
    perm[c] = n > 0 ? s / n : 1;
  }
  // priority flood
  const h = nav.baseY;
  const fill = new Float32Array(nn).fill(NaN);
  const down = new Int32Array(nn).fill(-1);
  const order: number[] = [];
  const heap = new MinHeap(4096);
  const seed = (c: number) => { fill[c] = h[c]; heap.push(h[c], 0, c); };
  for (let c = 0; c < nn; c++) {
    if (dry[c]) continue;
    const i = c % navN, k = Math.floor(c / navN);
    if (i === 0 || k === 0 || i === navN - 1 || k === navN - 1 || cls[c] === CLS.hole) seed(c);
  }
  const flood = () => {
    while (heap.size > 0) {
      const c = heap.topValue();
      heap.pop();
      order.push(c);
      const i = c % navN, k = Math.floor(c / navN);
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        const x = i + di, z = k + dk;
        if ((!di && !dk) || x < 0 || z < 0 || x >= navN || z >= navN) continue;
        const j = z * navN + x;
        if (dry[j] || !Number.isNaN(fill[j])) continue;
        fill[j] = Math.max(h[j], fill[c]);
        down[j] = c;
        heap.push(fill[j], 0, j);
      }
    }
  };
  flood();
  // enclosed basins (courtyards between walls): each drains to its own lowest cell
  for (;;) {
    let low = -1;
    for (let c = 0; c < nn; c++) if (!dry[c] && Number.isNaN(fill[c]) && (low < 0 || h[c] < h[low])) low = c;
    if (low < 0) break;
    seed(low);
    flood();
  }
  const cellBu2 = (navCell / bu) * (navCell / bu);
  const catchBu2 = new Float32Array(nn);
  for (const c of order) catchBu2[c] = cellBu2 * (perm[c] < WATER.impermeableBelow ? 1 : WATER.soilRunoff);
  for (let q = order.length - 1; q >= 0; q--) { const c = order[q]; if (down[c] >= 0) catchBu2[down[c]] += catchBu2[c]; }
  // hollow index from the 1 m smoothed ground
  const smooth = new Float32Array(h);
  boxBlur(smooth, navN, navN, Math.max(1, Math.round(WATER.hollowRadius / navCell)));
  const hollow = new Float32Array(nn), flood01 = new Float32Array(nn);
  const puddle = new Uint8Array(nn), permB = new Uint8Array(nn);
  const ref = dlog10(1 + WATER.catchRefM2);
  for (let c = 0; c < nn; c++) {
    permB[c] = Math.round(perm[c] * 255);
    if (dry[c]) continue;
    hollow[c] = Math.max(0, Math.min(1, (smooth[c] - h[c]) / WATER.hollowDepth));
    const m2 = (catchBu2[c] * bu * bu) / 1e6;
    flood01[c] = Math.max(0, Math.min(1, 0.5 * hollow[c] + (0.5 * dlog10(1 + m2)) / ref));
    const depth = fill[c] - h[c];
    if (perm[c] < WATER.impermeableBelow && depth >= WATER.puddleMinMm) puddle[c] = Math.min(WATER.puddleCapMaxMm, Math.round(depth));
  }
  for (let c = 0; c < nn; c++) w.maps.floodRisk.data[c] = Math.round(flood01[c] * 255);
  w.maps.puddleCapMm = { cell: navCell, nx: navN, nz: navN, data: puddle };
  w.maps.catchAreaBu2 = catchBu2;
  w.maps.permeable = { cell: navCell, nx: navN, nz: navN, data: permB };
  return { hollow, flood: flood01, permeable: perm };
}
