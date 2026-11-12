// Bridson Poisson-disk sampling in a rectangle (GDD 04 §4.2 step 4), deterministic for a given RNG stream.
// Candidate rings use a deterministic polar offset (dmath), and points are returned in generation order.

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { Point2, Rect } from '../layout/types';
import { dcos, dsin } from './dmath';

const TRIES = 30;
const TWO_PI = 6.283185307179586;

/**
 * Points at least `spacing` apart inside `r` for which `accept(x, z)` holds (eligible zone cells), at most
 * `maxPoints`. Seeded with up to 8 random eligible starts so disconnected eligible regions are covered.
 */
export function poissonDisk(rng: RngState, r: Rect, spacing: number, accept: (x: number, z: number) => boolean, maxPoints = 1e6): Point2[] {
  const cs = spacing / Math.SQRT2;
  const gw = Math.max(1, Math.ceil((r.x1 - r.x0) / cs)), gh = Math.max(1, Math.ceil((r.z1 - r.z0) / cs));
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: Point2[] = [];
  const active: number[] = [];
  const s2 = spacing * spacing;
  const fits = (x: number, z: number): boolean => {
    if (x < r.x0 || x >= r.x1 || z < r.z0 || z >= r.z1) return false;
    const gi = Math.floor((x - r.x0) / cs), gk = Math.floor((z - r.z0) / cs);
    for (let k = Math.max(0, gk - 2); k <= Math.min(gh - 1, gk + 2); k++)
      for (let i = Math.max(0, gi - 2); i <= Math.min(gw - 1, gi + 2); i++) {
        const j = grid[k * gw + i];
        if (j >= 0) { const dx = pts[j].x - x, dz = pts[j].z - z; if (dx * dx + dz * dz < s2) return false; }
      }
    return accept(x, z);
  };
  const add = (x: number, z: number) => {
    grid[Math.floor((z - r.z0) / cs) * gw + Math.floor((x - r.x0) / cs)] = pts.length;
    active.push(pts.length);
    pts.push({ x, z });
  };
  for (let s = 0; s < 8 && pts.length < maxPoints; s++) {
    for (let t = 0; t < TRIES; t++) {
      const x = r.x0 + rngFloat(rng) * (r.x1 - r.x0), z = r.z0 + rngFloat(rng) * (r.z1 - r.z0);
      if (fits(x, z)) { add(x, z); break; }
    }
    while (active.length > 0 && pts.length < maxPoints) {
      const ai = Math.floor(rngFloat(rng) * active.length);
      const p = pts[active[ai]];
      let placed = false;
      for (let t = 0; t < TRIES; t++) {
        const a = rngFloat(rng) * TWO_PI, d = spacing * (1 + rngFloat(rng));
        const x = p.x + d * dcos(a), z = p.z + d * dsin(a);
        if (fits(x, z)) { add(x, z); placed = true; break; }
      }
      if (!placed) { active[ai] = active[active.length - 1]; active.pop(); }
    }
  }
  return pts;
}
