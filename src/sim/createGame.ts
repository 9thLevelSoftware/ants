// New game: config -> { state, world }. Generates the world (or uses the one given, e.g. a test world),
// builds the initial plain state, applies the world's pre-carves through the kernel's carve grid, creates the
// player colony with a founding queen placed on the surface at the queen start (kernel walkerPlace), and lets
// the ecology / rival modules seed their entities.

import { rngFork } from '@/core/rng';
import type {
  DifficultyId, EnvironmentState, GameConfig, OpeningState, PlayerState, ProgressionState, SeasonLengthDays,
  SimState, SpeciesId, ThermalStateData, WorldData, WorldDelta,
} from '@/sim/types';
import { idleIntent, MATERIAL_IDS, SEASONS, SITE_FACTORS, ZONE_TYPES } from '@/sim/types';
import {
  CARRION_VARIANTS, CARVE_VOXEL_BU, DEFAULT_SEASON_LENGTH_DAYS, DEFAULT_START_HOUR, DEGRADED_AIR_C,
  DIFFICULTY_PARAMS, PHERO_CELL_BU, PHERO_CHUNK_CELLS, RAIN_HISTORY_HOURS, resolveRules, TERR_CELL_BU, TERRAIN_CELL_BU,
  TERR_COLONY_SLOTS, valueIn,
} from '@/sim/balance';
import { createColony, createNest, spawnAnt, type EntityCtx } from '@/sim/entities';
import { initEcology } from '@/sim/ecology';
import { initRivals } from '@/sim/rivals';
import { walkerPlace } from '@/sim/locomotion/walker';
import { SAVE_VERSION } from '@/sim/save/version';
import { createSimKernel, createStores } from '@/sim/services';
import { requireSpecies } from '@/sim/species';
import { calendarTickAt } from '@/sim/time';
import { clonePlain } from '@/sim/entities';
import { defaultWorldParams, generateWorld, type WorldRuleInputs } from '@/worldgen';

/**
 * Config for a new game of `species` on a difficulty preset, with the species' natural founding day. The species
 * writes its start day for the default year (`startDoy`); it is converted to the given season length.
 */
export function defaultGameConfig(
  species: SpeciesId = 'lasius-niger', seed = 1, preset: DifficultyId = 'naturalist',
  seasonLengthDays: SeasonLengthDays = DEFAULT_SEASON_LENGTH_DAYS as SeasonLengthDays,
): GameConfig {
  const def = requireSpecies(species);
  const doy = def.opening.startDoy.default; // default-year day of year
  const refLen = DEFAULT_SEASON_LENGTH_DAYS;
  const seasonIdx = Math.floor((doy - 1) / refLen);
  const dayInSeason = ((doy - 1) % refLen) + 1;
  const scaledDay = Math.max(1, Math.min(seasonLengthDays, Math.round(1 + ((dayInSeason - 1) * seasonLengthDays) / refLen)));
  const difficulty = { preset, params: clonePlain(DIFFICULTY_PARAMS[preset]), custom: {} };
  const rules = resolveRules(preset, {}, seasonLengthDays);
  return {
    species, difficulty, rules,
    startSeason: SEASONS[seasonIdx], startDayOfSeason: scaledDay,
    startHour: def.opening.startHours[0] ?? DEFAULT_START_HOUR,
    world: defaultWorldParams(species, seed, preset, 'standard', worldRuleInputs({ difficulty, rules })), cheats: false,
  };
}

/**
 * The world generator's copy of the rules (WorldParams.difficulty / rivalCount / incipientCount / humanActivity).
 * Single source of truth: `config.difficulty` and `config.rules` win. `config.world` records what the world was
 * GENERATED with (so a load regenerates the same world); systems read the rules, never these copies, so a
 * mid-game setDifficulty (e.g. humanActivity 'off') needs no world change.
 */
export function worldRuleInputs(config: Pick<GameConfig, 'difficulty' | 'rules'>): WorldRuleInputs {
  return {
    rivalCount: config.rules.rivals, incipientCount: valueIn(config, 'incipientRivals'),
    humanActivity: config.rules.humanActivity,
  };
}

/** `config` with its world params brought in line with its difficulty and rules (call before generating). */
export function syncWorldParams(config: GameConfig): GameConfig {
  return { ...config, world: { ...config.world, difficulty: config.difficulty.preset, ...worldRuleInputs(config) } };
}

/**
 * Calendar tick of the game start. The start day is clamped into the configured season length, because a
 * config may have been written for another length (custom rules change it after the default was computed).
 */
export function startCalendarTick(config: GameConfig): number {
  if (config.startSeason === 'winter') throw new Error('createNewGame: a game cannot start in winter (directions §K)');
  const len = config.rules.seasonLengthDays;
  const day = Math.min(len, Math.max(1, Math.round(config.startDayOfSeason)));
  return calendarTickAt(config.startSeason, day, config.startHour, len);
}

/** Thermal state; the D7.2 EMA arrays are sized here and allocated by env-core (ruling 3). */
function initialThermal(world: WorldData): ThermalStateData {
  const cellMm = TERRAIN_CELL_BU * world.bu;
  const n = Math.max(1, Math.ceil(world.size / cellMm));
  return {
    tsurf: new Float32Array(MATERIAL_IDS.length * 2).fill(DEGRADED_AIR_C), wsoil: DEGRADED_AIR_C, heatAccl: 0,
    emaCellMm: cellMm, emaCellNx: n, emaCellNz: n, emaCell: new Float32Array(0),
    emaCoverPrimIds: [], emaCover: new Float32Array(0),
  };
}

function initialEnvironment(config: GameConfig, world: WorldData): EnvironmentState {
  const m = world.maps.moisture;
  return {
    climateId: requireSpecies(config.species).climate,
    calendar: { startTick: startCalendarTick(config), foundingTick: -1, moonPhase0: 0 },
    weather: {
      state: 'clear', intensityClass: null, startTick: 0, dwellEndTick: -1, peakPrecip: 0, precip: 0, rainRateMmH: 0,
      cloud: 0, wOff: 0, wind2m: 0, windDir: { x: 1, y: 0, z: 0 }, gustUntilTick: -1, fogDensity: 0,
      lightningNextTick: -1, anomalyPrev: 0, anomalyCur: 0,
      history: {
        lastRainEndTick: -1, rainHoursRing: new Uint8Array(RAIN_HISTORY_HOURS), cumRain24hMm: 0, coldSnapExt: 0, dryspellEndTick: -1,
        dryspellDone: false, tmaxToday: DEGRADED_AIR_C, tmaxYesterday: DEGRADED_AIR_C,
      },
      dew: { tonight: false, level: 0 },
    },
    thermal: initialThermal(world),
    moisture: { cell: m.cell, nx: m.nx, nz: m.nz, theta0: m.data.slice(), theta1: m.data.slice(), puddle: new Uint8Array(m.nx * m.nz) },
    human: { dayIndex: -1, scheduled: [], active: [], reactive: { interiorVisits: [0, 0], counterTrailTicks: 0, baitRefreshes: 0 }, ambient: { doorOpen: false, lightsOn: false } },
    time: {
      speed: 1, requested: 1, paused: false, autoSlow: config.difficulty.params.autoSlowDefault, cooldowns: {},
      skipUntil: -1, commandSeq: 0,
    },
    winter: { phase: 'none', delaysUsed: 0, lastYearResolved: 0, winterActive: false, report: null },
  };
}

function initialWorldDelta(world: WorldData): WorldDelta {
  const nav = world.nav.cls;
  return {
    carve: { voxel: CARVE_VOXEL_BU * world.bu, keys: [], chunks: [], breaches: [] },
    carveFlags: { keys: [], chunks: [] },
    dynPrims: [], mounds: [], objectStates: [], consumedAnchors: [], naturalOwners: {}, heightDeltas: [],
    grassHeightMm: new Uint16Array(nav.nx * nav.nz),
    microState: world.micro.map((m) => ({ id: m.id, discovered: false, discoveredTick: -1, open: true })),
    waterLevels: Float32Array.from(world.waterBodies.map((w) => w.levelMm)),
    wood: [],
  };
}

function initialOpening(config: GameConfig): OpeningState {
  return {
    phase: 'intro-card', attempt: 1, retriesUsed: 0, startDoy: 0, siteFactors: SITE_FACTORS.map(() => 0), siteQ: 0,
    siteWord: null, entranceId: -1, chamberId: -1, shaftDepthBu: 0, chamberVoxels: 0, sealed: false, layBatches: 0,
    threatsUsed: 0, lastThreatTick: -1, interruptsUsed: 0, hazardLog: [], lapse: null,
    garden: config.species === 'atta-texana' ? { pelletHealth: 1, planted: false, established: false, biomass: 0 } : null,
    woodMoisture: -1, done: false,
  };
}

function initialPlayer(config: GameConfig): PlayerState {
  return {
    possessedAntId: -1, previousAntId: -1, returnAntId: -1, intent: idleIntent(), lastInputTick: 0,
    promptLearned: {}, colonyId: -1, opening: initialOpening(config), timelapse: null,
  };
}

function initialProgression(): ProgressionState {
  return {
    stage: { id: 'founding', flags: { orphaned: false, declining: false, dormant: false }, lastEvalTick: -1, popAtEval: [0, 0, 0] },
    milestones: {}, journal: { entries: [] }, aims: [],
    history: { hourly: {}, daily: {}, lastHourlyTick: -1, lastDailyTick: -1 },
    deaths: { byCause: {}, bySeason: SEASONS.map(() => 0), recent: [] }, codexSeen: {}, hintsMirror: {}, alerts: [],
    diagnostics: [], eventLog: [], milestoneThumbs: [], difficultyHistory: [],
    lineage: { colonyRecordId: '', generation: 1, parentColonyId: '', parentFlightId: '', name: '' },
    peakWorkers: 0, rivalsDefeated: 0, finalCauses: [], gameOver: false,
  };
}

/** The initial plain state, with no entities yet. */
export function initialState(config: GameConfig, world: WorldData): SimState {
  const bu = world.bu;
  const gridN = (cellBu: number): number => Math.max(1, Math.ceil(world.size / (cellBu * bu)));
  let maxPrimId = 0;
  for (const p of world.prims) if (p.id > maxPrimId) maxPrimId = p.id;
  return {
    version: SAVE_VERSION, generatorVersion: world.generatorVersion, config,
    rng: rngFork(config.world.seed, 'rng.main'), rngStreams: {}, nextId: maxPrimId + 1, tick: 0,
    env: initialEnvironment(config, world), worldDelta: initialWorldDelta(world),
    colonies: [], ants: [], brood: [], items: [], sources: [], plants: [], creatures: [], nests: [], markers: [],
    phero: { cell: PHERO_CELL_BU * bu, chunkCells: PHERO_CHUNK_CELLS, layers: [], lastDecayTick: 0 },
    ecology: {
      herds: [], preyPatches: [], hazards: [],
      director: {
        lastRunTick: -1, perKindCounts: {},
        territories: world.placements.territories.map((t) => ({
          kind: t.creatureKind, center: { ...t.center }, radius: t.radiusMm, occupantId: -1, vacantUntilTick: -1,
        })),
      },
      birdEvent: null, lastBirdTick: {}, carrionAcc: new Float32Array(CARRION_VARIANTS * ZONE_TYPES.length),
    },
    rivals: {
      relations: [],
      territory: {
        cell: TERR_CELL_BU * bu, w: gridN(TERR_CELL_BU), h: gridN(TERR_CELL_BU), slots: TERR_COLONY_SLOTS,
        marks: new Float32Array(0), slotColony: new Array<number>(TERR_COLONY_SLOTS).fill(-1),
      },
      threatDirector: { activeKind: null, activeSinceTick: -1, lastEndTick: -1 },
    },
    player: initialPlayer(config), progression: initialProgression(),
  };
}

/** Creates a new game. Pass `world` to use a prepared world (tests); otherwise it is generated from config. */
export function createNewGame(cfg: GameConfig, world?: WorldData): { state: SimState; world: WorldData } {
  // A generated world follows the rules; a prepared world (tests) keeps the params it was built with.
  const config = world ? cfg : syncWorldParams(cfg);
  startCalendarTick(config); // refuses an invalid start (winter) before the world is generated
  const w = world ?? generateWorld(config.world);
  const state = initialState(config, w);
  const ctx: EntityCtx = { state, stores: createStores(state), emit: () => {}, world: w };

  // World pre-carves go through the kernel's carve grid into state.worldDelta.carve (force: they may open
  // cracks through hard crusts, directions §K). NATURAL voxel flags (carveFlags) are the nest module's.
  const kernel = createSimKernel(state, w);
  const carve = kernel.carve;
  for (const op of w.preCarve) {
    const opts = { force: true, recordBreach: true };
    if (op.shape === 'sphere') carve.carveSphere(op.a, op.r, opts);
    else if (op.shape === 'capsule') carve.carveCapsule(op.a, op.b, op.r, opts);
    else carve.carveEllipsoid(op.a, op.b, opts);
  }
  carve.takeDirty(); // nothing is meshed yet; render meshes every stored chunk on game start

  const colony = createColony(ctx, { species: config.species, isPlayer: true });
  state.player.colonyId = colony.id;
  state.rivals.territory.slotColony[0] = colony.id;
  const start = w.queenStart;
  const substrate = kernel.field.materialAt(start.pos);
  createNest(ctx, { colony: colony.id, origin: start.pos, founding: true, substrate });
  // nestId stays -1: Ant.nestId is the nest the ant is IN, and the foundress starts on the surface searching
  // for a site (her colony's nest is colony.nestIds[0]).
  const queen = spawnAnt(ctx, { colony: colony.id, caste: 'queen', pos: start.pos, fwd: start.fwd, founding: true });
  // onto the kernel's level set f = footOffset (sphere-traces down first if the start is above the ground)
  if (!walkerPlace(kernel.field, queen, start.pos, { heading: start.fwd }, kernel.walker)) {
    throw new Error(`createNewGame: no surface at the queen start (${start.pos.x}, ${start.pos.y}, ${start.pos.z})`);
  }
  colony.queenId = queen.id;
  colony.queens.push({ antId: queen.id, lifespanDays: null }); // senescence draw: overwinter-repro

  initEcology(ctx, w);
  initRivals(ctx, w);
  return { state, world: w };
}
