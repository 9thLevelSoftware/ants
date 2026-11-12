// Small numeric helpers for the procedural generators (deterministic; no Math.random).
import { type Ring, type V3, add, cross, norm, scl } from './meshBuilder';

/** Deterministic PRNG for procedural detail (hair placement, jitter). Presentation only. */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const smooth = (x: number): number => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** Piecewise cubic (Catmull-Rom style tangents) through rows [s, v...]; returns the v columns at s. */
export function curve(rows: number[][], s: number): number[] {
  const n = rows.length; let i = 0;
  while (i < n - 2 && s > rows[i + 1]![0]!) i++;
  const r0 = rows[Math.max(i - 1, 0)]!, r1 = rows[i]!, r2 = rows[i + 1]!, r3 = rows[Math.min(i + 2, n - 1)]!;
  const h = r2[0]! - r1[0]!; const t = clamp((s - r1[0]!) / (h || 1), 0, 1);
  const out: number[] = [];
  for (let k = 1; k < r1.length; k++) {
    const m1 = (r2[k]! - r0[k]!) / ((r2[0]! - r0[0]!) || 1) * h, m2 = (r3[k]! - r1[k]!) / ((r3[0]! - r1[0]!) || 1) * h;
    const t2 = t * t, t3 = t2 * t;
    out.push((2 * t3 - 3 * t2 + 1) * r1[k]! + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * r2[k]! + (t3 - t2) * m2);
  }
  return out;
}

/** Point and outward normal on a loft section (same formula as MeshBuilder.loft). */
export function ringPoint(r: Ring, th: number, lat: V3): { p: V3; n: V3 } {
  const up = norm(cross(r.t, lat)), l2 = norm(cross(up, r.t)), e = r.e ?? 2;
  const c = Math.cos(th), s = Math.sin(th);
  const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / e), sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / e);
  const b = sy < 0 ? r.b * (r.lower ?? 1) : r.b;
  return {
    p: add(r.c, add(scl(l2, r.a * sx), scl(up, b * sy))),
    n: norm(add(scl(l2, c / Math.max(r.a, 1e-6)), scl(up, s / Math.max(b, 1e-6)))),
  };
}

/** Cheap deterministic 3D value noise in [0, 1] (item surface detail). */
export function vnoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t); const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    r += hash3(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
  }
  return r;
}

/** Integer hash in [0, 1) (no trigonometry, identical on every platform). */
export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
