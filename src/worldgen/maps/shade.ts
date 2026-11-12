// Shade samples (GDD 04 §12.3): for the sun at 06, 08 ... 18 h, a ray from each nav cell's ground toward the sun
// over the highest-solid map (half-cell steps) plus tree canopy discs (transmittance 0.3). 0 = full sun,
// 255 = full shade; interior cells are full shade. maps.shade is the 08:00-18:00 mean.

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

export function buildShade(ctx: GenContext, col: Columns): ShadeResult {
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
  for (let c = 0; c < nn; c++) {
    if (interior[ctx.layout.nav[c]]) {
      for (const m of maps) m.data[c] = SHADE.interior;
      mean[c] = 1;
      continue;
    }
    const x0 = ((c % navN) + 0.5) * navCell, z0 = (Math.floor(c / navN) + 0.5) * navCell;
    const y0 = (Number.isFinite(groundY[c]) ? groundY[c] : 0) + lift;
    let canopyMin = 1;
    for (let h = 0; h < SUN_HOURS.length; h++) {
      const [dx, dy, dz] = SUN_DIRS[h];
      const horiz = Math.sqrt(dx * dx + dz * dz);
      let light = 1;
      if (horiz > 1e-9) {
        const ux = dx / horiz, uz = dz / horiz, rise = dy / horiz;
        for (let t = step; ; t += step) {
          const y = y0 + t * rise;
          if (y > globalTop) break;
          const x = x0 + ux * t, z = z0 + uz * t;
          const i = Math.floor(x / navCell), k = Math.floor(z / navCell);
          if (i < 0 || k < 0 || i >= navN || k >= navN) break;
          if (top[k * navN + i] > y + lift) { light = 0; break; }
        }
      }
      if (light > 0) {
        for (const d of ctx.canopies) {
          if (d.y <= y0) continue;
          const t = (d.y - y0) / dy;
          const px = x0 + dx * t - d.x, pz = z0 + dz * t - d.z;
          if (px * px + pz * pz <= d.r * d.r) light *= d.transmittance;
        }
      }
      const sh = 1 - light;
      maps[h].data[c] = Math.round(sh * 255);
      if (h >= SHADE_MEAN_FROM_INDEX) mean[c] += sh / meanCount;
    }
    for (const d of ctx.canopies) {
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
