// Garden climate factors (GDD 07 §6.4.2): fT from the chamber temperature, fRH from its humidity, and the health
// damage of a chamber that is too hot, too cold or too dry. Pure.

import type { FungusParams } from './params';

/** Linear interpolation of y over x between (x0, y0) and (x1, y1), clamped to the segment. */
function seg(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y1;
  const k = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * k;
}

/** fT: 1.0 at 21-25 °C, 0.5 at 18 and 28 °C, 0 at <= 15 or >= 30 °C, linear between. */
export function fTemp(P: FungusParams, tempC: number): number {
  if (!Number.isFinite(tempC)) return 0;
  if (tempC <= P.fTZeroLowC || tempC >= P.fTZeroHighC) return 0;
  if (tempC < P.fTHalfLowC) return seg(tempC, P.fTZeroLowC, 0, P.fTHalfLowC, 0.5);
  if (tempC < P.fTOptLowC) return seg(tempC, P.fTHalfLowC, 0.5, P.fTOptLowC, 1);
  if (tempC <= P.fTOptHighC) return 1;
  if (tempC <= P.fTHalfHighC) return seg(tempC, P.fTOptHighC, 1, P.fTHalfHighC, 0.5);
  return seg(tempC, P.fTHalfHighC, 0.5, P.fTZeroHighC, 0);
}

/** fRH: 1.0 at RH >= 0.8, 0.6 at 0.6, 0.3 at <= 0.5, linear between. */
export function fHumidity(P: FungusParams, rh: number): number {
  if (!Number.isFinite(rh)) return P.fRhLowValue;
  if (rh >= P.fRhFull) return 1;
  if (rh >= P.fRhMid) return seg(rh, P.fRhMid, P.fRhMidValue, P.fRhFull, 1);
  if (rh > P.fRhLow) return seg(rh, P.fRhLow, P.fRhLowValue, P.fRhMid, P.fRhMidValue);
  return P.fRhLowValue;
}

/** Health lost per game day to the climate: heat (>= 30 °C) or cold (<= 12 °C) 0.15; dryness (RH <= 0.5) 0.05. */
export function climateDamagePerGd(P: FungusParams, tempC: number, rh: number): { heat: number; cold: number; dry: number } {
  return {
    heat: tempC >= P.heatDamageC ? P.heatDamageRate : 0,
    cold: tempC <= P.coldDamageC ? P.heatDamageRate : 0,
    dry: rh <= P.fRhLow ? P.fRhDamageRate : 0,
  };
}
