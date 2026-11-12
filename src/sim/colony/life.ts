// Life-history arithmetic read from species data (GDD 02 §2-§3, GDD 07 §2): development rate, stage
// durations, larval food, metabolism factor. Pure functions.

import type { BroodStage, Caste, CasteDef, Curve, SpeciesDef } from '@/sim/types';
import {
  LARVA_C_REQ, LARVA_FOOD_MASS_EXP, LARVA_P_REQ, MET_FACTOR_MAX, MET_FACTOR_MIN, MET_Q10_SPAN_C, MET_REF_C,
  SEXUAL_STAGE_DU_MULT,
} from '@/sim/balance';

// Imported bindings are accessor reads under Vite's SSR module runner (tests, headless tools); the hot per-entity
// steps below read these module-local copies instead.
const _LARVA_C_REQ = LARVA_C_REQ;
const _LARVA_FOOD_MASS_EXP = LARVA_FOOD_MASS_EXP;
const _LARVA_P_REQ = LARVA_P_REQ;
const _MET_FACTOR_MAX = MET_FACTOR_MAX;
const _MET_FACTOR_MIN = MET_FACTOR_MIN;
const _MET_Q10_SPAN_C = MET_Q10_SPAN_C;
const _MET_REF_C = MET_REF_C;
const _SEXUAL_STAGE_DU_MULT = SEXUAL_STAGE_DU_MULT;

/** Piecewise-linear lookup of [x, y] pairs, clamped at both ends. */
export function curveAt(curve: Curve, x: number): number {
  const n = curve.length;
  if (n === 0) return 0;
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < n; i++) {
    const x1 = curve[i][0];
    if (x <= x1) {
      const x0 = curve[i - 1][0], y0 = curve[i - 1][1], y1 = curve[i][1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[n - 1][1];
}

/** Development rate r(T), development units per game day (1 DU = 1 gd at the species' reference temperature). */
export function devRate(def: SpeciesDef, tempC: number): number {
  return Math.max(0, curveAt(def.life.devRate, tempC));
}

/** Metabolic temperature factor fMet(T) (GDD 02 §1.4). */
export function fMet(tempC: number): number {
  const f = Math.pow(2, (tempC - _MET_REF_C) / _MET_Q10_SPAN_C);
  return f < _MET_FACTOR_MIN ? _MET_FACTOR_MIN : f > _MET_FACTOR_MAX ? _MET_FACTOR_MAX : f;
}

const casteCache = new WeakMap<SpeciesDef, Map<Caste, CasteDef | undefined>>();

/** Caste definition of a species (cached lookup). */
export function casteOf(def: SpeciesDef, caste: Caste): CasteDef | undefined {
  let m = casteCache.get(def);
  if (!m) { m = new Map(); casteCache.set(def, m); }
  if (!m.has(caste)) m.set(caste, def.castes.find((c) => c.caste === caste));
  return m.get(caste);
}

/** Duration of a brood stage in DU for a destined caste. */
export function stageDu(def: SpeciesDef, stage: BroodStage, destined: Caste): number {
  let du = def.life.stageGd[stage];
  const cd = casteOf(def, destined);
  if (cd) du *= cd.devMult;
  if (destined === 'gyne' || destined === 'male') du *= _SEXUAL_STAGE_DU_MULT[destined][stage];
  return du;
}

/** Food a larva needs over its whole stage, loads (GDD 02 §2.3; sexual multipliers GDD 06 §11.2). */
export function larvaFood(def: SpeciesDef, destined: Caste, destinedLengthBu: number): { c: number; p: number } {
  let mult = destinedLengthBu === 1 ? 1 : Math.pow(Math.max(0.05, destinedLengthBu), 3 * _LARVA_FOOD_MASS_EXP);
  if (destined === 'gyne') mult *= def.reproduction.sexualCostMult.gyne;
  else if (destined === 'male') mult *= def.reproduction.sexualCostMult.male;
  return { c: _LARVA_C_REQ * mult, p: _LARVA_P_REQ * mult };
}
