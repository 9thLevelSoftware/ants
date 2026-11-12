// Species data entry point: registers the built-in species definitions on import.
// The species-data task adds the other three species here.

import { registerSpecies } from './registry';
import { LASIUS_NIGER } from './data/lasius-niger';

registerSpecies(LASIUS_NIGER);

export { getSpecies, listSpecies, registerSpecies, requireSpecies } from './registry';
export { LASIUS_NIGER } from './data/lasius-niger';
