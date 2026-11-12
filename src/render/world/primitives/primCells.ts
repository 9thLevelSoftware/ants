// A set of primitives prepared for fast per-camera partitioning (pure, no three; tested): instance data in flat
// typed arrays, a 2D grid of cells, and inside each cell one run per batch (shape, material, diggable) sorted by
// bounding radius, largest first. A partition pass visits only cells inside the cull distance and, inside a run,
// stops at the first primitive too small to see from the cell; so its cost follows what is visible, not the world.
import type { Primitive } from '@/sim/types';
import { instanceShape, lodAt, tintColor, type GeomKind, type Lod } from './primInstances';

/** One batch of instances that can share a draw call (per level of detail). */
export interface BatchDef {
  geom: GeomKind;
  material: string;
  diggable: boolean;
  /** Primitives of this batch in the set (capacity of its meshes). */
  count: number;
}

interface Run {
  batch: number;
  start: number;
  end: number;
}

interface Cell {
  /** Bounds of every member's bounding sphere, mm. */
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  maxR: number;
  runs: Run[];
}

/** View parameters of one partition pass. */
export interface PartitionView {
  x: number; y: number; z: number;
  /** Detailed geometry within this distance of a bounding sphere (plus LOD_SIZE_K radii for big objects), mm. */
  nearMm: number;
  /** Nothing is drawn farther than this (the haze is opaque there), mm. */
  cullMm: number;
  /** A primitive is skipped once its distance exceeds its radius times this (smaller than about a pixel). */
  sizeK: number;
}

/** Receives the visible instances: record index, batch index, level of detail. */
export type PartitionSink = (index: number, batch: number, lod: Lod) => void;

export class PrimSet {
  readonly ids: Int32Array;
  readonly matrices: Float32Array;
  readonly colors: Float32Array;
  readonly sizes: Float32Array;
  readonly pos: Float32Array;
  readonly radius: Float32Array;
  readonly batchOf: Uint16Array;
  /** Non-zero = not drawn (a static primitive whose object moved: the moved copy is drawn as a dynamic one). */
  readonly hidden: Uint8Array;
  readonly batches: BatchDef[] = [];
  private readonly indexById = new Map<number, number>();
  private readonly cells: Cell[] = [];
  private readonly order: Uint32Array;

  /**
   * @param cellMm edge of a grid cell, mm (a primitive belongs to the cell of its centre; the cell bounds grow to
   *   hold its whole bounding sphere, so big objects are never culled early)
   */
  constructor(prims: readonly Primitive[], diggable: (p: Primitive) => boolean, cellMm: number) {
    const n = prims.length;
    this.ids = new Int32Array(n);
    this.matrices = new Float32Array(n * 16);
    this.colors = new Float32Array(n * 3);
    this.sizes = new Float32Array(n * 4);
    this.pos = new Float32Array(n * 3);
    this.radius = new Float32Array(n);
    this.batchOf = new Uint16Array(n);
    this.hidden = new Uint8Array(n);
    this.order = new Uint32Array(n);
    const batchIndex = new Map<string, number>();
    const rgb: [number, number, number] = [1, 1, 1];
    prims.forEach((p, i) => {
      const shape = instanceShape(p);
      const dig = diggable(p);
      const key = `${shape.geom}|${p.material}|${dig ? 'd' : '-'}`;
      let b = batchIndex.get(key);
      if (b === undefined) {
        b = this.batches.length;
        batchIndex.set(key, b);
        this.batches.push({ geom: shape.geom, material: p.material, diggable: dig, count: 0 });
      }
      this.batches[b].count++;
      this.batchOf[i] = b;
      this.ids[i] = p.id;
      this.indexById.set(p.id, i);
      composeMatrix(p, this.matrices, i * 16);
      this.colors.set(tintColor(p, rgb), i * 3);
      this.sizes.set(shape.size, i * 4);
      this.pos[i * 3] = p.pos.x; this.pos[i * 3 + 1] = p.pos.y; this.pos[i * 3 + 2] = p.pos.z;
      this.radius[i] = Number.isFinite(shape.radius) ? Math.max(0, shape.radius) : 0;
    });
    this.buildCells(cellMm);
  }

  get size(): number {
    return this.ids.length;
  }

  indexOf(id: number): number {
    return this.indexById.get(id) ?? -1;
  }

  private buildCells(cellMm: number): void {
    const n = this.size;
    const byCell = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const key = `${Math.floor(this.pos[i * 3] / cellMm)},${Math.floor(this.pos[i * 3 + 2] / cellMm)}`;
      let list = byCell.get(key);
      if (!list) byCell.set(key, (list = []));
      list.push(i);
    }
    let k = 0;
    for (const list of byCell.values()) {
      list.sort((a, b) => this.batchOf[a] - this.batchOf[b] || this.radius[b] - this.radius[a]);
      const cell: Cell = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity, maxR: 0, runs: [] };
      for (const i of list) {
        const r = this.radius[i], x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
        cell.x0 = Math.min(cell.x0, x - r); cell.x1 = Math.max(cell.x1, x + r);
        cell.y0 = Math.min(cell.y0, y - r); cell.y1 = Math.max(cell.y1, y + r);
        cell.z0 = Math.min(cell.z0, z - r); cell.z1 = Math.max(cell.z1, z + r);
        cell.maxR = Math.max(cell.maxR, r);
        const last = cell.runs[cell.runs.length - 1];
        if (last && last.batch === this.batchOf[i]) last.end = k + 1;
        else cell.runs.push({ batch: this.batchOf[i], start: k, end: k + 1 });
        this.order[k++] = i;
      }
      this.cells.push(cell);
    }
  }

  /** Calls `sink` for every primitive to draw from this view, with its level of detail. */
  partition(v: PartitionView, sink: PartitionSink): void {
    const { pos, radius, hidden, order } = this;
    for (const c of this.cells) {
      const dx = Math.max(c.x0 - v.x, 0, v.x - c.x1), dy = Math.max(c.y0 - v.y, 0, v.y - c.y1), dz = Math.max(c.z0 - v.z, 0, v.z - c.z1);
      const dCell = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dCell > v.cullMm || dCell > c.maxR * v.sizeK) continue;
      for (const run of c.runs) {
        for (let k = run.start; k < run.end; k++) {
          const i = order[k], r = radius[i];
          if (dCell > r * v.sizeK) break; // the rest of the run is smaller still
          if (hidden[i]) continue;
          const d = Math.hypot(pos[i * 3] - v.x, pos[i * 3 + 1] - v.y, pos[i * 3 + 2] - v.z) - r;
          if (d > v.cullMm || d > r * v.sizeK) continue;
          sink(i, run.batch, lodAt(d, r, v.nearMm));
        }
      }
    }
  }
}

/** Rotation + translation of a primitive into `out` at `o` (column-major, as three's Matrix4.elements). */
export function composeMatrix(p: Primitive, out: Float32Array, o: number): void {
  let { x, y, z, w } = p.rot;
  const l = Math.hypot(x, y, z, w);
  if (l > 0 && Number.isFinite(l)) { x /= l; y /= l; z /= l; w /= l; } else { x = 0; y = 0; z = 0; w = 1; }
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  out[o] = 1 - (yy + zz); out[o + 1] = xy + wz; out[o + 2] = xz - wy; out[o + 3] = 0;
  out[o + 4] = xy - wz; out[o + 5] = 1 - (xx + zz); out[o + 6] = yz + wx; out[o + 7] = 0;
  out[o + 8] = xz + wy; out[o + 9] = yz - wx; out[o + 10] = 1 - (xx + yy); out[o + 11] = 0;
  out[o + 12] = p.pos.x; out[o + 13] = p.pos.y; out[o + 14] = p.pos.z; out[o + 15] = 1;
}
