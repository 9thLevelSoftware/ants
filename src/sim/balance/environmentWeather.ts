// Weather constants (GDD 06 §3): state table, transition weights, dwell times, precipitation, wind, dew, lightning.
// Re-exported by environment.ts, so '@/sim/balance' exposes everything.

import type { RainClass, Season, WeatherSeverity, WeatherState } from '@/sim/types';

/** Per-state sky and effect values (GDD 06 §3.1, §3.4). */
export interface WeatherStateDef {
  /** Cloud cover 0..1. */
  cloud: number;
  /** Multiplier on direct sun (insolation). */
  sunMult: number;
  /** Multiplier on daylight brightness. */
  cloudAtten: number;
  /** Relative humidity delta. */
  rhDelta: number;
  /** Wind at 2 m, m/s. */
  stateWind: number;
}
export const WEATHER_DEFS: Record<WeatherState, WeatherStateDef> = {
  clear: { cloud: 0.1, sunMult: 1.0, cloudAtten: 1.0, rhDelta: 0, stateWind: 2.0 },
  overcast: { cloud: 0.9, sunMult: 0.35, cloudAtten: 0.55, rhDelta: 0.2, stateWind: 3.0 },
  rain: { cloud: 1.0, sunMult: 0.2, cloudAtten: 0.4, rhDelta: 0.35, stateWind: 3.5 },
  storm: { cloud: 1.0, sunMult: 0.12, cloudAtten: 0.3, rhDelta: 0.3, stateWind: 8.5 },
  heat: { cloud: 0.05, sunMult: 1.05, cloudAtten: 1.0, rhDelta: -0.25, stateWind: 1.5 },
  frost: { cloud: 0.1, sunMult: 1.0, cloudAtten: 1.0, rhDelta: 0.1, stateWind: 1.2 },
};
/** Time constant with which cloud cover follows the state's target, game hours. */
export const CLOUD_TAU_H = 1;

// ---- State machine (GDD 06 §3.2) ----

export type TransitionWeights = Partial<Record<WeatherState, number>>;
export type TransitionTable = Partial<Record<WeatherState, TransitionWeights>>;
/** Transition weights per season and current state (rows are omitted where a state cannot be current). */
export const TRANSITIONS: Record<Season, TransitionTable> = {
  spring: {
    clear: { overcast: 0.55, rain: 0.28, storm: 0.02, heat: 0, frost: 0.15 },
    overcast: { clear: 0.40, rain: 0.54, storm: 0.02, heat: 0, frost: 0.04 },
    rain: { clear: 0.30, overcast: 0.64, storm: 0.06, heat: 0, frost: 0 },
    storm: { clear: 0.30, overcast: 0.40, rain: 0.30, heat: 0, frost: 0 },
    heat: { clear: 0.50, overcast: 0.30, rain: 0.10, storm: 0.10, frost: 0 },
    frost: { clear: 0.50, overcast: 0.50, rain: 0, storm: 0, heat: 0 },
  },
  summer: {
    clear: { overcast: 0.50, rain: 0.20, storm: 0.03, heat: 0.27, frost: 0 },
    overcast: { clear: 0.50, rain: 0.40, storm: 0.10, heat: 0, frost: 0 },
    rain: { clear: 0.40, overcast: 0.50, storm: 0.10, heat: 0, frost: 0 },
    storm: { clear: 0.40, overcast: 0.35, rain: 0.25, heat: 0, frost: 0 },
    heat: { clear: 0.30, overcast: 0.25, rain: 0.05, storm: 0.40, frost: 0 },
  },
  autumn: {
    clear: { overcast: 0.55, rain: 0.27, storm: 0.01, heat: 0, frost: 0.17 },
    overcast: { clear: 0.30, rain: 0.62, storm: 0.02, heat: 0, frost: 0.06 },
    rain: { clear: 0.22, overcast: 0.74, storm: 0.04, heat: 0, frost: 0 },
    storm: { clear: 0.30, overcast: 0.40, rain: 0.30, heat: 0, frost: 0 },
    frost: { clear: 0.45, overcast: 0.55, rain: 0, storm: 0, heat: 0 },
  },
  winter: {
    clear: { overcast: 0.40, rain: 0.16, storm: 0.01, heat: 0, frost: 0.43 },
    overcast: { clear: 0.32, rain: 0.42, storm: 0.01, heat: 0, frost: 0.25 },
    rain: { clear: 0.15, overcast: 0.78, storm: 0.02, heat: 0, frost: 0.05 },
    storm: { clear: 0.20, overcast: 0.50, rain: 0.30, heat: 0, frost: 0 },
    frost: { clear: 0.35, overcast: 0.65, rain: 0, storm: 0, heat: 0 },
  },
};
/** Spring and autumn `clear -> heat` is this share of the summer weight (E-136), behind the seasonal-mean guard. */
export const SHOULDER_HEAT_SHARE = 0.3;
/** Season whose row a state uses when its own season has no row for it (heat in autumn/winter, frost in summer). */
export const FALLBACK_ROW_SEASON: Season = 'spring';
/** A redraw is tried this many times before the state falls back to `overcast` (here: all weights were guarded out). */
export const WEATHER_REDRAW_MAX = 50;

/** Dwell time per season and state: `min + Exp(mean - min)` hours, capped (GDD 06 §3.2). */
export const DWELL_H: Record<Season, Record<WeatherState, { min: number; mean: number }>> = {
  spring: {
    clear: { min: 4, mean: 14 }, overcast: { min: 4, mean: 11 }, rain: { min: 1.5, mean: 5 },
    storm: { min: 1.5, mean: 3 }, heat: { min: 24, mean: 40 }, frost: { min: 8, mean: 12 },
  },
  summer: {
    clear: { min: 4, mean: 16 }, overcast: { min: 4, mean: 9 }, rain: { min: 1.5, mean: 4 },
    storm: { min: 1.5, mean: 3 }, heat: { min: 24, mean: 54 }, frost: { min: 8, mean: 12 },
  },
  autumn: {
    clear: { min: 4, mean: 12 }, overcast: { min: 4, mean: 13 }, rain: { min: 1.5, mean: 6 },
    storm: { min: 1.5, mean: 3 }, heat: { min: 24, mean: 40 }, frost: { min: 8, mean: 12 },
  },
  winter: {
    clear: { min: 4, mean: 12 }, overcast: { min: 4, mean: 14 }, rain: { min: 1.5, mean: 6 },
    storm: { min: 1.5, mean: 3 }, heat: { min: 24, mean: 40 }, frost: { min: 10, mean: 28 },
  },
};
/** Dwell cap as a multiple of the mean, and the heat cap in hours. */
export const DWELL_CAP_MEAN_MULT = 3;
export const HEAT_DWELL_CAP_H = 96;
/** A heat wave ends this many hours after the season changes (hard stop). */
export const HEAT_SEASON_STOP_H = 12;
/** Frost may not end before this many hours after sunrise; it may start between sunset and this many hours before sunrise. */
export const FROST_END_AFTER_SUNRISE_H = 3;
export const FROST_START_BEFORE_SUNRISE_H = 2;
/** Cold snap (winter): chance that a frost persists another 24 h at its end check, and the extension cap. */
export const P_COLDSNAP_PERSIST = 0.55;
export const COLDSNAP_MAX_EXT = 4;
export const COLDSNAP_EXT_H = 24;

/** Dry spell (summer): probability per summer (difficulty scales it), length in default-year days, weight changes. */
export const DRYSPELL_DAYS = 3;
export const DRYSPELL_RAIN_MULT = 0.15;
export const DRYSPELL_HEAT_MULT = 1.5;
/** Weather the game starts in before the first draw: weights of `clear` and `overcast`. */
export const INITIAL_WEATHER_WEIGHTS: TransitionWeights = { clear: 0.6, overcast: 0.4 };

/** Weather severity rule (GDD 06 §14.1): multiplier on the frequency parameters; `none` allows only clear/overcast. */
export const SEVERITY_MULT: Record<WeatherSeverity, number> = { none: 0, mild: 0.6, normal: 1.0, severe: 1.4 };

// ---- Precipitation (GDD 06 §3.3) ----

/** Class drawn at rain onset [E]: drizzle / shower / downpour weights. */
export const RAIN_CLASS_WEIGHTS: Record<RainClass, number> = { drizzle: 0.4, shower: 0.4, downpour: 0.2 };
/** Dwell multiplier by class. */
export const RAIN_CLASS_DWELL_MULT: Record<RainClass, number> = { drizzle: 1.5, shower: 1.0, downpour: 0.6 };
/** Peak rain rate, mm/h, by class and for storms. */
export const RAIN_RATE_MMH: Record<RainClass, number> = { drizzle: 1, shower: 5, downpour: 18 };
export const STORM_RAIN_MMH = 30;
/** Normalised precipitation (`peakPrecip`) by class and for storms (GDD 06 §3.7 precipNorm). */
export const PRECIP_NORM: Record<RainClass, number> = { drizzle: 0.05, shower: 0.3, downpour: 0.8 };
export const STORM_PRECIP_NORM = 1.0;
/** Entrance inflow factor `I` by class and storm (GDD 06 §2.9 `rainIntensityAt`). */
export const RAIN_INFLOW: Record<RainClass, number> = { drizzle: 0.1, shower: 0.4, downpour: 0.7 };
export const STORM_RAIN_INFLOW = 1.0;
/** Surface activity weight `fW` of rain by class, and of a storm. */
export const RAIN_ACTIVITY: Record<RainClass, number> = { drizzle: 0.4, shower: 0.1, downpour: 0 };
/** Precipitation bell: the peak sits at this share of the dwell. */
export const PRECIP_PEAK_FRACTION = 0.35;
/** Below this rate (mm/h) it does not count as raining. */
export const RAIN_MIN_RATE_MMH = 0.05;
/** Leak of the 24 h rain accumulator (time constant, hours): approximates the sliding "prior 1 GD" sum. */
export const RAIN_CUM_TAU_H = 24;

// ---- Wind (GDD 06 §3.4) ----

/** Diurnal wind multiplier: night (21..05), afternoon (12..17), otherwise 1; linear blends of this width in hours. */
export const WIND_NIGHT_MULT = 0.65;
export const WIND_DAY_MULT = 1.3;
export const WIND_BLEND_H = 2;
export const WIND_NIGHT_FROM_H = 21;
export const WIND_NIGHT_TO_H = 5;
export const WIND_DAY_FROM_H = 12;
export const WIND_DAY_TO_H = 17;
/** Ornstein-Uhlenbeck noise: stationary sd (m/s) and correlation time (h). */
export const WIND_OU_SD = 0.8;
export const WIND_OU_TAU_H = 1;
export const WIND_MIN_MS = 0.2;
/** Gusts: Poisson rate per game hour, strength multiplier, duration (ticks). */
export const GUST_RATE_PER_H = 0.012;
export const GUST_RATE_STORM_PER_H = 0.5;
export const GUST_MULT = 2.2;
export const GUST_TICKS = 300;
/** Wind direction random walk (deg per sqrt(game hour)) and the turn at storm onset (deg). */
export const WIND_DIR_WALK_DEG = 15;
export const WIND_STORM_TURN_DEG = 90;
/** Ground-level wind = factor * wind at 2 m. */
export const WIND_GROUND_FACTOR = 0.2;

// ---- Dew, mist, lightning (GDD 06 §3.8, §3.11) ----

export const P_DEW_CLEAR = 0.6;
export const P_DEW_OVERCAST = 0.25;
export const DEW_CLEAR_WIND_MAX = 2.5;
export const DEW_BLOCK_WIND = 3.5;
/** Dew rises from sunset + this many hours until sunrise and is gone this many hours after sunrise. */
export const DEW_START_AFTER_SUNSET_H = 1;
export const DEW_GONE_AFTER_SUNRISE_CLEAR_H = 5;
export const DEW_GONE_AFTER_SUNRISE_OVERCAST_H = 8;
/** Mist after a dew night with light wind: density and the hour after sunrise until which it lasts. */
export const MIST_WIND_MAX = 1.5;
export const MIST_DENSITY = 0.3;
export const MIST_UNTIL_AFTER_SUNRISE_H = 2;
/** Lightning in storms: minimum gap (ticks), extra mean gap (ticks), thunder delay range (s). */
export const LIGHTNING_MIN_GAP_TICKS = 60;
export const LIGHTNING_MEAN_EXTRA_TICKS = 150;
export const THUNDER_DELAY_MIN_S = 0.4;
export const THUNDER_DELAY_MAX_S = 3;
