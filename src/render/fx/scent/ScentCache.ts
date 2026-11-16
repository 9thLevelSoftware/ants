// The scent view's CPU side (no three): one slot per drawn pheromone cell (or food plume), in flat arrays the GPU
// instancing reads directly. Cell layers are refreshed incrementally from the field's persisted chunks (plain
// read-only arrays in SimState.phero, scanned a few chunks per frame), or, for sources without chunk data, whole
// through the read-only active-cell iteration. New cells are projected onto the nearest surface and trail cells
// given a direction within their own budgets; displayed intensities ease towards the sampled values, so trails fade
// smoothly as they decay and a vanished cell fades out before its slot is reused.
import type { Vec3 } from '@/core';
import type { PheroCellVisitor, PheroChannel, PheromoneLayer } from '@/sim/types';
import { cellIndex } from './cellCode';
import { chunkKeyOf, NEIGHBOUR_DIRS, SlotIndex } from './slotIndex';
import { TrailDistance, type TrailGraph } from './trailDistance';
import {
  DECAL, EVICT_MARGIN, EVICT_SAME_RANK_SHARE, EVICT_SAMPLE, FREE_EPS, RANK_STRENGTH, RIVAL_FLAG, SLOT_RANK, SNAP_MAX_CELLS, STYLE,
} from './tuning';

/** Read side of the pheromone field (sim.phero implements it). */
export interface ScentCellSource {
  forEachActiveCell?(colony: number, channel: PheroChannel, fn: PheroCellVisitor): number;
  layerVersion?(colony: number, channel: PheroChannel): number;
}

/** The persisted field (SimState.phero): read only, chunk by chunk. */
export interface ScentChunkData {
  cell: number;
  chunkCells: number;
  layers: readonly PheromoneLayer[];
}

/** Projects a cell centre onto the nearest surface: writes the surface point and its unit normal; false = none. */
export interface SurfaceSnapper {
  snap(x: number, y: number, z: number, outPos: Vec3, outNrm: Vec3): boolean;
}

export interface CellLayerSpec {
  kind: 'cells';
  /** Unique key, e.g. `0:trail`. */
  key: string;
  /** Colony id of the persisted layer (-1 = the shared alarm layer). */
  colony: number;
  channel: PheroChannel;
  /** Base glyph style (tuning STYLE), plus RIVAL_FLAG for another colony. */
  style: number;
  /** Concentration shown at full intensity, ph. */
  fullPh: number;
  /** Points the chevrons flow away from (the colony's entrances): the trail runs from them to the food. */
  origins: readonly Vec3[];
}

/** A plume or other explicitly placed glyph (food odour). */
export interface PointEntry {
  id: number;
  pos: Vec3;
  up: Vec3;
  /** Glyph radius, mm. */
  radiusMm: number;
  /** 0..1 */
  intensity: number;
}

export interface PointLayerSpec {
  kind: 'points';
  key: string;
  style: number;
}

export type LayerSpec = CellLayerSpec | PointLayerSpec;

const FREE = 0, PENDING = 1, LIVE = 2, NO_SURFACE = 3;
/** Intensity steps up to this are applied at once (slow decay); larger ones ease (appear, vanish, reinforcement). */
const JUMP = 0.04;

interface LayerRec {
  spec: LayerSpec;
  /** Cell -> slot (cell layers) and point id -> slot (point layers). */
  index: SlotIndex;
  points: Map<number, number>;
  /** Slots of this layer currently allocated. */
  count: number;
  /** Chunk scan position in the persisted layer, and the number of completed passes. */
  cursor: number;
  pass: number;
  passStartedAt: number;
  /** Removed from the spec list: its slots fade out, then the record goes. */
  retired: boolean;
  /** Slot rank of the layer's glyphs when the cache is full (tuning SLOT_RANK). */
  rank: number;
  /** Trail layer whose cells changed since its last along-trail distance job. */
  geoDirty: boolean;
}

export interface ScentCacheStats {
  slots: number;
  live: number;
  pending: number;
  moving: number;
  /** Cells refused a slot when the victim search ran out of budget (retried on the next pass). */
  dropped: number;
  /** Cells refused a slot because every held slot ranks above them (correct under a full cache). */
  outranked: number;
  /** Held slots given to a higher-ranked cell. */
  evicted: number;
  visits: number;
  chunks: number;
  snaps: number;
  axes: number;
  layers: number;
}

export interface RefreshBudget {
  /** Persisted chunks scanned per call (incremental path). */
  chunks: number;
  /** Active-cell visits per call (iteration path; layers refresh whole, at least one when any is due). */
  visits: number;
  /** A layer starts a new pass at most this often, s. */
  minRefreshS: number;
  /** Slots inspected per call looking for a weaker cell to evict when the cache is full (default: no limit). */
  evictScan?: number;
}

export class ScentCache {
  /** Per slot: surface point xyz (mm) + glyph half size (mm). */
  readonly posSize: Float32Array;
  /** Per slot: unit normal xyz + style. */
  readonly nrmStyle: Float32Array;
  /** Per slot: unit tangent axis (trail direction, towards the food). */
  readonly axis: Float32Array;
  /** Per slot: displayed intensity 0..1 (0 = not drawn). */
  readonly val: Float32Array;
  /** Slots [0, high) may be in use: the instance count to draw. */
  high = 0;
  /** Dirty slot ranges [lo, hi) of the geometry arrays and of val since the last takeDirty. */
  geomLo = Infinity; geomHi = 0;
  valLo = Infinity; valHi = 0;

  private readonly target: Float32Array;
  /** Integer cell coordinates of a cell slot (a point slot keeps its id in the first). */
  private readonly cellXYZ: Int32Array;
  /** Distance along each trail from the entrances (chevron direction). */
  private readonly geo: TrailDistance;
  private readonly nbSlots = new Int32Array(26);
  /** Victim search: sweep position, remaining scan budget of this call, and a lower bound of every held score. */
  private evictCursor = 0;
  private evictLeft = Infinity;
  private evictLeftSame = Infinity;
  private scoreFloor = -Infinity;
  /** The current sweep cycle: lowest score seen, slots inspected. */
  private sweepMin = Infinity;
  private sweepSeen = 0;
  private readonly layerOf: Int16Array;
  private readonly state: Uint8Array;
  private readonly seen: Uint32Array;
  private readonly freeList: Int32Array;
  private freeTop = 0;
  private readonly moving: Int32Array;
  private readonly inMoving: Uint8Array;
  private movingN = 0;
  private layers: LayerRec[] = [];
  private cursor = 0;
  private snapQ: number[] = [];
  private snapHead = 0;
  private axisQ: number[] = [];
  private axisHead = 0;
  private axisSweep = 0;
  private readonly invCell: number;
  private readonly tmpPos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly tmpNrm: Vec3 = { x: 0, y: 1, z: 0 };
  private st: ScentCacheStats = { slots: 0, live: 0, pending: 0, moving: 0, dropped: 0, outranked: 0, evicted: 0, visits: 0, chunks: 0, snaps: 0, axes: 0, layers: 0 };
  /** Converge mode: intensities jump to their targets (render on demand). */
  converge = false;
  // iteration-path visitor state (one closure, no allocation per refresh)
  private vLi = -1;
  private vScale = 1;
  private vPass = 0;
  private readonly visitor: PheroCellVisitor;

  constructor(readonly capacity: number, readonly cellMm: number) {
    this.posSize = new Float32Array(capacity * 4);
    this.nrmStyle = new Float32Array(capacity * 4);
    this.axis = new Float32Array(capacity * 3);
    this.val = new Float32Array(capacity);
    this.target = new Float32Array(capacity);
    this.cellXYZ = new Int32Array(capacity * 3);
    this.layerOf = new Int16Array(capacity).fill(-1);
    this.state = new Uint8Array(capacity);
    this.seen = new Uint32Array(capacity);
    this.freeList = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.freeList[i] = capacity - 1 - i;
    this.freeTop = capacity;
    this.moving = new Int32Array(capacity);
    this.inMoving = new Uint8Array(capacity);
    this.invCell = 1 / cellMm;
    this.geo = new TrailDistance(capacity, this.trailGraph());
    this.visitor = (x, y, z, v) => this.upsert(this.vLi, cellIndex(x, this.invCell), cellIndex(y, this.invCell), cellIndex(z, this.invCell), v * this.vScale, this.vPass);
  }

  // ------------------------------------------------------------------------------------------------ layers

  /** Which layers are drawn. Layers no longer listed fade out; new ones are refreshed on their turn. */
  setLayers(specs: readonly LayerSpec[]): void {
    const keep = new Set(specs.map((s) => s.key));
    for (const r of this.layers) if (!keep.has(r.spec.key)) r.retired = true;
    for (const s of specs) {
      const r = this.layers.find((l) => l.spec.key === s.key);
      const rank = SLOT_RANK[s.style] ?? 0;
      if (r) { r.spec = s; r.retired = false; r.rank = rank; r.geoDirty = true; continue; }
      this.layers.push({ spec: s, index: new SlotIndex(), points: new Map(), count: 0, cursor: 0, pass: 1, passStartedAt: -Infinity, retired: false, rank, geoDirty: false });
    }
    // ranks may have changed and retired layers' slots score lowest: restart the bounds
    this.scoreFloor = -Infinity;
    this.sweepMin = -Infinity;
  }

  /** Every layer's cells fade out (the view switched off); records go once empty. */
  clearLayers(): void { this.setLayers([]); }

  // ------------------------------------------------------------------------------------------------ refresh

  /**
   * Refreshes the cell layers. With `data` (the persisted field) layers are scanned incrementally, `budget.chunks`
   * chunks per call, round-robin; otherwise each due layer is iterated whole through `src` within `budget.visits`
   * (at least one layer per call). A cell missing from two consecutive passes of its layer fades out.
   */
  refresh(src: ScentCellSource, data: ScentChunkData | null, budget: RefreshBudget, now: number): void {
    this.st.visits = 0;
    this.st.chunks = 0;
    this.evictLeft = this.converge ? Infinity : budget.evictScan ?? Infinity;
    this.evictLeftSame = this.evictLeft * EVICT_SAME_RANK_SHARE;
    if (data) this.refreshChunks(data, budget, now);
    else this.refreshIterate(src, budget, now);
    this.retireEmpty();
  }

  private refreshIterate(src: ScentCellSource, budget: RefreshBudget, now: number): void {
    const n = this.layers.length;
    const start = this.cursor; // fixed for the call: the loop moves this.cursor
    let visits = 0, layers = 0;
    for (let k = 0; k < n && (visits < budget.visits || layers === 0); k++) {
      const li = (start + k) % n;
      const r = this.layers[li];
      if (r.spec.kind !== 'cells' || r.retired || now - r.passStartedAt < budget.minRefreshS) continue;
      if (!src.forEachActiveCell) continue;
      r.passStartedAt = now;
      this.vLi = li;
      this.vScale = 1 / r.spec.fullPh;
      this.vPass = r.pass;
      visits += src.forEachActiveCell(r.spec.colony, r.spec.channel, this.visitor);
      this.endPass(li);
      layers++;
      this.cursor = (li + 1) % n;
    }
    this.st.visits = visits;
  }

  private refreshChunks(data: ScentChunkData, budget: RefreshBudget, now: number): void {
    const n = this.layers.length;
    const cc = data.chunkCells, n3 = cc * cc * cc;
    const shift = Math.round(Math.log2(cc));
    const m = cc - 1;
    const same = cc === 16;
    const start = this.cursor; // fixed for the call: the loop moves this.cursor
    let left = budget.chunks, visits = 0;
    for (let k = 0; k < n && left > 0; k++) {
      const li = (start + k) % n;
      const r = this.layers[li];
      if (r.spec.kind !== 'cells' || r.retired) continue;
      const spec = r.spec;
      if (r.cursor === 0 && now - r.passStartedAt < budget.minRefreshS) continue;
      if (r.cursor === 0) r.passStartedAt = now;
      const pl = findLayer(data.layers, spec.colony, spec.channel);
      const keys = pl?.keys ?? [];
      const chunks = pl?.chunks ?? [];
      const scale = 1 / spec.fullPh, pass = r.pass;
      while (r.cursor < keys.length && left > 0) {
        const key = keys[r.cursor], vals = chunks[r.cursor];
        r.cursor++;
        left--;
        this.st.chunks++;
        if (!vals) continue;
        const cx = (key % 1024) - 512, cy = (Math.floor(key / 1024) % 1024) - 512, cz = Math.floor(key / 1048576) - 512;
        const bx = cx << shift, by = cy << shift, bz = cz << shift;
        // same chunking as the slot index: one Map lookup per chunk, then direct reads
        let slots = same ? r.index.chunk(chunkKeyOf(bx, by, bz)) : undefined;
        for (let i = 0; i < n3; i++) {
          const v = vals[i];
          if (v === 0) continue;
          visits++;
          const s = slots ? slots[i] : -1;
          if (s >= 0) {
            const x = v * scale;
            this.setTarget(s, x >= 1 ? 1 : Math.sqrt(x));
            this.seen[s] = pass;
            continue;
          }
          this.upsert(li, bx + (i & m), by + ((i >> shift) & m), bz + ((i >> (2 * shift)) & m), v * scale, pass);
          // re-read: the new slot may have created the chunk, or an eviction emptied and pooled it
          if (same) slots = r.index.chunk(chunkKeyOf(bx, by, bz));
        }
      }
      if (r.cursor >= keys.length) {
        this.endPass(li);
        r.cursor = 0;
        this.cursor = (li + 1) % n;
      } else {
        this.cursor = li; // continue this layer next call
        break;
      }
    }
    this.st.visits = visits;
  }

  /** Creates or updates the slot of a cell; v is value / fullPh. */
  private upsert(li: number, ix: number, iy: number, iz: number, v: number, pass: number): void {
    const r = this.layers[li];
    let s = r.index.get(ix, iy, iz);
    const t = v >= 1 ? 1 : Math.sqrt(v);
    if (s < 0) {
      s = this.alloc(r.rank, t);
      if (s < 0) return;
      r.index.set(ix, iy, iz, s);
      if (r.spec.style % RIVAL_FLAG === STYLE.trail) r.geoDirty = true;
      const c3 = s * 3;
      this.cellXYZ[c3] = ix; this.cellXYZ[c3 + 1] = iy; this.cellXYZ[c3 + 2] = iz;
      this.layerOf[s] = li;
      this.layers[li].count++;
      this.state[s] = PENDING;
      const p4 = s * 4;
      const c = this.cellMm;
      this.posSize[p4] = (ix + 0.5) * c; this.posSize[p4 + 1] = (iy + 0.5) * c; this.posSize[p4 + 2] = (iz + 0.5) * c;
      this.posSize[p4 + 3] = 0;
      this.nrmStyle[p4 + 3] = this.layers[li].spec.style;
      this.snapQ.push(s);
    }
    this.setTarget(s, t);
    this.seen[s] = pass;
  }

  private setTarget(s: number, t: number): void {
    this.target[s] = t;
    if (this.state[s] !== FREE) this.noteScore(this.scoreOf(s));
    if (this.state[s] !== LIVE) return;
    const v = this.val[s];
    if (v === t) return;
    if (this.converge || Math.abs(t - v) <= JUMP) {
      this.val[s] = t;
      this.markVal(s);
      if (t === 0) this.pushMoving(s); // let ease() free it
    } else this.pushMoving(s);
  }

  /** End of a layer pass: cells not seen in this pass nor the previous one have vanished. */
  private endPass(li: number): void {
    const r = this.layers[li];
    const pass = r.pass;
    for (let s = 0; s < this.high; s++) {
      if (this.layerOf[s] !== li || this.state[s] === FREE) continue;
      if (this.seen[s] + 1 >= pass) continue;
      if (this.state[s] === LIVE) this.setTarget(s, 0);
      else this.drop(s);
    }
    r.pass = pass + 1;
  }

  // ------------------------------------------------------------------------------------------------ points

  /** Places, updates or fades out the glyphs of a points layer (food plumes). */
  setPoints(key: string, entries: readonly PointEntry[]): void {
    const li = this.layers.findIndex((l) => l.spec.key === key);
    if (li < 0) return;
    const r = this.layers[li];
    const pass = ++r.pass;
    const style = r.spec.style;
    for (const e of entries) {
      let s = r.points.get(e.id) ?? -1;
      if (s < 0) {
        s = this.alloc(r.rank, Math.max(0, Math.min(1, e.intensity)));
        if (s < 0) continue;
        r.points.set(e.id, s);
        this.cellXYZ[s * 3] = e.id;
        this.layerOf[s] = li;
        r.count++;
        this.state[s] = LIVE;
      }
      const p4 = s * 4;
      const moved = this.posSize[p4] !== e.pos.x || this.posSize[p4 + 1] !== e.pos.y || this.posSize[p4 + 2] !== e.pos.z || this.posSize[p4 + 3] !== e.radiusMm;
      if (moved) {
        this.posSize[p4] = e.pos.x; this.posSize[p4 + 1] = e.pos.y; this.posSize[p4 + 2] = e.pos.z; this.posSize[p4 + 3] = e.radiusMm;
        this.nrmStyle[p4] = e.up.x; this.nrmStyle[p4 + 1] = e.up.y; this.nrmStyle[p4 + 2] = e.up.z; this.nrmStyle[p4 + 3] = style;
        tangentOf(e.up.x, e.up.y, e.up.z, this.axis, s * 3);
        this.markGeom(s);
      }
      this.setTarget(s, Math.max(0, Math.min(1, e.intensity)));
      this.seen[s] = pass;
    }
    if (r.count > entries.length) {
      for (let s = 0; s < this.high; s++) if (this.layerOf[s] === li && this.state[s] === LIVE && this.seen[s] !== pass) this.setTarget(s, 0);
    }
  }

  // ------------------------------------------------------------------------------------------------ snapping, axes

  /** Projects up to `budget` new cells onto their surfaces. Cells with no surface nearby stay hidden. */
  processSnaps(snapper: SurfaceSnapper, budget: number): number {
    let done = 0;
    const maxD2 = (SNAP_MAX_CELLS * this.cellMm) ** 2;
    while (this.snapHead < this.snapQ.length && done < budget) {
      const s = this.snapQ[this.snapHead++];
      if (this.state[s] !== PENDING) continue;
      done++;
      const p4 = s * 4;
      const x = this.posSize[p4], y = this.posSize[p4 + 1], z = this.posSize[p4 + 2];
      const ok = snapper.snap(x, y, z, this.tmpPos, this.tmpNrm);
      const d2 = ok ? (this.tmpPos.x - x) ** 2 + (this.tmpPos.y - y) ** 2 + (this.tmpPos.z - z) ** 2 : Infinity;
      if (!ok || !(d2 <= maxD2)) { this.state[s] = NO_SURFACE; this.noteScore(this.scoreOf(s)); continue; }
      const style = this.nrmStyle[p4 + 3];
      const trail = style % RIVAL_FLAG === STYLE.trail;
      this.posSize[p4] = this.tmpPos.x; this.posSize[p4 + 1] = this.tmpPos.y; this.posSize[p4 + 2] = this.tmpPos.z;
      this.posSize[p4 + 3] = this.cellMm * (trail ? DECAL.along : DECAL.round);
      this.nrmStyle[p4] = this.tmpNrm.x; this.nrmStyle[p4 + 1] = this.tmpNrm.y; this.nrmStyle[p4 + 2] = this.tmpNrm.z;
      tangentOf(this.tmpNrm.x, this.tmpNrm.y, this.tmpNrm.z, this.axis, s * 3);
      this.state[s] = LIVE;
      this.markGeom(s);
      if (trail) this.axisQ.push(s);
      this.val[s] = 0;
      this.setTarget(s, this.target[s]);
    }
    if (this.snapHead >= this.snapQ.length) { this.snapQ.length = 0; this.snapHead = 0; }
    this.st.snaps = done;
    return done;
  }

  /**
   * Evaluates trail directions: new trail cells first, then a slow sweep over all slots (trails grow, so a direction
   * computed from the first few cells is refined later): `budget` new cells, then `sweepBudget` existing ones.
   * Returns the number evaluated.
   */
  processAxes(budget: number, sweepBudget = 0, geoBudget = budget === Infinity ? Infinity : budget * 2): number {
    // along-trail distances first: a finished job queues the slots whose distance changed
    if (geoBudget > 0) this.geo.step(geoBudget);
    let done = 0;
    while (this.axisHead < this.axisQ.length && done < budget) {
      const s = this.axisQ[this.axisHead++];
      if (this.isTrail(s)) { this.computeAxis(s); done++; }
    }
    if (this.axisHead >= this.axisQ.length) { this.axisQ.length = 0; this.axisHead = 0; }
    // the sweep inspects at most 8x its evaluation budget of slots per call
    let swept = 0;
    let inspect = Math.min(this.high, sweepBudget * 8);
    while (inspect-- > 0 && swept < sweepBudget) {
      const s = this.axisSweep;
      this.axisSweep = this.axisSweep + 1 >= this.high ? 0 : this.axisSweep + 1;
      if (this.isTrail(s)) { this.computeAxis(s); swept++; }
    }
    this.st.axes = done + swept;
    return done + swept;
  }

  private isTrail(s: number): boolean {
    return this.state[s] === LIVE && this.layers[this.layerOf[s]]?.spec.kind === 'cells' && this.nrmStyle[s * 4 + 3] % RIVAL_FLAG === STYLE.trail;
  }

  private computeAxis(s: number): void {
    const li = this.layerOf[s];
    const r = this.layers[li];
    if (!r || r.spec.kind !== 'cells') return;
    const c3 = s * 3;
    const nbs = this.nbSlots, dirs = NEIGHBOUR_DIRS;
    r.index.neighbours(this.cellXYZ[c3], this.cellXYZ[c3 + 1], this.cellXYZ[c3 + 2], nbs);
    // the strongest neighbour, then the sign-aligned weighted sum of the neighbour directions (the ridge line)
    let best = 0, bi = -1;
    for (let k = 0; k < 26; k++) {
      const n = nbs[k];
      if (n < 0) continue;
      const w = this.target[n];
      if (w > best) { best = w; bi = k; }
    }
    if (bi < 0) return; // isolated cell: keep its default tangent
    const bx = dirs[bi * 3], by = dirs[bi * 3 + 1], bz = dirs[bi * 3 + 2];
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 26; k++) {
      const n = nbs[k];
      if (n < 0) continue;
      const w = this.target[n];
      if (!(w > 0)) continue;
      const dx = dirs[k * 3], dy = dirs[k * 3 + 1], dz = dirs[k * 3 + 2];
      const sgn = dx * bx + dy * by + dz * bz >= 0 ? w : -w;
      ax += sgn * dx; ay += sgn * dy; az += sgn * dz;
    }
    const p4 = s * 4, a3 = s * 3;
    const nx = this.nrmStyle[p4], ny = this.nrmStyle[p4 + 1], nz = this.nrmStyle[p4 + 2];
    const d = ax * nx + ay * ny + az * nz;
    ax -= d * nx; ay -= d * ny; az -= d * nz;
    const len = Math.sqrt(ax * ax + ay * ay + az * az);
    if (len < 1e-4) return;
    ax /= len; ay /= len; az /= len;
    if (this.flowSign(s, r.spec, ax, ay, az) < 0) { ax = -ax; ay = -ay; az = -az; }
    if (this.axis[a3] === ax && this.axis[a3 + 1] === ay && this.axis[a3 + 2] === az) return;
    this.axis[a3] = ax; this.axis[a3 + 1] = ay; this.axis[a3 + 2] = az;
    this.markGeom(s);
  }

  /**
   * Which way along the axis the chevrons flow: +1 / -1. Towards increasing distance along the trail from the
   * entrances (out to the food), from the neighbours' published distances (this.nbSlots holds them); where those
   * are unknown, away from the nearest entrance in a straight line.
   */
  private flowSign(s: number, spec: CellLayerSpec, ax: number, ay: number, az: number): number {
    const dist = this.geo.dist, nbs = this.nbSlots, dirs = NEIGHBOUR_DIRS;
    const ds = dist[s];
    if (ds === ds) {
      let g = 0;
      for (let k = 0; k < 26; k++) {
        const n = nbs[k];
        if (n < 0) continue;
        const dn = dist[n];
        if (dn !== dn) continue;
        g += (dn - ds) * (dirs[k * 3] * ax + dirs[k * 3 + 1] * ay + dirs[k * 3 + 2] * az);
      }
      if (g !== 0) return g > 0 ? 1 : -1;
    }
    const origins = spec.origins;
    if (origins.length === 0) return 1;
    const p4 = s * 4;
    const px = this.posSize[p4], py = this.posSize[p4 + 1], pz = this.posSize[p4 + 2];
    let o = origins[0], od = Infinity;
    for (let i = 0; i < origins.length; i++) {
      const q = origins[i];
      const d2 = (q.x - px) ** 2 + (q.y - py) ** 2 + (q.z - pz) ** 2;
      if (d2 < od) { od = d2; o = q; }
    }
    return ax * (px - o.x) + ay * (py - o.y) + az * (pz - o.z) < 0 ? -1 : 1;
  }

  // ------------------------------------------------------------------------------------------------ easing

  /** Eases moving intensities towards their targets (rate per real s; Infinity = jump) and frees faded slots. */
  ease(dt: number, rate: number): void {
    const k = rate === Infinity || this.converge ? 1 : 1 - Math.exp(-rate * Math.max(0, dt));
    let w = 0;
    for (let i = 0; i < this.movingN; i++) {
      const s = this.moving[i];
      if (this.state[s] !== LIVE) { this.inMoving[s] = 0; continue; }
      const t = this.target[s], v = this.val[s];
      let nv = v + (t - v) * k;
      if (Math.abs(nv - t) < 2e-3) nv = t;
      if (nv !== v) { this.val[s] = nv; this.markVal(s); }
      if (t === 0 && nv < FREE_EPS) { this.inMoving[s] = 0; this.drop(s); continue; }
      if (nv === t) { this.inMoving[s] = 0; continue; }
      this.moving[w++] = s;
    }
    this.movingN = w;
    while (this.high > 0 && this.state[this.high - 1] === FREE) this.high--;
  }

  private pushMoving(s: number): void {
    if (this.inMoving[s]) return;
    this.inMoving[s] = 1;
    this.moving[this.movingN++] = s;
  }

  // ------------------------------------------------------------------------------------------------ slots

  /**
   * A free slot for a cell of layer rank `rank` at intensity t; when the cache is full, the slot of a clearly
   * weaker cell (lower score = rank + RANK_STRENGTH t). -1 = none.
   */
  private alloc(rank: number, t: number): number {
    const score = rank + RANK_STRENGTH * t;
    if (this.freeTop === 0) {
      const v = this.findVictim(score - EVICT_MARGIN, rank);
      if (v < 0) return -1;
      this.drop(v);
      this.st.evicted++;
    }
    const s = this.freeList[--this.freeTop];
    if (s + 1 > this.high) this.high = s + 1;
    this.geo.reset(s);
    this.noteScore(score);
    return s;
  }

  /** Display score of a held slot: its layer's rank plus its strength; hidden or retired slots score lowest. */
  private scoreOf(s: number): number {
    const r = this.layers[this.layerOf[s]];
    if (!r || r.retired) return -1;
    if (this.state[s] === NO_SURFACE) return r.rank - 0.5;
    return r.rank + RANK_STRENGTH * this.target[s];
  }

  /**
   * The weakest of up to EVICT_SAMPLE held slots scoring below `threshold`, found by a sweep that resumes where the
   * last one stopped, within the call's scan budget. Each completed cycle of the sweep (possibly over several calls)
   * records the lowest score held, so cells that cannot beat it are refused at once (outranked) instead of
   * spending the scan budget that higher-ranked cells need.
   */
  private findVictim(threshold: number, rank: number): number {
    // a lower-ranked layer holding slots means a victim surely exists; otherwise only weaker cells of the same rank
    // qualify, searched within a smaller share of the budget so they cannot starve higher-ranked cells
    const lower = this.holdsBelow(rank);
    if (!lower && threshold <= this.scoreFloor) { this.st.outranked++; return -1; }
    const n = this.high;
    let best = -1, bestScore = threshold, found = 0, scanned = 0, min = Infinity;
    for (; scanned < n && (lower ? this.evictLeft : this.evictLeftSame) > 0; scanned++) {
      const s = this.evictCursor;
      this.evictCursor = s + 1 >= n ? 0 : s + 1;
      if (lower) this.evictLeft--; else this.evictLeftSame--;
      if (this.state[s] !== FREE) {
        const sc = this.scoreOf(s);
        if (sc < min) min = sc;
        if (sc < this.sweepMin) this.sweepMin = sc;
        if (sc < threshold) {
          found++;
          if (sc < bestScore) { best = s; bestScore = sc; }
        }
      }
      if (++this.sweepSeen >= n) {
        // a whole cycle: every held slot scores at least sweepMin (decreases since are folded in by noteScore)
        this.scoreFloor = this.sweepMin;
        this.sweepMin = Infinity;
        this.sweepSeen = 0;
        if (best < 0 && threshold <= this.scoreFloor) { this.st.outranked++; return -1; }
      }
      if (found >= EVICT_SAMPLE) break;
    }
    if (best < 0) {
      // this call alone saw every slot: its minimum is exact
      if (scanned >= n) { this.scoreFloor = min; this.st.outranked++; } else this.st.dropped++;
    }
    return best;
  }

  /** Some layer below this rank (or retired) holds slots. */
  private holdsBelow(rank: number): boolean {
    for (const r of this.layers) if (r.count > 0 && (r.retired || r.rank < rank)) return true;
    return false;
  }

  /** A slot's score may have dropped to sc: keep the lower bounds of the victim search valid. */
  private noteScore(sc: number): void {
    if (sc < this.scoreFloor) this.scoreFloor = sc;
    if (sc < this.sweepMin) this.sweepMin = sc;
  }

  /** Frees a slot and removes it from its layer's index. */
  private drop(s: number): void {
    const li = this.layerOf[s];
    const r = this.layers[li];
    if (r) {
      const c3 = s * 3;
      if (r.spec.kind === 'points') r.points.delete(this.cellXYZ[c3]);
      else {
        r.index.remove(this.cellXYZ[c3], this.cellXYZ[c3 + 1], this.cellXYZ[c3 + 2]);
        if (r.spec.style % RIVAL_FLAG === STYLE.trail) r.geoDirty = true;
      }
      r.count--;
    }
    this.state[s] = FREE;
    if (this.val[s] !== 0) { this.val[s] = 0; this.markVal(s); }
    this.target[s] = 0;
    this.layerOf[s] = -1;
    this.freeList[this.freeTop++] = s;
  }

  private markVal(s: number): void {
    if (s < this.valLo) this.valLo = s;
    if (s + 1 > this.valHi) this.valHi = s + 1;
  }

  private markGeom(s: number): void {
    if (s < this.geomLo) this.geomLo = s;
    if (s + 1 > this.geomHi) this.geomHi = s + 1;
  }

  /** Clears the dirty ranges (after an upload). */
  clearDirty(): void {
    this.geomLo = Infinity; this.geomHi = 0;
    this.valLo = Infinity; this.valHi = 0;
  }

  private retireEmpty(): void {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const r = this.layers[i];
      if (!r.retired) continue;
      if (r.count <= 0) {
        // slots refer to layers by index: re-point the slots of the layers after it
        this.layers.splice(i, 1);
        for (let s = 0; s < this.high; s++) if (this.layerOf[s] > i) this.layerOf[s]--;
        if (this.cursor > i) this.cursor--;
        this.geo.layerRemoved(i);
        continue;
      }
      for (let s = 0; s < this.high; s++) {
        if (this.layerOf[s] !== i) continue;
        if (this.state[s] === LIVE) this.setTarget(s, 0);
        else if (this.state[s] !== FREE) this.drop(s);
      }
    }
    if (this.cursor >= this.layers.length) this.cursor = 0;
  }

  /** The view of this cache the along-trail distance job works on. */
  private trailGraph(): TrailGraph {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    let rr = 0;
    return {
      cellMm: this.cellMm,
      get high() { return self.high; },
      cellXYZ: this.cellXYZ,
      isCellOf: (s, li) => self.layerOf[s] === li && (self.state[s] === LIVE || self.state[s] === PENDING),
      indexOf: (li) => self.layers[li]?.index ?? null,
      originsOf: (li) => { const sp = self.layers[li]?.spec; return sp && sp.kind === 'cells' ? sp.origins : []; },
      nextDirtyLayer: () => {
        const n = self.layers.length;
        for (let k = 0; k < n; k++) {
          const li = (rr + k) % n;
          const r = self.layers[li];
          if (!r.geoDirty) continue;
          r.geoDirty = false;
          if (r.retired || r.spec.kind !== 'cells' || r.spec.style % RIVAL_FLAG !== STYLE.trail) continue;
          rr = li + 1;
          return li;
        }
        return -1;
      },
      touched: (s) => { if (self.isTrail(s)) self.axisQ.push(s); },
    };
  }

  // ------------------------------------------------------------------------------------------------ queries

  /** Number of allocated slots of one layer (tests). */
  layerCount(key: string): number {
    return this.layers.find((l) => l.spec.key === key)?.count ?? 0;
  }

  /** Visits live slots (tests and probes): position, intensity, style. */
  forEachLive(fn: (s: number, x: number, y: number, z: number, v: number, style: number) => void): void {
    for (let s = 0; s < this.high; s++) {
      if (this.state[s] !== LIVE) continue;
      const p4 = s * 4;
      fn(s, this.posSize[p4], this.posSize[p4 + 1], this.posSize[p4 + 2], this.val[s], this.nrmStyle[p4 + 3]);
    }
  }

  /** Normal of a slot into out (tests). */
  normalOf(s: number, out: Vec3): Vec3 {
    out.x = this.nrmStyle[s * 4]; out.y = this.nrmStyle[s * 4 + 1]; out.z = this.nrmStyle[s * 4 + 2];
    return out;
  }

  stats(): ScentCacheStats {
    let live = 0, pending = 0;
    for (let s = 0; s < this.high; s++) {
      if (this.state[s] === LIVE) live++;
      else if (this.state[s] === PENDING) pending++;
    }
    return { ...this.st, slots: this.high, live, pending, moving: this.movingN, layers: this.layers.length };
  }
}

function findLayer(layers: readonly PheromoneLayer[], colony: number, channel: PheroChannel): PheromoneLayer | undefined {
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.colony === colony && l.channel === channel) return l;
  }
  return undefined;
}

/** A unit tangent of normal n into out[o..o+2] (projection of world X, or Z when n is close to X). */
function tangentOf(nx: number, ny: number, nz: number, out: Float32Array, o: number): void {
  let tx = 1, ty = 0, tz = 0;
  if (Math.abs(nx) > 0.9) { tx = 0; tz = 1; }
  const d = tx * nx + ty * ny + tz * nz;
  tx -= d * nx; ty -= d * ny; tz -= d * nz;
  const l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
  out[o] = tx / l; out[o + 1] = ty / l; out[o + 2] = tz / l;
}
