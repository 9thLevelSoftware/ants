// Habitat group weights at the listener (GDD 08 §13.4: "at zone borders the two groups crossfade over 32 BU"): the
// share of each group inside a square of side AMBIENCE.zoneCrossfadeBu centred on the listener, area-weighted over
// the zone raster. Across a straight border this is a linear ramp over the full 32 BU, continuous in position.
import type { WorldData } from '@/sim/types';
import { zoneAt } from '@/sim/world';
import { GROUP_OF_ZONE, HABITAT_GROUPS, type GroupWeights } from './ambience/matrix';
import { AMBIENCE } from './tuning';

/**
 * Fills `out` with the group shares of the square of side `widthMm` around (x, z). The square is integrated over
 * the zone cells it overlaps; when that would take more than AMBIENCE.zoneBlendMaxSamples per axis, over a coarser
 * world-aligned grid sampled at its cell centres (still continuous in x, z).
 */
export function zoneGroupWeights(world: WorldData, x: number, z: number, widthMm: number, out: GroupWeights): GroupWeights {
  for (const g of HABITAT_GROUPS) out[g] = 0;
  const h = widthMm / 2;
  if (!(h > 0)) {
    out[GROUP_OF_ZONE[zoneAt(world, x, z)] ?? 'open-green'] = 1;
    return out;
  }
  const step = Math.max(world.maps.zone.cell, widthMm / AMBIENCE.zoneBlendMaxSamples);
  const x0 = x - h, x1 = x + h, z0 = z - h, z1 = z + h;
  let sum = 0;
  for (let iz = Math.floor(z0 / step); iz * step < z1; iz++) {
    const oz = Math.min(z1, (iz + 1) * step) - Math.max(z0, iz * step);
    if (oz <= 0) continue;
    for (let ix = Math.floor(x0 / step); ix * step < x1; ix++) {
      const ox = Math.min(x1, (ix + 1) * step) - Math.max(x0, ix * step);
      if (ox <= 0) continue;
      const w = ox * oz;
      out[GROUP_OF_ZONE[zoneAt(world, (ix + 0.5) * step, (iz + 0.5) * step)] ?? 'open-green'] += w;
      sum += w;
    }
  }
  if (sum <= 0) { out['open-green'] = 1; return out; }
  for (const g of HABITAT_GROUPS) out[g] /= sum;
  return out;
}
