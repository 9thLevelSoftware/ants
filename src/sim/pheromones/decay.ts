// One decay step of a layer (exponential half-life over active cells only, optional per-cell rate multiplier)
// and the alarm diffusion that follows it (GDD 02 §8.2: a share of each cell flows to its free face neighbours).

import type { PheroCellTest, PheroDecayModifier } from '@/sim/types';
import type { LayerRuntime } from './layer';
import { PHERO_DIFFUSE_PER_S, PHERO_EPS, PHERO_HALF_LIFE_S } from './balance';

const centre = { x: 0, y: 0, z: 0 };

/** Decays every active cell of a layer by dtSeconds; frees chunks left empty. */
export function decayLayer(layer: LayerRuntime, dt: number, cell: number, modifier: PheroDecayModifier | null): void {
  const base = Math.pow(2, -dt / PHERO_HALF_LIFE_S[layer.channel]);
  if (!modifier) {
    layer.scaleAll(base);
  } else {
    const ch = layer.channel;
    let lastMult = 1, lastF = base;
    layer.scaleBy((e) => {
      layer.centreOf(e, cell, centre);
      const m = modifier(ch, centre.x, centre.y, centre.z);
      if (m !== lastMult) {
        lastMult = m;
        lastF = m > 0 && Number.isFinite(m) ? Math.pow(base, m) : (m === 0 ? 1 : base);
      }
      return lastF;
    });
    // scaleBy keeps cells that are untouched (factor 1) even when below the floor: sweep them too.
    layer.compact(PHERO_EPS);
  }
  layer.freeEmptyChunks();
}

// Scratch for diffusion (grown on demand, reused).
let tx = new Int32Array(256), ty = new Int32Array(256), tz = new Int32Array(256);
let ta = new Float64Array(256);
let srcE = new Int32Array(64), srcD = new Float64Array(64);

function ensureTargets(n: number): void {
  if (n <= tx.length) return;
  let m = tx.length;
  while (m < n) m *= 2;
  const nx = new Int32Array(m), ny = new Int32Array(m), nz = new Int32Array(m), na = new Float64Array(m);
  nx.set(tx); ny.set(ty); nz.set(tz); na.set(ta);
  tx = nx; ty = ny; tz = nz; ta = na;
}

function ensureSources(n: number): void {
  if (n <= srcE.length) return;
  let m = srcE.length;
  while (m < n) m *= 2;
  const ne = new Int32Array(m), nd = new Float64Array(m);
  ne.set(srcE); nd.set(srcD);
  srcE = ne; srcD = nd;
}

const NB = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

/**
 * Shares `1 - (1 - rate)^dt` of each cell equally among its free face neighbours. The active list is sorted
 * first so the floating-point summation order is canonical (a loaded field diffuses bit-identically). Shares
 * smaller than PHERO_EPS that would create a new cell are not moved (keeps the cell set bounded).
 */
export function diffuseLayer(layer: LayerRuntime, dt: number, cell: number, isFree: PheroCellTest | null): void {
  const rate = PHERO_DIFFUSE_PER_S[layer.channel];
  if (!(rate > 0) || layer.count === 0) return;
  const frac = 1 - Math.pow(1 - rate, dt);
  layer.active.subarray(0, layer.count).sort();
  const n = layer.count;
  ensureSources(n);
  ensureTargets(n * 6);
  let nt = 0, ns = 0;
  const free = [false, false, false, false, false, false];
  for (let i = 0; i < n; i++) {
    const e = layer.active[i];
    const v = layer.valueOf(e);
    if (!(v > 0)) continue;
    const ix = layer.cellX(e), iy = layer.cellY(e), iz = layer.cellZ(e);
    let nFree = 0;
    for (let k = 0; k < 6; k++) {
      const jx = ix + NB[k * 3], jy = iy + NB[k * 3 + 1], jz = iz + NB[k * 3 + 2];
      free[k] = !isFree || isFree((jx + 0.5) * cell, (jy + 0.5) * cell, (jz + 0.5) * cell);
      if (free[k]) nFree++;
    }
    if (nFree === 0) continue;
    const share = (v * frac) / nFree;
    let delivered = 0;
    for (let k = 0; k < 6; k++) {
      if (!free[k]) continue;
      const jx = ix + NB[k * 3], jy = iy + NB[k * 3 + 1], jz = iz + NB[k * 3 + 2];
      if (share < PHERO_EPS && layer.get(jx, jy, jz) === 0) continue;
      tx[nt] = jx; ty[nt] = jy; tz[nt] = jz; ta[nt] = share;
      nt++;
      delivered += share;
    }
    if (delivered > 0) {
      srcE[ns] = e; srcD[ns] = delivered;
      ns++;
    }
  }
  // Sources first (no structural change), then targets (may create chunks or evict, which remaps entries).
  for (let i = 0; i < ns; i++) {
    const v = layer.valueOf(srcE[i]) - srcD[i];
    layer.setValue(srcE[i], v > 0 ? v : 0);
  }
  for (let i = 0; i < nt; i++) layer.add(tx[i], ty[i], tz[i], ta[i]);
  layer.version++;
}
