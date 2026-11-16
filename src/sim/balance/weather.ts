// What weather does (task weather-effects): soil moisture and puddles (GDD 06 §3.9-3.10), rain hits and wind on
// exposed ants (§3.3-3.4), washing cadence (§3.7), heat exposure diagnostic (App. D), nest flooding (GDD 03 §11),
// mound rain erosion (§1.4) and collapse of unstable ceilings (§12). Every number here is named in those sections;
// values marked [WX] are this module's decisions (documented in the task report).
// Imported directly ('@/sim/balance/weather'); names carry a WX_ prefix where the barrel could collide.

import type { ItemKind, MaterialId, RainClass } from '@/sim/types';

// ---- soil moisture (GDD 06 §3.9) ----

/** Soil texture classes of the moisture model. */
export type SoilTex = 'sand' | 'loam' | 'clay' | 'humus';
/** Water capacity of the top and sub layers, mm. */
export const WX_W0_MM = 12;
export const WX_W1_MM = 90;
/** Infiltration capacity, mm/h, by texture; lawn and sand-jointed paving override. */
export const WX_ICAP_MMH: Record<SoilTex, number> = { sand: 60, humus: 40, loam: 20, clay: 5 };
export const WX_ICAP_LAWN_MMH = 15;
export const WX_ICAP_JOINTS_MMH = 3;
/** Permeability at or below which a cell counts as jointed paving (joints Icap), and above which as open soil. */
export const WX_JOINTS_PERM_MAX = 0.1;
/** Top-layer evaporation coefficient, mm/h; exponent of theta0. */
export const WX_EVAP_K = 0.35;
export const WX_EVAP_EXP = 0.7;
/** Evaporation reduction by shade and litter: x (1 - k shade), x (1 - k litter). */
export const WX_EVAP_SHADE_K = 0.6;
export const WX_EVAP_LITTER_K = 0.5;
/** evapIdx = insolation (1 - RH) (1 + windGround / WIND_DIV) + BASE. */
export const WX_EVAP_WIND_DIV = 5;
export const WX_EVAP_BASE = 0.05;
/** Drainage top -> sub and sub -> deep, per hour, and field capacity, by texture. */
export const WX_K0: Record<SoilTex, number> = { sand: 0.6, loam: 0.12, clay: 0.04, humus: 0.12 };
export const WX_K1: Record<SoilTex, number> = { sand: 0.2, loam: 0.03, clay: 0.01, humus: 0.03 };
export const WX_THETA_FC: Record<SoilTex, number> = { sand: 0.25, loam: 0.55, clay: 0.7, humus: 0.6 };
/** Capillary rise, mm/h per unit of (theta1 - theta0). */
export const WX_RISE_K = 0.02;
/** Transpiration from layer 1 on vegetated cells (spring..autumn): K x insolation x theta1, mm/h. */
export const WX_ET_K = 0.03;
/** Dew adds K x dewLevel mm per hour to layer 0 of exposed natural cells [WX: the chapter gives "mm", read per hour]. */
export const WX_DEW_MM_PER_H = 0.1;
/** Soil at 20 mm below this temperature, C, is frozen: no infiltration, no evaporation. */
export const WX_FROZEN_DEPTH_MM = 20;
export const WX_FROZEN_BELOW_C = -1;
/** Moisture classes for read-outs (upper bounds): dry, slightly damp, damp, wet; above: waterlogged. */
export const WX_MOISTURE_CLASS_BOUNDS = [0.15, 0.35, 0.65, 0.9] as const;

// ---- puddles and surface wetness (GDD 06 §3.10) ----

/** Share of runoff stored in a puddle cell; puddle drainage, mm/h. */
export const WX_PUDDLE_FILL = 0.5;
export const WX_PUDDLE_DRAIN_MMH = 0.4;
/** Puddle store unit (Uint8): mm per step; the store saturates at 255 units (12.75 mm) [WX: capacity cap]. */
export const WX_PUDDLE_UNIT_MM = 0.05;
/** Puddle depth thresholds, BU: nav cost x5 (AI avoids) and impassable (locomotion hook). */
export const WX_PUDDLE_AVOID_BU = 0.5;
export const WX_PUDDLE_AVOID_COST = 5;
export const WX_PUDDLE_BLOCK_BU = 1.0;
/** Carried items that float an ant over a puddle (GDD 06 §3.10 "float-able leaf/twig": no puddle drowning). */
export const WX_FLOAT_ITEM_KINDS: readonly ItemKind[] = ['leaf-fragment'];
/** Static water bodies of these kinds collect rain on their footprint (rim catchment x) [WX]. */
export const WX_BODY_RAIN_KINDS = ['puddle', 'gully-water', 'bowl-water'] as const;
export const WX_BODY_CATCH_MULT = 1.5;
/** Static water bodies lose water at puddle drainage x this (bowls do not drain, only evaporate) [WX]. */
export const WX_BODY_DRAIN_MULT: Record<string, number> = { puddle: 1, 'gully-water': 1, 'bowl-water': 0 };
/** surfaceWet 0..1: rises toward rainRate / FULL_MMH with time constant RISE_H; dries with evapIdx x DRY_K per hour. */
export const WX_WET_FULL_MMH = 4;
export const WX_WET_RISE_H = 0.25;
export const WX_WET_DRY_K = 1.2;

// ---- rain hits and wind on exposed ants (GDD 06 §3.3-3.4) ----

/** Hit rate per exposed ant per game second, by class and storm. */
export const WX_RAIN_HIT_RATE: Record<RainClass | 'storm', number> = { drizzle: 0, shower: 0.02, downpour: 0.15, storm: 0.25 };
/** Hits are sampled per ant every this many ticks. */
export const WX_RAIN_HIT_EVERY = 5;
/** Stun seconds after a hit; health loss (share of max hp) for downpour / storm hits. */
export const WX_RAIN_STUN_S: Record<RainClass | 'storm', number> = { drizzle: 0, shower: 1.5, downpour: 3, storm: 3 };
export const WX_RAIN_HIT_HP: Record<RainClass | 'storm', number> = { drizzle: 0, shower: 0, downpour: 0.05, storm: 0.05 };
/** A surface counts as vertical (a shower drop knocks the ant off) when up.y is below this. */
export const WX_VERTICAL_UP_Y = 0.5;
/** Ants on stems or blade tips this high above the ground (BU) can be blown off; threshold wind and rate. */
export const WX_STEM_HEIGHT_BU = 8;
export const WX_STEM_TOPPLE_WIND_GROUND = 1.2;
export const WX_STEM_TOPPLE_RATE = 0.02;
/** Push off the surface when knocked or blown off, mm/s (along up). */
export const WX_KNOCK_PUSH_MM_S = 20;
/** Shared stun key on ant.bb (combat / creatures use the same key). */
export const WX_STUN_KEY = 'cr.stunUntil';

// ---- exposure to the sky (GDD 06 §3.3 "exposed") ----

/** Overhead cover within this many BU above the point counts. */
export const WX_COVER_BU = 3;
/** Grass canopy taller than this (BU) counts as cover. */
export const WX_GRASS_COVER_BU = 8;
/** Static shelter map byte at or above which the ground is under cover (roofs, tables, canopies). */
export const WX_SHELTER_COVERED = 128;
/** Exposure cache quantum, BU: horizontal cell and vertical layer (a cell shares one answer). */
export const WX_EXPOSURE_CELL_BU = 2;
export const WX_EXPOSURE_LAYER_BU = 0.5;

// ---- washing (GDD 06 §3.7) ----

/** Rain washing and wind decay on exposed pheromone cells every this many ticks. */
export const WX_WASH_EVERY = 10;

// ---- heat exposure (GDD 06 App. D, §4.5) ----

/** diag-heat-exposure: warn when more than this share of surface ants has Tb >= stressC - MARGIN. */
export const WX_HEAT_WARN_SHARE = 0.1;
export const WX_HEAT_MARGIN_C = 3;
/** bad when at least this share of surface ants is in heat stupor (GDD 06 §4.5 `heat-stupor-mass`). */
export const WX_HEAT_STUPOR_SHARE = 0.1;
/** Fewer surface ants than this: no judgement (ok). */
export const WX_HEAT_MIN_ANTS = 3;
/** Cadence of the effects diagnostics, ticks (GDD 06 App. D: every 250). */
export const WX_DIAG_EVERY = 250;

// ---- flooding (GDD 03 §11) ----

/** Flood step, ticks (FLOOD_STEP_S 1 game s). */
export const FLOOD_STEP_TICKS = 10;
/** Inflow per open entrance at intensity 1, BU^3/s. */
export const FLOOD_Q_BASE = 1.2;
/** Catchment c = clamp(1 + (h_ring - h_ent) / DIV BU, MIN, MAX) on a ring of RING BU. */
export const FLOOD_CATCH_RING_BU = 8;
export const FLOOD_CATCH_DIV_BU = 2;
export const FLOOD_CATCH_MIN = 0.25;
export const FLOOD_CATCH_MAX = 4;
/**
 * World hydrology on top of the local ring (GDD 06 §5.7 floodSafety = 1 - floodRisk; worldgen floodFactorOf): the
 * catchment is multiplied by 1 + GAIN x floodRisk, so a flood-safe site (risk 0) keeps GDD 03's flat-ground c = 1
 * and a hollow with a large catchment gets up to (1 + GAIN) x; the product is clamped like c [WX].
 */
export const FLOOD_HYDRO_GAIN = 3;
/** Crusted ring (>= HALF crusted) sheds rain: catchment x CRUST_RUNOFF. */
export const FLOOD_CRUST_RUNOFF = 1.5;
export const FLOOD_CRUST_HALF = 0.5;
/** A solid within this many BU above the opening shields it: x COVER_FACTOR. */
export const FLOOD_COVER_BU = 20;
export const FLOOD_COVER_FACTOR = 0.15;
/** Rim factor = max(RIM_MIN, 1 - rim / RIM_FULL BU). */
export const FLOOD_RIM_FULL_BU = 3;
export const FLOOD_RIM_MIN = 0.1;
/** Inflow factor by entrance status. */
export const FLOOD_STATE_FACTOR: Record<'open' | 'sealing' | 'sealed' | 'reopening', number> = {
  open: 1, sealing: 0.5, sealed: 0.1, reopening: 0.1,
};
/** Drainage through flooded walls, BU/s per BU^2 (GDD 03 table 2.1 K_DRAIN); LOOSE walls x LOOSE_MULT. */
export const FLOOD_K_DRAIN: Partial<Record<MaterialId, number>> = {
  loam: 0.004, humus: 0.008, sand: 0.02, clay: 0.0008, gravel: 0.03, 'wood-decayed': 0.002, 'wood-sound': 0.0005,
  insulation: 0,
};
export const FLOOD_K_DRAIN_LOOSE_MULT = 1.5;
/** Wet area per flooded wall voxel, BU^2; drainage x (1 - MOIST_K m). */
export const FLOOD_WALL_FACE_BU2 = 0.25;
export const FLOOD_DRAIN_MOIST_K = 0.7;
/** Seepage from saturated subsoil (theta1 >= SAT) into chambers, BU^3/s per BU^2 of floor (GDD 06 §3.10). */
export const FLOOD_SEEP_THETA1 = 0.92;
export const FLOOD_SEEP_RATE = 0.002;
/** Spill-height cache rebuild at most every this many ticks per nest (H* rebuild <= every 5 s). */
export const FLOOD_REBUILD_TICKS = 50;
/** Water below this volume counts as dry, BU^3. */
export const FLOOD_DRY_BU3 = 0.01;
/** `flood-level` events at most every this many ticks per nest. */
export const FLOOD_LEVEL_EVENT_TICKS = 50;
/** Submersion: health untouched for GRACE s, then -RATE x max hp per s (GDD 03 §11.3). */
export const FLOOD_SUBMERGE_GRACE_S = 50;
export const FLOOD_SUBMERGE_HP_PER_S = 0.01;
/** Brood dies after this many seconds of continuous submersion. */
export const FLOOD_BROOD_DROWN_S = 75;
/** ant.bb key: continuous submerged seconds. */
export const FLOOD_ANT_SUB_KEY = 'wx.sub';
/** A brood or royal chamber at least this flooded raises `nest-flooding` (GDD 03 §11.3). */
export const FLOOD_ALERT_FRACTION = 0.25;
/** Reference storm (GDD 03 §11.4): intensity and duration, s. Re-predicted every PREDICT_TICKS. */
export const FLOOD_REF_INTENSITY = 1;
export const FLOOD_REF_S = 75;
export const FLOOD_PREDICT_TICKS = 250;
/** Open voxels per nest the spill cache will index (beyond: the rest are ignored, reported) [WX]. */
export const FLOOD_MAX_VOXELS = 400000;

// ---- mound rain erosion (GDD 03 §1.4) ----

/** Each game hour with rain intensity above MIN_I, one relaxation pass at repose - DEG x I. */
export const EROSION_MIN_I = 0.2;
export const EROSION_DEG_PER_I = 8;
export const EROSION_EVERY_TICKS = 250;

// ---- collapse (GDD 03 §12) ----

/** Unstable when 2 d_sup > S_max + TOLERANCE BU; fewer than MIN_VOXELS voxels are ignored. */
export const COLLAPSE_TOLERANCE_BU = 0.5;
export const COLLAPSE_MIN_VOXELS = 4;
/** Warning time, game s (Harsh halves it; Gentle never collapses). */
export const COLLAPSE_WARN_S = 60;
export const COLLAPSE_WARN_HARSH_S = 30;
/** Most volume one collapse refills, BU^3; roof at most this thick also opens a hole (accidental entrance). */
export const COLLAPSE_MAX_VOLUME_BU3 = 64;
export const COLLAPSE_ROOF_BREACH_BU = 1.5;
export const COLLAPSE_BREACH_RADIUS_BU = 1;
/** Ants caught in the debris: stunned and lose a share of max hp. */
export const COLLAPSE_STUN_S = 3;
export const COLLAPSE_HP_LOSS = 0.1;
/** Hourly stability check of nests with sand or humus ceilings; moisture change that triggers a re-check. */
export const COLLAPSE_CHECK_TICKS = 250;
export const COLLAPSE_MOISTURE_DELTA = 0.1;
/** Materials whose ceilings are checked every hour. */
export const COLLAPSE_HOURLY_MATERIALS: readonly MaterialId[] = ['sand', 'humus'];
/** Collapse check cadence for other nests (on plan completion and moisture change only) [WX: every 4 game hours]. */
export const COLLAPSE_SLOW_CHECK_TICKS = 1000;
/** Debris brush radius, in voxels (fillSphere per refilled sample). */
export const COLLAPSE_FILL_R_VOXELS = 0.75;
