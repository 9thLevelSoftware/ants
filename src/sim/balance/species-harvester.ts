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
/** Ground seed patches in open ground around the nest (GDD 05 grass-seed "open zones") and their ring, BU [EST]. */
export const SEED_PATCHES = 16;
export const SEED_PATCH_RADIUS_BU: readonly [number, number] = [40, 420];
/** Seed heads a seed plant carries while the seed rain lasts (cut-seed-head detaches 1-3 seeds each) [EST]. */
export const SEED_HEADS_PER_PLANT = 4;

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
/** Loads one gnaw-radicle action processes (the possessed ant), and what an AI care worker takes on at once. */
export const GNAW_BATCH_LOADS = 1;
export const GNAW_AI_BATCH_LOADS = 3;
/** Seed loads moved per relocation trip (GDD 07 §6.3.4: 1 load per trip). */
export const RELOCATE_LOADS = 1;
/** Workers that `mill` demand asks for per load of paste deficit per game day (labour model) [EST]. */
export const MILL_LOADS_PER_MILLER_GD = 12;
/** Millers asked for at most this share of the workers. */
export const MILL_MAX_FRAC = 0.35;
/** At least this many millers while there is millable seed and the paste stock is under target. */
export const MILL_MIN = 1;
/** Damp cohorts count for care demand once their germination clock is past this share of germinatingG. */
export const CARE_ANTICIPATE_G = 0.6;
/** Shortest time a care demand plans to gnaw a cohort in, game s (a cohort about to sprout asks for many, not all). */
export const CARE_WINDOW_MIN_S = 30;
/** Care demand divides by the workers' mean work rate, but not by less than this. */
export const CARE_RATE_FLOOR = 0.25;
/** Granary-care workers at most this share of the workers. */
export const CARE_MAX_FRAC = 0.5;

// ---- middens (GDD 07 §6.3.8) ----

/** Chaff / refuse loads per chaff item put on the midden. */
export const CHAFF_ITEM_LOADS = 0.5;
/** Chaff items kept per midden (older ones merge into a pile count). */
export const MIDDEN_ITEMS_MAX = 40;
/** Viable seeds per midden at most (the rest of the 2 % rot). */
export const MIDDEN_VIABLE_MAX = 60;
/** Seedlings tracked at most per colony. */
export const SEEDLINGS_MAX = 24;
/** A seedling within this distance of a trunk-trail cell centre is trampled, BU (GDD 07: the 6 BU ribbon). */
export const SEEDLING_TRAMPLE_BU = 3;

// ---- trunk trails (GDD 07 §5.3.7) ----

/** Ticks between marks of the cells under laden foragers, and between scent top-ups of the live cells. */
export const TRUNK_MARK_TICKS = 20;
export const TRUNK_REFRESH_TICKS = 300;
/** Trunk-trail cell size, BU (the pheromone cell of the design seed). */
export const TRUNK_CELL_BU = 4;
/** Trail scent a full-strength trunk cell is kept at, ph (the recruitment trail tops it up further). */
export const TRUNK_KEEP_PH = 0.6;
/** Most trunk cells a colony keeps (new ones beyond are not recorded) [EST]. */
export const TRUNK_CELLS_MAX = 1500;

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

// ---- caste destiny (GDD 07 §2.6, §5.3.2) ----

/** Ticks between caste-destiny passes over the colony's brood (a new larva is destined within 1 game s). */
export const CASTE_STEP_TICKS = 10;
/** A major needs the colony's protein (pool P + paste P) to cover this many game days of larval demand (App. E 5). */
export const MAJOR_GATE_GD = 2;
/** Smallest major share of the caste-mix target once majors are unlocked (the §5.3.2 ramp is 0 at N = 40) [EST]. */
export const MAJOR_UNLOCK_MIN_SHARE = 0.03;
/** casteEmphasis (-1..1) scales the major share by 1 + CASTE_EMPHASIS_SPAN x emphasis. */
export const CASTE_EMPHASIS_SPAN = 0.5;
/** Larval protein per larva over its stage when its caste is not decided yet, loads (GDD 07 §2.3 media cost). */
export const UNDECIDED_LARVA_P = 1.2;

// ---- founding (GDD 06 §5.15: winter inside the Messor lapse) ----

/** Survival of each brood item over the winter jump inside the founding lapse (larval overwinter survival). */
export const FOUND_WINTER_BROOD_SURVIVAL = 0.85;
/**
 * After the winter jump the brood stays arrested while the founding cell is colder than this, °C: the lapse skips
 * ahead in steps of FOUND_SPRING_HOLD_STEP_GD (queen drain at the winter rate, no brood simulated) for at most
 * FOUND_SPRING_HOLD_MAX_GD. GDD 06 §5.15 arrests the brood below 14 °C; at 14-16 °C devRate is under 0.2, so the
 * brood would sit for days in the cell paying the founding hazard per day for almost no development [EST].
 */
export const FOUND_SPRING_RESUME_C = 16;
export const FOUND_SPRING_HOLD_STEP_GD = 0.25;
export const FOUND_SPRING_HOLD_MAX_GD = 7;

// ---- granary display (seed items mirroring the stock, for the picture only) ----

/** Seed loads per display seed on a granary floor, the most display seeds per granary, and the sync period. */
export const DISPLAY_LOADS_PER_SEED = 1.5;
export const DISPLAY_SEEDS_MAX = 40;
export const DISPLAY_STEP_TICKS = 100;
