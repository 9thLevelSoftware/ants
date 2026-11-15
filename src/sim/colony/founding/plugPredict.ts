// Where one `seal-entrance` would put its plug if the queen stood at a given pose: the same geometry as the nest
// module's plug (src/sim/nest/entrances.ts sealEntranceImpl, GDD 03 §4.2): a sphere of PLUG_RADIUS centred
// PLUG_AHEAD ahead of the head toward the opening, re-centred on the open throat samples around that point (samples
// near an ant excluded), its radius kept PLUG_ANT_CLEAR from every ant. Mirrored, not imported: the nest exports
// only the effect. If the nest's rule changes, the guide still works (it re-plans after every plug), only less well.

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, Sim } from '@/sim/types';
import { PLUG_AHEAD_BU, PLUG_ANT_CLEAR_BU, PLUG_RADIUS_BU } from '@/sim/balance/nest';
import { isOpenSample, type Sphere } from './leak';

/** The head is half a body length ahead of the body centre (as the nest's headOf). */
const HEAD_FRAC = 0.5;
/** The re-centring search radius, x PLUG_RADIUS (the nest's `search = 1.5 * R`). */
const SEARCH_FRAC = 1.5;
/** Samples nearer an ant than clear + R x this are not re-centred on (the nest's `R * 0.5`). */
const NEAR_FRAC = 0.5;

/**
 * The plug sphere for a queen of body length `lengthMm` at `pos` facing `fwd` (unit), with the other ants at
 * `others`; null when the nest would place none (no open sample there, or no room beside the ants).
 */
export function predictPlug(sim: Sim, e: Entrance, pos: Vec3, fwd: Vec3, lengthMm: number, others: readonly Vec3[]): Sphere | null {
  const bu = sim.world.bu, v = sim.carve.voxel;
  const d = HEAD_FRAC * lengthMm;
  const hx = pos.x + fwd.x * d, hy = pos.y + fwd.y * d, hz = pos.z + fwd.z * d;
  const tx = e.pos.x - hx, ty = e.pos.y - hy, tz = e.pos.z - hz, tl = Math.hypot(tx, ty, tz) || 1;
  const ahead = Math.min(PLUG_AHEAD_BU * bu, tl);
  const nx = hx + (tx / tl) * ahead, ny = hy + (ty / tl) * ahead, nz = hz + (tz / tl) * ahead;
  const clear = PLUG_ANT_CLEAR_BU * bu, R = PLUG_RADIUS_BU * bu, search = SEARCH_FRAC * R;
  const ants: Vec3[] = [pos];
  for (const o of others) if (Math.hypot(o.x - nx, o.y - ny, o.z - nz) < search + 2 * R + clear) ants.push(o);
  const nearAnt = (x: number, y: number, z: number): number => {
    let best = Infinity;
    for (const q of ants) best = Math.min(best, Math.hypot(q.x - x, q.y - y, q.z - z));
    return best;
  };
  let sx = 0, sy = 0, sz = 0, n = 0;
  const i0 = Math.floor((nx - search) / v), i1 = Math.ceil((nx + search) / v);
  const j0 = Math.floor((ny - search) / v), j1 = Math.ceil((ny + search) / v);
  const k0 = Math.floor((nz - search) / v), k1 = Math.ceil((nz + search) / v);
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * v, y = j * v, z = k * v;
    if ((x - nx) ** 2 + (y - ny) ** 2 + (z - nz) ** 2 > search * search) continue;
    if (!isOpenSample(sim, i, j, k) || nearAnt(x, y, z) < clear + R * NEAR_FRAC) continue;
    sx += x; sy += y; sz += z; n++;
  }
  if (n === 0) return null;
  const c = { x: sx / n, y: sy / n, z: sz / n };
  const r = Math.min(R, nearAnt(c.x, c.y, c.z) - clear);
  return r < v ? null : { c, r };
}
