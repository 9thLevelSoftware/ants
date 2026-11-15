// Nectar on plants (GDD 05 §1.2 rows `flower` and `extrafloral-nectary`). The sources module renews them (daylight
// refill of flowers, the day-10 drop of nectaries) from the record's refillPerGd; this module adds the plant side:
//  - the flowers' season rhythm: full refill in their peak (days 5-14), x FLOWER_OFFPEAK_REFILL_MULT while open
//    outside it (estimate: GDD 05 names the peak without a number);
//  - the Tier 2 flying-insect drain, 15 % per hour while the air is >= 15 °C and dry (so dawn visits pay best);
//  - the link to the PlantState (source.plantId, PlantState.nectarPool = loads on the plant's nectar sources).

import type { FoodSource, Sim } from '@/sim/types';
import {
  ECOLOGY_TIER, FLOWER_DRAIN_MIN_C, FLOWER_DRAIN_PER_H, FLOWER_OFFPEAK_REFILL_MULT, FLOWER_PEAK_DAYS,
} from '@/sim/balance/ecology';
import { setAmount, sourceDef } from '../sources/def';
import { plantOfObject } from './hosts';
import { inDays } from './season';

const HOURS_PER_DAY = 24;

function isNectar(s: FoodSource): boolean {
  return s.alive && (s.variant === 'flower' || s.variant === 'extrafloral-nectary');
}

export interface NectarContext {
  d28: number;
  /** Step length, gd. */
  dt: number;
  airC: number;
  raining: boolean;
  /** foodAbundanceMult. */
  mult: number;
  /** Rules tier (ECOLOGY_TIER unless a test asks). */
  tier: number;
}

/** One hourly nectar step over every flower and nectary. */
export function stepNectar(sim: Sim, c: NectarContext): void {
  for (const pl of sim.stores.plants.list) if (pl.alive) pl.nectarPool = -1;
  for (const s of sim.stores.sources.list) {
    if (!isNectar(s)) continue;
    if (s.plantId < 0 && s.objectId >= 0) s.plantId = plantOfObject(sim, s.objectId)?.id ?? -1;
    if (s.variant === 'flower' && c.tier >= 2) flowerRhythm(s, c);
    const pl = s.plantId >= 0 ? sim.stores.plants.get(s.plantId) : undefined;
    if (pl) pl.nectarPool = Math.max(0, pl.nectarPool) + s.units;
  }
}

function flowerRhythm(s: FoodSource, c: NectarContext): void {
  const base = sourceDef('flower', c.tier).refillPerGd * c.mult;
  s.refillPerGd = inDays(c.d28, FLOWER_PEAK_DAYS) ? base : base * FLOWER_OFFPEAK_REFILL_MULT;
  if (c.airC >= FLOWER_DRAIN_MIN_C && !c.raining && s.units > 0) {
    setAmount(s, s.units * Math.pow(1 - FLOWER_DRAIN_PER_H, c.dt * HOURS_PER_DAY));
  }
}

export function nectarTier(): number {
  return ECOLOGY_TIER;
}
