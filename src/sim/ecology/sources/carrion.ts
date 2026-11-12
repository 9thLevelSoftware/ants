// Carrion decay stages (GDD 05 §1.6, Tier 2; T1 carrion has stage null and never gets here).
// The stage clock runs at 2^((T - 20) / 10) gd per gd, frozen at or below 2 °C; stage follows the clock.

import type { CarrionStage, FoodSource, Sim } from '@/sim/types';
import { surfaceTemp } from '@/sim/environment';
import {
  CARRION_CLOCK_PER_C, CARRION_CLOCK_REF_C, CARRION_FREEZE_C, CARRION_PUTRID_MIN_P, CARRION_PUTRID_P_LOSS_PER_GD,
  CARRION_REMOVE_GD, CARRION_STAGE_DEFS,
} from '@/sim/balance/ecology';
import { defOf } from './def';
import { retireSource } from './remove';

/** Stage-clock speed at temperature T (°C): game days of decay per game day. */
export function stageClockRate(tempC: number): number {
  if (tempC <= CARRION_FREEZE_C) return 0;
  return Math.pow(2, (tempC - CARRION_CLOCK_REF_C) / CARRION_CLOCK_PER_C);
}

/** Stage reached at a stage clock (gd). */
export function stageAt(clockGd: number): CarrionStage {
  let st: CarrionStage = 'fresh';
  for (const d of CARRION_STAGE_DEFS) if (clockGd >= d.fromGd) st = d.stage;
  return st;
}

function stageQuality(st: CarrionStage): number {
  return CARRION_STAGE_DEFS.find((d) => d.stage === st)?.quality ?? 0;
}

/** P per unit the carcass started with (catalogue P per bulk x this unit's bulk). */
function startP(s: FoodSource): number {
  const d = defOf(s);
  return d && d.unitBulk > 0 ? (d.p / d.unitBulk) * s.unitBulk : s.p;
}

/**
 * Advances the stage clock by dtGd at the temperature at the carcass (or the given one); returns true if the husk
 * was removed.
 */
export function advanceCarrion(sim: Sim, s: FoodSource, dtGd: number, tempC: number = surfaceTemp(sim, s.pos)): boolean {
  const before = s.stage;
  const dClock = dtGd * stageClockRate(tempC);
  s.stageClock += dClock;
  let st = stageAt(s.stageClock);
  if (st === 'putrid') {
    s.p *= Math.pow(1 - CARRION_PUTRID_P_LOSS_PER_GD, dClock); // per stage-clock gd, like the stage table
    if (s.p < CARRION_PUTRID_MIN_P * startP(s)) st = 'husk';
  }
  if (st === 'husk' || before === 'husk') {
    st = 'husk';
    s.c = 0;
    s.p = 0;
  }
  s.stage = st;
  s.quality = stageQuality(st);
  if (st !== before) sim.emit({ type: 'carrion-stage-changed', sourceId: s.id, itemId: -1, stage: st });
  if (s.stageClock >= CARRION_REMOVE_GD) return retireSource(sim, s, 'decayed');
  return false;
}
