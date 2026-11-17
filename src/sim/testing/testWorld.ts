// Small deterministic worlds and sims for module tests (no full world generation). Everything runs on the REAL
// kernel (field, carve grid, nest nav, walker), exactly as in the game.
//
// makeTestWorld(options): WorldData
//   sizeBu     world edge, BU (default 128; the standard features and nest need >= 96)
//   species    played species (default 'lasius-niger'; sets BU)
//   terrain    'flat' (default, y = 0) | 'noise' (gentle fbm, +-2 BU)
//   seed       world seed (default 1)
//   prims      explicit primitives, or a count of random stone ellipsoids
//   features   standard primitives: any of 'wall', 'table' (leg + top, a 'leg-to-top' climb route and a world
//              object), 'stone', 'stem'; or 'all'. Ids follow the explicit prims. See testFeatures.ts.
//
// makeTestSim(options): Sim, a new game on a test world with cheats on. All world options, plus:
//   world      a prepared world (the world options are then ignored)
//   config     GameConfig overrides
//   systems    system list (default: every module's systems; [] runs nothing)
//   behaviours behaviour list override
//   nest       'none' (default: the founding queen alone on the surface) | 'small': the standard pre-carved
//              nest of testNest.ts (entrance shaft, food / nursery / royal chambers, a blind branch) registered
//              as the player colony's nest in state.nests, with its exit and chamber nest-nav fields
//   workers    number of adult workers placed inside the small nest (spread over its chambers, standing on the
//              chamber floors, nestId / chamberId set; default 0; requires nest 'small')
//
//   const sim = makeTestSim({ nest: 'small', workers: 20, features: 'all', systems: [mySystem] });

import { fbm2 } from '@/core/math/noise';
import { rngFork, rngRange } from '@/core/rng';
import type { Behaviour, GameConfig, Primitive, SpeciesId, System, Sim, WorldData } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { spawnAnt } from '@/sim/entities';
import { walkerPlace } from '@/sim/locomotion/walker';
import { createSim } from '@/sim/sim';
import { requireSpecies } from '@/sim/species';
import { defaultWorldParams } from '@/worldgen';
import { buildFeatures, TEST_FEATURES, type TestFeature } from './testFeatures';
import { installSmallNest } from './testNest';
import { buildWorld } from './worldBuilder';

/** Default test world edge, BU. */
const TEST_SIZE_BU = 128;
/** Noise terrain of the test world: amplitude and feature size, BU. */
const TEST_NOISE_AMP_BU = 2;
const TEST_NOISE_SCALE_BU = 40;
/** Random test rocks: radius range, BU. */
const TEST_ROCK_MIN_BU = 2;
const TEST_ROCK_MAX_BU = 6;
/** Test workers: age (game days) and how far from a chamber centre they stand (fraction of its radii). */
const TEST_WORKER_AGE_GD = 5;
const TEST_WORKER_SPREAD = 0.5;

export interface TestWorldOptions {
  /** World edge, BU (default 128). */
  sizeBu?: number;
  species?: SpeciesId;
  terrain?: 'flat' | 'noise';
  seed?: number;
  /** Explicit primitives, or a count of random stone ellipsoids. */
  prims?: Primitive[] | number;
  /** Standard primitives (testFeatures.ts), or 'all'. */
  features?: readonly TestFeature[] | 'all';
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
  const prims = typeof opts.prims === 'number' ? randomRocks(opts.prims, seed, size, bu, height) : [...(opts.prims ?? [])];
  const wanted = opts.features === 'all' ? TEST_FEATURES : (opts.features ?? []);
  const firstId = prims.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const f = buildFeatures(wanted, size, bu, height, firstId);
  prims.push(...f.prims);
  for (const o of f.objects) o.primStart = prims.findIndex((p) => p.objectId === o.id);
  const params = { ...defaultWorldParams(species, seed), sizeClass: 'compact' as const, rivalCount: 0, incipientCount: 0 };
  return buildWorld({ params, size, bu, height, prims, objects: f.objects, climbRoutes: f.climbRoutes });
}

export interface TestSimOptions extends TestWorldOptions {
  world?: WorldData;
  /** Config overrides (cheats default to true in tests). */
  config?: Partial<GameConfig>;
  systems?: readonly System[];
  behaviours?: readonly Behaviour[];
  /** 'small': the standard pre-carved nest (testNest.ts). Default 'none'. */
  nest?: 'none' | 'small';
  /** Adult workers placed inside the small nest. */
  workers?: number;
}

/**
 * Where a test sim's calendar starts unless the test says otherwise: summer day 2 (default-year day 9), the reference
 * species' start day before ruling R20 moved the game's default to day 5. Behaviour tests were written for a warm
 * summer afternoon; the game's own start day is tested through `defaultGameConfig` / `createNewGame`.
 */
export const TEST_START = { startSeason: 'summer', startDayOfSeason: 2 } as const;

/** A new game on a test world, with cheats enabled. */
export function makeTestSim(opts: TestSimOptions = {}): Sim {
  const world = opts.world ?? makeTestWorld(opts);
  const base = defaultGameConfig(opts.species ?? 'lasius-niger', opts.seed ?? 1);
  const pinned = (opts.species ?? 'lasius-niger') === 'lasius-niger' ? TEST_START : {};
  const config: GameConfig = { ...base, ...pinned, cheats: true, world: world.params, ...opts.config };
  const { state } = createNewGame(config, world);
  const sim = createSim(state, world, { systems: opts.systems, behaviours: opts.behaviours });
  const workers = opts.workers ?? 0;
  if (opts.nest === 'small') addWorkers(sim, workers);
  else if (workers > 0) throw new Error("makeTestSim: workers need nest: 'small'");
  return sim;
}

/** Installs the small nest and spreads `n` workers over its chambers, standing on the floors. */
function addWorkers(sim: Sim, n: number): void {
  const { nest, chambers } = installSmallNest(sim);
  const colony = sim.state.colonies[0];
  const rng = rngFork(sim.state.config.world.seed, 'test-workers');
  const down = { x: 0, y: -1, z: 0 };
  for (let i = 0; i < n; i++) {
    const c = chambers[i % chambers.length];
    const a = rngRange(rng, 0, 2 * Math.PI), s = Math.sqrt(rngRange(rng, 0, 1)) * TEST_WORKER_SPREAD;
    const p = { x: c.center.x + Math.cos(a) * c.radii.x * s, y: c.center.y, z: c.center.z + Math.sin(a) * c.radii.z * s };
    const ant = spawnAnt(sim, {
      colony: colony.id, caste: 'worker', pos: p, fwd: { x: Math.sin(a), y: 0, z: Math.cos(a) }, ageGd: TEST_WORKER_AGE_GD,
      nestId: nest.id, chamberId: c.id,
    });
    if (!walkerPlace(sim.field, ant, p, { dir: down }, sim.kernel.walker)) throw new Error(`makeTestSim: no floor in chamber ${c.id}`);
  }
}
