/**
 * Lighting / atmosphere variants. All colours are LINEAR, light intensities in three's physical units
 * (DirectionalLight intensity = illuminance-like scale: a white Lambert surface facing the light reflects intensity/pi).
 * Relative magnitudes follow nature (clear-sky diffuse ~ 1/5 of direct sun, overcast ~ 1/5 of a sunny day, moonlight
 * many stops darker); the "camera" exposure then brings each scene to a normal brightness, like a photographer would.
 */
import { Color, Vector3 } from 'three';

export type VariantName = 'midday' | 'golden' | 'overcast' | 'night' | 'underground';
export interface Variant {
  name: VariantName; underground: boolean;
  sun: { elev: number; azim: number; color: Color; intensity: number; shadowSoft: number };   // azim: 0 = straight ahead of the camera (-Z), +90 = right (+X)
  sky: { zenith: Color; horizon: Color; ground: Color; sunGlow: number; sunDisc: number; discSize: number; overcast: number; stars: number };
  envIntensity: number;
  fog: { color: Color; density: number };
  exposure: number;
  bloom: { intensity: number; threshold: number };
  grade: { saturation: number; lift: [number, number, number]; gain: [number, number, number]; contrast: number };
  vignette: number;
  dof: { dead: number; range: number; bokeh: number };
  wet: number; wind: number; transl: number; lamps: boolean;
}

const C = (r: number, g: number, b: number) => new Color(r, g, b);

export const VARIANTS: Record<VariantName, Variant> = {
  midday: {
    name: 'midday', underground: false,
    sun: { elev: 58, azim: 128, color: C(1.0, 0.95, 0.88), intensity: 3.3, shadowSoft: 1 },
    sky: { zenith: C(0.08, 0.18, 0.5), horizon: C(0.4, 0.48, 0.6), ground: C(0.13, 0.12, 0.07), sunGlow: 0.6, sunDisc: 400, discSize: 0.00004, overcast: 0, stars: 0 },
    envIntensity: 1.0,
    fog: { color: C(0.38, 0.46, 0.58), density: 0.00008 },
    exposure: 1.0,
    bloom: { intensity: 0.35, threshold: 1.1 },
    grade: { saturation: 1.05, lift: [0.0, 0.0, 0.005], gain: [1.0, 1.0, 0.98], contrast: 1.04 },
    vignette: 0.45,
    dof: { dead: 0.06, range: 0.8, bokeh: 1 },
    wet: 0, wind: 0.1, transl: 1, lamps: false,
  },
  golden: {
    name: 'golden', underground: false,
    sun: { elev: 9, azim: -28, color: C(1.0, 0.52, 0.2), intensity: 3.0, shadowSoft: 1.3 },
    sky: { zenith: C(0.06, 0.09, 0.2), horizon: C(0.75, 0.42, 0.2), ground: C(0.09, 0.06, 0.03), sunGlow: 2.6, sunDisc: 160, discSize: 0.00005, overcast: 0, stars: 0 },
    envIntensity: 0.9,
    fog: { color: C(0.62, 0.36, 0.17), density: 0.00016 },
    exposure: 1.8,
    bloom: { intensity: 0.6, threshold: 0.95 },
    grade: { saturation: 1.08, lift: [0.008, 0.003, 0.0], gain: [1.02, 0.98, 0.92], contrast: 1.05 },
    vignette: 0.55,
    dof: { dead: 0.06, range: 0.8, bokeh: 1 },
    wet: 0, wind: 0.14, transl: 1.4, lamps: false,
  },
  overcast: {
    name: 'overcast', underground: false,
    sun: { elev: 52, azim: 150, color: C(0.85, 0.9, 1.0), intensity: 0.45, shadowSoft: 3.5 },
    sky: { zenith: C(0.36, 0.38, 0.42), horizon: C(0.46, 0.48, 0.52), ground: C(0.07, 0.07, 0.06), sunGlow: 0.15, sunDisc: 0, discSize: 0.00004, overcast: 1, stars: 0 },
    envIntensity: 0.85,
    fog: { color: C(0.36, 0.39, 0.43), density: 0.00018 },
    exposure: 1.6,
    bloom: { intensity: 0.45, threshold: 1.0 },
    grade: { saturation: 1.0, lift: [0.0, 0.003, 0.008], gain: [0.99, 1.0, 1.02], contrast: 1.06 },
    vignette: 0.5,
    dof: { dead: 0.06, range: 0.8, bokeh: 1 },
    wet: 1, wind: 0.04, transl: 0.6, lamps: false,
  },
  night: {
    name: 'night', underground: false,
    sun: { elev: 38, azim: 105, color: C(0.6, 0.72, 1.0), intensity: 0.5, shadowSoft: 1.5 },
    sky: { zenith: C(0.004, 0.007, 0.018), horizon: C(0.014, 0.018, 0.032), ground: C(0.004, 0.004, 0.004), sunGlow: 0.02, sunDisc: 0, discSize: 0.00004, overcast: 0, stars: 0.6 },
    envIntensity: 1.0,
    fog: { color: C(0.012, 0.015, 0.026), density: 0.00014 },
    exposure: 7.0,
    bloom: { intensity: 0.8, threshold: 1.2 },
    grade: { saturation: 0.7, lift: [0.0, 0.004, 0.012], gain: [0.92, 0.98, 1.1], contrast: 1.0 },
    vignette: 0.6,
    dof: { dead: 0.06, range: 0.8, bokeh: 1 },
    wet: 0.15, wind: 0.05, transl: 0.5, lamps: true,
  },
  underground: {
    name: 'underground', underground: true,
    sun: { elev: 58, azim: 128, color: C(1.0, 0.95, 0.88), intensity: 0, shadowSoft: 1 },
    sky: { zenith: C(0.11, 0.22, 0.55), horizon: C(0.42, 0.5, 0.62), ground: C(0.13, 0.12, 0.07), sunGlow: 0.6, sunDisc: 400, discSize: 0.00004, overcast: 0, stars: 0 },
    envIntensity: 1.0,
    fog: { color: C(0.03, 0.017, 0.008), density: 0.011 },
    exposure: 3.2,
    bloom: { intensity: 0.7, threshold: 0.8 },
    grade: { saturation: 0.95, lift: [0.006, 0.003, 0.0], gain: [1.04, 0.98, 0.9], contrast: 1.05 },
    vignette: 0.7,
    dof: { dead: 0.14, range: 1.4, bokeh: 0.7 },
    wet: 0.3, wind: 0, transl: 0, lamps: false,
  },
};

export function sunVector(elev: number, azim: number, camYaw: number) {
  const e = (elev * Math.PI) / 180, a = (azim * Math.PI) / 180 + camYaw;
  return new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}
