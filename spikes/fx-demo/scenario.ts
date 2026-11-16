// The fx demo's scene (pure sim, no three): a real new game on the test world (createNewGame through makeTestSim),
// the standard small nest with workers, a climbable wall west of the nest and a sugar spill on top of it, a carrion
// item on the open ground. The colony's own foragers find the food and lay the trail: nothing here deposits
// pheromone. Also used by the scent-view tests in src/render/fx/scent (a real trail to draw).
import type { Colony, Entrance, FoodSource, Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';

export interface FxScenario {
  sim: Sim;
  colony: Colony;
  entrance: Entrance;
  /** Sugar on the wall top, carrion on the ground. */
  wallFood: FoodSource;
  groundFood: FoodSource;
  /** The wall primitive's centre and half sizes, mm. */
  wall: { x: number; z: number; top: number; halfThick: number; halfLength: number };
}

/** World edge, BU (the test wall sits at 0.2 of it, west of the nest). */
const SIZE_BU = 128;
const WORKERS = 40;

export function fxScenario(seed = 1, workers = WORKERS): FxScenario {
  const config = { startSeason: 'summer' as const, startDayOfSeason: 1, startHour: 8 };
  const sim = makeTestSim({ sizeBu: SIZE_BU, features: ['wall'], nest: 'small', workers, seed, config });
  const colony = sim.state.colonies[0];
  const nest = sim.stores.nests.get(colony.nestIds[0])!;
  const entrance = nest.entrances[0];
  const wp = sim.world.prims.find((p) => p.material === 'plaster' && p.shape === 'box')!;
  const wall = { x: wp.pos.x, z: wp.pos.z, top: wp.pos.y + wp.size.y, halfThick: wp.size.x, halfLength: wp.size.z };
  sim.enqueue({ type: 'cheat.addFood', colonyId: colony.id, c: 2, p: 0.4, toxin: 0 });
  sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: { x: wall.x, y: wall.top, z: wall.z + 4 * sim.world.bu }, units: 400, stage: null });
  const gx = entrance.pos.x + 6 * sim.world.bu, gz = entrance.pos.z + 34 * sim.world.bu;
  sim.enqueue({ type: 'cheat.spawnFood', kind: 'carrion', variant: 'insect-medium', pos: { x: gx, y: sim.field.height(gx, gz), z: gz }, units: 1, stage: null });
  const before = sim.state.sources.length;
  sim.applyPendingCommands();
  const made = sim.state.sources.slice(before);
  const wallFood = made.find((s) => s.kind === 'sugar') ?? sim.state.sources.find((s) => s.kind === 'sugar')!;
  const groundFood = made.find((s) => s.kind === 'carrion') ?? sim.state.sources.find((s) => s.kind === 'carrion')!;
  return { sim, colony, entrance, wallFood, groundFood, wall };
}

/** Advances the sim n ticks. */
export function runTicks(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}
