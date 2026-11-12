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
