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
