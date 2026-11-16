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
    elevDeg: -18, sunHex: '#C9D6FF', sunRel: 0.06, ambientHex: '#28324A', ambientRel: 0.15, hazeHex: '#1E2433', hazeLevel: 0.3,
    zenith: [0.002, 0.0035, 0.009], glow: 0.02, disc: 0, stars: 0.6, exposureEV: 1.2, saturation: 0.7, gain: [0.92, 0.98, 1.1],
  },
  { // night begins
    elevDeg: -6, sunHex: '#C9D6FF', sunRel: 0.06, ambientHex: '#28324A', ambientRel: 0.15, hazeHex: '#1E2433', hazeLevel: 0.4,
    zenith: [0.003, 0.005, 0.012], glow: 0.05, disc: 0, stars: 0.35, exposureEV: 1.2, saturation: 0.75, gain: [0.94, 0.98, 1.08],
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

/** GDD 08 11.3: habitats whose haze visibility changes in a weather state (asphalt 450 BU, 250 BU in heat). */
export const HAZE_VIS_WEATHER_BU: Partial<Record<WeatherState, Partial<Record<ZoneType, number>>>> = {
  heat: { asphalt: 250 },
};

/** Weather modifiers (GDD 08 11.4; sun multipliers from GDD 06 3.1 `sunMult`). */
export interface WeatherLook {
  sunMult: number;
  /**
   * Sun multiplier the exposure metering assumes. Equal to sunMult except for the storm: GDD 08 11.4 defines the
   * storm as the rain look darkened by 0.7 EV, so it meters like rain and its own exposure is rain's - 0.7.
   */
  meterSunMult: number;
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
  /** Hue of the sky fill in the shadows (frost: blue shadows), or null. The fill keeps its brightness. */
  shadowHex: string | null;
}

// hazeMult: overcast +20 % (GDD 08 11.4); rain and storm are not given in the GDD (the rain curtain thickens the
// air: +35 % / +50 %, tuning values); heat changes the haze colour, and its density only over asphalt (above).
export const WEATHER_LOOK: Record<WeatherState, WeatherLook> = {
  clear: { sunMult: 1, meterSunMult: 1, penumbra: 1, hazeMult: 1, exposureEV: 0, overcast: 0, saturation: 1, hazeHex: null, shadowHex: null },
  overcast: { sunMult: 0.35, meterSunMult: 0.35, penumbra: 4, hazeMult: 1.2, exposureEV: 0.3, overcast: 1, saturation: 0.95, hazeHex: null, shadowHex: null },
  rain: { sunMult: 0.2, meterSunMult: 0.2, penumbra: 4, hazeMult: 1.35, exposureEV: 0.4, overcast: 1, saturation: 0.95, hazeHex: null, shadowHex: null },
  storm: { sunMult: 0.12, meterSunMult: 0.2, penumbra: 4, hazeMult: 1.5, exposureEV: 0.4 - 0.7, overcast: 1, saturation: 0.9, hazeHex: null, shadowHex: null },
  heat: { sunMult: 1.05, meterSunMult: 1.05, penumbra: 1, hazeMult: 1, exposureEV: -0.1, overcast: 0, saturation: 0.95, hazeHex: '#EADBC0', shadowHex: null },
  frost: { sunMult: 1, meterSunMult: 1, penumbra: 1, hazeMult: 1, exposureEV: 0, overcast: 0, saturation: 0.7, hazeHex: null, shadowHex: '#5A6E8C' },
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
  /**
   * Camera-side fill on the ants underground (the sense light's share that reaches the subject from the viewer's
   * side): without it the founding queen read as a black silhouette from the camera (look-pass addendum).
   */
  fillHex: '#FFB775',
  fillRel: 0.4,
} as const;

/**
 * Photographer's exposure compensation (spike-look.md 2.3 calibrated golden hour at +0.85 EV and night at +2.8 EV):
 * the ground's horizontal irradiance is compared with midday and AUTO_EXPOSURE_K of the difference in stops is
 * added on top of the GDD 08 11.2 exposure, clamped to AUTO_EXPOSURE_MAX_EV.
 *
 * RECORDED DEPARTURE from the GDD 08 11.2 exposure column (night +1.2, dawn/dusk +0.3, low sun and day 0): the GDD
 * column is applied as written, and this metering comes on top. Reason: the renderer lights the ground physically
 * (key light x sin(elevation)), which the GDD's relative-intensity column does not model; without metering the
 * ground at night sits 2.8 stops under midday and golden hour 1.9 stops under, which breaks GDD 08 11.2 "night
 * must stay readable" and the warm golden-hour look of 11.1. Final values at a clear sky (pinned by lighting.test.ts):
 * night ~3.0 EV, horizon ~1.9, 8 deg ~1.3, 15 deg ~0.9, 30 deg ~0.4, 50 deg+ ~0.1. Weather does not drive the
 * metering beyond `meterSunMult`, so overcast, rain and storm stay visibly darker than a clear day.
 */
export const AUTO_EXPOSURE_K = 0.6;
export const AUTO_EXPOSURE_MAX_EV = 2.0;

/**
 * Moonlit night (look-pass 2). GDD 08 11.2 asks for "night must stay readable"; the first implementation (GDD
 * ambient #28324A at 0.15, the moon at 0.06 of the sun cut by cloud, exposure capped at +3 EV) left the ground at
 * a few percent of display luminance and the nest mound black. A night camera does three things, and so does this:
 *  - a cool moon key with SOFT shadows (`penumbra`), not much dimmed by cloud (`cloudKeep`: cloud scatters the
 *    moon's light, it does not remove it the way it removes a sun disc);
 *  - a sky fill of its own (`fillHex` at `fillRel`; the GDD ambient colour is already dark before its 0.15 level);
 *  - exposure that meters the ground: EV = log2(targetE / E), clamped to [minEV, maxEV] (the FLOOR keeps a bright
 *    moon from making the night grey; the cap keeps a cloudy new moon from turning the noise up forever). The
 *    metering replaces the GDD exposure column and the weather EV at night (rain and cloud already cut E).
 * `nightFromDeg`..`nightToDeg`: the sun elevations over which the dusk blends into this night look (smoothstep).
 * Target (acceptance): median luminance of the ground within 20 body lengths 12..25 % of the display range.
 * Tuned by tests/e2e/look2.mjs measurements; pinned by lighting.test.ts (night numbers) and lookPass2.test.ts.
 */
export interface NightLook {
  moonRel: number;
  cloudKeep: number;
  fillHex: string;
  fillRel: number;
  /** Ground bounce under the night sky (linear), colour of the light that comes back up from the ground. */
  groundRgb: [number, number, number];
  /** Linear colour of the overcast sky at night (the dome flattens toward it under cloud). */
  overcastSkyRgb: [number, number, number];
  penumbra: number;
  targetE: number;
  minEV: number;
  maxEV: number;
  nightFromDeg: number;
  nightToDeg: number;
  /** Extra haze at night (fraction of the day density): the horizon hides what is beyond the map in a soft band. */
  hazeMult: number;
}
export const NIGHT_LOOK: NightLook = {
  moonRel: 0.06,
  cloudKeep: 0.6,
  fillHex: '#6E86C0',
  fillRel: 0.3,
  groundRgb: [0.05, 0.06, 0.09],
  overcastSkyRgb: [0.0045, 0.0055, 0.011],
  penumbra: 2.5,
  targetE: 2.2,
  minEV: 2.6,
  maxEV: 5.5,
  nightFromDeg: 2,
  nightToDeg: -6,
  hazeMult: 1,
};

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
/**
 * Shadow depth bias and normal bias in shadow-map texels (converted to mm per preset). Small enough that a 1 mm
 * grain or an ant's body casts a contact shadow; the normal bias keeps flat ground free of acne.
 */
export const SHADOW_BIAS_TEXELS = 0.35;
export const SHADOW_NORMAL_BIAS_TEXELS = 0.6;
/** Shadow softness (texels of PCF radius) per quality and its scaling by weather penumbra. */
export const SHADOW_RADIUS_TEXELS = 2.5;

/** Sky environment (PMREM) re-bake when the sun moves more than this, degrees, or the weather changes. */
export const ENV_REBAKE_DEG = 2;
/** Minimum real time between two env re-bakes, s (PMREM is expensive under software GL). */
export const ENV_REBAKE_MIN_S = 1.5;

/**
 * Star brightness while depth of field is on. Stars sit at infinity, far outside the macro lens' depth of field:
 * a real macro photograph shows them as faint, soft blobs at most. Full-strength stars became large bright bokeh
 * discs that read as falling snow (review of the High preset at night).
 */
export const STARS_DOF_GAIN = 0.08;
