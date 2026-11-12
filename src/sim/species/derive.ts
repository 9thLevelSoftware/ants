// Derived ant stats from species data (GDD 07 §2.3, GDD 05 §4.1). Pure functions of a caste's mass and traits; the
// same formulas serve every species, so a Lasius worker and an Atta major fight on one scale.
//
//   massMg    = casteMassMg x (lengthBu / casteMeanBu)^3
//   m         = massMg / stdMassMg
//   maxHp     = HP_PER_MG23 x massMg^(2/3)                       (queens, gynes, males: fixed table values)
//   bite      = BITE_PER_MG23 x massMg^(2/3) x mandibleFactor    (damage per 1.0 s strike)
//   cropCap   = min(caste cropMax, m)
//   carryCap  = m^CARRY_EXPONENT, or the caste override
//   upkeep    = MET_RATE_C x m^MET_MASS_EXP                      (queens, gynes, males: explicit)
//   passage   = 0.45 x lengthBu (x 1.15 for macrocephalic majors)
//   larval cost  P = 1.2 x m^0.8, C = 0.4 x m^0.8                (Atta: FL = 1.6 x m^0.8)

import type { Caste, CasteDef, SpeciesDef } from '@/sim/types';
import {
  BITE_PER_MG23, CARRY_EXPONENT, EGG_COST_P, HP_PER_MG23, LARVA_C_REQ, LARVA_FOOD_MASS_EXP, LARVA_P_REQ, MET_MASS_EXP,
  MET_RATE_C,
} from '@/sim/balance';

/** Narrowest opening an ant passes, as a fraction of its length (GDD 07 §2.3 `minPassageBu`). */
export const PASSAGE_PER_LENGTH = 0.45;
/** Extra passage factor of macrocephalic majors (large heads). */
export const PASSAGE_MACROCEPHALIC_MULT = 1.15;

export interface DerivedAntStats {
  /** Body length, BU of the species. */
  lengthBu: number;
  massMg: number;
  /** Mass relative to the standard worker of the species. */
  m: number;
  maxHp: number;
  /** Damage per strike (1.0 s bite cycle). */
  bite: number;
  cropCap: number;
  carryCap: number;
  /** AI cruise speed, mm/s (before temperature and load). */
  cruiseMmS: number;
}

/** The caste's definition in a species, or undefined. */
export function findCaste(def: SpeciesDef | undefined, caste: Caste): CasteDef | undefined {
  return def?.castes.find((c) => c.caste === caste);
}

/** Mass of an individual of body length `lengthBu` in a caste whose mean is `meanBu` at `casteMassMg` (cube law). */
export function massAtLength(casteMassMg: number, lengthBu: number, meanBu: number): number {
  const r = lengthBu / meanBu;
  return casteMassMg * r * r * r;
}

/** Hit points of a worker-caste ant of this mass. */
export function maxHpOfMass(massMg: number): number {
  return HP_PER_MG23 * Math.pow(massMg, 2 / 3);
}

/** Damage per strike of a worker-caste ant of this mass and mandible factor. */
export function biteOfMass(massMg: number, mandibleFactor: number): number {
  return BITE_PER_MG23 * Math.pow(massMg, 2 / 3) * mandibleFactor;
}

/** Crop capacity, loads: the caste cap (null = none) or the relative mass, whichever is smaller. */
export function cropCapOf(m: number, cropMax: number | null): number {
  return cropMax !== null ? Math.min(cropMax, m) : m;
}

/** Carry capacity, loads of item bulk: the caste override, or `m^0.6` (small ants carry relatively more). */
export function carryCapOf(m: number, carryOverride: number | null): number {
  return carryOverride !== null ? carryOverride : Math.pow(m, CARRY_EXPONENT);
}

/** Resting upkeep of a worker-caste ant, C loads per GD (queens, gynes, males use the caste override). */
export function upkeepRestOf(m: number): number {
  return MET_RATE_C['met-rest'] * Math.pow(m, MET_MASS_EXP);
}

/** Active upkeep of a worker-caste ant, C loads per GD. */
export function upkeepActiveOf(m: number): number {
  return MET_RATE_C['met-active'] * Math.pow(m, MET_MASS_EXP);
}

/** Upkeep (rest, active) of a caste at relative mass `m`: explicit values for queens, gynes and males. */
export function upkeepOfCaste(cd: CasteDef, m: number): { restC: number; activeC: number; p: number } {
  return cd.upkeepOverride ?? { restC: upkeepRestOf(m), activeC: upkeepActiveOf(m), p: 0 };
}

/** Narrowest opening an ant of this length passes, BU. */
export function minPassageBu(lengthBu: number, macrocephalic: boolean): number {
  return PASSAGE_PER_LENGTH * lengthBu * (macrocephalic ? PASSAGE_MACROCEPHALIC_MULT : 1);
}

/** Food a larva destined to relative mass `m` needs to pupate: P and C loads (Atta: the sum is the FL need). */
export function larvalCost(m: number): { p: number; c: number } {
  const k = Math.pow(m, LARVA_FOOD_MASS_EXP);
  return { p: LARVA_P_REQ * k, c: LARVA_C_REQ * k };
}

/** Cost of one egg in protein loads (GDD 07 §2.3; Atta pays 0.03 FL, see its fungus-garden block). */
export function eggCostP(): number {
  return EGG_COST_P;
}

/**
 * Stats of an individual of a playable species with body length `lengthBu` (species BU). Unknown caste: the
 * standard worker formulas. `founding` selects the founding queen's hit points for fixed-stat castes.
 */
export function deriveAntStats(def: SpeciesDef | undefined, caste: Caste, lengthBu: number, founding = false): DerivedAntStats {
  const cd = findCaste(def, caste);
  const meanBu = cd ? cd.lengthBu.mean : 1;
  const casteMass = cd ? cd.casteMassMg : def ? def.stdMassMg : 1;
  const stdMass = def ? def.stdMassMg : 1;
  const massMg = massAtLength(casteMass, lengthBu, meanBu);
  const m = massMg / stdMass;
  const fixed = cd?.fixedStats ?? null;
  const maxHp = fixed ? (founding && fixed.foundingMaxHp !== null ? fixed.foundingMaxHp : fixed.maxHp) : maxHpOfMass(massMg);
  const bite = fixed ? fixed.bite : biteOfMass(massMg, cd ? cd.mandibleFactor : 1);
  const cruiseBu = def ? def.cruiseBuS * (cd ? cd.cruiseMult : 1) : 0;
  return {
    lengthBu, massMg, m, maxHp, bite,
    cropCap: cd ? cropCapOf(m, cd.cropMax) : m,
    carryCap: cd ? carryCapOf(m, cd.carryOverride) : Math.pow(m, CARRY_EXPONENT),
    cruiseMmS: cruiseBu * (def ? def.buMm : 0),
  };
}
