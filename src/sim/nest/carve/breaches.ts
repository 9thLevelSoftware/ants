// Breach detection and records. Records are spheres where carved space crosses the substrate surface
// (entrances, holes under slab edges); renderers discard terrain/diggable-object fragments inside them so holes
// open visibly. They are stored in CarveData.breaches (persisted). The authoritative "is this terrain point
// open" test is the field itself (WorldField.isHoleAt); the spheres are the compact record.
//
// Field-based detection (when the kernel supplies a HoleProbe): a brush breaches exactly when it turns sample
// columns (i v, k v) into terrain holes. The hole test of such a column reads the carve grid only at its probe
// height, i.e. only the two samples of that column bracketing it, so the columns a brush can change are known
// before it writes. On flat ground the field's hole mask is the bilinear blend of these column values within a
// cell, so any new hole anywhere also shows at a sample column.

import type { Breach } from '@/sim/types/geom';
import type { BrushShape } from './brushes';
import type { CarveStore, HoleProbe } from './grid';
import { CARVE_TUNING } from './params';

/**
 * Sample columns in [i0, i1] x [k0, k1] whose hole state the brush may change (it would raise one of the two
 * samples bracketing the probe height), appended to out as (i, k, hole before ? 1 : 0) triples.
 */
export function holeCandidates(grid: CarveStore, shape: BrushShape, hole: HoleProbe,
  i0: number, i1: number, j0: number, j1: number, k0: number, k1: number, out: number[]): void {
  const v = grid.voxel;
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const x = i * v, z = k * v;
    const j = Math.floor(hole.probeY(x, z) / v);
    if (j + 1 < j0 || j > j1) continue;
    if (!raises(grid, shape, i, j, k) && !raises(grid, shape, i, j + 1, k)) continue;
    out.push(i, k, hole.isHole(x, z) ? 1 : 0);
  }
}

/** Would a carve with this shape raise sample (i, j, k)? (canDig ignored: a refused sample changes nothing.) */
function raises(grid: CarveStore, shape: BrushShape, i: number, j: number, k: number): boolean {
  const v = grid.voxel;
  let b = 0.5 - shape.sdf(i * v, j * v, k * v) / grid.ramp;
  b = b < 0 ? 0 : b > 1 ? 1 : b;
  return Math.round(b * 255) > grid.sampleAt(i, j, k);
}

/**
 * Adds a breach unless an existing record at least as large lies within dedupeFraction * r of it.
 * Skipping only SHRINKS the discarded region (the union stays inside the carved cavity), so it is always safe.
 * Returns true if a record was added.
 */
export function recordBreach(list: Breach[], x: number, y: number, z: number, r: number): boolean {
  const lim = CARVE_TUNING.breachDedupeFraction * r;
  for (const b of list) {
    if (b.r < r - 1e-6) continue;
    const dx = b.pos.x - x, dy = b.pos.y - y, dz = b.pos.z - z;
    if (dx * dx + dy * dy + dz * dz < lim * lim) return false;
  }
  list.push({ pos: { x, y, z }, r });
  return true;
}

/** Removes records whose centre is no longer open (after a fill). Returns how many were removed. */
export function pruneBreaches(list: Breach[], openness: (x: number, y: number, z: number) => number): number {
  let removed = 0;
  for (let n = list.length - 1; n >= 0; n--) {
    const p = list[n].pos;
    if (openness(p.x, p.y, p.z) < 0.5) {
      list.splice(n, 1);
      removed++;
    }
  }
  return removed;
}
