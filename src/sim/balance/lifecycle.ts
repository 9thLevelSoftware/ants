// Tunable numbers of overwintering, reproduction, the nuptial flight, lineage and succession (GDD 06 §6, §11-§13).
// Owner: overwinter-repro. Species values (winter mode, cold stress, alate windows, costs, p_air ...) live in the
// species data; only the species-independent constants are here. Imported directly (not through the balance barrel).

// ---- 6.2 trigger sequence ----

/** Notice: on autumn day (season length - OVERWINTER_NOTICE_DAYS_BEFORE_END), at this hour. */
export const OVERWINTER_NOTICE_DAYS_BEFORE_END = 1;
export const OVERWINTER_NOTICE_HOUR = 12;
/** "Delay one day" may be used this many times per winter in total. */
export const OVERWINTER_DELAY_MAX_DAYS = 2;
/** The banner lasts at most this many real seconds, then Begin happens on its own (GDD 06 §6.2). */
export const OVERWINTER_BANNER_AUTO_S = 8;
/** The same at 1x, in ticks (kept for callers that think in ticks; the sim scales it by the running speed). */
export const OVERWINTER_BANNER_AUTO_TICKS = 80;
/** Ants outdoors beyond this distance from an entrance at Begin: chance of dying of cold. */
export const OVERWINTER_OUTDOOR_SAFE_BU = 120;
export const OVERWINTER_OUTDOOR_DEATH_P = 0.5;
/** Heated-nest rule (6.1): brood chambers at or above this mean temperature keep the colony active (no lapse). */
export const WINTER_ACTIVE_TMEAN_C = 14;
/** The heated-nest mean is weighted by brood over the chambers holding this share of it, over this many GD. */
export const WINTER_ACTIVE_BROOD_SHARE = 0.8;
export const WINTER_ACTIVE_WINDOW_GD = 2;

// ---- 6.3 aggregate model ----

/** Reference cluster temperature of the metabolic factor, C. */
export const WINT_MET_REF_C = 6;
/** Resting upkeep, C loads per GD: per worker, queen, per dormant larva. */
export const WINT_C_PER_WORKER = 0.08;
export const WINT_C_QUEEN = 0.3;
export const WINT_C_PER_LARVA = 0.02;
/** Protein upkeep, P loads per GD: queen and per larva. */
export const WINT_P_QUEEN = 0.1;
export const WINT_P_PER_LARVA = 0.01;
/** Starvation once C is gone: brood eaten and workers dying, fractions per GD; larvae without P, per GD. */
export const WINT_STARVE_BROOD_PER_GD = 0.25;
export const WINT_STARVE_WORKERS_PER_GD = 0.12;
export const WINT_NO_P_LARVAE_PER_GD = 0.06;
/** Cold stress: worker loss per GD per degree below the species threshold; total cap. */
export const WINT_COLD_PER_DEG_GD = 0.008;
export const WINT_COLD_CAP = 0.6;
/** Base loss of larvae over the winter (workers: species `wintBaseLoss`); old workers (age > fraction of life) x2. */
export const WINT_BASE_LOSS_LARVAE = 0.1;
export const WINT_OLD_AGE_FRAC = 0.6;
export const WINT_OLD_LOSS_MULT = 2;
/**
 * Fungal disease: chance per winter (x3 above the nest humidity), worker loss range, larva loss. Nest humidity is the
 * soil's water saturation at the cluster (0..1 of the layer capacity; loam drains above 0.55), so 0.9 is a
 * waterlogged nest, not merely a moist one.
 */
export const P_WINTER_FUNGUS = 0.05;
export const WINT_FUNGUS_HUMID_MULT = 3;
export const WINT_FUNGUS_HUMIDITY = 0.9;
/** Nest humidity of a nest inside a building (no soil water), and of a world without a moisture grid. */
export const WINT_INTERIOR_WETNESS = 0.3;
export const WINT_FUNGUS_WORKER_LOSS: [number, number] = [0.1, 0.25];
export const WINT_FUNGUS_LARVA_LOSS = 0.5;
/** Flood after a rain event: P = k (1 - floodSafety) precipPeakNorm; occupants lost. */
export const WINT_FLOOD_K = 0.3;
export const WINT_FLOOD_LOSS = 0.5;
/** Queen: extra death chance per unit of cold stress, and death after this many GD with no C. */
export const WINT_QUEEN_COLD_P = 0.02;
export const WINT_QUEEN_STARVE_GD = 3;
/** Pupae colder than this at Begin die with WINT_PUPA_COLD_DEATH (they cannot develop through the winter). */
export const WINT_PUPA_COLD_C = 10;
export const WINT_PUPA_COLD_DEATH = 0.5;

// Winter weather draw (one per game day, rng.winter): the cluster's chamber follows the soil wave; frost days cool
// it by a depth-damped drop; rain days are flood checks. Fractions match GDD 06 App. E 7 (winter frost 0.15-0.27).
export const WINT_FROST_DAY_P = 0.22;
export const WINT_RAIN_DAY_P = 0.3;
/** Rain of a rainy winter day, mm (uniform), and the peak used to normalise it. */
export const WINT_RAIN_MM: [number, number] = [2, 16];
export const WINT_RAIN_PEAK_MM = 16;
/** Frost drop of the ground surface, C, damped with depth by exp(-depth / WINT_FROST_DAMP_MM). */
export const WINT_FROST_DROP_C = 3.5;
export const WINT_FROST_DAMP_MM = 120;
/** Hours sampled per winter day for the cluster's minimum and mean temperatures. */
export const WINT_SAMPLE_HOURS: readonly number[] = [3, 9, 15, 21];
/** Workers cluster in chambers of the colony whose depth is at least this fraction of the deepest one. */
export const WINT_CLUSTER_DEPTH_FRAC = 0.8;
/** Report: days of stores remaining are computed at the colony's spring need (loads per GD per worker / larva). */
export const WINT_REPORT_SPRING_C_PER_WORKER = 0.12;

// ---- 6.4 presentation ----

/** Real seconds of the winter time-lapse when watched (GDD 06 `OVERWINTER_TARGET_S`, 30-75). */
export const OVERWINTER_TARGET_S = 45;
/** Reduced motion: the lapse is this many crossfaded stills. */
export const OVERWINTER_STILLS = 5;

// ---- 11.1-11.3 reproduction ----

/** Stores must cover these many GD of colony need for alate rearing (C and P); rearing stops below half. */
export const REPRO_STORE_DAYS_C = 3;
export const REPRO_STORE_DAYS_P = 1.5;
export const REPRO_STOP_FRAC = 0.5;
/** Larval nutrition ratio below which a sexual larva is demoted to a worker at pupation. */
export const REPRO_DEMOTE_RATIO = 0.6;
/** Callow alates mature in this many GD, then wait. */
export const ALATE_CALLOW_GD = 0.3;
/** Unreleased alates are evicted this many GD after the flight window closes; workers recover this share of P. */
export const ALATE_EXPIRE_GD = 3;
export const ALATE_EXPIRE_P_RECOVERY = 0.4;
/** Protein share of a larva's total food (GDD 06 §11.2 example: 19.2 loads = 14.4 P + 4.8 C). */
export const ALATE_P_SHARE = 0.75;

// ---- 11.5 flight day ----

/** The day roll happens this many hours before the launch hour start. */
export const FLIGHT_ROLL_LEAD_H = 0.5;
export const FLIGHT_P_MAX = 0.85;
/** p_T: linear from the minimum air temperature to this temperature, C. */
export const FLIGHT_T_FULL_C = 25;
/** p_W: 1 below this wind, linear to 0 at the species maximum, m/s. */
export const FLIGHT_W_CALM_MS = 1.7;
export const FLIGHT_STATE_FACTOR: Record<string, number> = { clear: 1.0, heat: 0.8, overcast: 0.6 };
/** Bonus when rain ended within this many GD, and the bonus per 3 C of warming since yesterday (clamped +-1). */
export const FLIGHT_RAIN_BONUS = 0.1;
export const FLIGHT_RAIN_BONUS_GD = 1.5;
export const FLIGHT_TREND_BONUS = 0.05;
export const FLIGHT_TREND_SCALE_C = 3;

// ---- 11.6 the flight ----

/** Assembly before take-off, GD (0.1 GD = 1 real minute). */
export const FLIGHT_ASSEMBLY_GD = 0.1;
/** Aggregate resolution: wind above this lowers p_air by FLIGHT_WIND_AIR_MULT; mating needs n_m / n_g >= 0.3..1. */
export const FLIGHT_WIND_AIR_MS = 3;
export const FLIGHT_WIND_AIR_MULT = 0.85;
export const FLIGHT_MALE_RATIO_MIN = 0.3;
/** Bird density term of p_air (0..1 from the world; constant until creatures publish one). */
export const FLIGHT_BIRD_DENSITY = 0.3;
export const FLIGHT_BIRD_LOSS = 0.1;
/** Possessed flight kinematics, BU/s: climb, forward, sink when not climbing; wind drift per m/s of wind2m. */
export const FLIGHT_CLIMB_BU_S = 40;
export const FLIGHT_FORWARD_BU_S = 80;
export const FLIGHT_SINK_BU_S = 6;
export const FLIGHT_DESCEND_BU_S = 30;
export const FLIGHT_WIND_DRIFT_BU_PER_MS = 0.4;
/** Turn rate toward the steering direction, rad/s (GDD 01 §4.4: 120 deg/s). */
export const FLIGHT_TURN_RAD_S = (120 * Math.PI) / 180;
/** Energy 1.0 falls by 1/90 per s (x1.5 in wind above FLIGHT_WIND_AIR_MS); at 0 a forced landing. */
export const FLIGHT_ENERGY_PER_S = 1 / 90;
export const FLIGHT_ENERGY_WIND_MULT = 1.5;
/** Lek: tallest point within this radius of the nest, males hover this high above it; mating radius and time. */
export const FLIGHT_LEK_SEARCH_BU = 1500;
export const FLIGHT_LEK_SAMPLES = 24;
export const FLIGHT_LEK_HEIGHT_BU = 60;
export const FLIGHT_LEK_RADIUS_BU = 60;
export const FLIGHT_MATING_S = 6;
/** Take-off height above the ground the ascend phase climbs to before cruising, BU; ceiling above the ground. */
export const FLIGHT_CRUISE_BU = 60;
export const FLIGHT_CEILING_BU = 250;
/** Below this height above the ground the gyne lands (touches down). */
export const FLIGHT_TOUCHDOWN_BU = 1.5;
/** Landing on a diggable material adds this to p_found; "Land now" halves p_mate when not mated. */
export const FLIGHT_DIGGABLE_FOUND_BONUS = 0.15;
export const FLIGHT_LAND_NOW_MATE_MULT = 0.5;
/** Longest possessed flight, real (= game at 1x) seconds; the rest resolves by the aggregate model. */
export const FLIGHT_MAX_S = 120;
/** Distance from the map edge counted as leaving the locality (dispersal off-map), BU. */
export const FLIGHT_EDGE_BU = 20;

// ---- 12 lineage ----

/** At most this many daughters are stored individually per flight (GDD 06 §12.1). */
export const LIN_MAX_DAUGHTERS_PER_FLIGHT = 12;

// ---- 13 succession ----

/** After the last ant dies the colony is extinct after this many GD (30 s). */
export const EXTINCTION_GRACE_GD = 0.05;
/** The `last-ants` state starts at this many living ants. */
export const LAST_ANTS = 3;
/** Epitaph: journal entries shown at the end, and causes of death listed. */
export const EPITAPH_LAST_ENTRIES = 10;
export const EPITAPH_TOP_CAUSES = 5;
