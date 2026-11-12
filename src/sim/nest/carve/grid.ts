// Carve grid (negative space): sparse 16^3 chunks of openness bytes (0 solid .. 255 open, iso 127.5).
//
// STATE vs CACHE: the `CarveData` object passed in IS the saved state. Its parallel arrays `keys` / `chunks`
// and its `breaches` list are always kept in sync by this class, so saving needs nothing else. The Map from
// key to chunk is a derived cache (`rebuild()` recreates it after load or after outside edits of the arrays).
//
// Encoding: brushes write openness = clamp(0.5 - sdf / ramp, 0, 1) * 255, a LINEAR ramp of width `ramp`
// (= 2 voxels = 1 BU) centred on the shape surface. Hence cavity(p) = (openness - 0.5) * ramp is a true
// signed distance in mm (positive inside carved space) within +-ramp/2 of a carved wall, and saturates beyond
// (a valid Lipschitz-1 bound for sphere tracing, but its gradient is zero there: see docs/design/tdd/02-kernel.md).
//
// Pure TypeScript: no three, no DOM.

import type { Breach, CarveData } from '@/sim/types/geom';
import type { Vec3 } from '@/core/math/vec3';
import { CHUNK, CHUNK3, OPEN_FRACTION as OPEN_FRACTIONImp, OPEN_MIN as OPEN_MINImp, chunkKey as chunkKeyImp, keyCx, keyCy, keyCz, meshChunksForBox, type VoxelBox } from './keys';
import { CARVE_TUNING } from './params';
import {
  applyBrush, capsuleShape, ellipsoidShape, sphereShape, type BrushOptions, type BrushResult,
} from './brushes';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const chunkKey = chunkKeyImp, OPEN_FRACTION = OPEN_FRACTIONImp, OPEN_MIN = OPEN_MINImp;

/** Change notification sent to listeners after every brush that changed samples. */
export interface CarveChange {
  kind: 'carve' | 'fill';
  /** Bounds of the samples written. */
  box: VoxelBox;
  /** Samples that crossed the iso level upwards (became open). */
  opened: number;
  /** Samples that crossed the iso level downwards (became solid). */
  closed: number;
}
export type CarveListener = (change: CarveChange) => void;

/** Substrate distance probe (mm, > 0 in open air, carve grid ignored); supplied by the world field. */
export type SubstrateProbe = (x: number, y: number, z: number) => number;

/**
 * The world field's terrain hole test, used for breach detection when set (the kernel wires WorldField.isHoleAt).
 * `isHole(x, z)` must depend on the carve grid only through the openness at (x, probeY(x, z), z).
 */
export interface HoleProbe {
  /** Height (mm) where column (x, z) is tested: just below the terrain surface. */
  probeY(x: number, z: number): number;
  /** Is the terrain at column (x, z) open (carved space reaches the air)? */
  isHole(x: number, z: number): boolean;
}

export interface CarveGrid {
  /** The persisted state this grid edits in place. */
  readonly data: CarveData;
  /** mm per voxel (0.5 BU). */
  readonly voxel: number;
  /** Width of the openness ramp, mm (2 voxels). */
  readonly ramp: number;
  /** Bumps on every change; consumers compare it to detect edits. */
  readonly version: number;
  /** Recreate the key index from `data` (after load). Clears the dirty set and recounts volume. */
  rebuild(): void;
  /** Openness array of a chunk, or undefined if the chunk is entirely solid (not stored). */
  chunk(cx: number, cy: number, cz: number): Uint8Array | undefined;
  /** Raw openness byte 0..255 at integer sample coordinates. */
  sampleAt(i: number, j: number, k: number): number;
  /** Trilinear openness 0..1 at a world point (mm). */
  openness(x: number, y: number, z: number): number;
  /** Cavity pseudo-distance (mm): > 0 inside carved space, saturates at +-ramp/2. Gradient into `g` if given. */
  cavity(x: number, y: number, z: number, g?: Vec3 | null): number;
  /** As cavity(), but the value goes to out[slot] (hot callers: no boxed number is returned). */
  cavityTo(out: Float64Array, slot: number, x: number, y: number, z: number, g: Vec3 | null): void;
  carveSphere(c: Vec3, r: number, opts?: BrushOptions): BrushResult;
  /** Capsule from a to b with radius r (tunnels). */
  carveCapsule(a: Vec3, b: Vec3, r: number, opts?: BrushOptions): BrushResult;
  /** Axis-aligned ellipsoid (chambers). */
  carveEllipsoid(c: Vec3, radii: Vec3, opts?: BrushOptions): BrushResult;
  /** Make a sphere solid (iso at radius r); residual ramps without an open neighbour are cleared. */
  fillSphere(c: Vec3, r: number, opts?: BrushOptions): BrushResult;
  /** Chunk keys whose mesh must be rebuilt since the last call (sorted); clears the set. */
  takeDirty(): number[];
  /** Number of dirty chunk keys pending. */
  dirtyCount(): number;
  /**
   * Marks the meshes that read stored samples inside the box dirty without changing data (their discard
   * attribute changed, e.g. a diggable primitive moved). Inclusive sample indices.
   */
  markDirty(box: VoxelBox): void;
  /** Every key that may carry a mesh: stored chunks and their -x/-y/-z neighbours (sorted). */
  meshKeys(): number[];
  /** Openness volume of the whole grid, mm^3 (sum of open fractions; includes brush parts in open air). */
  openVolume(): number;
  /** Calls fn for every open sample (>= 128) of a stored chunk: global sample indices and the byte. */
  forEachOpenSample(key: number, fn: (i: number, j: number, k: number, open: number) => void): void;
  /** Breach records (same array as data.breaches). */
  readonly breaches: Breach[];
  setSubstrateProbe(probe: SubstrateProbe | null): void;
  /**
   * With a hole probe, a carve reports a breach exactly when it opens new terrain-hole columns as the field sees
   * them; without one, by the voxel rule (an opened solid sample with an open-air face neighbour). Needs the
   * substrate probe too (it limits the work to brushes near the surface).
   */
  setHoleProbe(probe: HoleProbe | null): void;
  addListener(fn: CarveListener): void;
  removeListener(fn: CarveListener): void;
}

export function createCarveGrid(data: CarveData): CarveGrid {
  return new CarveStore(data);
}

/** Implementation; brushes (brushes.ts) use the package-internal members marked below. */
export class CarveStore implements CarveGrid {
  readonly data: CarveData;
  readonly voxel: number;
  readonly invVoxel: number;
  readonly ramp: number;
  readonly halfRamp: number;
  version = 0;
  /** @internal key -> index into data.keys / data.chunks */
  readonly index = new Map<number, number>();
  /** @internal */
  readonly dirty = new Set<number>();
  /** @internal */
  substrate: SubstrateProbe | null = null;
  /** @internal */
  hole: HoleProbe | null = null;
  /** @internal running sum of OPEN_FRACTION over all stored samples */
  openFractionSum = 0;
  private listeners: CarveListener[] = [];
  private lastKey = -1;
  private lastArr: Uint8Array | undefined = undefined;

  constructor(data: CarveData) {
    if (!(data.voxel > 0)) throw new Error('CarveData.voxel must be > 0');
    this.data = data;
    this.voxel = data.voxel;
    this.invVoxel = 1 / data.voxel;
    this.ramp = CARVE_TUNING.rampVoxels * data.voxel;
    this.halfRamp = this.ramp * 0.5;
    this.rebuild();
  }

  get breaches(): Breach[] {
    return this.data.breaches;
  }

  rebuild(): void {
    const { keys, chunks } = this.data;
    if (keys.length !== chunks.length) throw new Error('CarveData keys/chunks length mismatch');
    this.index.clear();
    this.dirty.clear();
    this.openFractionSum = 0;
    for (let n = 0; n < keys.length; n++) {
      if (chunks[n].length !== CHUNK3) throw new Error('carve chunk must hold 4096 bytes');
      this.index.set(keys[n], n);
      const a = chunks[n];
      for (let s = 0; s < CHUNK3; s++) this.openFractionSum += OPEN_FRACTION[a[s]];
    }
    this.lastKey = -1;
    this.lastArr = undefined;
    this.version++;
  }

  chunk(cx: number, cy: number, cz: number): Uint8Array | undefined {
    const key = chunkKey(cx, cy, cz);
    if (key === this.lastKey) return this.lastArr;
    const n = this.index.get(key);
    const a = n === undefined ? undefined : this.data.chunks[n];
    this.lastKey = key;
    this.lastArr = a;
    return a;
  }

  /** @internal create a zero chunk (appended to the persisted arrays). */
  ensureChunk(cx: number, cy: number, cz: number): Uint8Array {
    const have = this.chunk(cx, cy, cz);
    if (have) return have;
    const key = chunkKey(cx, cy, cz);
    const a = new Uint8Array(CHUNK3);
    this.index.set(key, this.data.keys.length);
    this.data.keys.push(key);
    this.data.chunks.push(a);
    this.lastKey = key;
    this.lastArr = a;
    return a;
  }

  /** @internal drop a stored chunk that became entirely solid (swap-remove keeps the arrays dense). */
  removeChunk(key: number): void {
    const n = this.index.get(key);
    if (n === undefined) return;
    const { keys, chunks } = this.data;
    const last = keys.length - 1;
    if (n !== last) {
      keys[n] = keys[last];
      chunks[n] = chunks[last];
      this.index.set(keys[n], n);
    }
    keys.pop();
    chunks.pop();
    this.index.delete(key);
    this.lastKey = -1;
    this.lastArr = undefined;
  }

  /** @internal called by brushes after they changed samples */
  notify(change: CarveChange, dirtyKeys: number[]): void {
    this.version++;
    for (const k of dirtyKeys) this.dirty.add(k);
    for (const fn of this.listeners) fn(change);
  }

  sampleAt(i: number, j: number, k: number): number {
    const a = this.chunk(i >> 4, j >> 4, k >> 4);
    return a === undefined ? 0 : a[(i & 15) | ((j & 15) << 4) | ((k & 15) << 8)];
  }

  openness(x: number, y: number, z: number): number {
    return this.cavity(x, y, z, null) / this.ramp + 0.5;
  }

  /** Result of the last sampleCavity() (a field: returning a double from a large function would box it). */
  private cv = 0;

  cavity(x: number, y: number, z: number, g: Vec3 | null = null): number {
    this.sampleCavity(x, y, z, g);
    return this.cv;
  }

  cavityTo(out: Float64Array, slot: number, x: number, y: number, z: number, g: Vec3 | null): void {
    this.sampleCavity(x, y, z, g);
    out[slot] = this.cv;
  }

  private sampleCavity(x: number, y: number, z: number, g: Vec3 | null): void {
    const inv = this.invVoxel;
    const fx = x * inv, fy = y * inv, fz = z * inv;
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const li = i & 15, lj = j & 15, lk = k & 15;
    let c000: number, c100: number, c010: number, c110: number, c001: number, c101: number, c011: number, c111: number;
    if (li < 15 && lj < 15 && lk < 15) {
      const a = this.chunk(i >> 4, j >> 4, k >> 4);
      if (a === undefined) {
        if (g) { g.x = 0; g.y = 0; g.z = 0; }
        this.cv = -this.halfRamp;
        return;
      }
      const o = li | (lj << 4) | (lk << 8);
      c000 = a[o]; c100 = a[o + 1]; c010 = a[o + 16]; c110 = a[o + 17];
      c001 = a[o + 256]; c101 = a[o + 257]; c011 = a[o + 272]; c111 = a[o + 273];
    } else {
      c000 = this.sampleAt(i, j, k); c100 = this.sampleAt(i + 1, j, k);
      c010 = this.sampleAt(i, j + 1, k); c110 = this.sampleAt(i + 1, j + 1, k);
      c001 = this.sampleAt(i, j, k + 1); c101 = this.sampleAt(i + 1, j, k + 1);
      c011 = this.sampleAt(i, j + 1, k + 1); c111 = this.sampleAt(i + 1, j + 1, k + 1);
    }
    const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
    const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
    const s = this.ramp / 255;
    if (g) {
      // analytic derivative of the trilinear interpolant, chained to mm
      const d00 = c100 - c000, d10 = c110 - c010, d01 = c101 - c001, d11 = c111 - c011;
      const dz0 = d00 + (d10 - d00) * ty, dz1 = d01 + (d11 - d01) * ty;
      const k1 = s * inv;
      g.x = (dz0 + (dz1 - dz0) * tz) * k1;
      g.y = ((x10 - x00) + ((x11 - x01) - (x10 - x00)) * tz) * k1;
      g.z = (y1 - y0) * k1;
    }
    this.cv = (y0 + (y1 - y0) * tz) * s - this.halfRamp;
  }

  carveSphere(c: Vec3, r: number, opts?: BrushOptions): BrushResult {
    return applyBrush(this, sphereShape(c, r), 'carve', opts);
  }

  carveCapsule(a: Vec3, b: Vec3, r: number, opts?: BrushOptions): BrushResult {
    return applyBrush(this, capsuleShape(a, b, r), 'carve', opts);
  }

  carveEllipsoid(c: Vec3, radii: Vec3, opts?: BrushOptions): BrushResult {
    return applyBrush(this, ellipsoidShape(c, radii), 'carve', opts);
  }

  fillSphere(c: Vec3, r: number, opts?: BrushOptions): BrushResult {
    return applyBrush(this, sphereShape(c, r), 'fill', opts);
  }

  takeDirty(): number[] {
    const out = [...this.dirty].sort((a, b) => a - b);
    this.dirty.clear();
    return out;
  }

  dirtyCount(): number {
    return this.dirty.size;
  }

  markDirty(box: VoxelBox): void {
    for (const key of this.data.keys) {
      const bi = keyCx(key) * CHUNK, bj = keyCy(key) * CHUNK, bk = keyCz(key) * CHUNK;
      const part: VoxelBox = {
        i0: Math.max(box.i0, bi), j0: Math.max(box.j0, bj), k0: Math.max(box.k0, bk),
        i1: Math.min(box.i1, bi + CHUNK - 1), j1: Math.min(box.j1, bj + CHUNK - 1), k1: Math.min(box.k1, bk + CHUNK - 1),
      };
      if (part.i1 < part.i0 || part.j1 < part.j0 || part.k1 < part.k0) continue;
      for (const k of meshChunksForBox(part)) this.dirty.add(k);
    }
  }

  meshKeys(): number[] {
    const set = new Set<number>();
    for (const key of this.data.keys) {
      const cx = keyCx(key), cy = keyCy(key), cz = keyCz(key);
      for (let dz = -1; dz <= 0; dz++)
        for (let dy = -1; dy <= 0; dy++)
          for (let dx = -1; dx <= 0; dx++) set.add(chunkKey(cx + dx, cy + dy, cz + dz));
    }
    return [...set].sort((a, b) => a - b);
  }

  openVolume(): number {
    return this.openFractionSum * this.voxel * this.voxel * this.voxel;
  }

  forEachOpenSample(key: number, fn: (i: number, j: number, k: number, open: number) => void): void {
    const n = this.index.get(key);
    if (n === undefined) return;
    const a = this.data.chunks[n];
    const bi = keyCx(key) * CHUNK, bj = keyCy(key) * CHUNK, bk = keyCz(key) * CHUNK;
    for (let s = 0; s < CHUNK3; s++) {
      const o = a[s];
      if (o >= OPEN_MIN) fn(bi + (s & 15), bj + ((s >> 4) & 15), bk + (s >> 8), o);
    }
  }

  setSubstrateProbe(probe: SubstrateProbe | null): void {
    this.substrate = probe;
  }

  setHoleProbe(probe: HoleProbe | null): void {
    this.hole = probe;
  }

  addListener(fn: CarveListener): void {
    if (!this.listeners.includes(fn)) this.listeners.push(fn);
  }

  removeListener(fn: CarveListener): void {
    const n = this.listeners.indexOf(fn);
    if (n >= 0) this.listeners.splice(n, 1);
  }
}
