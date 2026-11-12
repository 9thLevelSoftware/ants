// Presentation constants of the registry slot adapters (render-only numbers, not simulation balance).

/** Surface wetness follows precipitation: wetness target = min(1, precip x WET_PER_PRECIP). */
export const WET_PER_PRECIP = 2;
/** Real seconds for the surfaces to soak / dry (easing time constant); a settle frame (dt 0) snaps. */
export const WET_EASE_S = 20;
/** Daylight colour falling into tunnel openings, times the environment light level (render-nest demo values). */
export const DAYLIGHT_RGB: readonly [number, number, number] = [0.9, 0.88, 0.82];
/** Fraction of nest-wall fragments kept inside the occlusion capsule at full strength (render-nest default). */
export const OCCLUSION_KEEP = 0.25;
/**
 * Scene point light standing in for the nest's sense light on ants and items: intensity = PI x lanternLevel x this
 * (three's Lambert divides by PI; the walls' (1 - d/R)^2 falloff is narrower than the light's window, hence < 1).
 */
export const SENSE_LIGHT_SCALE = 0.5;
