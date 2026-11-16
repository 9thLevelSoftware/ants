// Presentation constants of the snapshot bridge (GDD 08 section 0: they never affect simulation results).

/** Trend window: stores 3 game hours ago (GDD 08 3.4 `TREND_WINDOW_GAME_H`). */
export const TREND_WINDOW_GAME_H = 3;
/** Sparkline: hourly samples of the last 3 game days (GDD 08 2.7 Sparkline). */
export const SPARK_SAMPLES = 72;
/** Body heat load from which the possessed panel shows the thermometer glyph. */
export const HEAT_STRESS_LOAD = 0.25;
/** Roster: the list is rebuilt at most this often (GDD 08 4.5: 2 times per real second), real ms. */
export const ROSTER_MIN_INTERVAL_MS = 500;
/** Roster: rows above this count are never materialised, whatever the request asks for. */
export const ROSTER_MAX_WINDOW = 80;

/** Founding pulse (before the hand-over): the queen's reserve fraction below which the status turns amber / red. */
export const FOUNDING_RESERVE_WARN = 0.25;
export const FOUNDING_RESERVE_BAD = 0.1;
/** Diagnostics that are "bad" by design through the claustral founding (no stores, intake or trails yet). */
export const OPENING_QUIET_DIAGNOSTICS: readonly string[] = ['diag-stores', 'diag-foraging-trails', 'diag-food-intake-c', 'diag-food-intake-p'];
/** Alerts the feed holds back until the hand-over (the lone founding queen; her empty stores by design). */
export const OPENING_QUIET_ALERTS: readonly string[] = ['last-ants', 'food-c-low', 'food-p-low'];
