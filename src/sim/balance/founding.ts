// The opening sequence and the founding model (GDD 06 §5; 00-index C6; owner: founding, src/sim/colony/founding).
// Per-species values that are species facts (R0, clutch cap, readiness geometry) live in SpeciesDef.opening; this
// file holds the opening's rules. Rates are per game day (GD) unless the name says otherwise.

import type { SpeciesId } from '@/sim/types';

// ---- phases and timing (GDD 06 §5.1-§5.4) ----

/** The wordless intro card lasts this long (real s) unless a key skips it. */
export const OPEN_INTRO_S = 6;
/** Dealation: the queen sheds her wings (game s); input is locked for the first OPEN_DEALATION_LOCK_S. */
export const OPEN_DEALATION_S = 8;
export const OPEN_DEALATION_LOCK_S = 3;

// ---- reserves (GDD 06 §5.5) ----

/** Queen upkeep from the founding pool at all times (0.30 C + 0.10 P), loads per GD. */
export const FOUND_UPKEEP_PER_GD = 0.4;
/** Extra drain while she is above ground, loads per GD. */
export const FOUND_SURFACE_EXTRA_PER_GD = 0.35;
/** Each dig bite of the founding queen costs this much of the pool, loads. */
export const FOUND_DIG_COST_PER_BITE = 0.02;
/** Larval food over the whole larval stage (1.2 P + 0.4 C), drawn progressively, loads per larva. */
export const LARVA_COST_LOADS = 1.6;
/** Upkeep factor while development is frozen in winter. */
export const FOUND_WINTER_UPKEEP_FACTOR = 0.4;
/** Visible abdomen thickness = BASE + SPAN x reserves. */
export const FOUND_ABDOMEN_BASE = 0.55;
export const FOUND_ABDOMEN_SPAN = 0.45;

// ---- desiccation (shelter clock) and health (GDD 06 §5.5) ----

/** Desiccation per GD: open sun / shade or cover / in a shaft deeper than SHAFT_REFUGE_BU / sealed and humid. */
export const DESICC_OPEN_PER_GD = 1.2;
export const DESICC_SHADE_PER_GD = 0.4;
export const DESICC_SHAFT_PER_GD = 0.1;
export const DESICC_SEALED_PER_GD = -0.5;
/** Shaft depth that counts as shelter, BU (also the threat refuge depth of §5.6 is deeper, 4 BU). */
export const DESICC_SHAFT_REFUGE_BU = 3;
/** Static day-mean shade (0..1) from which the ground counts as shaded. */
export const DESICC_SHADE_MIN = 0.5;
/** Sealed chamber humidity from which the queen recovers. */
export const DESICC_SEALED_RH_MIN = 0.6;
/** Rate multiplier while the micro temperature is at or above the species' shadeSeekC. */
export const DESICC_HEAT_MULT = 1.5;
/** Health regained per GD while sealed (fraction of max). */
export const FOUND_HEALTH_REGEN_SEALED = 0.05;

// ---- site assessment (GDD 06 §5.7) ----

/** Holding T this long starts a read-out; standing still this long over diggable ground starts one too, game s. */
export const SITE_SNIFF_HOLD_S = 1.2;
export const SITE_AUTO_STILL_S = 1.5;
/** A read-out persists while the queen stays within this radius, BU, and refreshes this often, game s. */
export const SITE_KEEP_RADIUS_BU = 8;
export const SITE_REFRESH_S = 0.5;
/** Moving slower than this counts as standing still, BU/s. */
export const SITE_STILL_SPEED_BU_S = 0.2;
/**
 * Site quality itself (factors, weights, word thresholds) is the static suitability map's: one scoring function
 * and one threshold table (directions §K), src/worldgen/maps/suitability.ts with SUIT / SUITABILITY in
 * src/worldgen/tuning/maps.ts. The values below only word the read-out's raw readings.
 */
/** The live ceiling probe: an upward trace from this far above the ground; the roof primitive is looked up within this radius, BU. */
export const SITE_CEILING_PROBE = { startBu: 0.25, primRadiusBu: 0.5 } as const;
/** Read-out words of the raw soil moisture (theta): Dry below the first, ... Waterlogged from the last. */
export const SITE_MOISTURE_WORD_THETA = [0.15, 0.3, 0.65, 0.9] as const;
/** The read-out's dotted scale (GDD 08 §9.3 "Moisture ●●●○○"): dots per factor; the warmth word follows the dots. */
export const SITE_FACTOR_DOTS = 5;

// ---- digging, readiness, sealing (GDD 06 §5.8-§5.9, GDD 03 §13) ----

/** Readiness is re-measured this often while digging, ticks (GDD 03: every game second). */
export const FOUND_READINESS_EVERY_TICKS = 10;
/** A bite this far (BU) from the founding cavity, not connected to it, starts a new site (GDD 03 §13.4). */
export const FOUND_ABANDON_BU = 6;
/** At most this many abandoned burrows per queen (GDD 03 §13.4). */
export const FOUND_ABANDON_MAX = 3;
/** Entrance ids remembered of abandoned sites (several openings per burrow), a bounded record. */
export const FOUND_ABANDON_RECORD_MAX = 12;
/** The queen counts as inside the cell when this deep below the ground (with readiness met), BU below D_MIN. */
export const FOUND_IN_CELL_MARGIN_BU = 2;
/**
 * Soil for the plug (GDD 06 §5.9): the queen in the throat scrapes the wall beside her at these slopes (deg, the
 * dig bite's ramp slope; first that removes soil wins).
 */
export const FOUND_SEAL_SCRAPE_SLOPES_DEG = [0, 30, -30, 60] as const;
/** ... at these headings from her own, deg (behind first: down the shaft, away from the plug; never straight ahead). */
export const FOUND_SEAL_SCRAPE_HEADINGS_DEG = [180, 135, -135, 90, -90, 45, -45] as const;
/** ... and never within this distance of the ground surface (a scrape there could open a new hole), BU. */
export const FOUND_SEAL_SCRAPE_SOIL_BU = 0.5;
/** A scrape is skipped when plug voxels lie within the bite radius + MARGIN of its ramp over the first REACH, BU. */
export const FOUND_SEAL_SCRAPE_MARGIN_BU = 0.75;
export const FOUND_SEAL_SCRAPE_REACH_BU = 1.5;
/** ... while at least this deep below the ground, BU (inside the cavity, not on the surface). */
export const FOUND_SEAL_SCRAPE_MIN_DEPTH_BU = 0.5;
/** An entrance belongs to the founding cavity when a point this far down its throat (BU) is connected to the cell. */
export const FOUND_THROAT_PROBE_BU = [1, 2, 3, 4] as const;
/**
 * Sealing by the leak (task founding-close §1, src/sim/colony/founding/seal*.ts). The cavity is flooded from the
 * cell through open samples to the outside air within this radius, BU, and at most this many samples.
 */
export const SEAL_FLOOD_RADIUS_BU = 40;
export const SEAL_FLOOD_MAX_SAMPLES = 60_000;
/** The nest's founding pocket rule (src/sim/nest/entrances.ts): carved space this large behind a throat is never a
 * dead-end pit (searched no further), samples. */
export const FOUND_POCKET_MAX_SAMPLES = 20_000;
/** The plug aims where the leak path is this far inside the soil (substrate distance), BU. */
export const SEAL_TARGET_SOIL_BU = 0.75;
/** Stands are chosen this far inside the action's throat reach, BU (the walker settles a little off its goal). */
export const SEAL_REACH_MARGIN_BU = 0.25;
/** The guide sends the plug's command only this far inside the action's reach (she may settle a little), BU. */
export const SEAL_COMMAND_MARGIN_BU = 0.1;
/** ... and only while she moves slower than this (settled), BU/s. */
export const SEAL_SETTLED_SPEED_BU_S = 0.5;
/** A plug is worth placing when it would fill at least this much of the passage (SEAL_SOIL_WEIGHT per soil sample). */
export const SEAL_MIN_COVER = 1;
/** A passage soil sample a plug fills counts this many times a carved air sample over the passage it uses up. */
export const SEAL_SOIL_WEIGHT = 10;
/** The best-scored stands checked for a plug that cuts the leak outright (a flood each). */
export const SEAL_CUT_CHECKS = 8;
/** Aimed plugs (viab-founding): passage samples tried as aims per plan, and the margin kept inside the aim reach, BU. */
export const SEAL_AIM_CANDIDATES = 48;
/** Aims tried per cross-section by the `narrow` strategy (every cross-section is tried, narrowest first). */
export const SEAL_LAYER_AIMS = 12;
export const SEAL_AIM_MARGIN_BU = 0.3;
/** The stand lies at least this much deeper in the throat (farther from the opening) than the plug's aim, BU. */
export const SEAL_STAND_BEHIND_BU = 0.5;
/** The back-fill strategy with nothing of the leak in reach: she climbs this far along it toward the opening, BU. */
export const SEAL_BELOW_STEP_BU = 1.5;
/**
 * Every plug the guide lays lies inside the opening's throat sphere (radius + THROAT_BU) by at least this much, BU:
 * there the nest counts it as the entrance's plug, and there the first workers' `unseal-entrance` (whose stand and
 * reach are the throat) dig it out at the hand-over (GDD 06 §5.13 (b)); a plug past the sphere could be undone by
 * nobody. One body length of a worker (the digger's body centre stands behind the plug face it bites).
 */
export const SEAL_PLUG_INSIDE_BU = 1;
/** Other ants within this distance of the opening (or of her, for the back-fill) are kept clear of a plug, BU. */
export const SEAL_OTHER_ANTS_BU = 8;
/** `deep` / `mouth` strategies: the inner / outer part of the throat sphere, split at this fraction of its radius. */
export const SEAL_DEEP_SPLIT = 0.5;
/** The queen walks to a stand until this close, BU, or gives it up after this long, ticks. */
export const SEAL_STAND_TOL_BU = 0.7;
export const SEAL_WALK_MAX_TICKS = 200;
/** While walking, every this many ticks a pose in reach that already plugs well is taken. */
export const SEAL_OPPORTUNITY_TICKS = 10;
/** The guide's watchdog (viab-founding item 2): no plug landed for this long, ticks, or a strategy out of stands
 * and paused this long -> the next strategy (sealPlan.ts SEAL_STRATEGIES), never the same attempt again. */
export const SEAL_STRATEGY_TICKS = 200;
/** Walking to a stand: moved less than this (BU) in this many ticks -> the stand is given up (a stalled walker). */
export const SEAL_STALL_BU = 0.3;
export const SEAL_STALL_TICKS = 40;
/** The possessed queen is steered along a route through the cavity to a waypoint this far ahead, BU; the route
 * search visits at most this many samples. */
export const SEAL_WAYPOINT_BU = 1.5;
export const SEAL_ROUTE_MAX_SAMPLES = 20_000;
/** ... the first route sample whose direction lies at least this much (0..1) along her walking surface. */
export const SEAL_WAYPOINT_TANGENT = 0.6;
/** Shut off from her cell by a plug, she bites back toward it once per this many ticks (about one bite). */
export const SEAL_UNPOCKET_EVERY_TICKS = 13;
/** Such a bite is tried at these fractions of the slope toward the cavity, in order (straight at it, level, half). */
export const SEAL_UNPOCKET_SLOPE_FRACS = [1, 0, 0.5] as const;
/** Stands given up within this radius of an unreachable one, BU; after this many the guide stops (prompt). */
export const SEAL_EXCLUDE_BU = 0.75;
export const SEAL_MAX_REPLANS = 6;
/**
 * Bound of one sealing (stated and tested): at most this many plugs (seal-entrance actions) for any throat the dig
 * can produce. Each plug fills up to a PLUG_RADIUS sphere across the leak, so a 3 BU throat needs about 3-6.
 */
export const SEAL_MAX_PLUGS = 12;
/** Without soil in her mandibles at the stand for this long she walks toward the cell to scrape some, ticks. */
export const SEAL_SOIL_WAIT_TICKS = 20;
/** The passive player: no input this long in phase `seal` and the queen seals by herself, GD (same path as E). */
export const OPEN_AUTO_SEAL_GD = 0.5;

// ---- clutch (GDD 06 §5.10) ----

/** Chamber volume per egg of the clutch, BU^3 (maxEggsByVolume = floor(volume / this)). */
export const EGG_VOLUME_BU3 = 0.25;
/** No batch within this long after sealing: prompt; after OPEN_AUTO_LAY_GD the queen lays one batch herself. */
export const OPEN_LAY_PROMPT_GD = 1.0;
export const OPEN_AUTO_LAY_GD = 1.5;
/** Forecast safe band: the highest clutch whose expected end reserves stay at or above this. */
export const FORECAST_SAFE_RESERVE = 0.15;
/** Forecast range shown: [LO x E, HI x E]. */
export const FORECAST_RANGE = [0.7, 1.3] as const;

// ---- founding model (GDD 06 §5.12) ----

/** Brood hazard mu per GD = min(MAX, max(MIN, K x (Q_REF - Q))) x muSpecies x difficulty. */
export const FOUND_MU = { min: 0.06, max: 0.6, k: 0.42, qRef: 1.1 } as const;
export const FOUND_MU_SPECIES: Record<SpeciesId, number> = {
  'lasius-niger': 1.0, 'camponotus-pennsylvanicus': 0.55, 'messor-barbarus': 1.0, 'atta-texana': 0.9,
};
/** Moisture adds x (1 + GAIN x max(0, REF - moisture) / REF). */
export const FOUND_MU_MOIST = { ref: 0.3, gain: 2 } as const;
/** Cannibalism below LOW x R0: every EVERY_GD with probability P the queen eats the youngest larva. */
export const FOUND_CANNIBAL = { low: 0.1, everyGd: 0.05, p: 0.25, larvaReturn: 0.6, eggReturn: 0.024 } as const;
/** Hazard rates per GD (sealed): flood base, intruder base and seal factor, fungus base, collapse base and depth. */
export const FOUND_HAZARD = {
  floodBase: 0.35, intruderBase: 0.05, intruderSealed: 0.4, intruderRivalGain: 2, fungusBase: 0.03,
  fungusHumidityFrom: 0.8, fungusHumiditySpan: 0.2, collapseBase: 0.06, collapseDepthBu: 5,
} as const;
/** Default (no response) outcomes of a hazard: share of brood lost, queen health lost. */
export const FOUND_HAZARD_LOSS = {
  flood: { brood: 0.6, health: 0 }, intruder: { brood: 0.8, health: 0.4 }, fungus: { brood: 0.5, health: 0 },
  collapse: { brood: 0.5, health: 0 }, outbreak: { brood: 0.5, health: 0 },
} as const;
/** Gentle resolves hazards silently with the "responded" outcome halved (GDD 06 §5.11 table / 2). */
export const FOUND_HAZARD_RESPONDED = {
  flood: { brood: 0.075, health: 0 }, intruder: { brood: 0.05, health: 0.05 }, fungus: { brood: 0.05, health: 0 },
  collapse: { brood: 0.1, health: 0 }, outbreak: { brood: 0.05, health: 0 },
} as const;
/**
 * The success outcome of a hazard the queen responds to (GDD 06 §5.11 table, "Success outcome"). Interrupt beats
 * (handing the queen back to the player, §5.11) are T2; until they exist her lapse care is automatic, so the
 * hazards that would have interrupted the lapse (the first diff.openingInterruptMax) take this outcome: she
 * re-seals, bites the intruder, carries the brood high (founding-close decision, see the report).
 */
export const FOUND_HAZARD_RESPONSE = {
  flood: { brood: 0.15, health: 0 }, intruder: { brood: 0.1, health: 0.1 }, fungus: { brood: 0.1, health: 0 },
  collapse: { brood: 0.2, health: 0 }, outbreak: { brood: 0.1, health: 0 },
} as const;
/** The founding hazards are rolled this often, GD. */
export const FOUND_HAZARD_EVERY_GD = 0.05;

/**
 * The first brood is fast-tracked (design brief; founding-close ruling): the claustral brood's eggs and pupae develop
 * this many times faster than the colony's later brood at the same temperature. The larvae keep their rate, so each
 * still costs LARVA_COST_LOADS of the pool; the brood hazard is compressed with the time (the same hazard per unit
 * of development), so the worker count of GDD 06 §5.12 / E18 is unchanged and only the span shortens. Measured as
 * the least value giving every generated world 1-8 a hand-over at least 1 GD before autumn (see the report).
 */
export const FOUND_FIRST_BROOD_DEV_MULT = 1.5;

// ---- automatic queen care in the claustral cell (GDD 02 §2.7 `queen.found-care`, GDD 06 §5.11) ----

/** Care runs this often, ticks (the colony's slow tick). */
export const FOUND_CARE_EVERY_TICKS = 10;
/** The queen tops a larva's gut up when it falls below this, loads. */
export const FOUND_CARE_FEED_BELOW = 0.15;

// ---- time-lapse (GDD 06 §5.11) ----

/** The lapse ends this long after the first eclosion, GD. */
export const FOUND_END_AFTER_ECLOSION_GD = 0.4;
/** Playback target and limits, real s; speed = span x 600 / target. */
export const TIMELAPSE_TARGET_S = 75;
export const TIMELAPSE_MIN_S = 45;
export const TIMELAPSE_MAX_S = 120;
/** Expected span used for the progress bar before the first eclosion is known, GD (Lasius 4.5-5.5). */
export const TIMELAPSE_SPAN_GUESS_GD = 4.9;
/** Beat boundaries by playback fraction (eggs, larvae, pupae, cocoons, eclosion, final card). */
export const TIMELAPSE_BEATS = [0.12, 0.35, 0.55, 0.8, 0.95] as const;
/** The lapse re-estimates its end every this many ticks, from the most advanced brood once it is this far along. */
export const TIMELAPSE_REESTIMATE_TICKS = 100;
export const TIMELAPSE_REESTIMATE_MIN_FRAC = 0.05;
/** Overlay counters and the stage strip refresh every this many ticks. */
export const TIMELAPSE_COUNTER_TICKS = 10;
/** Skipped: the final card stays this long, real s. */
export const TIMELAPSE_SKIP_CARD_S = 2;

// ---- hand-over and failure (GDD 06 §5.13, §5.14) ----

/** Hand-over: paused for the first second; `done` on first movement input or after this long, real s. */
export const HANDOVER_PAUSE_S = 1;
export const HANDOVER_DONE_S = 10;
/**
 * Reopening (GDD 06 §5.13 (b)): the plug's inner face is searched within this radius of the opening on a grid of
 * this step, BU; the workers' entrance plan through the plug has this priority.
 */
export const REOPEN_FACE_SEARCH_BU = 5;
export const REOPEN_FACE_STEP_BU = 0.5;
/** ... at least this far inside the soil (substrate distance), BU: carved space, not the air above the plug. */
export const REOPEN_FACE_INSIDE_BU = 0.75;
/** A plug laid deep in the throat: the face is searched around this many of its voxels farthest from the opening. */
export const REOPEN_FACE_PLUG_TRIES = 4;
/**
 * A plug aimed at the throat's inner end reaches past the throat sphere by up to its plug radius (PLUG_RADIUS_BU
 * 1.2): the reopening looks for its voxels this far past the opening's rim, BU (THROAT_BU 3 + the plug radius +
 * one voxel).
 */
export const REOPEN_DEEP_REACH_BU = 4.7;
export const REOPEN_PLAN_PRIORITY = 'urgent' as const;
/**
 * After the hand-over a new founding plan is asked for (when none is left) every REOPEN_CHECK_TICKS ticks: the
 * passage through a closed throat for REOPEN_MAX_GD (dug REOPEN_PAST_BU beyond the opening), and short plans
 * anchored at each plug remnant, rising REOPEN_PAST_BU, for as long as remnants are left.
 */
export const REOPEN_CHECK_TICKS = 50;
export const REOPEN_MAX_GD = 2;
export const REOPEN_PAST_BU = 0.5;
/** The plug closing the cavity past the throat is searched through at most this many of its voxels. */
export const REOPEN_PLUG_MAX_SAMPLES = 4000;
/** A founding reopening plan still live after this long is cancelled (nobody could dig it), GD. */
export const REOPEN_PLAN_STALL_GD = 0.2;
/** All brood lost with the queen alive: one extra clutch of up to half the cap if R >= this x R0. */
export const BROOD_LOST_RELAY_MIN = 0.35;
/** ... else `failed` with cause `no-workers` after this long, GD. */
export const BROOD_LOST_FAIL_GD = 1;

// ---- cheat.completeFounding ----

/** Egg-to-worker survival the automatic clutch assumes (GDD 06 §5.12: about 46 % of eggs at a typical site). */
export const AUTO_CLUTCH_SURVIVAL = 0.45;
/** The cheat's founding template: the shaft as a ramp at this pitch (deg), carved in spheres this far apart, and
 * the cell overlapping the ramp's foot by this much, BU. */
export const AUTO_SHAFT_PITCH_DEG = 55;
export const AUTO_CARVE_STEP_BU = 0.3;
export const AUTO_CELL_OVERLAP_BU = 0.5;
/** The template's cell is probed for diggable ground at this share of its half-sizes (heading choice). */
export const AUTO_TEMPLATE_PROBE_FRAC = 0.8;
/** No heading at her place has the template in soil: the nearest place within this radius that has one, BU. */
export const AUTO_SITE_SEARCH_BU = 24;
