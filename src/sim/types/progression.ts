// Progression: stage, milestones, journal, aims, statistics, codex flags, deaths, alerts, diagnostics,
// and the Lineage record shapes (GDD 06 §7-13, GDD 08 App. A, GDD 02 §13).

import type { TimeSeries } from '@/core/timeSeries';
import type { Caste, DifficultyId, SpeciesId, ZoneType } from './ids';
import type { DeathCause } from './ids/ants';
import type { AimId, AimState, HintId, HintState, JournalKind, StageId } from './ids/progression';
import type { ArchetypeId, WorldSizeId } from './ids/world';
import type { DaughterState } from './ids/species';
import type { ActiveAlert, Diagnostic, EventLogEntry } from './diagnostics';

/** Calendar stamp of a record. */
export interface DateStamp {
  tick: number;
  doy: number;
  year: number;
}

export interface StageState {
  id: StageId;
  flags: { orphaned: boolean; declining: boolean; dormant: boolean };
  lastEvalTick: number;
  /** Worker counts at the last three daily evaluations (declining test). */
  popAtEval: number[];
}

export interface JournalEntry {
  id: number;
  tick: number;
  kind: JournalKind;
  title: string;
  text: string;
  /** Related entity ids or milestone id strings. */
  refs: string[];
  /**
   * Text id the interface formats (milestone id, `stage.<id>`, `season.<index>`, `weather.<state>`, `loss`,
   * `winter-report`, `flight`, aim id, `event.<kind>`); entries written by progression leave title and text ''.
   * Additive (progression).
   */
  key?: string;
  /** Token values for `key`'s wording (ids and numbers, never words). Additive (progression). */
  tokens?: Record<string, string | number>;
}

export interface AimRecord {
  id: AimId;
  state: AimState;
  openedTick: number;
  doneTick: number;
}

/**
 * Statistics history (D1.11): `hourly` keeps the last HOURLY_HISTORY_CAP (168) samples per series in a ring;
 * `daily` is unbounded (one number per game day). Keys are HistorySeriesId, or `<id>:<member>` for multi-valued
 * series. Series are created lazily by the stats system.
 */
export interface HistoryState {
  hourly: Record<string, TimeSeries>;
  daily: Record<string, number[]>;
  lastHourlyTick: number;
  lastDailyTick: number;
}

/** Journal (D1.10). Aims are a separate record list (`ProgressionState.aims`). */
export interface JournalState {
  entries: JournalEntry[];
}

export interface DeathRecord {
  tick: number;
  cause: DeathCause;
  caste: Caste;
  /** Task at death. */
  role: string;
  zone: ZoneType | null;
}

export interface DeathStats {
  /** Deaths of the player colony per cause. */
  byCause: Record<string, number>;
  /** Per season index (SEASONS order). */
  bySeason: number[];
  /** Most recent deaths (ring, DEATH_RING_CAP). */
  recent: DeathRecord[];
}

/** Link of this game to the device-level Lineage store (stored separately from saves). */
export interface LineageLink {
  /** Lineage colony record id, '' if not yet registered. */
  colonyRecordId: string;
  generation: number;
  parentColonyId: string;
  parentFlightId: string;
  /** Colony name shown in Lineage/Epitaph. */
  name: string;
}

export interface ProgressionState {
  stage: StageState;
  /** Milestone id -> when reached. */
  milestones: Record<string, DateStamp>;
  journal: JournalState;
  aims: AimRecord[];
  history: HistoryState;
  deaths: DeathStats;
  /** Codex entry id -> tick first observed in this game (device unlocks live outside saves). */
  codexSeen: Record<string, number>;
  /** Copy of the profile's hint progress (hint id -> uses and state). */
  hintsMirror: Record<string, { uses: number; state: HintState }>;
  alerts: ActiveAlert[];
  diagnostics: Diagnostic[];
  /** Ring of recent notable events (EVENT_LOG_CAP). */
  eventLog: EventLogEntry[];
  /** UI-supplied milestone thumbnails (storeThumbnail command), at most MILESTONE_THUMBS_MAX. */
  milestoneThumbs: { milestoneId: string; dataUrl: string }[];
  /** Difficulty preset changes during this game (D1.12). */
  difficultyHistory: { tick: number; preset: DifficultyId }[];
  lineage: LineageLink;
  /** Peak adult worker count of the player colony (simulated workers). */
  peakWorkers: number;
  /** Rivals destroyed by the player. */
  rivalsDefeated: number;
  /** Game over: final cause chain (diagnostic/cause ids), empty while alive. */
  finalCauses: string[];
  gameOver: boolean;
  /** Progression bookkeeping (counters, cooldowns, accumulators, queues). Additive (progression): created on first use. */
  engine?: ProgressionEngineState;
}

/**
 * Bookkeeping of the progression module (owner: src/sim/progression). Plain data so that alert cooldowns, the aim
 * queue, trigger timers and statistics accumulators survive save/load.
 */
export interface ProgressionEngineState {
  nextJournalId: number;
  nextAlertId: number;
  /** Alert key (`kind:subjectId`) -> tick it cleared (cooldown of GDD 08 §6.3). */
  alertCleared: Record<string, number>;
  /** Eligible aims waiting for a free "Current focus" slot, oldest first. */
  aimQueue: string[];
  /** Trigger memory: named counters, timers and flags (numbers only). */
  mem: Record<string, number>;
  /** Event accumulators since the last hourly sample, by series id. */
  hourAcc: Record<string, number>;
  /** Accumulators of the current day per series id: [sum, samples, min, max]. */
  dayAcc: Record<string, number[]>;
  /** Ticks of recent player-colony adult deaths (loss entries, last 0.25 GD). */
  recentDeathTicks: number[];
  /** Established trails by source id: [established tick, length BU]. */
  trails: Record<string, number[]>;
  /** Weather hours of the current season, by weather state (season journal summary). */
  seasonWeather: Record<string, number>;
  /** First-of-kind weather journal entries already written, by `<year>:<season>:<state>`. */
  weatherSeen: Record<string, number>;
}

// ---- Lineage store records (device store `lineage`, NOT part of SimState; GDD 06 §12) ----

export interface FlightRecord {
  id: string;
  tick: number;
  date: DateStamp;
  weather: string;
  nGynes: number;
  nMales: number;
  nLaunched: number;
  nMated: number;
  flightDeaths: number;
  /**
   * Losses of the flight by cause (GDD 06 §11.6): gynes lost in the air (`predation`), males dying after it
   * (`old-age`, role `male`). Additive (overwinter-repro); missing in older records.
   */
  flightDeathsByCause?: Record<string, number>;
  nLanded: number;
  nFounded: number;
  landingZones: ZoneType[];
  possessed: boolean;
  daughterIds: string[];
}

export interface DaughterRecord {
  id: string;
  motherColonyId: string;
  flightId: string;
  species: SpeciesId;
  generation: number;
  /** uint32 world seed for the daughter's locality. */
  seed: number;
  archetypeHint: ArchetypeId | null;
  witnessed: boolean;
  landingZone: ZoneType | null;
  doy: number;
  state: DaughterState;
}

export interface LineageColonyRecord {
  id: string;
  name: string;
  species: SpeciesId;
  worldSeed: number;
  archetype: ArchetypeId;
  sizeId: WorldSizeId;
  generation: number;
  parentColonyId: string;
  parentFlightId: string;
  foundedDate: DateStamp;
  endedDate: DateStamp | null;
  endCause: string;
  /** Peak simulated workers (no per-agent weights, ruling 4). */
  peakWorkers: number;
  gameYears: number;
  winters: number;
  alatesReared: number;
  flights: number;
  daughtersFounded: number;
  rivalsDefeated: number;
  milestones: string[];
  difficultyHistory: { tick: number; preset: string }[];
}

/** Lineage block of the device profile (D1.19). */
export interface LineageStore {
  colonies: LineageColonyRecord[];
  flights: FlightRecord[];
  daughters: DaughterRecord[];
  /** Lineage view preferences (sort order, filters ...), plain values only. */
  settings: Record<string, string | number | boolean>;
}

/** Device-level codex unlock (D1.19). `firstSeenIso` is wall-clock text written by the game layer. */
export interface CodexUnlock {
  tick: number;
  doy: number;
  year: number;
  species: SpeciesId;
  firstSeenIso: string;
}

/**
 * Device profile `foundress.profile.v1` (IndexedDB `profile`, localStorage fallback; D1.19). NOT part of SimState:
 * the game layer stores it; the sim sees hints through `progression.hintsMirror`.
 */
export interface DeviceProfile {
  hints: Partial<Record<HintId, { uses: number; state: HintState }>>;
  /** Codex id (CodexId) -> first unlock. */
  codex: Record<string, CodexUnlock>;
  lineage: LineageStore;
}
