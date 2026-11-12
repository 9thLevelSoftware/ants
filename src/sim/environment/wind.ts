// Wind at 2 m (GDD 06 §3.4): the diurnal factor and the noise-free base wind of the current state.

import type { Sim, SimState } from '@/sim/types';
import {
  WEATHER_DEFS, WIND_BLEND_H, WIND_DAY_FROM_H, WIND_DAY_MULT, WIND_DAY_TO_H, WIND_MIN_MS, WIND_NIGHT_FROM_H, WIND_NIGHT_MULT,
  WIND_NIGHT_TO_H,
} from '@/sim/balance';
import { calendarNow } from './calendar';
import { climateOf } from './temperature';

/** Trapezoid 0..1: rises over `blend` before `from`, 1 on [from, to], falls over `blend` after `to`. */
function plateau(h: number, from: number, to: number, blend: number): number {
  if (h >= from && h <= to) return 1;
  if (h < from) return h > from - blend ? 1 - (from - h) / blend : 0;
  return h < to + blend ? 1 - (h - to) / blend : 0;
}

/** Diurnal wind multiplier: 0.65 at night, 1.3 in the afternoon, 1 otherwise, with linear blends (GDD 06 §3.4). */
export function windDiurnal(hour: number): number {
  const night = Math.max(plateau(hour, WIND_NIGHT_FROM_H, 24, WIND_BLEND_H), plateau(hour, 0, WIND_NIGHT_TO_H, WIND_BLEND_H));
  const day = plateau(hour, WIND_DAY_FROM_H, WIND_DAY_TO_H, WIND_BLEND_H);
  return 1 + (WIND_NIGHT_MULT - 1) * night + (WIND_DAY_MULT - 1) * day;
}

/** Wind at 2 m without gusts, m/s: climate * diurnal * state wind + noise (GDD 06 §3.4). */
export function baseWind(sim: Sim): number {
  const w = sim.state.env.weather;
  const v = climateOf(sim).windBase * windDiurnal(calendarNow(sim).hour) * WEATHER_DEFS[w.state].stateWind + (w.windOu ?? 0);
  return v < WIND_MIN_MS ? WIND_MIN_MS : v;
}

// Debug hold of `cheat.setWind` (GDD 06 App. B): the wind stays at the value until another setWind. Not saved
// (cheats are never saved); keyed by state object so several sims do not interfere.
const windHolds = new WeakMap<SimState, number>();

/** Holds wind2m at `ms` (m/s) from now on; a negative value releases the hold. */
export function setWindHold(state: SimState, ms: number): void {
  if (ms < 0) windHolds.delete(state);
  else windHolds.set(state, ms);
}

/** The held wind, or undefined when the wind is free. */
export function windHold(state: SimState): number | undefined {
  return windHolds.get(state);
}
