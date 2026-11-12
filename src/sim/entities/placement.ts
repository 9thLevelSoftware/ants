// Ground sampling for placing entities on the static terrain (no carve grid, no primitives).

import type { Vec3 } from '@/core/math/vec3';
import type { HeightField, WorldData } from '@/sim/types';

/** Bilinear terrain height at (x, z), mm; clamped at the heightfield edges. */
export function terrainHeightAt(hf: HeightField, x: number, z: number): number {
  const fx = Math.min(Math.max(x / hf.cell, 0), hf.nx - 1);
  const fz = Math.min(Math.max(z / hf.cell, 0), hf.nz - 1);
  const ix = Math.min(Math.floor(fx), hf.nx - 2);
  const iz = Math.min(Math.floor(fz), hf.nz - 2);
  if (ix < 0 || iz < 0) return hf.data[0] ?? 0;
  const tx = fx - ix, tz = fz - iz;
  const i = iz * hf.nx + ix;
  const h00 = hf.data[i], h10 = hf.data[i + 1], h01 = hf.data[i + hf.nx], h11 = hf.data[i + hf.nx + 1];
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

/** Point on the terrain under (x, z), written into out. */
export function groundPoint(world: WorldData, x: number, z: number, out: Vec3): Vec3 {
  out.x = x;
  out.y = terrainHeightAt(world.terrain, x, z);
  out.z = z;
  return out;
}
