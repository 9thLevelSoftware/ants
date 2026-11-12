// Nest architect balance (GDD 03 §8). Lengths in BU, durations in game seconds (`_S`), volumes in BU^3. The
// species nest template itself (sizes, depth bands, footprint, caps) is in nestTemplates.ts; this file holds the
// architect-only parts of GDD 03 §8.2 (required types, cover weights) and the §8.3 / §8.4 numbers.

import type { ChamberSize, ChamberType, SpeciesId } from '@/sim/types';

// ---- needs (GDD 03 §8.3) ----

/** Crowding: ρ = adult space units / resting capacity. Trigger and priority steps; new chambers aim at ρ <= TARGET. */
export const CROWDING_TRIGGER = 0.85;
export const CROWDING_HIGH = 1.1;
export const CROWDING_URGENT = 1.5;
export const CROWDING_TARGET = 0.7;
/** Below this many adult workers a crowding plan is a `general` chamber instead of `rest`. */
export const CROWDING_GENERAL_BELOW = 40;

/** Brood space: ρ_b = brood space units (+ anticipation) / brood capacity. */
export const BROOD_TRIGGER = 0.8;
export const BROOD_HIGH = 1.0;
export const BROOD_URGENT = 1.3;
/** Size choice of a brood-space nursery: the smallest bringing ρ_b down to this (recorded decision, as crowding). */
export const BROOD_TARGET = 0.7;
/** Anticipation: eggs laid within this window count this much extra (GDD 03 §8.3: 0.5 x eggs of the last 0.5 gd). */
export const BROOD_RECENT_EGG_S = 300;
export const BROOD_RECENT_EGG_WEIGHT = 0.5;

/** Food space: solid food loads / capacity of food + general chambers. */
export const FOOD_TRIGGER = 0.8;
export const FOOD_TARGET = 0.7;
/** ... or this many food items lying outside storage chambers for at least FOOD_LOOSE_S. */
export const FOOD_LOOSE_ITEMS = 10;
export const FOOD_LOOSE_S = 150;
/** Chamber a food-space need asks for, per species (GDD 03 §8.3: food; MB seeds: granary). */
export const FOOD_CHAMBER_TYPE: Record<SpeciesId, ChamberType> = {
  'lasius-niger': 'food', 'messor-barbarus': 'granary', 'atta-texana': 'food', 'camponotus-pennsylvanicus': 'food',
};
/** Chamber types that store solid food (GDD 03 §8.3 food-space capacity). */
export const FOOD_STORE_TYPES: readonly ChamberType[] = ['food', 'general'];

/** A required chamber type (GDD 03 §8.2 `missing-type`): `count` chambers of `type` from `workers` adult workers. */
export interface TypeRequirement {
  workers: number;
  type: ChamberType;
  size: ChamberSize;
  count: number;
}

/**
 * Required types by adult workers (GDD 03 §8.2). LN: >= 8 nursery S, >= 25 food S, >= 40 rest M, >= 150 a second
 * nursery M. The royal chamber is required whenever a living queen has none (handled by the needs code).
 */
export const REQUIRED_TYPES: Record<SpeciesId, readonly TypeRequirement[]> = {
  'lasius-niger': [
    { workers: 8, type: 'nursery', size: 's', count: 1 },
    { workers: 25, type: 'food', size: 's', count: 1 },
    { workers: 40, type: 'rest', size: 'm', count: 1 },
    { workers: 150, type: 'nursery', size: 'm', count: 2 },
  ],
  'messor-barbarus': [
    { workers: 10, type: 'nursery', size: 's', count: 1 },
    { workers: 30, type: 'granary', size: 's', count: 1 },
  ],
  'atta-texana': [{ workers: 10, type: 'fungus', size: 's', count: 2 }],
  'camponotus-pennsylvanicus': [{ workers: 8, type: 'nursery', size: 's', count: 1 }],
};
/** Size of an architect royal chamber (a queen without one). */
export const ROYAL_PLAN_SIZE: ChamberSize = 's';

// ---- throttles (GDD 03 §8.3) ----

/**
 * Staggered evaluation: the architect system runs every ARCH_SLOT_TICKS (ticks; a divisor of ARCHITECT_EVERY,
 * >= 50 so it keeps its own tick among the periodic systems) and evaluates at most this many due nests per run.
 */
export const ARCH_SLOT_TICKS = 50;
export const ARCH_NESTS_PER_SLOT = 1;

/** Concurrent non-terminal architect plans: 1 below 50 workers, 2 below 500, 3 above. */
export const CONCURRENT_PLANS: readonly { below: number; plans: number }[] = [
  { below: 50, plans: 1 }, { below: 500, plans: 2 }, { below: Infinity, plans: 3 },
];
/** No new plan while fewer ants than this can dig. */
export const ARCH_MIN_DIGGERS = 2;
/** New plans per evaluation and nest (keeps the diggers from being flooded with plans). */
export const ARCH_NEW_PER_EVAL = 1;
/** The architect withdraws its own plan only below this progress, and only when its need has gone. */
export const ARCH_WITHDRAW_PROGRESS = 0.25;

// ---- failures and blacklist (GDD 03 §7.8) ----

/** Blocked reasons that mean the SITE failed (not the colony: no-diggers, temperature, season, cap, flooded). */
export const SITE_FAILURE_REASONS: readonly string[] = ['obstructed', 'unreachable', 'invalidated', 'unstable', 'foreign-contact'];
/** An architect plan stalled for a site reason this long is withdrawn and counts as one failure of its site. */
export const ARCH_FAIL_STALL_S = 60;
/** Failures of one site (within ARCH_SITE_RADIUS_BU) before it is blacklisted (for ARCH_BLACKLIST_S, balance/nest). */
export const ARCH_FAIL_STRIKES = 2;
/** A failure is forgotten after this, game s. */
export const ARCH_STRIKE_MEMORY_S = 2400;
/** Radius of a site for strikes and the blacklist (GDD 03 §7.8: 8 BU). */
export const ARCH_SITE_RADIUS_BU = 8;

// ---- placement (GDD 03 §8.4) ----

/** Candidate wall spots per placement, and the count below which composite candidates are added. */
export const ARCH_CANDIDATES = 48;
export const ARCH_COMPOSITE_BELOW = 8;
/** Composite candidates (a connector tunnel or shaft toward the band) per placement. */
export const ARCH_COMPOSITE_CANDIDATES = 16;
/** Cover candidates (connector toward the underside of a non-diggable cover) per placement. */
export const ARCH_COVER_CANDIDATES = 8;
/** Wall spots qualify within the depth band +- this, BU. */
export const ARCH_BAND_SLACK_BU = 4;
/** Terrain relief allowed inside the footprint when chunks are pre-filtered by depth (spots are then tested
 * against their own column's ground), BU. */
export const ARCH_SPOT_RELIEF_BU = 4;
/** A planned room keeps WALL_MIN / FLOOR_MIN to all other cavities except within this of its anchor, BU. */
export const ROOM_ANCHOR_EXEMPT_BU = 1.5;
/** Chamber yaw jitter around the wall normal, degrees (U(-J, J)). */
export const ARCH_YAW_JITTER_DEG = 30;
/** Score weights (GDD 03 §8.4). floodRisk is T2 (always 0 in T1). */
export const SCORE_W = {
  depthFit: 3, climateFit: 2, proximity: 1.5, digCost: -1, floodRisk: -3, pathCost: -1, compactness: 0.5,
} as const;
/** depthFit falls to 0 this far outside the band, BU. */
export const DEPTH_FIT_FALLOFF_BU = 8;
/** proximity = max(0, 1 - path / PROXIMITY_BU); `others` value for types without a related target. */
export const PROXIMITY_BU = 60;
export const PROXIMITY_OTHER = 0.5;
/** digCost = min(1, targetVolume / (digSpeed x DIGCOST_VOLUME)). */
export const DIGCOST_VOLUME = 200;
/** cover = 1 when the column above the ceiling reaches a non-diggable solid within this, BU. */
export const COVER_REACH_BU = 15;
/** Cover weight per species and type (GDD 03 §8.2: LN 1.5, nursery 2.5; MB 0.5; AT, CP 0). */
export const COVER_WEIGHT: Record<SpeciesId, { base: number; byType: Partial<Record<ChamberType, number>> }> = {
  'lasius-niger': { base: 1.5, byType: { nursery: 2.5 } },
  'messor-barbarus': { base: 0.5, byType: {} },
  'atta-texana': { base: 0, byType: {} },
  'camponotus-pennsylvanicus': { base: 0, byType: {} },
};
/**
 * Connector candidates (composite and cover tunnels) are scored at their end point as if the chamber were there,
 * minus this: a valid direct chamber of similar quality wins (recorded decision; the GDD gives no weight).
 */
export const CONNECTOR_PENALTY = 1;
/** Connector tunnels: steepest descent from the horizontal, degrees; lateral run when already in the band, BU. */
export const CONNECTOR_MAX_SLOPE_DEG = 35;
export const CONNECTOR_LATERAL_BU = 12;
/** Connectors end this far beyond the band's upper edge (room for the chamber's height), BU. */
export const CONNECTOR_BAND_INSET_BU = 3;
/** Connectors shorter than this are not proposed, BU. */
export const CONNECTOR_MIN_LEN_BU = 4;
/** Cover sites: the underside of a cover is found stepping down this much at most this many times; the room's
 * ceiling stays this far below it, BU. */
export const COVER_SCAN_STEP_BU = 0.25;
export const COVER_SCAN_MAX_STEPS = 4096;
export const COVER_UNDERSIDE_GAP_BU = 0.5;
/** A cover site within NECK_LEN + this x the room width of its nearest wall spot is left to direct chambers
 * (no connector toward it). */
export const COVER_DIRECT_REACH_W = 0.45;

/** Preference curves (GDD 03 §9.3, LN [EST]) for chamber types other than brood (brood uses BROOD_PREF): [x, value]. */
export const TYPE_CLIMATE_PREF: Partial<Record<ChamberType, { temp: [number, number][]; rh: [number, number][] }>> = {
  royal: { temp: [[12, 0], [20, 1], [28, 1], [34, 0]], rh: [[0.5, 0], [0.8, 1]] },
  food: { temp: [[0, 0], [8, 1], [20, 1], [30, 0]], rh: [[0.3, 0], [0.5, 1], [0.9, 1], [1.0, 0]] },
  granary: { temp: [[0, 0], [10, 1], [25, 1], [35, 0]], rh: [[0, 1], [0.7, 1], [0.9, 0]] },
  fungus: { temp: [[15, 0], [21, 1], [25, 1], [30, 0]], rh: [[0.5, 0], [0.8, 1]] },
};

// ---- layout of a whole small nest without the simulation (GDD 03 §15) ----

/** Abstract population steps: start, growth factor per step (rounded up, at least +1). */
export const LAYOUT_START_WORKERS = 8;
export const LAYOUT_GROWTH = 1.35;
/** Abstract brood per adult worker (space units) for brood-space during a layout. */
export const LAYOUT_BROOD_PER_WORKER = 0.35;
/** Candidate wall spots per placement in a layout (the live architect uses ARCH_CANDIDATES; a layout places a
 * whole nest in one call, GDD 03 §15, and its candidates are re-drawn at every step). */
export const LAYOUT_CANDIDATES = 24;
/** At most this many plans per population step (several needs can fire at once). */
export const LAYOUT_PLANS_PER_STEP = 4;
