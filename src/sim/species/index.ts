// Species data entry point: registers the built-in species definitions on import.
// The species-data task adds the other three playable species here. Economy modules live in ./modules.

import { registerRivalSpecies, registerSpecies } from './registry';
import { LASIUS_NIGER } from './data/lasius-niger';
import { RIVAL_SPECIES } from './rivals';

registerSpecies(LASIUS_NIGER);
for (const r of RIVAL_SPECIES) registerRivalSpecies(r);

export {
  getRivalSpecies, getSpecies, isRivalOnly, listRivalSpecies, listSpecies, registerRivalSpecies, registerSpecies,
  requireSpecies,
} from './registry';
export { LASIUS_NIGER } from './data/lasius-niger';
export { RIVAL_SPECIES } from './rivals';
