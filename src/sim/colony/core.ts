// Colony-core bookkeeping on `Colony.core` (types/colony.ts ColonyCoreState), created lazily on first use.
//
// `acc` keys (all numbers):
//   cyc.upkeepC, cyc.larvaC, cyc.larvaP, cyc.larvae  - sums of per-gd rates over the running 10-tick cycle
//   inst.upkeepC, inst.larvaC, inst.larvaP, inst.larvae, inst.queenC, inst.queenP, inst.spoilC, inst.spoilP
//                                                     - the last completed cycle (instantaneous rates, loads/gd)
//   lay.potential, lay.ref, lay.season, lay.temp, lay.health, lay.cap - laying potential and its factors
//   yield.loads, yield.foragerGd                     - forager deliveries and forager-time since the last yield update
//   win.*                                             - diagnostics window sums (see diagnostics.ts)
//   hour.*                                            - statistics of the running game hour (see stats.ts)

import type { Colony, ColonyCoreState, ColonyLedger } from '@/sim/types';

export function emptyLedger(dayStartTick: number): ColonyLedger {
  return {
    inDeliveryC: 0, inDeliveryP: 0, inRecycledC: 0, inRecycledP: 0, outWorkersC: 0, outQueenC: 0, outQueenP: 0,
    outLarvaeC: 0, outLarvaeP: 0, outSpoiledC: 0, outSpoiledP: 0, outRationC: 0, transitC: 0, transitP: 0,
    dayStartTick,
  };
}

/** The colony's core state, created on first use (`day` -1 = not yet set by the economy system). */
export function coreOf(col: Colony, tick = 0, day = -1): ColonyCoreState {
  let c = col.core;
  if (!c) {
    c = {
      life: emptyLedger(tick), day, workers: 0, pileCap: 0, cZeroSinceTick: -1, pZeroSinceTick: -1,
      exitSinceTick: -1, minimSinceTick: -1, fullSinceTick: -1, cannibalReadyTick: 0, spoiledPending: 0,
      layingRate: 0, departuresToday: 0, acc: {}, diagPending: [], deathsToday: {},
    };
    col.core = c;
  }
  return c;
}

/** Reads an accumulator (0 when absent). */
export function accGet(core: ColonyCoreState, key: string): number {
  return core.acc[key] ?? 0;
}

export function accAdd(core: ColonyCoreState, key: string, v: number): void {
  core.acc[key] = (core.acc[key] ?? 0) + v;
}

export function accSet(core: ColonyCoreState, key: string, v: number): void {
  core.acc[key] = v;
}

/** Ledger keys that are pool inflows / outflows (transit is a net outflow: food moved into nurses' crops). */
export const LEDGER_IN_C = ['inDeliveryC', 'inRecycledC'] as const;
export const LEDGER_IN_P = ['inDeliveryP', 'inRecycledP'] as const;
export const LEDGER_OUT_C = ['outWorkersC', 'outQueenC', 'outLarvaeC', 'outSpoiledC', 'outRationC', 'transitC'] as const;
export const LEDGER_OUT_P = ['outQueenP', 'outLarvaeP', 'outSpoiledP', 'transitP'] as const;
export type LedgerKey = Exclude<keyof ColonyLedger, 'dayStartTick'>;

/** Adds a flow to both the daily and the lifetime ledger. */
export function book(col: Colony, key: LedgerKey, amount: number): void {
  if (amount === 0) return;
  col.ledger[key] += amount;
  coreOf(col).life[key] += amount;
}

/** Net pool change booked by a ledger: inflows minus outflows, per nutrient. */
export function ledgerNet(l: ColonyLedger): { c: number; p: number } {
  let c = 0, p = 0;
  for (const k of LEDGER_IN_C) c += l[k];
  for (const k of LEDGER_OUT_C) c -= l[k];
  for (const k of LEDGER_IN_P) p += l[k];
  for (const k of LEDGER_OUT_P) p -= l[k];
  return { c, p };
}
