// Collective demand signals (GDD 02 §5.5): need rates (EMA), days of stock, needC / needP, desired protein
// share with diet emphasis, nutrient weights foragers use, intake target.

import type { Colony } from '@/sim/types';
import {
  DIET_RANGE, DIET_SHIFT, NEED_EMA_GD, NEED_RATE_C_MIN, NEED_RATE_P_MIN, NUTRIENT_W_BASE, NUTRIENT_W_GAIN,
  PROTEIN_DEFICIT_NEED, RECRUIT_ACCEPT_BASE, RECRUIT_ACCEPT_GAIN, SP_MAX, SP_MIN, STOCK_REFILL_GD,
  STOCK_TARGET_C_GD, STOCK_TARGET_MULT, STOCK_TARGET_P_GD,
} from '@/sim/balance';
import { clamp } from '@/core/math/scalar';

/** Instantaneous need rates of one physiology cycle, loads/gd. */
export interface NeedInputs {
  rateC: number;
  /** GDD 02 §5.5 needRateP: queen + laying + larvae + the store's P spoilage. */
  rateP: number;
  /** R35 point 4: the same without the spoilage term (the forage side's protein rate). Defaults to rateP. */
  rateForageP?: number;
}

/** core.acc key: R35's forage-side protein rate EMA (needRateP without the store's spoilage), loads/gd. */
export const FORAGE_RATE_P_KEY = 'need.rateForageP';

/** Updates the need-rate EMAs with dtGd of new data and recomputes needC, needP and the protein share. */
export function updateNeeds(col: Colony, inst: NeedInputs, dtGd: number): void {
  const n = col.needs;
  const k = 1 - Math.exp(-dtGd / NEED_EMA_GD);
  // A never-updated colony starts from the first sample instead of from 0.
  if (n.rateC <= 0) n.rateC = inst.rateC;
  else n.rateC += (inst.rateC - n.rateC) * k;
  if (n.rateP <= 0) n.rateP = inst.rateP;
  else n.rateP += (inst.rateP - n.rateP) * k;
  const acc = col.core?.acc;
  if (acc) {
    const f = inst.rateForageP ?? inst.rateP, prev = acc[FORAGE_RATE_P_KEY] ?? 0;
    acc[FORAGE_RATE_P_KEY] = prev <= 0 ? f : prev + (f - prev) * k;
  }
  refreshNeedIndices(col);
}

/** Need rates with their floors (GDD 02 §5.5), loads/gd. */
export function needRates(col: Colony): { c: number; p: number } {
  return { c: Math.max(NEED_RATE_C_MIN, col.needs.rateC), p: Math.max(NEED_RATE_P_MIN, col.needs.rateP) };
}

/** core.acc key: R32b's prospective protein demand, loads/gd (queen.ts prospectiveProteinRate, set each cycle). */
export const PROSPECTIVE_P_KEY = 'need.prospP';

/**
 * Need rates of the forage side (rulings R32b, R35): the protein rate is the forage side's own (GDD 02 §5.5's needRateP
 * without the store's spoilage term, R35 point 4: a stocked larder is no appetite) plus the prospective demand of the
 * laying the gates withhold, so the colony forages for the brood its queen could have. Read by the desired protein
 * share, the need indices, the intake target, the scouts' shortfall and the protein larder. The laying gates and the
 * starvation stage keep the plain rates (daysOfStock, with spoilage): counting the eggs not yet laid there would shut
 * laying by itself.
 */
export function forageRates(col: Colony): { c: number; p: number } {
  const r = needRates(col);
  const acc = col.core?.acc;
  const plainP = Math.max(NEED_RATE_P_MIN, acc?.[FORAGE_RATE_P_KEY] ?? col.needs.rateP);
  return { c: r.c, p: plainP + (acc?.[PROSPECTIVE_P_KEY] ?? 0) };
}

export function daysOfStock(col: Colony): { c: number; p: number } {
  const r = needRates(col);
  return { c: col.stores.c / r.c, p: col.stores.p / r.p };
}

/** Target days of stock (stockTarget directive). */
export function targetDays(col: Colony): { c: number; p: number } {
  const m = STOCK_TARGET_MULT[col.directives.stockTarget] ?? 1;
  // the season's carbohydrate multiplier (autumn hoarding, R5), set by the colony cycle (economy.ts)
  const season = col.core?.acc[SEASON_STOCK_C_KEY] ?? 1;
  return { c: STOCK_TARGET_C_GD * m * season, p: STOCK_TARGET_P_GD * m };
}

/** core.acc key: the season's multiplier of the carbohydrate stock target (AUTUMN_STOCK_TARGET_C_MULT in autumn). */
export const SEASON_STOCK_C_KEY = 'stock.seasonC';

/**
 * The protein need index on the plain rates (GDD 02 §5.5 before R32b): how short the stores are of what the brood
 * and queen eat now. The shortage responses read it (the minim pupation clock, GDD 02 §2.6): eggs not yet laid are no
 * shortage of the larvae there are.
 */
export function plainNeedP(col: Colony): number {
  return clamp(1 - daysOfStock(col).p / targetDays(col).p, 0, 1);
}

/** Desired protein share sP' (GDD 02 §5.5), after diet emphasis. */
export function desiredProteinShare(col: Colony): number {
  const r = forageRates(col);
  const sP = r.p / (r.c + r.p);
  const diet = col.directives.diet;
  if (diet === 'auto') return sP;
  return clamp(sP + (DIET_SHIFT * clamp(diet, -DIET_RANGE, DIET_RANGE)) / DIET_RANGE, SP_MIN, SP_MAX);
}

export function refreshNeedIndices(col: Colony): void {
  const d = daysOfStock(col);
  const t = targetDays(col);
  col.needs.needC = clamp(1 - d.c / t.c, 0, 1);
  // protein against the forage side's stock target (R32b: the prospective demand counts)
  col.needs.needP = clamp(1 - col.stores.p / (t.p * forageRates(col).p), 0, 1);
  col.needs.sP = desiredProteinShare(col);
  col.needs.proteinDeficit = col.needs.needP >= PROTEIN_DEFICIT_NEED;
}

/**
 * Nutrient weights foragers use to score sources (GDD 02 §5.5). R35 point 3: a colony short of sugar values sugar
 * whatever its protein demand, wC = base + needC x max(1 - sP, needC) x gain (at needC 1: base + gain for any sP).
 */
export function nutrientWeights(col: Colony): { wC: number; wP: number } {
  const sP = col.needs.sP, needC = col.needs.needC;
  return {
    wC: NUTRIENT_W_BASE + needC * Math.max(1 - sP, needC) * NUTRIENT_W_GAIN,
    wP: NUTRIENT_W_BASE + col.needs.needP * sP * NUTRIENT_W_GAIN,
  };
}

/** Source value per load for this colony now: C x wC + P x wP (GDD 02 §5.5 rule 2, before quality and trip time). */
export function sourceWeight(col: Colony, cPerLoad: number, pPerLoad: number): number {
  const w = nutrientWeights(col);
  return cPerLoad * w.wC + pPerLoad * w.wP;
}

/** Probability a waiting forager accepts a recruitment lead to a source (GDD 02 §5.5 rule 4). */
export function recruitAcceptance(col: Colony, cPerLoad: number, pPerLoad: number): number {
  const w = nutrientWeights(col);
  const lead = cPerLoad * w.wC + pPerLoad * w.wP;
  return clamp(RECRUIT_ACCEPT_BASE + (RECRUIT_ACCEPT_GAIN * lead) / Math.max(w.wC, w.wP), RECRUIT_ACCEPT_BASE, 1);
}

/**
 * Loads per gd the colony should take in (GDD 02 §5.5 `intakeTarget`). `prospective` false: without R32b's prospective
 * protein demand (the allocation serves that part of the forage demand last, R35 point 5).
 */
export function intakeTarget(col: Colony, prospective = true): number {
  const r = forageRates(col);
  if (!prospective) r.p -= col.core?.acc[PROSPECTIVE_P_KEY] ?? 0;
  const t = targetDays(col);
  const s = col.stores;
  return r.c + r.p + Math.max(0, t.c * r.c - s.c) / STOCK_REFILL_GD + Math.max(0, t.p * r.p - s.p) / STOCK_REFILL_GD;
}
