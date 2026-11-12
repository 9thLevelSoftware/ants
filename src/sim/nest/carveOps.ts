// Everything the nest module carves or fills goes through here: the kernel brush (species dig predicate), then
// the follow-ups every change needs (GDD 03 §1.2, docs/research/spike-nest.md §5 item 5): `carve-chunks-dirty`,
// re-projection of the walkers nearby (walkerSurfaceChanged), entrances from breaches, entrance states.

import type { Vec3 } from '@/core/math/vec3';
import type { BrushOptions, BrushResult, Sim, Walker } from '@/sim/types';
import { SURFACE_REFRESH_PAD_BU } from '@/sim/balance/nest';
import { walkerSurfaceChanged } from '@/sim/locomotion/walker';
import type { VoxelBox } from './carve/keys';
import { onCarveChanged } from './entrances';

/** Re-projects walkers within `radius` of `c` after the field changed there (walkers in the air are left alone). */
export function refreshWalkers(sim: Sim, c: Vec3, radius: number): void {
  const r2 = radius * radius;
  const visit = (w: Walker): void => {
    if (w.medium === 'air') return;
    const dx = w.pos.x - c.x, dy = w.pos.y - c.y, dz = w.pos.z - c.z;
    if (dx * dx + dy * dy + dz * dz <= r2) walkerSurfaceChanged(sim.field, w, sim.kernel.walker);
  };
  for (const a of sim.stores.ants.list) if (a.alive) visit(a);
  for (const cr of sim.stores.creatures.list) if (cr.alive) visit(cr);
}

/** Follow-ups of one brush result centred near `c` with reach `reach` (mm). */
export function afterBrush(sim: Sim, res: BrushResult, c: Vec3, reach: number): void {
  if (res.changed === 0) return;
  sim.emit({ type: 'carve-chunks-dirty', keys: res.dirty });
  refreshWalkers(sim, c, reach + SURFACE_REFRESH_PAD_BU * sim.world.bu);
  onCarveChanged(sim, res.box, res.breach);
}

export function carveSphere(sim: Sim, c: Vec3, r: number, opts?: BrushOptions): BrushResult {
  const res = sim.kernel.carveSphere(c, r, opts);
  afterBrush(sim, res, c, r);
  return res;
}

export function carveCapsule(sim: Sim, a: Vec3, b: Vec3, r: number, opts?: BrushOptions): BrushResult {
  const res = sim.kernel.carveCapsule(a, b, r, opts);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  afterBrush(sim, res, mid, r + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 2);
  return res;
}

export function carveEllipsoid(sim: Sim, c: Vec3, radii: Vec3, opts?: BrushOptions): BrushResult {
  const res = sim.kernel.carveEllipsoid(c, radii, opts);
  afterBrush(sim, res, c, Math.max(radii.x, radii.y, radii.z));
  return res;
}

export function fillSphere(sim: Sim, c: Vec3, r: number): BrushResult {
  const res = sim.kernel.fillSphere(c, r);
  afterBrush(sim, res, c, r);
  return res;
}

/** Sample box of a sphere (inclusive, padded by `pad` samples). */
export function sphereBox(sim: Sim, c: Vec3, r: number, pad: number): VoxelBox {
  const v = sim.carve.voxel;
  return {
    i0: Math.floor((c.x - r) / v) - pad, j0: Math.floor((c.y - r) / v) - pad, k0: Math.floor((c.z - r) / v) - pad,
    i1: Math.ceil((c.x + r) / v) + pad, j1: Math.ceil((c.y + r) / v) + pad, k1: Math.ceil((c.z + r) / v) + pad,
  };
}

/** Openness bytes of a sample box, x fastest (for before / after comparisons). */
export function readBox(sim: Sim, b: VoxelBox): Uint8Array {
  const nx = b.i1 - b.i0 + 1, ny = b.j1 - b.j0 + 1, nz = b.k1 - b.k0 + 1;
  const out = new Uint8Array(nx * ny * nz);
  let n = 0;
  for (let k = b.k0; k <= b.k1; k++) for (let j = b.j0; j <= b.j1; j++) for (let i = b.i0; i <= b.i1; i++) out[n++] = sim.carve.sampleAt(i, j, k);
  return out;
}

/** Calls fn for every sample of the box whose byte differs from `before` (from readBox on the same box). */
export function forChangedSamples(sim: Sim, b: VoxelBox, before: Uint8Array,
  fn: (i: number, j: number, k: number, old: number, now: number) => void): void {
  let n = 0;
  for (let k = b.k0; k <= b.k1; k++) for (let j = b.j0; j <= b.j1; j++) for (let i = b.i0; i <= b.i1; i++) {
    const old = before[n++], now = sim.carve.sampleAt(i, j, k);
    if (old !== now) fn(i, j, k, old, now);
  }
}
