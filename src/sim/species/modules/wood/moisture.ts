// Wood moisture and decay over time and weather (GDD 07 §6.2.2). Every WOOD_UPDATE_TICKS each segment relaxes toward
// its equilibrium at MC_RATE per GD; decay advances one class per DECAY_GD_PER_CLASS game days spent damp.

import type { Sim, WoodState } from '@/sim/types';
import {
  MC_MAX_PCT, MC_MIN_PCT, MC_PER_WINDOW_PCT, MC_RAIN_EXPOSED_PCT, MC_RAIN_MEMORY_GD, MC_RAIN_MIN_PRECIP,
  MC_RAIN_SHELTERED_PCT, MC_SUN_DRYING_PCT, MC_WINDOWS_FREE, MC_WINDOWS_MAX_PCT, MC_WINTER_OUTDOOR_PCT,
  SUN_EXPOSURE_OPEN, WOOD_UPDATE_TICKS,
} from '@/sim/balance/species-carpenter';
import { calendarNow } from '@/sim/environment/calendar';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';
import type { WoodParams } from './params';

/** Is the weather wetting wood now? */
export function rainingNow(sim: Sim): boolean {
  return (sim.state.env.weather?.precip ?? 0) >= MC_RAIN_MIN_PRECIP;
}

/** What the season and the hour add to every segment's equilibrium (outdoor, interior), %. */
export interface WeatherTerms { sunDay: boolean; winter: boolean }

export function weatherTerms(sim: Sim): WeatherTerms {
  const season = currentSeason(sim.state);
  const phase = calendarNow(sim).phase;
  const day = phase === 'morning' || phase === 'midday' || phase === 'afternoon';
  return { sunDay: season === 'summer' && day, winter: season === 'winter' };
}

/** Equilibrium moisture of a segment with placement value `base` (GDD 07 §6.2.2 `mcEq`), %. */
export function mcEquilibrium(sim: Sim, w: WoodState, base: number, t: WeatherTerms): number {
  let eq = base;
  const recentRain = w.lastRainTick !== undefined && w.lastRainTick >= 0
    && sim.state.tick - w.lastRainTick <= MC_RAIN_MEMORY_GD * TICKS_PER_DAY;
  if (recentRain) eq += !w.interior && (w.sunExposure ?? 0) >= SUN_EXPOSURE_OPEN ? MC_RAIN_EXPOSED_PCT : MC_RAIN_SHELTERED_PCT;
  if (t.sunDay) eq -= (w.sunExposure ?? 0) * MC_SUN_DRYING_PCT;
  eq -= Math.min(MC_WINDOWS_MAX_PCT, MC_PER_WINDOW_PCT * Math.max(0, (w.windowCount ?? 0) - MC_WINDOWS_FREE));
  if (t.winter && !w.interior) eq += MC_WINTER_OUTDOOR_PCT;
  return Math.max(MC_MIN_PCT, Math.min(MC_MAX_PCT, eq));
}

/** Advances one record by dtGd game days (moisture relaxation, decay). */
export function stepWood(sim: Sim, w: WoodState, p: WoodParams, dtGd: number, t: WeatherTerms, raining: boolean): void {
  if (raining && !w.interior) w.lastRainTick = sim.state.tick;
  const segs = w.segments;
  if (!segs || segs.length === 0) return;
  const k = 1 - Math.exp(-p.mcRate * dtGd);
  for (const s of segs) {
    const eq = mcEquilibrium(sim, w, s.base, t);
    s.mc += (eq - s.mc) * k;
    // damp wood rots: full rate at decayMinMcPct and above, none at or below decayFloorMcPct (ants do not cause decay)
    const f = (s.mc - p.decayFloorMcPct) / Math.max(1e-6, p.decayMinMcPct - p.decayFloorMcPct);
    const rate = Math.max(0, Math.min(1, f));
    if (s.decay < 4 && rate > 0) {
      s.decayGd += dtGd * rate;
      if (s.decayGd >= p.decayGdPerClass) { s.decay++; s.decayGd = 0; }
    }
  }
  w.moisture = segs[0].mc;
  w.decay = segs[0].decay;
}

/** One pass over every wood record (the module system calls it every WOOD_UPDATE_TICKS). */
export function stepAllWood(sim: Sim, list: WoodState[], p: WoodParams): void {
  const dtGd = WOOD_UPDATE_TICKS / TICKS_PER_DAY;
  const t = weatherTerms(sim);
  const raining = rainingNow(sim);
  for (const w of list) stepWood(sim, w, p, dtGd, t, raining);
}

/** Sets a record's moisture and decay on every segment (cheat.setWood, App. B). */
export function setWood(w: WoodState, mc: number, decay: number): void {
  const m = Math.max(MC_MIN_PCT, Math.min(MC_MAX_PCT, mc));
  const d = Math.max(0, Math.min(4, Math.round(decay)));
  for (const s of w.segments ?? []) { s.mc = m; s.base = m; s.decay = d; s.decayGd = 0; }
  w.moisture = m;
  w.decay = d;
}
