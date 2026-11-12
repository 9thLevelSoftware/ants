// One BFS distance field over the open-voxel graph: Dial's bucket algorithm (6 circular buckets, step costs
// 3/4/5) with a sorted seed list, used both for full rebuilds (all seeds at 0) and for exact incremental updates
// after carving (only edges are added, so distances can only decrease: affected voxels are re-seeded from their
// neighbours and relaxation spreads from there).
// Distances are Uint16 cost units per voxel (3 per face step; 65535 = unreachable), one array per chunk slot.
//
// Seeds per target point: every passable sample within the radius; if there is none, the point's nearest
// passable sample (a FALLBACK seed). A fallback depends on passability near the point, so update() re-evaluates
// it: a fallback that a rebuild would no longer pick cannot be removed incrementally (distances would grow),
// and update() then reports that the field must be rebuilt.

import type { Vec3 } from '@/core/math/vec3';
import type { VoxelBox } from '@/sim/nest/carve/keys';
import { CHUNK3, chunkKey } from '@/sim/nest/carve/keys';
import { NB_COST as NB_COSTImp, NB_LOCAL as NB_LOCALImp, NB_REQ as NB_REQImp, makeNeighbourhood, scanNeighbours as scanNeighboursImp, stepAllowed as stepAllowedImp, type NavChunks } from './graph';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const NB_COST = NB_COSTImp, NB_LOCAL = NB_LOCALImp, NB_REQ = NB_REQImp, scanNeighbours = scanNeighboursImp, stepAllowed = stepAllowedImp;

export const NAV_INF = 65535;
const ALL_NEIGHBOURS = (1 << 26) - 1;

/** Seeds of a field: every passable voxel within `radius` mm of any point (or the nearest one if none). */
export interface NavSeeds {
  points: Vec3[];
  /** mm */
  radius: number;
}

const enc = (slot: number, idx: number) => (slot << 12) | idx;

/** Seed state of one target point: passable samples within its radius, none at all, or enc(fallback sample). */
const SEED_IN_RADIUS = -2;
const SEED_NONE = -1;

/** Finds the nearest passable sample to p (the owner's rule); false if there is none near. */
export type NearestSampleFn = (p: Vec3, out: { slot: number; idx: number }) => boolean;

export class DistanceField {
  readonly seeds: NavSeeds;
  dist: (Uint16Array | undefined)[] = [];
  built = false;
  /** Index into the owner's change log up to which this field is current. */
  applied = 0;
  lastUse = 0;
  private readonly buckets: number[][] = [[], [], [], [], [], []];
  private readonly nh = makeNeighbourhood();
  private seedEnt: number[] = [];
  private seedVal: number[] = [];
  /** Per seed point (same order as seeds.points): SEED_IN_RADIUS, SEED_NONE or the encoded fallback sample. */
  private pointSeed: number[] = [];
  private readonly tmp = { slot: -1, idx: -1 };

  constructor(seeds: NavSeeds) {
    this.seeds = { points: seeds.points.map((p) => ({ x: p.x, y: p.y, z: p.z })), radius: seeds.radius };
  }

  bytes(): number {
    let n = 0;
    for (const d of this.dist) if (d) n += d.byteLength;
    return n;
  }

  free(): void {
    this.dist = [];
    this.built = false;
  }

  get(slot: number, idx: number): number {
    const d = this.dist[slot];
    return d === undefined ? NAV_INF : d[idx];
  }

  private arr(slot: number): Uint16Array {
    let d = this.dist[slot];
    if (d === undefined) {
      d = new Uint16Array(CHUNK3).fill(NAV_INF);
      this.dist[slot] = d;
    }
    return d;
  }

  /** True if global sample (i, j, k) lies within the seed radius of a seed point. */
  isSeedSample(i: number, j: number, k: number, voxel: number): boolean {
    const r2 = this.seeds.radius * this.seeds.radius;
    const x = i * voxel, y = j * voxel, z = k * voxel;
    for (const p of this.seeds.points) {
      const dx = x - p.x, dy = y - p.y, dz = z - p.z;
      if (dx * dx + dy * dy + dz * dz <= r2) return true;
    }
    return false;
  }

  /**
   * Passable samples within the seed radius of point p: true if there is one; with `add` each becomes a seed
   * at distance 0.
   */
  private radiusSeeds(ch: NavChunks, p: Vec3, add: boolean): boolean {
    const v = ch.grid.voxel, r = this.seeds.radius, rv = Math.ceil(r / v);
    const ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v);
    let found = false;
    for (let k = ck - rv; k <= ck + rv; k++) for (let j = cj - rv; j <= cj + rv; j++) for (let i = ci - rv; i <= ci + rv; i++) {
      const dx = i * v - p.x, dy = j * v - p.y, dz = k * v - p.z;
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const s = ch.slotAt(i, j, k);
      if (s < 0) continue;
      const idx = (i & 15) | ((j & 15) << 4) | ((k & 15) << 8);
      if (ch.pass[s][idx] !== 1) continue;
      if (!add) return true;
      this.addSeed(s, idx, 0);
      found = true;
    }
    return found;
  }

  /** What a rebuild would seed for point p (SEED_IN_RADIUS, SEED_NONE or the encoded fallback sample). */
  private seedChoice(ch: NavChunks, p: Vec3, nearest: NearestSampleFn): number {
    if (this.radiusSeeds(ch, p, false)) return SEED_IN_RADIUS;
    return nearest(p, this.tmp) ? enc(this.tmp.slot, this.tmp.idx) : SEED_NONE;
  }

  /** Full rebuild. Returns the number of settled voxels. */
  rebuild(ch: NavChunks, nearest: NearestSampleFn): number {
    this.dist = [];
    this.seedEnt.length = 0;
    this.seedVal.length = 0;
    this.pointSeed.length = 0;
    for (const p of this.seeds.points) {
      if (this.radiusSeeds(ch, p, true)) { this.pointSeed.push(SEED_IN_RADIUS); continue; }
      const choice = nearest(p, this.tmp) ? enc(this.tmp.slot, this.tmp.idx) : SEED_NONE;
      if (choice >= 0) this.addSeed(this.tmp.slot, this.tmp.idx, 0);
      this.pointSeed.push(choice);
    }
    this.built = true;
    return this.relax(ch);
  }

  private addSeed(slot: number, idx: number, val: number): void {
    const d = this.arr(slot);
    if (d[idx] <= val) return;
    d[idx] = val;
    this.seedEnt.push(enc(slot, idx));
    this.seedVal.push(val);
  }

  /**
   * Exact incremental update after the graph only GAINED voxels/edges inside the boxes. Returns the number of
   * settled voxels, or -1 (field untouched) when a fallback seed changed and the field must be rebuilt.
   */
  update(ch: NavChunks, boxes: VoxelBox[], nearest: NearestSampleFn): number {
    this.seedEnt.length = 0;
    this.seedVal.length = 0;
    const pts = this.seeds.points;
    for (let n = 0; n < pts.length; n++) {
      const was = this.pointSeed[n];
      if (was === SEED_IN_RADIUS) continue; // gained samples in the radius are seeded by the box scan below
      const now = this.seedChoice(ch, pts[n], nearest);
      if (now === was) continue;
      if (was !== SEED_NONE) return -1; // the old fallback seed would have to go: distances may grow
      this.pointSeed[n] = now;
      if (now >= 0) this.addSeed(now >>> 12, now & 4095, 0);
    }
    // re-seed every passable sample in each box (+1) from its neighbours; walk stored chunks only
    for (const b of boxes) {
      const i0 = b.i0 - 1, j0 = b.j0 - 1, k0 = b.k0 - 1, i1 = b.i1 + 1, j1 = b.j1 + 1, k1 = b.k1 + 1;
      for (let cz = k0 >> 4; cz <= k1 >> 4; cz++) for (let cy = j0 >> 4; cy <= j1 >> 4; cy++) for (let cx = i0 >> 4; cx <= i1 >> 4; cx++) {
        const s = ch.slotOf.get(chunkKey(cx, cy, cz));
        if (s === undefined) continue;
        const bi = cx * 16, bj = cy * 16, bk = cz * 16;
        const li0 = Math.max(i0, bi) - bi, li1 = Math.min(i1, bi + 15) - bi;
        const lj0 = Math.max(j0, bj) - bj, lj1 = Math.min(j1, bj + 15) - bj;
        const lk0 = Math.max(k0, bk) - bk, lk1 = Math.min(k1, bk + 15) - bk;
        for (let k = lk0; k <= lk1; k++) for (let j = lj0; j <= lj1; j++) for (let i = li0; i <= li1; i++) {
          this.reseed(ch, s, i | (j << 4) | (k << 8), bi + i, bj + j, bk + k);
        }
      }
    }
    return this.relax(ch);
  }

  /** Seeds passable sample (slot, idx) = global (i, j, k) with its best value from the neighbours, if lower. */
  private reseed(ch: NavChunks, s: number, idx: number, i: number, j: number, k: number): void {
    if (ch.pass[s][idx] !== 1) return;
    const cur = this.get(s, idx);
    let best = this.isSeedSample(i, j, k, ch.grid.voxel) ? 0 : NAV_INF;
    if (best !== 0) {
      const nh = this.nh;
      scanNeighbours(ch, s, idx, nh);
      for (let n = 0; n < 26; n++) {
        if (!stepAllowed(nh.mask, n)) continue;
        const dn = this.get(nh.slot[n], nh.idx[n]);
        if (dn !== NAV_INF && dn + NB_COST[n] < best) best = dn + NB_COST[n];
      }
    }
    if (best < cur) this.addSeed(s, idx, best);
  }

  /** Dial's algorithm from the seed list. Returns the number of settled voxels. */
  private relax(ch: NavChunks): number {
    // sort seeds by value (stable on entry for determinism)
    const order = this.seedVal.map((_, n) => n).sort((a, b) => this.seedVal[a] - this.seedVal[b] || this.seedEnt[a] - this.seedEnt[b]);
    const B = this.buckets, nh = this.nh;
    for (const b of B) b.length = 0;
    let sp = 0, pending = 0, settled = 0;
    let cur = order.length ? this.seedVal[order[0]] : 0;
    while (sp < order.length || pending > 0) {
      if (pending === 0 && sp < order.length && this.seedVal[order[sp]] > cur) cur = this.seedVal[order[sp]];
      while (sp < order.length && this.seedVal[order[sp]] === cur) {
        B[cur % 6].push(this.seedEnt[order[sp]]);
        pending++;
        sp++;
      }
      const bucket = B[cur % 6];
      while (bucket.length > 0) {
        const e = bucket.pop()!;
        pending--;
        const slot = e >>> 12, idx = e & 4095;
        const d = this.dist[slot]!;
        if (d[idx] !== cur) continue; // stale entry
        settled++;
        const li = idx & 15, lj = (idx >> 4) & 15, lk = idx >> 8;
        if (li > 0 && li < 15 && lj > 0 && lj < 15 && lk > 0 && lk < 15) {
          // fast path: every neighbour lies in the same chunk
          const p = ch.pass[slot];
          let m = 0;
          for (let n = 0; n < 26; n++) if (p[idx + NB_LOCAL[n]] === 1) m |= 1 << n;
          if (m === 0 || cur + 5 >= NAV_INF) continue;
          const base = slot << 12, full = m === ALL_NEIGHBOURS; // open all around (chamber interiors): no rule checks
          for (let n = 0; n < 26; n++) {
            if (!full) { const r = NB_REQ[n]; if ((m & r) !== r) continue; }
            const ni = idx + NB_LOCAL[n], nd = cur + NB_COST[n];
            if (nd < d[ni]) {
              d[ni] = nd;
              B[nd % 6].push(base | ni);
              pending++;
            }
          }
          continue;
        }
        scanNeighbours(ch, slot, idx, nh);
        const mask = nh.mask;
        if (mask === 0) continue;
        for (let n = 0; n < 26; n++) {
          if (!stepAllowed(mask, n)) continue;
          const nd = cur + NB_COST[n];
          if (nd >= NAV_INF) continue;
          const ns = nh.slot[n], ni = nh.idx[n];
          const arr = this.arr(ns);
          if (nd < arr[ni]) {
            arr[ni] = nd;
            B[nd % 6].push(enc(ns, ni));
            pending++;
          }
        }
      }
      cur++;
    }
    return settled;
  }
}
