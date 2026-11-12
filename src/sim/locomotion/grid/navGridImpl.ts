// The NavGrid service (GDD 04 §11): coarse 16 BU cells built from WorldData, refined from the world field (tall
// objects block cells, mounds raise the ground), A* with string-pulling smoothing (grid line of sight plus
// field.segmentFree above the ground), cached flow fields, runtime cost overlays and incremental re-derivation.
// Derived cache: never persisted, rebuilt by createSim.

import type { Vec3 } from '@/core/math/vec3';
import type { NavClass, NavGrid, Primitive, WorldData } from '@/sim/types';
import { NAV_CLASSES } from '@/sim/types';
import type { WorldField } from '@/sim/world/field';
import { deriveFromField, deriveFromWorld, isBlocked, type GridData } from './gridData';
import { GridSearch, lineClear, type CostDisc } from './search';

/** Smoothing: segments are tested this far above the ground, with this sweep radius (BU). */
const SMOOTH_LIFT_BU = 2.5;
const SMOOTH_RADIUS_BU = 1;
/** Longest smoothed segment, in cells (bounds the field traces). */
const SMOOTH_MAX_CELLS = 12;
/** Nearest passable cell search radius when an endpoint is blocked, cells. */
const SNAP_RADIUS = 6;
/** Flow fields kept (least recently used dropped). */
const FLOW_CACHE = 12;

export interface FindPathOptions {
  /** Cost discs (avoid markers). */
  discs?: readonly CostDisc[] | null;
}

interface FlowEntry {
  key: string;
  sig: string;
  version: number;
  dist: Float32Array;
  used: number;
}

/** The locomotion nav grid: the NavGrid contract plus planner queries. */
export interface LocoNavGrid extends NavGrid {
  readonly data: GridData;
  /** Bumped whenever cells change (flow fields and paths planned before are stale). */
  readonly version: number;
  /** Has the world field been attached (tall-object cover derived)? */
  readonly hasField: boolean;
  attachField(field: WorldField, prims: readonly Primitive[]): void;
  /** Re-derives the cells overlapping the box (mm) from the field: after dynamic primitives or mounds changed. */
  refreshArea(x0: number, z0: number, x1: number, z1: number, prims: readonly Primitive[]): void;
  cellOf(x: number, z: number): number;
  groundAt(c: number): number;
  isCellBlocked(c: number): boolean;
  /** Straight segment over passable cells only (and outside the discs); no field test. */
  gridVisible(a: Vec3, b: Vec3, discs?: readonly CostDisc[] | null): boolean;
  /** Straight segment passable (grid cells, discs) and, with a field, free of solids SMOOTH_LIFT above ground. */
  segmentWalkable(a: Vec3, b: Vec3, discs?: readonly CostDisc[] | null): boolean;
  findPathEx(from: Vec3, to: Vec3, out: Vec3[], opts?: FindPathOptions): boolean;
  /**
   * Cost-to-seed field (multi-source Dijkstra from the seed points' cells), cached under `key` and rebuilt when
   * `sig` or the grid version changes. Returns the distance array (Infinity = unreachable).
   */
  flowField(key: string, sig: string, seeds: readonly Vec3[]): Float32Array;
  /** Next cell down a flow field from p after up to `steps` steps (cell centre into out); returns dist at p. */
  flowNext(dist: Float32Array, p: Vec3, steps: number, out: Vec3): number;
  stats(): { searches: number; expanded: number; flowBuilds: number };
}

export function isLocoNavGrid(g: NavGrid): g is LocoNavGrid {
  return typeof (g as Partial<LocoNavGrid>).findPathEx === 'function';
}

export function createLocoNavGrid(world: WorldData): LocoNavGrid {
  return new NavGridImpl(world);
}

const _cells: number[] = [];
const _a: Vec3 = { x: 0, y: 0, z: 0 }, _b: Vec3 = { x: 0, y: 0, z: 0 }, _t: Vec3 = { x: 0, y: 0, z: 0 };

class NavGridImpl implements LocoNavGrid {
  readonly data: GridData;
  readonly cell: number;
  readonly w: number;
  readonly h: number;
  version = 0;
  private field: WorldField | null = null;
  private readonly search: GridSearch;
  private readonly flows: FlowEntry[] = [];
  private clock = 0;
  private counters = { searches: 0, expanded: 0, flowBuilds: 0 };

  constructor(world: WorldData) {
    this.data = deriveFromWorld(world);
    this.cell = this.data.cell;
    this.w = this.data.w;
    this.h = this.data.h;
    this.search = new GridSearch(this.data);
  }

  get hasField(): boolean {
    return this.field !== null;
  }

  attachField(field: WorldField, prims: readonly Primitive[]): void {
    this.field = field;
    deriveFromField(this.data, field, prims);
    this.version++;
  }

  refreshArea(x0: number, z0: number, x1: number, z1: number, prims: readonly Primitive[]): void {
    if (!this.field) return;
    deriveFromField(this.data, this.field, prims, x0, z0, x1, z1);
    this.version++;
  }

  cellOf(x: number, z: number): number {
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    if (!(ix >= 0 && iz >= 0 && ix < this.w && iz < this.h)) return -1;
    return iz * this.w + ix;
  }

  groundAt(c: number): number {
    return this.data.ground[c];
  }

  isCellBlocked(c: number): boolean {
    return c < 0 || isBlocked(this.data, c);
  }

  classAt(x: number, z: number): NavClass {
    const c = this.cellOf(x, z);
    if (c < 0) return 'edge';
    if (this.data.covered[c] !== 0) return 'blocked-solid';
    return NAV_CLASSES[this.data.cls[c]] ?? 'open';
  }

  costAt(x: number, z: number): number {
    const c = this.cellOf(x, z);
    return c < 0 ? Infinity : this.data.cost[c] * this.data.dyn[c];
  }

  blocked(x: number, z: number): boolean {
    return this.isCellBlocked(this.cellOf(x, z));
  }

  setCostMult(ix: number, iz: number, mult: number): void {
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return;
    const m = Number.isNaN(mult) ? 1 : Math.max(1, mult);
    const c = iz * this.w + ix;
    if (this.data.dyn[c] !== m) { this.data.dyn[c] = m; this.version++; }
  }

  findPath(from: Vec3, to: Vec3, out: Vec3[]): boolean {
    return this.findPathEx(from, to, out);
  }

  /** Nearest passable cell to c within SNAP_RADIUS rings (deterministic scan order), -1 if none. */
  private snap(c: number): number {
    if (c < 0) return -1;
    if (!isBlocked(this.data, c)) return c;
    const cx = c % this.w, cz = (c - cx) / this.w;
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= SNAP_RADIUS && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= this.w || z >= this.h) continue;
        const n = z * this.w + x;
        const d = dx * dx + dz * dz;
        if (!isBlocked(this.data, n) && d < bestD) { best = n; bestD = d; }
      }
    }
    return best;
  }

  private clampedCell(p: Vec3): number {
    const ix = Math.min(this.w - 1, Math.max(0, Math.floor(p.x / this.cell)));
    const iz = Math.min(this.h - 1, Math.max(0, Math.floor(p.z / this.cell)));
    return iz * this.w + ix;
  }

  private centre(c: number, out: Vec3): Vec3 {
    const ix = c % this.w, iz = (c - ix) / this.w;
    out.x = (ix + 0.5) * this.cell; out.z = (iz + 0.5) * this.cell; out.y = this.data.ground[c];
    return out;
  }

  gridVisible(a: Vec3, b: Vec3, discs: readonly CostDisc[] | null = null): boolean {
    return lineClear(this.data, a.x, a.z, b.x, b.z, discs);
  }

  segmentWalkable(a: Vec3, b: Vec3, discs: readonly CostDisc[] | null = null): boolean {
    if (!lineClear(this.data, a.x, a.z, b.x, b.z, discs)) return false;
    const f = this.field;
    if (!f) return true;
    const lift = SMOOTH_LIFT_BU * this.data.bu;
    _a.x = a.x; _a.y = f.height(a.x, a.z) + lift; _a.z = a.z;
    _b.x = b.x; _b.y = f.height(b.x, b.z) + lift; _b.z = b.z;
    return f.segmentFree(_a, _b, SMOOTH_RADIUS_BU * this.data.bu);
  }

  findPathEx(from: Vec3, to: Vec3, out: Vec3[], opts: FindPathOptions = {}): boolean {
    out.length = 0;
    const discs = opts.discs ?? null;
    const s = this.snap(this.clampedCell(from)), t = this.snap(this.clampedCell(to));
    if (s < 0 || t < 0) return false;
    this.counters.searches++;
    if (!this.search.astar(s, t, discs, _cells)) { this.counters.expanded += this.search.expanded; return false; }
    this.counters.expanded += this.search.expanded;
    // waypoints: cell centres, string-pulled; the true goal last
    let prev: Vec3 = from;
    let i = 0;
    const last = _cells.length - 1;
    while (i < last) {
      // farthest cell in grid line of sight (cheap), then the field test from there back (few traces)
      let j = i + 1;
      while (j < Math.min(last, i + SMOOTH_MAX_CELLS) && this.gridVisible(prev, j + 1 === last ? to : this.centre(_cells[j + 1], _t), discs)) j++;
      for (; j > i + 1; j -= 2) {
        const target = j === last ? to : this.centre(_cells[j], _t);
        if (this.segmentWalkable(prev, target, discs)) break;
      }
      if (j <= i) j = i + 1;
      if (j === last) break;
      const wp = this.centre(_cells[j], { x: 0, y: 0, z: 0 });
      out.push(wp);
      prev = wp;
      i = j;
    }
    out.push({ x: to.x, y: to.y, z: to.z });
    return true;
  }

  flowField(key: string, sig: string, seeds: readonly Vec3[]): Float32Array {
    this.clock++;
    let e = this.flows.find((f) => f.key === key);
    if (e && e.sig === sig && e.version === this.version) { e.used = this.clock; return e.dist; }
    if (!e) {
      if (this.flows.length >= FLOW_CACHE) {
        let lru = 0;
        for (let i = 1; i < this.flows.length; i++) if (this.flows[i].used < this.flows[lru].used) lru = i;
        this.flows.splice(lru, 1);
      }
      e = { key, sig, version: -1, dist: new Float32Array(this.w * this.h), used: this.clock };
      this.flows.push(e);
    }
    const cells: number[] = [];
    for (const p of seeds) {
      const c = this.snap(this.clampedCell(p));
      if (c >= 0 && !cells.includes(c)) cells.push(c);
    }
    this.search.dijkstra(cells, e.dist);
    e.sig = sig; e.version = this.version; e.used = this.clock;
    this.counters.flowBuilds++;
    return e.dist;
  }

  flowNext(dist: Float32Array, p: Vec3, steps: number, out: Vec3): number {
    let c = this.snap(this.clampedCell(p));
    if (c < 0) return Infinity;
    const d0 = dist[c];
    if (!Number.isFinite(d0)) return Infinity;
    for (let k = 0; k < steps; k++) {
      const cx = c % this.w, cz = (c - cx) / this.w;
      let best = c, bd = dist[c];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= this.w || z >= this.h) continue;
        const n = z * this.w + x;
        if (dist[n] < bd) { bd = dist[n]; best = n; }
      }
      if (best === c) break;
      c = best;
    }
    this.centre(c, out);
    return d0;
  }

  stats(): { searches: number; expanded: number; flowBuilds: number } {
    return { ...this.counters };
  }
}
