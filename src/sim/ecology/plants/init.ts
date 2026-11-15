// New Game: plant states for every host plant, and (Tier 2) herds on the worldgen herd sites (`aphid-herd` food
// anchors), each started as if the season so far had run: eggs before day 1 06:00, else stem mothers pre-grown to
// the start date, untended, at a nominal temperature factor (no past weather exists). A share of the sites starts
// empty (HERD_INITIAL_OCCUPANCY): free hosts for migrants and dispersal.

import { rngChance } from '@/core/rng';
import { v3DistanceSq } from '@/core/math/vec3';
import type { PlantState, WorldData } from '@/sim/types';
import type { EntityCtx } from '@/sim/entities';
import {
  ECOLOGY_TIER, HERD_HATCH_HOUR, HERD_INITIAL_OCCUPANCY, HERD_K, HERD_PREGROW_FT, HOST_DECLINE_FROM_DOY,
  HOST_DECLINE_PER_GD, HOST_QUALITY_FLOOR, PARASITOID_DAYS, PARASITOID_RATE, STEM_MOTHERS_MAX,
} from '@/sim/balance/ecology';
import { DEFAULT_DAYS_PER_YEAR, currentDefaultYearDay, daysPerYear, HOURS_PER_DAY } from '@/sim/time';
import { ecologyRng } from '../sources/util';
import { foundHerd, initPlantStates } from './hosts';
import { aphidSitesOf } from './links';
import { growthRate, inDays, isDormantSeason } from './season';

export interface PregrownHerd {
  a: number;
  e: number;
  hostQuality: number;
}

/**
 * Herd state at default-year day d28 for a herd that hatched on day 1 at 06:00 (untended, fT = HERD_PREGROW_FT):
 * hourly steps of the §1.4 model. `hoursPerD28` = clock hours per default-year day at this season length.
 */
export function pregrownHerd(k: number, d28: number, hoursPerD28: number): PregrownHerd {
  if (isDormantSeason(d28)) return { a: 0, e: STEM_MOTHERS_MAX, hostQuality: HOST_QUALITY_FLOOR };
  const hatchD = HERD_HATCH_HOUR / hoursPerD28;
  if (d28 < hatchD) return { a: 0, e: STEM_MOTHERS_MAX, hostQuality: 1 };
  const step = 1 / hoursPerD28; // one clock hour in d28 units
  const dtGd = 1 / HOURS_PER_DAY;
  let a = STEM_MOTHERS_MAX, q = 1;
  for (let d = hatchD; d < d28; d += step) {
    if (d >= HOST_DECLINE_FROM_DOY - 1) q = Math.max(HOST_QUALITY_FLOOR, q - HOST_DECLINE_PER_GD * dtGd);
    const r = growthRate(d), kk = k * q;
    let dA = r >= 0 ? r * HERD_PREGROW_FT * a * (1 - a / kk) * dtGd : r * a * dtGd;
    if (inDays(d, PARASITOID_DAYS)) dA -= PARASITOID_RATE * a * dtGd;
    a = Math.max(0, a + dA);
  }
  return { a, e: 0, hostQuality: q };
}

/** Plant states (any tier) and the starting herds (Tier >= 2). Returns the herds created. */
export function initPlants(ctx: EntityCtx, world: WorldData, tier: number = ECOLOGY_TIER): number {
  initPlantStates(ctx, world);
  if (tier < 2) return 0;
  const byObject = new Map<number, PlantState>();
  for (const p of ctx.stores.plants.list) byObject.set(p.objectId, p);
  const rng = ecologyRng(ctx.state);
  const d28 = currentDefaultYearDay(ctx.state);
  const hoursPerD28 = (HOURS_PER_DAY * daysPerYear(ctx.state.config)) / DEFAULT_DAYS_PER_YEAR;
  let n = 0;
  for (const anc of world.placements.foodAnchors) {
    if (anc.kind !== 'honeydew' || !anc.initialState.split(/[\s,;:]+/).includes('aphid-herd')) continue;
    const plant = byObject.get(anc.hostObjectId);
    if (!plant || !rngChance(rng, HERD_INITIAL_OCCUPANCY)) continue;
    const sites = aphidSitesOf(world, plant.objectId);
    let seg = 0, best = Infinity;
    sites.forEach((p, i) => { const d = v3DistanceSq(p.pos, anc.pos); if (d < best) { best = d; seg = i; } });
    if (plant.herdIds.some((id) => ctx.stores.herds.get(id)?.segment === seg)) continue;
    const g = pregrownHerd(HERD_K[plant.hostClass], d28, hoursPerD28);
    plant.hostQuality = g.hostQuality;
    foundHerd(ctx, plant, seg, g.a, 'aphid', { e: g.e, hostQuality: g.hostQuality, peakA: g.a });
    n++;
  }
  return n;
}
