// How strongly the temperature and moisture fills tint the ground, as plain functions. The stain fragment shader
// (groundShader.ts) evaluates the same formulas with the same constants (tuning.ts), so these are what the unit tests
// pin down: an overlay is information drawn on top of a visible world, not a wash.

import {
  FILL_ALPHA, MOISTURE_FILL_MAX, MOISTURE_STAIN_FULL, MOISTURE_STAIN_START, TEMP_STAIN_GAIN,
} from './tuning';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Moisture (0..1) -> opacity of the stain: 0 on dry ground (below the lowest contour band), MOISTURE_FILL_MAX when saturated. */
export function moistureStainAlpha(moisture: number): number {
  return MOISTURE_FILL_MAX * smoothstep(MOISTURE_STAIN_START, MOISTURE_STAIN_FULL, moisture);
}

/** Departure from the optimum as a fraction of the way to the end of the scale (0 at the optimum, 1 at the end). */
export function temperatureDeviation(v: number, mid: number): number {
  return v < mid ? (mid - v) / Math.max(mid, 1e-3) : (v - mid) / Math.max(1 - mid, 1e-3);
}

/** Share (0..1) of the way from the optimum to the end of the scale that the stain shows for a departure. */
export function temperatureAmp(v: number, mid: number): number {
  return 1 - Math.exp(-TEMP_STAIN_GAIN * Math.min(1, Math.max(0, temperatureDeviation(v, mid))));
}

/** Temperature field value v (0..1 of the scale) with the optimum at `mid` -> opacity of the stain. */
export function temperatureStainAlpha(v: number, mid: number): number {
  return FILL_ALPHA * temperatureAmp(v, mid);
}

/** The place on the legend ramp (0..1) whose colour the stain uses for field value v: the departure, amplified. */
export function temperatureStainT(v: number, mid: number): number {
  const amp = temperatureAmp(v, mid);
  return v < mid ? mid * (1 - amp) : mid + (1 - mid) * amp;
}
