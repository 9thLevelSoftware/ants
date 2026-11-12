// Species data entry point: validates and registers the four playable species and the rival-only definitions on
// import. Economy modules live in ./modules. Validation (GDD 07 §3.16) runs here, so a broken definition fails at
// startup in the game, in the headless tools and in every test that imports the registry.

import { registerRivalSpecies, registerSpecies } from './registry';
import { assertValidSpecies } from './validate';
import { LASIUS_NIGER } from './data/lasius-niger';
import { CAMPONOTUS_PENNSYLVANICUS } from './data/camponotus-pennsylvanicus';
import { MESSOR_BARBARUS } from './data/messor-barbarus';
import { ATTA_TEXANA } from './data/atta-texana';
import { RIVAL_SPECIES } from './rivals';

/** The four playable species in roster order (GDD 07 §1: build and release order). */
export const PLAYABLE_SPECIES = [LASIUS_NIGER, CAMPONOTUS_PENNSYLVANICUS, MESSOR_BARBARUS, ATTA_TEXANA] as const;

for (const def of PLAYABLE_SPECIES) {
  assertValidSpecies(def);
  registerSpecies(def);
}
for (const r of RIVAL_SPECIES) registerRivalSpecies(r);

export {
  getRivalSpecies, getSpecies, isRivalOnly, listRivalSpecies, listSpecies, registerRivalSpecies, registerSpecies,
  requireSpecies,
} from './registry';
export { LASIUS_NIGER } from './data/lasius-niger';
export { CAMPONOTUS_PENNSYLVANICUS } from './data/camponotus-pennsylvanicus';
export { MESSOR_BARBARUS } from './data/messor-barbarus';
export { ATTA_TEXANA } from './data/atta-texana';
export { RIVAL_SPECIES } from './rivals';
export { assertValidSpecies, SpeciesValidationError, validateSpecies, type ValidationIssue } from './validate';
export {
  carryCapOf, cropCapOf, deriveAntStats, entranceCapOf, eggCostP, larvalCost, massAtLength, maxHpOfMass, minPassageBu, biteOfMass,
  upkeepActiveOf, upkeepOfCaste, upkeepRestOf, type DerivedAntStats,
} from './derive';
