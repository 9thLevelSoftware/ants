// Outdoor content of the generated world (GDD 04 §4.2 steps 3-5): registered placers, large structures first.
// Discovered by the pipeline (kit/registry.ts). Order inside `structures`: map-edge fences and walls, asphalt
// groundwork (basins, tree pits, kerbs, gullies), paving, asphalt furniture (bays, posts, cracks), playground,
// garden structures, trees; then props, then plants and the decor descriptors.

import type { WorldgenModule } from '../../kit/registry';
import { placeEdges } from './edges';
import { placeAsphaltAfter, placeAsphaltBefore } from './asphalt';
import { placePaving } from './paving';
import { placePlayground } from './playground';
import { placeGarden } from './garden';
import { placeTrees } from './trees';
import { placeProps } from './props';
import { placePlants } from './plants';
import { placeDecor } from './decor';

export const worldgen: WorldgenModule = {
  placers: [
    { id: 'outdoor/edges', step: 'structures', order: 10, run: placeEdges },
    { id: 'outdoor/asphalt-ground', step: 'structures', order: 15, run: placeAsphaltBefore },
    { id: 'outdoor/paving', step: 'structures', order: 20, run: placePaving },
    { id: 'outdoor/asphalt-furniture', step: 'structures', order: 30, run: placeAsphaltAfter },
    { id: 'outdoor/playground', step: 'structures', order: 40, run: placePlayground },
    { id: 'outdoor/garden', step: 'structures', order: 50, run: placeGarden },
    { id: 'outdoor/trees', step: 'structures', order: 60, run: placeTrees },
    { id: 'outdoor/props', step: 'props', order: 10, provides: ['props'], run: placeProps },
    { id: 'outdoor/plants', step: 'plants', order: 10, provides: ['plants'], run: placePlants },
    { id: 'outdoor/decor', step: 'plants', order: 100, run: placeDecor },
  ],
};
