// Ecology module API: food sources, plants and herds, creatures. STUB written by F1b/F1c with final signatures.
// Owners: sources-core (ecology/sources), ecology-plants (ecology/plants), creatures (ecology/creatures).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, CarrionStage, CommandHandlerMap, FoodAmount, FoodKind, Sim, System, WorldData } from '@/sim/types';
import { CARRION_STAGES } from '@/sim/types';
import { type EntityCtx } from '@/sim/entities';
import { creatureDirectorSystem, creatureSystem, commandHandlers as creatureCommands } from './creatures';
import {
  createSource, defaultVariant, discoverSource as discoverSourceImpl, freeSlotsOf, initSources,
  nearestSource as nearestSourceImpl, sourceDef, sourcesSystem, takeFromSource, type SourceFilter,
} from './sources';
import { herdTendingSystem, initPlants, plantCommandHandlers, plantsSystem, tendDemandSystem } from './plants';

// Source-related API (owner: sources-core). The full API lives in ./sources (re-exported below).
export * from './sources';
export { sourcesSystem };
// Plants, herds, nectar (owner: ecology-plants): systems and the public API from ./plants.
export * from './plants';
// Creatures (owner: creatures): systems and the public API from ./creatures.
export { creatureDirectorSystem, creatureSystem };
export {
  threatsNear, preyNear, knownHazardsNear, creatureArmour, creaturePull, addStruggleInput, isSeized, requestMajorThreat,
  endMajorThreat, canStartMajorThreat, quietShare, dangerAt, addDanger, transportMode, preyRemains, arriveAtHerd, herdSite,
  startBird, triggerBird, isExposedAnt, CreatureFlag, capOf, isEngaged, spawnCreatureOfKind, noteCreatureHit, preyEvades,
  creatureKilled, creatureCounts, type ThreatInfo, type PreyInfo, type TransportMode, type DeadPrey, type HitKind,
} from './creatures';

export const systems: readonly System[] = [
  sourcesSystem, plantsSystem, herdTendingSystem, tendDemandSystem, creatureDirectorSystem, creatureSystem,
];

// ---- food sources (owner: sources-core) ----

/**
 * An ant takes up to `units` from a source (drinking or a solid piece, slots and drink rate applied); returns the
 * nutrients taken. Liquids: `units` = game seconds of drinking; pick sources: whole units; tear sources: one piece.
 * takeFromSource gives the full result (status, toxin, water, item id, depletion).
 */
export function harvest(sim: Sim, ant: Ant, sourceId: number, units: number): FoodAmount {
  const r = takeFromSource(sim, ant, sourceId, units);
  return { c: r.c, p: r.p };
}

/**
 * Nearest live source to p within radiusMm (optionally of one kind) that the colony may use (in season, not
 * empty, not avoided or exhausted for it); -1 none. `filter` (additive) narrows it further.
 */
export function nearestSource(sim: Sim, colonyId: number, p: Vec3, radiusMm: number, kind?: FoodKind, filter?: SourceFilter): number {
  return nearestSourceImpl(sim, colonyId, p, radiusMm, kind, filter);
}

/**
 * Marks a source discovered by a colony (discoveredBy bit) and emits `food-source-discovered` the first time;
 * true when newly discovered.
 */
export function discoverSource(sim: Sim, colonyId: number, sourceId: number, antId: number): boolean {
  return discoverSourceImpl(sim, colonyId, sourceId, antId);
}

/** Free feeding slots at a source (0 for a missing source). */
export function freeSlots(sim: Sim, sourceId: number): number {
  const s = sim.stores.sources.get(sourceId);
  return s ? freeSlotsOf(sim, s) : 0;
}

/**
 * Creates the initial ecology entities (sources from food anchors, plant states, herds) at New Game.
 * Sources: sources-core; plant states and herds: ecology-plants; creatures: creatures.
 */
export function initEcology(ctx: EntityCtx, world: WorldData): void {
  initSources(ctx, world);
  initPlants(ctx, world);
}

// ---- commands owned by this module ----

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.spawnCreature': creatureCommands['cheat.spawnCreature'], // owner: creatures
  'cheat.spawnFood': (sim, c) => {
    const variant = c.variant ?? defaultVariant(c.kind);
    if (!variant || sourceDef(variant).kind !== c.kind) {
      sim.emit({ type: 'command-rejected', commandType: c.type, reason: 'unknown food variant' });
      return;
    }
    const stage = (CARRION_STAGES as readonly string[]).includes(c.stage ?? '') ? (c.stage as CarrionStage) : undefined;
    createSource(sim, { variant, pos: c.pos, units: c.units > 0 ? c.units : undefined, stage, tier: stage ? 2 : undefined });
  },
  'cheat.setHerd': plantCommandHandlers['cheat.setHerd'], // owner: ecology-plants
  'cheat.spawnHerd': plantCommandHandlers['cheat.spawnHerd'], // owner: ecology-plants
  'cheat.freezeGrowth': plantCommandHandlers['cheat.freezeGrowth'], // owner: ecology-plants
  'cheat.triggerBird': creatureCommands['cheat.triggerBird'], // owner: creatures
  'cheat.triggerNestInvasion': creatureCommands['cheat.triggerNestInvasion'], // owner: creatures
};
