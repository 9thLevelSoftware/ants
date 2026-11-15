// The herd's year on default-year day numbers (GDD 05 §0 day-number rule, 00-index C1): "doy a-b" holds while
// a - 1 <= d28 < b, so every window scales with the configured season length; rates per gd are not scaled.

import { APHID_GROWTH_PHASES, APHID_TEMP_CURVE, HERD_DORMANT_FROM_DOY } from '@/sim/balance/ecology';
import type { Sim } from '@/sim/types';
import { currentDefaultYearDay, currentHour } from '@/sim/time';

/** d28 of the current tick (0-based fractional default-year day). */
export function d28Now(sim: Sim): number {
  return currentDefaultYearDay(sim.state);
}

/** Clock hour of the current tick, 0..24. */
export function hourNow(sim: Sim): number {
  return currentHour(sim.state);
}

/** Inside the default-year window "doy a-b" (inclusive). */
export function inDays(d28: number, w: readonly [number, number]): boolean {
  return d28 >= w[0] - 1 && d28 < w[1];
}

/** Dormant (egg) phase: default-year days 22-28. */
export function isDormantSeason(d28: number): boolean {
  return d28 >= HERD_DORMANT_FROM_DOY - 1;
}

/** Growth rate r per gd of the phase holding d28 (GDD 05 §1.4 table); 0 in the dormant phase. */
export function growthRate(d28: number): number {
  for (const p of APHID_GROWTH_PHASES) if (inDays(d28, [p.from, p.to])) return p.r;
  return 0;
}

/** Name of the herd phase (for diagnostics). */
export function phaseName(d28: number): string {
  for (const p of APHID_GROWTH_PHASES) if (inDays(d28, [p.from, p.to])) return p.phase;
  return 'dormant';
}

/** Temperature factor fT of the air at the plant: 0 at <= 8 °C, 1 from 18 to 28 °C, 0.6 at >= 34 °C. */
export function tempFactor(airC: number): number {
  const c = APHID_TEMP_CURVE;
  if (!Number.isFinite(airC) || airC <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    const [t1, f1] = c[i];
    if (airC <= t1) {
      const [t0, f0] = c[i - 1];
      return f0 + ((f1 - f0) * (airC - t0)) / (t1 - t0);
    }
  }
  return c[c.length - 1][1];
}
