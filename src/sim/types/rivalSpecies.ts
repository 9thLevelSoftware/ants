// Light species data for rival-only species (ruling 5; GDD 05 §3.1 roster). Static data, not part of SimState.
// Playable species used as rivals (conspecifics) use their full SpeciesDef instead. Stats per caste go through
// `getAntStats(ctx, speciesId, caste)` (src/sim/entities/antStats.ts) for both kinds of species.

import type { ZoneType } from './ids';
import type { RegionId } from './ids/world';
import type { RivalNestTemplate, RivalProfile, RivalSpeciesId, Weapon } from './ids/ecology';

export interface RivalSpeciesDef {
  id: RivalSpeciesId;
  binomial: string;
  commonName: string;
  /** Regions whose roster includes it (GDD 05 §3.1). */
  regions: RegionId[];
  /** Zones it settles in. */
  zones: ZoneType[];
  /** Worker body length, mm, and mass, mg. */
  workerMm: number;
  workerMassMg: number;
  /** Cruise speed of a worker, mm/s. */
  cruiseMmS: number;
  /** Worker hit points and bite damage per strike. */
  maxHp: number;
  bite: number;
  /** Damage reduction 0..1. */
  armour: number;
  /** Special weapon; null = bite only. `specialPower` = sting damage or spray multiplier. */
  special: Weapon | null;
  specialPower: number;
  /** Combat power per worker relative to a Lasius worker (strength S = N x CP x (0.5 + 0.5 agg)). */
  cp: number;
  /** Base aggression 0..1. */
  aggression: number;
  /** Abstract model: start workers, carrying capacity, growth per game day (GDD 05 §3.2). */
  n0: number;
  kMax: number;
  growthPerGd: number;
  /** Share of N fielded as real agents and the caps in peace / war. */
  fieldShare: number;
  fieldCap: { normal: number; war: number };
  /** Surface activity window, °C. */
  activityC: [number, number];
  nocturnal: boolean;
  /** Real queens: count (polygynous species > 1) and hit points each. */
  queens: number;
  queenHp: number;
  queenBite: number;
  /** Retreat at this fraction of maxHp (GDD 05 RETREAT_HEALTH unless the species differs). */
  retreatHealth: number;
  profile: RivalProfile;
  nestTemplate: RivalNestTemplate;
  /** Render colours, CSS hex. */
  bodyColour: string;
  gasterColour: string;
  /** Tier at which the species appears. */
  tier: 'T2' | 'T3';
}
