// The living layer of the generated world (task worldgen-life; GDD 04 §6.3, §8, §12.5; GDD 05 §0-§3), registered
// with the pipeline through the kit (src/worldgen/kit/README.md):
//   resources (7): micro-connection guarantee, plant hosts, provisional start, food anchors, creature territories
//   rivals (8):    established and incipient rival sites
//   start (10):    after the start placer (maps/start.ts): prune unreachable anchors, food guarantees
// The repairs of GDD 04 §4.3 that touch this content (R3 food) live in validate/repair.ts.

import type { WorldgenModule } from '../kit/registry';
import { placeProvisionalStart } from '../maps/start';
import { ensureMicro } from './microGuarantee';
import { assignHosts, finishHosts } from './hosts';
import { placeFood } from './food';
import { placeTerritories } from './territories';
import { placeRivals } from './rivals';
import { finalizeFood } from './finalize';

export const worldgen: WorldgenModule = {
  placers: [
    { id: 'populate/micro', step: 'resources', order: -40, provides: ['micro'], run: ensureMicro },
    { id: 'populate/hosts', step: 'resources', order: -30, run: assignHosts },
    { id: 'populate/provisional-start', step: 'resources', order: -20, run: (ctx) => { placeProvisionalStart(ctx); } },
    { id: 'populate/food', step: 'resources', order: 0, provides: ['food'], run: (ctx) => { placeFood(ctx); finishHosts(ctx); } },
    { id: 'populate/territories', step: 'resources', order: 10, run: placeTerritories },
    { id: 'populate/rivals', step: 'rivals', order: 0, provides: ['rivals'], run: placeRivals },
    { id: 'populate/food-guarantees', step: 'start', order: 100, run: finalizeFood },
  ],
};

export { foodReport } from './finalize';
export { dayOffer, sourceVariant } from './economy';
