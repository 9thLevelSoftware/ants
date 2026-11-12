// Environment constants (GDD 06 §0-§3). Calendar, light, temperature, ant thermal response and the time-control
// limits live here; the weather tables are in environmentWeather.ts (re-exported below). Climate tables per climate
// id are data in src/sim/environment/climates.ts. Tunables marked [E] are the chapter's own estimates.

import type { Material, Season, WeatherState } from '@/sim/types';

export * from './environmentWeather';

// ---- T1 degraded mode (GDD 06 §0.2): constants used before the environment model has run ----

export const DEGRADED_AIR_C = 21;
export const DEGRADED_SOIL_C = 19;
export const DEGRADED_RH = 0.7;
/** Surface activity when no environment model is running (0..1). */
export const DEGRADED_SURFACE_ACTIVITY = 1;
/** Default day-of-season and hour if neither config nor species gives one. */
export const DEFAULT_START_HOUR = 14;

// ---- Calendar and day length (GDD 06 §1.1-1.3) ----

/** Day length L = mean + amplitude * sin(2 pi * year fraction): 12 h at the equinoxes, 16 h / 8 h at the solstices. */
export const DAY_LENGTH_MEAN_H = 12;
export const DAY_LENGTH_AMP_H = 4;
/** Dawn and dusk last this many hours either side of sunrise / sunset. */
export const TWILIGHT_HALF_H = 1;
/** Legacy placeholder (the stub's midday rule); the real phases use PHASE_MIDDAY_* below. */
export const MIDDAY_HALF_H = 2;
/** `midday` runs from this hour to PHASE_MIDDAY_END_H; `morning` ends at the start, `afternoon` begins at the end. */
export const PHASE_MIDDAY_START_H = 11;
export const PHASE_MIDDAY_END_H = 14;
/** Length of the weather history's hourly rain ring (`rainHoursRing`), hours. */
export const RAIN_HISTORY_HOURS = 36;
/** Human-activity week (C1 `WEEK_DAYS`): always 7 game days, independent of season length (directions §K). */
export const WEEK_DAYS = 7;
/** First weekend weekday (weekdays 0..6; 5 and 6 are the weekend, directions §K). */
export const WEEKEND_FROM = 5;
/**
 * Season length of a new game unless the custom rule changes it (C1 `DAYS_PER_SEASON` default). Also the
 * reference year in which the GDD writes day-of-year windows; `scaleDoy` converts them to the configured year.
 * Calendar code never uses this as the current season length: it reads `config.rules.seasonLengthDays`.
 */
export const DEFAULT_SEASON_LENGTH_DAYS = 7;
/** Moon period in game days (29.53 real days / 13.04 real days per game day). */
export const MOON_PERIOD_DAYS = 2.265;
/** Highest speed allowed while an ant is possessed (seed §1: 8x only when not possessing). */
export const POSSESS_MAX_SPEED = 4;
/** Highest speed in the opening phases search..lay (GDD 06 §4, E-17). */
export const OPENING_MAX_SPEED = 2;
/** Speed used while skipping to the next event (GDD 06 §4.6) and its length limit in game days. */
export const SKIP_SPEED = 8;
export const SKIP_MAX_GD = 1.0;

// ---- Light and sun (GDD 06 §1.4) ----

/** Seasonal sun height `peakSolar = MIN + (MAX - MIN) * (L - 8) / 8`: 0.25 midwinter, 1.0 midsummer. */
export const PEAK_SOLAR_MIN = 0.25;
export const PEAK_SOLAR_MAX = 1.0;
/** Day length at which `peakSolar` is at its minimum and the span to its maximum, hours. */
export const PEAK_SOLAR_L_MIN_H = 8;
export const PEAK_SOLAR_L_SPAN_H = 8;
/** Moonlight = (BASE + ILLUM * moonIllum) * (1 - CLOUD_CUT * cloud). */
export const MOONLIGHT_BASE = 0.04;
export const MOONLIGHT_ILLUM = 0.06;
export const MOONLIGHT_CLOUD_CUT = 0.6;
/** `moonless` (Atta flights): illumination below this and cloud below the second value. */
export const MOONLESS_ILLUM_MAX = 0.25;
export const MOONLESS_CLOUD_MAX = 0.5;
/** Rendering sun path [E]: noon elevation at midwinter / midsummer and the depth below the horizon at midnight, deg. */
export const SUN_NOON_ELEV_MIN_DEG = 20;
export const SUN_NOON_ELEV_MAX_DEG = 66;
export const SUN_NADIR_DEG = 45;
/** Share of direct light removed by full map shade (`maps.shade` = 1) [E]. */
export const SHADE_LIGHT_CUT = 0.6;
/** Light under ground falls as exp(-depth / this), mm [E] (about 10 BU of Lasius). */
export const BURIAL_LIGHT_E_FOLD_MM = 40;

// ---- Air temperature (GDD 06 §2.1-2.2) ----

/** Hour of the daily air temperature peak; the trough is at sunrise. */
export const AIR_PEAK_HOUR = 14.5;
/** Seasonal mean peaks at this default-year day (d = 9.5, about 22 July). */
export const SEASONAL_PEAK_DAY = 9.5;
/** Daily anomaly AR(1): a_n = AR * a_{n-1} + N(0, SD), clamped to +-CLAMP. */
export const ANOMALY_AR = 0.7;
export const ANOMALY_SD_C = 1.2;
export const ANOMALY_CLAMP_C = 5;
/** Relaxation time of the weather offset `Woff` and of the diurnal multiplier toward their targets, hours. */
export const WOFF_TAU_H = 4;
export const DM_TAU_H = 4;
/** Heat wave offset ramps in over this many hours. */
export const HEAT_RAMP_H = 8;
/** Diurnal multiplier `dm` and weather offset target (C) per state; heat uses the climate offset instead. */
export const DIURNAL_MULT: Record<WeatherState, number> = {
  clear: 1.2, overcast: 0.6, rain: 0.5, storm: 0.5, heat: 1.1, frost: 1.3,
};
export const WEATHER_OFFSET_C: Record<WeatherState, number> = {
  clear: 0, overcast: -1.0, rain: -2.5, storm: -3.5, heat: 0, frost: -5.0,
};
/** Frost offset while a cold snap persists by day. */
export const COLD_SNAP_DAY_OFFSET_C = -2.5;

// ---- Surface temperature (GDD 06 §2.3) ----

/** Share of the sun's gain that reaches a shaded surface. */
export const SHADE_SUN_RESIDUAL = 0.12;
/** `clearNight` factor: clear/frost sky below LIGHT_CLEAR_NIGHT, overcast scaled by this. */
export const CLEAR_NIGHT_LIGHT = 0.15;
export const OVERCAST_NIGHT_FACTOR = 0.4;

/** Sun gain G (C at insolation 1), clear-night loss (C) and lag time constant (game hours) of one surface. */
export interface SurfaceParams {
  gain: number;
  nightLoss: number;
  tauH: number;
}
const CONCRETE: SurfaceParams = { gain: 14, nightLoss: 2, tauH: 1.2 };
const SOIL: SurfaceParams = { gain: 18, nightLoss: 3, tauH: 0.7 };
const LITTER: SurfaceParams = { gain: 3, nightLoss: 3, tauH: 0.15 };
const SMALL_OBJECT: SurfaceParams = { gain: 10, nightLoss: 2, tauH: 0.3 };
/** Surface parameters per material (GDD 06 §2.3 table; materials the table does not name map to the closest row). */
export const SURFACE_PARAMS: Record<Material, SurfaceParams> = {
  asphalt: { gain: 22, nightLoss: 1.5, tauH: 0.8 },
  concrete: CONCRETE, plaster: CONCRETE, mortar: CONCRETE,
  tile: { gain: 12, nightLoss: 2, tauH: 1.2 },
  brick: { gain: 15, nightLoss: 2, tauH: 1.2 },
  stone: { gain: 15, nightLoss: 2, tauH: 1.5 },
  gravel: { gain: 16, nightLoss: 2, tauH: 0.9 },
  loam: SOIL, humus: SOIL, clay: SOIL,
  sand: { gain: 20, nightLoss: 3, tauH: 0.5 },
  leaf: LITTER, plant: LITTER, bark: LITTER, food: LITTER,
  'wood-sound': { gain: 10, nightLoss: 2, tauH: 0.6 }, 'wood-decayed': { gain: 10, nightLoss: 2, tauH: 0.6 },
  metal: { gain: 28, nightLoss: 4, tauH: 0.3 },
  plastic: { gain: 24, nightLoss: 3, tauH: 0.4 }, rubber: { gain: 24, nightLoss: 3, tauH: 0.4 },
  glass: SMALL_OBJECT, ceramic: SMALL_OBJECT, fabric: SMALL_OBJECT, paper: SMALL_OBJECT, insulation: SMALL_OBJECT,
  water: { gain: 2, nightLoss: 0, tauH: 3 },
};
/** Lawn / garden-bed grass is a zone, not a material (GDD 06 §2.3). */
export const LAWN_SURFACE_PARAMS: SurfaceParams = { gain: 6, nightLoss: 4, tauH: 0.25 };
/** Cover materials of a chamber under a stone or slab (GDD 03 §9.1 example). */
export const COVER_STONE_THICKNESS_MM = 50;
export const COVER_STONE_R_THERM = 0.35;

// ---- Soil temperature (GDD 06 §2.4) ----

export const SOIL_MEAN_OFFSET_C = 1.0;
/** Damping depths, mm: annual, diurnal, weather anomalies. */
export const SOIL_DA_MM = 2000;
export const SOIL_DD_MM = 100;
export const SOIL_DW_MM = 300;
/** Bare-soil diurnal amplitude = this * Ad(season) * dm(weather). */
export const SOIL_DIURNAL_FACTOR = 1.3;
/** Time constant of the weather-soak EMA `Wsoil`, game days. */
export const WSOIL_TAU_GD = 1.5;
/** Cover classes: diurnal amplitude factor and mean offset (C). */
export type CoverClass = 'bare' | 'grass' | 'litter' | 'stone' | 'asphalt';
export const COVER_PARAMS: Record<CoverClass, { amp: number; mean: number }> = {
  bare: { amp: 1.0, mean: 0 }, grass: { amp: 0.6, mean: 0 }, litter: { amp: 0.5, mean: 0 },
  stone: { amp: 0.45, mean: 1.2 }, asphalt: { amp: 0.5, mean: 2.0 },
};

// ---- Chamber, interior and micro temperature (GDD 06 §2.5, GDD 03 §9) ----

/** GDD 03 §9.1 damping depths, mm: daily wave, weather spells, seasonal wave. */
export const CHAMBER_DD_MM = 80;
export const CHAMBER_DS_MM = 250;
export const CHAMBER_DA_MM = 1500;
/** Thermal resistance per mm of depth by material (GDD 03 §2.1 r_therm); materials not listed use RTHERM_DEFAULT. */
export const R_THERM: Partial<Record<Material, number>> = {
  loam: 1.0, humus: 1.4, sand: 0.9, clay: 0.8, gravel: 0.9, 'wood-decayed': 1.6, 'wood-sound': 1.6, insulation: 4.0,
  concrete: 0.35, asphalt: 0.45, stone: 0.35, brick: 0.35, tile: 0.35, ceramic: 0.35,
};
export const RTHERM_DEFAULT = 1.0;
/** Wood cavity (carpenter nests): weight of the 150 mm soil temperature, the rest is air. */
export const WOOD_CAVITY_SOIL_W = 0.7;
export const WOOD_CAVITY_SOIL_DEPTH_MM = 150;
/** Heated interior: Tint = AIR_W * Tair + (1 - AIR_W) * SET; unheated utility = UNHEATED_AIR_W * Tair + UNHEATED_ADD. */
export const INTERIOR_AIR_W = 0.25;
export const INTERIOR_SET_C: Record<Season, number> = { spring: 20, summer: 23, autumn: 20, winter: 20 };
export const UNHEATED_AIR_W = 0.6;
export const UNHEATED_ADD_C = 8;
/** Interior relative humidity (indoor air). */
export const INTERIOR_RH = 0.45;
/** Surface-walking micro temperature: Tmicro = W * Tsurf + (1 - W) * Tair. */
export const MICRO_SURF_W = 0.6;
/** Ant on a plant stem or leaf above ground: Tair + K * (Tsurf[plant] - Tair). */
export const STEM_COUPLING = 0.2;
/** Height above the ground (in BU) from which a walker is "above ground" (stem, leaf, object). */
export const ELEVATED_BU = 3;
/** Depth below the surface (mm) from which a walker is "underground" for temperature purposes. */
export const UNDERGROUND_MM = 2;
/** GDD 03 §9.2 humidity: soil moisture profile damping depth (mm), RH range, smoothstep edges, vent reach (BU, path). */
export const CHAMBER_RH_DEPTH_MM = 80;
export const CHAMBER_RH_MIN = 0.5;
export const CHAMBER_RH_SPAN = 0.5;
export const CHAMBER_RH_M_LO = 0.05;
export const CHAMBER_RH_M_HI = 0.30;
export const CHAMBER_VENT_BU = 8;
export const CHAMBER_VENT_MIX = 0.3;

// ---- Ant thermal response (GDD 06 §2.6-2.7) ----

/** Body temperature relaxation time constant, game seconds. */
export const TB_TAU_S = 6;
/** Lasius speed curve: body temperature (C) -> multiplier (piecewise linear, zero outside 5..40). */
export const SPEED_CURVE_C = [5, 10, 15, 20, 22, 28, 30, 35, 40] as const;
export const SPEED_CURVE_MULT = [0, 0.25, 0.55, 0.9, 1.0, 1.0, 1.1, 0.9, 0] as const;
export const HEAT_DOSE_K = 6000;
export const HEAT_RECOVERY_S = 600;
export const HEAT_STUPOR_LOAD = 0.5;
export const HEAT_STUPOR_RECOVER_LOAD = 0.3;
/** Stupor also starts at Tb >= stressC + this. */
export const HEAT_STUPOR_OVER_C = 5;
export const COLD_DOSE_K = 3600;
export const COLD_RECOVERY_S = 900;
/** Speed multiplier of an ant in heat stupor. */
export const STUPOR_SPEED_MULT = 0.2;
/** Surface activity weight of each weather state (rain by class: see RAIN_ACTIVITY). */
export const WEATHER_ACTIVITY: Record<WeatherState, number> = {
  clear: 1.0, overcast: 0.95, rain: 0.1, storm: 0.0, heat: 0.6, frost: 0.15,
};
/** Heat acclimation (T3): relaxation toward 0.2 * (mean day max - 22), bounds, time constant. */
export const ACCL_TAU_GD = 0.6;
export const ACCL_GAIN = 0.2;
export const ACCL_REF_C = 22;
export const ACCL_MIN_C = -1.5;
export const ACCL_MAX_C = 2;
/** Ant thermal state is evaluated every this many ticks per ant (staggered by id). */
export const ANT_THERMAL_EVERY = 25;
