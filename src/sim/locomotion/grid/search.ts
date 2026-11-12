// Searches on the nav grid: A* between two cells, multi-source Dijkstra (flow fields) and a cell line-of-sight
// test (supercover traversal). 8-neighbour moves plus micro-portal edges (GDD 04 §11); a diagonal needs both
// orthogonal neighbours passable. Edge cost = length x mean cell cost (static x runtime overlay) + climb cost on
// steps (blocked onto a face with too little grip) x avoid-disc factor; a portal edge costs its channel length.
// Scratch arrays are reused between calls (generation stamps), so steady-state searches do not allocate.

import { MinHeap } from './heap';
import { isBlocked, NAV_GRID_TUNING, type GridData, type Portal } from './gridData';

/** A disc whose cells cost `mult` times more (avoid markers, GDD 02 §12.2). */
export interface CostDisc {
  x: number;
  z: number;
  r: number;
  mult: number;
}

/** Cost factor of a partly covered open cell: any obstacle in it costs (paths keep clear of wall ends). */
function partialMult(f: number): number {
  return f > 0 ? 1 + NAV_GRID_TUNING.partialCost * (0.3 + f) : 1;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const SQRT2 = Math.SQRT2;

export class GridSearch {
  private readonly g: GridData;
  private readonly gs: Float64Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly done: Uint32Array;
  /** Portal used to reach a cell in the last A* (-1 = an 8-neighbour move). */
  private readonly via: Int32Array;
  private gen = 0;
  private readonly heap = new MinHeap(256);
  /** Nodes expanded by the last search (diagnostics). */
  expanded = 0;

  constructor(g: GridData) {
    this.g = g;
    const n = g.w * g.h;
    this.gs = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.done = new Uint32Array(n);
    this.via = new Int32Array(n);
  }

  /** Extra factor of entering cell c from the avoid discs (1 = none). */
  private discMult(c: number, discs: readonly CostDisc[] | null): number {
    if (!discs || discs.length === 0) return 1;
    const g = this.g, x = ((c % g.w) + 0.5) * g.cell, z = (Math.floor(c / g.w) + 0.5) * g.cell;
    let m = 1;
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i], dx = x - d.x, dz = z - d.z;
      if (dx * dx + dz * dz <= d.r * d.r) m *= d.mult;
    }
    return m;
  }

  /** Cost of the move a -> b (neighbours), Infinity if not allowed. */
  edgeCost(a: number, b: number, diag: boolean, discs: readonly CostDisc[] | null): number {
    const g = this.g;
    if (isBlocked(g, b)) return Infinity;
    if (diag) {
      const ax = a % g.w, az = (a - ax) / g.w, bx = b % g.w, bz = (b - bx) / g.w;
      if (isBlocked(g, az * g.w + bx) || isBlocked(g, bz * g.w + ax)) return Infinity;
    }
    const len = g.cell * (diag ? SQRT2 : 1);
    let c = len * 0.5 * (g.cost[a] * g.dyn[a] * partialMult(g.partial[a]) + g.cost[b] * g.dyn[b] * partialMult(g.partial[b]));
    const dh = Math.abs(g.ground[b] - g.ground[a]);
    if (dh > NAV_GRID_TUNING.stepBU * g.bu) {
      if (g.grip[g.ground[b] > g.ground[a] ? b : a] < NAV_GRID_TUNING.stepGripMin) return Infinity;
      c += NAV_GRID_TUNING.climbCostPerBU * dh;
    }
    return c * this.discMult(b, discs);
  }

  /** The cell at the other end of portal p from c if a walker of this clearance may use it, else -1. */
  portalOther(p: Portal, c: number, clearanceBu: number): number {
    if (!p.open || p.cellA < 0 || p.clearanceBu < clearanceBu - 1e-9) return -1;
    const o = c === p.cellA ? p.cellB : c === p.cellB ? p.cellA : -1;
    return o >= 0 && !isBlocked(this.g, o) ? o : -1;
  }

  private heuristic(c: number, t: number): number {
    const g = this.g, cx = c % g.w, cz = (c - cx) / g.w, tx = t % g.w, tz = (t - tx) / g.w;
    const dx = Math.abs(cx - tx), dz = Math.abs(cz - tz);
    return g.cell * (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz));
  }

  private nextGen(): number {
    this.gen = (this.gen + 1) >>> 0;
    if (this.gen === 0) { this.seen.fill(0); this.done.fill(0); this.gen = 1; }
    return this.gen;
  }

  /**
   * A* from cell s to cell t; the cell sequence s..t into out and, in outVia, the portal index used to enter each
   * cell (-1 = neighbour move). False if t is unreachable.
   */
  astar(s: number, t: number, discs: readonly CostDisc[] | null, out: number[], outVia: number[] = [], clearanceBu = 0): boolean {
    out.length = 0;
    outVia.length = 0;
    const g = this.g, gen = this.nextGen(), heap = this.heap;
    heap.clear();
    this.gs[s] = 0; this.parent[s] = -1; this.seen[s] = gen; this.via[s] = -1;
    heap.push(s, this.heuristic(s, t));
    this.expanded = 0;
    while (heap.size > 0) {
      const c = heap.pop();
      if (this.done[c] === gen) continue;
      this.done[c] = gen;
      this.expanded++;
      if (c === t) break;
      const cx = c % g.w, cz = (c - cx) / g.w;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
        const nb = nz * g.w + nx;
        if (this.done[nb] === gen) continue;
        const ec = this.edgeCost(c, nb, k >= 4, discs);
        if (ec === Infinity) continue;
        const ng = this.gs[c] + ec;
        if (this.seen[nb] !== gen || ng < this.gs[nb]) {
          this.seen[nb] = gen; this.gs[nb] = ng; this.parent[nb] = c; this.via[nb] = -1;
          heap.push(nb, ng + this.heuristic(nb, t));
        }
      }
      const ps = g.portalsAt.get(c);
      if (ps) for (const pi of ps) {
        const nb = this.portalOther(g.portals[pi], c, clearanceBu);
        if (nb < 0 || this.done[nb] === gen) continue;
        const ng = this.gs[c] + g.portals[pi].cost * this.discMult(nb, discs);
        if (this.seen[nb] !== gen || ng < this.gs[nb]) {
          this.seen[nb] = gen; this.gs[nb] = ng; this.parent[nb] = c; this.via[nb] = pi;
          heap.push(nb, ng + this.heuristic(nb, t));
        }
      }
    }
    if (this.done[t] !== gen) return false;
    for (let c = t; c !== -1; c = this.parent[c]) { out.push(c); outVia.push(this.via[c]); }
    out.reverse();
    outVia.reverse();
    return true;
  }

  /** Multi-source Dijkstra: cost-to-nearest-seed per cell into dist (Infinity = unreachable). */
  dijkstra(seeds: readonly number[], dist: Float32Array, clearanceBu = 0): void {
    const g = this.g, heap = this.heap, gen = this.nextGen();
    dist.fill(Infinity);
    heap.clear();
    for (const s of seeds) { dist[s] = 0; heap.push(s, 0); }
    while (heap.size > 0) {
      // (the first pop of a cell is its final distance; dist is Float32, so no key-vs-dist staleness test)
      const c = heap.pop();
      if (this.done[c] === gen) continue;
      this.done[c] = gen;
      const cx = c % g.w, cz = (c - cx) / g.w;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
        const nb = nz * g.w + nx;
        // costs are symmetric except the destination cell's blocked test: walk "backwards" from the seeds
        const ec = this.edgeCost(nb, c, k >= 4, null);
        if (ec === Infinity || isBlocked(g, nb)) continue;
        const nd = dist[c] + ec;
        if (nd < dist[nb]) { dist[nb] = nd; heap.push(nb, nd); }
      }
      const ps = g.portalsAt.get(c);
      if (ps) for (const pi of ps) {
        const nb = this.portalOther(g.portals[pi], c, clearanceBu);
        if (nb < 0) continue;
        const nd = dist[c] + g.portals[pi].cost;
        if (nd < dist[nb]) { dist[nb] = nd; heap.push(nb, nd); }
      }
    }
  }
}

/**
 * True if the straight segment (ax, az) -> (bx, bz) (mm) crosses only passable cells (supercover traversal) and,
 * when discs are given, does not pass through any of them.
 */
export function lineClear(g: GridData, ax: number, az: number, bx: number, bz: number,
  discs: readonly CostDisc[] | null = null): boolean {
  if (discs) for (const d of discs) if (segDiscHit(ax, az, bx, bz, d)) return false;
  const inv = 1 / g.cell;
  let ix = Math.floor(ax * inv), iz = Math.floor(az * inv);
  const tx = Math.floor(bx * inv), tz = Math.floor(bz * inv);
  const dx = bx - ax, dz = bz - az;
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(g.cell / dx) : Infinity, tdz = dz !== 0 ? Math.abs(g.cell / dz) : Infinity;
  let tmx = dx !== 0 ? ((sx > 0 ? (ix + 1) * g.cell - ax : ax - ix * g.cell) / Math.abs(dx)) : Infinity;
  let tmz = dz !== 0 ? ((sz > 0 ? (iz + 1) * g.cell - az : az - iz * g.cell) / Math.abs(dz)) : Infinity;
  for (let guard = 0; guard < 4 * (g.w + g.h); guard++) {
    if (ix < 0 || iz < 0 || ix >= g.w || iz >= g.h || isBlocked(g, iz * g.w + ix)) return false;
    if (ix === tx && iz === tz) return true;
    if (Math.abs(tmx - tmz) < 1e-12) {
      // passing exactly through a corner: both side cells must be passable
      const a = iz * g.w + ix + sx, b = (iz + sz) * g.w + ix;
      if (ix + sx < 0 || ix + sx >= g.w || isBlocked(g, a)) return false;
      if (iz + sz < 0 || iz + sz >= g.h || isBlocked(g, b)) return false;
      ix += sx; iz += sz; tmx += tdx; tmz += tdz;
    } else if (tmx < tmz) { ix += sx; tmx += tdx; } else { iz += sz; tmz += tdz; }
  }
  return false;
}

function segDiscHit(ax: number, az: number, bx: number, bz: number, d: CostDisc): boolean {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((d.x - ax) * vx + (d.z - az) * vz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + vx * t - d.x, pz = az + vz * t - d.z;
  return px * px + pz * pz <= d.r * d.r;
}
