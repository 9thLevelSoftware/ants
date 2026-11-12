// Ecology module API: food sources, plants and herds, creatures. STUB written by F1b.
// Owners: sources-core (ecology/sources), ecology-plants (ecology/plants), creatures (ecology/creatures).

import type { Ant, FoodAmount, Sim, System, WorldData } from '@/sim/types';
import type { EntityCtx } from '@/sim/entities';
import {
  CREATURE_DIRECTOR_EVERY, CREATURE_DIRECTOR_OFFSET, HOURLY_EVERY, PLANTS_OFFSET, SOURCES_OFFSET,
} from '@/sim/balance';

/** Source renewal, decay, carrion stages, human food. Stub: sources-core. */
export const sourcesSystem: System = { name: 'sources', every: HOURLY_EVERY, offset: SOURCES_OFFSET, run: () => {} };
/** Plant seasonal cycle, nectar, herd growth and tending. Stub: ecology-plants. */
export const plantsSystem: System = { name: 'plants', every: HOURLY_EVERY, offset: PLANTS_OFFSET, run: () => {} };
/** Spawns/despawns creatures within caps (territories). Stub: creatures. */
export const creatureDirectorSystem: System = {
  name: 'creature-director', every: CREATURE_DIRECTOR_EVERY, offset: CREATURE_DIRECTOR_OFFSET, run: () => {},
};
/** Creature AI state machines. Stub: creatures. */
export const creatureSystem: System = { name: 'creatures', run: () => {} };

/** An ant takes up to `amount` units from a source; returns nutrients taken. Stub: nothing (sources-core). */
export function harvestSource(_sim: Sim, _ant: Ant, _sourceId: number, _amount: number): FoodAmount {
  return { c: 0, p: 0 };
}

/** Free feeding slots at a source. Stub: 0 (sources-core). */
export function freeSlots(_sim: Sim, _sourceId: number): number {
  return 0;
}

/** Creates the initial ecology entities (sources from food anchors, plant states, herds) at New Game.
 * Stub: nothing (sources-core / ecology-plants / creatures). */
export function initEcology(_ctx: EntityCtx, _world: WorldData): void {}
