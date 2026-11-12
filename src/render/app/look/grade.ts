// Colour grade (GDD 08 11.2 / 11.4): saturation and per-channel gain from the world lighting, applied to the linear
// HDR image before tone mapping on both render paths (post chain: GradeEffect; no post: DirectGrade). Pure: no three.
//
// The lighting model computes the grade per sun elevation and weather (frost desaturates 30 %, night is cool and
// desaturated, golden hour warm and slightly richer). Underground the nest look is its own calibrated warm light, so
// the grade fades to neutral with the underground blend (decision, render-integration).

/** Saturation (1 = unchanged) and linear per-channel gain. */
export interface GradeParams {
  saturation: number;
  gain: [number, number, number];
}

/** Where the grade comes from (structurally: the world renderer's LightingState). */
export interface GradeSource {
  saturation: number;
  gain: readonly [number, number, number] | readonly number[];
}

/** Easing time constant of grade changes (a weather change to frost eases over a few seconds), real s. */
export const GRADE_EASE_S = 2;
/** Below this difference from neutral on every term the direct path skips its extra pass. */
export const GRADE_NEUTRAL_EPS = 0.004;
/** Saturation and gain are clamped to these ranges (a broken input never blows the image out). */
export const GRADE_SAT_RANGE: readonly [number, number] = [0, 2];
export const GRADE_GAIN_RANGE: readonly [number, number] = [0.25, 4];

export function neutralGrade(): GradeParams {
  return { saturation: 1, gain: [1, 1, 1] };
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 1);

/** The grade for a lighting state, blended to neutral by the underground factor `under` (0 surface .. 1 below). */
export function gradeTarget(src: GradeSource, under: number, out: GradeParams = neutralGrade()): GradeParams {
  const k = 1 - clamp(under, 0, 1);
  out.saturation = clamp(1 + (src.saturation - 1) * k, GRADE_SAT_RANGE[0], GRADE_SAT_RANGE[1]);
  for (let i = 0; i < 3; i++) out.gain[i] = clamp(1 + ((src.gain[i] ?? 1) - 1) * k, GRADE_GAIN_RANGE[0], GRADE_GAIN_RANGE[1]);
  return out;
}

/** Eases `cur` toward `target` over `dt` real seconds; dt <= 0 (a settle frame) snaps. Returns `cur`. */
export function easeGrade(cur: GradeParams, target: GradeParams, dt: number, tau = GRADE_EASE_S): GradeParams {
  const k = !(dt > 0) || tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
  cur.saturation += (target.saturation - cur.saturation) * k;
  for (let i = 0; i < 3; i++) cur.gain[i] += (target.gain[i] - cur.gain[i]) * k;
  return cur;
}

export function isNeutralGrade(g: GradeParams, eps = GRADE_NEUTRAL_EPS): boolean {
  return Math.abs(g.saturation - 1) < eps && Math.abs(g.gain[0] - 1) < eps && Math.abs(g.gain[1] - 1) < eps && Math.abs(g.gain[2] - 1) < eps;
}

/** Reference implementation of the shader's grade on one linear colour (tests; the GLSL below mirrors it). */
export function applyGrade(rgb: readonly [number, number, number], g: GradeParams): [number, number, number] {
  const r = rgb[0] * g.gain[0], gg = rgb[1] * g.gain[1], b = rgb[2] * g.gain[2];
  const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  const s = g.saturation;
  return [Math.max(0, l + (r - l) * s), Math.max(0, l + (gg - l) * s), Math.max(0, l + (b - l) * s)];
}

/** GLSL of the grade (linear HDR in, linear HDR out): gain, then saturation around Rec. 709 luminance. */
export const GRADE_GLSL = /* glsl */ `
vec3 lookGrade(vec3 c, float sat, vec3 gain) {
  c *= gain;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return max(vec3(l) + (c - vec3(l)) * sat, vec3(0.0));
}
`;
