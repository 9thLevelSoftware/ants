// The NavGrid service (GDD 04 §11): coarse 16 BU cells built from WorldData, refined from the world field (tall
// objects block cells, mounds raise the ground), A* with string-pulling smoothing (grid line of sight plus
// field.segmentFree above the ground), cached flow fields, runtime cost overlays and incremental re-derivation.
// Derived cache: never persisted, rebuilt by createSim.

import type { Vec3 } from '@/core/math/vec3';
import type { NavClass, NavGrid, Primitive, WorldData } from '@/sim/types';
import { NAV_CLASSES } from '@/sim/types';
import type { WorldField } from '@/sim/world/field';
import { deriveFromField, deriveFromWorld, isBlocked, linkPortals, NAV_GRID_TUNING, type GridData, type Portal } from './gridData';
import { GridSearch, lineClear, type CostDisc } from './search';
import { findGate } from './gates';

// planner tunables (GDD 04 §11), in NAV_GRID_TUNING (re-exported from src/sim/balance)
const {
  smoothLiftBU: SMOOTH_LIFT_BU, smoothRadiusBU: SMOOTH_RADIUS_BU, smoothMaxCells: SMOOTH_MAX_CELLS, snapRadiusCells: SNAP_RADIUS,
  flowCacheFields: FLOW_CACHE, flowClearanceBU: FLOW_CLEARANCE_BU, portalReachBU: PORTAL_REACH_BU,
} = NAV_GRID_TUNING;

export interface FindPathOptions {
  /** Cost discs (avoid markers). */
  discs?: readonly CostDisc[] | null;
  /** The walker's clearance (GDD 04 §6.1), BU: narrower micro-portals are skipped. Default 0 (all). */
  clearanceBu?: number;
}

interface FlowEntry {
  key: string;
  sig: string;
  version: number;
  dist: Float32Array;
  /** Cell each cell's distance came from (-1 = seed / unreachable): the shortest-path tree, for repairs. */
  parent: Int32Array;
  /** Seed cells the field was built from (a change of snapped seeds forces a full rebuild). */
  seedCells: number[];
  used: number;
}

/** Cost-relevant cell data of a box before a re-derivation (copied exactly, compared exactly). */
interface AreaSnapshot {
  i0: number; i1: number; k0: number; k1: number;
  ground: Float32Array;
  cls: Uint8Array; covered: Uint8Array; partial: Float32Array; cost: Float32Array; grip: Float32Array;
}

function sameCell(d: GridData, c: number, b: AreaSnapshot, q: number): boolean {
  return d.cls[c] === b.cls[q] && d.covered[c] === b.covered[q] && d.partial[c] === b.partial[q] && d.cost[c] === b.cost[q]
    && d.grip[c] === b.grip[q];
}

/** Cells changed by one grid version bump (flow-field repair log). */
interface ChangeEntry {
  version: number;
  cells: number[];
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
   * `sig` or the grid version changes. Returns the distance array (Infinity = unreachable). With avoid `discs` the
   * cells inside them cost their multiplier (as in A*); `sig` must then also identify the discs, and such a field is
   * always rebuilt in full on a grid change (the incremental repair knows no discs).
   */
  flowField(key: string, sig: string, seeds: readonly Vec3[], discs?: readonly CostDisc[] | null): Float32Array;
  /**
   * Next cell down a flow field from p after up to `steps` steps (cell centre into out; a micro-portal's mouth when
   * the way down leads through one); returns dist at p.
   */
  flowNext(dist: Float32Array, p: Vec3, steps: number, out: Vec3): number;
  /** Opens or closes a micro-portal (GDD 04 §6: weather strip, blocked crack); no-op if unchanged. */
  setPortalOpen(id: number, open: boolean): void;
  /**
   * Sets the puddle overlay of cells (1 dry, > 1 a cost factor, Infinity blocked), one grid version for all of
   * them; cells whose value is unchanged are skipped. Returns how many changed.
   */
  setWetCells(cells: readonly number[], values: readonly number[]): number;
  readonly portals: readonly Portal[];
  stats(): { searches: number; expanded: number; flowBuilds: number; flowRepairs: number; flowRepairCells: number; gates: number };
  /** Nodes expanded by all A* searches so far. */
  readonly expandedTotal: number;
}

export function isLocoNavGrid(g: NavGrid): g is LocoNavGrid {
  return typeof (g as Partial<LocoNavGrid>).findPathEx === 'function';
}

export function createLocoNavGrid(world: WorldData): LocoNavGrid {
  return new NavGridImpl(world);
}

const _cells: number[] = [], _via: number[] = [];
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
  private counters = { searches: 0, expanded: 0, flowBuilds: 0, flowRepairs: 0, flowRepairCells: 0, gates: 0 };
  /** Recent cell changes, oldest first; fields older than `fullVersion` need a full rebuild. */
  private readonly changes: ChangeEntry[] = [];
  private fullVersion = 0;
  private logCells = 0;
  /** Scratch: each portal's mouth cells [cellA, cellB] before a re-link. */
  private readonly mouths: Int32Array;

  constructor(world: WorldData) {
    this.data = deriveFromWorld(world);
    this.cell = this.data.cell;
    this.w = this.data.w;
    this.h = this.data.h;
    this.search = new GridSearch(this.data);
    this.mouths = new Int32Array(2 * this.data.portals.length);
  }

  get hasField(): boolean {
    return this.field !== null;
  }

  get portals(): readonly Portal[] {
    return this.data.portals;
  }

  setPortalOpen(id: number, open: boolean): void {
    for (const p of this.data.portals) {
      if (p.id !== id || p.open === open) continue;
      p.open = open;
      this.bump([p.cellA, p.cellB].filter((c) => c >= 0));
    }
  }

  /** New grid version whose changed cells are `cells` (null = everything: flow fields rebuild in full). */
  private bump(cells: number[] | null): void {
    this.version++;
    if (cells === null) {
      this.fullVersion = this.version;
      this.changes.length = 0;
      this.logCells = 0;
      return;
    }
    this.changes.push({ version: this.version, cells });
    this.logCells += cells.length;
    while (this.logCells > NAV_GRID_TUNING.flowLogMaxCells && this.changes.length > 0) {
      const dropped = this.changes.shift()!;
      this.logCells -= dropped.cells.length;
      this.fullVersion = Math.max(this.fullVersion, dropped.version);
    }
  }

  /** Cells changed after `version`, or null when the log no longer reaches back that far. */
  private changedSince(version: number): number[] | null {
    if (version < this.fullVersion) return null;
    const out: number[] = [];
    for (const ch of this.changes) if (ch.version > version) for (const c of ch.cells) out.push(c);
    return out;
  }

  attachField(field: WorldField, prims: readonly Primitive[]): void {
    this.field = field;
    deriveFromField(this.data, field, prims);
    this.bump(null);
  }

  refreshArea(x0: number, z0: number, x1: number, z1: number, prims: readonly Primitive[]): void {
    if (!this.field) return;
    // the cells deriveFromField rewrites (it clamps the box to the grid the same way), plus a ring for the step test
    const c = this.cell, cl = (v: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(v / c)));
    const ia = cl(x0, this.w), ib = cl(x1, this.w), ka = cl(z0, this.h), kb = cl(z1, this.h);
    const before = this.snapshotArea(ia - 1, ib + 1, ka - 1, kb + 1);
    this.saveMouths();
    deriveFromField(this.data, this.field, prims, x0, z0, x1, z1); // re-links the portals too
    const dirty = this.changedCells(before, ia, ib, ka, kb);
    this.addMovedMouths(dirty);
    this.bump(dirty);
  }

  /** Remembers every portal's mouth cells (before a re-link). */
  private saveMouths(): void {
    const ps = this.data.portals, m = this.mouths;
    for (let i = 0; i < ps.length; i++) { m[2 * i] = ps[i].cellA; m[2 * i + 1] = ps[i].cellB; }
  }

  /**
   * After a re-link: a portal mouth snaps up to MOUTH_SNAP_CELLS away when its cell's blocking changes, which can
   * be outside the changed cells' one-cell ring that flowRepair invalidates. Logs the old and new mouth cells of
   * every portal that moved, so the removed edge and the new edge are both repaired.
   */
  private addMovedMouths(out: number[]): void {
    const ps = this.data.portals, m = this.mouths;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i], a0 = m[2 * i], b0 = m[2 * i + 1];
      if (p.cellA === a0 && p.cellB === b0) continue;
      for (const c of [a0, b0, p.cellA, p.cellB]) if (c >= 0 && !out.includes(c)) out.push(c);
    }
  }

  /** Copy of the cost-relevant cell data in a clamped box (flow-repair change detection). */
  private snapshotArea(i0: number, i1: number, k0: number, k1: number): AreaSnapshot {
    const d = this.data;
    i0 = Math.max(0, i0); k0 = Math.max(0, k0); i1 = Math.min(this.w - 1, i1); k1 = Math.min(this.h - 1, k1);
    const n = (i1 - i0 + 1) * (k1 - k0 + 1);
    const snap: AreaSnapshot = {
      i0, i1, k0, k1, ground: new Float32Array(n), cls: new Uint8Array(n), covered: new Uint8Array(n),
      partial: new Float32Array(n), cost: new Float32Array(n), grip: new Float32Array(n),
    };
    let q = 0;
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++, q++) {
      const cc = k * this.w + i;
      snap.ground[q] = d.ground[cc]; snap.cls[q] = d.cls[cc]; snap.covered[q] = d.covered[cc];
      snap.partial[q] = d.partial[cc]; snap.cost[q] = d.cost[cc]; snap.grip[q] = d.grip[cc];
    }
    return snap;
  }

  /**
   * Cells of the box whose edges' costs may have changed: class, cover, cost or grip changed, or the ground moved
   * where an edge to a neighbour is (or was) a step edge (edge costs read the ground only through the climb term).
   */
  private changedCells(b: AreaSnapshot, ia: number, ib: number, ka: number, kb: number): number[] {
    const d = this.data, out: number[] = [], step = NAV_GRID_TUNING.stepBU * d.bu, bw = b.i1 - b.i0 + 1;
    const oldGround = (i: number, k: number) => b.ground[(k - b.k0) * bw + (i - b.i0)];
    for (let k = ka; k <= kb; k++) for (let i = ia; i <= ib; i++) {
      const cc = k * this.w + i, q = (k - b.k0) * bw + (i - b.i0);
      if (!sameCell(d, cc, b, q)) { out.push(cc); continue; }
      const g0 = b.ground[q], g1 = d.ground[cc];
      if (g0 === g1) continue;
      let stepEdge = false;
      for (let dk = -1; dk <= 1 && !stepEdge; dk++) for (let di = -1; di <= 1 && !stepEdge; di++) {
        const ni = i + di, nk = k + dk;
        if ((di === 0 && dk === 0) || ni < b.i0 || nk < b.k0 || ni > b.i1 || nk > b.k1) continue;
        const n0 = oldGround(ni, nk), n1 = d.ground[nk * this.w + ni];
        stepEdge = Math.abs(g0 - n0) > step || Math.abs(g1 - n1) > step || Math.abs(g1 - n0) > step || Math.abs(g0 - n1) > step;
      }
      if (stepEdge) out.push(cc);
    }
    return out;
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
    return c < 0 ? Infinity : this.data.cost[c] * this.data.dyn[c] * this.data.wet[c];
  }

  blocked(x: number, z: number): boolean {
    return this.isCellBlocked(this.cellOf(x, z));
  }

  setCostMult(ix: number, iz: number, mult: number): void {
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return;
    const m = Number.isNaN(mult) ? 1 : Math.max(1, mult);
    const c = iz * this.w + ix;
    if (this.data.dyn[c] === m) return;
    const wasBlocked = isBlocked(this.data, c);
    this.data.dyn[c] = m;
    const dirty = [c];
    // mouths follow blocking: re-link now, so the links depend only on the current cells (a rebuilt grid after a
    // load links the same way) and not on when the next refreshArea happens to run
    if (isBlocked(this.data, c) !== wasBlocked) {
      this.saveMouths();
      linkPortals(this.data);
      this.addMovedMouths(dirty);
    }
    this.bump(dirty);
  }

  setWetCells(cells: readonly number[], values: readonly number[]): number {
    const d = this.data, dirty: number[] = [];
    let relink = false;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], m = values[i] >= 1 ? values[i] : 1;
      if (c < 0 || c >= d.wet.length || d.wet[c] === m) continue;
      const was = isBlocked(d, c);
      d.wet[c] = m;
      if (isBlocked(d, c) !== was) relink = true;
      dirty.push(c);
    }
    if (dirty.length === 0) return 0;
    // as setCostMult: mouths follow blocking at once
    if (relink) { this.saveMouths(); linkPortals(d); this.addMovedMouths(dirty); }
    this.bump(dirty);
    return dirty.length;
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
    const ok = this.search.astar(s, t, discs, _cells, _via, opts.clearanceBu ?? 0);
    this.counters.expanded += this.search.expanded;
    if (!ok) return false;
    // waypoints: string-pulled runs of neighbour moves; a portal edge adds its entry and exit mouths
    let prev: Vec3 = from, i0 = 0;
    for (let i = 1; i < _cells.length; i++) {
      const pi = _via[i];
      if (pi < 0) continue;
      const p = this.data.portals[pi];
      const fromA = _cells[i - 1] === p.cellA;
      const entry = fromA ? p.posA : p.posB, exit = fromA ? p.posB : p.posA;
      this.pull(prev, i0, i - 1, entry, discs, out);
      out.push({ x: exit.x, y: exit.y, z: exit.z });
      prev = exit;
      i0 = i;
    }
    this.pull(prev, i0, _cells.length - 1, to, discs, out);
    return true;
  }

  /**
   * String-pulls the run _cells[i0..last] (neighbour moves) from prev to the end point: waypoints at cell centres
   * where the straight line is blocked, the end point last.
   */
  private pull(prev: Vec3, i0: number, last: number, end: Vec3, discs: readonly CostDisc[] | null, out: Vec3[]): void {
    let i = i0;
    while (i < last) {
      // farthest cell in grid line of sight (cheap), then the field test from there back (few traces)
      let j = i + 1;
      while (j < Math.min(last, i + SMOOTH_MAX_CELLS) && this.gridVisible(prev, j + 1 === last ? end : this.centre(_cells[j + 1], _t), discs)) j++;
      for (; j > i + 1; j -= 2) {
        const target = j === last ? end : this.centre(_cells[j], _t);
        if (this.segmentWalkable(prev, target, discs)) break;
      }
      if (j <= i) j = i + 1;
      // a single step to the side-by-side cell whose shared edge is open only in a strip (a gap under a raised
      // board at a fence end): go through the strip, not at the cell centre behind the solid part (gates.ts)
      if (j === i + 1 && this.field) prev = this.gate(prev, _cells[i], _cells[j], out);
      if (j === last) break;
      const wp = this.centre(_cells[j], { x: 0, y: 0, z: 0 });
      out.push(wp);
      prev = wp;
      i = j;
    }
    out.push({ x: end.x, y: end.y, z: end.z });
  }

  /** Adds the entry and exit points of the gate between side-by-side cells a and b to out; returns the new last point. */
  private gate(prev: Vec3, a: number, b: number, out: Vec3[]): Vec3 {
    const pa = this.centre(a, _t), ax = pa.x, az = pa.z, pb = this.centre(b, _t);
    const g = findGate(this.field!, ax, az, pb.x, pb.z, this.cell, this.data.bu, prev);
    if (!g) return prev;
    this.counters.gates++;
    out.push(g.entry, g.exit);
    return g.exit;
  }

  flowField(key: string, sig: string, seeds: readonly Vec3[], discs: readonly CostDisc[] | null = null): Float32Array {
    const weighted = discs !== null && discs.length > 0;
    this.clock++;
    let e = this.flows.find((f) => f.key === key);
    if (e && e.sig === sig && e.version === this.version) { e.used = this.clock; return e.dist; }
    const cells: number[] = [];
    for (const p of seeds) {
      const c = this.snap(this.clampedCell(p));
      if (c >= 0 && !cells.includes(c)) cells.push(c);
    }
    // same seeds and a change log reaching back to the field's version: repair only what the changes touched
    // (GDD 04 §11 incremental re-derivation); the result equals a full rebuild exactly (search.ts flowRepair)
    if (e && !weighted && e.sig === sig && sameCells(e.seedCells, cells)) {
      const dirty = this.changedSince(e.version);
      if (dirty !== null) {
        this.counters.flowRepairCells += this.search.flowRepair(e.dist, e.parent, cells, dirty, FLOW_CLEARANCE_BU);
        this.counters.flowRepairs++;
        e.version = this.version; e.used = this.clock;
        return e.dist;
      }
    }
    if (!e) {
      if (this.flows.length >= FLOW_CACHE) {
        let lru = 0;
        for (let i = 1; i < this.flows.length; i++) if (this.flows[i].used < this.flows[lru].used) lru = i;
        this.flows.splice(lru, 1);
      }
      const n = this.w * this.h;
      e = { key, sig, version: -1, dist: new Float32Array(n), parent: new Int32Array(n), seedCells: [], used: this.clock };
      this.flows.push(e);
    }
    this.search.dijkstra(cells, e.dist, FLOW_CLEARANCE_BU, e.parent, weighted ? discs : null);
    e.sig = sig; e.version = this.version; e.used = this.clock; e.seedCells = cells;
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
      const portal = this.portalDown(dist, c, bd);
      if (portal) {
        const fromA = c === portal.cellA, entry = fromA ? portal.posA : portal.posB, exit = fromA ? portal.posB : portal.posA;
        const reach = PORTAL_REACH_BU * this.data.bu;
        const there = k === 0 && (p.x - entry.x) ** 2 + (p.z - entry.z) ** 2 <= reach * reach;
        const m = there ? exit : entry;
        out.x = m.x; out.y = m.y; out.z = m.z;
        return d0;
      }
      if (best === c) break;
      c = best;
    }
    this.centre(c, out);
    return d0;
  }

  /** A portal at cell c leading lower down the flow field than `below` (the best neighbour), or null. */
  private portalDown(dist: Float32Array, c: number, below: number): Portal | null {
    const ps = this.data.portalsAt.get(c);
    if (!ps) return null;
    let best: Portal | null = null, bd = below;
    for (const pi of ps) {
      const p = this.data.portals[pi];
      const o = this.search.portalOther(p, c, FLOW_CLEARANCE_BU);
      if (o >= 0 && dist[o] < bd) { bd = dist[o]; best = p; }
    }
    return best;
  }

  stats(): { searches: number; expanded: number; flowBuilds: number; flowRepairs: number; flowRepairCells: number; gates: number } {
    return { ...this.counters };
  }

  /** Nodes expanded by all A* searches so far (the planner's per-tick cost budget reads it). */
  get expandedTotal(): number {
    return this.counters.expanded;
  }
}

function sameCells(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
