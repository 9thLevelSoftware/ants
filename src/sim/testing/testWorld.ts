// Small deterministic worlds and sims for module tests (no full world generation).
//
//   const world = makeTestWorld({ sizeBu: 128, terrain: 'noise', prims: 3 });
//   const sim = makeTestSim({ world, systems: [mySystem] });

import { fbm2 } from '@/core/math/noise';
import { rngFork, rngRange } from '@/core/rng';
import type { GameConfig, Primitive, SpeciesId, System, Sim, WorldData } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { requireSpecies } from '@/sim/species';
import { defaultWorldParams } from '@/worldgen';
import { buildWorld } from './worldBuilder';

/** Default test world edge, BU. */
const TEST_SIZE_BU = 128;
/** Noise terrain of the test world: amplitude and feature size, BU. */
const TEST_NOISE_AMP_BU = 2;
const TEST_NOISE_SCALE_BU = 40;
/** Random test rocks: radius range, BU. */
const TEST_ROCK_MIN_BU = 2;
const TEST_ROCK_MAX_BU = 6;

export interface TestWorldOptions {
  /** World edge, BU (default 128). */
  sizeBu?: number;
  species?: SpeciesId;
  terrain?: 'flat' | 'noise';
  seed?: number;
  /** Explicit primitives, or a count of random stone ellipsoids. */
  prims?: Primitive[] | number;
}

function randomRocks(n: number, seed: number, size: number, bu: number, height: (x: number, z: number) => number): Primitive[] {
  const rng = rngFork(seed, 'test-rocks');
  const out: Primitive[] = [];
  for (let i = 0; i < n; i++) {
    const r = rngRange(rng, TEST_ROCK_MIN_BU, TEST_ROCK_MAX_BU) * bu;
    const x = rngRange(rng, 0.2, 0.8) * size, z = rngRange(rng, 0.2, 0.8) * size;
    out.push({
      id: i + 1, shape: 'ellipsoid', pos: { x, y: height(x, z), z }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: r, y: r * 0.5, z: r * 0.8 }, round: 0, material: 'stone', flags: PrimFlag.CLIMBABLE | PrimFlag.SHELTER,
      objectId: -1,
    });
  }
  return out;
}

export function makeTestWorld(opts: TestWorldOptions = {}): WorldData {
  const species = opts.species ?? 'lasius-niger';
  const seed = opts.seed ?? 1;
  const bu = requireSpecies(species).buMm;
  const size = (opts.sizeBu ?? TEST_SIZE_BU) * bu;
  const amp = TEST_NOISE_AMP_BU * bu;
  const inv = 1 / (TEST_NOISE_SCALE_BU * bu);
  const height = opts.terrain === 'noise' ? (x: number, z: number) => fbm2(x * inv, z * inv, seed, 3) * amp : () => 0;
  const prims = typeof opts.prims === 'number' ? randomRocks(opts.prims, seed, size, bu, height) : (opts.prims ?? []);
  const params = { ...defaultWorldParams(species, seed), sizeClass: 'compact' as const, rivalCount: 0, incipientCount: 0 };
  return buildWorld({ params, size, bu, height, prims });
}

export interface TestSimOptions extends TestWorldOptions {
  world?: WorldData;
  /** Config overrides (cheats default to true in tests). */
  config?: Partial<GameConfig>;
  systems?: readonly System[];
}

/** A new game on a test world, with cheats enabled. */
export function makeTestSim(opts: TestSimOptions = {}): Sim {
  const world = opts.world ?? makeTestWorld(opts);
  const base = defaultGameConfig(opts.species ?? 'lasius-niger', opts.seed ?? 1);
  const config: GameConfig = { ...base, cheats: true, world: world.params, ...opts.config };
  const { state } = createNewGame(config, world);
  return createSim(state, world, { systems: opts.systems });
}
