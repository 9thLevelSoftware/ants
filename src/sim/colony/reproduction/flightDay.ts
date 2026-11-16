// Nuptial-flight day conditions (GDD 06 §11.5): hard gates first (air temperature, wind, no rain / storm / frost),
// then `p_launch = clamp01(0.85 p_T p_W p_state + bonus)`. Pure; the weather facts come from the environment.

import type { SpeciesDef } from '@/sim/types';
import {
  FLIGHT_P_MAX, FLIGHT_RAIN_BONUS, FLIGHT_RAIN_BONUS_GD, FLIGHT_STATE_FACTOR, FLIGHT_T_FULL_C, FLIGHT_TREND_BONUS,
  FLIGHT_TREND_SCALE_C, FLIGHT_W_CALM_MS,
} from '@/sim/balance/lifecycle';

export interface FlightWeather {
  /** Air temperature now, C. */
  tAir: number;
  /** Wind at 2 m, m/s. */
  wind2m: number;
  /** Weather state id. */
  state: string;
  /** Game days since the last rain ended (Infinity: none recorded). */
  rainEndedAgoGd: number;
  tmaxToday: number;
  tmaxYesterday: number;
}

export interface LaunchChance {
  p: number;
  /** [p_T, p_W, p_state, bonus]; all 0 when a hard gate fails. */
  factors: number[];
  /** The hard gate that failed, '' none. */
  failed: string;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function launchChance(def: SpeciesDef, w: FlightWeather): LaunchChance {
  const g = def.reproduction.flightGate;
  if (w.tAir < g.minAirC) return { p: 0, factors: [0, 0, 0, 0], failed: 'cold' };
  if (!(w.wind2m < g.maxWindMs)) return { p: 0, factors: [0, 0, 0, 0], failed: 'wind' };
  if (g.noRain && (w.state === 'rain' || w.state === 'storm' || w.state === 'frost')) return { p: 0, factors: [0, 0, 0, 0], failed: 'sky' };
  const pT = clamp01((w.tAir - g.minAirC) / (FLIGHT_T_FULL_C - g.minAirC));
  const pW = w.wind2m < FLIGHT_W_CALM_MS ? 1 : clamp01((g.maxWindMs - w.wind2m) / (g.maxWindMs - FLIGHT_W_CALM_MS));
  const pS = FLIGHT_STATE_FACTOR[w.state] ?? 0;
  const trend = Math.max(-1, Math.min(1, (w.tmaxToday - w.tmaxYesterday) / FLIGHT_TREND_SCALE_C));
  const bonus = (w.rainEndedAgoGd <= FLIGHT_RAIN_BONUS_GD ? FLIGHT_RAIN_BONUS : 0) + FLIGHT_TREND_BONUS * trend;
  const p = clamp01(FLIGHT_P_MAX * pT * pW * pS + bonus);
  return { p, factors: [pT, pW, pS, bonus], failed: '' };
}
