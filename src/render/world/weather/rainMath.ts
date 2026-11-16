// The numeric rules of a rain streak on screen, in plain TypeScript. The vertex shader (rainField.ts) evaluates the
// same formulas per drop; this file is the readable statement of them and what the unit tests check. A streak is a
// camera-facing quad: its WORLD width and length are the drop's, but what the player sees is the projected size, so
// the world size is clamped by the size of one pixel at the drop's depth. That keeps a drop that is a few millimetres
// from the lens from growing into a column that covers the picture (review finding at ant height).
import { RAIN_FADE_FAR_BU, RAIN_FADE_NEAR_BU, RAIN_MAX_LEN_FRAC, RAIN_MAX_WIDTH_FRAC, RAIN_MIN_WIDTH_PX } from './tuning';

export interface RainView {
  /** Drawing-buffer size, px. */
  widthPx: number;
  heightPx: number;
  /** projectionMatrix[1][1] = 1 / tan(fovY / 2). */
  focal: number;
}

/** World size (mm) of one screen pixel at view depth `depthMm`. */
export function pixelMm(depthMm: number, v: RainView): number {
  return (depthMm * 2) / (v.heightPx * v.focal);
}

/** Largest projected streak width, px (a fraction of the screen width, never below one pixel). */
export function maxWidthPx(v: RainView): number {
  return Math.max(RAIN_MIN_WIDTH_PX, RAIN_MAX_WIDTH_FRAC * v.widthPx);
}

/** The drop's world width (mm) clamped so that it projects to between RAIN_MIN_WIDTH_PX and maxWidthPx(). */
export function streakWidthMm(dropWidthMm: number, depthMm: number, v: RainView): number {
  const px = pixelMm(depthMm, v);
  return Math.min(maxWidthPx(v) * px, Math.max(RAIN_MIN_WIDTH_PX * px, dropWidthMm));
}

/** The streak's world length (mm) clamped to RAIN_MAX_LEN_FRAC of the screen height. */
export function streakLengthMm(dropLengthMm: number, depthMm: number, v: RainView): number {
  return Math.min(dropLengthMm, RAIN_MAX_LEN_FRAC * v.heightPx * pixelMm(depthMm, v));
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Opacity factor by view depth: nothing at the lens, full from the near band, thinning into the haze far away. */
export function depthFade(depthMm: number, bu: number): number {
  return smooth(RAIN_FADE_NEAR_BU[0] * bu, RAIN_FADE_NEAR_BU[1] * bu, depthMm) * (1 - smooth(RAIN_FADE_FAR_BU[0] * bu, RAIN_FADE_FAR_BU[1] * bu, depthMm));
}

/** Projected width of the clamped streak in px (what the tests bound). */
export function projectedWidthPx(dropWidthMm: number, depthMm: number, v: RainView): number {
  return streakWidthMm(dropWidthMm, depthMm, v) / pixelMm(depthMm, v);
}
