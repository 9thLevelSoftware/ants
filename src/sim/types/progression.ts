// Progression: stage, milestones, journal, aims, statistics, codex flags, deaths, alerts, diagnostics,
// and the Lineage record shapes (GDD 06 §7-13, GDD 08 App. A, GDD 02 §13).

import type { TimeSeries } from '@/core/timeSeries';
import type { Caste, SpeciesId, ZoneType } from './ids';
import type { DeathCause } from './ids/ants';
import type { AimId, AimState, HintState, JournalKind, StageId } from './ids/progression';
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
 * Statistics history: series id -> ring buffer (core TimeSeries). `hourly` keeps the last 7 game days
 * (HOURLY_HISTORY_CAP); `daily` keeps DAILY_HISTORY_CAP days. Series ids follow GDD 02 §13
 * ('workers', 'stores-c', 'intake-p', ...). Series are created lazily by the stats system.
 */
export interface StatsHistory {
  hourly: Record<string, TimeSeries>;
  daily: Record<string, TimeSeries>;
  lastHourlyTick: number;
  lastDailyTick: number;
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
  journal: JournalEntry[];
  aims: AimRecord[];
  stats: StatsHistory;
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
  lineage: LineageLink;
  /** Peak adult worker count of the player colony. */
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
  peakWorkerEq: number;
  gameYears: number;
  winters: number;
  alatesReared: number;
  flights: number;
  daughtersFounded: number;
  rivalsDefeated: number;
  milestones: string[];
  difficultyHistory: { tick: number; preset: string }[];
}

export interface LineageStore {
  colonies: LineageColonyRecord[];
  flights: FlightRecord[];
  daughters: DaughterRecord[];
}
