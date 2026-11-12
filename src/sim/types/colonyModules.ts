// Species economy-module state blocks on a Colony (GDD 07 A.3). A block is null when the module is disabled.

import type { Vec3 } from '@/core/math/vec3';
import type { TimeSeries } from '@/core/timeSeries';
import type { GardenState, NestSiteRole, NestSiteState, SeedClass, SeedCohortState } from './ids/species';

/** honeydew-ranching (Lasius). */
export interface HoneydewModule {
  /** Herd ids claimed by the colony. */
  herdClaims: number[];
  /** Honeydew yield history, loads per game day. */
  yield7: TimeSeries;
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
}

export interface GranaryState {
  chamberId: number;
  cohorts: SeedCohort[];
}

/** granary (Messor). */
export interface GranaryModule {
  granaries: GranaryState[];
  /** Milled seed paste, loads, and its half-life in ticks. */
  pasteLoads: number;
  pasteHalfLifeTicks: number;
  middens: { entranceId: number; pileId: number; viableSeeds: number }[];
  seedlings: { pos: Vec3; plantedTick: number }[];
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
