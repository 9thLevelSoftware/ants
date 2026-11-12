// Deterministic noise from integer hashing only (Math.imul, xor, shifts, + - * and Math.floor), so every
// JS engine produces bit-identical results. No Math.sin hashing, no lookup permutation tables.
//
// Output ranges (all tested):
//   hash2i / hash3i                 [0, 1)
//   valueNoise2 / valueNoise3       [-1, 1]
//   gradNoise2 / gradNoise3         [-1, 1] (clamped; typical |n| < 0.7, mean ~0)
//   fbm2 / fbm3                     [-1, 1] (sum of gradient octaves divided by the sum of amplitudes)
//   ridged2 / ridged3               [0, 1]  (1 on the ridges where the underlying noise crosses zero)
// Lattice spacing is 1 unit: scale coordinates by the desired frequency before calling.

/** 2^-32: maps a uint32 to [0, 1). */
const U32_TO_UNIT = 1 / 4294967296;
/** Gradient noise normalisation: theoretical max of the 2D/3D sums below is about 1/sqrt(2) and 1.0 respectively. */
const GRAD2_SCALE = Math.SQRT2;
const GRAD3_SCALE = 1;
/** Seed offsets so successive fbm octaves are decorrelated. */
const OCTAVE_SEED_STEP = 0x3c6ef372;

/** 32-bit integer finaliser ("lowbias32"): good avalanche, returns uint32. */
function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** uint32 hash of integer lattice coordinates (x, y) and seed. */
export function hash2u(x: number, y: number, seed = 0): number {
  return mix32(mix32(mix32(seed ^ 0x9e3779b9) ^ x) + Math.imul(y, 0x85ebca6b));
}

/** uint32 hash of integer lattice coordinates (x, y, z) and seed. */
export function hash3u(x: number, y: number, z: number, seed = 0): number {
  return mix32(hash2u(x, y, seed) ^ Math.imul(z, 0xc2b2ae35));
}

/** Hash of integer coordinates to a float in [0, 1). Non-integer inputs are truncated toward zero. */
export function hash2i(x: number, y: number, seed = 0): number {
  return hash2u(x | 0, y | 0, seed | 0) * U32_TO_UNIT;
}

export function hash3i(x: number, y: number, z: number, seed = 0): number {
  return hash3u(x | 0, y | 0, z | 0, seed | 0) * U32_TO_UNIT;
}

/** Quintic fade 6t^5 - 15t^4 + 10t^3 (C2 continuous noise). */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lattice value in [-1, 1). */
function lat2(x: number, y: number, seed: number): number {
  return hash2u(x, y, seed) * (2 * U32_TO_UNIT) - 1;
}
function lat3(x: number, y: number, z: number, seed: number): number {
  return hash3u(x, y, z, seed) * (2 * U32_TO_UNIT) - 1;
}

export function valueNoise2(x: number, y: number, seed = 0): number {
  const fx = Math.floor(x), fy = Math.floor(y);
  const ix = fx | 0, iy = fy | 0;
  const u = fade(x - fx), v = fade(y - fy);
  const a = lerp(lat2(ix, iy, seed), lat2(ix + 1, iy, seed), u);
  const b = lerp(lat2(ix, iy + 1, seed), lat2(ix + 1, iy + 1, seed), u);
  return lerp(a, b, v);
}

export function valueNoise3(x: number, y: number, z: number, seed = 0): number {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const ix = fx | 0, iy = fy | 0, iz = fz | 0;
  const u = fade(x - fx), v = fade(y - fy), w = fade(z - fz);
  const a0 = lerp(lat3(ix, iy, iz, seed), lat3(ix + 1, iy, iz, seed), u);
  const b0 = lerp(lat3(ix, iy + 1, iz, seed), lat3(ix + 1, iy + 1, iz, seed), u);
  const a1 = lerp(lat3(ix, iy, iz + 1, seed), lat3(ix + 1, iy, iz + 1, seed), u);
  const b1 = lerp(lat3(ix, iy + 1, iz + 1, seed), lat3(ix + 1, iy + 1, iz + 1, seed), u);
  return lerp(lerp(a0, b0, v), lerp(a1, b1, v), w);
}

/** Dot of one of 8 unit gradients (axes and diagonals) with (dx, dy). */
function grad2(h: number, dx: number, dy: number): number {
  switch (h & 7) {
    case 0: return dx;
    case 1: return -dx;
    case 2: return dy;
    case 3: return -dy;
    case 4: return (dx + dy) * Math.SQRT1_2;
    case 5: return (dx - dy) * Math.SQRT1_2;
    case 6: return (-dx + dy) * Math.SQRT1_2;
    default: return (-dx - dy) * Math.SQRT1_2;
  }
}

/** Dot of one of the 12 cube-edge gradients (Perlin's improved noise set; 4 repeated to fill 16). */
function grad3(h: number, dx: number, dy: number, dz: number): number {
  switch (h & 15) {
    case 0: case 12: return dx + dy;
    case 1: case 13: return -dx + dy;
    case 2: return dx - dy;
    case 3: return -dx - dy;
    case 4: return dx + dz;
    case 5: return -dx + dz;
    case 6: return dx - dz;
    case 7: return -dx - dz;
    case 8: return dy + dz;
    case 9: case 14: return -dy + dz;
    case 10: return dy - dz;
    default: return -dy - dz; // 11, 15
  }
}

function clampUnit(x: number): number {
  return x < -1 ? -1 : x > 1 ? 1 : x;
}

/** Gradient (Perlin-style) noise in 2D: 0 at every integer lattice point. */
export function gradNoise2(x: number, y: number, seed = 0): number {
  const fx = Math.floor(x), fy = Math.floor(y);
  const ix = fx | 0, iy = fy | 0;
  const dx = x - fx, dy = y - fy;
  const u = fade(dx), v = fade(dy);
  const n00 = grad2(hash2u(ix, iy, seed) >>> 29, dx, dy);
  const n10 = grad2(hash2u(ix + 1, iy, seed) >>> 29, dx - 1, dy);
  const n01 = grad2(hash2u(ix, iy + 1, seed) >>> 29, dx, dy - 1);
  const n11 = grad2(hash2u(ix + 1, iy + 1, seed) >>> 29, dx - 1, dy - 1);
  return clampUnit(lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * GRAD2_SCALE);
}

/** Gradient (Perlin-style) noise in 3D: 0 at every integer lattice point. */
export function gradNoise3(x: number, y: number, z: number, seed = 0): number {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const ix = fx | 0, iy = fy | 0, iz = fz | 0;
  const dx = x - fx, dy = y - fy, dz = z - fz;
  const u = fade(dx), v = fade(dy), w = fade(dz);
  const n000 = grad3(hash3u(ix, iy, iz, seed) >>> 28, dx, dy, dz);
  const n100 = grad3(hash3u(ix + 1, iy, iz, seed) >>> 28, dx - 1, dy, dz);
  const n010 = grad3(hash3u(ix, iy + 1, iz, seed) >>> 28, dx, dy - 1, dz);
  const n110 = grad3(hash3u(ix + 1, iy + 1, iz, seed) >>> 28, dx - 1, dy - 1, dz);
  const n001 = grad3(hash3u(ix, iy, iz + 1, seed) >>> 28, dx, dy, dz - 1);
  const n101 = grad3(hash3u(ix + 1, iy, iz + 1, seed) >>> 28, dx - 1, dy, dz - 1);
  const n011 = grad3(hash3u(ix, iy + 1, iz + 1, seed) >>> 28, dx, dy - 1, dz - 1);
  const n111 = grad3(hash3u(ix + 1, iy + 1, iz + 1, seed) >>> 28, dx - 1, dy - 1, dz - 1);
  const a = lerp(lerp(n000, n100, u), lerp(n010, n110, u), v);
  const b = lerp(lerp(n001, n101, u), lerp(n011, n111, u), v);
  return clampUnit(lerp(a, b, w) * GRAD3_SCALE);
}

/**
 * Fractal Brownian motion of gradient noise: octave i has frequency lacunarity^i and amplitude gain^i.
 * Normalised by the amplitude sum, so the result stays in [-1, 1] for any octave count.
 */
export function fbm2(x: number, y: number, seed = 0, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * gradNoise2(x * freq, y * freq, (seed + Math.imul(i, OCTAVE_SEED_STEP)) | 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

export function fbm3(x: number, y: number, z: number, seed = 0, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * gradNoise3(x * freq, y * freq, z * freq, (seed + Math.imul(i, OCTAVE_SEED_STEP)) | 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Ridged multifractal-style noise: sum of (1 - |n|)^2 per octave, normalised to [0, 1]. Sharp crests. */
export function ridged2(x: number, y: number, seed = 0, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let i = 0; i < octaves; i++) {
    const r = 1 - Math.abs(gradNoise2(x * freq, y * freq, (seed + Math.imul(i, OCTAVE_SEED_STEP)) | 0));
    sum += amp * r * r;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

export function ridged3(x: number, y: number, z: number, seed = 0, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let i = 0; i < octaves; i++) {
    const r = 1 - Math.abs(gradNoise3(x * freq, y * freq, z * freq, (seed + Math.imul(i, OCTAVE_SEED_STEP)) | 0));
    sum += amp * r * r;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}
