// Per-ant stats from species data (GDD 07 §2.3 `deriveAntStats`, GDD 05 §4.1 combat formulas; D2.26).
// One entry point for every species (ruling 5): getAntStats() reads the full SpeciesDef of playable species and
// the light RivalSpeciesDef of rival-only species. Pure.

import type { Caste, CasteDef, ColonySpeciesId, RivalSpeciesDef, SpeciesDef } from '@/sim/types';
import { BITE_PER_MG23, CARRY_EXPONENT, HP_PER_MG23 } from '@/sim/balance';
import { getRivalSpecies, getSpecies } from '@/sim/species';
import { worldBu, type EntityCtx } from './context';

export interface AntStats {
  /** Body length, BU of this world. */
  lengthBu: number;
  massMg: number;
  /** Mass relative to the standard worker of its species. */
  m: number;
  maxHp: number;
  /** Damage per strike (1.0 s bite cycle). */
  bite: number;
  cropCap: number;
  carryCap: number;
  /** AI cruise speed, mm/s (before temperature and load). */
  cruiseMmS: number;
}

export function casteDef(def: SpeciesDef | undefined, caste: Caste): CasteDef | undefined {
  return def?.castes.find((c) => c.caste === caste);
}

const mg23 = (mg: number): number => Math.pow(mg, 2 / 3);

/**
 * Stats of an individual of a playable species with body length `lengthBu` (species BU). Unknown caste: the
 * standard worker formula. `founding` selects the founding-queen hp of fixed-stat castes.
 */
export function deriveAntStats(def: SpeciesDef | undefined, caste: Caste, lengthBu: number, founding = false): AntStats {
  const cd = casteDef(def, caste);
  const meanBu = cd ? cd.lengthBu.mean : 1;
  const casteMass = cd ? cd.casteMassMg : def ? def.stdMassMg : 1;
  const stdMass = def ? def.stdMassMg : 1;
  const ratio = lengthBu / meanBu;
  const massMg = casteMass * ratio * ratio * ratio;
  const m = massMg / stdMass;
  const fixed = cd?.fixedStats ?? null;
  const maxHp = fixed ? (founding && fixed.foundingMaxHp !== null ? fixed.foundingMaxHp : fixed.maxHp) : HP_PER_MG23 * mg23(massMg);
  const bite = fixed ? fixed.bite : BITE_PER_MG23 * mg23(massMg) * (cd ? cd.mandibleFactor : 1);
  const crop = cd && cd.cropMax !== null ? Math.min(cd.cropMax, m) : m;
  const carry = cd && cd.carryOverride !== null ? cd.carryOverride : Math.pow(m, CARRY_EXPONENT);
  const cruiseBu = def ? def.cruiseBuS * (cd ? cd.cruiseMult : 1) : 0;
  return {
    lengthBu, massMg, m, maxHp, bite, cropCap: crop, carryCap: carry, cruiseMmS: cruiseBu * (def ? def.buMm : 0),
  };
}

/** Stats of a rival-only species' worker or queen (other castes use the worker values). Lengths in world BU. */
function rivalStats(def: RivalSpeciesDef, caste: Caste, bu: number): AntStats {
  const isQueen = caste === 'queen';
  return {
    lengthBu: def.workerMm / bu, massMg: def.workerMassMg, m: 1,
    maxHp: isQueen ? def.queenHp : def.maxHp, bite: isQueen ? def.queenBite : def.bite,
    cropCap: isQueen ? 0 : 1, carryCap: isQueen ? 0 : 1, cruiseMmS: isQueen ? 0 : def.cruiseMmS,
  };
}

/**
 * Stats for a new ant of any species and caste (ruling 5). `lengthBu` is in the SPECIES' own BU for playable species
 * (defaults to the caste mean); rival-only species have one worker size. Returned lengthBu is in world BU.
 */
export function getAntStats(
  ctx: EntityCtx, speciesId: ColonySpeciesId, caste: Caste, lengthBu?: number, founding = false,
): AntStats {
  const def = getSpecies(speciesId);
  const bu = worldBu(ctx);
  if (def) {
    const own = lengthBu ?? casteDef(def, caste)?.lengthBu.mean ?? 1;
    const s = deriveAntStats(def, caste, own, founding);
    return { ...s, lengthBu: (own * def.buMm) / bu };
  }
  const rival = getRivalSpecies(speciesId);
  if (rival) return rivalStats(rival, caste, bu);
  return deriveAntStats(undefined, caste, lengthBu ?? 1, founding);
}
