// Pure draws of the weather machine (GDD 06 §3.2): transition weights with their guards, next state, dwell time and
// rain class. No state is read or written here; the context carries every input. Only the RNG stream advances.

import { rngFloat, type RngState } from '@/core/rng';
import type { RainClass, Season, WeatherState } from '@/sim/types';
import { RAIN_CLASSES, WEATHER_STATES } from '@/sim/types';
import {
  DRYSPELL_HEAT_MULT, DRYSPELL_RAIN_MULT, DWELL_CAP_MEAN_MULT, DWELL_H, FALLBACK_ROW_SEASON, FROST_START_BEFORE_SUNRISE_H, FROST_START_NOT_AFTER_H, FROST_START_NOT_BEFORE_H,
  HEAT_DWELL_CAP_H, RAIN_CLASS_DWELL_MULT, RAIN_CLASS_WEIGHTS, SHOULDER_HEAT_SHARE, TRANSITIONS,
} from '@/sim/balance';
import type { ClimateDef } from './climates';

/** Everything a weather draw needs about the moment it is for (the transition time). */
export interface WeatherDrawCtx {
  season: Season;
  /** Hour of day at the transition and the day's sunrise / sunset. */
  hour: number;
  sunrise: number;
  sunset: number;
  /** Seasonal mean air temperature at that time, C. */
  tSeason: number;
  climate: ClimateDef;
  /** Effective destination multipliers: climate * difficulty * severity. */
  rainMult: number;
  stormMult: number;
  heatMult: number;
  frostMult: number;
  /** Severity `none`: only clear and overcast. */
  clearOvercastOnly: boolean;
  dryspell: boolean;
}

const N_STATES = WEATHER_STATES.length;
const scratch = new Float64Array(N_STATES);

function rowFor(season: Season, from: WeatherState): Partial<Record<WeatherState, number>> {
  return TRANSITIONS[season][from] ?? TRANSITIONS[FALLBACK_ROW_SEASON][from] ?? {};
}

function frostHourOk(ctx: WeatherDrawCtx): boolean {
  const evening = ctx.hour >= Math.max(ctx.sunset, FROST_START_NOT_BEFORE_H);
  const morning = ctx.hour <= Math.min(ctx.sunrise - FROST_START_BEFORE_SUNRISE_H, FROST_START_NOT_AFTER_H);
  return evening || morning;
}

/**
 * Normalised weights of the next state after `from`, written into `out` (indexed by WEATHER_STATES order) with
 * the guards applied; returns the weight sum before normalisation (0 = nothing allowed).
 */
export function transitionWeights(ctx: WeatherDrawCtx, from: WeatherState, out: Float64Array): number {
  const row = rowFor(ctx.season, from);
  let sum = 0;
  for (let i = 0; i < N_STATES; i++) {
    const to = WEATHER_STATES[i];
    let w = to === from ? 0 : (row[to] ?? 0);
    if (to === 'heat' && from === 'clear' && w === 0 && (ctx.season === 'spring' || ctx.season === 'autumn')) {
      w = SHOULDER_HEAT_SHARE * (TRANSITIONS.summer.clear?.heat ?? 0);
    }
    if (ctx.clearOvercastOnly && to !== 'clear' && to !== 'overcast') w = 0;
    if (w > 0) {
      if (to === 'rain') w *= ctx.rainMult * (ctx.dryspell ? DRYSPELL_RAIN_MULT : 1);
      else if (to === 'storm') w *= ctx.stormMult * (ctx.dryspell ? DRYSPELL_RAIN_MULT : 1);
      else if (to === 'heat') {
        w *= ctx.heatMult * (ctx.dryspell ? DRYSPELL_HEAT_MULT : 1);
        if (from !== 'clear' || ctx.tSeason < ctx.climate.heatSeasonalMinC) w = 0;
      } else if (to === 'frost') {
        w *= ctx.frostMult;
        if (!frostHourOk(ctx) || ctx.tSeason > ctx.climate.frostSeasonalMaxC) w = 0;
      }
    }
    out[i] = w;
    sum += w;
  }
  if (sum > 0) for (let i = 0; i < N_STATES; i++) out[i] /= sum;
  return sum;
}

/** Draws the next state; when every destination is guarded out the state falls back to `overcast` (or `clear`). */
export function drawNextState(ctx: WeatherDrawCtx, from: WeatherState, rng: RngState): WeatherState {
  const sum = transitionWeights(ctx, from, scratch);
  const u = rngFloat(rng);
  if (sum <= 0) return from === 'overcast' ? 'clear' : 'overcast';
  let acc = 0;
  for (let i = 0; i < N_STATES; i++) {
    acc += scratch[i];
    if (u < acc) return WEATHER_STATES[i];
  }
  // Rounding: the last state with weight.
  for (let i = N_STATES - 1; i >= 0; i--) if (scratch[i] > 0) return WEATHER_STATES[i];
  return 'overcast';
}

/** Rain class drawn at rain onset. */
export function drawRainClass(rng: RngState): RainClass {
  let total = 0;
  for (const c of RAIN_CLASSES) total += RAIN_CLASS_WEIGHTS[c];
  let u = rngFloat(rng) * total;
  for (const c of RAIN_CLASSES) {
    u -= RAIN_CLASS_WEIGHTS[c];
    if (u < 0) return c;
  }
  return 'shower';
}

/** Dwell in game hours: `min + Exp(mean - min)`, capped, scaled by the rain class (GDD 06 §3.2). */
export function drawDwellHours(season: Season, state: WeatherState, cls: RainClass | null, rng: RngState): number {
  const d = DWELL_H[season][state];
  const exp = -(d.mean - d.min) * Math.log(1 - rngFloat(rng));
  const cap = state === 'heat' ? HEAT_DWELL_CAP_H : DWELL_CAP_MEAN_MULT * d.mean;
  const base = Math.min(d.min + exp, cap);
  return state === 'rain' && cls ? base * RAIN_CLASS_DWELL_MULT[cls] : base;
}
