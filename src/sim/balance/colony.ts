import type { MarkerKind } from '@/sim/types';

// Colony and queen defaults used by createColony / createNewGame (GDD 02 §3, §5; GDD 06 §5). A founding queen
// starts with the single reserve pool `SpeciesDef.opening.R0` (GDD 06 model, E-19); her `reserve` / `reserveP` stay
// 0 until hand-over splits what is left (E-21). The laying log and the honeydew history are sized from the
// configured season length, so neither has a constant here.

/** Queen fecundity draw: normal(mean, sd) clamped. */
export const FECUNDITY_MEAN = 1.0;
export const FECUNDITY_SD = 0.15;
export const FECUNDITY_MIN = 0.6;
export const FECUNDITY_MAX = 1.4;
/** Default yield per forager trip before any data, loads (GDD 02). */
export const YIELD_PER_FORAGER_DEFAULT = 1.5;
/** Default protein share of foraging (GDD 02 sP). */
export const PROTEIN_SHARE_DEFAULT = 0.3;
/** Default alate investment and gyne share (GDD 06 §11). */
export const ALATE_INVESTMENT_DEFAULT = 0.5;
export const GYNE_SHARE_DEFAULT = 0.4;
/** The stayIn directive auto-clears after this many game days (GDD 02 §12). */
export const STAY_IN_DAYS = 1;
/** Ants spawned by cheat.spawnAnts are scattered within this radius of the spawn point, BU. */
export const CHEAT_SPAWN_SCATTER_BU = 4;
/** Cheat-spawned ants are placed from this far above the ground, sphere-traced down onto the surface, BU. */
export const CHEAT_SPAWN_LIFT_BU = 2;
/** Default species directive extras (GDD 07 §3 `directiveExtras`): casteEmphasis -1..1 (0 = species mix). */
export const CASTE_EMPHASIS_DEFAULT = 0;
/** Messor granary-care priority multiplier 0..1 (GDD 07 granary care; no default given, mid value). */
export const GRANARY_HYGIENE_DEFAULT = 0.5;
/** Atta minimum leaf quality accepted, 0..1 (GDD 07 fungus module: "leafSelectivity, default 0.3"). */
export const LEAF_SELECTIVITY_DEFAULT = 0.3;
/** Most markers of each kind per colony (GDD 02 §12.2 MARKER_CAP; dig = PLAN_CAP_PLAYER). */
export const MARKER_CAP: Record<MarkerKind, number> = {
  dig: 8, forage: 4, avoid: 8, rally: 1, entrance: 2, 'move-brood': 1, 'move-queen': 1, satellite: 1,
};
/**
 * Default marker radius when `placeMarker` gives none, BU (GDD 02: forage / avoid 30 in 10-80, rally 15 in 8-32;
 * point markers - dig, entrance, moves, satellite - use a small pick radius, an F1c choice).
 */
export const MARKER_DEFAULT_RADIUS_BU: Record<MarkerKind, number> = {
  dig: 4, forage: 30, avoid: 30, rally: 15, entrance: 4, 'move-brood': 4, 'move-queen': 4, satellite: 4,
};

// ======================================================================================================
// colony-core (GDD 02 §1-§14). Per-gd rates are applied per tick as rate x dt_gd. Names avoid the shared GDD
// primitive constants that live with their owners (EGG_COST_P, FEED_LARVA_LOADS in balance/actions.ts).
// ======================================================================================================

// ---- cadence ----
/** Physiology / brood "slow tick": every entity once per this many ticks, staggered by id (GDD 02 §0.2). */
export const PHYSIO_EVERY = 10;
/** Idle ants re-evaluate their task every IDLE_REEVAL_S game seconds (GDD 02 §6.5). */
export const IDLE_REEVAL_S = 5;
/** Forced check of ants in a surplus task, game s. */
export const SURPLUS_CHECK_S = 120;

// ---- metabolism (GDD 02 §1.4) ----
/** Upkeep per metabolic class, C loads per gd at MET_REF_C. */
export const MET_RATE_C = { 'met-rest': 0.08, 'met-light': 0.12, 'met-active': 0.2 } as const;
export const MET_REF_C = 25;
/** fMet(T) = clamp(2^((T - MET_REF_C) / MET_Q10_SPAN_C), MET_FACTOR_MIN, MET_FACTOR_MAX). */
export const MET_Q10_SPAN_C = 10;
export const MET_FACTOR_MIN = 0.15;
export const MET_FACTOR_MAX = 1.8;
export const MET_DORMANT_MULT = 0.3;
/** Possessed ant hurrying (GDD 01). */
export const MET_HURRY_MULT = 2;
/** Upkeep scales with mass relative to the standard worker as m^MET_MASS_EXP (GDD 07 §2.3). */
export const MET_MASS_EXP = 0.75;
/** A possessed (or behaviour-less) ant moving faster than this, BU/s, counts as active. */
export const MET_MOVING_BU_S = 0.5;

// ---- reserves, health, ageing, fatigue (GDD 02 §1.3-§1.7) ----
export const RESERVE_REFILL_RATE = 0.3;
/** Reserve refill needs pool daysC at or above this. */
export const RESERVE_REFILL_MIN_DAYS_C = 0.5;
/** Health (0..1) lost per gd while starving (crop C and reserve empty, no pool). */
export const STARVE_HEALTH_RATE = 0.5;
/** GDD 02 §1.4 base regeneration, health per gd; workers use the GDD 05 §4.7 split below, the queen this base. */
export const HEALTH_REGEN_RATE = 0.2;
/** GDD 05 §4.7 recovery: health per gd for a worker in the nest with crop C > 0 (int-1B-sim; was 0.2 everywhere). */
export const HEALTH_REGEN_IN_NEST = 0.25;
/** GDD 05 §4.7 recovery: health per gd anywhere else (outside, or in the nest with an empty crop). */
export const HEALTH_REGEN_ELSEWHERE = 0.1;
/**
 * After the founding hand-over the stores alerts (`food-c-low`, `food-p-low`, `colony-starving`) wait this long:
 * the first workers have not foraged yet and the pool is empty by design (GDD 06 §5.13), gd (int-1B-sim,
 * founding-close request 1).
 */
export const STARVE_ALERT_GRACE_GD = 1.0;
export const HEALTH_REGEN_MAX_FATIGUE = 0.8;
/** Heat or cold load below which health regenerates. */
export const HEALTH_REGEN_MAX_THERMAL_LOAD = 0.05;
export const INJURED_HEALTH = 0.4;
export const INJURED_RECOVER_HEALTH = 0.6;
export const AGE_RATE_IN_NEST = 1.0;
export const NANITIC_LIFESPAN_MEAN_GD = 24;
export const NANITIC_LIFESPAN_SD_GD = 10;
export const LIFESPAN_CLAMP_GD: readonly [number, number] = [10, 85];
/** Fatigue per game second by class, recovery per second while resting (GDD 02 §1.7). */
export const FATIGUE_GAIN_ACTIVE_S = 1 / 900;
export const FATIGUE_GAIN_LIGHT_S = 1 / 1800;
export const FATIGUE_RECOVER_S = 1 / 150;
export const REST_ENTER = 0.9;
export const REST_EXIT = 0.2;
/** Forager activation half-life, game s (GDD 02 §6.6 ENC_HALF_LIFE_S). */
export const ACTIVATION_HALF_LIFE_S = 40;
/** Toxin: health lost per load received, spread over TOXIN_EFFECT_GD; pool toxin half-life (GDD 02 §5.4.4). */
export const TOXIN_HEALTH_PER_LOAD = 2.0;
export const TOXIN_EFFECT_GD = 0.5;
export const TOXIN_HALF_LIFE_GD = 3;

// ---- brood (GDD 02 §2) ----
/** Base survival per stage; hazard per DU = -ln(S) / stage DU. */
export const BROOD_SURVIVAL = { egg: 0.9, larva: 0.85, pupa: 0.95 } as const;
/** Base hazard multiplier for diapause larvae. */
export const DIAPAUSE_HAZARD_MULT = 0.1;
/** Larval food over the whole stage, loads (worker; x food multiplier for sexuals). */
export const LARVA_P_REQ = 1.2;
export const LARVA_C_REQ = 0.4;
export const LARVA_GUT_CAP = 0.3;
/** A larva asks for food below this gut content, loads. */
export const LARVA_FEED_REQUEST = 0.15;
export const LARVA_STARVE_GD = 0.5;
export const LARVA_PSTARVE_GD = 2.0;
/** Without C, growth halves; without P, C use halves (GDD 02 §2.4). */
export const LARVA_C_DEFICIT_GROWTH = 0.5;
export const LARVA_P_DEFICIT_C_USE = 0.5;
/** Feed urgency = hunger + FEED_URGENCY_HUNGER_W x min(1, hungerT / FEED_URGENCY_HUNGER_GD). */
export const FEED_URGENCY_HUNGER_W = 0.5;
export const FEED_URGENCY_HUNGER_GD = 0.1;
/** Protein priority (GDD 02 §5.4.3): below this daysP, urgency x (1 + bonus x progress). */
export const PROTEIN_PRIORITY_DAYS_P = 0.5;
export const PRIORITY_PROGRESS_BONUS = 1.0;
export const UNTENDED_GD = 0.25;
export const ECLOSE_WAIT_GD = 0.3;
/** Extra brood hazards per gd (GDD 02 §2.5). */
export const BROOD_HAZARD = {
  untended: 2.0,
  /** Heat: heatPerC x (T - heatOffsetC) when T >= heatMinC. */
  heatMinC: 36, heatOffsetC: 35, heatPerC: 3.0,
  frostMaxC: 2, frost: 1.0, frostDiapause: 0.1,
  humidityMinRh: 0.5, humidity: 0.5,
  wasteTolerance: 3, hygienePerItem: 0.1, hygieneCap: 1.0,
  exposure: 1.0, flooding: 6.0, eclosionFailed: 3.0,
  /** Chamber flooded fraction from which brood is "in water". */
  floodFraction: 0.5,
} as const;
/** Stage-duration multipliers of sexual brood (GDD 02 §2.3, GDD 06 §11.2). Food multipliers are species data. */
export const SEXUAL_STAGE_DU_MULT: Record<'gyne' | 'male', { egg: number; larva: number; pupa: number }> = {
  gyne: { egg: 1, larva: 2.0, pupa: 1.1 },
  male: { egg: 1, larva: 1.2, pupa: 1 },
};
/** Larval food scales with the destined adult's mass as m^LARVA_FOOD_MASS_EXP (GDD 07 §2.3). */
export const LARVA_FOOD_MASS_EXP = 0.8;
export const NANITIC_SCALE = 0.85;
export const MINIM_SCALE = 0.9;
/** Minims (GDD 02 §2.6): larvae past this progress pupate early while colony needP >= MINIM_NEED_P for MINIM_TRIGGER_GD. */
export const MINIM_MIN_PROGRESS = 0.8;
export const MINIM_NEED_P = 0.8;
export const MINIM_TRIGGER_GD = 0.25;
/** Diapause (GDD 02 §2.8, T2): default-year doy, cold threshold and clocks. */
export const DIAPAUSE_DOY = 19;
export const DIAPAUSE_COLD_C = 12;
export const DIAPAUSE_ENTER_GD = 0.5;
export const DIAPAUSE_EXIT_GD = 0.2;
/** Recycling (GDD 02 §5.2): an eaten egg returns this much P; a cannibalised larva this share of what it was fed. */
export const EGG_RECYCLE_P = 0.03;
export const CANNIBAL_RECYCLE_FRAC = 0.5;
/** One cannibalised brood item per this many game seconds per colony (CANNIBAL_RATE). */
export const CANNIBAL_INTERVAL_S = 30;
/** Larvae are eaten only after this hunger time, gd. */
export const CANNIBAL_MIN_HUNGER_GD = 0.1;

// ---- queen (GDD 02 §3) ----
export const EGG_BUDGET_CAP = 3;
export const QUEEN_GUT_CAP = 1.0;
export const QUEEN_FAT_CAP = 3.0;
/** Health lost per gd while P upkeep is unpaid. */
export const QUEEN_P_UNPAID_HEALTH = 0.05;
/** Reserve refill from the gut, C per gd, while gut C exceeds QUEEN_REFILL_MIN_GUT_C. */
export const QUEEN_RESERVE_REFILL = 0.3;
export const QUEEN_REFILL_MIN_GUT_C = 0.5;
/** A queen with gut C and reserve empty dies of starvation after this many gd (GDD 06 QUEEN_STARVE_GD). */
export const QUEEN_STARVE_GD = 3;
/** fHealth: 0 below this health. */
export const QUEEN_LAY_MIN_HEALTH = 0.3;
export const WORKER_CAP_TAPER = 0.15;
/** Eggs count this much toward the projected worker number (fCap). */
export const PROJECTED_EGG_WEIGHT = 0.9;
/** No-worker queen may start a new clutch only with this protein reserve. */
export const NO_WORKER_CLUTCH_MIN_RESERVE_P = 3;
/** Laying-protein permission (GDD 02 §3.3). */
export const LAYING_P_MIN_DAYS = 0.25;
export const LAYING_LARVAL_HUNGER_MAX = 0.6;
export const LAYING_LARVAE_PER_NURSE = 3;
export const LAYING_LARVAE_EXTRA = 2;
/** Retinue target: queen gut C and P (GDD 02 §3.3). */
export const QUEEN_TARGET_GUT_C = 0.3;
export const QUEEN_TARGET_GUT_P = 0.4;
/** Queen ration mixes (GDD 02 §5.4.2): P share when laying is withheld. */
export const QUEEN_RATION_P_SHARE_WITHHELD = 0.25;
/** Ration base amount for the laying-permitted mix (0.10 P upkeep in 0.40 loads). */
export const QUEEN_RATION_BASE_P = 0.1;
export const QUEEN_RATION_BASE = 0.4;

// ---- pool, capacity, spoilage (GDD 02 §5.1) ----
export const STOMACH_C_BASE = 2;
export const STOMACH_C_PER_ADULT = 0.8;
export const STOMACH_P_PER_ADULT = 0.15;
export const P_SPOIL_HALF_LIFE_GD = 3;
export const C_SPOIL_HALF_LIFE_GD = 10;
export const SPOIL_REF_C = 20;
export const SPOIL_OVERFLOW_MULT = 1.5;
export const SPOIL_SUBMERGED_MULT = 2.0;
/** One spoiled-food waste item per this many spoiled loads. */
export const SPOILED_ITEM_LOADS = 0.5;
/** Pool counts as full when its free space is below this, loads. */
export const STORES_FULL_SPACE = 0.05;
export const STORES_FULL_ALERT_GD = 0.25;
/** Amounts below this count as zero, loads. */
export const LOAD_EPS = 1e-9;

// ---- needs and demand signals (GDD 02 §5.5) ----
export const NEED_EMA_GD = 0.5;
export const STOCK_TARGET_C_GD = 3;
export const STOCK_TARGET_P_GD = 1.5;
export const STOCK_TARGET_MULT = { low: 0.5, normal: 1, high: 2 } as const;
export const STOCK_REFILL_GD = 2;
export const NEED_RATE_C_MIN = 0.5;
export const NEED_RATE_P_MIN = 0.05;
/** Diet emphasis shifts the P share by DIET_SHIFT x diet / 100, clamped to [SP_MIN, SP_MAX]. */
export const DIET_SHIFT = 0.4;
export const DIET_RANGE = 100;
export const SP_MIN = 0.05;
export const SP_MAX = 0.95;
/** Nutrient weights w = NUTRIENT_W_BASE + need x share x NUTRIENT_W_GAIN. */
export const NUTRIENT_W_BASE = 0.2;
export const NUTRIENT_W_GAIN = 2;
/** needP from which the colony reports a protein deficit (GDD 05 aphid culling). */
export const PROTEIN_DEFICIT_NEED = 0.5;
/** Recruit acceptance P = clamp(base + gain x w_lead / max(wC, wP), base, 1). */
export const RECRUIT_ACCEPT_BASE = 0.3;
export const RECRUIT_ACCEPT_GAIN = 0.7;

// ---- starvation stages (GDD 02 §5.7) ----
export const LEAN_DAYS_C = 1.0;
export const LEAN_DAYS_P = 0.3;
export const LEAN_EXIT_DAYS_C = 1.3;
export const LEAN_EXIT_DAYS_P = 0.5;
export const LEAN_EXIT_GD = 0.1;
export const RATION_EXIT_C = 0.5;
export const RATION_EXIT_P = 0.1;
export const SACRIFICE_P_ZERO_GD = 0.2;
export const SACRIFICE_C_ZERO_GD = 0.5;

// ---- allocation (GDD 02 §6) ----
export const NURSE_FEED_CAPACITY = 4.5;
export const EGGS_PER_NURSE = 25;
export const PUPAE_PER_NURSE = 15;
export const DIAPAUSE_LARVAE_PER_NURSE = 40;
export const BROOD_MOVE_NURSE = 0.25;
export const QUEEN_CARE_BASE = 2;
export const QUEEN_CARE_PER_WORKERS = 100;
export const QUEEN_CARE_MAX = 10;
export const STORE_PER_FORAGER = 0.15;
export const SPOILED_ITEMS_PER_STORE = 10;
export const YIELD_PER_FORAGER_MIN = 0.5;
export const YIELD_EMA_GD = 1;
/** Foragers one feed slot of a known source keeps busy (cycle time / time at the source, GDD 02 §10.2). */
export const SOURCE_SLOT_FORAGERS = 4.5;
export const SCOUT_BASE_FRAC = 0.02;
export const SCOUT_SHORTFALL_FRAC = 0.05;
export const SCOUT_MAX_FRAC = 0.15;
export const SCOUT_MIN_ACTIVITY = 0.1;
export const HAUL_PER_PELLET = 6;
export const HAUL_PER_WASTE = 6;
export const HAUL_PER_CORPSE = 2;
export const HAUL_MAX_FRAC = 0.2;
export const CORPSE_HAUL_RADIUS_BU = 60;
/**
 * `midden-blocked` (GDD 02 §10.8, §14 diag-hygiene): a hauler that had to drop waste or soil at the internal dump
 * reports it (reportMiddenBlocked); the flag holds this long after the last report, game s.
 */
export const MIDDEN_REPORT_HOLD_S = 120;
/** diag-hygiene factor value while the midden is blocked (a strong limiting factor). */
export const DIAG_MIDDEN_BLOCKED_F = 0.3;
export const DEFEND_MIN_WORKERS = 40;
export const GUARDS_PER_ENTRANCE = 1;
export const THREAT_DEMAND_MULT = 3;
export const PATROL_FRAC = 0.02;
/** Alarm at an entrance above this raises the guard threat multiplier, ph (GDD 02 ALARM_ALERT). */
export const ENTRANCE_ALARM_ALERT_PH = 0.5;
/** Alarm at an entrance above this imposes the forager curfew, ph (GDD 02 ALARM_STRONG). */
export const CURFEW_ALARM_PH = 3.0;
export const MANUAL_RESERVE = 0.1;
export const MANUAL_FLOOR = 0.25;
/** Manual useful caps: group target <= a x D + b (GDD 02 §6.3); forage uncapped. */
export const MANUAL_CAP = { nurse: [2, 1], dig: [3, 1], defend: [3, 2] } as const;
/** Age multipliers of the response threshold (GDD 02 §6.4); a missing task means not eligible for the band. */
export const AGE_THRESHOLD_MULT = {
  callow: { nurse: 0.7, 'queen-care': 0.7, store: 1.5 },
  young: { nurse: 0.6, 'queen-care': 0.6, store: 0.9, dig: 1.4, haul: 1.6, guard: 2.0, patrol: 3.0, forage: 2.5, scout: 3.0, tend: 2.5 },
  mid: { nurse: 1.2, 'queen-care': 1.3, store: 0.8, dig: 0.8, haul: 0.9, guard: 0.9, patrol: 1.2, forage: 1.2, scout: 1.5, tend: 1.0 },
  old: { nurse: 2.5, 'queen-care': 2.5, store: 1.3, dig: 1.2, haul: 0.8, guard: 0.8, patrol: 0.7, forage: 0.6, scout: 0.7, tend: 0.7 },
} as const;
/** Age multiplier for species tasks the table does not list (garden, cut, mill). */
export const AGE_THRESHOLD_MULT_OTHER = 1;
/** Nanitics use the `mid` band from this many gd after eclosion. */
export const NANITIC_MID_AFTER_GD = 0.3;
/** Experience: each finished cycle multiplies exp by EXP_DECAY (floor EXP_MIN); daily relaxation toward 1. */
export const EXP_DECAY = 0.95;
export const EXP_MIN = 0.5;
export const EXP_MAX = 1.5;
export const EXP_RELAX_PER_GD = 0.1;
export const STAY_WEIGHT = 0.3;
export const SURPLUS_FACTOR = 1.2;
export const SURPLUS_SLACK = 1;
export const TASK_MIN_TENURE_S = 60;
/** task-changed events are sampled: possessed ants and every Nth ant id (GDD 02 App C). */
export const TASK_CHANGED_SAMPLE = 20;

// ---- forager activation (GDD 02 §6.6-6.7) ----
export const ENC_GAIN = 0.5;
export const ENC_SCOUT_MULT = 1.5;
export const RECRUIT_CONTACTS_MAX = 3;
export const RECRUIT_RADIUS_BU = 6;
/**
 * Waiting foragers stay within this distance of an entrance (GDD 02 §6.6 `forage.wait`), BU. A synthetic returner
 * (`cheat.injectReturn`) contacts waiting foragers within it of the entrance mouth, so it reaches the ones that
 * wait in the entrance chamber below the opening.
 */
export const FORAGE_WAIT_RADIUS_BU = 10;
export const ACTIVATION_DEPART = 1.0;
export const SPONT_DEPART_RATE_S = 1 / 240;
export const SPONT_NEED_BASE = 0.25;
export const SPONT_ROUTE_MULT = 2;
/** fEnv humidity term 0.7 + 0.3 x clamp((RH% - 40) / 40, 0, 1). */
export const FENV_RH_BASE = 0.7;
export const FENV_RH_GAIN = 0.3;
export const FENV_RH_LO_PCT = 40;
export const FENV_RH_SPAN_PCT = 40;
export const CURFEW_FENV = 0.05;
/** A return counts as successful from this crop amount unloaded, loads. */
export const SUCCESS_LOADS_MIN = 0.5;
export const LEAD_VALID_S = 120;
export const NEWS_MAX = 5;
export const NEWS_EXPIRY_GD = 0.5;

// ---- population accounting (GDD 02 §13.1) ----
/** Per-source intake tallies are dropped at the daily recount once the source is gone and unvisited this long, gd. */
export const POP_SOURCE_FORGET_GD = 7;

// ---- directives and markers (GDD 02 §12) ----
export const GYNE_SHARE_RANGE: readonly [number, number] = [0.2, 0.6];
/** Marker radius ranges, BU; kinds not listed keep their given radius. */
export const MARKER_RADIUS_RANGE_BU: Partial<Record<MarkerKind, readonly [number, number]>> = {
  forage: [10, 80], avoid: [10, 80], rally: [8, 32],
};
export const RALLY_EXPIRY_GD = 1;
export const MOVE_BROOD_LOCK_GD = 1;

// ---- diagnostics (GDD 02 §14) ----
export const DIAG_OK_RATIO = 0.75;
export const DIAG_WARN_RATIO = 0.4;
/** Factors at or above this value do not share the shortfall. */
export const DIAG_FACTOR_CUTOFF = 0.98;
/** Factor values are floored here before ln() so a zero factor has a finite, dominant weight. */
export const DIAG_FACTOR_FLOOR = 0.01;
/** The retinue factor of diag-egg-laying is floored here (it acts through protein supply). */
export const DIAG_QUEEN_CARE_FLOOR = 0.5;
export const DIAG_HYSTERESIS_GD = 0.1;
/** Reference brood temperature of diag-brood-growth, °C (r(28) = 1.636). */
export const DIAG_BROOD_REF_C = 28;
/** Reference trip time of diag-food-intake distance factor, game s. */
export const DIAG_TRIP_REF_S = 150;
export const BROOD_STALLED_GD = 0.2;
/** Colony-size factor of trail strength (GDD 02 §8.3, D8): clamp(MIN + (1 - MIN) x (N - N0) / SPAN, MIN, 1). */
export const SIZE_FACTOR_MIN = 0.3;
export const SIZE_FACTOR_N0 = 10;
export const SIZE_FACTOR_SPAN = 65;
/** Share of foraging bouts run as a trail ignorer (GDD 02 §8.4 TRAIL_IGNORE_P); diag-foraging-trails baseline. */
export const TRAIL_IGNORE_P = 0.2;
/** diag-foraging-trails `trail-lost`: factor = 1 / (1 + lost events per gd / this). Tuning value (not in GDD 02). */
export const DIAG_TRAIL_LOST_REF_PER_GD = 4;
/** diag-stores `capacity` factor while the pool is at capacity. Tuning value. */
export const DIAG_STORES_FULL_F = 0.5;
/** diag-mortality reference: natural turnover N / this lifespan, gd (GDD 02 §15 realised lifespan 26 gd). */
export const DIAG_MORTALITY_REF_LIFESPAN_GD = 26;
/** diag-hygiene: waste items per chamber at which the value reaches 0 (GDD 02 §11 brood score uses waste / 10). */
export const DIAG_WASTE_PER_CHAMBER = 10;
/** Stagger offset of the colony diagnostics system (never on the same tick as another >= 50-tick system). */
export const COLONY_DIAGNOSTICS_OFFSET = 125;
