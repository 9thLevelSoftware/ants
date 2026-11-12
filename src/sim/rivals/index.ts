// Rival colonies: abstract populations (Colony.rival), fielded agents, territory, relations, raids.
// STUB written by F1b/F1c; owner: rivals. Rival-only species data: src/sim/species/rivals.ts (ruling 5).

import type { CommandHandlerMap, RelationState, Sim, System, WorldData } from '@/sim/types';
import type { EntityCtx } from '@/sim/entities';
import { HOURLY_EVERY, RIVALS_OFFSET } from '@/sim/balance';

/** Abstract colony model, fielding, territory marks, escalation. Stub: rivals. */
export const rivalsSystem: System = {
  name: 'rivals', phase: 'rivals', every: HOURLY_EVERY, offset: RIVALS_OFFSET, run: () => {},
};

export const systems: readonly System[] = [rivalsSystem];

/** Relation between two colonies. Stub: 'peace'. */
export function relationOf(_sim: Sim, _a: number, _b: number): RelationState {
  return 'peace';
}

/** Whether ants of these colonies attack each other on contact. Stub: false. */
export function isHostile(_sim: Sim, _a: number, _b: number): boolean {
  return false;
}

/** Creates rival colonies (abstract) and their nests from the world's rival sites at New Game. Stub: none. */
export function initRivals(_ctx: EntityCtx, _world: WorldData): void {}

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.setRival': () => {}, // owner: rivals
  'cheat.setRelation': () => {}, // owner: rivals
  'cheat.triggerRaid': () => {}, // owner: rivals
};
