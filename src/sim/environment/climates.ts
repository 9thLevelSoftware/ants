// Climate profiles (GDD 06 §2.1), one per climate id. Pure data plus the seasonal-mean curve.

import type { ClimateId, Season } from '@/sim/types';
import { SEASONAL_PEAK_DAY, REFERENCE_DAYS_PER_YEAR } from '@/sim/balance';

export interface ClimateDef {
  id: ClimateId;
  /** Annual mean air temperature, C. */
  tann: number;
  /** Seasonal half-range, C. */
  aseas: number;
  /** Diurnal half-range by season (spring, summer, autumn, winter), C. */
  ad: Record<Season, number>;
  /** Weight multipliers of the transition table (GDD 06 §3.2). */
  rainMult: number;
  stormMult: number;
  heatMult: number;
  frostMult: number;
  /** Heat wave air offset, C. */
  heatOffsetC: number;
  /** Frost may start only while the seasonal mean is at or below this, C. */
  frostSeasonalMaxC: number;
  /** A heat wave needs a seasonal mean at or above this, C. */
  heatSeasonalMinC: number;
  /** Wind factor and base relative humidity 0..1. */
  windBase: number;
  humidityBase: number;
}

export const CLIMATES: Record<ClimateId, ClimateDef> = {
  'temperate-maritime': {
    id: 'temperate-maritime', tann: 12.0, aseas: 8.5, ad: { spring: 5, summer: 6, autumn: 4, winter: 2.5 },
    rainMult: 1, stormMult: 1, heatMult: 1, frostMult: 1, heatOffsetC: 6, frostSeasonalMaxC: 9.5, heatSeasonalMinC: 17,
    windBase: 1.0, humidityBase: 0.75,
  },
  'temperate-continental': {
    id: 'temperate-continental', tann: 11.5, aseas: 12.5, ad: { spring: 6, summer: 7, autumn: 5, winter: 3.5 },
    rainMult: 1.1, stormMult: 1.2, heatMult: 0.9, frostMult: 1.2, heatOffsetC: 6, frostSeasonalMaxC: 9.5, heatSeasonalMinC: 19,
    windBase: 0.9, humidityBase: 0.7,
  },
  mediterranean: {
    id: 'mediterranean', tann: 17.5, aseas: 7.5, ad: { spring: 6, summer: 8, autumn: 5, winter: 4 },
    rainMult: 0.5, stormMult: 0.8, heatMult: 1.5, frostMult: 0.15, heatOffsetC: 5, frostSeasonalMaxC: 11, heatSeasonalMinC: 21,
    windBase: 0.9, humidityBase: 0.5,
  },
  subtropical: {
    id: 'subtropical', tann: 19.5, aseas: 9.5, ad: { spring: 6, summer: 7, autumn: 6, winter: 5 },
    rainMult: 0.9, stormMult: 1.5, heatMult: 1.3, frostMult: 0.15, heatOffsetC: 4, frostSeasonalMaxC: 11, heatSeasonalMinC: 24,
    windBase: 1.0, humidityBase: 0.7,
  },
};

/** Year fraction of the seasonal temperature peak (d = 9.5 of the default 28-day year). */
export const SEASONAL_PEAK_FRAC = SEASONAL_PEAK_DAY / REFERENCE_DAYS_PER_YEAR;

/** Seasonal mean air temperature: Tann + Aseas cos(2 pi (yearFrac - peak)). */
export function seasonalMean(c: ClimateDef, yearFrac: number): number {
  return c.tann + c.aseas * Math.cos(2 * Math.PI * (yearFrac - SEASONAL_PEAK_FRAC));
}

/** The climate definition of a climate id (unknown ids fall back to the reference climate). */
export function climateDef(id: ClimateId): ClimateDef {
  return CLIMATES[id] ?? CLIMATES['temperate-maritime'];
}
