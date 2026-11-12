// Breach records: spheres where carved space crosses the substrate surface (entrances, holes under slab edges).
// Renderers discard terrain/diggable-object fragments inside them so holes open visibly. They are stored in
// CarveData.breaches (persisted). The authoritative "is this terrain point open" test is the field itself
// (WorldField.isHoleAt); the spheres are the compact record.

import type { Breach } from '@/sim/types/geom';
import { CARVE_TUNING } from './params';

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
