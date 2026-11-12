// Step 2 (ground layers) — strata per zone column (GDD 04 §2.3) on the 4 BU terrain cells: surface material,
// crust (surface layer) thickness and subsoil, with layer boundaries jittered +-20 % by 2D noise (1 m), and the
// region override of the soft zones. Hard crusts: asphalt and the stand-in paving slab (concrete); none on lawn.

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import { fbm2 as fbm2Imp } from '@/core/math/noise';
import { materialCode } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { REGION_STRATA, SOFT_ZONES, STRATA, STRATA_JITTER } from '../tuning/terrain';

const fbm2 = fbm2Imp; // hot import re-bound locally (see heightfield.ts)

export function buildStrata(ctx: GenContext, rng: RngState): void {
  const { cells, cell } = ctx.dims;
  const g = ctx.world.ground;
  const lay = ctx.layout;
  const region = REGION_STRATA[ctx.params.region];
  // one crust thickness per zone within its range, then jittered per cell
  const zoneCrust = lay.zones.map((z) => {
    const r = STRATA[z.type].crust;
    return r[0] + rngFloat(rng) * (r[1] - r[0]);
  });
  const codes = lay.zones.map((z) => {
    const st = STRATA[z.type];
    const soft = region && SOFT_ZONES.includes(z.type);
    return {
      surface: materialCode(soft ? region.surface : st.surface),
      subsoil: materialCode(soft ? region.subsoil : st.subsoil),
      fixed: soft ? region.crust : -1,
      // built crusts (asphalt, slab, rubber mat) are manufactured: no natural jitter
      jitter: z.built === null || z.type === 'sand',
    };
  });
  const inv = 1 / STRATA_JITTER.wavelength;
  const seed = (ctx.seed ^ 0x57a7) | 0;
  for (let k = 0; k < cells; k++) for (let i = 0; i < cells; i++) {
    const j = k * cells + i;
    const zid = lay.cells[j];
    const c = codes[zid];
    let crust = c.fixed >= 0 ? c.fixed : zoneCrust[zid];
    if (c.jitter) crust *= 1 + STRATA_JITTER.amp * fbm2((i + 0.5) * cell * inv, (k + 0.5) * cell * inv, seed, 2);
    g.surface.data[j] = c.surface;
    g.subsoil.data[j] = c.subsoil;
    g.crustMm.data[j] = Math.max(0, Math.min(255, Math.round(crust)));
  }
}
