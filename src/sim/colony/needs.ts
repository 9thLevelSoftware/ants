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
  rateP: number;
}

/** Updates the need-rate EMAs with dtGd of new data and recomputes needC, needP and the protein share. */
export function updateNeeds(col: Colony, inst: NeedInputs, dtGd: number): void {
  const n = col.needs;
  const k = 1 - Math.exp(-dtGd / NEED_EMA_GD);
  // A never-updated colony starts from the first sample instead of from 0.
  if (n.rateC <= 0) n.rateC = inst.rateC;
  else n.rateC += (inst.rateC - n.rateC) * k;
  if (n.rateP <= 0) n.rateP = inst.rateP;
  else n.rateP += (inst.rateP - n.rateP) * k;
  refreshNeedIndices(col);
}

/** Need rates with their floors (GDD 02 §5.5), loads/gd. */
export function needRates(col: Colony): { c: number; p: number } {
  return { c: Math.max(NEED_RATE_C_MIN, col.needs.rateC), p: Math.max(NEED_RATE_P_MIN, col.needs.rateP) };
}

export function daysOfStock(col: Colony): { c: number; p: number } {
  const r = needRates(col);
  return { c: col.stores.c / r.c, p: col.stores.p / r.p };
}

/** Target days of stock (stockTarget directive). */
export function targetDays(col: Colony): { c: number; p: number } {
  const m = STOCK_TARGET_MULT[col.directives.stockTarget] ?? 1;
  return { c: STOCK_TARGET_C_GD * m, p: STOCK_TARGET_P_GD * m };
}

/** Desired protein share sP' (GDD 02 §5.5), after diet emphasis. */
export function desiredProteinShare(col: Colony): number {
  const r = needRates(col);
  const sP = r.p / (r.c + r.p);
  const diet = col.directives.diet;
  if (diet === 'auto') return sP;
  return clamp(sP + (DIET_SHIFT * clamp(diet, -DIET_RANGE, DIET_RANGE)) / DIET_RANGE, SP_MIN, SP_MAX);
}

export function refreshNeedIndices(col: Colony): void {
  const d = daysOfStock(col);
  const t = targetDays(col);
  col.needs.needC = clamp(1 - d.c / t.c, 0, 1);
  col.needs.needP = clamp(1 - d.p / t.p, 0, 1);
  col.needs.sP = desiredProteinShare(col);
  col.needs.proteinDeficit = col.needs.needP >= PROTEIN_DEFICIT_NEED;
}

/** Nutrient weights foragers use to score sources (GDD 02 §5.5). */
export function nutrientWeights(col: Colony): { wC: number; wP: number } {
  const sP = col.needs.sP;
  return {
    wC: NUTRIENT_W_BASE + col.needs.needC * (1 - sP) * NUTRIENT_W_GAIN,
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

/** Loads per gd the colony should take in (GDD 02 §5.5 `intakeTarget`). */
export function intakeTarget(col: Colony): number {
  const r = needRates(col);
  const t = targetDays(col);
  const s = col.stores;
  return r.c + r.p + Math.max(0, t.c * r.c - s.c) / STOCK_REFILL_GD + Math.max(0, t.p * r.p - s.p) / STOCK_REFILL_GD;
}
