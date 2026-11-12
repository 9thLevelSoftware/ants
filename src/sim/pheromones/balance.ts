// Pheromone constants (GDD 02 §8.2, 00-index C7; rain wash GDD 06 §3.7). Lengths in BU, times in game seconds,
// concentrations in pheromone units (ph). Cell size and decay cadence live in src/sim/balance (world.ts, cadence.ts).
// TODO(integration): move to src/sim/balance/pheromone.ts and re-export there (the phero task owns only this folder).

import type { PheroChannel, RainClass } from '@/sim/types';

/** Base half-life per channel at the reference temperature, s. */
export const PHERO_HALF_LIFE_S: Readonly<Record<PheroChannel, number>> = { trail: 900, home: 1200, alarm: 15 };
/** Saturation per cell, ph (deposits clamp). */
export const PHERO_MAX: Readonly<Record<PheroChannel, number>> = { trail: 30, home: 20, alarm: 10 };
/** Cells below this are cleared at the next decay step; empty chunks are freed. */
export const PHERO_EPS = 0.005;

/** Temperature factor on half-life: x 2^((REF - T) / STEP), clamped. */
export const PHERO_REF_TEMP_C = 22;
export const PHERO_TEMP_STEP_C = 10;
export const PHERO_TEMP_HL_MIN = 0.25;
export const PHERO_TEMP_HL_MAX = 3;
/** Trail exposure factors on half-life: sunlit porous soil, sheltered (under cover, cracks). */
export const PHERO_TRAIL_HL_SUNLIT_POROUS = 0.5;
export const PHERO_TRAIL_HL_SHELTERED = 1.5;
/** Trail decay-rate multiplier on cells with Tmicro >= PHERO_HEAT_TMICRO_C (GDD 06 §3.5). */
export const PHERO_TRAIL_HEAT_RATE = 1.5;
export const PHERO_HEAT_TMICRO_C = 35;

/** Fraction of a cell's value shared per second with its free face neighbours (alarm only). */
export const PHERO_DIFFUSE_PER_S: Readonly<Record<PheroChannel, number>> = { trail: 0, home: 0, alarm: 0.12 };
/** GDD 02 §8.1: `trail` and `home` are per colony, `alarm` is one shared layer. */
export const PHERO_SHARED_CHANNELS: Readonly<Record<PheroChannel, boolean>> = { trail: false, home: false, alarm: true };
/** Colony id of the shared layers. */
export const PHERO_SHARED_COLONY = -1;

/**
 * Hard caps per layer (one colony's channel, or the shared alarm layer). Per colony: 100,000 cells and 576 chunks
 * (16 KB of values + 4 KB of runtime flags each, about 11.5 MB at the very worst).
 */
export const PHERO_MAX_CELLS: Readonly<Record<PheroChannel, number>> = { trail: 40000, home: 60000, alarm: 16000 };
export const PHERO_MAX_CHUNKS: Readonly<Record<PheroChannel, number>> = { trail: 192, home: 384, alarm: 96 };
/**
 * Share of cells (chunks) removed, weakest first, when a cap is hit. A deposit is never refused: the newcomer takes
 * a freed slot and survives the next eviction if it is reinforced by then. Evicting a fixed share bounds how often
 * an eviction runs (at most once per 1/16 of the cell cap new cells, 1/8 of the chunk cap new chunks).
 */
export const PHERO_EVICT_FRACTION = 1 / 16;
export const PHERO_EVICT_CHUNK_FRACTION = 1 / 8;
/** Resolution of the eviction histogram (log2 bins per octave of value). */
export const PHERO_EVICT_BINS_PER_OCTAVE = 8;
/**
 * Decay-modifier resolution, cells: the environment's rate multiplier (temperature, exposure, heat) is evaluated
 * once per patch of this many cells in x and z (one cell in y) per decay pass, at the patch's x/z centre.
 * 4 cells = 16 BU (64 mm for Lasius); surface temperature, shade and material vary over tens of BU.
 */
export const PHERO_DECAY_PATCH_CELLS = 4;
/** Freed chunk arrays kept for reuse. */
export const PHERO_CHUNK_POOL_MAX = 32;

/**
 * Steering sensors of senseDirection: reach ahead of the body centre, BU, and side-sensor angle, rad. GDD 02 §7
 * gives the antenna as 0.9 BU at +-35 deg; on 4 BU cells that cannot resolve a heading (all sensors sit on one
 * cell's linear ramp, and walkers drift off curves), so the fan keeps the angle and looks 3 BU ahead.
 */
export const PHERO_STEER_REACH_BU = 3;
export const PHERO_SENSOR_ANGLE_RAD = (35 * Math.PI) / 180;
/** Damping of the left/right steering ratio, ph (GDD 02 §8.4: (L - R) / (L + R + 1.0)). */
export const PHERO_SENSE_DAMP = 1.0;
/** Sensor readings at or below this are "nothing" (heading = forward), ph. */
export const PHERO_SENSE_FLOOR = 1e-6;

// ---- Thresholds and deposit amounts used by behaviours (GDD 02 §8.2); listed here so callers share one source.
export const TRAIL_DETECT = 0.3;
export const HOME_DETECT = 0.1;
export const HOME_EXPLORED = 2.0;
export const ALARM_ALERT = 0.5;
export const ALARM_STRONG = 3.0;
/** Trail dab, ph, every TRAIL_DAB_SPACING_BU while laying. */
export const TRAIL_DAB = 0.25;
export const TRAIL_DAB_SPACING_BU = 1.5;
/** Passive home marking, ph per BU walked outside. */
export const HOME_DEPOSIT_PER_BU = 0.04;
/** Alarm release burst, ph; while fighting, ph per s. */
export const ALARM_RELEASE = 4;
export const ALARM_FIGHT_RATE = 1.5;

// ---- Rain and wind (GDD 06 §3.7; owner of the numbers: GDD 06, 00-index C7). Applied through washExposed.
/** Extra removal rate of exposed `trail`, 1/s. Storm uses the `storm` entry. */
export const PHERO_WASH_K: Readonly<Record<RainClass | 'storm', number>> = {
  drizzle: 0.002, shower: 0.01, downpour: 0.04, storm: 0.12,
};
/** precipNorm per class: exposed `home` decays x (1 + PHERO_HOME_RAIN_K * precipNorm) during rain. */
export const PHERO_PRECIP_NORM: Readonly<Record<RainClass | 'storm', number>> = {
  drizzle: 0.05, shower: 0.3, downpour: 0.8, storm: 1.0,
};
export const PHERO_HOME_RAIN_K = 2;
/** Exposed `trail` and `alarm` decay x (1 + windGround / PHERO_WIND_DIV), windGround in m/s. */
export const PHERO_WIND_DIV = 3;
