// Environment state (GDD 06 App. A; human activity from GDD 04 App. A `SimState.human`).
// The tick counter is the truth: derived calendar values (CalendarDerived) are a runtime cache, never persisted
// (D1.1). The season length is `config.rules.seasonLengthDays`.

import type { Vec3 } from '@/core/math/vec3';
import type { HumanEventKind, Season, WeatherState } from './ids';
import type { AutoSlowMode, ClimateId, DayPhase, RainClass, RunSpeed, WinterPhase } from './ids/progression';
import type { HumanCueKind, HumanVariant } from './ids/world';

/** Calendar values derived from the calendar tick. Runtime cache only (environment `calendarNow`), not in SimState. */
export interface CalendarDerived {
  /** 0-based game day since day 1 of spring, year 1. */
  dayIndex: number;
  /** 1-based year. */
  year: number;
  /** 1-based day of the year (1 .. 4 * season length). */
  doy: number;
  season: Season;
  /** 1-based day within the season. */
  dayOfSeason: number;
  /** Hour of day 0..24 (fractional). */
  hour: number;
  /** Year fraction 0..1 (GDD 06 `d` normalised; scale with season length). */
  yearFrac: number;
  /** Sunrise / sunset hours and day length, h. */
  sunrise: number;
  sunset: number;
  dayLength: number;
  phase: DayPhase;
  /** Daylight 0..1. */
  daylight: number;
  moonIllum: number;
  /** 0..6; 5 and 6 are the weekend (7-day week independent of season length). */
  weekday: number;
}

/** Persisted calendar anchors (GDD 06 §1; D1.1). Calendar tick = state.tick + startTick. */
export interface CalendarState {
  /** Calendar tick at which this game started (start day and hour), ticks since 00:00 of spring day 1, year 1. */
  startTick: number;
  /** Tick the first egg was laid, -1 not yet. */
  foundingTick: number;
  /** Moon phase at calendar tick 0, 0..1. */
  moonPhase0: number;
}

export interface WeatherHistory {
  lastRainEndTick: number;
  /** Rain hours in the last RAIN_HISTORY_HOURS (36) h (0/1 per hour, ring). */
  rainHoursRing: Uint8Array;
  cumRain24hMm: number;
  coldSnapExt: number;
  dryspellEndTick: number;
  dryspellDone: boolean;
  /** °C */
  tmaxToday: number;
  tmaxYesterday: number;
}

/** The next weather state, drawn when the current one begins (telegraphing; GDD 06 §3.2). Added by env-core. */
export interface WeatherForecast {
  state: WeatherState;
  /** Rain class of the next rain onset, null for other states. */
  intensityClass: RainClass | null;
  /** Tick (state.tick) at which the current state is due to end. */
  startTick: number;
}

export interface WeatherStateData {
  state: WeatherState;
  intensityClass: RainClass | null;
  startTick: number;
  dwellEndTick: number;
  /** Peak and current precipitation 0..1 (normalised), rain rate mm/h. */
  peakPrecip: number;
  precip: number;
  rainRateMmH: number;
  /** Cloud cover 0..1. */
  cloud: number;
  /** Weather temperature offset, °C. */
  wOff: number;
  /** Wind at 2 m, m/s, and direction (unit vector in XZ). */
  wind2m: number;
  windDir: Vec3;
  gustUntilTick: number;
  fogDensity: number;
  lightningNextTick: number;
  /** AR(1) temperature anomaly, °C. */
  anomalyPrev: number;
  anomalyCur: number;
  /** Ornstein-Uhlenbeck wind noise, m/s (additive, env-core; absent in older saves = 0). */
  windOu?: number;
  /** Lagged diurnal-amplitude multiplier `dm` (additive, env-core; absent = target of the current state). */
  dmCur?: number;
  /** Next state hint; null/absent until drawn. */
  forecast?: WeatherForecast | null;
  history: WeatherHistory;
  dew: { tonight: boolean; level: number };
}

export interface ThermalStateData {
  /** Surface temperature state per material (MATERIAL_IDS order) x 2 (sun, shade), °C. */
  tsurf: Float32Array;
  /** Soil temperature EMA, °C. */
  wsoil: number;
  /**
   * D7.2 EMAs of `tsurf` (same layout, plus the extra lawn surface): time constants 1 game day and one season.
   * They feed GDD 03 §9.1 (`T_dayMean`, `T_seasonMean`). Created by env-core on its first update (additive).
   */
  tsurfDay?: Float32Array;
  tsurfSeason?: Float32Array;
  /** Heat acclimation offset, °C. */
  heatAccl: number;
  /**
   * D7.2 (GDD 03 §9.1, GDD 06 §2.5): EMAs of the column-top temperature `T_top`, kept per 4 BU heightfield cell
   * and per cover primitive. Each array interleaves [T_dayMean (τ 1 GD), T_seasonMean (τ DAYS_PER_SEASON GD)], °C.
   * Lazily allocated (ruling 3): length 0 until env-core fills it; readers then use the T1 constants (GDD 06 §0.2).
   */
  /** Cell edge of the EMA grid, mm (the 4 BU heightfield cell, TERRAIN_CELL_BU), and its size in cells. */
  emaCellMm: number;
  emaCellNx: number;
  emaCellNz: number;
  /** Per heightfield cell: index 2 * (iz * emaCellNx + ix) (+1 for the season mean), °C. */
  emaCell: Float32Array;
  /** World primitive id of each cover-primitive slot (stones, slabs, boards over soil), slot order of emaCover. */
  emaCoverPrimIds: number[];
  /** Per cover primitive: index 2 * slot (+1 for the season mean), °C. */
  emaCover: Float32Array;
}

/** Inputs of the GDD 03 §9.1 thermal column at a ground position (environment `thermalInputs`, D7.2), °C. */
export interface ThermalInputs {
  /** Temperature of the topmost surface of the column (surface / micro temperature by material and shade). */
  T_top: number;
  /** EMA of T_top, τ 1 game day. */
  T_dayMean: number;
  /** EMA of T_top, τ one season (DAYS_PER_SEASON game days). */
  T_seasonMean: number;
  /** Climate annual mean + SOIL_MEAN_OFFSET_C. */
  T_annual: number;
}

/** Soil moisture grids (16 BU cells, GDD 06 §3.9). */
export interface MoistureState {
  /** Cell edge, mm. */
  cell: number;
  nx: number;
  nz: number;
  /** Top / deep soil moisture 0..255 (= 0..1). */
  theta0: Uint8Array;
  theta1: Uint8Array;
  /** Puddle depth in 0.05 mm units. */
  puddle: Uint8Array;
}

export interface HumanCue {
  kind: HumanCueKind;
  origin: Vec3;
  radiusMm: number;
  /** 0..1 */
  intensity: number;
  startTick: number;
  impactTick: number;
}

/** A scheduled human event instance (GDD 04 `HumanEventInst`). */
export interface HumanEventInst {
  id: number;
  kind: HumanEventKind;
  variant: HumanVariant | null;
  startTick: number;
  /** Lane or region id the event uses, -1 none. */
  laneId: number;
  regionId: number;
  seed: number;
  cancelled: boolean;
}

/** A running human event (GDD 04 `HumanEventRun`). */
export interface HumanEventRun {
  instId: number;
  /** Seconds of the event elapsed. */
  progressS: number;
  nextImpactTick: number;
  cues: HumanCue[];
}

export interface HumanState {
  dayIndex: number;
  scheduled: HumanEventInst[];
  active: HumanEventRun[];
  reactive: { interiorVisits: number[]; counterTrailTicks: number; baitRefreshes: number };
  ambient: { doorOpen: boolean; lightsOn: boolean };
}

/**
 * Time controls persisted with the game (GDD 06 §4; D1.7). Written by sim commands (`setSpeed`, `togglePause`,
 * `setAutoSlow`), read by the game loop. Pause is a flag: `setSpeed {speed: 0}` sets `paused` and keeps `speed`.
 */
export interface TimeControlState {
  /** Running speed (x real time). */
  speed: RunSpeed;
  /** Speed the player asked for (the effective speed may be lower: possession, opening, budget). */
  requested: RunSpeed;
  paused: boolean;
  autoSlow: AutoSlowMode;
  /** Auto-slow cooldown end tick per alert kind (D6.8). */
  cooldowns: Record<string, number>;
  /** Skip-to-next-event target tick, -1 none. */
  skipUntil: number;
  /** Count of commands applied (also while paused). */
  commandSeq: number;
}

/** Overwintering progress (GDD 06 §6). */
export interface WinterStateData {
  phase: WinterPhase;
  delaysUsed: number;
  /** Year whose winter was resolved last, 0 none. */
  lastYearResolved: number;
  winterActive: boolean;
  /** Winter report of the last lapse (numbers by key); null none. */
  report: Record<string, number> | null;
}

export interface EnvironmentState {
  climateId: ClimateId;
  calendar: CalendarState;
  weather: WeatherStateData;
  thermal: ThermalStateData;
  moisture: MoistureState;
  human: HumanState;
  time: TimeControlState;
  winter: WinterStateData;
}
