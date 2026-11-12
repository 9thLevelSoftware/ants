// NestNav service: named BFS distance fields over the open voxels of the carve grid (to entrances, to a
// chamber, to a dig front ...), connected-component queries, lazy building, change tracking and LRU eviction.
//
// Changes arrive from the carve grid's listener and are only RECORDED; they are applied the next time a query
// touches a field (or on flush()): carves update each built field incrementally and exactly, fills (anything
// that closed a voxel) mark every field for a full rebuild. The result is a pure function of the grid, so
// lazy processing does not affect determinism.

import type { Vec3 } from '@/core/math/vec3';
import type { CarveChange, CarveGrid } from '@/sim/nest/carve/grid';
import type { VoxelBox } from '@/sim/nest/carve/keys';
import { NavChunks, makeNeighbourhood, scanNeighbours as scanNeighboursImp, stepAllowed as stepAllowedImp, type BlockedFn } from './graph';
import { DistanceField, NAV_INF, type NavSeeds } from './distanceField';
import { Components } from './components';
import { NAV_TUNING } from './params';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const scanNeighbours = scanNeighboursImp, stepAllowed = stepAllowedImp;

export interface NestNavOptions {
  /** True where a sample lies inside the hard group (never passable). */
  isBlocked?: BlockedFn | null;
  /** Most distance fields kept built at once (least recently used are evicted, then rebuilt on demand). */
  maxFields?: number;
  /** Byte budget for all built distance fields. */
  maxBytes?: number;
}

export interface NavStats {
  fields: number;
  builtFields: number;
  slots: number;
  /** Bytes in distance arrays + shared passability + component labels. */
  bytes: number;
  rebuilds: number;
  updates: number;
  evictions: number;
}

/** Nest navigation service (contract). Distances in mm along the voxel graph; Infinity = unreachable. */
export interface NestNav {
  /** Defines (or redefines) a target field. Built lazily on first query. */
  setTarget(id: string, seeds: NavSeeds): void;
  removeTarget(id: string): boolean;
  hasTarget(id: string): boolean;
  targets(): string[];
  /** Graph distance (mm) from p to the target, Infinity if unreachable or p is not in open nest space. */
  distanceAt(id: string, p: Vec3): number;
  /**
   * Unit direction from p towards the best neighbouring voxel (steepest descent) into out. Returns the distance
   * at p (mm): 0 at the target (out = 0), Infinity when unreachable (out = 0).
   */
  stepDir(id: string, p: Vec3, out: Vec3): number;
  /** Position (mm) of the voxel reached after `steps` descent steps from p (steering target). Returns distanceAt. */
  lookahead(id: string, p: Vec3, steps: number, out: Vec3): number;
  /** Open region id of p (-1 if p is not in open nest space). Arbitrary but canonical; not for persistence. */
  componentAt(p: Vec3): number;
  /** Nearest passable sample to p within ~2 voxels: its world position into out. */
  nearestOpen(p: Vec3, out: Vec3): boolean;
  /** Build a field now (otherwise lazy). Returns settled voxel count. */
  build(id: string): number;
  /** Apply pending carve/fill changes to all built fields now. */
  flush(): void;
  /** Recompute everything from the grid (after load). */
  rebuildAll(): void;
  stats(): NavStats;
  /** Detach from the carve grid. */
  dispose(): void;
}

export function createNestNav(grid: CarveGrid, opts: NestNavOptions = {}): NestNav {
  return new NestNavImpl(grid, opts);
}

const _hit = { slot: -1, idx: -1 };

class NestNavImpl implements NestNav {
  private readonly grid: CarveGrid;
  private readonly ch: NavChunks;
  private readonly fields = new Map<string, DistanceField>();
  private readonly comps = new Components();
  private readonly maxFields: number;
  private readonly maxBytes: number;
  private readonly listener: (c: CarveChange) => void;
  /** Change log of carve boxes since the oldest built field's `applied` mark. */
  private log: VoxelBox[] = [];
  private logBase = 0;
  /** Recorded grid changes whose passability has not been refreshed yet. */
  private pending: { box: VoxelBox; fill: boolean }[] = [];
  private clock = 0;
  private counters = { rebuilds: 0, updates: 0, evictions: 0 };
  private readonly nh = makeNeighbourhood();

  constructor(grid: CarveGrid, opts: NestNavOptions) {
    this.grid = grid;
    this.ch = new NavChunks(grid, opts.isBlocked ?? null);
    this.maxFields = opts.maxFields ?? NAV_TUNING.maxFields;
    this.maxBytes = opts.maxBytes ?? NAV_TUNING.maxBytes;
    this.ch.rebuildAll();
    this.listener = (c) => this.onChange(c);
    grid.addListener(this.listener);
  }

  dispose(): void {
    this.grid.removeListener(this.listener);
  }

  private onChange(c: CarveChange): void {
    if (c.opened === 0 && c.closed === 0) return; // no sample crossed the iso: the graph is unchanged
    this.pending.push({ box: { ...c.box }, fill: c.closed > 0 });
  }

  /** Refreshes passability for recorded changes; carves join the log, fills free every field (full rebuild). */
  private sync(): void {
    if (this.pending.length === 0) return;
    let anyFill = false;
    for (const p of this.pending) {
      if (!this.ch.refreshBox(p.box)) continue;
      this.comps.valid = false;
      if (p.fill) anyFill = true;
      else this.log.push(p.box);
    }
    this.pending = [];
    if (anyFill) {
      for (const f of this.fields.values()) f.free();
      this.log = [];
      this.logBase = 0;
    }
  }

  private logEnd(): number {
    return this.logBase + this.log.length;
  }

  private markAllApplied(): void {
    for (const f of this.fields.values()) f.applied = this.logEnd();
  }

  /** Brings one field up to date (building it if needed). */
  private current(id: string): DistanceField | undefined {
    const f = this.fields.get(id);
    if (!f) return undefined;
    this.sync();
    f.lastUse = ++this.clock;
    if (!f.built) {
      this.buildField(f);
    } else if (f.applied < this.logEnd()) {
      f.update(this.ch, this.log.slice(f.applied - this.logBase));
      f.applied = this.logEnd();
      this.counters.updates++;
      this.trimLog();
    }
    return f;
  }

  private buildField(f: DistanceField): number {
    const n = f.rebuild(this.ch, (p, out) => this.nearestSample(p, out));
    f.applied = this.logEnd();
    this.counters.rebuilds++;
    this.evict(f);
    this.trimLog();
    return n;
  }

  private trimLog(): void {
    let min = this.logEnd();
    for (const f of this.fields.values()) if (f.built && f.applied < min) min = f.applied;
    if (min > this.logBase) {
      this.log = this.log.slice(min - this.logBase);
      this.logBase = min;
    }
    // a field that fell too far behind is cheaper to rebuild
    if (this.log.length > NAV_TUNING.maxLogBoxes) {
      for (const f of this.fields.values()) if (f.built && f.applied < this.logEnd()) f.free();
      this.log = [];
      this.logBase = 0;
      this.markAllApplied();
    }
  }

  private evict(keep: DistanceField): void {
    for (;;) {
      let built = 0, bytes = 0;
      let lru: DistanceField | null = null;
      for (const f of this.fields.values()) {
        if (!f.built) continue;
        built++;
        bytes += f.bytes();
        if (f !== keep && (lru === null || f.lastUse < lru.lastUse)) lru = f;
      }
      if (lru === null || (built <= this.maxFields && bytes <= this.maxBytes)) return;
      lru.free();
      this.counters.evictions++;
    }
  }

  setTarget(id: string, seeds: NavSeeds): void {
    this.fields.set(id, new DistanceField(seeds));
  }

  removeTarget(id: string): boolean {
    return this.fields.delete(id);
  }

  hasTarget(id: string): boolean {
    return this.fields.has(id);
  }

  targets(): string[] {
    return [...this.fields.keys()];
  }

  build(id: string): number {
    const f = this.fields.get(id);
    if (!f) return 0;
    this.sync();
    f.lastUse = ++this.clock;
    return this.buildField(f);
  }

  flush(): void {
    for (const id of this.fields.keys()) if (this.fields.get(id)!.built) this.current(id);
    this.sync();
  }

  rebuildAll(): void {
    this.ch.rebuildAll();
    this.pending = [];
    this.log = [];
    this.logBase = 0;
    this.comps.valid = false;
    for (const f of this.fields.values()) f.free();
  }

  /** Nearest passable sample to p (8 cell corners first, then the 4^3 block). */
  private nearestSample(p: Vec3, out: { slot: number; idx: number }): boolean {
    const inv = 1 / this.grid.voxel;
    const fi = p.x * inv, fj = p.y * inv, fk = p.z * inv;
    const bi = Math.floor(fi), bj = Math.floor(fj), bk = Math.floor(fk);
    let best = Infinity;
    for (let ring = 0; ring < 2 && best === Infinity; ring++) {
      const lo = ring === 0 ? 0 : -1, hi = ring === 0 ? 1 : 2;
      for (let dk = lo; dk <= hi; dk++) for (let dj = lo; dj <= hi; dj++) for (let di = lo; di <= hi; di++) {
        const i = bi + di, j = bj + dj, k = bk + dk;
        const s = this.ch.slotAt(i, j, k);
        if (s < 0) continue;
        const idx = (i & 15) | ((j & 15) << 4) | ((k & 15) << 8);
        if (this.ch.pass[s][idx] !== 1) continue;
        const g = (i - fi) ** 2 + (j - fj) ** 2 + (k - fk) ** 2;
        if (g < best) { best = g; out.slot = s; out.idx = idx; }
      }
    }
    return best !== Infinity;
  }

  private sampleOf(slot: number, idx: number, out: Vec3): void {
    const v = this.grid.voxel;
    out.x = (this.ch.bi[slot] + (idx & 15)) * v;
    out.y = (this.ch.bj[slot] + ((idx >> 4) & 15)) * v;
    out.z = (this.ch.bk[slot] + (idx >> 8)) * v;
  }

  nearestOpen(p: Vec3, out: Vec3): boolean {
    this.sync();
    if (!this.nearestSample(p, _hit)) return false;
    this.sampleOf(_hit.slot, _hit.idx, out);
    return true;
  }

  distanceAt(id: string, p: Vec3): number {
    const f = this.current(id);
    if (!f || !this.nearestSample(p, _hit)) return Infinity;
    const d = f.get(_hit.slot, _hit.idx);
    if (d === NAV_INF) return Infinity;
    const v = this.grid.voxel;
    const q = _q;
    this.sampleOf(_hit.slot, _hit.idx, q);
    return (d / 3) * v + Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  }

  /** One descent step from (slot, idx): writes the best neighbour into _hit; false at a minimum. */
  private descend(f: DistanceField, slot: number, idx: number): boolean {
    scanNeighbours(this.ch, slot, idx, this.nh);
    const mask = this.nh.mask;
    let best = f.get(slot, idx), bs = -1, bidx = -1;
    for (let n = 0; n < 26; n++) {
      if (!stepAllowed(mask, n)) continue;
      const d = f.get(this.nh.slot[n], this.nh.idx[n]);
      if (d < best) { best = d; bs = this.nh.slot[n]; bidx = this.nh.idx[n]; }
    }
    if (bs < 0) return false;
    _hit.slot = bs; _hit.idx = bidx;
    return true;
  }

  stepDir(id: string, p: Vec3, out: Vec3): number {
    out.x = 0; out.y = 0; out.z = 0;
    const d = this.distanceAt(id, p);
    if (d === Infinity || d === 0) return d;
    const f = this.fields.get(id)!;
    this.nearestSample(p, _hit);
    const s0 = _hit.slot, i0 = _hit.idx;
    if (f.get(s0, i0) === 0 || !this.descend(f, s0, i0)) return d;
    this.sampleOf(_hit.slot, _hit.idx, _q);
    let dx = _q.x - p.x, dy = _q.y - p.y, dz = _q.z - p.z;
    let l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-6) {
      this.sampleOf(s0, i0, _r);
      dx = _q.x - _r.x; dy = _q.y - _r.y; dz = _q.z - _r.z;
      l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    out.x = dx / l; out.y = dy / l; out.z = dz / l;
    return d;
  }

  lookahead(id: string, p: Vec3, steps: number, out: Vec3): number {
    const d = this.distanceAt(id, p);
    if (d === Infinity) return d;
    const f = this.fields.get(id)!;
    this.nearestSample(p, _hit);
    let s = _hit.slot, i = _hit.idx;
    for (let n = 0; n < steps; n++) {
      if (!this.descend(f, s, i)) break;
      s = _hit.slot; i = _hit.idx;
    }
    this.sampleOf(s, i, out);
    return d;
  }

  componentAt(p: Vec3): number {
    this.sync();
    if (!this.comps.valid) this.comps.compute(this.ch);
    if (!this.nearestSample(p, _hit)) return -1;
    return this.comps.label(_hit.slot, _hit.idx);
  }

  stats(): NavStats {
    let built = 0, bytes = this.ch.bytes();
    for (const f of this.fields.values()) if (f.built) { built++; bytes += f.bytes(); }
    for (const l of this.comps.labels) if (l) bytes += l.byteLength;
    return { fields: this.fields.size, builtFields: built, slots: this.ch.count, bytes, ...this.counters };
  }
}

const _q: Vec3 = { x: 0, y: 0, z: 0 };
const _r: Vec3 = { x: 0, y: 0, z: 0 };
