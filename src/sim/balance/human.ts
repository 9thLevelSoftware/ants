// Human activity (GDD 04 §15; ecology hooks GDD 05 §1.7-1.8; pheromone multipliers GDD 02 §8.5). Every tunable
// number of src/sim/environment/human lives here. Distances mm, durations game seconds, rates per game day (GD).
// Kinds and variants are the registry ids (HUMAN_EVENT_KINDS, HUMAN_VARIANTS); "sites" are the places this module
// derives from the generated world (lanes and regions, src/sim/environment/human/sites).

import type { HumanCueKind, HumanEventKind, HumanVariant } from '@/sim/types';

// ---- schedule (§15.1) ----

/** Most events running at once; a later start waits HUMAN_DELAY_S (uniform). */
export const HUMAN_MAX_CONCURRENT = 3;
export const HUMAN_DELAY_S: readonly [number, number] = [10, 30];
/** Same-kind spacing inside one day, game hours (later instances are pushed back). */
export const HUMAN_SAME_KIND_SPACING_H = 0.5;
/** Quiet hours [from, to) on the game clock: only night cars (x HUMAN_NIGHT_CAR_MULT) and one interior pass (p). */
export const HUMAN_QUIET_HOURS: readonly [number, number] = [22, 6];
export const HUMAN_NIGHT_CAR_MULT = 0.1;
export const HUMAN_NIGHT_INTERIOR_P = 0.3;
/** No lethal effect within this many BU of the founding queen during the first HUMAN_GRACE_GD of a new game. */
export const HUMAN_GRACE_GD = 0.25;
export const HUMAN_GRACE_RADIUS_BU = 200;
/** Custom rule `humanActivity` -> frequency multiplier (replaces HUMAN_FREQ_MULT when the player set it). */
export const HUMAN_ACTIVITY_MULT: Record<'off' | 'low' | 'normal' | 'high', number> = { off: 0, low: 0.5, normal: 1, high: 1.5 };
/** Cap of the lethality multiplier on crush / removal probabilities (§15.7). */
export const HUMAN_LETHAL_CAP = 0.98;

/** A clock window [fromH, toH) with a weight among the kind's windows. */
export interface HumanWindow { from: number; to: number; w: number }

/**
 * One schedule row: a kind (and fixed variant) at one site kind. `freq` = base count per GD; `weekendMult` scales
 * it on weekend days; `weekendShare` instead redistributes the weekly count so that share falls on the weekend
 * (mowing "weekend p 0.7"); `doy` gates by default-year day window; `seasons` lists allowed seasons (null all).
 */
export interface HumanScheduleRow {
  kind: HumanEventKind;
  variant: HumanVariant | null;
  site: HumanSiteKind;
  freq: number;
  windows: readonly HumanWindow[];
  /** Windows used on weekend days (and in summer for children), when they differ. */
  weekendWindows?: readonly HumanWindow[];
  weekendMult?: number;
  weekendShare?: number;
  doy?: readonly [number, number];
  seasons?: readonly string[] | null;
  /** Only on weekend days. */
  weekendOnly?: boolean;
  /** Draw only with this probability per day (suburban lawn children p 0.3). */
  dayP?: number;
  /** Frequency multiplier in heat weather (watering x1.5). */
  heatMult?: number;
  /** Summer uses the weekend windows and counts (children: school holidays). */
  summerIsWeekend?: boolean;
  /** `freq` is per parking bay of the site (car-park litter "1 per 4 bays"). */
  perBay?: boolean;
  /** Not drawn on a day that already has this kind (interior broom "on non-vacuum days"); drawn after the others. */
  notOnDayOf?: HumanEventKind;
  /**
   * The count is split over the windows by weight before the integer draw (each meal gets its own 3 passes, each
   * wipe time its wipe) instead of every instance picking a window at random.
   */
  perWindow?: boolean;
}

/** Places events use (derived from zones, objects and the interior lanes). */
export type HumanSiteKind =
  | 'interior-lane' | 'patio-lane' | 'path-lane' | 'sidewalk-lane' | 'lawn-lane' | 'forest-lane' | 'playground-lane'
  | 'lawn-mown' | 'patio' | 'path' | 'sidewalk' | 'interior-floor' | 'counter' | 'table' | 'pet-bowl' | 'kerb-strip'
  | 'playground' | 'bed' | 'sprinkler' | 'car-park' | 'driveway' | 'bin' | 'suburban-lawn';

const W = (from: number, to: number, w = 1): HumanWindow => ({ from, to, w });
const MEALS: readonly HumanWindow[] = [W(7, 8.5), W(12, 13.5), W(18, 20)];
const OUTDOOR_DAY: readonly HumanWindow[] = [W(7, 21)];
const SIDEWALK_DAY: readonly HumanWindow[] = [W(7, 21, 0.6), W(8, 9, 0.2), W(17, 18, 0.2)];
const WIPE_TIMES: readonly HumanWindow[] = [W(8.25, 9.25), W(13.25, 14.25), W(19.75, 20.75)];

/** GDD 04 §15.2 at Naturalist (T3 rows blower, oil and gel are not scheduled). */
export const HUMAN_SCHEDULE: readonly HumanScheduleRow[] = [
  // footsteps: interior 3 passes per meal + 3 in 08-22; patio; path / sidewalk; lawn; playground adults; forest + paw
  { kind: 'footsteps', variant: 'adult', site: 'interior-lane', freq: 12, perWindow: true, windows: [...MEALS.map((w) => ({ ...w, w: 3 })), W(8, 22, 3)] },
  { kind: 'footsteps', variant: 'adult', site: 'patio-lane', freq: 4, windows: OUTDOOR_DAY },
  { kind: 'footsteps', variant: 'adult', site: 'path-lane', freq: 6, weekendMult: 4 / 6, windows: OUTDOOR_DAY },
  { kind: 'footsteps', variant: 'adult', site: 'sidewalk-lane', freq: 6, weekendMult: 4 / 6, windows: SIDEWALK_DAY },
  { kind: 'footsteps', variant: 'adult', site: 'lawn-lane', freq: 1.5, weekendMult: 2, windows: OUTDOOR_DAY },
  { kind: 'footsteps', variant: 'adult', site: 'playground-lane', freq: 3, windows: OUTDOOR_DAY },
  { kind: 'footsteps', variant: 'adult', site: 'forest-lane', freq: 0.7, windows: OUTDOOR_DAY },
  { kind: 'footsteps', variant: 'paw', site: 'forest-lane', freq: 0.5, windows: [W(7, 9), W(17, 19)] },
  // mowing and the brooms
  { kind: 'mowing', variant: null, site: 'lawn-mown', freq: 1 / 3, weekendShare: 0.7, doy: [3, 19], windows: [W(10, 18)] },
  { kind: 'sweeping', variant: 'broom', site: 'patio', freq: 1 / 3, windows: [W(8, 11)] },
  { kind: 'sweeping', variant: 'broom', site: 'interior-floor', freq: 1, notOnDayOf: 'vacuum', windows: [W(20, 21)] },
  { kind: 'sweeping', variant: 'wipe', site: 'counter', freq: 3, perWindow: true, windows: WIPE_TIMES },
  { kind: 'sweeping', variant: 'broom', site: 'kerb-strip', freq: 1 / 4, windows: [W(6, 7)] },
  // vacuum (the interior broom runs on the other days: notOnDayOf above)
  { kind: 'vacuum', variant: null, site: 'interior-floor', freq: 1 / 3, windows: [W(9, 11)], weekendWindows: [W(10, 12)] },
  // food
  { kind: 'food-drop', variant: 'crumb-fall', site: 'table', freq: 3, perWindow: true, windows: MEALS },
  { kind: 'food-drop', variant: 'pet-feed', site: 'pet-bowl', freq: 2, perWindow: true, windows: [W(7.4, 7.6), W(17.9, 18.1)] },
  { kind: 'food-drop', variant: 'crumb-fall', site: 'patio', freq: 0.5, seasons: ['spring', 'summer'], weekendOnly: true, windows: [W(12, 13.5), W(18, 20)] },
  { kind: 'food-drop', variant: 'sweets', site: 'playground', freq: 1.5, weekendMult: 2, windows: [W(10, 17)] },
  { kind: 'food-drop', variant: 'litter-drop', site: 'car-park', freq: 1 / 4, perBay: true, windows: [W(8, 18.5)] },
  { kind: 'food-drop', variant: 'litter-drop', site: 'bin', freq: 0.5, windows: OUTDOOR_DAY },
  { kind: 'spill', variant: 'sugary', site: 'counter', freq: 1.5, windows: MEALS },
  { kind: 'spill', variant: 'water', site: 'counter', freq: 0.5, windows: MEALS },
  { kind: 'spill', variant: 'sugary', site: 'playground', freq: 1, seasons: ['summer'], windows: [W(10, 17)] },
  { kind: 'spill', variant: 'sugary', site: 'patio', freq: 0.5, seasons: ['spring', 'summer'], windows: [W(12, 13.5), W(18, 20)] },
  // watering: one event per map; the variant follows the sites (HUMAN_WATER_VARIANT_W)
  { kind: 'watering', variant: null, site: 'bed', freq: 1 / 1.5, doy: [1, 16], heatMult: 1.5, windows: [W(5.5, 7.5), W(19, 21)] },
  // cars
  { kind: 'car', variant: null, site: 'car-park', freq: 8, weekendMult: 0.6, windows: [W(8, 9.5, 35), W(17, 18.5, 35), W(9.5, 17, 30)] },
  { kind: 'car', variant: null, site: 'driveway', freq: 2, windows: [W(7.5, 8.5), W(17.5, 18.5)] },
  // children (weekday outside summer 2 sessions; weekend and summer 3)
  {
    kind: 'children', variant: 'play-session', site: 'playground', freq: 2, windows: [W(8.5, 9), W(15.5, 17.5)],
    weekendWindows: [W(10, 17)], weekendMult: 1.5, summerIsWeekend: true,
  },
  {
    kind: 'children', variant: 'play-session', site: 'suburban-lawn', freq: 1, dayP: 0.3, windows: [W(15.5, 17.5)],
    weekendWindows: [W(10, 17)], summerIsWeekend: true,
  },
];

/** Weather gates checked at the start (§15.1-15.2): kinds that do not run in these weather states. */
export const HUMAN_NO_WEATHER: Partial<Record<HumanEventKind, readonly string[]>> = {
  mowing: ['rain', 'storm', 'frost'],
  children: ['rain', 'storm', 'frost'],
};
/** Outdoor sites where rain cancels sweeping, paw walks and patio meals. */
export const HUMAN_RAIN_STATES: readonly string[] = ['rain', 'storm'];
/** Mowing needs no rain in the previous 0.25 GD; watering none in the previous 1 GD. */
export const MOW_DRY_GD = 0.25;
export const WATER_DRY_GD = 1;
/** Children avoid these hours in heat weather. */
export const CHILDREN_HEAT_AVOID_H: readonly [number, number] = [12, 15];

// ---- motion and footprints (§15.2) ----

export interface WalkerGait { soleL: number; soleW: number; step: number; speed: number; lateral: number }
export const GAIT: Record<'adult' | 'child' | 'paw', WalkerGait> = {
  adult: { soleL: 280, soleW: 100, step: 700, speed: 1400, lateral: 90 },
  child: { soleL: 200, soleW: 80, step: 450, speed: 1800, lateral: 70 },
  paw: { soleL: 50, soleW: 50, step: 300, speed: 1200, lateral: 80 },
};
export const FOOT_JITTER_MM = 40;
export const FOOT_LINGER_P = 0.02;
export const FOOT_LINGER_STEPS: readonly [number, number] = [2, 4];
/** One pass lasts lane length / speed, clamped to this range (s); a long lane is walked in part. */
export const FOOT_PASS_S: readonly [number, number] = [5, 30];
/** How long a sole rests on the ground and how high it is lifted between steps (renderer keys), s / mm. */
export const FOOT_CONTACT_S = 0.3;
export const FOOT_LIFT_MM = 160;

export const MOW_MAX_S = 240;
export const MOW_DECK_MM = 460;
export const MOW_OVERLAP_MM = 40;
export const MOW_SPEED_MM_S = 1000;
export const MOW_WHEEL_D_MM = 200;
export const MOW_WHEEL_W_MM = 45;
export const MOW_CUT_MM = 35;
export const MOW_REGROW_GD = 2;
export const MOW_REEL_P = 0.2;
/** Mowing / vacuum / broom are resolved in steps of this length of travel, s. */
export const SWEEP_STEP_S = 0.25;

export const BROOM_MAX_S = 90;
export const BROOM_STROKE_L = 600;
export const BROOM_STROKE_W = 300;
export const BROOM_STROKE_S = 1.2;
export const WIPE_MAX_S = 40;
export const WIPE_ROW_W = 250;
export const WIPE_SPEED_MM_S = 400;
export const STREET_STRIP_W = 600;

export const VACUUM_MAX_S = 180;
export const VACUUM_STRIP_W = 280;
export const VACUUM_SPEED_MM_S = 400;
export const VACUUM_PASSES = 2;
export const VACUUM_CREVICE_P = 0.5;
/** A solid this close above an ant hides it from the nozzle (kick-space void, under an appliance), mm. */
export const VACUUM_HEAD_CLEAR_MM = 90;
/** Height above the floor at which the nozzle's reach to an ant is traced (a plinth in between hides it), mm. */
export const VACUUM_REACH_PROBE_MM = 12;

export const SPRINKLER_R_M: readonly [number, number] = [2, 4];
export const WATER_SPRINKLER_S = 30;
export const WATER_HOSE_S = 12;
export const WATER_CAN_S = 6;
export const HOSE_SWEEP_M: readonly [number, number] = [1, 3];
export const CAN_SPOT_MM: readonly [number, number] = [300, 600];
/** Variant weights of a watering event among the sites the map has. */
export const HUMAN_WATER_VARIANT_W: Record<'sprinkler' | 'hose' | 'can', number> = { sprinkler: 0.5, hose: 0.3, can: 0.2 };
export const WATER_DROPS_M2_S = 1000;
export const WATER_DROP_MULT: Record<'sprinkler' | 'hose' | 'can', number> = { sprinkler: 1, hose: 3, can: 5 };
export const WATER_RAIN_MMH: Record<'sprinkler' | 'hose' | 'can', number> = { sprinkler: 15, hose: 40, can: 80 };
/** Projected area of a worker hit by drops, BU^2 (length x width). */
export const WATER_ANT_AREA_BU2 = 0.35;
export const WATER_DISLODGE_P = 0.3;
/** Water bodies inside the wetted area fill at this rate, mm per game s. */
export const WATER_FILL_MM_S = 0.2;

export const CAR_SPEED_MM_S = 1500;
export const CAR_TURN_MM_S = 500;
export const CAR_BAY_W = 2500;
export const CAR_BAY_D = 5000;
/** Car body (half extents) and tyres (radius, width, track and wheelbase), mm. */
export const CAR_BODY: { hl: number; hw: number; hh: number; clear: number } = { hl: 2150, hw: 880, hh: 600, clear: 160 };
/** Tyre radius, width, track and wheelbase, and the length of its contact patch on the ground, mm. */
export const CAR_TYRE: { r: number; w: number; track: number; base: number; patch: number } = { r: 310, w: 195, track: 1520, base: 2600, patch: 160 };
export const CAR_LITTER_P = 0.3;
export const CAR_DURATION_S: readonly [number, number] = [7, 20];

export const CHILD_SESSION_S: readonly [number, number] = [40, 90];
export const CHILD_COUNT: readonly [number, number] = [1, 4];
export const CHILD_SWEETS_P = 0.3;
export const CHILD_SPILL_P = 0.15;
export const CHILD_DIG_EVERY_S = 6;
export const CHILD_SCOOP_R_MM: readonly [number, number] = [50, 150];
export const CHILD_SCOOP_THROW_MM: readonly [number, number] = [300, 1000];
export const CHILD_SCOOP_ALIVE_P = 0.7;
export const CHILD_SAND_DELTA_MM = 100;
export const CHILD_CAVE_IN_BU = 25;
export const CHILD_CAVE_IN_P = 0.8;

// ---- food (§15.2 food-drop / spill; GDD 05 §1.7) ----

export const DROP_TABLE_CRUMBS: readonly [number, number] = [5, 20];
export const DROP_COUNTER_CRUMBS: readonly [number, number] = [1, 4];
export const DROP_SEAT_R_MM = 400;
/** Crumbs of one drop are grouped into sources of about this many crumbs (one ecology crumb cluster each). */
export const DROP_CRUMBS_PER_SOURCE = 5;
export const DROP_SCATTER_MM = 250;
export const DROP_STUN_S = 2;
/** A falling item bigger than this kills an ant under it with p DROP_KILL_P. */
export const DROP_BIG_BU = 6;
export const DROP_KILL_P = 0.3;
export const SPILL_D_MM: readonly [number, number] = [20, 200];
export const SPILL_AFLOAT_P = 0.7;

// ---- telegraph cues (§15.3) ----

/** One cue a run emits: per impact (`each`) or once before the first impact. Lead in game s (x telegraph mult). */
export interface HumanCueSpec {
  cue: HumanCueKind;
  lead: number;
  /** Radius, mm; 'fp' = footprint half-diagonal x HUMAN_SHADOW_MARGIN; 'world' = the whole map. */
  radius: number | 'fp' | 'world';
  intensity: number;
  each: boolean;
}
export const HUMAN_SHADOW_MARGIN = 1.3;
const C = (cue: HumanCueKind, lead: number, radius: HumanCueSpec['radius'], intensity: number, each = true): HumanCueSpec =>
  ({ cue, lead, radius, intensity, each });

export const HUMAN_CUES: Record<HumanEventKind, readonly HumanCueSpec[]> = {
  footsteps: [C('tremor', 3.0, 2000, 1), C('shadow', 0.4, 'fp', 1), C('sound', 0, 5000, 1)],
  mowing: [C('sound', 12, 'world', 1, false), C('tremor', 2.0, 3000, 0.8), C('airflow', 1.0, 'fp', 0.7), C('shadow', 0.5, 'fp', 1)],
  sweeping: [C('sound', 2.0, 1500, 0.6), C('tremor', 2.0, 1500, 0.6), C('shadow', 0.3, 'fp', 1)],
  vacuum: [C('sound', 6, 'world', 1, false), C('tremor', 2.0, 1000, 0.7), C('airflow', 0.3, 'fp', 1), C('shadow', 0.5, 'fp', 1)],
  'food-drop': [C('shadow', 0.5, 'fp', 1), C('sound', 0, 3000, 0.6)],
  spill: [C('shadow', 0.5, 'fp', 1), C('sound', 0, 3000, 0.6)],
  watering: [C('sound', 2.0, 6000, 0.7, false), C('spray', 1.0, 'fp', 0.6)],
  car: [C('sound', 8, 'world', 1, false), C('tremor', 3.0, 3000, 1), C('shadow', 1.5, 'fp', 1)],
  children: [C('tremor', 4.0, 2000, 0.8), C('shadow', 0.3, 'fp', 1), C('spray', 0.5, 'fp', 0.6)],
  'bait-station': [C('shadow', 0.6, 'fp', 1), C('tremor', 1.0, 500, 0.4)],
};
/** Wipe telegraph (overrides sweeping's cues for the wipe variant). */
export const WIPE_CUES: readonly HumanCueSpec[] = [C('shadow', 0.5, 'fp', 1), C('tremor', 0.5, 600, 0.3)];
/** Cues stay listed this long after their impact (camera tremor relay reads impacts of the last frame), s. */
export const HUMAN_CUE_TAIL_S = 1;
/** `human.telegraph` events of one run and cue kind are at least this far apart, s (audio, HUD). */
export const HUMAN_TELEGRAPH_EVENT_GAP_S = 1;
/** Speed of the event's front per kind, mm/s: widens a throttled telegraph event's radius to cover the gap. */
export const HUMAN_FRONT_SPEED: Record<HumanEventKind, number> = {
  footsteps: 1800, mowing: MOW_SPEED_MM_S, sweeping: 600, vacuum: VACUUM_SPEED_MM_S, 'food-drop': 0, spill: 0,
  watering: 1000, car: CAR_SPEED_MM_S, children: 1800, 'bait-station': 0,
};
/** Tremor transmission by contact class (§15.3); underground receivers feel x0.5 (perception's rule). */
export const TREMOR_TRANSMISSION: Record<SurfaceClass, number> = { hard: 1, soft: 0.5, sward: 0.5, litter: 0.4, sand: 0.3 };

// ---- effects (§15.4) ----

export type SurfaceClass = 'hard' | 'soft' | 'sward' | 'litter' | 'sand';
export type CrushContact = 'adult-shoe' | 'child-shoe' | 'paw' | 'tyre' | 'mower-wheel';
/** CRUSH_P at Naturalist: hard / bare soft / sward / litter-mulch-fabric (sand counts as bare soft). */
export const CRUSH_P: Record<CrushContact, { hard: number; soft: number; sward: number; litter: number }> = {
  'adult-shoe': { hard: 0.85, soft: 0.45, sward: 0.25, litter: 0.15 },
  'child-shoe': { hard: 0.75, soft: 0.4, sward: 0.2, litter: 0.12 },
  paw: { hard: 0.5, soft: 0.3, sward: 0.15, litter: 0.1 },
  tyre: { hard: 0.95, soft: 0.6, sward: 0.4, litter: 0.3 },
  'mower-wheel': { hard: 0.8, soft: 0.5, sward: 0.6, litter: 0.3 },
};
/** An ant this far below the contact plane (crevice, joint, crack, cavity) is safe, BU. */
export const CRUSH_SAFE_DEPTH_BU = 0.5;
/**
 * Radii (BU) of the probe rings around an ant below the footprint's top plane: the sole bridges a crevice only when
 * solid ground rises to the plane within this distance (a joint or a crack); a smooth slope or a dip wider than this
 * is touched by the sole. 8 directions per ring.
 */
export const CRUSH_CREVICE_PROBE_BU: readonly number[] = [1, 2.5];
export const CRUSH_STUN_S = 3;
/** Lawn grass at least this tall makes a soil surface `sward`, mm. */
export const SWARD_MIN_MM = 20;
/** Litter map value (0..1) above which a soil surface counts as litter / mulch. */
export const LITTER_MIN = 0.5;

export const MOW_ABOVE_CUT_P = 0.9;
export const MOW_TUMBLE_P = 0.3;
export const MOW_TUMBLE_BU: readonly [number, number] = [2, 6];
export const BROOM_DISPLACE_MM: readonly [number, number] = [50, 300];
export const BROOM_TUMBLE_S = 2;
export const BROOM_DEATH_P = 0.1;
export const BROOM_ITEM_BU = 3;
export const BROOM_PUSH_MM: readonly [number, number] = [300, 600];
export const BROOM_COLLECT_P = 0.7;
export const WIPE_REMOVE_P = 0.6;
export const WIPE_FOOD_P = 0.95;
export const VACUUM_REMOVE_P = 0.9;
export const VACUUM_ITEM_BU = 4;
export const FOOT_ITEM_BU = 2;
export const FOOT_ITEM_REMOVE_P = 0.5;
export const FOOT_ITEM_SCATTER_BU: readonly [number, number] = [1, 3];
export const FOOT_PRINT_MM = 3;
export const FOOT_PRINT_SAND_MM = 5;
export const FOOT_ENTRANCE_BLOCK_P = 0.5;
export const FOOT_ENTRANCE_FILL_BU = 1.5;
export const CAR_ITEM_REMOVE_P = 0.6;

/** Pheromone multipliers in the area (trail, home; alarm takes trail). GDD 04 §15.4 / GDD 02 §8.5. */
export const HUMAN_PHERO: Record<string, { trail: number; home: number }> = {
  footsteps: { trail: 0.3, home: 0.7 },
  mowing: { trail: 0.5, home: 0.8 },
  broom: { trail: 0.3, home: 0.6 },
  wipe: { trail: 0.05, home: 0.3 },
  vacuum: { trail: 0, home: 0 },
  spill: { trail: 0, home: 0.5 },
  watering: { trail: 0.4, home: 0.8 },
  car: { trail: 0.2, home: 0.6 },
  children: { trail: 0.4, home: 0.7 },
};
/** Half height of the pheromone layer each contact reaches above / below its plane, BU (mower and sprinkler: the
 *  whole sward; the cloth only the worktop film). */
export const HUMAN_PHERO_HALF_BU: Record<keyof typeof HUMAN_PHERO, number> = {
  footsteps: 3, mowing: 40, broom: 3, wipe: 1.5, vacuum: 2, spill: 2, watering: 40, car: 3, children: 3,
};
/** Items up to this long are taken by the cloth (crumbs, granules), BU. */
export const WIPE_ITEM_BU = 10;
/** Ants up to this far above the ground are under the falling drops; only those at least WATER_STEM_MIN_BU up a stem
 *  or a leaf can be knocked off, mm / BU. */
export const WATER_REACH_ABOVE_MM = 600;
export const WATER_STEM_MIN_BU = 1.5;

// ---- shapes and side effects the GDD leaves open (plans and effects) ----

/** Height falling things start from (food, spills, a bait station), mm. */
export const DROP_FALL_MM = 700;
/** The crumbs of one drop land over this many seconds. */
export const DROP_SPREAD_S = 0.4;
/** Dropped crumbs, mm (§15.2 interior crumbs 0.5-5 mm). */
export const DROP_CRUMB_SIZE_MM: readonly [number, number] = [0.5, 5];
/** Drawn size of pet food, sweets and litter, mm. */
export const DROP_ITEM_SIZE_MM = { petFeed: 10, sweets: 12, litter: 18 } as const;
/** Contact radius of a falling crumb, a pet-food pour, a litter item and a bait station, mm. */
export const DROP_IMPACT_R_MM = { crumb: 3, petFeed: 60, litter: 20, bait: 40 } as const;
/** Litter and sweets land within this of their spot (bin, bench, play spot), mm. */
export const DROP_SPOT_JITTER_MM = 300;
/** Worktop crumbs keep this far from the worktop edge, mm. */
export const DROP_WORKTOP_EDGE_MM = 30;
/** A counter spill lands on the worktop with this share, else on the kitchen floor. */
export const SPILL_WORKTOP_SHARE = 0.7;
/** A pet feed refills the water bowls within this of the food bowl, mm. */
export const PET_BOWL_REFILL_MM = 300;
/** Litter from a car door lands this far beside the parked car's centre, mm. */
export const CAR_DOOR_OFFSET_MM = 1300;
/** A car event in a car park with parked cars departs with this chance (always after CAR_EVENING_DAY_FRAC). */
export const CAR_DEPART_P = 0.4;
export const CAR_EVENING_DAY_FRAC = 0.6;
/** Items up to this long stick to a tyre (any loose item an ant could meet), BU. */
export const CAR_ITEM_BU = 20;

/** Wiped survivors are pushed this far by the cloth, mm. */
export const WIPE_SHOVE_MM: readonly [number, number] = [30, 150];
export const WIPE_STUN_S = 1;
/** Ants reaching the floor again after the nozzle missed them, s. */
export const VACUUM_STUN_S = 1;
/** Within this of a skirting-gap mouth the crevice tool reaches in (1 BU from the mouth plus half a body), BU. */
export const VACUUM_MOUTH_REACH_BU = 1.5;
/** Ants this high above the floor are on a wall or a cabinet front: the nozzle misses them, BU. */
export const VACUUM_WALL_BU = 2;
/** Share of VACUUM_MAX_S spent on open floor when the crevice pass follows. */
export const VACUUM_FLOOR_SHARE_WITH_CREVICE = 0.7;
/** Probability that a vacuum run ends with the crevice pass along the skirting (§15.2 p 0.5). */
export const VACUUM_CREVICE_PASS_P = 0.5;
/** Spill stun: held afloat in the film (locomotion has no afloat drift reachable from here) / splashed, s. */
export const SPILL_STUN_S = { afloat: 6, splashed: 2 } as const;
/** Stun after a tumble (mower draught, a sprinkler drop), s. */
export const TUMBLE_STUN_S = 1;
/** Stun of an ant thrown with the sand from a child's scoop, s. */
export const CHILD_SCOOP_STUN_S = 3;
/** A scoop digs a crater of this share of CHILD_SAND_DELTA_MM and heaps this share beside it (radius x1.2). */
export const CHILD_CRATER_SHARE = 0.5;
export const CHILD_HEAP_SHARE = 0.35;
export const CHILD_HEAP_R_MULT = 1.2;
/** Ants up to this far above the deck plane are within the mower's reach (on stems), mm. */
export const MOW_REACH_ABOVE_MM = 400;

/** Watering: the moving front advances every this many seconds. */
export const WATER_FRONT_EVERY_S = 0.5;
/** A hose or can is carried in by a person first (§15.2): the water starts this long after the warning, s. */
export const WATER_WALK_IN_S = 10;
/** Radius of the hose's wetted spot along the bed, mm. */
export const WATER_HOSE_SPOT_MM = 300;
/** The sprinkler front sits at this share of the throw from the head, with this share as its radius. */
export const WATER_SPRINKLER_FRONT = { at: 0.6, r: 0.45 } as const;

/** Share of a play session a child spends running (the rest playing in place). */
export const CHILD_RUN_SHARE = 0.4;
/** A child's next point is near a play spot with this share (else anywhere in the area), within this jitter, mm. */
export const CHILD_SPOT_SHARE = 0.7;
export const CHILD_SPOT_JITTER_MM = 400;
/** Scoops land within this of the sand-pit centre, mm. */
export const CHILD_PIT_JITTER_MM = 600;

/** Strip coverage (mower, vacuum): outside the area the machine is lifted across at this times the speed. */
export const STRIP_CROSS_SPEED_MULT = 4;
/** A broom stroke touches the ground this far through the stroke (share of BROOM_STROKE_S). */
export const BROOM_CONTACT_AT = 0.6;

// ---- grass (§15.5) ----

export const GRASS_START_MOWN_MM: readonly [number, number] = [40, 60];
export const GRASS_START_ROUGH_MM: readonly [number, number] = [150, 250];
/** Daily growth per season, mm/GD; mown lawns stop at GRASS_MAX_MOWN_MM. */
export const GRASS_GROWTH_MM_GD: Record<string, number> = { spring: 12, summer: 12, autumn: 5, winter: 0 };
export const GRASS_MAX_MOWN_MM = 120;
export const GRASS_MAX_ROUGH_MM = 300;

// ---- reactive rules and bait (§15.6, GDD 05 §1.8) ----

export const BAIT_TRIGGER_VISITS = 60;
export const BAIT_COUNTER_TRAIL_GD = 0.5;
export const BAIT_DELAY_GD: readonly [number, number] = [0.5, 1];
export const BAIT_PLACE_HOURS: readonly [number, number] = [18, 20];
export const BAIT_LIFE_GD = 4;
export const BAIT_REFRESH_MAX = 2;
/** Visits in the last GD that keep a station refreshed at its end of life. */
export const BAIT_REFRESH_VISITS = 10;
export const BAIT_OFFSET_MM: readonly [number, number] = [100, 300];
/** Station body (rounded box half extents), mm. */
export const BAIT_STATION_HALF: { x: number; y: number; z: number } = { x: 30, y: 6, z: 30 };
export const BAIT_PATIO_GD = 2;
export const EXTRA_WIPE_TRAIL_GD = 0.25;
/** The extra wipe comes this long after the trigger, game hours. */
export const EXTRA_WIPE_DELAY_H = 0.25;
/** Trail on a counter or table counts when a sampled cell holds at least this, ph. */
export const COUNTER_TRAIL_MIN = 0.5;
/** Reactive checks (counter trails, patio crumbs) run every this many ticks. */
export const HUMAN_REACTIVE_EVERY = 100;
export const SWEEP_GATHER_ANTS = 30;
export const SWEEP_GATHER_CELL_MM = 600;

// ---- sites (lanes and regions derived from the world) ----

/** Human grid cell for outdoor lanes, mm (GDD 04 digest: human grid 250 mm). */
export const HUMAN_GRID_MM = 250;
/** Lane polylines keep every n-th cell of the grid path. */
export const HUMAN_LANE_THIN = 2;
/** Grass inside the play area or a lawn smaller than this is not a lane site, m^2. */
export const HUMAN_MIN_SITE_M2 = 2;
