// Art-direction numbers for sky, light and haze. Source: GDD 08 11.2 (light by sun elevation), 11.3 (haze per
// habitat), 11.4 (weather), 11.5 (underground); absolute radiance scale and sky gradients from the look spike
// (spike-look.md 2.3), which calibrated them by eye under ACES. Colours are sRGB hex as the GDD gives them;
// timeOfDay.ts converts them to linear.
import type { WeatherState, ZoneType } from '@/sim/types';

/** One light keyframe at a sun elevation (GDD 08 11.2 rows; the spike's sky gradients). */
export interface LightKey {
  elevDeg: number;
  /** Key light (sun, or moon at night) colour and intensity relative to the full sun. */
  sunHex: string;
  sunRel: number;
  /** Sky ambient colour and level (GDD "sky ambient #... at x"). */
  ambientHex: string;
  ambientRel: number;
  /** Haze colour = sky horizon colour (dome and fog meet without a seam). */
  hazeHex: string;
  /** Linear radiance multiplier of the haze / horizon colour. */
  hazeLevel: number;
  /** Sky zenith colour (linear radiance). */
  zenith: [number, number, number];
  /** Forward-scattering glow around the sun and the disc brightness. */
  glow: number;
  disc: number;
  stars: number;
  /** Exposure, EV. */
  exposureEV: number;
  /** Colour grade hint for the post chain: saturation and per-channel gain. */
  saturation: number;
  gain: [number, number, number];
}

/** Absolute intensity of the full sun (three physical units; the spike's midday value). */
export const SUN_INTENSITY = 3.3;
/** Hemisphere light intensity per unit of GDD "sky ambient" level. */
export const AMBIENT_SCALE = 2.2;
/** Image-based light (sky dome PMREM) intensity on the surface. */
export const ENV_INTENSITY = 0.55;

export const LIGHT_KEYS: readonly LightKey[] = [
  { // deep night (moon)
    elevDeg: -18, sunHex: '#C9D6FF', sunRel: 0.06, ambientHex: '#28324A', ambientRel: 0.15, hazeHex: '#1E2433', hazeLevel: 0.6,
    zenith: [0.004, 0.007, 0.018], glow: 0.02, disc: 0, stars: 0.6, exposureEV: 1.2, saturation: 0.7, gain: [0.92, 0.98, 1.1],
  },
  { // night begins
    elevDeg: -6, sunHex: '#C9D6FF', sunRel: 0.06, ambientHex: '#28324A', ambientRel: 0.15, hazeHex: '#1E2433', hazeLevel: 0.7,
    zenith: [0.006, 0.01, 0.024], glow: 0.05, disc: 0, stars: 0.35, exposureEV: 1.2, saturation: 0.75, gain: [0.94, 0.98, 1.08],
  },
  { // dawn / dusk
    elevDeg: 0, sunHex: '#FFC08A', sunRel: 0.45, ambientHex: '#7E8AA6', ambientRel: 0.25, hazeHex: '#E3B98F', hazeLevel: 0.62,
    zenith: [0.05, 0.08, 0.2], glow: 2.6, disc: 120, stars: 0, exposureEV: 0.3, saturation: 1.08, gain: [1.03, 0.98, 0.92],
  },
  { // golden hour (low sun)
    elevDeg: 8, sunHex: '#FFC48E', sunRel: 0.8, ambientHex: '#B0A89E', ambientRel: 0.28, hazeHex: '#E8C9A2', hazeLevel: 0.6,
    zenith: [0.06, 0.1, 0.24], glow: 2.0, disc: 160, stars: 0, exposureEV: 0.15, saturation: 1.06, gain: [1.02, 0.99, 0.94],
  },
  { // low sun
    elevDeg: 20, sunHex: '#FFE2BF', sunRel: 0.8, ambientHex: '#A9B4C0', ambientRel: 0.3, hazeHex: '#E8D9C4', hazeLevel: 0.55,
    zenith: [0.07, 0.15, 0.4], glow: 1.0, disc: 300, stars: 0, exposureEV: 0, saturation: 1.04, gain: [1.01, 1, 0.97],
  },
  { // day
    elevDeg: 35, sunHex: '#FFF4E5', sunRel: 1, ambientHex: '#9DB4CC', ambientRel: 0.35, hazeHex: '#D9DEE2', hazeLevel: 0.55,
    zenith: [0.08, 0.18, 0.5], glow: 0.6, disc: 400, stars: 0, exposureEV: 0, saturation: 1.05, gain: [1, 1, 0.98],
  },
];

/** GDD 08 11.3: haze visibility (63 % extinction) per habitat, BU. */
export const HAZE_VIS_BU: Record<ZoneType, number> = {
  forest: 220, lawn: 300, 'garden-bed': 280, pavement: 400, asphalt: 450, sand: 380, rubber: 380, interior: 600,
};
/**
 * Global multiplier on haze visibility. 1 = GDD values. Retune here if the haze reads too thick through the
 * macro lens (the look spike used ~10 m visibility; GDD 08 asks for 0.9-2.4 m at Lasius scale).
 */
export const HAZE_VIS_SCALE = 1;
/**
 * Haze visibility grows with the camera's height above the ground: + this many BU of visibility per BU of height.
 * GDD 08 11.3 gives the visibility for ant-height views; taken literally it would hide the whole colony from the
 * colony camera (30-600 BU high, 11.1), so the haze thins as the camera rises (decision recorded in the report).
 */
export const HAZE_HEIGHT_K = 4;
/** Easing time constant of haze changes when the camera crosses habitats, s. */
export const HAZE_EASE_S = 1.5;

/** Weather modifiers (GDD 08 11.4; sun multipliers from GDD 06 3.1 `sunMult`). */
export interface WeatherLook {
  sunMult: number;
  /** Shadow penumbra multiplier. */
  penumbra: number;
  /** Haze density multiplier. */
  hazeMult: number;
  exposureEV: number;
  /** Overcast flattening of the sky 0..1. */
  overcast: number;
  /** Saturation multiplier (frost desaturates 30 %). */
  saturation: number;
  /** Warmer haze tint (heat) or null. */
  hazeHex: string | null;
}

export const WEATHER_LOOK: Record<WeatherState, WeatherLook> = {
  clear: { sunMult: 1, penumbra: 1, hazeMult: 1, exposureEV: 0, overcast: 0, saturation: 1, hazeHex: null },
  overcast: { sunMult: 0.35, penumbra: 4, hazeMult: 1.2, exposureEV: 0.3, overcast: 1, saturation: 0.95, hazeHex: null },
  rain: { sunMult: 0.2, penumbra: 4, hazeMult: 1.35, exposureEV: 0.4, overcast: 1, saturation: 0.95, hazeHex: null },
  storm: { sunMult: 0.12, penumbra: 4, hazeMult: 1.5, exposureEV: 0.1, overcast: 1, saturation: 0.9, hazeHex: null },
  heat: { sunMult: 1.05, penumbra: 1, hazeMult: 1.1, exposureEV: -0.1, overcast: 0, saturation: 0.95, hazeHex: '#EADBC0' },
  frost: { sunMult: 1, penumbra: 1, hazeMult: 1, exposureEV: 0, overcast: 0, saturation: 0.7, hazeHex: null },
};
/** Overcast sky colour (linear) the dome flattens toward. */
export const OVERCAST_SKY: [number, number, number] = [0.4, 0.42, 0.46];

/** GDD 08 11.5 underground: ambient, fog colour, visibility. */
export const UNDERGROUND = {
  ambientHex: '#2A1F17',
  ambientRel: 1.0,
  fogHex: '#1E1712',
  fogLevel: 0.2,
  visBU: 30,
  exposureEV: 1.7,
  /** Remaining fraction of sun / sky light on the (hidden) surface while underground. */
  surfaceDim: 0.08,
  /** Easing time constant of the surface <-> underground switch, s. */
  easeS: 0.35,
} as const;

/**
 * Photographer's exposure compensation (spike-look.md 2.3 calibrated golden hour at +0.85 EV and night at +2.8 EV):
 * the ground's horizontal irradiance is compared with midday and AUTO_EXPOSURE_K of the difference in stops is
 * added on top of the GDD 08 11.2 exposure, clamped to AUTO_EXPOSURE_MAX_EV.
 */
export const AUTO_EXPOSURE_K = 0.5;
export const AUTO_EXPOSURE_MAX_EV = 1.5;

/** GDD 08 11.3 interior: warm tungsten from above, daylight only through windows and doors. */
export const INTERIOR_LOOK = {
  ambientHex: '#FFB46B',
  ambientRel: 0.35,
  /** Remaining direct sun through windows. */
  sunMult: 0.3,
  exposureEV: 0.1,
  /** Easing time constant when walking in or out, s. */
  easeS: 0.6,
} as const;

/** Shadow frustum is centred this fraction of its half-width ahead of the subject (spike 2.4). */
export const SHADOW_AHEAD = 0.55;
/** Shadow camera distance from its target, in half-widths. */
export const SHADOW_LIGHT_DIST = 8;
/** Shadow softness (texels of PCF radius) per quality and its scaling by weather penumbra. */
export const SHADOW_RADIUS_TEXELS = 2.5;

/** Sky environment (PMREM) re-bake when the sun moves more than this, degrees, or the weather changes. */
export const ENV_REBAKE_DEG = 2;
/** Minimum real time between two env re-bakes, s (PMREM is expensive under software GL). */
export const ENV_REBAKE_MIN_S = 1.5;
