/**
 * Nest navigation: distance fields over OPEN carve-grid samples (openness >= 128 and not inside a hard primitive).
 * 26-connected graph with integer costs 3/4/5 (face/edge/corner ~ 1, sqrt2, sqrt3 scaled by 3), solved with Dial's
 * bucket BFS (a BFS with 6 rotating buckets: O(V)). Distances are stored per carve chunk as Uint16 (65535 = none).
 *
 * update(box) after a CARVE is incremental and exact: opening voxels only adds graph edges, so distances can only
 * decrease; newly opened voxels are seeded from their settled neighbours and relaxation spreads from there.
 * After a FILL distances can grow: call rebuild().
 *
 * Pure TypeScript (no three). Maps are runtime caches (rebuildable from the carve grid).
 */
import { CarveGrid, CH, CH3, chunkKey, type ChangeBox } from './carve';
import { Field } from './field';
import type { Vec3 } from './vec3';

export const INF = 65535;
const OFF = 512;
const NB: number[] = []; // di, dj, dk, cost
for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
  const n = Math.abs(di) + Math.abs(dj) + Math.abs(dk);
  if (n === 0) continue;
  NB.push(di, dj, dk, n === 1 ? 3 : n === 2 ? 4 : 5);
}
const enc = (i: number, j: number, k: number) => (i + OFF) | ((j + OFF) << 10) | ((k + OFF) << 20);

export type SeedFn = (x: number, y: number, z: number) => boolean;

export class NavField {
  readonly grid: CarveGrid;
  readonly field: Field;
  readonly seed: SeedFn;
  readonly dist = new Map<number, Uint16Array>();
  /** per-chunk passability (1 = open & not hard) */
  readonly pass = new Map<number, Uint8Array>();
  private buckets: number[][] = [[], [], [], [], [], []];
  lastStats = { ms: 0, open: 0, settled: 0 };

  constructor(grid: CarveGrid, field: Field, seed: SeedFn) { this.grid = grid; this.field = field; this.seed = seed; }

  private passMask(cx: number, cy: number, cz: number): Uint8Array | undefined {
    const k = chunkKey(cx, cy, cz);
    let m = this.pass.get(k);
    if (m) return m;
    const a = this.grid.chunks.get(k);
    if (!a) return undefined;
    m = new Uint8Array(CH3);
    this.fillMask(a, m, cx, cy, cz, 0, 0, 0, CH - 1, CH - 1, CH - 1);
    this.pass.set(k, m);
    return m;
  }

  private fillMask(a: Uint8Array, m: Uint8Array, cx: number, cy: number, cz: number,
    i0: number, j0: number, k0: number, i1: number, j1: number, k1: number): void {
    const v = this.grid.voxel, w = this.field.world;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const idx = i + (j << 4) + (k << 8);
      m[idx] = a[idx] >= 128 ? (w.fHard((cx * CH + i) * v, (cy * CH + j) * v, (cz * CH + k) * v) > 0 ? 1 : 0) : 0;
    }
  }

  // one-entry chunk caches: neighbours are almost always in the same chunk
  private pk = -1; private pm: Uint8Array | undefined;
  private dk = -1; private dm: Uint16Array | undefined;

  passable(i: number, j: number, k: number): boolean {
    const key = chunkKey(i >> 4, j >> 4, k >> 4);
    if (key !== this.pk) { this.pk = key; this.pm = this.passMask(i >> 4, j >> 4, k >> 4); }
    const m = this.pm;
    return !!m && m[(i & 15) + ((j & 15) << 4) + ((k & 15) << 8)] === 1;
  }

  get(i: number, j: number, k: number): number {
    const key = chunkKey(i >> 4, j >> 4, k >> 4);
    if (key !== this.dk) { this.dk = key; this.dm = this.dist.get(key); }
    const d = this.dm;
    return d ? d[(i & 15) + ((j & 15) << 4) + ((k & 15) << 8)] : INF;
  }

  private distArr(i: number, j: number, k: number): Uint16Array {
    const key = chunkKey(i >> 4, j >> 4, k >> 4);
    if (key === this.dk && this.dm) return this.dm;
    let d = this.dist.get(key);
    if (!d) { d = new Uint16Array(CH3).fill(INF); this.dist.set(key, d); }
    this.dk = key; this.dm = d;
    return d;
  }

  private invalidateCaches(): void { this.pk = -1; this.pm = undefined; this.dk = -1; this.dm = undefined; }

  /** full rebuild from scratch */
  rebuild(now: () => number = () => 0): { ms: number; open: number; settled: number } {
    const t0 = now();
    this.dist.clear(); this.pass.clear(); this.invalidateCaches();
    let open = 0;
    const v = this.grid.voxel;
    for (const b of this.buckets) b.length = 0;
    for (const [key] of this.grid.chunks) {
      const cx = (key % 1024) - OFF, cy = (Math.floor(key / 1024) % 1024) - OFF, cz = Math.floor(key / 1048576) - OFF;
      const m = this.passMask(cx, cy, cz)!;
      const d = new Uint16Array(CH3).fill(INF);
      this.dist.set(key, d);
      for (let idx = 0; idx < CH3; idx++) {
        if (!m[idx]) continue;
        open++;
        const i = cx * CH + (idx & 15), j = cy * CH + ((idx >> 4) & 15), k = cz * CH + (idx >> 8);
        if (this.seed(i * v, j * v, k * v)) { d[idx] = 0; this.buckets[0].push(enc(i, j, k)); }
      }
    }
    const settled = this.relax(0);
    this.lastStats = { ms: now() - t0, open, settled };
    return this.lastStats;
  }

  /** incremental update after a carve that changed samples inside box */
  update(box: ChangeBox, now: () => number = () => 0): { ms: number; open: number; settled: number } {
    const t0 = now();
    if (!box.changed) return { ms: 0, open: 0, settled: 0 };
    this.invalidateCaches();
    const v = this.grid.voxel;
    for (const b of this.buckets) b.length = 0;
    // refresh passability in the box
    for (let cz = box.k0 >> 4; cz <= box.k1 >> 4; cz++) for (let cy = box.j0 >> 4; cy <= box.j1 >> 4; cy++) for (let cx = box.i0 >> 4; cx <= box.i1 >> 4; cx++) {
      const key = chunkKey(cx, cy, cz);
      const a = this.grid.chunks.get(key);
      if (!a) continue;
      let m = this.pass.get(key);
      if (!m) { this.passMask(cx, cy, cz); continue; }
      const i0 = Math.max(0, box.i0 - cx * CH), i1 = Math.min(CH - 1, box.i1 - cx * CH);
      const j0 = Math.max(0, box.j0 - cy * CH), j1 = Math.min(CH - 1, box.j1 - cy * CH);
      const k0 = Math.max(0, box.k0 - cz * CH), k1 = Math.min(CH - 1, box.k1 - cz * CH);
      this.fillMask(a, m, cx, cy, cz, i0, j0, k0, i1, j1, k1);
    }
    // seed changed voxels from their neighbours
    let minB = Infinity, open = 0;
    for (let k = box.k0; k <= box.k1; k++) for (let j = box.j0; j <= box.j1; j++) for (let i = box.i0; i <= box.i1; i++) {
      if (!this.passable(i, j, k)) continue;
      open++;
      const d = this.distArr(i, j, k), idx = (i & 15) + ((j & 15) << 4) + ((k & 15) << 8);
      let best = this.seed(i * v, j * v, k * v) ? 0 : INF;
      if (best !== 0) for (let n = 0; n < NB.length; n += 4) {
        const ni = i + NB[n], nj = j + NB[n + 1], nk = k + NB[n + 2];
        const dn = this.get(ni, nj, nk);
        if (dn !== INF && this.passable(ni, nj, nk) && dn + NB[n + 3] < best) best = dn + NB[n + 3];
      }
      if (best < d[idx]) { d[idx] = best; this.buckets[best % 6].push(enc(i, j, k)); if (best < minB) minB = best; }
    }
    const settled = minB === Infinity ? 0 : this.relax(minB);
    this.lastStats = { ms: now() - t0, open, settled };
    return this.lastStats;
  }

  /** Dial's algorithm from bucket `start` until all buckets are empty. Returns settled count. */
  private relax(start: number): number {
    const B = this.buckets;
    let pending = 0;
    for (const b of B) pending += b.length;
    let cur = start, settled = 0;
    while (pending > 0) {
      const b = B[cur % 6];
      while (b.length) {
        const id = b.pop()!; pending--;
        const i = (id & 1023) - OFF, j = ((id >> 10) & 1023) - OFF, k = (id >> 20) - OFF;
        const d = this.get(i, j, k);
        if (d !== cur) continue; // stale entry
        settled++;
        for (let n = 0; n < NB.length; n += 4) {
          const ni = i + NB[n], nj = j + NB[n + 1], nk = k + NB[n + 2];
          if (!this.passable(ni, nj, nk)) continue;
          const nd = cur + NB[n + 3];
          if (nd >= INF) continue;
          const arr = this.distArr(ni, nj, nk), idx = (ni & 15) + ((nj & 15) << 4) + ((nk & 15) << 8);
          if (nd < arr[idx]) { arr[idx] = nd; B[nd % 6].push(enc(ni, nj, nk)); pending++; }
        }
      }
      cur++;
    }
    return settled;
  }

  /** nearest reachable open sample to p (searches the 4x4x4 block around p). Returns [i,j,k,d] or null. */
  nearest(p: Vec3): [number, number, number, number] | null {
    const inv = this.grid.inv;
    const fi = p.x * inv, fj = p.y * inv, fk = p.z * inv;
    const bi = Math.floor(fi), bj = Math.floor(fj), bk = Math.floor(fk);
    let best: [number, number, number, number] | null = null, bestScore = Infinity;
    for (let dk = -1; dk <= 2; dk++) for (let dj = -1; dj <= 2; dj++) for (let di = -1; di <= 2; di++) {
      const i = bi + di, j = bj + dj, k = bk + dk;
      const d = this.get(i, j, k);
      if (d === INF || !this.passable(i, j, k)) continue;
      const geo = (i - fi) ** 2 + (j - fj) ** 2 + (k - fk) ** 2;
      const score = geo * 100 + d * 0.01; // closest first, distance breaks ties
      if (score < bestScore) { bestScore = score; best = [i, j, k, d]; }
    }
    return best;
  }

  /**
   * Steering target: from the nearest open sample follow the steepest descent `look` steps and return that sample's
   * world position in out. Returns the distance value at the start sample, or -1 if p is not near the field.
   */
  lookahead(p: Vec3, look: number, out: Vec3): number {
    const s = this.nearest(p);
    if (!s) return -1;
    let [i, j, k] = s;
    const d0 = s[3];
    for (let step = 0; step < look; step++) {
      let bd = this.get(i, j, k), bi = i, bj = j, bk = k;
      for (let n = 0; n < NB.length; n += 4) {
        const ni = i + NB[n], nj = j + NB[n + 1], nk = k + NB[n + 2];
        const dn = this.get(ni, nj, nk);
        if (dn < bd && this.passable(ni, nj, nk)) { bd = dn; bi = ni; bj = nj; bk = nk; }
      }
      if (bi === i && bj === j && bk === k) break;
      i = bi; j = bj; k = bk;
    }
    const v = this.grid.voxel;
    out.x = i * v; out.y = j * v; out.z = k * v;
    return d0;
  }

  memoryBytes(): number { return (this.dist.size * CH3 * 2) + this.pass.size * CH3; }
}
