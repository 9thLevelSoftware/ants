// Heights of the ground beyond the map edge (GDD 04 §14). Two surfaces live there:
//  - the terrain renderer's own continuation: it clamps its height lookup at the heightfield's border, so beyond the
//    edge the terrain carries on as an extruded ridge at the edge height ("the clamped plane", terrainPlaneAt);
//  - the skirt: the heightfield mirrored across the edge plus noise that grows outward, never below that plane.
// Pure maths on WorldData (no GPU objects).
import { fbm2 } from '@/core/math/noise';
import { terrainHeightAt } from '@/sim/entities/placement';
import type { HeightField, WorldData } from '@/sim/types';
import { SKIRT_LIFT_MAX_MM, SKIRT_LIFT_PER_MM, SKIRT_NOISE_SCALE_L, SKIRT_RELIEF_MAX_MM, SKIRT_RELIEF_SLOPE } from './tuning';

/** Reflects a coordinate into [0, size] (mirror at both edges, period 2 x size). */
export function reflectInto(v: number, size: number): number {
  const p = 2 * size;
  let m = v % p;
  if (m < 0) m += p;
  return m > size ? p - m : m;
}

/** Distance from (x, z) to the map square [0, size]², mm (0 inside). */
export function outsideDistance(x: number, z: number, size: number): number {
  const dx = x < 0 ? -x : x > size ? x - size : 0;
  const dz = z < 0 ? -z : z > size ? z - size : 0;
  return Math.hypot(dx, dz);
}

/** How far the skirt is lifted above the clamped plane at `d` mm outside the map (0 at the edge). */
export function skirtLift(d: number): number {
  return Math.min(SKIRT_LIFT_MAX_MM, Math.max(0, d) * SKIRT_LIFT_PER_MM);
}

/** The terrain renderer's height at any (x, z), the clamped continuation outside the heightfield included. */
export function terrainPlaneAt(hf: HeightField, x: number, z: number): number {
  return terrainHeightAt(hf, x, z); // clamps to the heightfield's border exactly like the terrain shader's wrH()
}

/**
 * Highest point of the terrain's clamped surface over the rectangle [x0, x1] x [z0, z1], mm. The surface is bilinear
 * per cell, so its maximum over a rectangle lies at a grid node inside it or where the rectangle's border crosses a
 * grid line (or at a corner): exactly those points are evaluated.
 */
export function terrainMaxInRect(hf: HeightField, x0: number, x1: number, z0: number, z1: number): number {
  const xs = gridCrossings(hf.cell, hf.nx, x0, x1), zs = gridCrossings(hf.cell, hf.nz, z0, z1);
  let m = -Infinity;
  for (const x of xs) for (const z of zs) m = Math.max(m, terrainHeightAt(hf, x, z));
  return m;
}

/** The range [a, b] clamped to the heightfield, with every grid line inside it. */
function gridCrossings(cell: number, n: number, a: number, b: number): number[] {
  const max = (n - 1) * cell;
  const lo = Math.min(max, Math.max(0, Math.min(a, b))), hi = Math.min(max, Math.max(0, Math.max(a, b)));
  const out = [lo];
  for (let k = Math.floor(lo / cell) + 1; k * cell < hi; k++) out.push(k * cell);
  if (hi > lo) out.push(hi);
  return out;
}

/**
 * True when the rectangle, clamped to the heightfield, lies inside a single terrain cell on both axes: there the
 * clamped plane is linear along any axis-parallel line, so a triangle whose vertices are on or above it covers it.
 */
export function withinOneCell(hf: HeightField, x0: number, x1: number, z0: number, z1: number): boolean {
  const one = (a: number, b: number, n: number) => {
    const max = (n - 1) * hf.cell, eps = 1e-6 * hf.cell;
    const lo = Math.min(max, Math.max(0, a)), hi = Math.min(max, Math.max(0, b));
    return Math.floor((lo + eps) / hf.cell) >= Math.ceil((hi - eps) / hf.cell) - 1;
  };
  return one(x0, x1, hf.nx) && one(z0, z1, hf.nz);
}

/** Height of the skirt's own surface at a point outside the map, mm (inside: the terrain itself). */
export function makeSkirtHeight(world: WorldData): (x: number, z: number) => number {
  const S = world.size, hf = world.terrain;
  const inv = 1 / (SKIRT_NOISE_SCALE_L * S), seed = world.params.seed | 0;
  return (x, z) => {
    const plane = terrainPlaneAt(hf, x, z);
    const d = outsideDistance(x, z, S);
    if (d <= 0) return plane;
    const mirrored = terrainHeightAt(hf, reflectInto(x, S), reflectInto(z, S));
    const n = 0.5 + 0.5 * fbm2(x * inv, z * inv, seed, 3);
    const relief = Math.min(SKIRT_RELIEF_MAX_MM, d * SKIRT_RELIEF_SLOPE) * Math.max(0, Math.min(1, n));
    return Math.max(plane, mirrored) + relief + skirtLift(d);
  };
}
