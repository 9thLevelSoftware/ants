// Hourly life of a herd (GDD 05 §1.4): stem mothers on day 1, logistic growth by phase, tending and host
// condition, parasitoids, dispersal, downpours, the winter eggs, and collapse. Predation is real time (herdDamage).
//
// Decisions (reported): in the decline phases (r < 0) the change is r x A x dt (a logistic term would turn the
// decline into growth above K_eff); a frozen herd (cheat) keeps its A and tend but still produces honeydew and is
// still eaten (GDD 05 App. E 1 and 4).

import { rngChance, rngFloat } from '@/core/rng';
import type { Herd, PlantState, Sim } from '@/sim/types';
import {
  DISPERSAL_BATCH, DISPERSAL_RADIUS_BU, DISPERSAL_RATE, DISPERSAL_TRIGGER, DOWNPOUR_A_MULT, EGG_FRACTION, EGG_MAX,
  HERD_EXTINCT_A, HERD_HATCH_HOUR, HOST_DECLINE_FROM_DOY, HOST_DECLINE_PER_GD, HOST_QUALITY_FLOOR, MIGRANT_APHIDS,
  MIGRANT_DAYS, MIGRANT_P_PER_GD, PARASITOID_DAYS, PARASITOID_RATE, PARASITOID_TEND_CUT, STEM_MOTHERS_MAX,
  TEND_GROWTH_BONUS,
} from '@/sim/balance/ecology';
import { ecologyRng } from '../sources/util';
import { kEff } from './herdMath';
import { dropHerd, foundHerd, freeSite, freeSitesNear, isAphidHost, plantPos } from './hosts';
import { growthRate, inDays, isDormantSeason } from './season';

/** What one hourly step needs to know (computed once per step). */
export interface HourContext {
  /** Default-year day (0-based fractional) and clock hour. */
  d28: number;
  hour: number;
  /** Step length, gd. */
  dt: number;
  /** Temperature factor of the air. */
  fT: number;
  /** A downpour or storm hour. */
  heavyRain: boolean;
}

/** Host quality of a plant: 1.0 on day 1, -0.08 per gd from day 10 to the floor (GDD 05 HOST_DECLINE). */
export function stepHostQuality(plant: PlantState, c: HourContext): void {
  if (c.d28 < 1) plant.hostQuality = 1;
  else if (!isDormantSeason(c.d28) && c.d28 >= HOST_DECLINE_FROM_DOY - 1) {
    plant.hostQuality = Math.max(HOST_QUALITY_FLOOR, plant.hostQuality - HOST_DECLINE_PER_GD * c.dt);
  }
}

/** The end of day 21: eggs from the season's peak, aphids gone (event herd-dormant); no eggs = the herd is gone. */
function goDormant(sim: Sim, h: Herd): void {
  const peak = Math.max(h.peakA ?? 0, h.a);
  h.e = Math.min(EGG_MAX, Math.round(EGG_FRACTION * peak));
  h.a = 0;
  h.pool = 0;
  h.peakA = 0;
  if (h.e <= 0) { dropHerd(sim, h, 'no-eggs'); return; }
  sim.emit({ type: 'herd-dormant', herdId: h.id, a: 0 });
}

/** Day 1, 06:00: stem mothers hatch from the eggs (event herd-hatched). */
function hatch(sim: Sim, h: Herd): void {
  h.a = Math.min(h.e, STEM_MOTHERS_MAX);
  h.e = 0;
  h.peakA = h.a;
  sim.emit({ type: 'herd-hatched', herdId: h.id, a: h.a });
}

/** Aphids leaving a crowded herd settle in batches on free hosts within 400 BU; the rest are lost. */
function disperse(sim: Sim, h: Herd, leaving: number): void {
  const rng = ecologyRng(sim.state);
  const batches = leaving / DISPERSAL_BATCH;
  let n = Math.floor(batches) + (rngFloat(rng) < batches - Math.floor(batches) ? 1 : 0);
  if (n <= 0) return;
  const plant = sim.stores.plants.get(h.hostId);
  const p = plant ? plantPos(sim, plant) : null;
  if (!p) return;
  for (const site of freeSitesNear(sim, p, DISPERSAL_RADIUS_BU * sim.world.bu, h.hostId)) {
    if (n <= 0) break;
    foundHerd(sim, site.plant, site.segment, DISPERSAL_BATCH);
    n--;
  }
}

/** One hour of one herd. */
export function stepHerd(sim: Sim, h: Herd, plant: PlantState | undefined, c: HourContext): void {
  if (!h.alive) return;
  if (plant) h.hostQuality = plant.hostQuality;
  if (h.frozen) return;
  if (isDormantSeason(c.d28)) {
    if (h.a > 0 || (h.peakA ?? 0) > 0) goDormant(sim, h);
    return;
  }
  if (h.a <= 0) {
    if (h.e > 0 && c.d28 < 1 && c.hour < HERD_HATCH_HOUR) return; // eggs waiting for 06:00 on day 1
    if (h.e > 0 && c.d28 < 1) { hatch(sim, h); return; }
    dropHerd(sim, h, h.e > 0 ? 'late-hatch' : 'crash');
    return;
  }
  const a = h.a, k = Math.max(1e-6, kEff(h, sim.state.tick)), r = growthRate(c.d28);
  let dA = r >= 0 ? r * (1 + TEND_GROWTH_BONUS * h.tend) * c.fT * a * (1 - a / k) * c.dt : r * a * c.dt;
  if (inDays(c.d28, PARASITOID_DAYS)) dA -= PARASITOID_RATE * (1 - PARASITOID_TEND_CUT * h.tend) * a * c.dt;
  if (a >= DISPERSAL_TRIGGER * k) {
    const leaving = DISPERSAL_RATE * a * c.dt;
    dA -= leaving;
    disperse(sim, h, leaving);
  }
  h.a = Math.max(0, a + dA);
  if (c.heavyRain) h.a *= DOWNPOUR_A_MULT;
  h.peakA = Math.max(h.peakA ?? 0, h.a);
  if (h.a < HERD_EXTINCT_A) dropHerd(sim, h, 'crash');
}

/** Winged migrants (days 3-12) found herds of 5 on free host sites: p 0.12 per gd per site. */
export function stepMigrants(sim: Sim, c: HourContext): void {
  if (!inDays(c.d28, MIGRANT_DAYS)) return;
  const rng = ecologyRng(sim.state);
  const p = MIGRANT_P_PER_GD * c.dt;
  const list = sim.stores.plants.list;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const pl = list[i];
    if (!isAphidHost(pl)) continue;
    const seg = freeSite(sim, pl);
    if (seg >= 0 && rngChance(rng, p)) foundHerd(sim, pl, seg, MIGRANT_APHIDS);
  }
}
