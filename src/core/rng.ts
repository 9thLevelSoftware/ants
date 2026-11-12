// Seeded pseudo-random numbers: xoshiro128** with splitmix32 seeding.
//
// The generator state is a plain array of four uint32 numbers (`RngState`), so it lives inside SimState and
// survives JSON / structured clone / serialize.ts unchanged. Every function mutates the state it is given;
// there is no hidden global generator. Never use Math.random in sim/worldgen code.

/** xoshiro128** state: exactly four uint32 values, never all zero. */
export type RngState = number[];

/** 2^-32: maps a uint32 to [0, 1). */
const U32_TO_UNIT = 1 / 4294967296;
const TWO_POW_32 = 4294967296;

/** splitmix32 step: returns the next seed-sequence value (uint32) from an int32 counter `x`. */
function splitmix32(x: number): number {
  let z = x | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** 32-bit FNV-1a hash of a string's UTF-16 code units, with a final avalanche. Stable across engines. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return splitmix32(h);
}

/**
 * New generator state from a numeric seed. Any finite number works: integers up to 2^53 are used in full
 * (low and high 32-bit words), fractions are truncated. Equal seeds give equal streams.
 */
export function rngSeed(seed: number): RngState {
  const s: RngState = [0, 0, 0, 0];
  rngReseed(s, seed);
  return s;
}

/** Re-seeds an existing state in place (same result as rngSeed). */
export function rngReseed(s: RngState, seed: number): RngState {
  const t = Math.trunc(Number.isFinite(seed) ? seed : 0);
  const lo = t >>> 0;
  const hi = Math.floor(t / TWO_POW_32) >>> 0;
  let x = (lo ^ Math.imul(hi, 0x9e3779b9)) | 0;
  for (let i = 0; i < 4; i++) {
    x = (x + 0x9e3779b9) | 0;
    s[i] = splitmix32(x);
  }
  if ((s[0] | s[1] | s[2] | s[3]) === 0) s[0] = 1; // the all-zero state is a fixed point
  return s;
}

/** Independent named stream: same (seed, name) -> same stream; different names are decorrelated. */
export function rngFork(seed: number, streamName: string): RngState {
  const s = rngSeed(seed);
  const h = hashString(streamName);
  // Mix the name hash into every word, then re-whiten through splitmix so nearby names diverge fully.
  for (let i = 0; i < 4; i++) s[i] = splitmix32((s[i] ^ Math.imul(h, i * 2 + 1)) + i);
  if ((s[0] | s[1] | s[2] | s[3]) === 0) s[0] = 1;
  return s;
}

/** Copies a state (e.g. to replay a stream without consuming the original). */
export function rngClone(s: RngState): RngState {
  return [s[0], s[1], s[2], s[3]];
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** Next uint32 in [0, 2^32). */
export function rngNext(s: RngState): number {
  const s0 = s[0] | 0, s1 = s[1] | 0, s2 = s[2] | 0, s3 = s[3] | 0;
  const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = s1 << 9;
  let n2 = s2 ^ s0;
  let n3 = s3 ^ s1;
  const n1 = s1 ^ n2;
  const n0 = s0 ^ n3;
  n2 ^= t;
  n3 = rotl(n3, 11);
  s[0] = n0 >>> 0;
  s[1] = n1 >>> 0;
  s[2] = n2 >>> 0;
  s[3] = n3 >>> 0;
  return result;
}

/** Uniform float in [0, 1) with 32 bits of resolution. */
export function rngFloat(s: RngState): number {
  return rngNext(s) * U32_TO_UNIT;
}

/** Uniform float in [lo, hi). */
export function rngRange(s: RngState, lo: number, hi: number): number {
  return lo + (hi - lo) * rngFloat(s);
}

/**
 * Uniform integer in [lo, hi] (both inclusive), without modulo bias (rejection sampling).
 * Bounds are truncated to integers; requires hi >= lo and hi - lo < 2^32.
 */
export function rngInt(s: RngState, lo: number, hi: number): number {
  const a = Math.trunc(lo), b = Math.trunc(hi);
  const range = b - a + 1;
  if (!(range >= 1) || range > TWO_POW_32) throw new RangeError(`rngInt: invalid bounds [${lo}, ${hi}]`);
  if (range === TWO_POW_32) return a + rngNext(s);
  const limit = TWO_POW_32 - (TWO_POW_32 % range); // largest multiple of range <= 2^32
  let x = rngNext(s);
  while (x >= limit) x = rngNext(s);
  return a + (x % range);
}

/** Uniformly chosen element. Throws on an empty array. */
export function rngPick<T>(s: RngState, arr: readonly T[]): T {
  if (arr.length === 0) throw new RangeError('rngPick: empty array');
  return arr[rngInt(s, 0, arr.length - 1)];
}

/** True with probability p (p <= 0 never, p >= 1 always). */
export function rngChance(s: RngState, p: number): boolean {
  return rngFloat(s) < p;
}

/**
 * Normally distributed value (Marsaglia polar method). Consumes an even, variable number of draws; the second
 * variate is discarded so the state stays four plain numbers. Uses Math.log/Math.sqrt.
 */
export function rngGauss(s: RngState, mean = 0, stdDev = 1): number {
  let u: number, v: number, q: number;
  do {
    u = rngFloat(s) * 2 - 1;
    v = rngFloat(s) * 2 - 1;
    q = u * u + v * v;
  } while (q >= 1 || q === 0);
  return mean + stdDev * u * Math.sqrt((-2 * Math.log(q)) / q);
}

/** In-place Fisher-Yates shuffle; returns the same array. */
export function rngShuffle<T>(s: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rngInt(s, 0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
