// Ecology module API: food sources, plants and herds, creatures. STUB written by F1b/F1c with final signatures.
// Owners: sources-core (ecology/sources), ecology-plants (ecology/plants), creatures (ecology/creatures).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, CommandHandlerMap, FoodAmount, FoodKind, Sim, System, WorldData } from '@/sim/types';
import { spawnCreature, spawnSource, type EntityCtx } from '@/sim/entities';
import {
  CREATURE_DIRECTOR_EVERY, CREATURE_DIRECTOR_OFFSET, HOURLY_EVERY, PLANTS_OFFSET, SOURCES_OFFSET,
} from '@/sim/balance';

/** Source renewal, decay, carrion stages, human food. Stub: sources-core. */
export const sourcesSystem: System = {
  name: 'sources', phase: 'ecology', every: HOURLY_EVERY, offset: SOURCES_OFFSET, run: () => {},
};
/** Plant seasonal cycle, nectar, herd growth and tending. Stub: ecology-plants. */
export const plantsSystem: System = {
  name: 'plants', phase: 'ecology', every: HOURLY_EVERY, offset: PLANTS_OFFSET, run: () => {},
};
/** Spawns/despawns creatures within caps (territories). Stub: creatures. */
export const creatureDirectorSystem: System = {
  name: 'creature-director', phase: 'creatures', every: CREATURE_DIRECTOR_EVERY, offset: CREATURE_DIRECTOR_OFFSET,
  run: () => {},
};
/** Creature AI state machines. Stub: creatures. */
export const creatureSystem: System = { name: 'creatures', phase: 'creatures', run: () => {} };

export const systems: readonly System[] = [sourcesSystem, plantsSystem, creatureDirectorSystem, creatureSystem];

// ---- food sources (owner: sources-core) ----

/**
 * An ant takes up to `units` units from a source (drinking or a solid piece, slots and drink rate applied);
 * returns the nutrients taken. Stub: nothing.
 */
export function harvest(_sim: Sim, _ant: Ant, _sourceId: number, _units: number): FoodAmount {
  return { c: 0, p: 0 };
}

/**
 * Nearest live source to p within radiusMm (optionally of one kind) that the colony may use (not avoided or
 * exhausted for it); -1 none. Stub: -1.
 */
export function nearestSource(_sim: Sim, _colonyId: number, _p: Vec3, _radiusMm: number, _kind?: FoodKind): number {
  return -1;
}

/**
 * Marks a source discovered by a colony (discoveredBy bit) and emits `food-source-discovered` the first time;
 * true when newly discovered. Stub: false.
 */
export function discoverSource(_sim: Sim, _colonyId: number, _sourceId: number, _antId: number): boolean {
  return false;
}

/** Free feeding slots at a source. Stub: 0. */
export function freeSlots(_sim: Sim, _sourceId: number): number {
  return 0;
}

/**
 * Creates the initial ecology entities (sources from food anchors, plant states, herds) at New Game.
 * Stub: nothing (sources-core / ecology-plants / creatures).
 */
export function initEcology(_ctx: EntityCtx, _world: WorldData): void {}

// ---- commands owned by this module ----

const noop = (): void => {};

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.spawnCreature': (sim, c) => {
    spawnCreature(sim, { kind: c.kind, pos: c.pos, init: { variant: c.variant, state: c.state ?? 'idle' } });
  },
  'cheat.spawnFood': (sim, c) => {
    spawnSource(sim, { kind: c.kind, pos: c.pos, units: c.units, init: { variant: c.variant } });
  },
  'cheat.setHerd': noop, // owner: ecology-plants
  'cheat.spawnHerd': noop, // owner: ecology-plants
  'cheat.freezeGrowth': (sim, c) => {
    const h = sim.stores.herds.get(c.herdId);
    if (h) h.frozen = true;
  },
  'cheat.triggerBird': noop, // owner: creatures
  'cheat.triggerNestInvasion': noop, // owner: creatures
};
