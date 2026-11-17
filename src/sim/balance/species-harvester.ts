// Implementation tunables of the granary module (Messor barbarus, GDD 07 §5.3 and §6.3; task species-harvester).
// Species values (seed classes, cohort rates, milling times, heat limits) live in the species data block
// `modules.granary` (src/sim/species/data/messor-barbarus.ts); this file holds only how the module applies them.
// [EST] = design estimate. Units on every name.

import type { SeedClass } from '@/sim/types';

// ---- cadence ----

/** Ticks between granary integrations (cohort moisture, germination, rot, paste decay, release). 2.5 game s. */
export const GRANARY_STEP_TICKS = 25;
/** Ticks between seed-source refreshes (standing crop, seed rain). */
export const SEED_SOURCE_STEP_TICKS = 250;
/** Ticks between diagnostics publications. */
export const GRANARY_DIAG_TICKS = 250;
/** Ticks between patrol-gate checks. */
export const PATROL_STEP_TICKS = 10;

// ---- seed sources (GDD 05 grass-seed nodes, activated for a granary species) ----

/** Share of the map's grass-seed nodes holding each seed class (by node id hash) [EST]. */
export const SEED_CLASS_SHARE: Readonly<Record<SeedClass, number>> = { S: 0.5, M: 0.35, L: 0.15 };
/** Carry bulk of one seed, in loads of carry capacity: minors 0.5 take S, media 1.0 take M, L needs a major (2.5). */
export const SEED_BULK: Readonly<Record<SeedClass, number>> = { S: 0.3, M: 0.8, L: 2.0 };
/** Seed length for the item visuals, BU. */
export const SEED_LENGTH_BU: Readonly<Record<SeedClass, number>> = { S: 0.18, M: 0.32, L: 0.55 };
/** Hardness range per class (plant species vary; larger seeds tend to be harder) [EST]. */
export const SEED_HARDNESS: Readonly<Record<SeedClass, readonly [number, number]>> = {
  S: [0.1, 0.5], M: [0.2, 0.7], L: [0.4, 0.95],
};
/** Seeds a full node holds (standing crop on the ground and in the heads) [EST]. */
export const SEED_NODE_UNITS: readonly [number, number] = [30, 90];
/** Seed rain inside GDD 05's grass-seed window (doy 10-20): share of a node's capacity dropped per game day. */
export const SEED_RAIN_PER_GD = 0.25;
/** Outside the window the seed bank on the ground slowly shrinks (buried, eaten by others, germinated). */
export const SEED_BANK_LOSS_PER_GD = 0.02;
/** Seed bank at game start, share of capacity (the colony starts in autumn after the seed rain). */
export const SEED_BANK_START = 0.8;
/** Odour radius of a seed node, BU (harvesters find seed patches by search; GDD 05 gives none) [EST]. */
export const SEED_ODOUR_BU = 10;
/** Recruitment quality of a seed node 0..1.3. */
export const SEED_QUALITY = 1.0;
/** Feeding slots of a seed node. */
export const SEED_SLOTS = 4;

// ---- granary ----

/** Most cohorts kept per granary; beyond it new seeds merge into the closest cohort. */
export const COHORTS_MAX = 12;
/** A cohort with less than this many loads is dropped (its loads to rot). */
export const COHORT_MIN_LOADS = 1e-4;
/** Seeds deposited during rain (rain intensity above this) arrive wet (u = seedUWet). */
export const WET_ARRIVAL_RAIN = 0.2;

// ---- paste release into the colony pool (the pool is what nurses feed larvae from) ----

/** The pool is kept topped up from the paste stock to this many game days of colony need. */
export const PASTE_POOL_BUFFER_GD = 0.6;
/** Smallest release, loads (avoids per-tick dribbles). */
export const PASTE_RELEASE_MIN = 0.02;

// ---- milling and care labour ----

/** Loads one mill-seed action processes (AI); the action is continuous and stops after this many. */
export const MILL_BATCH_LOADS = 2;
/** Loads one gnaw-radicle action processes. */
export const GNAW_BATCH_LOADS = 1;
/** Seed loads moved per relocation trip (GDD 07 §6.3.4: 1 load per trip). */
export const RELOCATE_LOADS = 1;
/** Workers that `mill` demand asks for per load of paste deficit per game day (labour model) [EST]. */
export const MILL_LOADS_PER_MILLER_GD = 12;
/** Millers asked for at most this share of the workers. */
export const MILL_MAX_FRAC = 0.35;
/** At least this many millers while there is millable seed and the paste stock is under target. */
export const MILL_MIN = 1;
/** Granary-care workers at most this share of the workers. */
export const CARE_MAX_FRAC = 0.3;

// ---- middens (GDD 07 §6.3.8) ----

/** Chaff / refuse loads per chaff item put on the midden. */
export const CHAFF_ITEM_LOADS = 0.5;
/** Chaff items kept per midden (older ones merge into a pile count). */
export const MIDDEN_ITEMS_MAX = 40;
/** Viable seeds per midden at most (the rest of the 2 % rot). */
export const MIDDEN_VIABLE_MAX = 60;
/** Seedlings tracked at most per colony. */
export const SEEDLINGS_MAX = 24;
/** A seedling within this distance of a trunk trail is trampled, BU (GDD 07: the 6 BU ribbon). */
export const SEEDLING_TRAMPLE_BU = 3;
/** Trail pheromone above which a cell counts as trunk-trail ribbon. */
export const TRUNK_TRAIL_PH = 0.5;

// ---- heat rhythm and patrol gate (GDD 07 §5.3.7) ----

/** Base maximum trip distance from the entrance, BU (scaled by the heat limit). */
export const TRIP_BASE_BU = 600;
/** Heat samples along the colony's trails: step and count. */
export const HEAT_SAMPLE_STEP_BU = 30;
export const HEAT_SAMPLES_MAX = 12;
/** Patrollers sent each morning at most this share of the workers (and at least 1). */
export const PATROL_MAX_FRAC = 0.2;
/** Colonies below this many workers have no patrol gate (nanitic colonies forage at once). */
export const PATROL_GATE_MIN_WORKERS = 12;
/** Patrol hold after a patroller died or met alarm: 1 clock hour = 25 game s (species data writes 3600). */
export const PATROL_HOLD_TICKS = 250;
/** Fail-safe: a gate still closed this long after the window opened opens anyway (held), ticks (2 h). */
export const PATROL_FAILSAFE_TICKS = 500;
/** Alarm pheromone at the entrance that counts as "met alarm". */
export const PATROL_ALARM_PH = 0.5;
/** Surface activity below which the active window is closed (the gate resets for the next window). */
export const WINDOW_ACTIVITY_MIN = 0.15;

// ---- winter (GDD 07 §5.3.7: consumption drawn from granary stock, converted at 0.8) ----

/** Game days of winter need moved from the granary into the pool when the banner shows. */
export const WINTER_STOCK_GD = 7;
