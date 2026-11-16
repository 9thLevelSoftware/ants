// When alates are reared (GDD 06 §11.1) and how many (§11.3): the gate checked at each local midnight inside the
// species' lay window, the target `A* = round(investment x REPRO_MAX_FRAC x N x alateCapMult)` split by the gyne
// share, and its cost in loads (`LARVA_P_REQ + LARVA_C_REQ` = 1.6 loads x the caste's cost multiplier).

import type { Colony, Sim, SpeciesDef } from '@/sim/types';
import { LARVA_C_REQ, LARVA_P_REQ } from '@/sim/balance';
import { REPRO_STORE_DAYS_C, REPRO_STORE_DAYS_P } from '@/sim/balance/lifecycle';
import { calendarTick, inDefaultYearWindow, ticksPerYear } from '@/sim/time';
import { daysOfStock } from '../needs';
import { isWorkerCaste } from '../census';

export const GATE_IDS = ['gate-stage', 'gate-age', 'gate-queen', 'gate-stores', 'gate-season', 'gate-player'] as const;
export type GateId = (typeof GATE_IDS)[number];

export interface AlateTarget {
  total: number;
  gynes: number;
  males: number;
  /** Cost of rearing them, loads. */
  cost: number;
}

/** The facts the gate reads (a plain record, so the rule is testable without a world). */
export interface GateFacts {
  workers: number;
  colonyAgeYears: number;
  queenAlive: boolean;
  daysC: number;
  daysP: number;
  inLayWindow: boolean;
  investment: number;
}

/** Cost of one alate larva of `caste`, loads. */
export function alateCost(def: SpeciesDef, caste: 'gyne' | 'male'): number {
  return (LARVA_P_REQ + LARVA_C_REQ) * def.reproduction.sexualCostMult[caste];
}

/** `A*` and its split and cost. `gyneShare` is the directive (falls back to the species share). */
export function alateTarget(def: SpeciesDef, workers: number, investment: number, capMult: number, gyneShare: number): AlateTarget {
  const total = Math.max(0, Math.round(investment * def.reproduction.reproMaxFrac * workers * capMult));
  const share = Number.isFinite(gyneShare) && gyneShare > 0 ? gyneShare : def.reproduction.reproGyneShare;
  const gynes = Math.round(total * share);
  const males = total - gynes;
  return { total, gynes, males, cost: gynes * alateCost(def, 'gyne') + males * alateCost(def, 'male') };
}

/** Failing gate ids for the facts ([] = alates may be reared). `matureGateMult` scales the size threshold. */
export function failingGates(def: SpeciesDef, f: GateFacts, matureGateMult: number, storeFrac = 1): GateId[] {
  const out: GateId[] = [];
  if (f.workers < def.scale.matureThreshold * matureGateMult) out.push('gate-stage');
  if (f.colonyAgeYears < def.reproduction.matureAgeYears) out.push('gate-age');
  if (!f.queenAlive) out.push('gate-queen');
  if (f.daysC < REPRO_STORE_DAYS_C * storeFrac || f.daysP < REPRO_STORE_DAYS_P * storeFrac) out.push('gate-stores');
  if (!f.inLayWindow) out.push('gate-season');
  if (!(f.investment > 0)) out.push('gate-player');
  return out;
}

/** The gate's facts for a colony now. */
export function gateFacts(sim: Sim, col: Colony, def: SpeciesDef): GateFacts {
  const s = sim.state;
  let workers = 0;
  for (const a of s.ants) if (a.alive && a.colony === col.id && isWorkerCaste(a.caste)) workers++;
  const q = sim.stores.ants.get(col.queenId);
  const stock = daysOfStock(col);
  const w = def.reproduction.alateLayWindow;
  return {
    workers,
    colonyAgeYears: (s.tick - col.foundedTick) / ticksPerYear(s.config),
    queenAlive: !!q && q.alive && q.caste === 'queen',
    daysC: finiteDays(stock.c),
    daysP: finiteDays(stock.p),
    inLayWindow: inDefaultYearWindow(calendarTick(s), s.config, w[0], w[1]),
    investment: col.directives.alateInvestment,
  };
}

/** Days of stock with no need at all (x / 0) count as plenty; 0 / 0 as none. */
function finiteDays(d: number): number {
  return Number.isNaN(d) ? 0 : d === Infinity ? Number.MAX_SAFE_INTEGER : d;
}
