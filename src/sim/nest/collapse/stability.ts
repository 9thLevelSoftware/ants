// Unstable ceilings (GDD 03 §12): an open voxel is unsupported when 2 d_sup > S_max(ceiling material, moisture) +
// COLLAPSE_TOLERANCE, d_sup = its horizontal distance (BU) to the nearest solid voxel of its own layer (two-pass 3-4
// chamfer distance, close to Euclidean). Evaluated per chamber over the chamber's box; ceilings of non-diggable
// material or wood never collapse (S_max infinite). Pure: reads the carve grid and moisture only.

import type { Chamber, Sim } from '@/sim/types';
import { COLLAPSE_MIN_VOXELS, COLLAPSE_TOLERANCE_BU } from '@/sim/balance/weather';
import { OPEN_MIN } from '../carve/keys';
import { moistureAt, sMax } from '../substrate';

/** One unstable chamber region: samples (i, j, k interleaved) with their d_sup (BU), most unsupported first. */
export interface UnstableSet {
  chamberId: number;
  samples: number[];
  dsup: number[];
  /** Largest span 2 d_sup found and the limit, BU. */
  maxSpan: number;
  limit: number;
  /** Ceiling material and its S_max. */
  ceiling: string;
}

/** Ceiling of a chamber: the first non-open sample straight above its centre (sample j index, NaN none). */
export function ceilingSample(sim: Sim, c: Chamber): number {
  const v = sim.carve.voxel;
  const i = Math.round(c.center.x / v), k = Math.round(c.center.z / v);
  const top = Math.ceil((c.center.y + c.radii.y) / v) + 4;
  for (let j = Math.round(c.center.y / v); j <= top; j++) if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) return j;
  return Number.NaN;
}

/**
 * The span limit (BU) of a chamber's ceiling: S_max at the ceiling's material and moisture, x `smaxMult`
 * (disturbance 0.5), + tolerance; Infinity when it can never fall.
 */
export function spanLimit(sim: Sim, c: Chamber, smaxMult = 1): { limit: number; ceiling: string } {
  const v = sim.carve.voxel;
  const jc = ceilingSample(sim, c);
  if (Number.isNaN(jc)) return { limit: Infinity, ceiling: 'none' };
  const p = { x: Math.round(c.center.x / v) * v, y: jc * v, z: Math.round(c.center.z / v) * v };
  const mat = sim.field.materialAt(p);
  const s = sMax(mat, moistureAt(sim, p));
  return { limit: Number.isFinite(s) ? s * smaxMult + COLLAPSE_TOLERANCE_BU : Infinity, ceiling: mat };
}

type Found = { i: number; j: number; k: number; d: number };

/** Open samples of a chamber's region with 2 d_sup > limit, and the largest span seen (BU). */
function scan(sim: Sim, c: Chamber, limit: number): { found: Found[]; maxSpan: number } {
  const v = sim.carve.voxel, bu = sim.world.bu, pad = 2;
  const i0 = Math.floor((c.center.x - c.radii.x) / v) - pad, i1 = Math.ceil((c.center.x + c.radii.x) / v) + pad;
  const k0 = Math.floor((c.center.z - c.radii.z) / v) - pad, k1 = Math.ceil((c.center.z + c.radii.z) / v) + pad;
  const j0 = Math.floor((c.center.y - c.radii.y) / v), j1 = Math.ceil((c.center.y + c.radii.y) / v);
  const nx = i1 - i0 + 1, nz = k1 - k0 + 1;
  const dist = new Float32Array(nx * nz);
  const BIG = 1e9;
  const found: Found[] = [];
  let maxSpan = 0;
  for (let j = j0; j <= j1; j++) {
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) dist[k * nx + i] = sim.carve.sampleAt(i0 + i, j, k0 + k) >= OPEN_MIN ? BIG : 0;
    // forward and backward 3-4 chamfer passes
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const q = k * nx + i;
      if (dist[q] === 0) continue;
      let d = dist[q];
      if (i > 0) d = Math.min(d, dist[q - 1] + 3);
      if (k > 0) d = Math.min(d, dist[q - nx] + 3);
      if (i > 0 && k > 0) d = Math.min(d, dist[q - nx - 1] + 4);
      if (i < nx - 1 && k > 0) d = Math.min(d, dist[q - nx + 1] + 4);
      dist[q] = d;
    }
    for (let k = nz - 1; k >= 0; k--) for (let i = nx - 1; i >= 0; i--) {
      const q = k * nx + i;
      if (dist[q] === 0) continue;
      let d = dist[q];
      if (i < nx - 1) d = Math.min(d, dist[q + 1] + 3);
      if (k < nz - 1) d = Math.min(d, dist[q + nx] + 3);
      if (i < nx - 1 && k < nz - 1) d = Math.min(d, dist[q + nx + 1] + 4);
      if (i > 0 && k < nz - 1) d = Math.min(d, dist[q + nx - 1] + 4);
      dist[q] = d;
    }
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const raw = dist[k * nx + i];
      if (raw === 0 || raw >= BIG) continue;
      const x = (i0 + i) * v, y = j * v, z = (k0 + k) * v;
      const q = ((x - c.center.x) / (c.radii.x + v)) ** 2 + ((y - c.center.y) / (c.radii.y + v)) ** 2 + ((z - c.center.z) / (c.radii.z + v)) ** 2;
      if (q > 1) continue;
      // distance to the nearest solid sample centre, minus half a voxel to the solid's face
      const dBu = ((raw / 3) * v - v / 2) / bu;
      if (2 * dBu > maxSpan) maxSpan = 2 * dBu;
      if (2 * dBu > limit) found.push({ i: i0 + i, j, k: k0 + k, d: dBu });
    }
  }
  return { found, maxSpan };
}

/** Unstable voxels of a chamber (null when it is stable or too small to matter). */
export function unstableSet(sim: Sim, c: Chamber, smaxMult = 1): UnstableSet | null {
  const { limit, ceiling } = spanLimit(sim, c, smaxMult);
  if (!Number.isFinite(limit)) return null;
  const { found, maxSpan } = scan(sim, c, limit);
  if (found.length < COLLAPSE_MIN_VOXELS) return null;
  found.sort((a, b) => b.d - a.d || a.j - b.j || a.k - b.k || a.i - b.i);
  const samples: number[] = [], dsup: number[] = [];
  for (const f of found) { samples.push(f.i, f.j, f.k); dsup.push(f.d); }
  return { chamberId: c.id, samples, dsup, maxSpan, limit, ceiling };
}

/** Largest 2 d_sup (BU) of the open voxels inside a chamber's ellipsoid (tests, diagnostics). */
export function maxSpanOf(sim: Sim, c: Chamber): number {
  return scan(sim, c, Infinity).maxSpan;
}
