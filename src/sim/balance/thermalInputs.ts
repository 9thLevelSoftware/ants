// Inputs the environment supplies to the nest microclimate (D7.2; GDD 03 §9.1 and §11, GDD 06 §2.5 and §3.3).

import type { RainClass } from '@/sim/types';

/** Entrance inflow intensity `I` by rain class (`rainIntensityAt`, E-138). */
export const RAIN_INTENSITY: Record<RainClass, number> = { drizzle: 0.1, shower: 0.4, downpour: 0.7 };
/** `I` during a storm. */
export const RAIN_INTENSITY_STORM = 1.0;
/** `I` under an active sprinkler or hose (GDD 04 human events). Indoors `I` is 0. */
export const RAIN_INTENSITY_SPRINKLER = 0.5;
/** Time constant of the `T_dayMean` EMA, game days (the `T_seasonMean` τ is the configured season length). */
export const THERMAL_DAY_EMA_TAU_GD = 1;
