// Species economy modules (GDD 07 §6): one folder each, owned by its species task. This file only lists them in a
// fixed order for the composition roots (systems.ts, commands.ts); module owners never need to edit it.

import * as fungus from './fungus';
import * as granary from './granary';
import * as honeydew from './honeydew';
import * as wood from './wood';

export const SPECIES_MODULES = [
  { key: 'species-honeydew', mod: honeydew },
  { key: 'species-wood', mod: wood },
  { key: 'species-granary', mod: granary },
  { key: 'species-fungus', mod: fungus },
] as const;
