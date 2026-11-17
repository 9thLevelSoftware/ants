// Species economy-module state blocks on a Colony (GDD 07 A.3). A block is null when the module is disabled.

import type { Vec3 } from '@/core/math/vec3';
import type { TimeSeries } from '@/core/timeSeries';
import type { GardenState, NestSiteRole, NestSiteState, SeedClass, SeedCohortState } from './ids/species';

/** honeydew-ranching (Lasius). */
export interface HoneydewModule {
  /** Herd ids claimed by the colony. */
  herdClaims: number[];
  /** Honeydew yield per game day over the last season (capacity = this game's season length). */
  yieldHistory: TimeSeries;
  /** Additive (ecology-plants): honeydew C taken from herds so far on game day `yieldDay`, loads. */
  yieldTodayC?: number;
  /** Additive (ecology-plants): game day (state.tick / TICKS_PER_DAY) yieldTodayC belongs to, -1 none. */
  yieldDay?: number;
}

/** One Camponotus nest site in wood (GDD 07 §6.2). */
export interface NestSite {
  id: number;
  role: NestSiteRole;
  state: NestSiteState;
  /** Nest id of the site's cavity system, -1 none yet. */
  nestId: number;
  /** Wood primitive id. */
  primId: number;
  /** Moisture content % and decay 0..1 of the wood. */
  moisture: number;
  decay: number;
}

/** wood-nesting (Camponotus): sites and satellites. */
export interface WoodModule {
  sites: NestSite[];
  /** 0..1 how visible frass piles are to humans. */
  frassVisibility: number;
  /** Planned queen move; null none. */
  queenMove: { targetSiteId: number; dueTick: number } | null;
}

/** One seed cohort in a granary (Messor). */
export interface SeedCohort {
  seedClass: SeedClass;
  state: SeedCohortState;
  /** Seed loads. */
  loads: number;
  hardness: number;
  /** Moisture u and germination g progress 0..1. */
  u: number;
  g: number;
  /** Additive (species-harvester): radicle gnawed off, the cohort can no longer germinate (GDD 07 §6.3.4). */
  degermed?: boolean;
  /** Additive (species-harvester): game days spent with u above the rot threshold (reset when it dries). */
  wetGd?: number;
  /** Additive (species-harvester): game days spent sprouted (rots when not milled within 1.5 GD). */
  sproutedGd?: number;
}

export interface GranaryState {
  chamberId: number;
  cohorts: SeedCohort[];
  /** Additive (species-harvester): seed capacity, loads (GRANARY_LOADS_PER_BU3 x chamber volume). */
  capacityLoads?: number;
  /** Additive (species-harvester): last humidity read 0..1 and temperature °C of the chamber. */
  humidity?: number;
  tempC?: number;
}

/** Additive (species-harvester): the morning patrol gate of one day (GDD 07 §5.3.7). */
export interface PatrolGateState {
  /** Calendar day (state tick based day index) the gate belongs to, -1 none yet. */
  day: number;
  open: boolean;
  /** Ticks of safe patroller returns today, newest last. */
  returns: number[];
  /** Ant ids of patrollers seen outside today (their return is counted once). */
  out: number[];
  /** Foraging held at the hold multiplier until this tick (patroller killed / alarm), -1 none. */
  holdUntilTick: number;
  /** Tick the gate closed for today (the active window began), -1 none. */
  closedTick: number;
  /** Tick it opened, -1 not yet. */
  openedTick: number;
}

/** Additive (species-harvester): per-larva animal protein bookkeeping (GDD 07 §6.3.7). */
export interface LarvaProteinRecord {
  broodId: number;
  /** fedP the share was last updated at, loads. */
  fedP: number;
  /** Animal protein digested so far, loads. */
  animalP: number;
}

/** granary (Messor). */
export interface GranaryModule {
  granaries: GranaryState[];
  /** Milled seed paste, loads, and its half-life in ticks. */
  pasteLoads: number;
  pasteHalfLifeTicks: number;
  middens: { entranceId: number; pileId: number; viableSeeds: number }[];
  seedlings: { pos: Vec3; plantedTick: number }[];
  /** Additive (species-harvester): animal protein in the colony P pool, loads (the rest of pool P is paste). */
  poolAnimalP?: number;
  /** Additive (species-harvester): colony pool P after the last granary step, loads (composition tracking). */
  poolPLast?: number;
  /** Additive (species-harvester): chaff and rotten seed loads not yet put on a midden. */
  chaffPending?: number;
  rottenPending?: number;
  /** Additive (species-harvester): the morning patrol gate. */
  patrol?: PatrolGateState;
  larvae?: LarvaProteinRecord[];
  /** Additive (species-harvester): rolling counters for diagnostics (loads per game day, decayed daily). */
  milledToday?: number;
  milledYesterday?: number;
  seedInToday?: number;
  seedInYesterday?: number;
  pasteUseToday?: number;
  pasteUseYesterday?: number;
  /** Additive (species-harvester): game day the counters above belong to. */
  counterDay?: number;
  /** Additive (species-harvester): the tick the granary systems last integrated, -1 never. */
  lastStepTick?: number;
}

/** One fungus garden (Atta). Symbols follow GDD 07 §6.4 (G biomass, h health, i infection, c substrate, W waste). */
export interface GardenRecord {
  chamberId: number;
  state: GardenState;
  biomass: number;
  health: number;
  infection: number;
  substrate: number;
  waste: number;
}

/** fungus-garden (Atta). */
export interface FungusModule {
  gardens: GardenRecord[];
  rejected: { plantId: number; untilTick: number }[];
  gardenLess: boolean;
  gardenLessTick: number;
}
