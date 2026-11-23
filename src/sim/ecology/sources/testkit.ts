// Test support for the sources module (no vitest import: this file is checked by the layering test as sim code).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, ActionId, FoodAnchor, GameConfig, Sim, WorldData } from '@/sim/types';
import { spawnAnt } from '@/sim/entities';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { makeSourcesSystem, sourcesSystem } from './system';

export interface SourceSimOptions {
  anchors?: Omit<FoodAnchor, 'id'>[];
  world?: WorldData;
  config?: Partial<GameConfig>;
  sizeBu?: number;
  /** Ecology rules tier of the sources made from anchors and of the sources system (default ECOLOGY_TIER). */
  tier?: number;
}

/** A test sim running only the sources system; the world may carry food anchors. */
export function makeSourceSim(o: SourceSimOptions = {}): Sim {
  const world = o.world ?? makeTestWorld({ sizeBu: o.sizeBu ?? 256 });
  if (o.anchors) world.placements.foodAnchors = o.anchors.map((a, i) => ({ ...a, id: i }));
  const systems = [o.tier === undefined ? sourcesSystem : makeSourcesSystem(o.tier)];
  const sim = makeTestSim({ world, systems, config: o.config, ecologyTier: o.tier });
  sim.index.refresh();
  return sim;
}

/** An anchor on flat ground. */
export function anchor(kind: FoodAnchor['kind'], x: number, z: number, initialState = 'full', seasonMask = 15): Omit<FoodAnchor, 'id'> {
  return { kind, pos: { x, y: 0, z }, up: { x: 0, y: 1, z: 0 }, hostObjectId: -1, seasonMask, initialState };
}

/** A worker of the player colony at pos. */
export function addWorker(sim: Sim, pos: Vec3): Ant {
  const ant = spawnAnt(sim, { colony: sim.state.player.colonyId, caste: 'worker', pos, task: 'forage' });
  sim.index.refresh();
  return ant;
}

/** Fakes the actions module: the ant runs `actionId` on the source since `startTick`. */
export function fakeAction(ant: Ant, actionId: ActionId, sourceId: number, pos: Vec3, startTick: number): void {
  ant.action = {
    id: actionId, phase: 'active', startTick, durationTicks: 0, target: { kind: 'source', id: sourceId, pos: { ...pos } },
    repeat: true, secondary: false, reason: null,
  };
}

/** Advances the sim by n ticks. */
export function stepTicks(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

/** Centre of the test world. */
export function centre(sim: Sim): Vec3 {
  return { x: sim.world.size / 2, y: 0, z: sim.world.size / 2 };
}
