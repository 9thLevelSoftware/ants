// Where the loose ground grains lie (pure, tested): a world-anchored lattice of cells around the camera focus; each
// cell rolls its grains from a hash of its coordinates and the ground material under it (tuning.ts GRIT), so a
// grain is always in the same place whatever the camera does. Heights follow the terrain the simulation walks on;
// a grain is mostly buried and protrudes at most GRIT_MAX_RISE_BU.
import type { MaterialId } from '@/sim/types';
import { lin, type Rgb } from './palette';
import { GRIT, GRIT_CELL_MM, GRIT_EDGE_FADE, GRIT_EXPOSED, GRIT_MAX_RISE_BU, type GritSpec } from './tuning';

/** What the placement reads from the world (terrain the walker uses, material map, holes). */
export interface GritGround {
  bu: number;
  /** Ground material at (x, z), or null where no grit may lie (water, holes, off the map). */
  materialAt(x: number, z: number): MaterialId | null;
  /** Terrain height, mm. */
  heightAt(x: number, z: number): number;
}

export interface GritGrain {
  x: number; y: number; z: number;
  /** Half extents of the grain, mm (y = height). */
  sx: number; sy: number; sz: number;
  yaw: number;
  /** Small tilt about the grain's X axis, rad. */
  tilt: number;
  color: Rgb;
  chip: boolean;
  /** Distance from the focus in XZ, mm. */
  d: number;
}

function hash(ix: number, iz: number, k: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(k + 0x3c6ef372, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const colorCache = new Map<string, Rgb[]>();
function colors(spec: GritSpec): Rgb[] {
  const key = spec.colors.join();
  let c = colorCache.get(key);
  if (!c) colorCache.set(key, (c = spec.colors.map(lin)));
  return c;
}

/**
 * Grains within `radius` of (cx, cz), nearest first, at most `max` (the cap shrinks the radius rather than
 * thinning the grains out, so the ground near the ant always has full density). Grains shrink to nothing over the
 * outer GRIT_EDGE_FADE of the effective radius.
 */
export function placeGrit(ground: GritGround, cx: number, cz: number, radius: number, max: number): GritGrain[] {
  const out: GritGrain[] = [];
  if (max <= 0 || radius <= 0) return out;
  const cell = GRIT_CELL_MM;
  const maxRise = GRIT_MAX_RISE_BU * ground.bu;
  const i0 = Math.floor((cx - radius) / cell), i1 = Math.floor((cx + radius) / cell);
  const k0 = Math.floor((cz - radius) / cell), k1 = Math.floor((cz + radius) / cell);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const mx = (i + 0.5) * cell, mz = (k + 0.5) * cell;
    if (Math.hypot(mx - cx, mz - cz) > radius + cell) continue;
    const mat = ground.materialAt(mx, mz);
    const spec = mat ? GRIT[mat] : undefined;
    if (!spec) continue;
    const expected = spec.density * cell * cell;
    const n = Math.floor(expected + hash(i, k, 0));
    const pal = colors(spec);
    for (let g = 0; g < n; g++) {
      const x = (i + hash(i, k, 10 + g * 7)) * cell, z = (k + hash(i, k, 11 + g * 7)) * cell;
      const d = Math.hypot(x - cx, z - cz);
      if (d > radius) continue;
      // grains lie on their own ground: a cell straddling a border does not spill gravel onto the lawn
      if (ground.materialAt(x, z) !== mat) continue;
      const u = hash(i, k, 12 + g * 7);
      const size = spec.sizeMm[0] + (spec.sizeMm[1] - spec.sizeMm[0]) * Math.pow(u, 1.8); // many small, few big
      const flat = spec.flat[0] + (spec.flat[1] - spec.flat[0]) * hash(i, k, 13 + g * 7);
      const aspect = 0.65 + 0.35 * hash(i, k, 14 + g * 7);
      const sy = Math.max(0.15, (size * flat) / 2);
      const rise = Math.min(maxRise, 2 * sy * GRIT_EXPOSED);
      out.push({
        x, z, y: ground.heightAt(x, z) + rise - sy,
        sx: size / 2, sy, sz: (size * aspect) / 2,
        yaw: hash(i, k, 15 + g * 7) * Math.PI * 2, tilt: (hash(i, k, 16 + g * 7) - 0.5) * 0.5,
        color: pal[Math.floor(hash(i, k, 17 + g * 7) * pal.length) % pal.length],
        chip: hash(i, k, 18 + g * 7) < spec.chipShare, d,
      });
    }
  }
  out.sort((a, b) => a.d - b.d);
  if (out.length > max) out.length = max;
  const reach = out.length >= max ? out[out.length - 1].d : radius;
  for (const g of out) {
    const f = 1 - smooth((g.d / reach - (1 - GRIT_EDGE_FADE)) / GRIT_EDGE_FADE);
    if (f >= 1) continue;
    // shrink about the ground point, so a fading grain keeps its buried share and sinks away
    const h = ground.heightAt(g.x, g.z);
    g.sx *= f; g.sy *= f; g.sz *= f; g.y = h + (g.y - h) * f;
  }
  return out;
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
