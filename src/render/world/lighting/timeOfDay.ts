// Light, sky and haze for a moment in time (pure, tested): interpolates the GDD 08 11.2 keyframes by sun
// elevation (not by clock), then applies weather (11.4), habitat haze (11.3) and the underground blend (11.5).
// Everything is linear HDR; exposure is returned in EV for the render app.
import { Color, Vector3 } from 'three';
import type { WeatherState, ZoneType } from '@/sim/types';
import {
  AMBIENT_SCALE, AUTO_EXPOSURE_K, AUTO_EXPOSURE_MAX_EV, ENV_INTENSITY, HAZE_HEIGHT_K, INTERIOR_LOOK, HAZE_VIS_BU, HAZE_VIS_SCALE, HAZE_VIS_WEATHER_BU, LIGHT_KEYS, NIGHT_LOOK, OVERCAST_SKY, SUN_INTENSITY, UNDERGROUND, WEATHER_LOOK,
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
  /**
   * Camera-side fill underground (GDD 08 11.5 "sense light" on the ants; the nest walls light themselves): intensity
   * of a soft warm light from the camera toward the subject, 0 on the surface.
   */
  fillIntensity: number;
  /** 0 by day .. 1 at night (nightWeight of the sun elevation): the night look's blend, for the layers that follow it. */
  nightW: number;
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
    sunDir: new Vector3(0, 1, 0), fogColor: new Color(), fogDensity: 0, exposureEV: 0, saturation: 1, gain: [1, 1, 1], fillIntensity: 0, nightW: 0,
  };
}

const ca = new Color(), cb = new Color();

/** Copies every field of a lighting state (no allocation). */
export function copyLighting(out: LightingState, s: LightingState): LightingState {
  out.keyDir.copy(s.keyDir); out.keyColor.copy(s.keyColor); out.keyIntensity = s.keyIntensity; out.moonlit = s.moonlit; out.penumbra = s.penumbra;
  out.hemiSky.copy(s.hemiSky); out.hemiGround.copy(s.hemiGround); out.hemiIntensity = s.hemiIntensity; out.envIntensity = s.envIntensity;
  out.skyZenith.copy(s.skyZenith); out.skyHorizon.copy(s.skyHorizon); out.skyGround.copy(s.skyGround);
  out.sunGlow = s.sunGlow; out.sunDisc = s.sunDisc; out.stars = s.stars; out.overcast = s.overcast; out.sunDir.copy(s.sunDir);
  out.fogColor.copy(s.fogColor); out.fogDensity = s.fogDensity; out.exposureEV = s.exposureEV; out.saturation = s.saturation;
  out.gain[0] = s.gain[0]; out.gain[1] = s.gain[1]; out.gain[2] = s.gain[2]; out.fillIntensity = s.fillIntensity; out.nightW = s.nightW;
  return out;
}

/**
 * Moves `out` toward `from` by the share `w` (1 = all the way to `from`, 0 = `out` as it is): the lighting of a moment crossfaded into the one before
 * it, for the instants the light source changes by a cut (the founding shot's fixed hour starting and ending, look pass 6). Directions are blended
 * and renormalised; `moonlit` and the other flags are the new state's. No allocation.
 */
export function blendLighting(out: LightingState, from: LightingState, w: number): LightingState {
  if (w <= 0) return out;
  const t = Math.min(1, w);
  out.keyDir.lerp(from.keyDir, t).normalize(); out.sunDir.lerp(from.sunDir, t).normalize();
  out.keyColor.lerp(from.keyColor, t); out.hemiSky.lerp(from.hemiSky, t); out.hemiGround.lerp(from.hemiGround, t);
  out.skyZenith.lerp(from.skyZenith, t); out.skyHorizon.lerp(from.skyHorizon, t); out.skyGround.lerp(from.skyGround, t); out.fogColor.lerp(from.fogColor, t);
  out.keyIntensity = lerp(out.keyIntensity, from.keyIntensity, t); out.penumbra = lerp(out.penumbra, from.penumbra, t);
  out.hemiIntensity = lerp(out.hemiIntensity, from.hemiIntensity, t); out.envIntensity = lerp(out.envIntensity, from.envIntensity, t);
  out.sunGlow = lerp(out.sunGlow, from.sunGlow, t); out.sunDisc = lerp(out.sunDisc, from.sunDisc, t); out.stars = lerp(out.stars, from.stars, t);
  out.overcast = lerp(out.overcast, from.overcast, t); out.fogDensity = lerp(out.fogDensity, from.fogDensity, t);
  out.exposureEV = lerp(out.exposureEV, from.exposureEV, t); out.saturation = lerp(out.saturation, from.saturation, t);
  out.gain[0] = lerp(out.gain[0], from.gain[0], t); out.gain[1] = lerp(out.gain[1], from.gain[1], t); out.gain[2] = lerp(out.gain[2], from.gain[2], t);
  out.fillIntensity = lerp(out.fillIntensity, from.fillIntensity, t); out.nightW = lerp(out.nightW, from.nightW, t);
  return out;
}

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
    out.keyIntensity = SUN_INTENSITY * NIGHT_LOOK.moonRel * (0.35 + 0.65 * inp.moonIllum) * (1 - (1 - NIGHT_LOOK.cloudKeep) * inp.cloud);
  }
  const nightW = nightWeight(inp.sunElevDeg);
  out.penumbra = lerp(lerp(1, W.penumbra, ov), Math.max(NIGHT_LOOK.penumbra, W.penumbra), nightW);

  // sky dome and haze (horizon == fog colour)
  lerpHex(a.hazeHex, b.hazeHex, t, out.skyHorizon);
  if (W.hazeHex) out.skyHorizon.lerp(ca.set(W.hazeHex), 0.5);
  out.skyHorizon.multiplyScalar(lerp(a.hazeLevel, b.hazeLevel, t));
  out.skyZenith.setRGB(lerp(a.zenith[0], b.zenith[0], t), lerp(a.zenith[1], b.zenith[1], t), lerp(a.zenith[2], b.zenith[2], t));
  const dayLevel = Math.max(keyRel, 0.06);
  cb.setRGB(OVERCAST_SKY[0], OVERCAST_SKY[1], OVERCAST_SKY[2]).multiplyScalar(dayLevel);
  // a cloudy night sky is a dark, cool lid (moon and distant glow in the cloud), not the grey of a day: at the night
  // exposure the day-referenced colour showed as a flat light-grey sky in the rain
  if (nightW > 0) cb.lerp(ca.setRGB(...NIGHT_LOOK.overcastSkyRgb), nightW);
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
  out.envIntensity = ENV_INTENSITY * lerp(1, NIGHT_LOOK.envKeep, nightW);
  // night: the moonlit sky fill replaces the (dark) keyframe ambient and the ground bounce goes cool and dim
  if (nightW > 0) {
    out.hemiSky.lerp(ca.set(NIGHT_LOOK.fillHex), nightW);
    out.hemiGround.lerp(cb.setRGB(...NIGHT_LOOK.groundRgb), nightW);
    out.hemiIntensity = lerp(out.hemiIntensity, AMBIENT_SCALE * NIGHT_LOOK.fillRel, nightW);
  }

  // haze
  out.fogColor.copy(out.skyHorizon);
  const visBU = (inp.hazeVisBU ?? hazeVisBU(inp.zone, inp.weather)) * HAZE_VIS_SCALE + HAZE_HEIGHT_K * Math.max(0, inp.cameraHeightBU ?? 0);
  const vis = visBU * inp.bu;
  // a weather state's own haze, or (cloudy 'clear' sky) toward the overcast haze: never both
  const hazeMult = W.hazeMult * lerp(1, WEATHER_LOOK.overcast.hazeMult, cloudy) * lerp(1, NIGHT_LOOK.hazeMult, nightW);
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
  // night: the photographer meters the moonlit ground instead (NIGHT_LOOK); blended in through the dusk
  if (nightW > 0) out.exposureEV = lerp(out.exposureEV, nightExposureEV(out, W.nightEV), nightW);
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
  out.fillIntensity = u * UNDERGROUND.fillRel;
  out.nightW = nightW;
  return out;
}

/** 0 by day .. 1 at night: smoothstep over the sun elevations NIGHT_LOOK.nightFromDeg .. nightToDeg. */
export function nightWeight(sunElevDeg: number): number {
  const t = Math.min(1, Math.max(0, (NIGHT_LOOK.nightFromDeg - sunElevDeg) / (NIGHT_LOOK.nightFromDeg - NIGHT_LOOK.nightToDeg)));
  return t * t * (3 - 2 * t);
}

/**
 * Exposure of a moonlit scene: meters the horizontal irradiance of the ground (moon + sky fill) toward
 * NIGHT_LOOK.targetE, plus the weather's own night compensation (a storm's -0.7 EV), clamped to [minEV, maxEV] (the
 * floor and the cap are the "exposure adaptation with a floor").
 */
export function nightExposureEV(l: LightingState, weatherEV = 0): number {
  const e = groundIrradiance(l);
  return Math.min(NIGHT_LOOK.maxEV, Math.max(NIGHT_LOOK.minEV, Math.log2(NIGHT_LOOK.targetE / Math.max(1e-5, e)) + weatherEV));
}

/** Horizontal irradiance of the ground (key light + sky fill), three's physical units (before albedo / pi). */
export function groundIrradiance(l: LightingState): number {
  return l.keyIntensity * luminance(l.keyColor) * Math.max(0, l.keyDir.y) + l.hemiIntensity * luminance(l.hemiSky);
}

/**
 * The display luminance (sRGB-encoded luma, 0..1) a flat ground of linear albedo `albedo` shows under this lighting:
 * radiance = albedo * E / pi, times the exposure, through the ACES filmic curve (a grey through three's
 * ACESFilmicToneMapping, input 1/0.6 scaled) and the sRGB transfer. A model for tests and tuning; the real
 * measurements are tests/e2e/lib/look2.mjs (acceptance 3). Valid for the moonlit night (nightW = 1) only: it has no sky
 * environment light, so by day it reads dark (noon 0.22 against 0.31 measured) and at dusk darker still (a near-black
 * 1 degree sun, where the game shows 0.15..0.25).
 */
export function groundDisplayLuma(l: LightingState, albedo: number): number {
  const x = (albedo * groundIrradiance(l) / Math.PI) * Math.pow(2, l.exposureEV) / 0.6;
  const a = x * (x + 0.0245786) - 0.000090537, b = x * (0.983729 * x + 0.432951) + 0.238081;
  const t = Math.min(1, Math.max(0, a / b));
  return t <= 0.0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - 0.055;
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
