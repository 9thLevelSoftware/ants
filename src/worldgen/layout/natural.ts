// Step 1d-e: natural zones share the free nav cells (GDD 04 §4.2): 1-2 seed cells per zone (>= 0.25 L apart),
// multi-source Dijkstra with step cost 1 + 0.8 fbm(cell, 2 m); a zone stops claiming at its target count; ties by
// zone index then cell index; unclaimed cells go to zones short of their target, then to the nearest claimed
// neighbour. Islands below 0.5 m^2 merge into their majority neighbour.

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import { fbm2 } from '@/core/math/noise';
import { MinHeap } from '../kit/heap';
import { NATURAL_GROWTH, type NaturalZoneRule } from '../tuning/archetypes';

export interface NaturalInput {
  /** Zone id per nav cell; 255 = free (to be filled). Built cells keep their ids. */
  raster: Uint8Array;
  n: number;
  /** Nav cell edge, mm. */
  cell: number;
  zones: { id: number; frac: number; seed: NaturalZoneRule['seed'] }[];
  noiseSeed: number;
  /** Built cells that growth may cross without claiming them (paths: a footpath does not cut a lawn in two). */
  passable?: Uint8Array;
}

export const FREE = 255;
const D8: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Labels the regions growth can spread through (free cells plus passable built cells, 8-connected like the growth
 * step) and counts the free cells of each. Returns the label per cell (-1 = blocked) and the free count per label.
 */
function growthRegions(inp: NaturalInput): { label: Int32Array; freeCount: number[] } {
  const { n, raster, passable } = inp;
  const open = (c: number) => raster[c] === FREE || (passable !== undefined && passable[c] === 1);
  const label = new Int32Array(n * n).fill(-1);
  const freeCount: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < n * n; s++) {
    if (label[s] >= 0 || !open(s)) continue;
    const id = freeCount.length;
    let count = 0;
    label[s] = id;
    stack.push(s);
    while (stack.length > 0) {
      const c = stack.pop()!;
      if (raster[c] === FREE) count++;
      const ci = c % n, ck = Math.floor(c / n);
      for (const [dx, dz] of D8) {
        const i = ci + dx, k = ck + dz;
        if (i < 0 || k < 0 || i >= n || k >= n) continue;
        const j = k * n + i;
        if (label[j] < 0 && open(j)) { label[j] = id; stack.push(j); }
      }
    }
    freeCount.push(count);
  }
  return { label, freeCount };
}

function seedCells(rng: RngState, inp: NaturalInput, free: number[], targets: number[]): number[][] {
  const { n, raster } = inp;
  const L = n;
  const band = Math.max(1, Math.round(NATURAL_GROWTH.edgeBandFrac * L));
  const minSep = NATURAL_GROWTH.seedSpacingFrac * L;
  // a seed in a pocket that built zones close off (a sliver behind a band on the map edge) could never reach
  // its target, and the zone would all but vanish: seeds go only into regions with room for the whole zone
  const { label, freeCount } = growthRegions(inp);
  let largest = 0;
  for (let r = 1; r < freeCount.length; r++) if (freeCount[r] > freeCount[largest]) largest = r;
  const inLargest = free.filter((c) => label[c] === largest);
  const all: number[] = [];
  const out: number[][] = [];
  for (let zi = 0; zi < inp.zones.length; zi++) {
    const z = inp.zones[zi];
    const room = Math.min(targets[zi], freeCount[largest] ?? 0);
    const mine: number[] = [];
    const count = rngFloat(rng) < NATURAL_GROWTH.secondSeedP ? 2 : 1;
    const corner = Math.floor(rngFloat(rng) * 4), edge = Math.floor(rngFloat(rng) * 4);
    for (let s = 0; s < count; s++) {
      let pick = -1;
      for (let t = 0; t < 96 && pick < 0; t++) {
        const relax = t >= 64; // late tries ignore the preference and spacing
        let i: number, k: number;
        if (!relax && z.seed === 'corner') { i = Math.floor(rngFloat(rng) * band); k = Math.floor(rngFloat(rng) * band); if (corner & 1) i = n - 1 - i; if (corner & 2) k = n - 1 - k; }
        else if (!relax && z.seed === 'edge') {
          const a = Math.floor(rngFloat(rng) * n), d = Math.floor(rngFloat(rng) * band);
          [i, k] = edge === 0 ? [d, a] : edge === 1 ? [n - 1 - d, a] : edge === 2 ? [a, d] : [a, n - 1 - d];
        } else if (!relax && z.seed === 'center') { i = Math.floor(n * (0.25 + 0.5 * rngFloat(rng))); k = Math.floor(n * (0.25 + 0.5 * rngFloat(rng))); }
        else { const c = free[Math.floor(rngFloat(rng) * free.length)]; i = c % n; k = Math.floor(c / n); }
        const c = k * n + i;
        if (raster[c] !== FREE || freeCount[label[c]] < room) continue;
        if (!relax && all.some((o) => { const dx = (o % n) - i, dz = Math.floor(o / n) - k; return dx * dx + dz * dz < minSep * minSep; })) continue;
        pick = c;
      }
      if (pick < 0) pick = inLargest[Math.floor(rngFloat(rng) * inLargest.length)];
      mine.push(pick);
      all.push(pick);
    }
    out.push(mine);
  }
  return out;
}

/** Fills the free cells of `inp.raster` with natural zone ids; returns the realised cell count per zone. */
export function growNatural(rng: RngState, inp: NaturalInput): number[] {
  const { n, raster } = inp;
  const free: number[] = [];
  for (let c = 0; c < n * n; c++) if (raster[c] === FREE) free.push(c);
  const counts = inp.zones.map(() => 0);
  if (free.length === 0 || inp.zones.length === 0) return counts;
  const targets = inp.zones.map((z) => Math.round(z.frac * free.length));
  targets[targets.length - 1] = Math.max(0, free.length - targets.slice(0, -1).reduce((a, b) => a + b, 0));
  const inv = inp.cell / NATURAL_GROWTH.costNoiseWavelength;
  const stepCost = new Float32Array(n * n);
  for (const c of free) stepCost[c] = 1 + NATURAL_GROWTH.costNoise * fbm2((c % n) * inv, Math.floor(c / n) * inv, inp.noiseSeed, 3);
  const seeds = seedCells(rng, inp, free, targets);
  const claim = new Int16Array(n * n).fill(-1);
  const pass = inp.passable;
  const grow = (zi: number[], seedsOf: (zi: number) => number[]) => {
    const heap = new MinHeap(4096);
    const crossed = new Uint8Array(pass ? n * n : 0);
    for (const z of zi) for (const c of seedsOf(z)) heap.push(0, z, c);
    while (heap.size > 0) {
      const d = heap.topKey(), z = heap.topTie(), c = heap.topValue();
      heap.pop();
      if (counts[z] >= targets[z]) continue;
      if (raster[c] === FREE) {
        if (claim[c] >= 0) continue;
        claim[c] = z;
        counts[z]++;
      } else {
        // a passable built cell: crossed once per zone (bit per zone up to 8), never claimed
        const bit = 1 << (z & 7);
        if (crossed[c] & bit) continue;
        crossed[c] |= bit;
      }
      const ci = c % n, ck = Math.floor(c / n);
      for (const [dx, dz, w] of D8) {
        const i = ci + dx, k = ck + dz;
        if (i < 0 || k < 0 || i >= n || k >= n) continue;
        const j = k * n + i;
        if (raster[j] === FREE ? claim[j] < 0 : pass !== undefined && pass[j] === 1) heap.push(d + w * (raster[j] === FREE ? stepCost[j] : 1), z, j);
      }
    }
  };
  const allZones = inp.zones.map((_, i) => i);
  grow(allZones, (z) => seeds[z]);
  // zones boxed in before their target: grow again from their claimed cells into what is left
  const short = allZones.filter((z) => counts[z] < targets[z]);
  if (short.length > 0) {
    const edgeOf = (z: number) => free.filter((c) => claim[c] === z && neighbours(c, n).some((j) => raster[j] === FREE && claim[j] < 0));
    const fronts = short.map(edgeOf);
    for (const z of short) for (const c of fronts[short.indexOf(z)]) { claim[c] = -1; counts[z]--; }
    grow(short, (z) => fronts[short.indexOf(z)]);
  }
  // anything still unclaimed: nearest claimed neighbour (BFS in cell order)
  let queue = free.filter((c) => claim[c] >= 0);
  while (queue.length > 0) {
    const next: number[] = [];
    for (const c of queue) for (const j of neighbours(c, n)) {
      if (raster[j] === FREE && claim[j] < 0) { claim[j] = claim[c]; counts[claim[c]]++; next.push(j); }
    }
    queue = next;
  }
  rebalance(claim, free, n, counts, targets, raster);
  for (const c of free) raster[c] = inp.zones[Math.max(0, claim[c])].id;
  return counts;
}

/**
 * Moves cells from zones above their target to zones below it (boxed-in zones and leftover cells otherwise skew
 * the shares). The short zone grows breadth-first into a neighbour from their shared boundary; when no neighbour
 * has cells to spare, the deficit is passed along the shortest chain of adjacent zones to one that has (the
 * short zone takes from its neighbour, which takes from the next, and so on).
 */
function rebalance(claim: Int16Array, free: number[], n: number, counts: number[], targets: number[], raster: Uint8Array): void {
  const zones = counts.length;
  for (let iter = 0; iter < 8 * zones; iter++) {
    const adj = zoneAdjacency(claim, free, n, zones, raster);
    let best: { chain: number[]; amount: number } | null = null;
    for (let d = 0; d < zones; d++) {
      if (counts[d] >= targets[d]) continue;
      const chain = chainToSurplus(d, adj, counts, targets);
      if (!chain) continue;
      const amount = Math.min(targets[d] - counts[d], counts[chain[chain.length - 1]] - targets[chain[chain.length - 1]]);
      if (!best || chain.length < best.chain.length || (chain.length === best.chain.length && amount > best.amount)) best = { chain, amount };
    }
    if (!best) return;
    let want = best.amount;
    for (let j = 0; j + 1 < best.chain.length && want > 0; j++) {
      want = moveCells(claim, free, n, raster, best.chain[j + 1], best.chain[j], want);
      if (j === 0 && want === 0) return;
      counts[best.chain[j]] += want;
      counts[best.chain[j + 1]] -= want;
    }
  }
}

/** Zone adjacency (4-neighbour) over the natural cells. */
function zoneAdjacency(claim: Int16Array, free: number[], n: number, zones: number, raster: Uint8Array): Set<number>[] {
  const adj = Array.from({ length: zones }, () => new Set<number>());
  for (const c of free) {
    const z = claim[c];
    if (z < 0) continue;
    for (const j of neighbours(c, n)) if (raster[j] === FREE && claim[j] >= 0 && claim[j] !== z) adj[z].add(claim[j]);
  }
  return adj;
}

/** Shortest chain of adjacent zones from short zone d to a zone above its target (ties: lower zone ids first). */
function chainToSurplus(d: number, adj: Set<number>[], counts: number[], targets: number[]): number[] | null {
  const prev = new Int32Array(counts.length).fill(-2);
  prev[d] = -1;
  const queue = [d];
  for (let q = 0; q < queue.length; q++) {
    const z = queue[q];
    for (const s of [...adj[z]].sort((a, b) => a - b)) {
      if (prev[s] !== -2) continue;
      prev[s] = z;
      if (counts[s] > targets[s]) {
        const chain = [s];
        for (let t = z; t >= 0; t = prev[t]) chain.push(t);
        return chain.reverse();
      }
      queue.push(s);
    }
  }
  return null;
}

/** Moves up to `amount` cells of zone `from` to zone `to`, breadth-first from their shared boundary; returns the count. */
function moveCells(claim: Int16Array, free: number[], n: number, raster: Uint8Array, from: number, to: number, amount: number): number {
  let queue = free.filter((c) => claim[c] === from && neighbours(c, n).some((j) => raster[j] === FREE && claim[j] === to));
  let moved = 0;
  while (queue.length > 0 && moved < amount) {
    const next: number[] = [];
    for (const c of queue) {
      if (moved >= amount) break;
      if (claim[c] !== from) continue;
      claim[c] = to;
      moved++;
      for (const j of neighbours(c, n)) if (raster[j] === FREE && claim[j] === from) next.push(j);
    }
    queue = next;
  }
  return moved;
}

function neighbours(c: number, n: number): number[] {
  const i = c % n, k = Math.floor(c / n), out: number[] = [];
  if (i > 0) out.push(c - 1);
  if (i < n - 1) out.push(c + 1);
  if (k > 0) out.push(c - n);
  if (k < n - 1) out.push(c + n);
  return out;
}

/**
 * Merges 4-connected islands of natural zones smaller than `minCells` into the zone that borders them most
 * (ties: lower zone id). Built cells (not in `natural`) are never changed.
 */
export function mergeIslands(raster: Uint8Array, n: number, natural: Set<number>, minCells: number): number {
  const comp = new Int32Array(n * n).fill(-1);
  let merged = 0;
  for (let s = 0; s < n * n; s++) {
    if (comp[s] >= 0 || !natural.has(raster[s])) continue;
    const z = raster[s];
    const cells: number[] = [s];
    comp[s] = s;
    for (let q = 0; q < cells.length; q++) for (const j of neighbours(cells[q], n)) {
      if (comp[j] < 0 && raster[j] === z) { comp[j] = s; cells.push(j); }
    }
    if (cells.length >= minCells) continue;
    const votes = new Map<number, number>();
    for (const c of cells) for (const j of neighbours(c, n)) {
      const o = raster[j];
      if (o !== z && natural.has(o)) votes.set(o, (votes.get(o) ?? 0) + 1);
    }
    let best = -1, bv = 0;
    for (const [o, v] of [...votes.entries()].sort((a, b) => a[0] - b[0])) if (v > bv) { best = o; bv = v; }
    if (best < 0) continue;
    for (const c of cells) raster[c] = best;
    merged++;
  }
  return merged;
}
