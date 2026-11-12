/**
 * Static world for the nest spike: a heightfield terrain plus solid primitives with a 3D spatial hash.
 * Pure TypeScript (no three). Units mm, Y up, free-space-positive signed pseudo-distances.
 *
 * Primitive data is plain JSON-like (persistable). The spatial hash is a derived cache (rebuilt from the list).
 */

export type PrimKind = 'roundbox' | 'ellipsoid' | 'capsule' | 'cylinder';

export interface Primitive {
  name: string;
  kind: PrimKind;
  /** centre, world mm */
  pos: [number, number, number];
  /** local->world rotation, row-major 3x3 (columns are the local axes in world space). world->local = R^T */
  rot: [number, number, number, number, number, number, number, number, number];
  /** roundbox: half extents (incl. rounding); ellipsoid: radii; capsule/cylinder: [radius, halfHeight(local Y), 0] */
  size: [number, number, number];
  /** roundbox rounding radius (mm) */
  round: number;
  /** diggable primitives join the soil (carve grid can open them); hard ones never open */
  diggable: boolean;
  material: 'stone' | 'concrete' | 'plant' | 'wood' | 'plaster';
}

export interface TerrainDef {
  x0: number; z0: number; cell: number; nx: number; nz: number;
  /** node heights, index = ix + iz * nx */
  h: Float32Array;
}

export const IDENTITY_ROT: Primitive['rot'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function rotY(a: number): Primitive['rot'] {
  const c = Math.cos(a), s = Math.sin(a);
  // local->world: x' = c x + s z, z' = -s x + c z (three.js Object3D.rotation.y convention)
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/** Polynomial smooth minimum (k = blend width in mm); deviates from min by at most k/4. */
export function smin(a: number, b: number, k: number): number {
  const h = k - Math.abs(a - b);
  if (h <= 0) return a < b ? a : b;
  return (a < b ? a : b) - (h * h) / (4 * k);
}
export function smax(a: number, b: number, k: number): number {
  const h = k - Math.abs(a - b);
  if (h <= 0) return a > b ? a : b;
  return (a > b ? a : b) + (h * h) / (4 * k);
}

/** Signed distance of a primitive in its LOCAL frame (positive outside = free space). */
export function primLocalSdf(p: Primitive, x: number, y: number, z: number): number {
  const s = p.size;
  switch (p.kind) {
    case 'roundbox': {
      const r = p.round;
      const qx = Math.abs(x) - (s[0] - r), qy = Math.abs(y) - (s[1] - r), qz = Math.abs(z) - (s[2] - r);
      const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
      const inside = Math.max(qx, qy, qz);
      return Math.sqrt(mx * mx + my * my + mz * mz) + (inside < 0 ? inside : 0) - r;
    }
    case 'ellipsoid': {
      // iq's ellipsoid approximation; accurate near the surface which is all the walker needs
      const ax = x / s[0], ay = y / s[1], az = z / s[2];
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = x / (s[0] * s[0]), by = y / (s[1] * s[1]), bz = z / (s[2] * s[2]);
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      if (k1 < 1e-9) return -Math.min(s[0], s[1], s[2]);
      return (k0 * (k0 - 1)) / k1;
    }
    case 'capsule': {
      const h = s[1];
      const cy = y < -h ? -h : y > h ? h : y;
      return Math.sqrt(x * x + (y - cy) * (y - cy) + z * z) - s[0];
    }
    case 'cylinder': {
      const dx = Math.sqrt(x * x + z * z) - s[0], dy = Math.abs(y) - s[1];
      const mx = dx > 0 ? dx : 0, my = dy > 0 ? dy : 0;
      return Math.min(Math.max(dx, dy), 0) + Math.sqrt(mx * mx + my * my);
    }
  }
}

export function primSdf(p: Primitive, x: number, y: number, z: number): number {
  const dx = x - p.pos[0], dy = y - p.pos[1], dz = z - p.pos[2], r = p.rot;
  // local = R^T * d  (columns of R are local axes)
  const lx = r[0] * dx + r[3] * dy + r[6] * dz;
  const ly = r[1] * dx + r[4] * dy + r[7] * dz;
  const lz = r[2] * dx + r[5] * dy + r[8] * dz;
  return primLocalSdf(p, lx, ly, lz);
}

/** World-space AABB of a primitive (conservative). */
export function primAabb(p: Primitive): [number, number, number, number, number, number] {
  const s = p.size;
  let ex: number, ey: number, ez: number;
  if (p.kind === 'capsule') { ex = s[0]; ey = s[1] + s[0]; ez = s[0]; }
  else if (p.kind === 'cylinder') { ex = s[0]; ey = s[1]; ez = s[0]; }
  else { ex = s[0]; ey = s[1]; ez = s[2]; }
  const r = p.rot;
  // |R| * extents
  const wx = Math.abs(r[0]) * ex + Math.abs(r[1]) * ey + Math.abs(r[2]) * ez;
  const wy = Math.abs(r[3]) * ex + Math.abs(r[4]) * ey + Math.abs(r[5]) * ez;
  const wz = Math.abs(r[6]) * ex + Math.abs(r[7]) * ey + Math.abs(r[8]) * ez;
  return [p.pos[0] - wx, p.pos[1] - wy, p.pos[2] - wz, p.pos[0] + wx, p.pos[1] + wy, p.pos[2] + wz];
}

const HASH_OFF = 512;
const hkey = (ix: number, iy: number, iz: number) => (ix + HASH_OFF) + (iy + HASH_OFF) * 1024 + (iz + HASH_OFF) * 1048576;

export class World {
  readonly terrain: TerrainDef;
  readonly prims: Primitive[];
  /** blend width (mm) of the smooth min between primitives / terrain (fillets concave corners for the walker) */
  readonly blend: number;
  /** spatial hash: cell size and the free-distance bound guaranteed for points whose cell lists no primitive */
  readonly hashCell = 32;
  readonly hashMargin = 16;
  private hash = new Map<number, Int32Array>();
  private hardIdx: Int32Array;
  private hasDiggable: boolean;

  constructor(terrain: TerrainDef, prims: Primitive[], blend: number) {
    this.terrain = terrain; this.prims = prims; this.blend = blend;
    this.hardIdx = new Int32Array(prims.map((p, i) => (p.diggable ? -1 : i)).filter((i) => i >= 0));
    this.hasDiggable = prims.some((p) => p.diggable);
    this.rebuildHash();
  }

  rebuildHash(): void {
    const tmp = new Map<number, number[]>();
    const c = this.hashCell, m = this.hashMargin;
    this.prims.forEach((p, i) => {
      const b = primAabb(p);
      for (let iz = Math.floor((b[2] - m) / c); iz <= Math.floor((b[5] + m) / c); iz++)
        for (let iy = Math.floor((b[1] - m) / c); iy <= Math.floor((b[4] + m) / c); iy++)
          for (let ix = Math.floor((b[0] - m) / c); ix <= Math.floor((b[3] + m) / c); ix++) {
            const k = hkey(ix, iy, iz);
            let l = tmp.get(k);
            if (!l) tmp.set(k, (l = []));
            l.push(i);
          }
    });
    this.hash.clear();
    for (const [k, l] of tmp) this.hash.set(k, new Int32Array(l));
  }

  /** Primitive indices registered in the hash cell containing p (possibly empty). */
  primsNear(x: number, y: number, z: number): Int32Array | undefined {
    const c = this.hashCell;
    return this.hash.get(hkey(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c)));
  }

  /** Bilinear heightfield H(x,z). Outside the grid the edge heights are extended. */
  height(x: number, z: number): number {
    const t = this.terrain;
    let fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell;
    fx = fx < 0 ? 0 : fx > t.nx - 1.000001 ? t.nx - 1.000001 : fx;
    fz = fz < 0 ? 0 : fz > t.nz - 1.000001 ? t.nz - 1.000001 : fz;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const i = ix + iz * t.nx, h = t.h;
    const a = h[i], b = h[i + 1], c = h[i + t.nx], d = h[i + t.nx + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  /** Terrain free distance: (y - H) / |(-Hx, 1, -Hz)|  (exact for planes, good for gentle relief). */
  fTerrain(x: number, y: number, z: number): number {
    const t = this.terrain;
    let fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell;
    let edge = false;
    if (fx < 0) { fx = 0; edge = true; } else if (fx > t.nx - 1.000001) { fx = t.nx - 1.000001; edge = true; }
    if (fz < 0) { fz = 0; edge = true; } else if (fz > t.nz - 1.000001) { fz = t.nz - 1.000001; edge = true; }
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const i = ix + iz * t.nx, h = t.h;
    const a = h[i], b = h[i + 1], c = h[i + t.nx], d = h[i + t.nx + 1];
    const H = a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
    if (edge) return y - H;
    const gx = ((b - a) + (a - b - c + d) * tz) / t.cell, gz = ((c - a) + (a - b - c + d) * tx) / t.cell;
    return (y - H) / Math.sqrt(1 + gx * gx + gz * gz);
  }

  /** Free distance to HARD (non-diggable) primitives, smooth-min blended; >= hashMargin when none is near. */
  fHard(x: number, y: number, z: number): number {
    const l = this.primsNear(x, y, z);
    let d = this.hashMargin;
    if (!l) return d;
    const k = this.blend, ps = this.prims;
    for (let j = 0; j < l.length; j++) {
      const p = ps[l[j]];
      if (p.diggable) continue;
      d = smin(d, primSdf(p, x, y, z), k);
    }
    return d;
  }

  /** Free distance to diggable substrate: terrain (and diggable primitives, none in the spike). */
  fSoil(x: number, y: number, z: number): number {
    let d = this.fTerrain(x, y, z);
    if (!this.hasDiggable) return d;
    const l = this.primsNear(x, y, z);
    if (l) for (let j = 0; j < l.length; j++) {
      const p = this.prims[l[j]];
      if (p.diggable) d = Math.min(d, primSdf(p, x, y, z));
    }
    return d;
  }

  get hardCount(): number { return this.hardIdx.length; }
}
