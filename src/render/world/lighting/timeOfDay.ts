// Light, sky and haze for a moment in time (pure, tested): interpolates the GDD 08 11.2 keyframes by sun
// elevation (not by clock), then applies weather (11.4), habitat haze (11.3) and the underground blend (11.5).
// Everything is linear HDR; exposure is returned in EV for the render app.
import { Color, Vector3 } from 'three';
import type { WeatherState, ZoneType } from '@/sim/types';
import {
  AMBIENT_SCALE, AUTO_EXPOSURE_K, AUTO_EXPOSURE_MAX_EV, ENV_INTENSITY, HAZE_HEIGHT_K, INTERIOR_LOOK, HAZE_VIS_BU, HAZE_VIS_SCALE, HAZE_VIS_WEATHER_BU, LIGHT_KEYS, OVERCAST_SKY, SUN_INTENSITY, UNDERGROUND, WEATHER_LOOK,
  type LightKey,
} from './constants';

export interface LightingState {
  /** Key light: sun by day, moon at night. */
  keyDir: Vector3;
  keyColor: Color;
  keyIntensity: number;
  /** True while the key light is the moon. */
  moonlit: boolean;
  /** Penumbra multiplier for the shadow softness. */
  penumbra: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  envIntensity: number;
  skyZenith: Color;
  skyHorizon: Color;
  skyGround: Color;
  sunGlow: number;
  sunDisc: number;
  stars: number;
  overcast: number;
  /** Direction of the visible sun disc (it may be below the horizon). */
  sunDir: Vector3;
  fogColor: Color;
  /** FogExp2 density, 1/mm. */
  fogDensity: number;
  exposureEV: number;
  saturation: number;
  gain: [number, number, number];
}

export interface LightingInput {
  sunDir: Vector3;
  sunElevDeg: number;
  moonDir: Vector3;
  moonIllum: number;
  weather: WeatherState;
  cloud: number;
  /** Weather fog 0..1. */
  fog: number;
  /** Habitat at the camera. */
  zone: ZoneType;
  /** Body unit, mm. */
  bu: number;
  /** 0 surface .. 1 underground (eased by the caller). */
  under: number;
  /** Quality preset haze density multiplier (preset.fog.hazeScale); 0 disables fog. */
  hazeScale: number;
  /** Habitat haze visibility override, BU (eased by the caller); null = from `zone`. */
  hazeVisBU?: number | null;
  /** Camera height above the ground, BU (haze thins for high cameras). */
  cameraHeightBU?: number;
  /** 0 outdoors .. 1 camera inside an interior zone (eased by the caller). */
  interior?: number;
}

export function createLightingState(): LightingState {
  return {
    keyDir: new Vector3(0, 1, 0), keyColor: new Color(1, 1, 1), keyIntensity: SUN_INTENSITY, moonlit: false, penumbra: 1,
    hemiSky: new Color(), hemiGround: new Color(), hemiIntensity: 0.5, envIntensity: ENV_INTENSITY,
    skyZenith: new Color(), skyHorizon: new Color(), skyGround: new Color(), sunGlow: 0, sunDisc: 0, stars: 0, overcast: 0,
    sunDir: new Vector3(0, 1, 0), fogColor: new Color(), fogDensity: 0, exposureEV: 0, saturation: 1, gain: [1, 1, 1],
  };
}

const ca = new Color(), cb = new Color();

function lerpHex(a: string, b: string, t: number, out: Color): Color {
  ca.set(a);
  cb.set(b);
  return out.copy(ca).lerp(cb, t);
}

/** The two keyframes around an elevation and the blend factor between them. */
export function keyframesAt(elevDeg: number): { a: LightKey; b: LightKey; t: number } {
  const K = LIGHT_KEYS;
  if (elevDeg <= K[0].elevDeg) return { a: K[0], b: K[0], t: 0 };
  for (let i = 1; i < K.length; i++) {
    if (elevDeg <= K[i].elevDeg) {
      const t = (elevDeg - K[i - 1].elevDeg) / (K[i].elevDeg - K[i - 1].elevDeg);
      return { a: K[i - 1], b: K[i], t: t * t * (3 - 2 * t) };
    }
  }
  const last = K[K.length - 1];
  return { a: last, b: last, t: 0 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Haze visibility (63 % extinction) of a habitat in a weather state, BU (GDD 08 11.3, before weather density). */
export function hazeVisBU(zone: ZoneType, weather: WeatherState = 'clear'): number {
  return HAZE_VIS_WEATHER_BU[weather]?.[zone] ?? HAZE_VIS_BU[zone];
}

/** Haze visibility (63 % extinction) for a habitat, mm, before weather. */
export function hazeVisibilityMm(zone: ZoneType, bu: number, weather: WeatherState = 'clear'): number {
  return hazeVisBU(zone, weather) * HAZE_VIS_SCALE * bu;
}

export function computeLighting(inp: LightingInput, out: LightingState = createLightingState()): LightingState {
  const { a, b, t } = keyframesAt(inp.sunElevDeg);
  const W = WEATHER_LOOK[inp.weather];
  const ov = Math.max(W.overcast, Math.min(1, Math.max(0, (inp.cloud - 0.3) / 0.6)));
  const sunUp = inp.sunElevDeg > -2;
  // weather states with cloud carry their own multipliers; a cloudy 'clear' sky moves toward the overcast look
  const cloudy = W.overcast > 0 ? 0 : ov;
  const sunMult = W.sunMult * lerp(1, WEATHER_LOOK.overcast.sunMult, cloudy);

  // key light: the sun while it is up (fading through the horizon), then the moon
  const keyRel = lerp(a.sunRel, b.sunRel, t);
  lerpHex(a.sunHex, b.sunHex, t, out.keyColor);
  out.moonlit = !sunUp;
  if (sunUp) {
    out.keyDir.copy(inp.sunDir);
    if (out.keyDir.y < 0.02) out.keyDir.y = 0.02; // grazing, never from below the ground
    out.keyDir.normalize();
    const horizonFade = Math.min(1, Math.max(0, (inp.sunElevDeg + 2) / 4));
    out.keyIntensity = SUN_INTENSITY * keyRel * horizonFade * sunMult;
  } else {
    out.keyDir.copy(inp.moonDir).normalize();
    out.keyIntensity = SUN_INTENSITY * keyRel * (0.35 + 0.65 * inp.moonIllum) * (1 - 0.6 * inp.cloud);
  }
  out.penumbra = lerp(1, W.penumbra, ov);

  // sky dome and haze (horizon == fog colour)
  lerpHex(a.hazeHex, b.hazeHex, t, out.skyHorizon);
  if (W.hazeHex) out.skyHorizon.lerp(ca.set(W.hazeHex), 0.5);
  out.skyHorizon.multiplyScalar(lerp(a.hazeLevel, b.hazeLevel, t));
  out.skyZenith.setRGB(lerp(a.zenith[0], b.zenith[0], t), lerp(a.zenith[1], b.zenith[1], t), lerp(a.zenith[2], b.zenith[2], t));
  const dayLevel = Math.max(keyRel, 0.06);
  cb.setRGB(OVERCAST_SKY[0], OVERCAST_SKY[1], OVERCAST_SKY[2]).multiplyScalar(dayLevel);
  out.skyZenith.lerp(cb, ov);
  out.skyHorizon.lerp(cb.multiplyScalar(1.12), ov);
  out.sunGlow = lerp(a.glow, b.glow, t) * (1 - 0.85 * ov);
  out.sunDisc = lerp(a.disc, b.disc, t) * (1 - ov);
  out.stars = lerp(a.stars, b.stars, t) * (1 - inp.cloud);
  out.overcast = ov;
  out.sunDir.copy(inp.sunDir);
  out.skyGround.setRGB(0.13, 0.12, 0.07).multiplyScalar(Math.max(0.02, out.keyIntensity / SUN_INTENSITY + 0.1));

  // ambient
  lerpHex(a.ambientHex, b.ambientHex, t, out.hemiSky);
  out.hemiGround.setRGB(0.32, 0.27, 0.2);
  out.hemiIntensity = AMBIENT_SCALE * lerp(a.ambientRel, b.ambientRel, t) * (1 + 0.4 * ov);
  out.envIntensity = ENV_INTENSITY;

  // haze
  out.fogColor.copy(out.skyHorizon);
  const visBU = (inp.hazeVisBU ?? hazeVisBU(inp.zone, inp.weather)) * HAZE_VIS_SCALE + HAZE_HEIGHT_K * Math.max(0, inp.cameraHeightBU ?? 0);
  const vis = visBU * inp.bu;
  // a weather state's own haze, or (cloudy 'clear' sky) toward the overcast haze: never both
  const hazeMult = W.hazeMult * lerp(1, WEATHER_LOOK.overcast.hazeMult, cloudy);
  out.fogDensity = inp.hazeScale > 0 ? (inp.hazeScale * hazeMult * (1 + 2 * inp.fog)) / vis : 0;

  out.exposureEV = lerp(a.exposureEV, b.exposureEV, t) + W.exposureEV + WEATHER_LOOK.overcast.exposureEV * cloudy;
  out.saturation = lerp(a.saturation, b.saturation, t) * W.saturation;
  out.gain[0] = lerp(a.gain[0], b.gain[0], t); out.gain[1] = lerp(a.gain[1], b.gain[1], t); out.gain[2] = lerp(a.gain[2], b.gain[2], t);

  // frost: blue shadows (GDD 08 11.4): the sky fill takes the frost hue at its own brightness
  if (W.shadowHex) {
    const lum = luminance(out.hemiSky);
    ca.set(W.shadowHex);
    out.hemiSky.copy(ca).multiplyScalar(lum / Math.max(1e-6, luminance(ca)));
  }

  // the photographer compensates for low sun and night, not for walking indoors (rooms stay dimmer than outside);
  // weather meters through meterSunMult (the storm meters like rain, so its -0.7 EV stays on screen)
  const meter = sunUp && W.sunMult > 0 ? (W.meterSunMult * lerp(1, WEATHER_LOOK.overcast.sunMult, cloudy)) / sunMult : 1;
  out.exposureEV += autoExposureEV(out, meter);
  // interior: tungsten ambient from above, the sun only through openings
  const ins = Math.min(1, Math.max(0, inp.interior ?? 0));
  if (ins > 0) {
    out.keyIntensity *= 1 + (INTERIOR_LOOK.sunMult - 1) * ins;
    out.hemiSky.lerp(ca.set(INTERIOR_LOOK.ambientHex), ins);
    out.hemiGround.lerp(ca, ins * 0.5);
    out.hemiIntensity = lerp(out.hemiIntensity, AMBIENT_SCALE * INTERIOR_LOOK.ambientRel, ins);
    out.envIntensity *= 1 - 0.6 * ins;
    out.exposureEV += INTERIOR_LOOK.exposureEV * ins;
  }

  // underground: the surface world dims away, the nest's ambient and fog take over
  const u = Math.min(1, Math.max(0, inp.under));
  if (u > 0) {
    const dim = lerp(1, UNDERGROUND.surfaceDim, u);
    out.keyIntensity *= dim;
    out.envIntensity *= dim;
    ca.set(UNDERGROUND.ambientHex);
    out.hemiSky.lerp(ca, u);
    out.hemiGround.lerp(ca, u);
    out.hemiIntensity = lerp(out.hemiIntensity, AMBIENT_SCALE * UNDERGROUND.ambientRel, u);
    out.fogColor.lerp(ca.set(UNDERGROUND.fogHex).multiplyScalar(UNDERGROUND.fogLevel), u);
    const ugDensity = 1 / (UNDERGROUND.visBU * inp.bu);
    out.fogDensity = lerp(out.fogDensity, ugDensity, u);
    out.exposureEV = lerp(out.exposureEV, UNDERGROUND.exposureEV, u);
  }
  return out;
}

/** Midday horizontal irradiance proxy (sun at 60 degrees + day ambient). */
const E_REF = SUN_INTENSITY * Math.sin(Math.PI / 3) + AMBIENT_SCALE * 0.35;

const luminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/**
 * Exposure compensation for a dim scene (low sun, night, indoors), EV >= 0. `keyMeterScale` scales the key light
 * as the meter sees it (weather looks that must stay darker than the metered scene).
 */
export function autoExposureEV(l: LightingState, keyMeterScale = 1): number {
  const e = l.keyIntensity * keyMeterScale * Math.max(0, l.keyDir.y) + l.hemiIntensity;
  const stops = Math.log2(E_REF / Math.max(1e-4, e));
  return Math.min(AUTO_EXPOSURE_MAX_EV, Math.max(0, stops * AUTO_EXPOSURE_K));
}
