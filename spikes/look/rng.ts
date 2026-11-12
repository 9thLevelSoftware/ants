/** Seeded RNG + value noise (spike-local copy; production uses src/core rng). */
export function mulberry32(a: number): () => number {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash2(x: number, y: number, seed = 7): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 977)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function hash3(x: number, y: number, z: number, seed = 7): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683) + Math.imul(seed, 977)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = (t: number) => t * t * (3 - 2 * t);
export function vnoise(x: number, y: number, seed = 7): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function vnoise3(x: number, y: number, z: number, seed = 7): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k, seed);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), xf), l(h(0, 1, 0), h(1, 1, 0), xf), yf), l(l(h(0, 0, 1), h(1, 0, 1), xf), l(h(0, 1, 1), h(1, 1, 1), xf), yf), zf);
}
export function fbm(x: number, y: number, oct = 5, seed = 7): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 31); n += a; f *= 2.03; a *= 0.5; }
  return s / n;
}
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** GLSL helpers shared by the shader patches. */
export const GLSL_NOISE = /* glsl */`
float lkHash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lkNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(lkHash12(i), lkHash12(i+vec2(1,0)), f.x), mix(lkHash12(i+vec2(0,1)), lkHash12(i+vec2(1,1)), f.x), f.y); }
float lkFbm(vec2 p){ return 0.5*lkNoise(p) + 0.3*lkNoise(p*2.07+7.1) + 0.2*lkNoise(p*4.13+3.3); }
`;
