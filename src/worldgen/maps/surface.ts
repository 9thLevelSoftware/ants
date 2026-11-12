// Static per-cell maps for chapter 06 and the renderer (GDD 04 §2.4, §12.4): base soil moisture theta0, litter
// cover, shelter from rain, exposure (sky view x (1 - cover)) and the travel access map of the played species.

import type { GenContext } from '../kit/context';
import { LITTER, LITTER_FRINGE_MM, MULCH, THETA, ZONE_THETA0 } from '../tuning/maps';
import { REGION_MOISTURE } from '../tuning/terrain';
import { nearestSites } from '../terrain/distance';
import type { NavDerived } from './nav';
import { markDisc, walkable } from './nav';
import type { ShadeResult } from './shade';
import type { WaterResult } from './water';

export interface SurfaceResult {
  theta0: Float32Array;
  litter: Float32Array;
  exposure: Float32Array;
}

/** Sward cover per lawn variant (GDD 04 §2.1). */
const SWARD_COVER: Record<string, number> = { mown: 0.4, rough: 0.6 };

export function buildSurfaceMaps(ctx: GenContext, nav: NavDerived, shade: ShadeResult, water: WaterResult): SurfaceResult {
  const { navN, navCell } = ctx.dims;
  const nn = navN * navN;
  const w = ctx.world, lay = ctx.layout;
  // litter: forest cells, a linear fringe into the neighbouring zones, mulched beds
  const forest = new Uint8Array(nn);
  for (let c = 0; c < nn; c++) forest[c] = lay.zones[lay.nav[c]].type === 'forest' ? 1 : 0;
  const dist = new Float32Array(nn);
  nearestSites(forest, navN, navN, dist);
  const litter = new Float32Array(nn);
  for (let c = 0; c < nn; c++) {
    const z = lay.zones[lay.nav[c]];
    let l = LITTER[z.type] ?? 0;
    if (!z.built && l === 0) l = Math.max(0, 1 - (dist[c] * navCell) / LITTER_FRINGE_MM);
    if (z.type === 'garden-bed' && z.mulched) l = Math.max(l, MULCH.cover);
    litter[c] = l;
  }
  // theta0 with hollow, shade, wet patches and the region offset
  const theta0 = new Float32Array(nn);
  const regionOff = REGION_MOISTURE[ctx.params.region];
  for (let c = 0; c < nn; c++) {
    const z = lay.zones[lay.nav[c]];
    theta0[c] = ZONE_THETA0[z.type] + THETA.hollowK * water.hollow[c] + THETA.shadeK * shade.mean[c] + regionOff;
  }
  for (const wb of w.waterBodies) {
    const add = wb.kind === 'wet-patch' ? 0.3 : wb.kind === 'gully-water' ? 0.2 : 0;
    const r = wb.kind === 'wet-patch' ? 500 : 300;
    if (add > 0) markDisc(ctx, wb.pos.x, wb.pos.z, r, (c) => { theta0[c] += add; });
  }
  const moist = w.maps.moisture.data;
  for (let c = 0; c < nn; c++) {
    theta0[c] = Math.max(THETA.min, Math.min(THETA.max, theta0[c]));
    moist[c] = Math.round(theta0[c] * 255);
  }
  // shelter, exposure, access
  const exposure = new Float32Array(nn);
  const access = new Uint8Array(nn);
  for (let c = 0; c < nn; c++) {
    const z = lay.zones[lay.nav[c]];
    const shelter = Math.min(1, nav.shelterShare[c] + 0.5 * shade.canopy[c]);
    const cover = z.type === 'lawn' ? SWARD_COVER[z.variant] ?? 0.4 : litter[c] * 0.5;
    const sky = z.type === 'interior' ? 0 : (1 - shelter) * (1 - 0.5 * shade.mean[c]);
    exposure[c] = sky * (1 - cover);
    w.maps.shelter.data[c] = Math.round((z.type === 'interior' ? 1 : shelter) * 255);
    w.maps.exposure.data[c] = Math.round(exposure[c] * 255);
    access[c] = walkable(w.nav.cls.data[c]) ? w.nav.cost.data[c] : 255;
  }
  w.maps.litter = { cell: navCell, nx: navN, nz: navN, data: Uint8Array.from(litter, (v) => Math.round(v * 255)) };
  w.maps.access = { [ctx.params.speciesId]: { cell: navCell, nx: navN, nz: navN, data: access } };
  return { theta0, litter, exposure };
}
