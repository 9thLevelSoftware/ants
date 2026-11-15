// Pile relaxation and the kept-clear mask of a mound grid (GDD 03 §1.4).
//
// Mask: a grid point is unusable where a hard primitive stands (base NaN) and KEPT CLEAR (h held at 0) within the
// kept-clear radius of any entrance on the grid (r_ent + MOUND_CLEAR_PAD, plus one cell diagonal so the field's
// bilinear overlay is exactly 0 inside that radius) and wherever the nest cavity reaches the ground surface under
// the point (an open hole column: a ramp shaft's trench, a widened throat, a fresh pit no entrance record knows
// yet), probed around entrances and the carve grid's breach records. So settling never raises the ground over an
// opening.
//
// Relaxation is isotropic: every cell compares itself with its 8 neighbours (diagonals sqrt 2 cells away)
// against a slope limit of distance x tan(repose), gives half of its largest excess, shared in proportion to the
// excesses (thermal-erosion style), and the sweep alternates over eight scan orders, so cones are round
// instead of the 4-neighbour diamond and no scan direction is favoured. Kept-clear cells take no material; the
// crater's inner wall is a cap: no cell's top may stand higher than the ground at the pit + its distance to the
// pit x tan(repose). Material above the cap is pushed outward (along the cap's gradient), so the pit stays open,
// the inner wall stands at the angle of repose and the volume is conserved. Only cells near a change are
// re-evaluated after the first sweep.

import type { Entrance, Mound, Sim } from '@/sim/types';
import { heightAt } from '@/sim/world/terrainSample';
import {
  MOUND_BREACH_PROBE_BU, MOUND_CAP_REACH_BU, MOUND_CLEAR_PAD_BU, MOUND_HOLE_PROBE_BU, MOUND_HOLE_PROBE_DEPTH_BU, MOUND_MAX_SWEEPS, MOUND_SWEEP_PAD,
  MOUND_TRANSFER_EPS_BU,
} from '@/sim/balance/nest';
import { nestRuntime } from './runtime';
import { reposeDeg } from './substrate';

export interface MoundMask {
  /** 1 where pile material may lie. */
  ok: Uint8Array;
  /** Non-zero where the pile is held at h = 0: CLEAR_DISC (entrance kept-clear disc) or CLEAR_HOLE (open hole column). */
  clear: Uint8Array;
  /** Highest top (base + h) a cell may reach next to the pit, mm; Infinity far from it. */
  cap: Float32Array;
}

/** World x / z of grid point (0, 0), mm. */
export function moundOrigin(m: Mound): { x0: number; z0: number } {
  const half = ((m.n - 1) * m.cell) / 2;
  return { x0: m.centerX - half, z0: m.centerZ - half };
}

/** Kept-clear radius of an entrance on a pile grid: r_ent + pad, plus a cell diagonal for the bilinear overlay. */
export function clearRadius(sim: Sim, m: Mound, e: Entrance): number {
  return e.radius + MOUND_CLEAR_PAD_BU * sim.world.bu + m.cell * Math.SQRT2;
}

/** Entrances (any nest, any status) whose kept-clear or hole-probe zone touches the grid, in nest / entrance order. */
export function entrancesOnGrid(sim: Sim, m: Mound): Entrance[] {
  const { x0, z0 } = moundOrigin(m), span = (m.n - 1) * m.cell, pad = MOUND_HOLE_PROBE_BU * sim.world.bu;
  const out: Entrance[] = [];
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) {
      const r = clearRadius(sim, m, e) + pad;
      if (e.pos.x + r < x0 || e.pos.x - r > x0 + span || e.pos.z + r < z0 || e.pos.z - r > z0 + span) continue;
      out.push(e);
    }
  }
  return out;
}

/**
 * The mask of a pile now. It depends on the pile's base, the entrances on its grid, the breach records and the
 * cavity just under the ground: cached until one of those changes (signature of entrances and breaches here; near-
 * surface carves over the grid drop it in the nest runtime's carve listener).
 */
export function moundMask(sim: Sim, m: Mound): MoundMask {
  const rt = nestRuntime(sim);
  const sig = maskSignature(sim, m);
  const hit = rt.moundMasks.get(m.id);
  if (hit && hit.sig === sig) return hit.mask;
  const mask = buildMask(sim, m);
  rt.moundMasks.set(m.id, { sig, mask });
  return mask;
}

function maskSignature(sim: Sim, m: Mound): string {
  let sig = `${sim.carve.breaches.length}`;
  for (const e of entrancesOnGrid(sim, m)) sig += `|${e.id}:${e.pos.x}:${e.pos.z}:${e.radius}`;
  return sig;
}

function buildMask(sim: Sim, m: Mound): MoundMask {
  const n = m.n, ok = new Uint8Array(n * n), clear = new Uint8Array(n * n), probed = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) ok[i] = Number.isNaN(m.base[i]) ? 0 : 1;
  const { x0, z0 } = moundOrigin(m), bu = sim.world.bu, depth = MOUND_HOLE_PROBE_DEPTH_BU * bu;
  /** Calls fn(index, x, z) for the grid points within r of (cx, cz). */
  const around = (cx: number, cz: number, r: number, fn: (idx: number, x: number, z: number) => void): void => {
    const i0 = Math.max(0, Math.floor((cx - r - x0) / m.cell)), i1 = Math.min(n - 1, Math.ceil((cx + r - x0) / m.cell));
    const k0 = Math.max(0, Math.floor((cz - r - z0) / m.cell)), k1 = Math.min(n - 1, Math.ceil((cz + r - z0) / m.cell));
    for (let iz = k0; iz <= k1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const x = x0 + ix * m.cell, z = z0 + iz * m.cell;
      if (Math.hypot(x - cx, z - cz) <= r) fn(iz * n + ix, x, z);
    }
  };
  // the cavity reaches the ground surface at the grid point (the pile's own height does not hide it: the cavity wins)
  const probe = (idx: number, x: number, z: number): void => {
    if (probed[idx] === 1 || clear[idx] !== 0) return;
    probed[idx] = 1;
    const g = Number.isNaN(m.base[idx]) ? heightAt(sim.world.terrain, x, z) : m.base[idx];
    if (sim.field.sampleXYZ(x, g - depth, z) > 0) clear[idx] = CLEAR_HOLE;
  };
  const entrances = entrancesOnGrid(sim, m);
  for (const e of entrances) around(e.pos.x, e.pos.z, clearRadius(sim, m, e), (idx) => { clear[idx] = CLEAR_DISC; });
  // open holes: around entrances, and around the carve grid's breach records (a pit no entrance record knows yet)
  for (const e of entrances) around(e.pos.x, e.pos.z, clearRadius(sim, m, e) + MOUND_HOLE_PROBE_BU * bu, probe);
  const span = (n - 1) * m.cell, pad = MOUND_BREACH_PROBE_BU * bu;
  for (const b of sim.carve.breaches) {
    const r = b.r + pad;
    if (b.pos.x + r < x0 || b.pos.x - r > x0 + span || b.pos.z + r < z0 || b.pos.z - r > z0 + span) continue;
    around(b.pos.x, b.pos.z, r, probe);
  }
  return { ok, clear, cap: pitCap(sim, m, clear) };
}

/** clear[] values: kept clear as part of an entrance disc, or as an open hole column. */
const CLEAR_DISC = 1, CLEAR_HOLE = 2;

/**
 * Inner-wall cap of every cell within MOUND_CAP_REACH of the pit: ground at the pit's edge + distance to it x
 * tan(repose), measured to the nearest point of each entrance's kept-clear circle (exact, so the wall is round,
 * and on sloped ground it stands at repose uphill and downhill alike) and to the open hole columns on the pit's
 * edge (irregular trenches).
 */
function pitCap(sim: Sim, m: Mound, clear: Uint8Array): Float32Array {
  const n = m.n, cap = new Float32Array(n * n).fill(Infinity);
  const tan = Math.tan((reposeDeg(m.material) * Math.PI) / 180), reach = Math.ceil((MOUND_CAP_REACH_BU * sim.world.bu) / m.cell);
  const { x0, z0 } = moundOrigin(m);
  const ground = (i: number): number => (Number.isNaN(m.base[i]) ? heightAt(sim.world.terrain, x0 + (i % n) * m.cell, z0 + Math.floor(i / n) * m.cell) : m.base[i]);
  for (const e of entrancesOnGrid(sim, m)) {
    const rc = clearRadius(sim, m, e), rr = rc + reach * m.cell;
    const i0 = Math.max(0, Math.floor((e.pos.x - rr - x0) / m.cell)), i1 = Math.min(n - 1, Math.ceil((e.pos.x + rr - x0) / m.cell));
    const k0 = Math.max(0, Math.floor((e.pos.z - rr - z0) / m.cell)), k1 = Math.min(n - 1, Math.ceil((e.pos.z + rr - z0) / m.cell));
    for (let iz = k0; iz <= k1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const i = iz * n + ix;
      if (clear[i] !== 0) continue;
      // measured from the ground at the nearest point of the kept-clear circle, so on a slope the wall rises at
      // the angle of repose from the pit edge on every side (not from the ground height at the entrance centre)
      const dx = x0 + ix * m.cell - e.pos.x, dz = z0 + iz * m.cell - e.pos.z, d = Math.hypot(dx, dz);
      const f = d > 0 ? rc / d : 0;
      const c = heightAt(sim.world.terrain, e.pos.x + dx * f, e.pos.z + dz * f) + Math.max(0, d - rc) * tan;
      if (c < cap[i]) cap[i] = c;
    }
  }
  for (let j = 0; j < n * n; j++) {
    if (clear[j] !== CLEAR_HOLE) continue;
    const jx = j % n, jz = (j - jx) / n;
    // only edge cells of the pit matter (an inner one is never the nearest)
    const edge = (jx > 0 && clear[j - 1] === 0) || (jx < n - 1 && clear[j + 1] === 0) || (jz > 0 && clear[j - n] === 0) || (jz < n - 1 && clear[j + n] === 0);
    if (!edge) continue;
    const g = ground(j);
    for (let iz = Math.max(0, jz - reach); iz <= Math.min(n - 1, jz + reach); iz++)
      for (let ix = Math.max(0, jx - reach); ix <= Math.min(n - 1, jx + reach); ix++) {
        const i = iz * n + ix;
        if (clear[i] !== 0) continue;
        const c = g + Math.hypot(ix - jx, iz - jz) * m.cell * tan;
        if (c < cap[i]) cap[i] = c;
      }
  }
  return cap;
}

/** Is the cell usable for pile material (supported, not kept clear)? */
export function usableCell(mask: MoundMask, idx: number): boolean {
  return mask.ok[idx] === 1 && mask.clear[idx] === 0;
}

/** Nearest usable cell to (ci, ck) by Chebyshev rings in scan order, -1 if none. */
export function nearestUsable(m: Mound, mask: MoundMask, ci: number, ck: number): number {
  for (let r = 1; r < m.n; r++) {
    for (let iz = ck - r; iz <= ck + r; iz++) for (let ix = ci - r; ix <= ci + r; ix++) {
      if (Math.max(Math.abs(ix - ci), Math.abs(iz - ck)) !== r || ix < 0 || iz < 0 || ix >= m.n || iz >= m.n) continue;
      if (usableCell(mask, iz * m.n + ix)) return iz * m.n + ix;
    }
  }
  return -1;
}

/**
 * Moves pile height out of kept-clear cells (an entrance appeared or grew, a hole opened under the pile) onto the
 * nearest usable cell; relaxation then spreads it. Material with no usable cell left is lost to the terrain
 * (Mound.volume follows). Returns true if anything moved.
 */
export function clearKeptCells(sim: Sim, m: Mound, mask: MoundMask): boolean {
  const n = m.n;
  let moved = false, lost = 0;
  for (let idx = 0; idx < n * n; idx++) {
    if (m.h[idx] <= 0 || usableCell(mask, idx)) continue;
    const to = nearestUsable(m, mask, idx % n, Math.floor(idx / n));
    if (to >= 0) m.h[to] += m.h[idx]; else lost += m.h[idx];
    m.h[idx] = 0;
    moved = true;
  }
  if (lost > 0) m.volume -= (lost * m.cell * m.cell) / sim.world.bu ** 3;
  return moved;
}

// 8-neighbour stencil (axes and diagonals): offsets and distances in cells. Slope limits over these distances
// make the relaxed cone round to within about 10 % on any ring (4 neighbours leave a diamond, about 30 %);
// knight moves (16 neighbours) would round it further at twice the cost per sweep.
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const NS = DX.length;
const DD = DX.map((x, i) => Math.hypot(x, DZ[i]));
const EX = new Float64Array(NS);

/**
 * Relaxation to the angle of repose (GDD 03 §1.4) over the pile's bounding box + MOUND_SWEEP_PAD cells (growing
 * while transfers reach its edge), at most MOUND_MAX_SWEEPS sweeps until no transfer exceeds
 * MOUND_TRANSFER_EPS. Flow past the grid edge is absorbed into the terrain (Mound.volume follows). Returns true if
 * a transfer exceeded MOUND_TRANSFER_EPS (the pile is not settled yet) or kept-clear cells were emptied.
 */
export function relaxPile(sim: Sim, m: Mound): boolean {
  const moved = clearKeptCells(sim, m, moundMask(sim, m));
  clearCursor(m); // a whole relaxation from sweep 0 (a part-way batch sweep, if any, restarts at its next run)
  return relaxSweeps(sim, m, 0, Infinity).moved || moved;
}

/** Result of a run of relaxation sweeps. */
export interface SweepRun {
  /** A transfer exceeded MOUND_TRANSFER_EPS. */
  moved: boolean;
  /** The pile settled (a sweep moved no more than MOUND_TRANSFER_EPS) or MOUND_MAX_SWEEPS were reached. */
  done: boolean;
  /** Sweeps run. */
  sweeps: number;
  /** Work done: box cells visited + 8 x cells evaluated (the unit of MOUND_RELAX_WORK_PER_TICK). */
  work: number;
}

/** Scratch masks of relaxSweeps (one pair, reused: a run fills them before reading). */
let ACT = new Uint8Array(0), NXT = new Uint8Array(0);

/**
 * Relaxation sweeps `first`, `first + 1`, ... of a batch (the sweep index picks the scan order), until the pile
 * settles, MOUND_MAX_SWEEPS is reached, or `budget` work units are spent (at least one row runs). A sweep can stop
 * part-way, between rows: its next row, box, largest transfer so far and edge flag are kept on the mound
 * (relaxRow, relaxBox, relaxMaxT, relaxEdge), so a tick never pays more than the budget plus one row of the box.
 * Within a run, a sweep evaluates only the cells next to a cell that changed in the previous sweep or so far in
 * this one (a cell whose 3 x 3 stencil did not change since it last gave nothing gives nothing again); a run starts
 * by evaluating every cell, which by the same argument gives the same heights, so the result depends on the
 * persisted state alone (deterministic and save/load-safe however the work is cut into ticks). The sweep box is
 * the pile's extent + MOUND_SWEEP_PAD at the start of a sweep that begins a run, growing while transfers reach
 * its edge.
 */
export function relaxSweeps(sim: Sim, m: Mound, first: number, budget: number): SweepRun {
  const out: SweepRun = { moved: false, done: true, sweeps: 0, work: 0 };
  const mask = moundMask(sim, m);
  const n = m.n, h = m.h, base = m.base, ok = mask.ok, clear = mask.clear, cap = mask.cap;
  let x0 = n, x1 = -1, z0 = n, z1 = -1;
  let row = m.relaxRow ?? 0, maxT = m.relaxMaxT ?? 0, edge = (m.relaxEdge ?? 0) !== 0;
  if (row > 0 && m.relaxBox && m.relaxBox.length === 4) {
    [x0, x1, z0, z1] = m.relaxBox;
  } else {
    row = 0; maxT = 0; edge = false;
    for (let idx = 0; idx < n * n; idx++) {
      if (h[idx] <= 0) continue;
      const ix = idx % n, iz = (idx - ix) / n;
      if (ix < x0) x0 = ix; if (ix > x1) x1 = ix; if (iz < z0) z0 = iz; if (iz > z1) z1 = iz;
    }
    if (x1 < 0) { clearCursor(m); return out; }
    x0 = Math.max(0, x0 - MOUND_SWEEP_PAD); z0 = Math.max(0, z0 - MOUND_SWEEP_PAD);
    x1 = Math.min(n - 1, x1 + MOUND_SWEEP_PAD); z1 = Math.min(n - 1, z1 + MOUND_SWEEP_PAD);
  }
  const tan = Math.tan((reposeDeg(m.material) * Math.PI) / 180) * m.cell;
  const eps = MOUND_TRANSFER_EPS_BU * sim.world.bu;
  let lost = 0, rows = 0;
  if (ACT.length !== n * n) { ACT = new Uint8Array(n * n); NXT = new Uint8Array(n * n); }
  let act = ACT, nxt = NXT;
  act.fill(1);
  nxt.fill(1); // a resumed sweep: the rows already done may have marks this run cannot see
  if (row === 0) nxt.fill(0);
  const touch = (c: number): void => {
    const cx = c % n, cz = (c - cx) / n;
    nxt[c] = 1;
    for (let d = 0; d < NS; d++) {
      const jx = cx + DX[d], jz = cz + DZ[d];
      if (jx >= 0 && jz >= 0 && jx < n && jz < n) nxt[jz * n + jx] = 1;
    }
  };
  out.done = false;
  for (let sweep = first; sweep < MOUND_MAX_SWEEPS; sweep++) {
    // alternate the scan over eight orders (x or z fastest, each forward or back): material moved into a cell
    // scanned later in the same sweep travels on, so a fixed order would stretch piles along it
    const fx = (sweep & 1) === 0, fz = (sweep & 2) === 0, zFast = (sweep & 4) !== 0;
    const na = zFast ? x1 - x0 : z1 - z0, nb = zFast ? z1 - z0 : x1 - x0;
    for (let a = row; a <= na; a++) {
      if (rows > 0 && out.work >= budget) {
        // relaxRow 0: stopped at a sweep boundary (the box is then only kept for sweepCostBound)
        m.relaxRow = a; m.relaxBox = [x0, x1, z0, z1]; m.relaxMaxT = maxT; m.relaxEdge = edge ? 1 : 0;
        return finish(sim, m, out, lost);
      }
      rows++;
      out.work += nb + 1;
      for (let b = 0; b <= nb; b++) {
        const u = zFast ? a : b, w = zFast ? b : a;
        const ix = fx ? x0 + u : x1 - u, iz = fz ? z0 + w : z1 - w;
        const i = iz * n + ix;
        if ((act[i] | nxt[i]) === 0 || h[i] <= 0 || ok[i] === 0 || clear[i] !== 0) continue;
        out.work += NS;
        const top = base[i] + h[i];
        let maxE = 0, sumE = 0;
        for (let d = 0; d < NS; d++) {
          EX[d] = 0;
          const jx = ix + DX[d], jz = iz + DZ[d];
          let tj: number;
          if (jx < 0 || jz < 0 || jx >= n || jz >= n) tj = base[i];
          else {
            const j = jz * n + jx;
            if (ok[j] === 0 || clear[j] !== 0) continue;
            tj = base[j] + h[j];
          }
          const e = top - tj - DD[d] * tan;
          if (e <= 0) continue;
          EX[d] = e; sumE += e;
          if (e > maxE) maxE = e;
        }
        let gave = 0;
        if (maxE > 0) {
          const total = Math.min(h[i], 0.5 * maxE);
          for (let d = 0; d < NS; d++) {
            if (EX[d] <= 0) continue;
            const t = (total * EX[d]) / sumE;
            const jx = ix + DX[d], jz = iz + DZ[d];
            gave += t;
            if (jx < 0 || jz < 0 || jx >= n || jz >= n) { lost += t; continue; }
            h[jz * n + jx] += t;
            touch(jz * n + jx);
            if (jx <= x0 || jx >= x1 || jz <= z0 || jz >= z1) edge = true;
          }
        }
        // the crater's inner wall: material above the cap goes outward
        const over = Math.min(h[i] - gave, top - gave - cap[i]);
        if (over > 0) {
          OUT_EDGE[0] = 0;
          gave += pushOutward(n, h, ok, clear, cap, ix, iz, over, tan, { x0, x1, z0, z1 });
          if (OUT_EDGE[0] === 1) edge = true;
        }
        h[i] -= gave;
        if (gave > 0) touch(i);
        if (gave > maxT) maxT = gave;
        if (gave > eps) out.moved = true;
      }
    }
    out.sweeps++;
    row = 0;
    const t = act; act = nxt; nxt = t; nxt.fill(0);
    if (edge) { x0 = Math.max(0, x0 - 1); z0 = Math.max(0, z0 - 1); x1 = Math.min(n - 1, x1 + 1); z1 = Math.min(n - 1, z1 + 1); }
    const settled = maxT <= eps;
    maxT = 0; edge = false;
    if (settled) break;
  }
  out.done = true;
  clearCursor(m);
  return finish(sim, m, out, lost);
}

/**
 * Upper bound of the work of one sweep of the pile's relaxation: every cell of its sweep box evaluated (the box
 * of the sweep in progress, else the pile's extent + MOUND_SWEEP_PAD).
 */
export function sweepCostBound(m: Mound): number {
  let x0: number, x1: number, z0: number, z1: number;
  if (m.relaxBox && m.relaxBox.length === 4) [x0, x1, z0, z1] = m.relaxBox;
  else {
    const n = m.n;
    x0 = n; x1 = -1; z0 = n; z1 = -1;
    for (let idx = 0; idx < n * n; idx++) {
      if (m.h[idx] <= 0) continue;
      const ix = idx % n, iz = (idx - ix) / n;
      if (ix < x0) x0 = ix; if (ix > x1) x1 = ix; if (iz < z0) z0 = iz; if (iz > z1) z1 = iz;
    }
    if (x1 < 0) return 0;
    x0 = Math.max(0, x0 - MOUND_SWEEP_PAD); z0 = Math.max(0, z0 - MOUND_SWEEP_PAD);
    x1 = Math.min(n - 1, x1 + MOUND_SWEEP_PAD); z1 = Math.min(n - 1, z1 + MOUND_SWEEP_PAD);
  }
  return (x1 - x0 + 1) * (z1 - z0 + 1) * (NS + 1);
}

/** The relaxation is at a sweep boundary (or over): no part-way sweep to resume. */
export function clearCursor(m: Mound): void {
  delete m.relaxRow; delete m.relaxBox; delete m.relaxMaxT; delete m.relaxEdge;
}

function finish(sim: Sim, m: Mound, out: SweepRun, lost: number): SweepRun {
  if (lost > 0) m.volume -= (lost * m.cell * m.cell) / sim.world.bu ** 3;
  return out;
}

/**
 * Spreads `amount` from cell (ix, iz) over its 8 usable neighbours whose pit cap is higher (farther from the pit),
 * in proportion to how much higher (the outward gradient of the cap, so no direction is favoured). Returns the
 * amount placed (0 without such a neighbour). `step`: cell x tan(repose), mm. Sets OUT_EDGE when a receiving cell is on the sweep box edge.
 */
function pushOutward(n: number, h: Float32Array, ok: Uint8Array, clear: Uint8Array, cap: Float32Array, ix: number, iz: number,
  amount: number, step: number, box: { x0: number; x1: number; z0: number; z1: number }): number {
  const ci = cap[iz * n + ix];
  let wsum = 0;
  for (let q = 0; q < 8; q++) {
    OW[q] = 0;
    const jx = ix + DX[q], jz = iz + DZ[q];
    if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
    const j = jz * n + jx;
    if (ok[j] === 0 || clear[j] !== 0) continue;
    // how much the cap rises per cell toward j (an Infinity cap, beyond the cap's reach, counts as a full slope)
    const w = Math.min(cap[j] - ci, DD[q] * step);
    if (!(w > 0)) continue;
    OW[q] = w / DD[q];
    wsum += OW[q];
  }
  if (wsum <= 0) return 0;
  for (let q = 0; q < 8; q++) {
    if (OW[q] <= 0) continue;
    const jx = ix + DX[q], jz = iz + DZ[q];
    h[jz * n + jx] += (amount * OW[q]) / wsum;
    if (jx <= box.x0 || jx >= box.x1 || jz <= box.z0 || jz >= box.z1) OUT_EDGE[0] = 1;
  }
  return amount;
}
const OW = new Float64Array(8);
const OUT_EDGE = new Uint8Array(1);

/**
 * Grid points of a pile with height inside the kept-clear radius (r_ent + MOUND_CLEAR_PAD) of an entrance on its
 * grid: [entrance id, grid index] pairs; empty when settling kept every opening clear (soak invariant).
 */
export function pileOverOpenings(sim: Sim, m: Mound): [number, number][] {
  const { x0, z0 } = moundOrigin(m), out: [number, number][] = [];
  for (const e of entrancesOnGrid(sim, m)) {
    const r = e.radius + MOUND_CLEAR_PAD_BU * sim.world.bu;
    const i0 = Math.max(0, Math.floor((e.pos.x - r - x0) / m.cell)), i1 = Math.min(m.n - 1, Math.ceil((e.pos.x + r - x0) / m.cell));
    const k0 = Math.max(0, Math.floor((e.pos.z - r - z0) / m.cell)), k1 = Math.min(m.n - 1, Math.ceil((e.pos.z + r - z0) / m.cell));
    for (let iz = k0; iz <= k1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const idx = iz * m.n + ix;
      if (m.h[idx] > 0 && Math.hypot(x0 + ix * m.cell - e.pos.x, z0 + iz * m.cell - e.pos.z) <= r) out.push([e.id, idx]);
    }
  }
  return out;
}
