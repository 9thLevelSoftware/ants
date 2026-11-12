// Environment defaults for the T1 degraded mode (GDD 06 §0: constant conditions until env-core lands).

export const DEGRADED_AIR_C = 21;
export const DEGRADED_SOIL_C = 19;
export const DEGRADED_RH = 0.7;
/** Surface activity when no environment model is running (0..1). */
export const DEGRADED_SURFACE_ACTIVITY = 1;
/** Default day-of-season and hour if neither config nor species gives one. */
export const DEFAULT_START_HOUR = 14;
/** Placeholder day length until env-core: 12 h + amplitude * sin(2 pi * year fraction) (GDD 06 §1.4). */
export const DAY_LENGTH_MEAN_H = 12;
export const DAY_LENGTH_AMP_H = 4;
/** Placeholder day phases: dawn/dusk last this many hours either side of sunrise/sunset. */
export const TWILIGHT_HALF_H = 1;
/** Placeholder day phases: `midday` spans this many hours either side of solar noon. */
export const MIDDAY_HALF_H = 2;
/** Length of the weather history's hourly rain ring (`rainHoursRing`), hours. */
export const RAIN_HISTORY_HOURS = 36;
/** First weekend weekday (weekdays 0..6; 5 and 6 are the weekend, directions §K). */
export const WEEKEND_FROM = 5;
/** Highest speed allowed while an ant is possessed (seed §1: 8x only when not possessing). */
export const POSSESS_MAX_SPEED = 4;
