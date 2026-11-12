// Environment-dependent factors (GDD 02 §8.2, GDD 06 §3.5/§3.7) as pure helpers. The environment owns the inputs
// (surface temperature, exposure, rain class, wind) and passes the results in: as a decay modifier hook and as
// washExposed factors.

import type { PheroChannel, PheroChannelFactors, RainClass } from '@/sim/types';
import {
  PHERO_HALF_LIFE_S, PHERO_HEAT_TMICRO_C, PHERO_HOME_RAIN_K, PHERO_PRECIP_NORM, PHERO_REF_TEMP_C, PHERO_TEMP_HL_MAX,
  PHERO_TEMP_HL_MIN, PHERO_TEMP_STEP_C, PHERO_TRAIL_HEAT_RATE, PHERO_TRAIL_HL_SHELTERED, PHERO_TRAIL_HL_SUNLIT_POROUS,
  PHERO_WASH_K, PHERO_WIND_DIV,
} from './balance';

/** Half-life multiplier of temperature T (C): 2^((22 - T)/10), clamped to [0.25, 3]. */
export function pheroTempHalfLifeFactor(tempC: number): number {
  const f = Math.pow(2, (PHERO_REF_TEMP_C - tempC) / PHERO_TEMP_STEP_C);
  return f < PHERO_TEMP_HL_MIN ? PHERO_TEMP_HL_MIN : f > PHERO_TEMP_HL_MAX ? PHERO_TEMP_HL_MAX : f;
}

/** Where a trail cell lies, for its exposure factor. */
export type PheroExposure = 'sunlit-porous' | 'sheltered' | 'normal';

export interface PheroCellClimate {
  /** Surface temperature of the cell, C. */
  tempC: number;
  /** Trail exposure class (ignored for home and alarm). */
  exposure?: PheroExposure;
  /** Micro-temperature at the surface, C (trail heat decay); defaults to tempC. */
  tmicroC?: number;
}

/**
 * Decay-rate multiplier of one cell (1 = base half-life): 1 / (temperature factor x exposure factor), and x 1.5
 * for trail on surfaces at Tmicro >= 35 C. Use it to build a PheroDecayModifier.
 */
export function pheroDecayRateMult(channel: PheroChannel, c: PheroCellClimate): number {
  let hl = pheroTempHalfLifeFactor(c.tempC);
  let rate = 1;
  if (channel === 'trail') {
    if (c.exposure === 'sunlit-porous') hl *= PHERO_TRAIL_HL_SUNLIT_POROUS;
    else if (c.exposure === 'sheltered') hl *= PHERO_TRAIL_HL_SHELTERED;
    if ((c.tmicroC ?? c.tempC) >= PHERO_HEAT_TMICRO_C) rate = PHERO_TRAIL_HEAT_RATE;
  }
  return rate / hl;
}

/**
 * Per-channel multipliers for exposed cells over dtSeconds of rain (GDD 06 §3.7): trail loses WASH_K[class] per s;
 * home decays x (1 + 2 precipNorm); trail and alarm decay x (1 + windGround / 3). Pass rain = null for wind only.
 * The extra decay terms are relative to the base half-lives at 22 C.
 */
export function rainWashFactors(
  rain: RainClass | 'storm' | null, dtSeconds: number, windGroundMs: number, out: PheroChannelFactors,
): PheroChannelFactors {
  const dt = dtSeconds > 0 ? dtSeconds : 0;
  const wind = windGroundMs > 0 ? windGroundMs / PHERO_WIND_DIV : 0;
  const k = rain ? PHERO_WASH_K[rain] : 0;
  const precip = rain ? PHERO_PRECIP_NORM[rain] : 0;
  out.trail = Math.exp(-k * dt) * Math.pow(2, (-dt * wind) / PHERO_HALF_LIFE_S.trail);
  out.home = Math.pow(2, (-dt * PHERO_HOME_RAIN_K * precip) / PHERO_HALF_LIFE_S.home);
  out.alarm = Math.pow(2, (-dt * wind) / PHERO_HALF_LIFE_S.alarm);
  return out;
}
