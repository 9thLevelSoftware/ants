// Colony: player or rival (contracts guidance §6, GDD 02 App. A, GDD 05 App. A, GDD 06 App. A, GDD 07 A.3).
// Per-task arrays are indexed by TASKS order. All loads are sim-native (one simulated ant = one ant).

import type { Vec3 } from '@/core/math/vec3';
import type { ColonySpeciesId } from './ids';
import type { AllocationGroup, StarvationStage } from './ids/ants';
import type { Stance } from './ids/ecology';
import type { ArchitectMode } from './ids/nest';
import type { AlatePolicy } from './ids/progression';
import type { ProductionMode, StockTarget } from './ids/species';
import type { FungusModule, GranaryModule, HoneydewModule, WoodModule } from './colonyModules';

/** In-nest food pool (social stomach + store chambers), loads. */
export interface ColonyStores {
  c: number;
  p: number;
  /** Toxin pool (bait), loads equivalent (GDD 05 `toxinPool`). */
  toxin: number;
  /** Food currently held in workers' crops, loads (part of the pool, for display). */
  inCropsC: number;
  inCropsP: number;
  /** Current capacity from store chambers and stomach, loads. */
  capC: number;
  capP: number;
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

/** Queen directives (GDD 02 §12, GDD 05 stance, GDD 06 reproduction, GDD 07 extras, GDD 03 sealing). */
export interface Directives {
  allocation: 'auto' | GroupShares;
  /** Diet emphasis: 'auto' or -100 (carbohydrate) .. +100 (protein). */
  diet: 'auto' | number;
  production: ProductionMode;
  architect: ArchitectMode;
  stockTarget: StockTarget;
  stayIn: boolean;
  /** Tick stayIn auto-clears, -1 none. */
  stayInUntil: number;
  stance: Stance;
  /** Seal entrances in cold weather (GDD 03 §4.2). */
  sealInCold: boolean;
  /** Alate investment 0..1, gyne share 0.2..0.6, policy (GDD 06 §11). */
  alateInvestment: number;
  gyneShare: number;
  alatePolicy: AlatePolicy;
  /** GDD 07 species extras (ignored by species that do not use them). */
  casteEmphasis: number;
  granaryHygiene: number;
  leafSelectivity: number;
  satelliteAuto: boolean;
  hideFrass: boolean;
  hitchhikerEscort: boolean;
  externalHeap: boolean;
}

/** Task allocation state (GDD 02 §6). Arrays length = TASKS.length. */
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

/** Reproduction state (GDD 06 §11, App. A `repro`). */
export interface ReproductionState {
  /** Alate brood currently being reared / alates present. */
  alateRearing: number;
  targetAlates: number;
  shortfall: number;
  lastLaunchTick: number;
  /** Flight record ids (FlightRecord in progression). */
  flightIds: number[];
  /** Active flight, null none. */
  active: { id: number; phase: string; possessedAntId: number; startTick: number; energy: number; matingProgress: number } | null;
}

/** Abstract population model of a rival colony (GDD 05 §3.2). Null for full-fidelity colonies. */
export interface AbstractColonyState {
  /** Abstract workers, brood, stores (loads). */
  n: number;
  b: number;
  cS: number;
  pS: number;
  /** Queen count (polygynous rivals). */
  queens: number;
  aggression: number;
  /** Knows where the player's nest is. */
  knowsNest: boolean;
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
  /** All queens (ch06 queen death): ant id, age days, lifespan days (-1 = none). */
  queens: { antId: number; ageDays: number; lifespanDays: number }[];
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
  reproduction: ReproductionState;
  abstract: AbstractColonyState | null;
  counters: ColonyCounters;
  /** Economy modules; null when the species does not use them. */
  honeydew: HoneydewModule | null;
  wood: WoodModule | null;
  granary: GranaryModule | null;
  fungus: FungusModule | null;
  /** Messor hybridogenetic lineage of the queen (GDD 07 5.3.3); null otherwise. */
  lineage: { own: 'A' | 'B'; mates: ('A' | 'B')[] } | null;
}
