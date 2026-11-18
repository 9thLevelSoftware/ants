// Read side of the terrain delta tiles (WorldDelta.heightDeltas: footprints, children's sand play; written by
// environment/human/effects/terrain.ts and registered there as kernel height overlays). Modules that need "the ground
// as it is now, without the piles" or a cache key over the deltas read them here. Pure, no allocation.
//
// Layout: tiles of HEIGHT_TILE x HEIGHT_TILE terrain grid points, values in HEIGHT_UNIT_MM, tileIndex = tz * tilesX + tx
// with tilesX = ceil(nx / HEIGHT_TILE); grid point (i, k) of the terrain lies at world (i * cell, k * cell).

import type { Sim } from '@/sim/types';

export const HEIGHT_TILE = 32;
export const HEIGHT_UNIT_MM = 1 / 16;

/** The delta at terrain grid point (i, k), mm (0 where no tile is). */
function deltaAtPoint(sim: Sim, i: number, k: number): number {
  const deltas = sim.state.worldDelta.heightDeltas;
  const tilesX = Math.ceil(sim.world.terrain.nx / HEIGHT_TILE);
  const tileIndex = Math.floor(k / HEIGHT_TILE) * tilesX + Math.floor(i / HEIGHT_TILE);
  for (const t of deltas) {
    if (t.tileIndex !== tileIndex) continue;
    return t.data[(k % HEIGHT_TILE) * HEIGHT_TILE + (i % HEIGHT_TILE)] * HEIGHT_UNIT_MM;
  }
  return 0;
}

/**
 * The terrain delta at (x, z), mm, bilinear between grid points as the kernel's overlay adds it (negative = pressed
 * down). 0 when no human event has changed the ground there.
 */
export function groundDeltaAt(sim: Sim, x: number, z: number): number {
  if (sim.state.worldDelta.heightDeltas.length === 0) return 0;
  const hf = sim.world.terrain, fx = x / hf.cell, fz = z / hf.cell;
  const i = Math.floor(fx), k = Math.floor(fz);
  if (i < 0 || k < 0 || i + 1 >= hf.nx || k + 1 >= hf.nz) return 0;
  const tx = fx - i, tz = fz - k;
  const a = deltaAtPoint(sim, i, k), b = deltaAtPoint(sim, i + 1, k);
  const c = deltaAtPoint(sim, i, k + 1), e = deltaAtPoint(sim, i + 1, k + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + e) * tx * tz;
}

/**
 * Fingerprint of the delta grid points in the box [x0, x1] x [z0, z1] (plus one grid point around it): a weighted sum
 * that changes whenever a delta there changes; 0 where no tile is. For cache keys (deltas are edited in place).
 */
export function groundDeltaStamp(sim: Sim, x0: number, z0: number, x1: number, z1: number): number {
  const deltas = sim.state.worldDelta.heightDeltas;
  if (deltas.length === 0) return 0;
  const hf = sim.world.terrain, cell = hf.cell, T = HEIGHT_TILE, tilesX = Math.ceil(hf.nx / T);
  const i0 = Math.max(0, Math.floor(x0 / cell) - 1), i1 = Math.min(hf.nx - 1, Math.ceil(x1 / cell) + 1);
  const k0 = Math.max(0, Math.floor(z0 / cell) - 1), k1 = Math.min(hf.nz - 1, Math.ceil(z1 / cell) + 1);
  let f = 0;
  for (const t of deltas) {
    const tx = t.tileIndex % tilesX, tz = Math.floor(t.tileIndex / tilesX);
    const a0 = Math.max(i0, tx * T), a1 = Math.min(i1, tx * T + T - 1), b0 = Math.max(k0, tz * T), b1 = Math.min(k1, tz * T + T - 1);
    for (let k = b0; k <= b1; k++) for (let i = a0; i <= a1; i++) {
      const v = t.data[(k - tz * T) * T + (i - tx * T)];
      if (v !== 0) f += v * (1 + (((k * hf.nx + i) * 2654435761) % 1013));
    }
  }
  return f;
}
