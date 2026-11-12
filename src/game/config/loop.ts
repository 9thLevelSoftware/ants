// Game-loop constants (GDD 06 §4.3-4.4, GDD 01 §8). Presentation side: real time, not simulation balance.

/** Game seconds per simulation tick (seed §3: fixed tick of 0.1 s). */
export const TICK_SECONDS = 0.1;
/** Real frame dt is clamped to this before accumulating (GDD 06 §4.3). */
export const MAX_FRAME_DT_S = 0.1;
/** Tick budget per frame. */
export const MAX_TICKS_PER_FRAME = 16;
export const SIM_FRAME_BUDGET_MS = 10;
/** Owed ticks beyond this are dropped (2 game seconds): never spiral. */
export const MAX_CATCHUP_TICKS = 20;
/** Fallback tick cap when no clock is available (GDD 06 §4.4). */
export const MAX_TICKS_PER_FRAME_NO_CLOCK = 4;

/** Effective-speed EMA window (real s) and the step-down rule (GDD 06 §4.4). */
export const EFFECTIVE_SPEED_TAU_S = 3;
export const STEP_DOWN_RATIO = 0.85;
export const STEP_DOWN_AFTER_S = 3;
/** After the player raises the speed again, no step-down for this long. */
export const STEP_DOWN_GRACE_S = 10;

/** At most one `time.speed-limited` event per this many real seconds (ticks dropped meanwhile are summed). */
export const SPEED_LIMITED_EVENT_MIN_INTERVAL_S = 1;

/** UI snapshot refresh rate while playing (real Hz). */
export const UI_REFRESH_HZ = 4;
/** Simulated seconds of camera settling before a debug-API renderFrame() in test mode. */
export const TEST_CAMERA_SETTLE_S = 2;
/** Step used for that settling, real s. */
export const TEST_CAMERA_SETTLE_DT = 1 / 30;
