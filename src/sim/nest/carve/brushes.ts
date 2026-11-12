// Carve-grid brushes: sphere, capsule (tunnel), axis-aligned ellipsoid (chamber), fill sphere.
//
// A brush visits every sample in its AABB (expanded by half the ramp) and writes the linear openness ramp
// q = clamp(0.5 - sdf / ramp, 0, 1) * 255: carve raises samples to q, fill lowers them to 255 - q.
// Carve only opens samples whose position passes `canDig` (unless `force`); fill ignores canDig.
// After a fill, closed samples left with a residual ramp but no open 26-neighbour are cleared to 0, so
// "carve then fill the same sphere" restores the original bytes exactly.

import type { Vec3 } from '@/core/math/vec3';
import { sdCapsuleSegment as sdCapsuleSegmentImp, sdEllipsoid as sdEllipsoidImp, sdSphere as sdSphereImp } from '@/core/math/sdf';
import { CHUNK3, OPEN_FRACTION as OPEN_FRACTIONImp, OPEN_MIN as OPEN_MINImp, chunkKey, emptyBox, meshChunksForBox, type VoxelBox } from './keys';
import { CARVE_TUNING } from './params';
import { holeCandidates, pruneBreaches, recordBreach } from './breaches';
import type { CarveStore } from './grid';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const sdCapsuleSegment = sdCapsuleSegmentImp, sdEllipsoid = sdEllipsoidImp, sdSphere = sdSphereImp, OPEN_FRACTION = OPEN_FRACTIONImp, OPEN_MIN = OPEN_MINImp;

/** May the sample at world (x, y, z) mm be opened? */
export type DigPredicate = (x: number, y: number, z: number) => boolean;

export interface BrushOptions {
  /** Samples failing this are not opened (carve only). Default: everything may be opened. */
  canDig?: DigPredicate | null;
  /** Ignore canDig: world-generation pre-carves (cracks through crusts, voids under slabs). */
  force?: boolean;
  /** Record breach spheres when the carve reaches open air (default true). */
  recordBreach?: boolean;
}

export interface BrushResult {
  /** mm^3 of SOLID substrate opened (carve) or closed (fill); brush parts in open air do not count. */
  volume: number;
  /** 0..1: share of the samples the brush wanted to open that canDig refused. */
  blockedFraction: number;
  /**
   * The carve connected carved space to open air: with the grid's hole probe (kernel), it turned sample columns
   * into terrain holes as the field's isHoleAt sees them; without one, an opened solid sample has an open-air
   * face neighbour.
   */
  breach: boolean;
  /** Chunk keys whose mesh must be rebuilt (sorted); also added to the grid's dirty set. */
  dirty: number[];
  /** Samples written. */
  changed: number;
  /** Samples that crossed the iso level upwards / downwards. */
  opened: number;
  closed: number;
  /** Bounds of the changed samples (empty box when nothing changed). */
  box: VoxelBox;
}

/** A brush shape: signed distance (negative inside), AABB of its surface, and inscribed spheres for breach records. */
export interface BrushShape {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  /** A representative centre and the farthest reach of the shape from it (mm), for the breach pre-check. */
  cx: number; cy: number; cz: number; reach: number;
  sdf(x: number, y: number, z: number): number;
  /** Writes the centre of a sphere inside the shape near p into out and returns its radius. */
  core(x: number, y: number, z: number, out: Vec3): number;
}

const _p: Vec3 = { x: 0, y: 0, z: 0 };
const _q: Vec3 = { x: 0, y: 0, z: 0 };

export function sphereShape(c: Vec3, r: number): BrushShape {
  const cx = c.x, cy = c.y, cz = c.z;
  return {
    minX: cx - r, minY: cy - r, minZ: cz - r, maxX: cx + r, maxY: cy + r, maxZ: cz + r,
    cx, cy, cz, reach: r,
    sdf(x, y, z) {
      _p.x = x - cx; _p.y = y - cy; _p.z = z - cz;
      return sdSphere(_p, r);
    },
    core(_x, _y, _z, out) {
      out.x = cx; out.y = cy; out.z = cz;
      return r;
    },
  };
}

export function capsuleShape(a: Vec3, b: Vec3, r: number): BrushShape {
  const A = { x: a.x, y: a.y, z: a.z }, B = { x: b.x, y: b.y, z: b.z };
  const bx = B.x - A.x, by = B.y - A.y, bz = B.z - A.z, bb = bx * bx + by * by + bz * bz;
  const half = Math.sqrt(bb) * 0.5;
  return {
    minX: Math.min(A.x, B.x) - r, minY: Math.min(A.y, B.y) - r, minZ: Math.min(A.z, B.z) - r,
    maxX: Math.max(A.x, B.x) + r, maxY: Math.max(A.y, B.y) + r, maxZ: Math.max(A.z, B.z) + r,
    cx: (A.x + B.x) * 0.5, cy: (A.y + B.y) * 0.5, cz: (A.z + B.z) * 0.5, reach: half + r,
    sdf(x, y, z) {
      _p.x = x; _p.y = y; _p.z = z;
      return sdCapsuleSegment(_p, A, B, r);
    },
    core(x, y, z, out) {
      let t = bb > 0 ? ((x - A.x) * bx + (y - A.y) * by + (z - A.z) * bz) / bb : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      out.x = A.x + bx * t; out.y = A.y + by * t; out.z = A.z + bz * t;
      return r;
    },
  };
}

export function ellipsoidShape(c: Vec3, radii: Vec3): BrushShape {
  const cx = c.x, cy = c.y, cz = c.z, rx = radii.x, ry = radii.y, rz = radii.z;
  const rmin = Math.min(rx, ry, rz);
  return {
    minX: cx - rx, minY: cy - ry, minZ: cz - rz, maxX: cx + rx, maxY: cy + ry, maxZ: cz + rz,
    cx, cy, cz, reach: Math.max(rx, ry, rz),
    sdf(x, y, z) {
      _p.x = x - cx; _p.y = y - cy; _p.z = z - cz;
      return sdEllipsoid(_p, rx, ry, rz);
    },
    core(x, y, z, out) {
      // a sphere of a fraction of rmin around the closest point of the shrunken box stays inside the ellipsoid
      const clampAxis = (d: number, ra: number) => Math.max(-(ra - rmin), Math.min(ra - rmin, d));
      out.x = cx + clampAxis(x - cx, rx); out.y = cy + clampAxis(y - cy, ry); out.z = cz + clampAxis(z - cz, rz);
      return rmin * CARVE_TUNING.ellipsoidCoreFraction;
    },
  };
}

/** Applies a brush to the grid. See BrushOptions / BrushResult. */
export function applyBrush(grid: CarveStore, shape: BrushShape, mode: 'carve' | 'fill', opts: BrushOptions = {}): BrushResult {
  const v = grid.voxel, invRamp = 1 / grid.ramp, h = grid.halfRamp;
  const i0 = Math.floor((shape.minX - h) / v), i1 = Math.ceil((shape.maxX + h) / v);
  const j0 = Math.floor((shape.minY - h) / v), j1 = Math.ceil((shape.maxY + h) / v);
  const k0 = Math.floor((shape.minZ - h) / v), k1 = Math.ceil((shape.maxZ + h) / v);
  const canDig = mode === 'carve' && !opts.force ? opts.canDig ?? null : null;
  const probe = grid.substrate;
  const wantBreach = mode === 'carve' && opts.recordBreach !== false;
  // Brushes deeper than their reach below the substrate surface cannot touch open air: skip per-sample probes.
  // (|substrate| never overestimates depth by more than the blend radius, which the margin covers.)
  const margin = CARVE_TUNING.breachCheckMarginBU * 2 * v;
  const nearSurface = probe !== null && probe(shape.cx, shape.cy, shape.cz) > -(shape.reach + margin);

  const box = emptyBox();
  let wanted = 0, blocked = 0, changed = 0, opened = 0, closed = 0, volume = 0, breach = false;
  const breachCentres: number[] = [];
  // field-based breach detection: columns this brush may turn into terrain holes, with their state before
  const hole = wantBreach && nearSurface ? grid.hole : null;
  const holeCols: number[] = [];
  if (hole !== null) holeCandidates(grid, shape, hole, i0, i1, j0, j1, k0, k1, holeCols);
  const voxelRule = wantBreach && nearSurface && hole === null;

  for (let k = k0; k <= k1; k++) {
    const z = k * v;
    for (let j = j0; j <= j1; j++) {
      const y = j * v;
      for (let i = i0; i <= i1; i++) {
        const x = i * v;
        let b = 0.5 - shape.sdf(x, y, z) * invRamp;
        b = b < 0 ? 0 : b > 1 ? 1 : b;
        const q = Math.round(b * 255);
        const idx = (i & 15) | ((j & 15) << 4) | ((k & 15) << 8);
        let arr = grid.chunk(i >> 4, j >> 4, k >> 4);
        const old = arr === undefined ? 0 : arr[idx];
        let nv: number;
        if (mode === 'carve') {
          if (q <= old) continue;
          wanted++;
          if (canDig !== null && !canDig(x, y, z)) { blocked++; continue; }
          if (arr === undefined) arr = grid.ensureChunk(i >> 4, j >> 4, k >> 4);
          nv = q;
        } else {
          nv = 255 - q;
          if (arr === undefined || old <= nv) continue;
        }
        arr[idx] = nv;
        grid.openFractionSum += OPEN_FRACTION[nv] - OPEN_FRACTION[old];
        let sub = -1;
        let solid = 1;
        if (nearSurface) {
          sub = probe!(x, y, z);
          solid = 0.5 - sub / v;
          solid = solid < 0 ? 0 : solid > 1 ? 1 : solid;
        }
        if (mode === 'carve') {
          volume += (OPEN_FRACTION[nv] - OPEN_FRACTION[old]) * solid;
          if (old < OPEN_MIN && nv >= OPEN_MIN) {
            opened++;
            if (voxelRule && sub <= 0 && touchesAir(probe!, x, y, z, v)) {
              breach = true;
              addBreachCentre(shape, x, y, z, breachCentres);
            }
          }
        } else {
          volume += (OPEN_FRACTION[old] - OPEN_FRACTION[nv]) * solid;
          if (old >= OPEN_MIN && nv < OPEN_MIN) closed++;
        }
        changed++;
        if (i < box.i0) box.i0 = i; if (i > box.i1) box.i1 = i;
        if (j < box.j0) box.j0 = j; if (j > box.j1) box.j1 = j;
        if (k < box.k0) box.k0 = k; if (k > box.k1) box.k1 = k;
      }
    }
  }

  if (hole !== null && changed > 0) {
    for (let n = 0; n < holeCols.length; n += 3) {
      if (holeCols[n + 2] === 1) continue; // already a hole before this brush
      const x = holeCols[n] * v, z = holeCols[n + 1] * v;
      if (!hole.isHole(x, z)) continue;
      breach = true;
      addBreachCentre(shape, x, hole.probeY(x, z), z, breachCentres);
    }
  }
  if (mode === 'fill' && changed > 0) {
    volume += clearResiduals(grid, box, nearSurface ? probe : null);
    dropEmptyChunks(grid, box);
    pruneBreaches(grid.data.breaches, (x, y, z) => grid.openness(x, y, z));
  }
  for (let n = 0; n < breachCentres.length; n += 4) {
    recordBreach(grid.data.breaches, breachCentres[n], breachCentres[n + 1], breachCentres[n + 2], breachCentres[n + 3]);
  }

  const vol3 = v * v * v;
  const dirty = meshChunksForBox(box);
  const result: BrushResult = {
    volume: volume * vol3,
    blockedFraction: wanted > 0 ? blocked / wanted : 0,
    breach, dirty, changed, opened, closed, box,
  };
  if (changed > 0) {
    grid.notify({ kind: mode, box: { ...box }, opened, closed }, dirty);
  }
  return result;
}

function touchesAir(probe: (x: number, y: number, z: number) => number, x: number, y: number, z: number, v: number): boolean {
  return probe(x, y + v, z) > 0 || probe(x + v, y, z) > 0 || probe(x - v, y, z) > 0
    || probe(x, y, z + v) > 0 || probe(x, y, z - v) > 0 || probe(x, y - v, z) > 0;
}

/**
 * Adds the brush's inscribed sphere near (x, y, z) to the record list of one brush (flat array x, y, z, r),
 * keeping records breachSpacingFraction * r apart and at most maxBreachRecordsPerBrush of them.
 */
function addBreachCentre(shape: BrushShape, x: number, y: number, z: number, out: number[]): void {
  const T = CARVE_TUNING;
  if (out.length >= T.maxBreachRecordsPerBrush * 4) return;
  const r = shape.core(x, y, z, _q);
  const min = T.breachSpacingFraction * r;
  for (let n = 0; n < out.length; n += 4) {
    const dx = out[n] - _q.x, dy = out[n + 1] - _q.y, dz = out[n + 2] - _q.z;
    if (dx * dx + dy * dy + dz * dz < min * min) return;
  }
  out.push(_q.x, _q.y, _q.z, r);
}

/**
 * After a fill: closed samples (< 128) with a non-zero residual but no open sample among their 26 neighbours
 * are set to 0. Valid ramps next to remaining cavities are kept. Returns the solid volume removed (in voxels).
 */
function clearResiduals(grid: CarveStore, box: VoxelBox, probe: ((x: number, y: number, z: number) => number) | null): number {
  const v = grid.voxel;
  const clear: number[] = [];
  for (let k = box.k0 - 1; k <= box.k1 + 1; k++)
    for (let j = box.j0 - 1; j <= box.j1 + 1; j++)
      for (let i = box.i0 - 1; i <= box.i1 + 1; i++) {
        const o = grid.sampleAt(i, j, k);
        if (o === 0 || o >= OPEN_MIN) continue;
        let openNear = false;
        for (let dk = -1; dk <= 1 && !openNear; dk++)
          for (let dj = -1; dj <= 1 && !openNear; dj++)
            for (let di = -1; di <= 1; di++) {
              if (grid.sampleAt(i + di, j + dj, k + dk) >= OPEN_MIN) { openNear = true; break; }
            }
        if (!openNear) clear.push(i, j, k);
      }
  let removed = 0;
  for (let n = 0; n < clear.length; n += 3) {
    const i = clear[n], j = clear[n + 1], k = clear[n + 2];
    const arr = grid.chunk(i >> 4, j >> 4, k >> 4)!;
    const idx = (i & 15) | ((j & 15) << 4) | ((k & 15) << 8);
    const old = arr[idx];
    let solid = 1;
    if (probe) {
      solid = 0.5 - probe(i * v, j * v, k * v) / v;
      solid = solid < 0 ? 0 : solid > 1 ? 1 : solid;
    }
    removed += OPEN_FRACTION[old] * solid;
    grid.openFractionSum -= OPEN_FRACTION[old];
    arr[idx] = 0;
    if (i < box.i0) box.i0 = i; if (i > box.i1) box.i1 = i;
    if (j < box.j0) box.j0 = j; if (j > box.j1) box.j1 = j;
    if (k < box.k0) box.k0 = k; if (k > box.k1) box.k1 = k;
  }
  return removed;
}

/** Removes stored chunks inside the box (+1) that are entirely solid now. */
function dropEmptyChunks(grid: CarveStore, box: VoxelBox): void {
  for (let cz = (box.k0 - 1) >> 4; cz <= (box.k1 + 1) >> 4; cz++)
    for (let cy = (box.j0 - 1) >> 4; cy <= (box.j1 + 1) >> 4; cy++)
      for (let cx = (box.i0 - 1) >> 4; cx <= (box.i1 + 1) >> 4; cx++) {
        const a = grid.chunk(cx, cy, cz);
        if (a === undefined) continue;
        let any = false;
        for (let s = 0; s < CHUNK3; s++) if (a[s] !== 0) { any = true; break; }
        if (!any) grid.removeChunk(chunkKey(cx, cy, cz));
      }
}
