// Air temperature (GDD 06 §2.1-2.2) and the small derived quantities built on it: weather offset targets, interior
// temperature, relative humidity. Allocation-free; every function reads only the state and the calendar cache.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, WeatherState } from '@/sim/types';
import {
  AIR_PEAK_HOUR, COLD_SNAP_DAY_OFFSET_C, difficultyValue, DIURNAL_MULT, effectiveRule, SEVERITY_MULT, HEAT_RAMP_H, INTERIOR_AIR_W, INTERIOR_RH, INTERIOR_SET_C,
  UNHEATED_ADD_C, UNHEATED_AIR_W, WEATHER_DEFS, WEATHER_OFFSET_C,
} from '@/sim/balance';
import { TICKS_PER_HOUR } from '@/sim/time';
import { calendarNow } from './calendar';
import { climateDef, seasonalMean, type ClimateDef } from './climates';

/** Daily temperature shape in -1..1: trough at sunrise, peak at 14:30 (GDD 06 §2.2). */
export function diurnalShape(hour: number, sunrise: number): number {
  if (hour >= sunrise && hour <= AIR_PEAK_HOUR) return -Math.cos((Math.PI * (hour - sunrise)) / (AIR_PEAK_HOUR - sunrise));
  const h = hour < sunrise ? hour + 24 : hour;
  return Math.cos((Math.PI * (h - AIR_PEAK_HOUR)) / (sunrise + 24 - AIR_PEAK_HOUR));
}

/** Climate of this game. */
export function climateOf(sim: Sim): ClimateDef {
  return climateDef(sim.state.env.climateId);
}

/** Severity multiplier of the weatherSeverity rule in force (`none` = 0, mild 0.6, normal 1, severe 1.4). */
export function severityMult(sim: Sim): number {
  return SEVERITY_MULT[effectiveRule(sim.state.config, 'weatherSeverity')] ?? 1;
}

/** Heat wave air offset, C: climate offset * difficulty * severity (GDD 06 §2.2 `Woff`). */
export function heatOffsetC(sim: Sim): number {
  const c = climateOf(sim);
  return c.heatOffsetC * difficultyValue(sim, 'heatOffsetMult'); // difficulty x severity (none leaves the offset)
}

/** Seasonal mean air temperature at the current time, C. */
export function seasonalMeanNow(sim: Sim): number {
  return seasonalMean(climateOf(sim), calendarNow(sim).yearFrac);
}

/** Diurnal amplitude of the current season, C. */
export function diurnalAmplitude(sim: Sim): number {
  return climateOf(sim).ad[calendarNow(sim).season];
}

/** Target diurnal multiplier `dm` of a weather state. */
export function dmTarget(state: WeatherState): number {
  return DIURNAL_MULT[state];
}

/**
 * Target of the weather temperature offset `Woff` now (GDD 06 §2.2): per state; heat ramps in over 8 h; frost is
 * -5 C and -2.5 C by day while a cold snap persists. `settled` skips the heat ramp.
 */
export function woffTarget(sim: Sim, settled = false): number {
  const w = sim.state.env.weather;
  if (w.state === 'heat') {
    const ramp = settled ? 1 : Math.min(1, (sim.state.tick - w.startTick) / (HEAT_RAMP_H * TICKS_PER_HOUR));
    return heatOffsetC(sim) * ramp;
  }
  if (w.state === 'frost' && w.history.coldSnapExt > 0) {
    const cal = calendarNow(sim);
    if (cal.hour >= cal.sunrise && cal.hour < cal.sunset) return COLD_SNAP_DAY_OFFSET_C;
  }
  return WEATHER_OFFSET_C[w.state];
}

/** Daily anomaly at the current hour: today's AR(1) draw eased in from yesterday's over the day. */
export function anomalyNow(sim: Sim): number {
  const w = sim.state.env.weather;
  const t = calendarNow(sim).hour / 24;
  return w.anomalyPrev + (w.anomalyCur - w.anomalyPrev) * t;
}

/** Air temperature, C (GDD 06 §2.2). The position is accepted for API symmetry; one sky covers the map. */
export function airTemp(sim: Sim, _p?: Vec3): number {
  const cal = calendarNow(sim);
  const w = sim.state.env.weather;
  const c = climateOf(sim);
  const dm = w.dmCur ?? dmTarget(w.state);
  return seasonalMean(c, cal.yearFrac) + c.ad[cal.season] * dm * diurnalShape(cal.hour, cal.sunrise) + anomalyNow(sim) + w.wOff;
}

/** Heated interior temperature, C: `0.25 Tair + 0.75 SET`; unheated utility spaces `0.6 Tair + 8` (GDD 06 §2.5). */
export function interiorTemp(sim: Sim, heated = true): number {
  const air = airTemp(sim);
  if (!heated) return UNHEATED_AIR_W * air + UNHEATED_ADD_C;
  return INTERIOR_AIR_W * air + (1 - INTERIOR_AIR_W) * INTERIOR_SET_C[calendarNow(sim).season];
}

/** Relative humidity of the air 0..1 (GDD 06 §0 / §2.1): climate base plus the weather's delta; indoors a constant. */
export function relHumidity(sim: Sim, _p?: Vec3): number {
  const rh = climateOf(sim).humidityBase + WEATHER_DEFS[sim.state.env.weather.state].rhDelta;
  return rh < 0 ? 0 : rh > 1 ? 1 : rh;
}

/** Indoor relative humidity. */
export function interiorRh(): number {
  return INTERIOR_RH;
}
