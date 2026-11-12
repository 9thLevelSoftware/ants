// Colony: player or rival (contracts guidance §6, GDD 02 App. A, GDD 05 App. A, GDD 06 App. A, GDD 07 A.3).
// Per-task arrays are indexed by TASKS order. All loads are sim-native (one simulated ant = one ant).

import type { Vec3 } from '@/core/math/vec3';
import type { ColonySpeciesId, Task } from './ids';
import type { AllocationGroup, StarvationStage } from './ids/ants';
import type { Stance } from './ids/ecology';
import type { AlatePolicy } from './ids/progression';
import type { StockTarget } from './ids/species';
import type { FungusModule, GranaryModule, HoneydewModule, WoodModule } from './colonyModules';
import type { Nutrients } from './refs';

/** In-nest food pool (social stomach + store chambers), loads (D2.15). */
export interface ColonyStores {
  c: number;
  p: number;
  /** Toxin pool (bait), loads equivalent (GDD 05 text "toxinPool" means this field, D1.17). */
  toxin: number;
  /** Food currently held in workers' crops, loads (part of the pool, for display). */
  inCrops: Nutrients;
  /** Current capacity from store chambers and stomach, loads. Additive. */
  cap: Nutrients;
}

/** Running food ledger for the current game day, loads (GDD 02 §5.2). */
export interface ColonyLedger {
  inDeliveryC: number;
  inDeliveryP: number;
  inRecycledC: number;
  inRecycledP: number;
  outWorkersC: number;
  outQueenC: number;
  outQueenP: number;
  outLarvaeC: number;
  outLarvaeP: number;
  outSpoiledC: number;
  outSpoiledP: number;
  outRationC: number;
  /** Food in transit (crops outside the nest), loads. */
  transitC: number;
  transitP: number;
  /** Tick the ledger day started. */
  dayStartTick: number;
}

export interface ColonyNeeds {
  /** Demand rates, loads per game day (EMA). */
  rateC: number;
  rateP: number;
  /** Normalised need 0..1. */
  needC: number;
  needP: number;
  /** Protein share of foraging effort 0..1. */
  sP: number;
  /** Protein-deficit flag (GDD 05 aphid culling). */
  proteinDeficit: boolean;
}

/** Allocation shares per group, percent 0..100 summing to 100. */
export type GroupShares = Record<AllocationGroup, number>;

/**
 * Queen directives (D2.16): the one priorities channel. GDD 02 §12 keys, GDD 05 stance, GDD 06 reproduction,
 * GDD 07 species extras (ignored by species that do not list them in `directiveExtras`), GDD 03 cold sealing.
 * The nest architect mode is not a directive (`setAutoExpand`).
 */
export interface Directives {
  allocation: 'auto' | GroupShares;
  /**
   * In-group sub-shares 0..1 for the species' `directiveTasks` (e.g. Atta `cut` vs `forage` inside Forage). Only
   * listed tasks are present; an empty object means the species default split.
   */
  taskShares: Partial<Record<Task, number>>;
  /** Diet emphasis: 'auto' or -100 (carbohydrate) .. +100 (protein). */
  diet: 'auto' | number;
  /** Alate investment 0..1 (UI presets Workers only / Balanced / Raise alates = 0 / 0.5 / 1; GDD 06 §11.3). */
  alateInvestment: number;
  /** Share of gynes among alates 0.2..0.6. */
  gyneShare: number;
  alatePolicy: AlatePolicy;
  stockTarget: StockTarget;
  stayIn: boolean;
  /** Tick stayIn auto-clears, -1 none. */
  stayInUntil: number;
  /** Seal entrances in cold weather (GDD 03 §4.2). */
  sealInCold: boolean;
  stance: Stance;
  /** -1..1, 0 = species caste mix (GDD 07). */
  casteEmphasis: number;
  granaryHygiene: number;
  leafSelectivity: number;
  satelliteAuto: boolean;
  hideFrass: boolean;
  hitchhikerEscort: boolean;
  externalHeap: boolean;
}

/** Task allocation state (GDD 02 §6). Arrays length = TASK_COUNT (18). */
export interface AllocationState {
  demand: Float32Array;
  target: Int16Array;
  /** Per-task headcount cache (actual). */
  actual: Int16Array;
  lastTick: number;
}

/** A piece of news about a food source shared on contact (GDD 02 §6.7). */
export interface SourceNews {
  sourceId: number;
  pos: Vec3;
  tick: number;
}

/** Reproduction state (GDD 06 §11; D1.13). Investment, gyne share and policy are directives. */
export interface ReproductionState {
  /** Alate brood currently being reared / alates present. */
  alateRearing: number;
  targetAlates: number;
  shortfall: number;
  lastLaunchTick: number;
  /** Flight record ids (FlightRecord.id in the Lineage store) of this colony's flights. */
  flights: string[];
  /** Active flight, null none. */
  active: { id: string; phase: string; possessedAntId: number; startTick: number; energy: number; matingProgress: number } | null;
}

/**
 * Abstract population model of a rival colony (GDD 05 §3.2 record minus `colonyId`; D1.16). The colony's species,
 * nest ids and real queens are on the Colony itself. Null for full-fidelity colonies.
 */
export interface RivalAbstract {
  /** Abstract workers N, brood B, stores C_s / P_s (loads). */
  n: number;
  b: number;
  cS: number;
  pS: number;
  /** Aggression 0..1. */
  agg: number;
  /** Bitmask of colony slots (territory slot index) whose nest this colony knows. */
  knowsNest: number;
  orphaned: boolean;
  incipient: boolean;
  raid: { targetColony: number; partyIds: number[]; startTick: number; startSize: number } | null;
  lastRaidTick: number;
  /** Ant ids currently fielded as real agents. */
  fieldedIds: number[];
  /** Virtual herd tending 0..1. */
  virtualTend: number;
  /** Territory slot index (0 = player). */
  territorySlot: number;
}

/** Per-colony counters (recounted daily; GDD 02 §13). */
export interface ColonyCounters {
  eggsLaid: number;
  eclosions: number;
  deaths: number;
  broodDeaths: number;
  trips: number;
  tripSuccesses: number;
  /** Sum of trip durations (ticks) for the mean. */
  tripTicks: number;
  intakeTodayC: number;
  intakeTodayP: number;
  useTodayC: number;
  useTodayP: number;
}

export interface Colony {
  id: number;
  alive: boolean;
  species: ColonySpeciesId;
  isPlayer: boolean;
  fidelity: 'full' | 'abstract';
  /** Current queen ant id, -1 none (orphaned). */
  queenId: number;
  /** All queens (GDD 06 §13; D1.14): ant id and drawn lifespan in game days (null = no senescence). Age derives from bornTick. */
  queens: { antId: number; lifespanDays: number | null }[];
  nestIds: number[];
  stores: ColonyStores;
  ledger: ColonyLedger;
  needs: ColonyNeeds;
  starvationStage: StarvationStage;
  starvationSinceTick: number;
  directives: Directives;
  alloc: AllocationState;
  /** Headcount per allocation group (cache). */
  groupCounts: Record<AllocationGroup, number>;
  /** Living adult ants of every caste, queen included (cache maintained by spawnAnt / killAnt). */
  livingAnts: number;
  /** Mean yield per forager trip, loads (EMA). */
  yieldPerForager: number;
  news: SourceNews[];
  knownSourceIds: number[];
  /** Explored-cell bits over the pheromone grid (scouting). */
  exploredBits: Uint8Array;
  /** Tick the colony was orphaned, -1 never. */
  orphanedAtTick: number;
  foundedTick: number;
  repro: ReproductionState;
  /** Rival abstract model; null for full-fidelity colonies. */
  rival: RivalAbstract | null;
  /**
   * Danger grid of the player colony (GDD 05 §2.5; D1.16): w * h cells of DANGER_CELL_BU over the world, row-major
   * from the origin. Empty (length 0) for other colonies and until the creatures module allocates it.
   */
  danger: Float32Array;
  counters: ColonyCounters;
  /** Economy modules; null when the species does not use them. */
  honeydew: HoneydewModule | null;
  wood: WoodModule | null;
  granary: GranaryModule | null;
  fungus: FungusModule | null;
  /** Messor hybridogenetic lineage of the queen (GDD 07 5.3.3); null otherwise. */
  lineage: { own: 'A' | 'B'; mates: ('A' | 'B')[] } | null;
  /**
   * Colony-core bookkeeping (GDD 02 §5-§14) that the fields above do not hold. Additive (colony-core): created by the
   * colony module on its first update, so it is absent only on a colony that has never been simulated.
   */
  core?: ColonyCoreState;
  /** Outdoor-behaviour bookkeeping (GDD 02 §8.4, App. C). Additive (beh-forage): created on first use. */
  forage?: ColonyForageState;
}

/** Colony-level memory of the outdoor behaviours' trail observers (owner: src/sim/ants/behaviours/outdoor/monitor.ts). */
export interface ColonyForageState {
  /** Recent trail losses inside the trail-lost window (GDD 02 §8.4): source of the lost trail (-1 none) and tick. */
  trailLost: { sourceId: number; tick: number }[];
  /** Sources whose `trail-established` event was emitted (once per colony and source). */
  trailsUp: number[];
}

/**
 * Colony-core bookkeeping: lifetime ledger, starvation and alert timers, rate caches and diagnostics windows.
 * Timers are absolute ticks (-1 = condition not holding). Rates are loads (or eggs) per game day.
 */
export interface ColonyCoreState {
  /** Cumulative pool ledger since the colony was first simulated (`Colony.ledger` is the current game day). */
  life: ColonyLedger;
  /** Calendar day index (0-based) the daily ledger and today counters belong to. */
  day: number;
  /** Living adult workers at the last colony update (capacity and demand cache). */
  workers: number;
  /** Solid pile capacity of the colony's chambers, loads, at the last colony update. */
  pileCap: number;
  /** Tick pool C / pool P became zero, -1 while positive. */
  cZeroSinceTick: number;
  pZeroSinceTick: number;
  /** Tick the exit condition of the current starvation stage began to hold, -1 none. */
  exitSinceTick: number;
  /** Tick colony needP rose to MINIM_NEED_P or more, -1 none. */
  minimSinceTick: number;
  /** Tick the pool reached capacity, -1 when not full. */
  fullSinceTick: number;
  /** First tick the next brood item may be cannibalised (CANNIBAL_RATE). */
  cannibalReadyTick: number;
  /** Spoiled loads not yet turned into a `spoiled-food` waste item. */
  spoiledPending: number;
  /** EMA of eggs laid, eggs per game day. */
  layingRate: number;
  /** Departures of foragers since the start of the day. */
  departuresToday: number;
  /**
   * Named running sums and caches (cycle sums of per-gd rates, the last instantaneous rates, laying factors,
   * diagnostics window sums). Keys are documented in src/sim/colony/core.ts.
   */
  acc: Record<string, number>;
  /** Diagnostics status hysteresis: candidate status per diagnostic id and the tick it first appeared. */
  diagPending: { id: string; status: string; sinceTick: number }[];
  /** Adult deaths of this colony since the start of the day, by cause. */
  deathsToday: Record<string, number>;
  /** Cumulative population and intake accounting (GDD 02 §13.1). Additive (colony-core review): created on first use. */
  pop?: ColonyPopulation;
}

/** Intake of one food kind or one source, cumulative: deliveries and loads accepted into the pool. */
export interface IntakeTally {
  n: number;
  c: number;
  p: number;
  /** Tick of the last delivery. */
  lastTick: number;
}

/** Cumulative counters of GDD 02 §13.1 that `ColonyCounters` does not hold. Keys of the records are ids as strings. */
export interface ColonyPopulation {
  /** Adult deaths by cause (canonical `DeathCause` ids), whole life. */
  deathsByCause: Record<string, number>;
  /** Brood deaths by cause (`BroodDeathCause` ids, incl. `cannibalised`), whole life. */
  broodDeathsByCause: Record<string, number>;
  eggsHatched: number;
  larvaePupated: number;
  /** Deliveries by food kind (source kind id, or the action library's kind string). */
  intakeByKind: Record<string, IntakeTally>;
  /** Deliveries by source id; entries of sources gone for a day are dropped at the daily recount. */
  intakeBySource: Record<string, IntakeTally>;
  /** Unloads with a measured wait, and their summed wait in ticks (mean unload wait). */
  unloads: number;
  unloadWaitTicks: number;
  /** Corrections the daily full recount made to incrementally kept counts (should stay 0). */
  recountFixes: number;
  /** Tick of the last daily recount, -1 never. */
  lastRecountTick: number;
}
