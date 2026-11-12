// Scalar helpers. Pure, allocation-free. Angles are radians.

export const TAU = Math.PI * 2;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse of lerp: where x lies between a and b (unclamped). Returns 0 when a === b. */
export function invLerp(a: number, b: number, x: number): number {
  const d = b - a;
  return d === 0 ? 0 : (x - a) / d;
}

/** Maps x from [inLo, inHi] to [outLo, outHi] (unclamped). */
export function remap(x: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  return outLo + (outHi - outLo) * invLerp(inLo, inHi, x);
}

/** Hermite smoothstep: 0 at e0, 1 at e1, clamped outside. Works with e0 > e1 (reversed ramp). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01(invLerp(e0, e1, x));
  return t * t * (3 - 2 * t);
}

/** Moves current towards target by at most maxDelta (>= 0) without overshooting. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return current + maxDelta >= target ? target : current + maxDelta;
  return current - maxDelta <= target ? target : current - maxDelta;
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % TAU; // (-TAU, TAU)
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
}

/** Shortest signed rotation from angle `from` to angle `to`, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** Sign that maps 0 (and -0) to 0. NaN maps to 0 as well. */
export function sign0(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}
