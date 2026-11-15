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
 * Share of the cosine-weighted sky hidden at distance d by an infinitely long wall spanning heights h0..h1 above the
 * ground (h0 = 0: a wall standing on the ground; h0 > 0: the flank of a raised body).
 */
function wallOcclusion(d: number, h0: number, h1: number): number {
  return 0.5 * (d / Math.max(1e-6, Math.hypot(d, h0)) - d / Math.max(1e-6, Math.hypot(d, h1)));
}

/** Azimuth angle (radians, <= PI) a footprint subtends from a point outside it at offset (dx, dz) from its centre. */
function subtended(dx: number, dz: number, corners: number[][] | null, r: number, d: number): number {
  if (!corners) return 2 * Math.asin(Math.min(1, r / (r + d)));
  // the largest angle between two corner directions as seen from the point
  let best = 0;
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const ux = corners[a][0] - dx, uz = corners[a][1] - dz, vx = corners[b][0] - dx, vz = corners[b][1] - dz;
    const c = (ux * vx + uz * vz) / Math.max(1e-6, Math.hypot(ux, uz) * Math.hypot(vx, vz));
    best = Math.max(best, Math.acos(Math.max(-1, Math.min(1, c))));
  }
  return best;
}

/** An upright primitive's ground footprint (see buildSkyOcclusion). */
interface Footprint {
  p: Primitive;
  ax: number[]; az: number[];
  hx: number; hz: number; minHalf: number; round: boolean;
  /** Axis-aligned half extents of the footprint, mm. */
  ex: number; ez: number;
  /** Underside and top, world mm. */
  bottom: number; top: number;
  /** Corner offsets from the centre (boxes), for the azimuth the footprint spans. */
  corners: number[][] | null;
}

function footprintOf(p: Primitive, cell: number): Footprint | null {
  const S = SKY_OCCLUSION;
  const { x, y, z, w } = p.rot;
  const ax = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const ayY = 1 - 2 * (x * x + z * z);
  const az = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
  if (Math.abs(ayY) < 0.85) return null; // lying or tilted: skip
  const hx = p.size.x, hz = p.shape === 'cylinder' || p.shape === 'capsule' ? p.size.x : p.size.z;
  const halfH = p.shape === 'capsule' ? p.size.y + p.size.x : p.size.y;
  // small things only darken their contact ring; nothing under a few mm matters at this grid
  const minHalf = Math.min(hx, hz);
  if (minHalf * 2 < S.minSizeMm) return null;
  // The footprint is the parallelogram |d.a| <= hx, |d.b| <= hz with a, b the local x and z axes projected on the
  // ground; |det(a, b)| = |ay.y| (>= 0.85 here). Its true area decides the cap (a car body is in, a room's ceiling
  // or floor slab is out) and its oriented extent bounds the loops (a long thin wall stays cheap).
  const det = ax[0] * az[2] - ax[2] * az[0];
  if ((4 * hx * hz) / Math.abs(det) > S.maxCellsPerPrim * cell * cell) return null; // ceilings, floor slabs, blocks
  const m00 = az[2] / det, m01 = -ax[2] / det, m10 = -az[0] / det, m11 = ax[0] / det; // inverse of [a; b]
  const round = p.shape !== 'box';
  return {
    p, ax, az, hx, hz, minHalf, round,
    ex: round ? Math.hypot(m00 * hx, m01 * hz) : Math.abs(m00) * hx + Math.abs(m01) * hz,
    ez: round ? Math.hypot(m10 * hx, m11 * hz) : Math.abs(m10) * hx + Math.abs(m11) * hz,
    bottom: p.pos.y - halfH, top: p.pos.y + halfH,
    corners: round ? null : [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([su, sw]) => [m00 * su * hx + m01 * sw * hz, m10 * su * hx + m11 * sw * hz]),
  };
}

/** Heights of the terrain at the centres of an n x n grid of `cell` mm. */
function groundGrid(heightAt: (x: number, z: number) => number, n: number, cell: number): Float32Array {
  const g = new Float32Array(n * n);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) g[k * n + i] = heightAt((i + 0.5) * cell, (k + 0.5) * cell);
  return g;
}

/**
 * Occlusion grid over a world `worldSize` mm square. `heightAt` = the terrain height the walker uses. Only primitives
 * standing roughly upright count. Two passes: footprints (under an overhang, contact under a resting body) on the
 * fine grid, and the skirt of sky a tall body hides from the ground beside it on a coarse grid (it varies slowly),
 * merged by the larger value.
 */
export function buildSkyOcclusion(prims: readonly Primitive[], heightAt: (x: number, z: number) => number, worldSize: number, cell = SKY_OCCLUSION.cellMm): SkyOcclusionMap {
  const S = SKY_OCCLUSION;
  const n = Math.max(1, Math.ceil(worldSize / cell));
  const acc = new Float32Array(n * n);
  const ground = groundGrid(heightAt, n, cell);
  const cc = cell * S.skirtCoarse, nc = Math.max(1, Math.ceil(worldSize / cc));
  const skirts = new Float32Array(nc * nc);
  const groundC = groundGrid(heightAt, nc, cc);
  for (const p of prims) {
    const f = footprintOf(p, cell);
    if (!f) continue;
    rasterFootprint(f, acc, ground, n, cell);
    rasterSkirt(f, skirts, groundC, nc, cc, heightAt(p.pos.x, p.pos.z));
  }
  // bilinear up-sampling of the skirts into the fine grid
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const fx = Math.min(nc - 1, Math.max(0, ((i + 0.5) * cell) / cc - 0.5)), fz = Math.min(nc - 1, Math.max(0, ((k + 0.5) * cell) / cc - 0.5));
    const i0 = Math.floor(fx), k0 = Math.floor(fz), i1 = Math.min(nc - 1, i0 + 1), k1 = Math.min(nc - 1, k0 + 1);
    const tx = fx - i0, tz = fz - k0;
    const v = (skirts[k0 * nc + i0] * (1 - tx) + skirts[k0 * nc + i1] * tx) * (1 - tz) + (skirts[k1 * nc + i0] * (1 - tx) + skirts[k1 * nc + i1] * tx) * tz;
    const j = k * n + i;
    if (v > acc[j]) acc[j] = v;
  }
  blur(acc, n, S.blurCells);
  const data = new Uint8Array(n * n);
  for (let j = 0; j < data.length; j++) data[j] = Math.round(Math.min(1, acc[j]) * 255);
  return { cell, nx: n, nz: n, data };
}

/** Under the footprint: an overhang hides sky by its width against its clearance; a resting body counts `contact`. */
function rasterFootprint(f: Footprint, acc: Float32Array, ground: Float32Array, n: number, cell: number): void {
  const S = SKY_OCCLUSION, p = f.p;
  const i0 = Math.max(0, Math.floor((p.pos.x - f.ex) / cell)), i1 = Math.min(n - 1, Math.floor((p.pos.x + f.ex) / cell));
  const k0 = Math.max(0, Math.floor((p.pos.z - f.ez) / cell)), k1 = Math.min(n - 1, Math.floor((p.pos.z + f.ez) / cell));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    if (!inFootprint(p, f.ax, f.az, (i + 0.5) * cell, (k + 0.5) * cell, f.hx, f.hz)) continue;
    const j = k * n + i;
    const clearance = Math.max(0, f.bottom - ground[j]);
    // the higher the overhang compared with its width, the more sky reaches under it from the sides
    const occ = clearance <= S.groundContactMm ? S.contact : S.under * Math.max(S.highFloor, 1 - clearance / (S.openK * f.minHalf));
    if (occ > acc[j]) acc[j] = occ;
  }
}

/**
 * Beside the footprint of a body at least skirtMinHeightMm tall: the sky its flank hides (wall formula x the azimuth
 * it spans), out to min(skirtK x height, skirtMaxMm), fading to 0 over the outer half so no edge shows.
 */
function rasterSkirt(f: Footprint, out: Float32Array, ground: Float32Array, n: number, cell: number, groundAtCentre: number): void {
  const S = SKY_OCCLUSION, p = f.p;
  const height = f.top - groundAtCentre;
  if (height < S.skirtMinHeightMm) return;
  const reach = Math.min(S.skirtK * height, S.skirtMaxMm);
  const i0 = Math.max(0, Math.floor((p.pos.x - f.ex - reach) / cell)), i1 = Math.min(n - 1, Math.floor((p.pos.x + f.ex + reach) / cell));
  const k0 = Math.max(0, Math.floor((p.pos.z - f.ez - reach) / cell)), k1 = Math.min(n - 1, Math.floor((p.pos.z + f.ez + reach) / cell));
  const { ax, az, hx, hz } = f;
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const dx = (i + 0.5) * cell - p.pos.x, dz = (k + 0.5) * cell - p.pos.z;
    const u = dx * ax[0] + dz * ax[2], w = dx * az[0] + dz * az[2];
    const d = f.round ? Math.max(0, Math.hypot(u / hx, w / hz) - 1) * f.minHalf : Math.hypot(Math.max(0, Math.abs(u) - hx), Math.max(0, Math.abs(w) - hz));
    if (d >= reach) continue;
    const j = k * n + i, g = ground[j];
    const fade = 1 - smooth01((d - 0.5 * reach) / (0.5 * reach));
    let occ = S.skirt * fade * wallOcclusion(d, Math.max(0, f.bottom - g), Math.max(0, f.top - g));
    if (occ <= out[j]) continue; // the azimuth factor (<= 1) cannot raise it above what is there
    occ *= subtended(dx, dz, f.corners, Math.max(hx, hz), d) / Math.PI;
    if (occ > out[j]) out[j] = occ;
  }
}

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
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
