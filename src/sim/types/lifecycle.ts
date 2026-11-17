// Overwintering, reproduction and succession bookkeeping of a colony (GDD 06 §6, §11-§13). Additive (overwinter-repro):
// `Colony.lifecycle` is created by the lifecycle systems on first use. Plain data only. The Lineage itself (flight,
// daughter and colony records) lives in the device profile, not here: the sim keeps the records of this game's
// flights so that the game layer can store them and the epitaph can show them.

import type { DateStamp, DaughterRecord, FlightRecord } from './progression';
import type { ZoneType } from './ids';

/** One game day of the winter model (presentation and report). */
export interface WinterDay {
  /** Cluster temperature mean and minimum that day, C. */
  tMean: number;
  tMin: number;
  frost: boolean;
  /** Rain that day, mm (0 none). */
  rainMm: number;
  flood: boolean;
  /** Living after the day. */
  workers: number;
  larvae: number;
  /** Stores after the day, loads. */
  c: number;
  p: number;
  /** Notable event of the day for the report's beats ('' none): 'frost' | 'rain' | 'flood' | 'disease' | 'starvation'. */
  beat: string;
}

/** A ranked cause of the winter's losses (diagnostic style). */
export interface WinterWhy {
  cause: string;
  /** Share of the losses 0..1. */
  weight: number;
  /** Numbers for the wording: lost workers, temperatures, depths ... */
  n: number;
  detail: Record<string, number>;
  remedy: string;
}

/** The result of one overwintering (GDD 06 §6.5 Winter Report). */
export interface WinterRecord {
  year: number;
  /** Calendar ticks of Begin and of spring (the calendar anchor moves; the simulation tick does not jump). */
  beginTick: number;
  springTick: number;
  workers0: number;
  workers1: number;
  larvae0: number;
  larvae1: number;
  pupae0: number;
  /** Worker (and alate) losses by cause id (old-age, cold, starvation, disease, drowning, lost). */
  losses: Record<string, number>;
  broodLosses: Record<string, number>;
  c0: number;
  c1: number;
  p0: number;
  p1: number;
  /** Days the remaining C covers at the spring rate. */
  daysLeft: number;
  queenAlive: boolean;
  queenCause: string;
  coldestC: number;
  coldestDepthBu: number;
  coldestChamberId: number;
  frostNights: number;
  heaviestRainMm: number;
  floods: number;
  days: WinterDay[];
  /** Winter day (1-based day of the season) of `days[0]`: later than 1 after "Delay one day". Missing: 1. */
  firstWinterDay?: number;
  why: WinterWhy[];
  /** Default-year day when spring brood is expected (doy of the year that starts). */
  springBroodDoy: number;
}

/** Reproduction bookkeeping (GDD 06 §11), beside `Colony.repro`. */
export interface ReproBook {
  /** Year whose lay window the quota belongs to (0 none). */
  windowYear: number;
  /** Sexual eggs still to designate this window, by caste. */
  quotaGynes: number;
  quotaMales: number;
  /** Sexual eggs designated so far this window. */
  designatedGynes: number;
  designatedMales: number;
  /** Brood ids already examined for designation (eggs laid since this tick are candidates). */
  scanTick: number;
  /** Last day index the gate was evaluated (local midnight). */
  gateDay: number;
  /** Failing gate ids at the last evaluation ([] = all pass). */
  gateFails: string[];
  /** Last flight-day roll: day index, probability, whether it launched or was offered. */
  rollDay: number;
  lastP: number;
  /** A launch was offered (policy `ask`) and waits for an answer; -1 none, else the tick it was offered. */
  askTick: number;
  /**
   * Policy `auto-release`: the day's roll succeeded and the flight launches at this tick (the launch hour start),
   * provided the day is still valid then; -1 or missing: none.
   */
  launchAtTick?: number;
  /** Flight in assembly: tick take-off happens (-1 none) and the number of flights launched so far. */
  assemblyUntil: number;
  flightSeq: number;
  /** Id of the flight launched and not yet ended ('' none); its record is the last of `ColonyLifecycleState.flights`. */
  openFlightId: string;
  /** Daughters of the open flight not yet written to `daughters` (the possessed gyne's may still be added). */
  openFounded: number;
  /** Totals over the game. */
  alatesReared: number;
  alatesFlown: number;
  flights: number;
  daughtersFounded: number;
  /** Loads booked as alate shortfall by demotions (Why view). */
  shortfallLoads: number;
  demoted: number;
  /** Year the leftover alates of the last window were evicted (0 none). */
  expiredYear: number;
  /**
   * Alates that left on a flight, by the death cause their removal was booked under (gynes `dispersed`, males
   * `old-age`) and by season index: the epitaph keeps them out of the colony's causes of death. Missing: none.
   */
  flownByCause?: Record<string, number>;
  flownBySeason?: number[];
}

/** The possessed nuptial flight (GDD 06 §11.6), the gyne's kinematics are on the ant itself (medium 'air'). */
export interface PossessedFlight {
  flightId: string;
  gyneId: number;
  phase: 'ascend' | 'lek' | 'mate' | 'descend' | 'land' | 'ended';
  startTick: number;
  energy: number;
  mating: number;
  mated: boolean;
  /** Lek centre (males hover here), mm. */
  lek: { x: number; y: number; z: number };
  /** Heading in the XZ plane, radians. */
  yaw: number;
  /** How it ended: '' flying, 'landed', 'dispersed' (left the map), 'land-now', 'exhausted', 'timeout'. */
  outcome: string;
  /** Seconds flown. */
  seconds: number;
  /** Landing point (mm) and whether it was diggable. */
  landing: { x: number; y: number; z: number } | null;
  landingDiggable: boolean;
  /** Zone type where she came down (null: none or off-map). */
  landingZone: ZoneType | null;
  /** She founded a daughter colony (drawn when her flight ended). */
  founded: boolean;
}

/** Queen death, orphan phase and extinction (GDD 06 §13). */
export interface SuccessionBook {
  queenDiedTick: number;
  queenCause: string;
  /** Diagnostic snapshot at queen death: worst chain of causes. */
  queenChain: string[];
  /** Tick the colony had no living ant (-1 alive). */
  emptySinceTick: number;
  extinct: boolean;
  extinctTick: number;
  extinctCause: string;
  causeChain: string[];
  /** The player ended the colony (`retireColony`). */
  retired: boolean;
  /** `last-ants` state raised. */
  lastAnts: boolean;
  /** Peak workers and the year it was reached. */
  peakWorkers: number;
  peakYear: number;
  /** Ants born (eclosed) and food returned (C, P loads) over the colony's life. */
  born: number;
  foodC: number;
  foodP: number;
  /** Largest nest volume (BU^3) and chamber count seen. */
  peakVolume: number;
  peakChambers: number;
  /**
   * For each daily history sample (history.daily.workers, same index): the calendar day index it summarises and the
   * simulation tick it was filed at. The calendar jumps at winter and with time cheats, so samples are not one per
   * calendar day. -1: not tracked (samples filed before the tracking started). Missing: none tracked yet.
   */
  sampleDays?: number[];
  sampleTicks?: number[];
  /** Calendar day index the colony economy was on at the last check (the day the next filed sample summarises). */
  trackDay?: number;
  /** Date of the queen's death (calendar), null if she lives. Missing: older records (derive from queenDiedTick). */
  queenDied?: DateStamp | null;
}

export interface ColonyLifecycleState {
  /** Winter reports, oldest first (one per resolved winter). */
  winters: WinterRecord[];
  /** Tick the overwinter banner showed (-1 none) and the tick a delay ends (-1 none). */
  bannerTick: number;
  delayUntilTick: number;
  /** Year whose notice was given (0 none). */
  noticeYear: number;
  /**
   * Hourly brood-weighted chamber temperatures (C) of the last WINTER_ACTIVE_WINDOW_GD, oldest first, for the
   * heated-nest rule (GDD 06 §6.1), and the tick of the last sample. Missing: none yet.
   */
  broodTempLog?: number[];
  /**
   * Simulation tick of each `broodTempLog` sample (same length). An hour without brood adds no sample, so the ticks
   * say which samples still lie inside the window. Missing (older saves): the samples are taken as hourly, ending at
   * `broodTempTick`.
   */
  broodTempTicks?: number[];
  broodTempTick?: number;
  /** Calendar tick of the last sample: a calendar jump (winter, time cheats) since then makes the log stale. */
  broodTempCal?: number;
  /**
   * Last simulation tick a player alert of each winter hazard was active (alert kind -> tick), for the lapse loss cap
   * (ruling R24, overwinter/begin.ts). Missing: none seen.
   */
  hazardAlertTicks?: Record<string, number>;
  repro: ReproBook;
  flight: PossessedFlight | null;
  /** This game's flights and the daughters they produced (copied into the device Lineage by the game layer). */
  flights: FlightRecord[];
  daughters: DaughterRecord[];
  succession: SuccessionBook;
  /** Stamp of the colony's founding (lineage record). */
  founded: DateStamp | null;
}
