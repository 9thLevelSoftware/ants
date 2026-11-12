// Derived per-ant stats from species data (GDD 07 §2.3 `deriveAntStats`). Pure.

import type { Caste, CasteDef, SpeciesDef } from '@/sim/types';
import { BITE_PER_SQRT_MG, CARRY_EXPONENT, HP_PER_SQRT_MG, MALE_HP_MULT } from '@/sim/balance';

export interface AntStats {
  lengthBu: number;
  massMg: number;
  /** Mass relative to the standard worker. */
  m: number;
  maxHp: number;
  biteDps: number;
  cropCap: number;
  carryCap: number;
}

export function casteDef(def: SpeciesDef | undefined, caste: Caste): CasteDef | undefined {
  return def?.castes.find((c) => c.caste === caste);
}

/** Stats of an individual of `caste` with body length `lengthBu`. Unknown species/caste: standard worker. */
export function deriveAntStats(def: SpeciesDef | undefined, caste: Caste, lengthBu: number): AntStats {
  const cd = casteDef(def, caste);
  const meanBu = cd ? cd.lengthBu.mean : 1;
  const casteMass = cd ? cd.casteMassMg : def ? def.stdMassMg : 1;
  const stdMass = def ? def.stdMassMg : 1;
  const ratio = lengthBu / meanBu;
  const massMg = casteMass * ratio * ratio * ratio;
  const m = massMg / stdMass;
  const hpMult = caste === 'male' ? MALE_HP_MULT : 1;
  const crop = cd && cd.cropMax !== null ? Math.min(cd.cropMax, m) : m;
  const carry = cd && cd.carryOverride !== null ? cd.carryOverride : Math.pow(m, CARRY_EXPONENT);
  return {
    lengthBu, massMg, m,
    maxHp: HP_PER_SQRT_MG * Math.sqrt(massMg) * hpMult,
    biteDps: BITE_PER_SQRT_MG * Math.sqrt(massMg) * (cd ? cd.mandibleFactor : 1),
    cropCap: crop, carryCap: carry,
  };
}
