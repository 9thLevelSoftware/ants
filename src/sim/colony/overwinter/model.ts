// The aggregate winter model (GDD 06 §6.3): the whole winter computed at once from a snapshot taken at Begin, one
// step per game day. Pure: inputs in, outcome out; randomness only from the given RNG state (`rng.winter`).
//
// Losses are kept as expected (fractional) numbers per cause while the days run, so the formulas of the chapter are
// visible in the result; the counts actually removed are drawn once at the end by stochastic rounding.

import { rngFloat, rngRange, type RngState } from '@/core/rng';
import {
  P_WINTER_FUNGUS, WINT_BASE_LOSS_LARVAE, WINT_C_PER_LARVA, WINT_C_PER_WORKER, WINT_C_QUEEN, WINT_COLD_CAP,
  WINT_COLD_PER_DEG_GD, WINT_FLOOD_K, WINT_FLOOD_LOSS, WINT_FUNGUS_HUMID_MULT, WINT_FUNGUS_HUMIDITY,
  WINT_FUNGUS_LARVA_LOSS, WINT_FUNGUS_WORKER_LOSS, WINT_MET_REF_C, WINT_NO_P_LARVAE_PER_GD, WINT_OLD_LOSS_MULT,
  WINT_P_PER_LARVA, WINT_P_QUEEN, WINT_QUEEN_COLD_P, WINT_QUEEN_STARVE_GD, WINT_RAIN_PEAK_MM, WINT_STARVE_BROOD_PER_GD,
  WINT_STARVE_WORKERS_PER_GD,
} from '@/sim/balance/lifecycle';

/** Species and difficulty numbers of the model. */
export interface WinterParams {
  /** `T_COLD_STRESS`, C. */
  tColdStress: number;
  /** `WINT_BASE_LOSS` of workers over the winter. */
  baseLoss: number;
  metBase: number;
  q10: number;
  /** `diff.winterLossMult`. */
  lossMult: number;
  /** `diff.winterQueenDeathP`. */
  queenDeathP: number;
  /** Fungal outbreak chance per winter (default P_WINTER_FUNGUS; tests pin it to 0). */
  pFungus?: number;
  /** Flood factor k (default WINT_FLOOD_K; tests pin it to 0). */
  floodK?: number;
}

export interface WinterInput {
  /** Workers alive at Begin; of them, old ones (age above WINT_OLD_AGE_FRAC of their life). */
  workers: number;
  oldWorkers: number;
  /** Larvae (eggs already hatched into larvae) and surviving pupae at Begin. */
  larvae: number;
  pupae: number;
  /** Stores at Begin, loads. */
  c: number;
  p: number;
  queenAlive: boolean;
  /** Per winter day: cluster mean and minimum temperature (C), frost night, rain (mm). */
  tMean: number[];
  tMin: number[];
  frost: boolean[];
  rainMm: number[];
  /** Flood safety of the cluster chamber 0..1 (1 = never floods). */
  floodSafety: number;
  /** Nest humidity 0..1 (fungus x3 above WINT_FUNGUS_HUMIDITY). */
  humidity: number;
}

export interface WinterDayOut {
  tMean: number;
  tMin: number;
  frost: boolean;
  rainMm: number;
  flood: boolean;
  workers: number;
  larvae: number;
  c: number;
  p: number;
  beat: string;
}

export interface WinterOutcome {
  /** Expected (fractional) worker losses by cause. */
  expectedLosses: Record<string, number>;
  /** Drawn worker losses by cause (integers, summing to at most `workers`). Causes are DeathCause ids. */
  losses: Record<string, number>;
  /** Brood losses by BroodDeathCause id (cannibalised = eaten in famine, hygiene = fungus, flooding). */
  expectedBroodLosses: Record<string, number>;
  broodLosses: Record<string, number>;
  workers1: number;
  larvae1: number;
  c1: number;
  p1: number;
  /** C and P eaten over the winter, loads. */
  usedC: number;
  usedP: number;
  queenAlive: boolean;
  queenCause: string;
  /** Total cold-stress fraction (capped) and GD the colony had no C. */
  coldStress: number;
  starvedDays: number;
  disease: boolean;
  floods: number;
  days: WinterDayOut[];
}

/** `fMet = WINT_MET_BASE * WINT_Q10 ^ ((Tcl - 6) / 10)`. */
export function metFactor(p: WinterParams, tCluster: number): number {
  return p.metBase * Math.pow(p.q10, (tCluster - WINT_MET_REF_C) / 10);
}

/** C need of one winter day, loads: `(N 0.08 + 0.30 + 0.02 larvae) fMet` (queen term only while she lives). */
export function dayNeedC(workers: number, larvae: number, queen: boolean, fMet: number): number {
  return (workers * WINT_C_PER_WORKER + (queen ? WINT_C_QUEEN : 0) + WINT_C_PER_LARVA * larvae) * fMet;
}

/** P need of one winter day, loads: `(0.10 + 0.01 larvae) fMet`. */
export function dayNeedP(larvae: number, queen: boolean, fMet: number): number {
  return ((queen ? WINT_P_QUEEN : 0) + WINT_P_PER_LARVA * larvae) * fMet;
}

/** Per-day rate that compounds to `total` over `days`. */
function dailyOf(total: number, days: number): number {
  return days > 0 ? 1 - Math.pow(1 - Math.min(0.999, Math.max(0, total)), 1 / days) : 0;
}

const add = (r: Record<string, number>, k: string, v: number): void => {
  if (v > 0) r[k] = (r[k] ?? 0) + v;
};

/** Stochastic rounding of the expected losses, capped by the population (causes in id order). */
function drawCounts(expected: Record<string, number>, pop: number, rng: RngState): Record<string, number> {
  const out: Record<string, number> = {};
  let left = pop;
  for (const k of Object.keys(expected).sort()) {
    const e = expected[k];
    const n = Math.min(left, Math.floor(e) + (rngFloat(rng) < e - Math.floor(e) ? 1 : 0));
    if (n > 0) out[k] = n;
    left -= n;
  }
  return out;
}

const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

/**
 * Ruling R24: the drawn worker losses with those of not-alerted causes trimmed to `cap` in all. Old age keeps its
 * share first (the base loss), then the other causes in id order; causes in `alerted` (their hazard was alerted
 * before winter) are kept in full and do not count against the cap.
 */
export function capLapseLosses(losses: Record<string, number>, cap: number, alerted: ReadonlySet<string>): Record<string, number> {
  const out: Record<string, number> = {};
  let left = Math.max(0, Math.floor(cap));
  const order = Object.keys(losses).sort((a, b) => (a === 'old-age' ? -1 : b === 'old-age' ? 1 : a < b ? -1 : a > b ? 1 : 0));
  for (const cause of order) {
    const n = losses[cause];
    if (alerted.has(cause)) { out[cause] = n; continue; }
    const kept = Math.min(n, left);
    left -= kept;
    if (kept > 0) out[cause] = kept;
  }
  return out;
}

/** Runs the winter. `days` = the length of the input arrays (one season). */
export function runWinterModel(input: WinterInput, p: WinterParams, rng: RngState): WinterOutcome {
  const days = input.tMean.length;
  const mult = p.lossMult;
  const W0 = input.workers;
  let young = Math.max(0, W0 - input.oldWorkers);
  let old = Math.min(W0, input.oldWorkers);
  let L = input.larvae;
  let C = input.c, P = input.p;
  let queen = input.queenAlive;
  const exp: Record<string, number> = {};
  const expBrood: Record<string, number> = {};
  const out: WinterDayOut[] = [];
  const baseYoung = dailyOf(p.baseLoss * mult, days);
  const baseOld = dailyOf(p.baseLoss * WINT_OLD_LOSS_MULT * mult, days);
  const baseLarva = dailyOf(WINT_BASE_LOSS_LARVAE * mult, days);
  const fungusP = (p.pFungus ?? P_WINTER_FUNGUS) * (input.humidity > WINT_FUNGUS_HUMIDITY ? WINT_FUNGUS_HUMID_MULT : 1);
  // the outbreak (if any) and its day are drawn first, so the rest of the draws do not depend on them
  const fungusDay = rngFloat(rng) < fungusP ? Math.min(days - 1, Math.floor(rngFloat(rng) * days)) : -1;
  const fungusLoss = rngRange(rng, WINT_FUNGUS_WORKER_LOSS[0], WINT_FUNGUS_WORKER_LOSS[1]);
  let cold = 0, starved = 0, floods = 0, usedC = 0, usedP = 0;

  // one pass removes `frac` of the workers (young and old alike) for a cause
  const loseWorkers = (cause: string, frac: number): void => {
    const f = Math.min(1, Math.max(0, frac));
    add(exp, cause, (young + old) * f);
    young *= 1 - f;
    old *= 1 - f;
  };
  const loseLarvae = (cause: string, frac: number): void => {
    const f = Math.min(1, Math.max(0, frac));
    add(expBrood, cause, L * f);
    L *= 1 - f;
  };

  for (let g = 0; g < days; g++) {
    const tMean = input.tMean[g], tMin = input.tMin[g];
    let beat = input.frost[g] ? 'frost' : input.rainMm[g] > 0 ? 'rain' : '';
    const fMet = metFactor(p, tMean);
    // consumption
    const needC = dayNeedC(young + old, L, queen, fMet);
    const needP = dayNeedP(L, queen, fMet);
    const shortC = needC > 0 && C < needC ? 1 - C / needC : 0;
    const shortP = needP > 0 && P < needP ? 1 - P / needP : 0;
    usedC += Math.min(C, needC);
    usedP += Math.min(P, needP);
    C = Math.max(0, C - needC);
    P = Math.max(0, P - needP);
    // starvation once C is gone: brood eaten and workers dying; no P: larvae die
    if (shortC > 0) {
      starved += shortC;
      loseLarvae('cannibalised', WINT_STARVE_BROOD_PER_GD * shortC * mult);
      loseWorkers('starvation', WINT_STARVE_WORKERS_PER_GD * shortC * mult);
      beat = 'starvation';
    }
    if (shortP > 0) loseLarvae('starvation', WINT_NO_P_LARVAE_PER_GD * shortP * mult);
    // cold stress on the day's minimum, capped over the winter
    const c = Math.min(WINT_COLD_CAP - cold, WINT_COLD_PER_DEG_GD * Math.max(0, p.tColdStress - tMin) * mult);
    if (c > 0) { cold += c; loseWorkers('cold', c); }
    // base loss (old workers twice as fast)
    add(exp, 'old-age', young * baseYoung + old * baseOld);
    young *= 1 - baseYoung;
    old *= 1 - baseOld;
    loseLarvae('base', baseLarva);
    // fungal outbreak
    if (g === fungusDay) {
      loseWorkers('disease', fungusLoss * mult);
      loseLarvae('hygiene', WINT_FUNGUS_LARVA_LOSS * mult);
      beat = 'disease';
    }
    // flood at the end of a rain event
    let flood = false;
    if (input.rainMm[g] > 0) {
      const pf = (p.floodK ?? WINT_FLOOD_K) * (1 - input.floodSafety) * Math.min(1, input.rainMm[g] / WINT_RAIN_PEAK_MM);
      if (rngFloat(rng) < pf) {
        flood = true;
        floods++;
        loseWorkers('drowning', WINT_FLOOD_LOSS * mult);
        loseLarvae('flooding', WINT_FLOOD_LOSS * mult);
        beat = 'flood';
      }
    }
    out.push({ tMean, tMin, frost: input.frost[g], rainMm: input.rainMm[g], flood, workers: young + old, larvae: L, c: C, p: P, beat });
  }

  // the queen: the winter risk of the difficulty plus cold stress, and starvation after WINT_QUEEN_STARVE_GD without C
  let queenCause = '';
  if (queen) {
    if (starved >= WINT_QUEEN_STARVE_GD) queenCause = 'starvation';
    else if (rngFloat(rng) < p.queenDeathP + WINT_QUEEN_COLD_P * cold) queenCause = cold > 0 ? 'cold' : 'disease';
    if (queenCause) queen = false;
  }
  // integer losses: old-age first from the drawn total, then the other causes
  const losses = drawCounts(exp, W0, rng);
  const broodLosses = drawCounts(expBrood, input.larvae, rng);
  const workers1 = W0 - sum(losses);
  const larvae1 = input.larvae - sum(broodLosses);
  // the day series ends on the drawn counts (the presentation shows whole ants)
  const lastW = out.length > 0 ? out[out.length - 1].workers : W0;
  const lastL = out.length > 0 ? out[out.length - 1].larvae : input.larvae;
  for (const d of out) {
    d.workers = Math.round(W0 - ((W0 - d.workers) * (W0 - workers1)) / Math.max(1e-9, W0 - lastW));
    d.larvae = Math.round(input.larvae - ((input.larvae - d.larvae) * (input.larvae - larvae1)) / Math.max(1e-9, input.larvae - lastL));
    if (W0 - lastW < 1e-9) d.workers = W0;
    if (input.larvae - lastL < 1e-9) d.larvae = input.larvae;
  }
  return {
    expectedLosses: exp, losses, expectedBroodLosses: expBrood, broodLosses, workers1, larvae1, c1: C, p1: P, usedC, usedP,
    queenAlive: queen, queenCause, coldStress: cold, starvedDays: starved, disease: fungusDay >= 0, floods, days: out,
  };
}
