// Deterministic polynomial maths for values that are stored or decide placements (GDD 04 DET-4): no Math.sin,
// cos, exp, log, pow or atan2 there, only + - * /, sqrt and floor (IEEE exact in every engine).
// Local stand-in for the `core/math/dmath` module GDD 04 App. F 13 asks of core (reported as a need).

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const LN2 = 0.6931471805599453;

/** Reduces an angle to [-pi, pi]. */
function wrap(a: number): number {
  return a - TWO_PI * Math.floor((a + PI) / TWO_PI);
}

/** sin on [-pi/2, pi/2] by a degree-11 Taylor polynomial (error < 6e-8). */
function sinCore(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800))))));
}

export function dsin(a: number): number {
  let x = wrap(a);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  return sinCore(x);
}

export function dcos(a: number): number {
  return dsin(a + HALF_PI);
}

/** Natural logarithm for x > 0 (relative error < 1e-12): x = m 2^e, ln m by the atanh series. */
export function dlog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity; // the range reduction below would never end
  let e = 0;
  let m = x;
  while (m >= 2) { m *= 0.5; e++; }
  while (m < 1) { m *= 2; e--; }
  // m in [1, 2): ln m = 2 atanh((m - 1) / (m + 1))
  const t = (m - 1) / (m + 1), t2 = t * t;
  let term = t, sum = 0;
  for (let k = 1; k < 40; k += 2) {
    sum += term / k;
    term *= t2;
  }
  return 2 * sum + e * LN2;
}

export function dlog10(x: number): number {
  return dlog(x) / 2.302585092994046;
}

/** Degrees to radians. */
export function drad(deg: number): number {
  return (deg * PI) / 180;
}
