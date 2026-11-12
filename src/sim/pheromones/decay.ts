// One decay step of a layer (exponential half-life over active cells only, staggered by chunk group, optional
// rate multiplier per patch) and the alarm diffusion that follows it (GDD 02 §8.2: a share of each cell flows to
// its free face neighbours).

import type { PheroCellTest, PheroDecayModifier } from '@/sim/types';
import { PHERO_DECAY_EVERY } from '@/sim/balance';
import type { LayerRuntime } from './layer';
import { PHERO_DECAY_PATCH_CELLS, PHERO_DIFFUSE_PER_S, PHERO_EPS, PHERO_HALF_LIFE_S } from './balance';

/** Number of decay stagger groups (one per tick of the decay cadence). */
export const PHERO_DECAY_GROUPS = PHERO_DECAY_EVERY;

// Per-pass scratch: decay factor per stagger group, and the decay-modifier cache per (slot, patch).
const groupF = new Float64Array(PHERO_DECAY_GROUPS);
const groupLn = new Float64Array(PHERO_DECAY_GROUPS);
let patchF = new Float64Array(0);
let slotPass = new Int32Array(0);
let pass = 0;

function ensurePatchCache(slots: number, perSlot: number): void {
  if (slotPass.length < slots) slotPass = new Int32Array(Math.max(slots, slotPass.length * 2));
  if (patchF.length < slots * perSlot) patchF = new Float64Array(Math.max(slots * perSlot, patchF.length * 2));
}

/**
 * Decays the active cells of a layer: a cell of a chunk in stagger group g by dtByGroup[g] seconds (0 = not this
 * pass), with the channel half-life and the optional decay-rate modifier, then removes cells below PHERO_EPS and
 * frees chunks left empty.
 *
 * The modifier is evaluated once per patch of PHERO_DECAY_PATCH_CELLS x 1 x PHERO_DECAY_PATCH_CELLS cells (x, y, z)
 * at the patch's x/z centre and the cell row's own height, not per cell: temperature, shade and material vary over
 * tens of BU, and a per-cell callback made the pass 5-15x slower. Height stays per cell so cells just above and
 * below a surface keep their own exposure.
 */
export function decayLayer(
  layer: LayerRuntime, dtByGroup: ArrayLike<number>, cell: number, modifier: PheroDecayModifier | null,
): void {
  const hl = PHERO_HALF_LIFE_S[layer.channel];
  let anyDue = false;
  for (let g = 0; g < PHERO_DECAY_GROUPS; g++) {
    const dt = dtByGroup[g] > 0 ? dtByGroup[g] : 0;
    if (dt > 0) anyDue = true;
    groupLn[g] = (-dt / hl) * Math.LN2;
    groupF[g] = Math.pow(2, -dt / hl);
  }
  if (!anyDue) return;
  // Floors and admission counters decay by group 0's time (every group gets the same total over a cadence).
  const f0 = groupF[0];
  if (f0 !== 1) {
    layer.data.cellFloor = (layer.data.cellFloor ?? 0) * f0;
    layer.data.chunkFloor = (layer.data.chunkFloor ?? 0) * f0;
    layer.pendingCells.scale(f0);
    layer.pendingChunks.scale(f0);
  }
  if (layer.count === 0) return;
  const sh3 = layer.shift3, lm = layer.n3 - 1, s = layer.shift, m = layer.mask;
  const act = layer.active, chunks = layer.data.chunks, listed = layer.listed, live = layer.live, grp = layer.grp;
  // Patch layout inside a chunk: px + pz * pn + ly * pn * pn, with pn = chunkCells / patch.
  const patch = Math.min(PHERO_DECAY_PATCH_CELLS, m + 1);
  const pb = Math.round(Math.log2(patch)), pn = (m + 1) >> pb, perSlot = pn * pn * (m + 1);
  const ch = layer.channel, colony = layer.colony;
  if (modifier) {
    ensurePatchCache(layer.chunkCount, perSlot);
    pass = (pass + 1) | 0;
  }
  let w = 0;
  for (let i = 0, n = layer.count; i < n; i++) {
    const e = act[i];
    const slot = e >>> sh3;
    const g = grp[slot];
    if (groupLn[g] === 0) { act[w++] = e; continue; }
    const loc = e & lm;
    let f = groupF[g];
    if (modifier) {
      if (slotPass[slot] !== pass) {
        slotPass[slot] = pass;
        patchF.fill(NaN, slot * perSlot, (slot + 1) * perSlot);
      }
      const lx = loc & m, ly = (loc >> s) & m, lz = (loc >> (2 * s)) & m;
      const pi = slot * perSlot + (lx >> pb) + (lz >> pb) * pn + ly * pn * pn;
      f = patchF[pi];
      if (f !== f) { // NaN: first cell of this patch in this pass
        const x = ((layer.ccx[slot] << s) + ((lx >> pb) << pb) + patch * 0.5) * cell;
        const y = ((layer.ccy[slot] << s) + ly + 0.5) * cell;
        const z = ((layer.ccz[slot] << s) + ((lz >> pb) << pb) + patch * 0.5) * cell;
        const mult = modifier(ch, x, y, z, colony);
        f = mult > 0 && Number.isFinite(mult) ? Math.exp(mult * groupLn[g]) : (mult === 0 ? 1 : groupF[g]);
        patchF[pi] = f;
      }
    }
    const vals = chunks[slot];
    const old = vals[loc];
    const v = old * f;
    if (v >= PHERO_EPS) {
      vals[loc] = v;
      act[w++] = e;
    } else {
      if (old !== 0) layer.nz--;
      vals[loc] = 0;
      listed[slot][loc] = 0;
      live[slot]--;
    }
  }
  layer.count = w;
  layer.version++;
  layer.freeEmptyChunks();
}

/** dtByGroup with the same dt for every group (a full, unstaggered pass). */
export function uniformDt(dt: number, out: Float64Array): Float64Array {
  out.fill(dt > 0 ? dt : 0);
  return out;
}

// Scratch for diffusion (grown on demand, reused).
let tx = new Int32Array(256), ty = new Int32Array(256), tz = new Int32Array(256), ts = new Int32Array(256);
let ta = new Float64Array(256);
let srcE = new Int32Array(64), srcD = new Float64Array(64);
let sx = new Int32Array(64), sy = new Int32Array(64), sz = new Int32Array(64);

function ensureTargets(n: number): void {
  if (n <= tx.length) return;
  let m = tx.length;
  while (m < n) m *= 2;
  const nx = new Int32Array(m), ny = new Int32Array(m), nz = new Int32Array(m), ns = new Int32Array(m);
  const na = new Float64Array(m);
  nx.set(tx); ny.set(ty); nz.set(tz); ns.set(ts); na.set(ta);
  tx = nx; ty = ny; tz = nz; ts = ns; ta = na;
}

function ensureSources(n: number): void {
  if (n <= srcE.length) return;
  let m = srcE.length;
  while (m < n) m *= 2;
  const ne = new Int32Array(m), nd = new Float64Array(m);
  const nx = new Int32Array(m), ny = new Int32Array(m), nz = new Int32Array(m);
  ne.set(srcE); nd.set(srcD);
  srcE = ne; srcD = nd; sx = nx; sy = ny; sz = nz;
}

const NB = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

/**
 * Shares `1 - (1 - rate)^dt` of each cell equally among its free face neighbours. The active list is sorted
 * first so the floating-point summation order is canonical (a loaded field diffuses bit-identically). Shares
 * smaller than PHERO_EPS that would create a new cell are not moved (keeps the cell set bounded). Mass is
 * conserved: a share a target cannot take (saturation) goes back to its source. Only cells removed by a cap
 * eviction during the step lose their mass (the cap is the one declared sink).
 */
export function diffuseLayer(layer: LayerRuntime, dt: number, cell: number, isFree: PheroCellTest | null): void {
  const rate = PHERO_DIFFUSE_PER_S[layer.channel];
  if (!(rate > 0) || !(dt > 0) || layer.count === 0) return;
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
      tx[nt] = jx; ty[nt] = jy; tz[nt] = jz; ta[nt] = share; ts[nt] = ns;
      nt++;
      delivered += share;
    }
    if (delivered > 0) {
      srcE[ns] = e; srcD[ns] = delivered;
      sx[ns] = ix; sy[ns] = iy; sz[ns] = iz;
      ns++;
    }
  }
  // Sources first (no structural change), then targets (may create chunks or evict, which remaps entries, so the
  // remainders go back by cell coordinates).
  for (let i = 0; i < ns; i++) {
    const v = layer.valueOf(srcE[i]) - srcD[i];
    layer.setValue(srcE[i], v > 0 ? v : 0);
  }
  for (let i = 0; i < nt; i++) {
    const rest = ta[i] - layer.add(tx[i], ty[i], tz[i], ta[i]);
    if (rest > 0) {
      const src = ts[i];
      layer.addExisting(sx[src], sy[src], sz[src], rest);
    }
  }
  layer.version++;
}
