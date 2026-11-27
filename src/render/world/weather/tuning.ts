// Presentation constants of the weather renderer (render-only numbers; simulation balance lives in src/sim/balance).
// Ant scale: a downpour drop (4.5 mm) is as wide as a Lasius worker is long and falls at ~9 m/s, so at 1/60 s
// exposure it smears into a streak 10-15 cm long. Streaks are drawn at that scale around the camera, splashes as
// crowns about 3-6 drop diameters wide, ripples as rings on standing water.
import type { QualityId } from '@/render/app';
import type { RainClass } from '@/sim/types';

/** Rain streak instances per quality preset (scaled down by intensity). */
export const RAIN_STREAKS: Record<QualityId, number> = { test: 900, low: 1500, medium: 3000, high: 5000, ultra: 8000 };
/** Splash and ripple instances per quality preset. */
export const SPLASHES: Record<QualityId, number> = { test: 160, low: 160, medium: 280, high: 420, ultra: 600 };
export const RIPPLES: Record<QualityId, number> = { test: 120, low: 120, medium: 200, high: 300, ultra: 400 };
/** Frost flecks on the ground near the camera (rime). */
export const FLECKS: Record<QualityId, number> = { test: 400, low: 400, medium: 900, high: 1500, ultra: 2200 };

/** Drop look per class (and storm): diameter mm, fall speed mm/s, streak length mm, density 0..1 of the instances. */
export interface DropLook { diameterMm: number; speedMmS: number; streakMm: number; density: number; opacity: number }
export const DROP_LOOK: Record<RainClass | 'storm', DropLook> = {
  drizzle: { diameterMm: 0.5, speedMmS: 2000, streakMm: 35, density: 0.45, opacity: 0.42 },
  shower: { diameterMm: 2.5, speedMmS: 6500, streakMm: 90, density: 0.7, opacity: 0.6 },
  downpour: { diameterMm: 4.5, speedMmS: 9000, streakMm: 140, density: 1, opacity: 0.75 },
  storm: { diameterMm: 4.5, speedMmS: 9000, streakMm: 150, density: 1, opacity: 0.8 },
};
/** The rain volume around the camera: half width and height, mm (in BU x this for scale-free framing). */
export const RAIN_BOX_HALF_BU = 60;
export const RAIN_BOX_HEIGHT_BU = 80;
/** Streak tilt per m/s of wind at 2 m (horizontal / vertical speed). */
export const RAIN_WIND_TILT = 0.06;
/** Streak width = drop diameter x this (a streak reads thinner than the drop), at least MIN, mm. */
export const RAIN_WIDTH_PER_DIAMETER = 0.12;
export const RAIN_MIN_WIDTH_MM = 0.12;
/**
 * What a streak may look like on screen, whatever its distance (rainMath.ts): projected width between MIN px and
 * MAX_WIDTH_FRAC of the screen width (0.35 %, under the 0.4 % bound of the look review), projected length at most
 * MAX_LEN_FRAC of the screen height. Streaks nearer than FADE_NEAR[0] BU (view depth) are invisible, full opacity
 * from FADE_NEAR[1] BU, and they thin into the haze between FADE_FAR[0] and FADE_FAR[1] BU.
 */
export const RAIN_MIN_WIDTH_PX = 0.9;
export const RAIN_MAX_WIDTH_FRAC = 0.0035;
export const RAIN_MAX_LEN_FRAC = 0.12;
export const RAIN_FADE_NEAR_BU: readonly [number, number] = [3, 10];
export const RAIN_FADE_FAR_BU: readonly [number, number] = [40, 66];
/**
 * Streak colour = the scene's haze colour x this gain, in the scene's own (HDR, pre tone map) units, so a streak is
 * only ever a little brighter than the air behind it: dim at dusk and by night, never pure white. Per-drop opacity
 * varies between PER_DROP_MIN and 1 of the class opacity.
 */
export const RAIN_TINT_GAIN = 2;
/** No channel of a streak's colour exceeds this (linear scene units, before opacity): bright hazes do not turn rain pure white. */
export const RAIN_TINT_MAX = 0.8;
export const RAIN_PER_DROP_MIN = 0.5;
/** Splash crowns, ripple rings and frost glints: the rain tint x this (their own brightness against the haze). */
export const SPLASH_TINT = 0.9;
export const RIPPLE_TINT = 0.8;
export const FLECK_TINT = 1.1;
/** Colour used when the scene has no fog (haze off in Settings): linear, slightly blue-grey, scaled by sky light. */
export const RAIN_COLOR: readonly [number, number, number] = [0.72, 0.77, 0.82];

/** Splashes: radius at the end of the crown in drop diameters, life s, spawn radius around the subject (BU). */
export const SPLASH_RADIUS_DROPS = 2;
export const SPLASH_LIFE_S = 0.22;
export const IMPACT_AREA_BU = 30;
/** Ripples: final radius mm, life s. */
export const RIPPLE_RADIUS_MM = 9;
export const RIPPLE_LIFE_S = 0.9;

/**
 * Underground water (app-seams-4 item 4). The old sheet was a union of cell squares, flat and pale, a translucent blue-white slab with
 * square corners over the queen (look6 item1-s2-low-real-beats-07-10-after.png); edge-on a pale band. It is now a lattice mesh whose
 * per-vertex shore value (the carve openness at the water level) is cut at the iso level in the shader: the outline of the cavity,
 * a soft shore, a meniscus line, shallows tinted by the soil under them and darker where it deepens, a faint moving ripple. Colours
 * linear; the outdoor puddle (decor/tuning WATER) is the reference for the tints.
 */
export const FLOOD_WATER = {
  /** Tint over the shore and over the deep part (the underlying soil shows through shallow water). */
  shallowTint: [0.035, 0.07, 0.07] as const,
  deepTint: [0.008, 0.024, 0.034] as const,
  /** Shore value (0 at the wall .. 1 well inside) at which the water reaches its full depth tint. */
  deepAt: 0.7,
  /** Alpha over the shallows and over the deep part; the Fresnel term adds up to `fresnelAlpha` at grazing view. */
  alphaShallow: 0.32,
  alphaDeep: 0.55,
  fresnelAlpha: 0.1,
  /** Seen edge-on a flat sheet is a pale reflecting line: its alpha is cut to `edgeOnAlpha` of itself as the view angle to the surface falls under `edgeOnFrom` (cos of the angle to the normal); the water's volume (nest FLOOD_VOLUME) carries the read then. */
  edgeOnFrom: 0.22,
  edgeOnAlpha: 0.3,
  /** Depth (mm) over which the water fades in from the line where the floor comes up to it, and over which it reaches its deep tint. */
  depthSoftMm: 0.5,
  depthDeepMm: 3,
  /** Width of the soft shore (shore value units past the wall) and of the bright meniscus line. */
  softEdge: 0.1,
  meniscus: 0.16,
  /** Meniscus brightness (added to the lit colour, scaled by the sheet's own emissive base). */
  meniscusGain: 0.22,
  /** Ripples: normal tilt, wavelength mm, speed mm / s. */
  rippleTilt: 0.07,
  rippleMm: 3,
  rippleSpeed: 1.2,
  roughness: 0.08,
  /** A tunnel has no sky to mirror: a faint environment reflection and a faint self-light so it reads in the dim nest. */
  env: 0.05,
  emissive: 0.03,
};
/** Rebuild the flood surface at most every this many real seconds (and when the level moves by LEVEL_EPS mm). */
export const FLOOD_REBUILD_S = 0.5;
export const FLOOD_LEVEL_EPS_MM = 0.05;

/** Wetness shown on surfaces = max(precip x WET_PER_PRECIP, surfaceWet). */
export const WET_PER_PRECIP = 2;
/**
 * Lightning: the frame is multiplied by (1 + k) for a pulse of LIGHTNING_S with k falling from LIGHTNING_INTENSITY
 * (a multiplicative lift keeps dark ground dark-ish and never washes a tone-mapped HDR frame to white). Reduced
 * motion: no pulse, a soft brightening rising and falling over LIGHTNING_REDUCED_S with peak LIGHTNING_REDUCED.
 */
export const LIGHTNING_INTENSITY = 0.9;
export const LIGHTNING_S = 0.12;
export const LIGHTNING_REDUCED = 0.15;
export const LIGHTNING_REDUCED_S = 2;
/**
 * With flash reduction a new soft brightening starts at most every LIGHTNING_REDUCED_MIN_GAP_S real seconds and never
 * over one that is still running (GDD 08 App. E 25: at most 5 brightening events in 20 s of storm; at 8x the sim's
 * strikes come about every 0.75-2.6 real s).
 */
export const LIGHTNING_REDUCED_MIN_GAP_S = 4;
