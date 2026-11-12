// Ant defaults used when an ant is created (GDD 01 §4, GDD 02 §1, GDD 04 §3). Lengths in BU.

/** Level-set offset of the walker above the surface, BU (GDD 04: <= 0.15 BU so 0.6 BU gaps are enterable). */
export const FOOT_OFFSET_BU = 0.1;
/** Collision radius as a fraction of body length. */
export const WALKER_RADIUS_PER_LENGTH = 0.25;
/** Base response threshold for every task (GDD 02 THETA_BASE). */
export const THETA_BASE = 0.4;
/** Threshold used for tasks a caste never does (GDD 02: 1e9). */
export const THETA_NEVER = 1e9;
/** Body temperature assigned at spawn before the thermal model runs, °C. */
export const SPAWN_TB_C = 21;
/** Default lifespan when a caste has none, game days. */
export const DEFAULT_LIFESPAN_GD = 30;
/** Arrival radius of a fresh nav state, BU. */
export const DEFAULT_ARRIVE_BU = 0.5;
/** Lifespan draw clamp as fractions of the mean (GDD 02: 33 GD clamped to [10, 85]). */
export const LIFESPAN_MIN_FRAC = 0.3;
export const LIFESPAN_MAX_FRAC = 2.6;
