// The visual skirt around the map (GDD 04 §14): a low-detail ring of ground 0.5 L wide beyond every edge, its relief
// extrapolated from the map by mirroring the heightfield across the edge plus noise that grows outward, its colour
// from the zone it mirrors. Builds plain arrays only (no GPU objects): the renderer turns them into one mesh.
//
// The terrain renderer clamps its heights at the map edge, so beyond the edge it continues as a flat plane at the
// edge height. The skirt never dips below that plane (max of the two) and is lifted slightly outward, so it always
// covers it; at the edge itself both meet at the same height.
import { Color } from 'three';
import { fbm2 } from '@/core/math/noise';
import type { WorldData } from '@/sim/types';
import { terrainHeightAt } from '@/sim/entities/placement';
import { zoneTypeAt } from '../lighting/simAdapter';
import {
  SKIRT_EDGE_SEGMENTS, SKIRT_FAR_HEX, SKIRT_FAR_MIX, SKIRT_FIRST_ROW_BU, SKIRT_LIFT_MAX_MM, SKIRT_NOISE_SCALE_L, SKIRT_RELIEF_MAX_MM,
  SKIRT_RELIEF_SLOPE, SKIRT_ROW_GROWTH, SKIRT_WIDTH_L, SKIRT_ZONE_HEX,
} from './tuning';

export interface SkirtArrays {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB. */
  colors: Float32Array;
  index: Uint32Array;
  /** Skirt width beyond each edge, mm. */
  width: number;
}

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

/** Height of the skirt at a point outside the map, mm (inside: the terrain itself). */
export function makeSkirtHeight(world: WorldData): (x: number, z: number) => number {
  const S = world.size, hf = world.terrain;
  const inv = 1 / (SKIRT_NOISE_SCALE_L * S), seed = world.params.seed | 0;
  return (x, z) => {
    const cx = Math.min(S, Math.max(0, x)), cz = Math.min(S, Math.max(0, z));
    const plane = terrainHeightAt(hf, cx, cz);
    const d = outsideDistance(x, z, S);
    if (d <= 0) return plane;
    const mirrored = terrainHeightAt(hf, reflectInto(x, S), reflectInto(z, S));
    const n = 0.5 + 0.5 * fbm2(x * inv, z * inv, seed, 3);
    const relief = Math.min(SKIRT_RELIEF_MAX_MM, d * SKIRT_RELIEF_SLOPE) * Math.max(0, Math.min(1, n));
    const lift = Math.min(SKIRT_LIFT_MAX_MM, d * 0.01);
    return Math.max(plane, mirrored) + relief + lift;
  };
}

/** Sample coordinates along one axis: geometric rows outside, even steps across the map. */
export function skirtAxis(size: number, bu: number, width: number, segments = SKIRT_EDGE_SEGMENTS): number[] {
  const out: number[] = [];
  let r = SKIRT_FIRST_ROW_BU * bu;
  while (r < width) { out.push(r); r *= SKIRT_ROW_GROWTH; }
  out.push(width);
  const inner: number[] = [];
  for (let i = 0; i <= segments; i++) inner.push((i / segments) * size);
  return [...out.map((o) => -o).reverse(), ...inner, ...out.map((o) => size + o)];
}

const _c = new Color(), _far = new Color();

/** Builds the skirt mesh arrays for a world. */
export function buildSkirt(world: WorldData): SkirtArrays {
  const S = world.size, bu = world.bu, width = SKIRT_WIDTH_L * S;
  const h = makeSkirtHeight(world);
  const axis = skirtAxis(S, bu, width);
  const n = axis.length;
  const inside = (i: number, j: number) => axis[i] >= 0 && axis[i + 1] <= S && axis[j] >= 0 && axis[j + 1] <= S;
  // vertices used by at least one outside cell, compacted
  const vid = new Int32Array(n * n).fill(-1);
  let count = 0;
  const tris: number[] = [];
  const use = (i: number, j: number) => { const k = j * n + i; if (vid[k] < 0) vid[k] = count++; return vid[k]; };
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    if (inside(i, j)) continue;
    const a = use(i, j), b = use(i + 1, j), c = use(i, j + 1), d = use(i + 1, j + 1);
    tris.push(a, c, b, b, c, d); // counter-clockwise seen from above (+Y)
  }
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  _far.set(SKIRT_FAR_HEX);
  const seed = world.params.seed | 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = vid[j * n + i];
    if (v < 0) continue;
    const x = axis[i], z = axis[j], y = h(x, z);
    positions.set([x, y, z], v * 3);
    // normal from the height function (the step follows the local spacing so far rows stay smooth)
    const e = Math.max(bu, 0.5 * Math.min(Math.abs(axis[Math.min(n - 1, i + 1)] - x) || bu, Math.abs(axis[Math.min(n - 1, j + 1)] - z) || bu));
    const nx = h(x - e, z) - h(x + e, z), nz = h(x, z - e) - h(x, z + e), ny = 2 * e;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.set([nx / len, ny / len, nz / len], v * 3);
    // colour: the zone it mirrors, toward the far-ground tone outward, a little brightness noise
    const zone = zoneTypeAt(world, reflectInto(x, S), reflectInto(z, S));
    _c.set(SKIRT_ZONE_HEX[zone] ?? SKIRT_ZONE_HEX.lawn);
    _c.lerp(_far, SKIRT_FAR_MIX * Math.min(1, outsideDistance(x, z, S) / width));
    const k = 0.9 + 0.2 * (0.5 + 0.5 * fbm2(x / (8 * bu), z / (8 * bu), seed + 7, 2));
    colors.set([_c.r * k, _c.g * k, _c.b * k], v * 3);
  }
  return { positions, normals, colors, index: Uint32Array.from(tris), width };
}
