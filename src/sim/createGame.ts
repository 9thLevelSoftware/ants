// New game: config -> { state, world }. Generates the world (or uses the one given, e.g. a test world),
// builds the initial plain state, creates the player colony with a founding queen at the queen start, and
// lets the ecology / rival modules seed their entities.

import { rngFork } from '@/core/rng';
import type {
  CalendarDerived, DayPhase, EnvironmentState, GameConfig, OpeningState, PlayerState, ProgressionState, SimState,
  SpeciesId, WorldData, WorldDelta,
} from '@/sim/types';
import { idleIntent, MATERIAL_IDS, SEASONS, SITE_FACTORS, ZONE_TYPES } from '@/sim/types';
import {
  CARRION_VARIANTS, CARVE_VOXEL_BU, DANGER_CELL_BU, DAY_LENGTH_AMP_H, DAY_LENGTH_MEAN_H, DEFAULT_START_HOUR,
  DEGRADED_AIR_C, MIDDAY_HALF_H, PHERO_CELL_BU, PHERO_CHUNK_CELLS, RAIN_HISTORY_HOURS, TERR_CELL_BU,
  TERR_COLONY_SLOTS, TWILIGHT_HALF_H,
} from '@/sim/balance';
import { createColony, createNest, spawnAnt, type EntityCtx } from '@/sim/entities';
import { initEcology } from '@/sim/ecology';
import { createCarveGrid } from '@/sim/nest';
import { initRivals } from '@/sim/rivals';
import { createWorldField } from '@/sim/world';
import { SAVE_VERSION } from '@/sim/save/version';
import { createStores } from '@/sim/services';
import { requireSpecies } from '@/sim/species';
import {
  calendarTickAt, dayOf, dayOfSeason, dayOfYear, DEFAULT_SEASON_LENGTH, hourOf, seasonOf, weekdayOf, yearFraction,
  yearOf,
} from '@/sim/time';
import { defaultWorldParams, generateWorld } from '@/worldgen';

/** Config for a new game of `species` with default rules and the species' natural founding day. */
export function defaultGameConfig(species: SpeciesId = 'lasius-niger', seed = 1): GameConfig {
  const def = requireSpecies(species);
  const doy = def.opening.startDoy.default; // written for the default 28-day year
  const seasonIdx = Math.floor((doy - 1) / DEFAULT_SEASON_LENGTH);
  return {
    species, difficulty: 'naturalist',
    rules: {
      predators: 'normal', rivals: 3, humanActivity: 'normal', weatherSeverity: 'normal',
      seasonLengthDays: DEFAULT_SEASON_LENGTH, winterMode: 'timelapse', foundingAssist: false,
      queenSenescence: true, extinctionEndsGame: true, collapse: true,
    },
    startSeason: SEASONS[seasonIdx], startDayOfSeason: ((doy - 1) % DEFAULT_SEASON_LENGTH) + 1,
    startHour: def.opening.startHours[0] ?? DEFAULT_START_HOUR,
    world: defaultWorldParams(species, seed), cheats: false,
  };
}

/** Day phase from the hour and today's sunrise/sunset (placeholder until env-core owns the light model). */
function phaseOf(hour: number, sunrise: number, sunset: number): DayPhase {
  if (hour < sunrise - TWILIGHT_HALF_H || hour >= sunset + TWILIGHT_HALF_H) return 'night';
  if (hour < sunrise + TWILIGHT_HALF_H) return 'dawn';
  if (hour >= sunset - TWILIGHT_HALF_H) return 'dusk';
  const mid = (sunrise + sunset) / 2;
  if (hour < mid - MIDDAY_HALF_H) return 'morning';
  return hour < mid + MIDDAY_HALF_H ? 'midday' : 'afternoon';
}

/** Calendar values for a calendar tick (env-core's calendar system keeps them current at runtime). */
export function deriveCalendar(calTick: number, seasonLen: number): CalendarDerived {
  const yf = yearFraction(calTick, seasonLen);
  const dayLength = DAY_LENGTH_MEAN_H + DAY_LENGTH_AMP_H * Math.sin(2 * Math.PI * yf);
  const sunrise = 12 - dayLength / 2, sunset = 12 + dayLength / 2;
  const hour = hourOf(calTick);
  return {
    dayIndex: dayOf(calTick), year: yearOf(calTick, seasonLen), doy: dayOfYear(calTick, seasonLen),
    season: seasonOf(calTick, seasonLen), dayOfSeason: dayOfSeason(calTick, seasonLen), hour, yearFrac: yf,
    sunrise, sunset, dayLength, phase: phaseOf(hour, sunrise, sunset),
    daylight: hour >= sunrise && hour < sunset ? 1 : 0, moonIllum: 0, weekday: weekdayOf(calTick),
  };
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

function initialEnvironment(config: GameConfig, world: WorldData): EnvironmentState {
  const len = config.rules.seasonLengthDays;
  const startOffsetTicks = startCalendarTick(config);
  const m = world.maps.moisture;
  return {
    climateId: requireSpecies(config.species).climate,
    calendar: { startOffsetTicks, foundingTick: -1, moonPhase0: 0, derived: deriveCalendar(startOffsetTicks, len) },
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
    thermal: { tsurf: new Float32Array(MATERIAL_IDS.length * 2).fill(DEGRADED_AIR_C), wsoil: DEGRADED_AIR_C, heatAccl: 0 },
    moisture: { cell: m.cell, nx: m.nx, nz: m.nz, theta0: m.data.slice(), theta1: m.data.slice(), puddle: new Uint8Array(m.nx * m.nz) },
    human: { dayIndex: -1, scheduled: [], active: [], reactive: { interiorVisits: [0, 0], counterTrailTicks: 0, baitRefreshes: 0 }, ambient: { doorOpen: false, lightsOn: false } },
    time: { speed: 1, requested: 1, paused: false, autoSlow: 'slow', cooldowns: {}, skipUntilTick: -1, commandSeq: 0 },
    winter: { phase: 'none', delaysUsed: 0, lastYearResolved: 0, winterActive: false, report: null },
  };
}

function initialWorldDelta(world: WorldData): WorldDelta {
  const nav = world.nav.cls;
  return {
    carve: { voxel: CARVE_VOXEL_BU * world.bu, keys: [], chunks: [], breaches: [] },
    dynamicPrims: [], mounds: [], objectStates: [], consumedAnchors: [], naturalOwners: {}, heightDeltas: [],
    grassHeightMm: new Uint8Array(nav.nx * nav.nz),
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
    milestones: {}, journal: [], aims: [], stats: { hourly: {}, daily: {}, lastHourlyTick: -1, lastDailyTick: -1 },
    deaths: { byCause: {}, bySeason: SEASONS.map(() => 0), recent: [] }, codexSeen: {}, hintsMirror: {}, alerts: [],
    diagnostics: [], eventLog: [], milestoneThumbs: [],
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
      bird: null, lastBirdTick: {}, carrionAcc: new Float32Array(CARRION_VARIANTS * ZONE_TYPES.length),
      danger: { cell: DANGER_CELL_BU * bu, w: gridN(DANGER_CELL_BU), h: gridN(DANGER_CELL_BU), data: new Float32Array(0) },
    },
    rivals: {
      relations: [],
      territory: {
        cell: TERR_CELL_BU * bu, w: gridN(TERR_CELL_BU), h: gridN(TERR_CELL_BU), slots: TERR_COLONY_SLOTS,
        marks: new Float32Array(0), slotColony: new Array<number>(TERR_COLONY_SLOTS).fill(-1),
      },
      threat: { activeKind: null, activeSinceTick: -1, lastEndTick: -1 },
    },
    player: initialPlayer(config), progression: initialProgression(),
  };
}

/** Creates a new game. Pass `world` to use a prepared world (tests); otherwise it is generated from config. */
export function createNewGame(config: GameConfig, world?: WorldData): { state: SimState; world: WorldData } {
  const w = world ?? generateWorld(config.world);
  const state = initialState(config, w);
  const ctx: EntityCtx = { state, stores: createStores(state), emit: () => {}, world: w };

  const carve = createCarveGrid(state.worldDelta.carve, w);
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
  const substrate = createWorldField(w, carve).materialAt(start.pos);
  createNest(ctx, { colony: colony.id, origin: start.pos, founding: true, substrate });
  // nestId stays -1: Ant.nestId is the nest the ant is IN, and the foundress starts on the surface searching
  // for a site (her colony's nest is colony.nestIds[0]).
  const queen = spawnAnt(ctx, { colony: colony.id, caste: 'queen', pos: start.pos, fwd: start.fwd, founding: true });
  colony.queenId = queen.id;
  colony.queens.push({ antId: queen.id, ageDays: 0, lifespanDays: -1 });

  initEcology(ctx, w);
  initRivals(ctx, w);
  return { state, world: w };
}
