/**
 * Carve grid (negative space): sparse map chunkKey -> Uint8Array(4096) of openness (0 solid .. 255 open, iso 127.5).
 * Samples sit on voxel CORNERS: sample (i,j,k) is at world (i*voxel, j*voxel, k*voxel). Chunk (cx,cy,cz) owns samples
 * i in [16cx, 16cx+15]; its mesh covers the cells between samples 16cx .. 16cx+16 (one-sample overlap with the
 * +x/+y/+z neighbours, read through sample()).
 *
 * Encoding: brushes write openness = clamp(0.5 - sdf/ramp, 0, 1) * 255, i.e. a LINEAR ramp of width `ramp` mm centred
 * on the shape surface. Hence fCavity = (openness - 0.5) * ramp is a true signed distance (mm) within +-ramp/2 of
 * the carved surface and saturates beyond: a valid Lipschitz-1 lower bound for sphere tracing.
 *
 * Pure TypeScript (no three). The Map and Set are runtime caches; the persisted form would be {keys, Uint8Array[]}.
 */

export const CH = 16;
export const CH3 = CH * CH * CH;
const OFF = 512;
export const chunkKey = (cx: number, cy: number, cz: number): number => (cx + OFF) + (cy + OFF) * 1024 + (cz + OFF) * 1048576;
export function keyToChunk(k: number): [number, number, number] {
  const cx = (k % 1024) - OFF, cy = (Math.floor(k / 1024) % 1024) - OFF, cz = Math.floor(k / 1048576) - OFF;
  return [cx, cy, cz];
}
/** global voxel id (for nav), i/j/k in [-512, 511] */
export const voxelId = (i: number, j: number, k: number): number => (i + OFF) + (j + OFF) * 1024 + (k + OFF) * 1048576;

export interface Breach { x: number; y: number; z: number; r: number }
export interface ChangeBox { i0: number; j0: number; k0: number; i1: number; j1: number; k1: number; changed: number }

export class CarveGrid {
  readonly voxel: number;
  readonly inv: number;
  readonly ramp: number;
  readonly chunks = new Map<number, Uint8Array>();
  /** chunks whose MESH must be rebuilt (includes -1 neighbours that read changed samples through the overlap) */
  readonly dirty = new Set<number>();
  /** carve spheres that crossed the substrate surface (entrances); terrain shaders discard inside them */
  readonly breaches: Breach[] = [];
  /** returns true if a carve sphere at (x,y,z,r) crosses the soil surface. Set by the owner (needs the world). */
  breachTest: ((x: number, y: number, z: number, r: number) => boolean) | null = null;
  /** optional guard: openness is never raised where this returns false (e.g. outside the world) */
  private lastKey = -1;
  private lastArr: Uint8Array | undefined;
  /** bumps on every edit; consumers (nav, render) compare to detect changes */
  version = 0;

  constructor(voxel: number, ramp: number) {
    this.voxel = voxel; this.inv = 1 / voxel; this.ramp = ramp;
  }

  getChunk(cx: number, cy: number, cz: number): Uint8Array | undefined {
    const k = chunkKey(cx, cy, cz);
    if (k === this.lastKey) return this.lastArr;
    const a = this.chunks.get(k);
    this.lastKey = k; this.lastArr = a;
    return a;
  }
  private ensureChunk(cx: number, cy: number, cz: number): Uint8Array {
    let a = this.getChunk(cx, cy, cz);
    if (!a) {
      a = new Uint8Array(CH3);
      const k = chunkKey(cx, cy, cz);
      this.chunks.set(k, a);
      this.lastKey = k; this.lastArr = a;
    }
    return a;
  }

  /** raw sample 0..255 at integer sample coords */
  sample(i: number, j: number, k: number): number {
    const a = this.getChunk(i >> 4, j >> 4, k >> 4);
    return a ? a[(i & 15) + ((j & 15) << 4) + ((k & 15) << 8)] : 0;
  }

  /** trilinear openness in [0,1] */
  openness(x: number, y: number, z: number): number {
    const fx = x * this.inv, fy = y * this.inv, fz = z * this.inv;
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const li = i & 15, lj = j & 15, lk = k & 15;
    let c000, c100, c010, c110, c001, c101, c011, c111;
    if (li < 15 && lj < 15 && lk < 15) {
      const a = this.getChunk(i >> 4, j >> 4, k >> 4);
      if (!a) return 0;
      const o = li + (lj << 4) + (lk << 8);
      c000 = a[o]; c100 = a[o + 1]; c010 = a[o + 16]; c110 = a[o + 17];
      c001 = a[o + 256]; c101 = a[o + 257]; c011 = a[o + 272]; c111 = a[o + 273];
    } else {
      c000 = this.sample(i, j, k); c100 = this.sample(i + 1, j, k); c010 = this.sample(i, j + 1, k); c110 = this.sample(i + 1, j + 1, k);
      c001 = this.sample(i, j, k + 1); c101 = this.sample(i + 1, j, k + 1); c011 = this.sample(i, j + 1, k + 1); c111 = this.sample(i + 1, j + 1, k + 1);
    }
    const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
    const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
    return (y0 + (y1 - y0) * tz) * (1 / 255);
  }

  /** signed cavity distance (mm): > 0 inside carved space, saturates at +-ramp/2 */
  fCavity(x: number, y: number, z: number): number {
    return (this.openness(x, y, z) - 0.5) * this.ramp;
  }

  /**
   * Generic brush. `sdf(x,y,z)` is the signed distance of the shape (negative inside). Only samples in the given
   * world AABB (expanded by the ramp) are visited. mode 'carve' raises openness to the shape's ramp, 'fill' lowers it.
   */
  applyBrush(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
    sdf: (x: number, y: number, z: number) => number, mode: 'carve' | 'fill'): ChangeBox {
    const v = this.voxel, ramp = this.ramp, h = ramp * 0.5;
    const i0 = Math.floor((minX - h) / v), i1 = Math.ceil((maxX + h) / v);
    const j0 = Math.floor((minY - h) / v), j1 = Math.ceil((maxY + h) / v);
    const k0 = Math.floor((minZ - h) / v), k1 = Math.ceil((maxZ + h) / v);
    const box: ChangeBox = { i0: 1e9, j0: 1e9, k0: 1e9, i1: -1e9, j1: -1e9, k1: -1e9, changed: 0 };
    const invRamp = 1 / ramp;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = sdf(i * v, j * v, k * v);
      let b = 0.5 - d * invRamp;
      b = b < 0 ? 0 : b > 1 ? 1 : b;
      const q = Math.round(b * 255);
      let a: Uint8Array | undefined;
      const idx = (i & 15) + ((j & 15) << 4) + ((k & 15) << 8);
      if (mode === 'carve') {
        if (q === 0) continue;
        a = this.ensureChunk(i >> 4, j >> 4, k >> 4);
        if (a[idx] >= q) continue;
        a[idx] = q;
      } else {
        a = this.getChunk(i >> 4, j >> 4, k >> 4);
        const nq = 255 - q;
        if (!a || a[idx] <= nq) continue;
        a[idx] = nq;
      }
      box.changed++;
      if (i < box.i0) box.i0 = i; if (i > box.i1) box.i1 = i;
      if (j < box.j0) box.j0 = j; if (j > box.j1) box.j1 = j;
      if (k < box.k0) box.k0 = k; if (k > box.k1) box.k1 = k;
    }
    if (box.changed) {
      this.version++;
      // chunk c meshes samples [16c, 16c+16]: a changed sample s is read by chunks floor(s/16) and floor((s-1)/16)
      for (let cz = (box.k0 - 1) >> 4; cz <= box.k1 >> 4; cz++)
        for (let cy = (box.j0 - 1) >> 4; cy <= box.j1 >> 4; cy++)
          for (let cx = (box.i0 - 1) >> 4; cx <= box.i1 >> 4; cx++) this.dirty.add(chunkKey(cx, cy, cz));
    }
    return box;
  }

  carveSphere(x: number, y: number, z: number, r: number): ChangeBox {
    if (this.breachTest && this.breachTest(x, y, z, r)) {
      // Dedupe: skipping a sphere only SHRINKS the discarded terrain region (union of breach spheres stays inside the
      // carved cavity), so it can never create a see-through gap; it keeps the shader's uniform array short.
      let dup = false;
      for (const b of this.breaches) {
        if (b.r >= r - 1e-6 && Math.hypot(b.x - x, b.y - y, b.z - z) < 0.4 * r) { dup = true; break; }
      }
      if (!dup) this.breaches.push({ x, y, z, r });
    }
    return this.applyBrush(x - r, y - r, z - r, x + r, y + r, z + r,
      (px, py, pz) => Math.sqrt((px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z)) - r, 'carve');
  }

  fillSphere(x: number, y: number, z: number, r: number): ChangeBox {
    const box = this.applyBrush(x - r, y - r, z - r, x + r, y + r, z + r,
      (px, py, pz) => Math.sqrt((px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z)) - r, 'fill');
    // a breach sphere that is now mostly filled must stop cutting the terrain
    if (box.changed) for (let b = this.breaches.length - 1; b >= 0; b--) {
      const s = this.breaches[b];
      if (this.openness(s.x, s.y, s.z) < 0.5) this.breaches.splice(b, 1);
    }
    return box;
  }

  /** Axis-aligned ellipsoid (radii rx, ry, rz) - used for flattened chambers. Never breaches (deep). */
  carveEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): ChangeBox {
    return this.applyBrush(x - rx, y - ry, z - rz, x + rx, y + ry, z + rz, (px, py, pz) => {
      const ax = (px - x) / rx, ay = (py - y) / ry, az = (pz - z) / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = (px - x) / (rx * rx), by = (py - y) / (ry * ry), bz = (pz - z) / (rz * rz);
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    }, 'carve');
  }

  /** capsule tunnel segment a->b of radius r, carved as spheres every `spacing` mm (so breaches are recorded) */
  carveTunnel(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, spacing = 1.0): void {
    const L = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(1, Math.ceil(L / spacing));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      this.carveSphere(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, r);
    }
  }

  /** bytes held by openness chunks */
  memoryBytes(): number { return this.chunks.size * CH3; }
}
