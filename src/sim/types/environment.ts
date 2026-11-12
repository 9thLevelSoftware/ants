// Environment state (GDD 06 App. A; human activity from GDD 04 App. A `SimState.human`).
// Derived values are a cache refreshed by the calendar/weather systems; the tick counter is the truth.

import type { Vec3 } from '@/core/math/vec3';
import type { HumanEventKind, Season, SpeedLevel, WeatherState } from './ids';
import type { AutoSlowMode, ClimateId, DayPhase, RainClass, WinterPhase } from './ids/progression';
import type { HumanCueKind, HumanVariant } from './ids/world';

/** Calendar values derived from the tick (cache; recomputed by the calendar system). */
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

export interface CalendarState {
  /** Calendar ticks elapsed before tick 0 of this game (start day and hour offset), ticks. */
  startOffsetTicks: number;
  /** Tick the first egg was laid, -1 not yet. */
  foundingTick: number;
  /** Moon phase at calendar tick 0, 0..1. */
  moonPhase0: number;
  derived: CalendarDerived;
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
  history: WeatherHistory;
  dew: { tonight: boolean; level: number };
}

export interface ThermalStateData {
  /** Surface temperature state per material (MATERIAL_IDS order) x 2 (sun, shade), °C. */
  tsurf: Float32Array;
  /** Soil temperature EMA, °C. */
  wsoil: number;
  /** Heat acclimation offset, °C. */
  heatAccl: number;
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

/** Time controls persisted with the game (GDD 06 §4, GDD 01 `state.time`). */
export interface TimeControlState {
  speed: SpeedLevel;
  requested: SpeedLevel;
  paused: boolean;
  autoSlow: AutoSlowMode;
  /** Auto-slow cooldown end tick per trigger. */
  cooldowns: Record<string, number>;
  /** Skip-to-event target tick, -1 none. */
  skipUntilTick: number;
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
