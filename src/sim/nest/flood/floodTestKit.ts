// Test support for the flood module (imported by *.test.ts only): a crater rim around an entrance, and a neutral
// world-hydrology site.

import type { Entrance, Nest, Sim } from '@/sim/types';
import { FLOOD_HYDRO_NEUTRAL_RISK } from '@/sim/balance/weather';
import { createMound } from '../mounds';

/** Gives an entrance a mound whose crater ring (r_ent + 0.5 .. r_ent + 2 BU) stands `rimBu` high. */
export function addRim(sim: Sim, nest: Nest, e: Entrance, rimBu: number): void {
  const m = createMound(sim, nest, e, e.pos.x, e.pos.z, 'loam');
  const bu = sim.world.bu;
  for (let idx = 0; idx < m.h.length; idx++) {
    const ix = idx % m.n, iz = (idx - ix) / m.n;
    const x = m.centerX + (ix - (m.n - 1) / 2) * m.cell, z = m.centerZ + (iz - (m.n - 1) / 2) * m.cell;
    const d = Math.hypot(x - e.pos.x, z - e.pos.z);
    if (d >= e.radius + 0.5 * bu && d <= e.radius + 2 * bu) m.h[idx] = rimBu * bu;
  }
  e.moundId = m.id;
}

/**
 * Sets the whole static flood-risk map to the neutral risk, where the world hydrology factor is 1: a flat test
 * entrance then has GDD 03's flat-ground catchment c = 1 (App. E 22). The test world's own map is 0 (flood-safe).
 */
export function neutralSite(sim: Sim): void {
  sim.world.maps.floodRisk.data.fill(Math.round(FLOOD_HYDRO_NEUTRAL_RISK * 255));
}
