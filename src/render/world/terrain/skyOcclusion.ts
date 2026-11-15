// Static sky occlusion of the ground (pure, tested): how much of the sky a point of the ground cannot see because a
// primitive hangs over it (a car body, a table, a bench) or stands right beside it (contact darkening round stones,
// pots and walls). The ground materials scale their indirect light (hemisphere + sky IBL) by it; direct sun keeps
// its own shadow map. Without it the shade under a parked car was lit by the full sky and its asphalt aggregate
// glittered like snow (look-pass). Built once per world from the static primitives on a coarse grid, then blurred.
import type { Primitive } from '@/sim/types';
import { SKY_OCCLUSION } from './terrainQuality';

export interface SkyOcclusionMap {
  /** Cell edge, mm, and grid size. */
  cell: number;
  nx: number;
  nz: number;
  /** 0 open sky .. 255 fully occluded. */
  data: Uint8Array;
}

/** Local-space footprint test: is world (x, z) inside the primitive's XZ footprint (its local x/z extents)? */
function inFootprint(p: Primitive, ax: readonly number[], az: readonly number[], x: number, z: number, hx: number, hz: number): boolean {
  const dx = x - p.pos.x, dz = z - p.pos.z;
  // local axes projected on the ground plane (x and z columns of the rotation)
  const u = dx * ax[0] + dz * ax[2], w = dx * az[0] + dz * az[2];
  if (p.shape === 'cylinder' || p.shape === 'capsule') return u * u + w * w <= hx * hx;
  if (p.shape === 'ellipsoid') return (u * u) / (hx * hx) + (w * w) / (hz * hz) <= 1;
  return Math.abs(u) <= hx && Math.abs(w) <= hz;
}

/**
 * Occlusion grid over a world `worldSize` mm square. `heightAt` = the terrain height the walker uses. Only primitives
 * standing roughly upright are rasterised by their XZ footprint (a tilted twig casts no meaningful sky shadow).
 */
export function buildSkyOcclusion(prims: readonly Primitive[], heightAt: (x: number, z: number) => number, worldSize: number, cell = SKY_OCCLUSION.cellMm): SkyOcclusionMap {
  const n = Math.max(1, Math.ceil(worldSize / cell));
  const acc = new Float32Array(n * n);
  const S = SKY_OCCLUSION;
  for (const p of prims) {
    const { x, y, z, w } = p.rot;
    const ax = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
    const ay = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
    const az = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
    if (Math.abs(ay[1]) < 0.85) continue; // lying or tilted: skip
    const hx = p.size.x, hz = p.shape === 'cylinder' || p.shape === 'capsule' ? p.size.x : p.size.z;
    const halfH = p.shape === 'capsule' ? p.size.y + p.size.x : p.size.y;
    // small things only darken their contact ring; nothing under a few mm matters at this grid
    const minHalf = Math.min(hx, hz);
    if (minHalf * 2 < S.minSizeMm) continue;
    const reach = Math.hypot(hx, hz);
    const i0 = Math.max(0, Math.floor((p.pos.x - reach) / cell)), i1 = Math.min(n - 1, Math.floor((p.pos.x + reach) / cell));
    const k0 = Math.max(0, Math.floor((p.pos.z - reach) / cell)), k1 = Math.min(n - 1, Math.floor((p.pos.z + reach) / cell));
    if ((i1 - i0 + 1) * (k1 - k0 + 1) > S.maxCellsPerPrim) continue; // walls of the house and the like: their own shade does it
    const bottom = p.pos.y - halfH;
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * cell, cz = (k + 0.5) * cell;
      if (!inFootprint(p, ax, az, cx, cz, hx, hz)) continue;
      const clearance = Math.max(0, bottom - heightAt(cx, cz));
      // the higher the overhang compared with its width, the more sky reaches under it from the sides
      const occ = clearance <= S.groundContactMm ? S.contact : S.under * Math.max(S.highFloor, 1 - clearance / (S.openK * minHalf));
      const j = k * n + i;
      if (occ > acc[j]) acc[j] = occ;
    }
  }
  blur(acc, n, S.blurCells);
  const data = new Uint8Array(n * n);
  for (let j = 0; j < data.length; j++) data[j] = Math.round(Math.min(1, acc[j]) * 255);
  return { cell, nx: n, nz: n, data };
}

/** Separable box blur, `r` cells, `passes` times (soft edges and the contact ring round a footprint). */
function blur(a: Float32Array, n: number, r: number, passes = 2): void {
  if (r <= 0) return;
  const tmp = new Float32Array(a.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[k * n + Math.min(n - 1, Math.max(0, i))];
      for (let i = 0; i < n; i++) {
        tmp[k * n + i] = s / (2 * r + 1);
        s += a[k * n + Math.min(n - 1, i + r + 1)] - a[k * n + Math.max(0, i - r)];
      }
    }
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(n - 1, Math.max(0, k)) * n + i];
      for (let k = 0; k < n; k++) {
        a[k * n + i] = s / (2 * r + 1);
        s += tmp[Math.min(n - 1, k + r + 1) * n + i] - tmp[Math.max(0, k - r) * n + i];
      }
    }
  }
}

/** GLSL: `wrSkyOcc(worldXZ)` 0 open .. 1 occluded, from the map (uniforms tWrSkyOcc, uWrSkyOccInv). */
export const SKY_OCCLUSION_GLSL = /* glsl */ `
uniform sampler2D tWrSkyOcc; uniform vec2 uWrSkyOccInv;
float wrSkyOcc(vec2 xz) {
  if (uWrSkyOccInv.x <= 0.0) return 0.0;
  return texture2D(tWrSkyOcc, xz * uWrSkyOccInv).r;
}
`;

/** GLSL statement (after aomap_fragment): scales the indirect light by the occlusion at `xz`. */
export function skyOcclusionApplyGlsl(xz: string): string {
  return `{ float wrSo = 1.0 - ${SKY_OCCLUSION.strength.toFixed(3)} * wrSkyOcc(${xz}); reflectedLight.indirectDiffuse *= wrSo; reflectedLight.indirectSpecular *= wrSo; }`;
}
