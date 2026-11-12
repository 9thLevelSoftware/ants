// Solid primitives for the world field: per-primitive evaluation cache, signed distance + analytic gradient,
// and a uniform 3D spatial hash.
//
// Distances come from src/core/math/sdf.ts (positive OUTSIDE the shape, i.e. in free space for a solid, so
// they enter the world field with their sign unchanged). Gradients are analytic and tested against central
// differences of the core functions.
//
// Hash invariant: a primitive is registered in every cell overlapping its AABB grown by `margin`. Therefore
// any primitive NOT listed in the cell containing p is at least `margin` away from p, and the field may use
// `margin` as a lower bound for everything unlisted (WorldField does exactly that).
// Pure, allocation-free in queries (insert/remove allocate).

import type { Primitive } from '@/sim/types/geom';
import type { Vec3 } from '@/core/math/vec3';
import { sdCappedCylinder as sdCappedCylinderImp, sdCapsule as sdCapsuleImp, sdEllipsoid as sdEllipsoidImp, sdRoundBox as sdRoundBoxImp } from '@/core/math/sdf';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const sdCappedCylinder = sdCappedCylinderImp, sdCapsule = sdCapsuleImp, sdEllipsoid = sdEllipsoidImp, sdRoundBox = sdRoundBoxImp;

export const SHAPE_BOX = 0;
export const SHAPE_CYLINDER = 1;
export const SHAPE_CAPSULE = 2;
export const SHAPE_ELLIPSOID = 3;

/** Derived, never persisted: everything needed to evaluate one primitive fast. */
export interface PrimEntry {
  prim: Primitive;
  id: number;
  shape: number;
  /** Centre (mm) and local->world rotation matrix (row-major). */
  px: number; py: number; pz: number;
  m00: number; m01: number; m02: number;
  m10: number; m11: number; m12: number;
  m20: number; m21: number; m22: number;
  /** Size and rounding as in Primitive. */
  size: Vec3;
  round: number;
  /** In the diggable (soil) group of the field. */
  diggable: boolean;
  /** World AABB of the solid (mm). */
  minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number;
  /** Hash cells the entry is registered in. */
  cells: number[];
  /** Query de-duplication stamp. */
  stamp: number;
}

const _l: Vec3 = { x: 0, y: 0, z: 0 };

/** Signed distance (mm, > 0 outside) of a primitive at world (x, y, z); gradient (unit-ish) into g if given. */
export function primEval(e: PrimEntry, x: number, y: number, z: number, g: Vec3 | null): number {
  primEvalInto(e, x, y, z, g);
  return PRIM_D[0];
}

/** Result register of primEvalInto (a typed array, so hot callers never get a boxed double back). */
export const PRIM_D = new Float64Array(1);

/** As primEval, but the distance goes to PRIM_D[0]. */
export function primEvalInto(e: PrimEntry, x: number, y: number, z: number, g: Vec3 | null): void {
  const dx = x - e.px, dy = y - e.py, dz = z - e.pz;
  const lx = e.m00 * dx + e.m10 * dy + e.m20 * dz;
  const ly = e.m01 * dx + e.m11 * dy + e.m21 * dz;
  const lz = e.m02 * dx + e.m12 * dy + e.m22 * dz;
  _l.x = lx; _l.y = ly; _l.z = lz;
  const s = e.size;
  let d: number;
  switch (e.shape) {
    case SHAPE_BOX: d = sdRoundBox(_l, s, e.round); if (g) boxGrad(lx, ly, lz, s, e.round, g); break;
    case SHAPE_CYLINDER: d = sdCappedCylinder(_l, s.x, s.y, e.round); if (g) cylinderGrad(lx, ly, lz, s.x, s.y, e.round, g); break;
    case SHAPE_CAPSULE: d = sdCapsule(_l, s.y, s.x); if (g) capsuleGrad(lx, ly, lz, s.y, g); break;
    default: d = sdEllipsoid(_l, s.x, s.y, s.z); if (g) ellipsoidGrad(lx, ly, lz, s, g); break;
  }
  if (g) {
    const gx = g.x, gy = g.y, gz = g.z;
    g.x = e.m00 * gx + e.m01 * gy + e.m02 * gz;
    g.y = e.m10 * gx + e.m11 * gy + e.m12 * gz;
    g.z = e.m20 * gx + e.m21 * gy + e.m22 * gz;
  }
  PRIM_D[0] = d;
}

const sgn = (v: number) => (v < 0 ? -1 : 1);

function boxGrad(x: number, y: number, z: number, h: Vec3, r: number, g: Vec3): void {
  const rr = Math.max(0, Math.min(r, h.x, h.y, h.z));
  const qx = Math.abs(x) - h.x + rr, qy = Math.abs(y) - h.y + rr, qz = Math.abs(z) - h.z + rr;
  if (qx > 0 || qy > 0 || qz > 0) {
    const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
    const l = Math.sqrt(ox * ox + oy * oy + oz * oz);
    g.x = (sgn(x) * ox) / l; g.y = (sgn(y) * oy) / l; g.z = (sgn(z) * oz) / l;
  } else if (qx >= qy && qx >= qz) { g.x = sgn(x); g.y = 0; g.z = 0; }
  else if (qy >= qz) { g.x = 0; g.y = sgn(y); g.z = 0; }
  else { g.x = 0; g.y = 0; g.z = sgn(z); }
}

function cylinderGrad(x: number, y: number, z: number, radius: number, halfH: number, round: number, g: Vec3): void {
  const rr = Math.max(0, Math.min(round, radius, halfH));
  const rho = Math.sqrt(x * x + z * z);
  const dr = rho - radius + rr, dy = Math.abs(y) - halfH + rr;
  let gr: number, gy: number;
  if (dr > 0 || dy > 0) {
    const or = dr > 0 ? dr : 0, oy = dy > 0 ? dy : 0, l = Math.sqrt(or * or + oy * oy);
    gr = or / l; gy = oy / l;
  } else if (dr > dy) { gr = 1; gy = 0; } else { gr = 0; gy = 1; }
  if (rho > 1e-9) { g.x = (gr * x) / rho; g.z = (gr * z) / rho; } else { g.x = gr; g.z = 0; }
  g.y = gy * sgn(y);
}

function capsuleGrad(x: number, y: number, z: number, halfLen: number, g: Vec3): void {
  const cy = y < -halfLen ? -halfLen : y > halfLen ? halfLen : y;
  const ey = y - cy, l = Math.sqrt(x * x + ey * ey + z * z);
  if (l < 1e-9) { g.x = 0; g.y = 1; g.z = 0; return; }
  g.x = x / l; g.y = ey / l; g.z = z / l;
}

/** Normal of the implicit ellipsoid through p (exact direction on the surface). */
function ellipsoidGrad(x: number, y: number, z: number, r: Vec3, g: Vec3): void {
  const ax = x / (r.x * r.x), ay = y / (r.y * r.y), az = z / (r.z * r.z);
  const l = Math.sqrt(ax * ax + ay * ay + az * az);
  if (l < 1e-12) { g.x = 0; g.y = 1; g.z = 0; return; }
  g.x = ax / l; g.y = ay / l; g.z = az / l;
}

const SHAPE_CODES: Record<Primitive['shape'], number> = {
  box: SHAPE_BOX, cylinder: SHAPE_CYLINDER, capsule: SHAPE_CAPSULE, ellipsoid: SHAPE_ELLIPSOID,
};

/** Builds the evaluation cache of a primitive (allocates). */
export function makePrimEntry(prim: Primitive, diggable: boolean): PrimEntry {
  let qx = prim.rot.x, qy = prim.rot.y, qz = prim.rot.z, qw = prim.rot.w;
  const ql = Math.hypot(qx, qy, qz, qw) || 1;
  qx /= ql; qy /= ql; qz /= ql; qw /= ql;
  const m00 = 1 - 2 * (qy * qy + qz * qz), m01 = 2 * (qx * qy - qz * qw), m02 = 2 * (qx * qz + qy * qw);
  const m10 = 2 * (qx * qy + qz * qw), m11 = 1 - 2 * (qx * qx + qz * qz), m12 = 2 * (qy * qz - qx * qw);
  const m20 = 2 * (qx * qz - qy * qw), m21 = 2 * (qy * qz + qx * qw), m22 = 1 - 2 * (qx * qx + qy * qy);
  const shape = SHAPE_CODES[prim.shape];
  const s = prim.size;
  let ex: number, ey: number, ez: number;
  if (shape === SHAPE_CAPSULE) { ex = s.x; ey = s.y + s.x; ez = s.x; }
  else if (shape === SHAPE_CYLINDER) { ex = s.x; ey = s.y; ez = s.x; }
  else { ex = s.x; ey = s.y; ez = s.z; }
  const wx = Math.abs(m00) * ex + Math.abs(m01) * ey + Math.abs(m02) * ez;
  const wy = Math.abs(m10) * ex + Math.abs(m11) * ey + Math.abs(m12) * ez;
  const wz = Math.abs(m20) * ex + Math.abs(m21) * ey + Math.abs(m22) * ez;
  const p = prim.pos;
  return {
    prim, id: prim.id, shape, px: p.x, py: p.y, pz: p.z,
    m00, m01, m02, m10, m11, m12, m20, m21, m22,
    size: { x: s.x, y: s.y, z: s.z }, round: prim.round, diggable,
    minX: p.x - wx, minY: p.y - wy, minZ: p.z - wz, maxX: p.x + wx, maxY: p.y + wy, maxZ: p.z + wz,
    cells: [], stamp: 0,
  };
}

const CELL_OFFSET = 4096;
const CELL_SPAN = 8192;

/** Uniform 3D spatial hash of primitive entries. Cell lists are kept sorted by primitive id (order-independent). */
export class PrimHash {
  readonly cell: number;
  readonly margin: number;
  private readonly inv: number;
  private readonly cells = new Map<number, PrimEntry[]>();
  private readonly byId = new Map<number, PrimEntry>();
  private stampCounter = 0;
  private lastKey = -1;
  private lastList: PrimEntry[] | undefined = undefined;

  constructor(cell: number, margin: number) {
    if (margin > cell) throw new Error('PrimHash: margin must not exceed the cell size');
    this.cell = cell;
    this.margin = margin;
    this.inv = 1 / cell;
  }

  get size(): number {
    return this.byId.size;
  }

  get(id: number): PrimEntry | undefined {
    return this.byId.get(id);
  }

  entries(): IterableIterator<PrimEntry> {
    return this.byId.values();
  }

  private key(ix: number, iy: number, iz: number): number {
    return (ix + CELL_OFFSET) + (iy + CELL_OFFSET) * CELL_SPAN + (iz + CELL_OFFSET) * CELL_SPAN * CELL_SPAN;
  }

  add(e: PrimEntry): void {
    if (this.byId.has(e.id)) this.remove(e.id);
    this.byId.set(e.id, e);
    const m = this.margin, inv = this.inv;
    const ix0 = Math.floor((e.minX - m) * inv), ix1 = Math.floor((e.maxX + m) * inv);
    const iy0 = Math.floor((e.minY - m) * inv), iy1 = Math.floor((e.maxY + m) * inv);
    const iz0 = Math.floor((e.minZ - m) * inv), iz1 = Math.floor((e.maxZ + m) * inv);
    e.cells.length = 0;
    for (let iz = iz0; iz <= iz1; iz++) for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
      const k = this.key(ix, iy, iz);
      let list = this.cells.get(k);
      if (!list) { list = []; this.cells.set(k, list); }
      let at = list.length;
      while (at > 0 && list[at - 1].id > e.id) at--;
      list.splice(at, 0, e);
      e.cells.push(k);
    }
    this.lastKey = -1;
  }

  remove(id: number): PrimEntry | undefined {
    const e = this.byId.get(id);
    if (!e) return undefined;
    for (const k of e.cells) {
      const list = this.cells.get(k);
      if (!list) continue;
      const n = list.indexOf(e);
      if (n >= 0) list.splice(n, 1);
      if (list.length === 0) this.cells.delete(k);
    }
    e.cells.length = 0;
    this.byId.delete(id);
    this.lastKey = -1;
    return e;
  }

  /** Entries registered in the cell containing (x, y, z); undefined when none. Do not mutate the list. */
  at(x: number, y: number, z: number): PrimEntry[] | undefined {
    const inv = this.inv;
    const k = this.key(Math.floor(x * inv), Math.floor(y * inv), Math.floor(z * inv));
    if (k === this.lastKey) return this.lastList;
    const list = this.cells.get(k);
    this.lastKey = k;
    this.lastList = list;
    return list;
  }

  /** Unique entries whose registration overlaps the AABB, appended to out (cleared first). */
  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: PrimEntry[]): PrimEntry[] {
    out.length = 0;
    // a non-finite bound would never end the loops below (-Infinity + 1 === -Infinity): nothing overlaps it
    if (!Number.isFinite(minX + minY + minZ + maxX + maxY + maxZ)) return out;
    const stamp = ++this.stampCounter;
    const inv = this.inv;
    for (let iz = Math.floor(minZ * inv); iz <= Math.floor(maxZ * inv); iz++)
      for (let iy = Math.floor(minY * inv); iy <= Math.floor(maxY * inv); iy++)
        for (let ix = Math.floor(minX * inv); ix <= Math.floor(maxX * inv); ix++) {
          const list = this.cells.get(this.key(ix, iy, iz));
          if (!list) continue;
          for (const e of list) if (e.stamp !== stamp) { e.stamp = stamp; out.push(e); }
        }
    return out;
  }
}
