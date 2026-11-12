// Hourly life of one source: renewal, decay, schedules (windfall, crust, wet food), carrion stages, expiry.
// Everything is driven by the record's own fields (refillPerGd, decayPerGd, stage, spawnedTick ...), so a T1 static
// honeydew site and a T2 herd film follow the same code with different data.

import type { FoodSource, Sim } from '@/sim/types';
import { calendarNow, surfaceTemp } from '@/sim/environment';
import { zoneAt } from '@/sim/world';
import { TICKS_PER_DAY } from '@/sim/time';
import {
  CRUST_DRY_GD, CRUST_DRY_HARDNESS, ECOLOGY_TIER, EFN_LATE_FROM_DOY, EFN_LATE_REFILL_MULT, LIQUID_EMPTY_EPS,
  PET_BOWL_REFILL_HOURS, SPILL_HALF_LIFE_GD, SPILL_RESIDUE_FRACTION, SPILL_SUN_C, WET_FOOD_DRY_GD,
  WET_FOOD_DRY_HARDNESS, WINDFALL_STAGES, WINDFALL_WASP_DRAIN_PER_H,
} from '@/sim/balance/ecology';
import { defOf, isEmpty, setAmount, sourceDef } from './def';
import { advanceCarrion } from './carrion';
import { retireSource, markExhaustedForKnowers } from './remove';
import { isInSeason, d28Of } from './season';
import { halfLifeToDecay } from './spawn';

const HOURS_PER_DAY = 24;

/** Age of a source, game days. */
export function ageGd(sim: Sim, s: FoodSource): number {
  return (sim.state.tick - s.spawnedTick) / TICKS_PER_DAY;
}

/** Updates one source over dtGd game days (normally one hour). May remove it. */
export function updateSource(sim: Sim, s: FoodSource, dtGd: number): void {
  if (!s.alive) return;
  const d = defOf(s);
  if (!d) return;
  const age = ageGd(sim, s);
  if (s.stage !== null && d.carrion) {
    if (advanceCarrion(sim, s, dtGd)) return; // removed as a husk
  } else {
    const lifetime = sourceDef(d.variant, ECOLOGY_TIER).lifetimeGd;
    if (lifetime > 0 && age >= lifetime) {
      retireSource(sim, s, d.variant === 'elaiosome-seed' ? 'germinated' : 'expired');
      return;
    }
  }
  applySchedules(s, age);
  if (isInSeason(sim, s)) renew(sim, s, dtGd);
  decay(sim, s, dtGd);
  if (s.alive && isEmpty(s) && !d.renewable) retireSource(sim, s, 'depleted');
}

function renew(sim: Sim, s: FoodSource, dtGd: number): void {
  if (s.refillPerGd > 0 && s.units < s.capacity) {
    const cal = calendarNow(sim);
    let rate = s.refillPerGd;
    if (defOf(s)?.refillDaylightOnly) rate = cal.daylight > 0 && cal.dayLength > 0 ? rate * (HOURS_PER_DAY / cal.dayLength) : 0;
    if (s.variant === 'extrafloral-nectary' && d28Of(cal.yearFrac) >= EFN_LATE_FROM_DOY - 1) rate *= EFN_LATE_REFILL_MULT;
    setAmount(s, Math.min(s.capacity, s.units + rate * dtGd));
  }
  if (s.variant === 'kibble' && isBowlRefillHour(sim)) setAmount(s, s.capacity);
  if (!isEmpty(s)) s.exhaustedBy = 0;
}

function isBowlRefillHour(sim: Sim): boolean {
  const h = Math.floor(calendarNow(sim).hour);
  return PET_BOWL_REFILL_HOURS.includes(h);
}

function decay(sim: Sim, s: FoodSource, dtGd: number): void {
  if (s.variant === 'sugary-spill') s.decayPerGd = halfLifeToDecay(spillHalfLife(sim, s));
  if (s.variant === 'windfall' && calendarNow(sim).daylight > 0) {
    setAmount(s, s.units * (1 - WINDFALL_WASP_DRAIN_PER_H * dtGd * HOURS_PER_DAY));
  }
  if (s.decayPerGd > 0 && s.units > 0) {
    const before = s.units;
    setAmount(s, s.units * Math.pow(1 - s.decayPerGd, dtGd));
    if (s.units <= LIQUID_EMPTY_EPS) setAmount(s, 0);
    if (before > 0 && isEmpty(s)) markExhaustedForKnowers(sim, s);
  }
  if (s.variant === 'sugary-spill' && s.units < SPILL_RESIDUE_FRACTION * s.capacity) toResidue(sim, s);
}

/** GDD 05 §1.2: 0.15 gd in sun (surface >= 30 °C), 0.4 gd in shade, 1 gd indoors. */
function spillHalfLife(sim: Sim, s: FoodSource): number {
  if (zoneAt(sim.world, s.pos.x, s.pos.z) === 'interior') return SPILL_HALF_LIFE_GD.indoors;
  return surfaceTemp(sim, s.pos) >= SPILL_SUN_C ? SPILL_HALF_LIFE_GD.sun : SPILL_HALF_LIFE_GD.shade;
}

/** A spill below 30 % of its start turns into sticky residue for 2 gd (GDD 05 §1.2). */
function toResidue(sim: Sim, s: FoodSource): void {
  const r = sourceDef('sticky-residue');
  s.variant = 'sticky-residue';
  s.drinkRateMult = r.drinkRateMult;
  s.decayPerGd = 0;
  s.spawnedTick = sim.state.tick; // its lifetime counts from now
}

/** Age-driven changes of a few variants (GDD 05 §1.2). */
function applySchedules(s: FoodSource, age: number): void {
  if (s.variant === 'windfall') {
    const st = WINDFALL_STAGES.find((x) => age < x.untilGd) ?? WINDFALL_STAGES[WINDFALL_STAGES.length - 1];
    s.slots = st.slots;
    s.quality = st.quality;
  } else if (s.variant === 'crust' && age >= CRUST_DRY_GD) {
    s.hardness = CRUST_DRY_HARDNESS;
  } else if (s.variant === 'wet-pet-food' && age >= WET_FOOD_DRY_GD) {
    s.hardness = WET_FOOD_DRY_HARDNESS;
  }
}

/** Wet pet food that has dried is torn, not drunk (GDD 05 §1.2). */
export function isDriedWetFood(sim: Sim, s: FoodSource): boolean {
  return s.variant === 'wet-pet-food' && ageGd(sim, s) >= WET_FOOD_DRY_GD;
}
