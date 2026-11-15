// Pure herd formulas of GDD 05 §1.4 (no side effects): capacity, pool cap, slots, tenders needed, production.

import type { Herd } from '@/sim/types';
import {
  APHIDS_PER_TENDER, HERD_K, HERD_POOL_BASE, HERD_POOL_PER_APHID, HONEYDEW_PER_APHID, MOW_K_MULT, MOW_RECOVERY_GD,
  TEND_K_BONUS, TEND_SLOTS_BASE, TEND_SLOTS_MAX, TEND_SLOTS_PER_APHIDS, UNTENDED_PROD,
} from '@/sim/balance/ecology';
import { TICKS_PER_DAY } from '@/sim/time';

/** Base carrying capacity of the herd: the cheat override, else by host class. */
export function baseK(h: Herd): number {
  return h.kMax !== undefined && h.kMax > 0 ? h.kMax : HERD_K[h.hostClass];
}

/** K_eff x this while a mown host recovers: 0.3 right after mowing, back to 1 linearly over MOW_RECOVERY_GD. */
export function mowFactor(h: Herd, tick: number): number {
  if (h.mownUntilTick < 0 || tick >= h.mownUntilTick) return 1;
  const left = (h.mownUntilTick - tick) / (MOW_RECOVERY_GD * TICKS_PER_DAY);
  return 1 - (1 - MOW_K_MULT) * Math.min(1, Math.max(0, left));
}

/** K_eff = HERD_K x hostQuality x (1 + 0.25 tend) (x the mowing factor). */
export function kEff(h: Herd, tick: number): number {
  return baseK(h) * h.hostQuality * (1 + TEND_K_BONUS * h.tend) * mowFactor(h, tick);
}

/** Pool cap 1 + 0.02 A, loads (x foodAbundanceMult). */
export function poolCap(a: number, mult = 1): number {
  return (HERD_POOL_BASE + HERD_POOL_PER_APHID * Math.max(0, a)) * mult;
}

/** Tender slots 2 + floor(A / 25), at most 16. */
export function tendSlots(a: number): number {
  return Math.min(TEND_SLOTS_MAX, TEND_SLOTS_BASE + Math.floor(Math.max(0, a) / TEND_SLOTS_PER_APHIDS));
}

/** Tenders needed for tend 1: ceil(A / 50), at least 1. */
export function tendersNeeded(a: number): number {
  return Math.max(1, Math.ceil(Math.max(0, a) / APHIDS_PER_TENDER));
}

/** Honeydew production, loads per gd: A x 0.10 x (0.5 + 0.5 tend) x fT (x foodAbundanceMult). */
export function productionPerGd(a: number, tend: number, fT: number, mult = 1): number {
  return Math.max(0, a) * HONEYDEW_PER_APHID * (UNTENDED_PROD + (1 - UNTENDED_PROD) * tend) * fT * mult;
}
