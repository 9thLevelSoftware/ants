// Action primitives, possession and player control (GDD 01 §3, §7, §9; GDD 02 §5.4, §8; GDD 03 §1.2; GDD 05 §4).
// Durations in game seconds (code converts to ticks), lengths in L (body lengths of the acting ant) or BU.

import type { ActionId, Caste } from '@/sim/types';

// ---- lifecycle (GDD 01 §7.1) ----

/** Share of a timed primitive's duration spent in windup / active / recovery (effect at the end of active). */
export const ACTION_WINDUP_FRAC = 0.2;
export const ACTION_ACTIVE_FRAC = 0.7;
/** Shortest timed primitive, ticks (a duration never rounds to zero). */
export const ACTION_MIN_TICKS = 1;
/** Movement input above this magnitude for longer than ACTION_MOVE_CANCEL_S cancels a cancellable primitive. */
export const ACTION_MOVE_CANCEL_MAG = 0.5;
export const ACTION_MOVE_CANCEL_S = 0.15;
/** workRate below this makes timed primitives fail with `conditions` (too cold / hot to work). */
export const WORK_RATE_MIN = 0.05;
/** healthFactor = HEALTH_FACTOR_BASE + (1 - HEALTH_FACTOR_BASE) * health (GDD 02 §1.5). */
export const HEALTH_FACTOR_BASE = 0.5;

// ---- reach and targeting (GDD 01 §7.2) ----

/** Reach from the mandible point, L (plus the target's radius). */
export const REACH_L = 0.6;
/** Half-angle of the targeting cone around the ant's forward, degrees. */
export const REACH_CONE_DEG = 50;
/** Mandible point ahead of the body centre, L. */
export const MANDIBLE_FWD_L = 0.5;
/** Antennal range of `antennate`, L (longer than reach). */
export const ANTENNATE_RANGE_L = 2;
/** Radius of an ant as a target, L. */
export const ANT_TARGET_RADIUS_L = 0.3;
/** Target radii of brood by stage and the default item radius, BU (sources use their catalogue footprint). */
export const BROOD_RADIUS_BU = { egg: 0.12, larva: 0.25, pupa: 0.3 } as const;
export const ITEM_RADIUS_BU = 0.25;

// ---- catalogue durations, game s at workRate 1 (GDD 01 §7.3) ----

export const PICK_UP_S = 0.5;
export const PUT_DOWN_S = 0.4;
export const SEAL_ENTRANCE_S = 2.0;
export const LAY_EGG_S = 6.0;
export const FEED_LARVA_S = 4.0;
export const GROOM_SELF_S = 4.0;
export const GROOM_OTHER_S = 5.0;
export const GROOM_BROOD_S = 4.0;
export const ANTENNATE_S = 0.8;
export const ANTENNATE_AI_S = 0.5;
export const SNIFF_S = 1.5;
export const TEAR_S = 4.0;
export const TEND_APHID_STROKE_S = 3.0;
export const BITE_S = 0.5;
export const SPRAY_WINDUP_S = 0.8;
export const SPRAY_RELEASE_S = 0.3;
export const RELEASE_ALARM_S = 0.5;
/** Continuous primitives stop after this long even when nothing else ends them, game s. */
export const TROPH_MAX_S = 10;

// ---- carrying ----

/** Opening phase `lay`: eggs laid by one `lay-egg` (GDD 06 §5.10; capped by the clutch limits). */
export const OPEN_LAY_BATCH_EGGS = 6;
/** Eggs picked up together as one clump (GDD 01 §7.3, = OPEN_LAY_BATCH_EGGS: one laid batch is one clump, E-117). */
export const EGG_CLUMP_MAX = OPEN_LAY_BATCH_EGGS;
/** Eggs within this distance of the picked egg join the clump, BU. */
export const EGG_CLUMP_RADIUS_BU = 0.6;
/** Solo drag allowed up to carryCap x SOLO_DRAG_MAX; cooperative drag up to COOP_MAX_ANTS ants. */
export const SOLO_DRAG_MAX = 2;
export const COOP_MAX_ANTS = 12;
/** Surfaces with normal . worldUp below this count as walls/ceilings (let-go vs drop, GDD 01 §4.3). */
export const FLOOR_NORMAL_MIN = 0.7;
/** Initial push away from the surface on let-go, mm/s along the surface normal. */
export const LET_GO_PUSH_MM_S = 2;

// ---- digging (GDD 03 §1.2) ----

export const DIG_BITE_S = 1.0;
/** Bites with digSpeed x digPower below this fail `not-diggable`. */
export const DIG_MIN_SPEED = 0.1;
/** Contact point probe: the walking surface this far ahead of the head is bitten when no face is in reach, BU. */
export const DIG_FLOOR_AHEAD_BU = 0.5;
/** Depth into the solid at which diggability is sampled, BU (= DIG_BITE_DEPTH). */
export const DIG_BITE_DEPTH_BU = 0.4;
/** Ramp brush slope (degrees below horizontal): default, and clamp for aimed bites (look up / down). */
export const DIG_SLOPE_DEFAULT_DEG = 30;
export const DIG_SLOPE_MIN_DEG = -45;
export const DIG_SLOPE_MAX_DEG = 80;
/** Auto-advance: a face receded beyond reach but within this many L straight ahead is approached. */
export const DIG_ADVANCE_L = 1.5;
/** unseal-entrance duration = dig-bite x PLUG_DIG_FACTOR. */
export const PLUG_DIG_FACTOR = 0.5;
/** Pellet yielded by one unseal bite, BU^3 (about one bite of loose soil). */
export const UNSEAL_PELLET_VOLUME_BU3 = 0.85;
/** Pellet bulk per BU^3 of volume (GDD 03 §1.3); single source: balance/nest.ts. */
export { PELLET_BULK_PER_BU3 } from './nest';
/** `seal-entrance` works within this distance of the opening, inside the throat, BU. */
export const SEAL_THROAT_BU = 3;
/** A carried pellet is dropped this far behind the feet when a dig bite starts, L. */
export const DIG_PELLET_DROP_BEHIND_L = 0.5;

/** Caste dig power (GDD 03 §1.2 table). Missing caste = cannot dig (`caste`). */
export const DIG_POWER: Partial<Record<Caste, number>> = {
  worker: 1.0, minor: 0.8, media: 1.0, major: 1.5, queen: 0.77,
};
/** Nanitic workers dig at this power (GDD 03 §1.2). */
export const DIG_POWER_NANITIC = 0.8;

// ---- queen (GDD 01 §7.3, GDD 02 §3, GDD 06 §5.10) ----

export const EGG_COST_P = 0.04;
/** Cooldown between player `lay-egg`s, game s (possessed queen only). */
export const LAY_COOLDOWN_S = 10;
/** Opening phase `lay`: one action lays a batch of OPEN_LAY_BATCH_EGGS over this long (no cooldown). */
export const OPEN_LAY_ACTION_S = 4;

// ---- food and transfers (GDD 01 §7.3, GDD 02 §5.4) ----

/** Loads moved by one `feed-larva`. */
export const FEED_LARVA_LOADS = 0.1;
/** Founding queen's larval feed mix: P share (GDD 02 §5.4.1). */
export const FOUNDING_FEED_P_SHARE = 0.75;
/** Trophallaxis rate, load / game s; donor keeps at least TROPH_DONOR_MIN. */
export const TROPH_RATE = 0.1;
export const TROPH_DONOR_MIN = 0.05;
/** An AI donor accepts a beg if its crop exceeds this share of its capacity (GDD 01 / GDD 02 §5.4.1). */
export const TROPH_ACCEPT_FRAC = 0.3;
/** In the nest a beg is served from the pool when its days of C cover this many game days, up to TROPH_POOL_MAX. */
export const TROPH_POOL_DAYS_MIN = 0.5;
export const TROPH_POOL_MAX = 0.5;
/** A beggar with crop C below this counts as hungry (GDD 02 §5.4.1). */
export const TROPH_HUNGRY_C = 0.05;
/** Grooming removes this share of the target's dirt. */
export const GROOM_REDUCTION = 0.5;

// ---- pheromones (GDD 02 §8.2) ----

/** Trail dab while laying: strength (ph) and spacing (BU walked); single source: balance/pheromone.ts. */
export { TRAIL_DAB, TRAIL_DAB_SPACING_BU } from './pheromone';
/** Player dab factor when carrying food or crop >= TRAIL_LADEN_CROP, otherwise TRAIL_UNLADEN_FACTOR. */
export const TRAIL_LADEN_CROP = 0.5;
/** At most this many dabs per tick (a teleport or a very fast tick cannot paint a long line at once). */
export const TRAIL_MAX_DABS_PER_TICK = 4;
export const TRAIL_UNLADEN_FACTOR = 0.6;
/** Alarm puff of `release-alarm`, ph; cooldown game s. */
export const ALARM_PUFF = 4;
export const RELEASE_ALARM_COOLDOWN_S = 5;

// ---- combat shells (GDD 05 §4; effects owned by the combat task) ----

/** One full bite cycle (strike plus rest): a `bite` starts again this long after the last began, game s (GDD 05). */
export const BITE_CYCLE_S = 1.0;
export const SPRAY_CONE_DEG = 60;
export const SPRAY_RANGE_L = 1.5;
/** Acid damage = SPRAY_DAMAGE_PER_MG23 x massMg^(2/3) (GDD 05 §4: 2.5 x m^(2/3)). */
export const SPRAY_DAMAGE_PER_MG23 = 2.5;
/** Alarm deposited by a spray, ph. */
export const SPRAY_ALARM = 1.0;
export const SPRAY_COOLDOWN_S = 3;
/** Default acid regeneration when the species gives none, game s per charge. */
export const ACID_REGEN_S = 120;

// ---- possession and release (GDD 01 §3.8) ----

/** Idle auto-release after this many real seconds of running sim without input (real s = ticks / speed / 10). */
export const POSSESS_AFK_S = 120;
/** Input magnitude above which the intent counts as input (stick dead zone). */
export const INPUT_DEADZONE = 0.15;
export const RESUME_COMBAT_WINDOW_S = 3;
/** Rule 10: a released aphid carrier places it on a host plant within this radius (used by the tend behaviour). */
export const RESUME_APHID_RADIUS_BU = 100;
export const RESUME_LOCALITY_BONUS = 0.25;
/** Locality radius for the allocation bonus (rule 16) and the release-rule distances (rules 7, 13, 14), BU. */
export const RESUME_LOCALITY_BU = 20;
export const RESUME_DIG_FRONTIER_BU = 3;
export const RESUME_SOURCE_BU = 5;
/** GDD 02 CROP_RETURN_FRACTION and the "partly full, source empty" crop floor. */
export const CROP_RETURN_FRACTION = 0.8;
export const CROP_RETURN_MIN = 0.1;
/** Fight-or-flee split of release rule 1: health below this flees (GDD 05 RETREAT_HEALTH, owner combat). */
export const RESUME_RETREAT_HEALTH_OUT = 0.35;
export const RESUME_RETREAT_HEALTH_IN = 0.15;

// ---- prompts (GDD 01 §9) ----

export const PROMPT_DIST_WEIGHT = 0.5;
export const PROMPT_ANGLE_WEIGHT = 0.3;
export const PROMPT_HYSTERESIS = 0.15;
/** Prompt candidates: the index query around the mandibles is reach + this, BU (covers ant and brood radii; wider
 *  items, sources and creatures widen it by their largest radius). */
export const PROMPT_QUERY_PAD_BU = 1;
/** A new winner must lead this long before the prompt switches, REAL s (PROMPT_SWITCH_MS 200; 2 ticks at 1x,
 *  8 at 4x). Real s of one tick = 0.1 / speed. */
export const PROMPT_SWITCH_REAL_S = 0.2;
/** Class weights of the priority classes (GDD 01 §9.2). */
export const PROMPT_CLASS_WEIGHT = {
  commitment: 10, receiver: 8, brood: 7, food: 6, livestock: 5, nestmate: 4, item: 3, structure: 2, self: 1,
} as const;

// ---- inspect read-outs (GDD 01 §10): word bands are upper cut-offs, one fewer than the words ----

/** Scent counts as present above these strengths, ph. */
export const INSPECT_TRAIL_PRESENT_PH = 0.3;
export const INSPECT_HOME_PRESENT_PH = 0.1;
export const INSPECT_ALARM_PRESENT_PH = 0.5;
/** Diggability x dig power: very hard / hard / normal / easy. */
export const INSPECT_DIG_BANDS = [0.3, 0.7, 1.2] as const;
/** Soil moisture 0..1: dry / damp / wet / waterlogged. */
export const INSPECT_MOISTURE_BANDS = [0.25, 0.5, 0.8] as const;
/** Litter cover 0..1 from this up reads "partly covered" (overhead shelter reads "under an object"). */
export const INSPECT_LITTER_COVER_MIN = 0.3;
/** Depth of the estimated deep temperature, BU. */
export const INSPECT_DEEP_TEMP_BU = 10;
/** Site factor 0..1 and overall site score: poor / fair / good / excellent (founding queen's assessment). */
export const INSPECT_SITE_BANDS = [0.25, 0.5, 0.75] as const;
/** Taste: "sweet" when C > ratio x P, "protein-rich" when P > ratio x C, else "mixed". */
export const INSPECT_TASTE_RATIO = 2;
/** Food decay 0..1: fresh / drying / rotting. */
export const INSPECT_DECAY_BANDS = [0.3, 0.7] as const;
/** Rival ants within this radius of a food count as present, BU. */
export const INSPECT_RIVAL_RADIUS_BU = 5;
/** Health share: dying / injured / hurt / healthy. */
export const INSPECT_HEALTH_BANDS = [0.15, 0.4, 0.8] as const;
/** Brood hunger 0..1: fed / hungry / starving. */
export const INSPECT_HUNGER_BANDS = [0.3, 0.7] as const;
/** Chamber flood risk 0..1: low / some / high. */
export const INSPECT_FLOOD_BANDS = [0.2, 0.6] as const;
/** Mound volume, BU^3: small / medium / large. */
export const INSPECT_MOUND_BANDS_BU3 = [20, 200] as const;

// ---- behaviour runner ----

/** Default think interval of a behaviour when it does not schedule its own next think, ticks. */
export const BEHAVIOUR_THINK_TICKS = 5;

// ---- death (GDD 05 §4.7) ----

/** Corpse bulk = massMg / REF_CARRY_MG (single source: balance/ecology.ts); protein = CORPSE_P_PER_MG x massMg loads. */
export { REF_CARRY_MG } from './ecology';
export const CORPSE_P_PER_MG = 0.4;
/** Necrophoresis cue delay after death, game s. */
export const CORPSE_CUE_S = 60;

/** Primitives whose input is held (they start on press and stop on release; GDD 01 §5.2). Order = bit index. */
export const HOLD_ACTIONS: readonly ActionId[] = [
  'dig-bite', 'grip', 'harvest-liquid', 'bite-hold', 'drag', 'tend-aphid', 'trophallaxis-give',
  'trophallaxis-receive', 'unseal-entrance',
];

// ---- care primitives (sim-fix-ants: load-crop, unload-crop, feed-queen, assist-eclosion, cannibalise) ----
// Durations and amounts come from GDD 02 (§2.9 ECLOSE_ASSIST_S, §5.4.1 loads and feeds, §5.7 S3); the values live
// in balance/nestwork.ts (LOAD_S, QUEEN_FEED_S, ASSIST_S, CANNIBALISE_S, NURSE_LOAD ...) and are used from there.
/**
 * A crop is loaded from the pool only while it holds at least this much food, loads. GDD 02 §5.4.1 writes "pool C >=
 * 0.1 or P >= 0.1"; this is the beh-nest adapter's "empty pool" floor instead (recorded deviation, sim-fix-ants): in
 * starvation S3 the queen's protein is the 0.03 P of each eaten egg, which a 0.1 floor would never let a carer load.
 */
export const LOAD_POOL_MIN = 0.02;
/** Unloading the crop straight into a food chamber runs at this fraction of TROPH_RATE (GDD 02 §5.3: half rate). */
export const UNLOAD_DIRECT_RATE_MULT = 0.5;
/** Grooming one item of a brood pile tends every item within this radius (GDD 02 §10.4 nurse.tend: 2 BU), BU. */
export const GROOM_PILE_RADIUS_BU = 2;

// ---- passive home marking (GDD 02 §8.2 HOME_DEPOSIT, balance/pheromone.ts HOME_DEPOSIT_PER_BU) ----
/** Every colony ant outside marks the ground it walks: one home dab per this many BU walked (cells are 4 BU). */
export const HOME_DAB_SPACING_BU = 2;
/** At most this many home dabs per ant and tick (a long LOD step or a fall is not a smear). */
export const HOME_MAX_DABS_PER_TICK = 4;
