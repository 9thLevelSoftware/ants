// Mounds and spoil heaps (GDD 03 §1.4): pile heightfields in WorldDelta.mounds, registered with the world field
// as height overlays (walkable, renderable, diggable as loose soil). Deposits spread over 3 x 3 cells; batches
// relax the pile to its angle of repose around a kept-clear entrance hole.

import type { Vec3 } from '@/core/math/vec3';
import { rngRange } from '@/core/rng';
import type { Entrance, Mound, Nest, Sim } from '@/sim/types';
import {
  DUMP_RING_BU, DUMP_RING_RIM_BU, MOUND_CELL_BU, MOUND_CLEAR_PAD_BU, MOUND_GRID_N, MOUND_MAX_SWEEPS,
  MOUND_SWEEP_PAD, MOUND_TRANSFER_EPS_BU, RIM_RING_BU,
} from '@/sim/balance/nest';
import { moundOverlay } from '@/sim/services';
import { heightAt } from '@/sim/world/terrainSample';
import { refreshWalkers } from './carveOps';
import { markNestDirty } from './runtime';
import { reposeDeg } from './substrate';

export function moundById(sim: Sim, id: number): Mound | undefined {
  return sim.state.worldDelta.mounds.find((m) => m.id === id);
}

/** World x / z of grid point (0, 0), mm. */
function origin(m: Mound): { x0: number; z0: number } {
  const half = ((m.n - 1) * m.cell) / 2;
  return { x0: m.centerX - half, z0: m.centerZ - half };
}

/** Grid point index nearest (x, z), or -1 outside the grid. */
export function moundCellAt(m: Mound, x: number, z: number): number {
  const { x0, z0 } = origin(m);
  const ix = Math.round((x - x0) / m.cell), iz = Math.round((z - z0) / m.cell);
  return ix < 0 || iz < 0 || ix >= m.n || iz >= m.n ? -1 : iz * m.n + ix;
}

export function moundContains(m: Mound, x: number, z: number): boolean {
  return moundCellAt(m, x, z) >= 0;
}

/**
 * New pile centred on (cx, cz): base = terrain height under each grid point; NaN (unusable) where a hard primitive
 * sits on the ground or the terrain is open (a hole) outside the kept-clear zone of its own entrance.
 */
export function createMound(sim: Sim, nest: Nest, entrance: Entrance | null, cx: number, cz: number, material: string): Mound {
  const bu = sim.world.bu, cell = MOUND_CELL_BU * bu, n = MOUND_GRID_N;
  const m: Mound = {
    id: sim.state.nextId++, nestId: nest.id, entranceId: entrance ? entrance.id : -1, centerX: cx, centerZ: cz, cell, n,
    base: new Float32Array(n * n), h: new Float32Array(n * n), material, volume: 0, absorbed: 0, lastBatchTick: sim.state.tick,
  };
  const { x0, z0 } = origin(m);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = x0 + ix * cell, z = z0 + iz * cell;
    const g = heightAt(sim.world.terrain, x, z);
    const blocked = sim.field.hardXYZ(x, g + cell * 0.5, z) < 0 || (sim.field.isHoleAt(x, z) && !(entrance && inClear(sim, entrance, x, z)));
    m.base[iz * n + ix] = blocked ? NaN : g;
  }
  sim.state.worldDelta.mounds.push(m);
  nest.moundIds.push(m.id);
  if (entrance) entrance.moundId = m.id;
  sim.kernel.setHeightOverlay(moundOverlay(m));
  return m;
}

function inClear(sim: Sim, e: Entrance, x: number, z: number): boolean {
  return Math.hypot(x - e.pos.x, z - e.pos.z) <= e.radius + MOUND_CLEAR_PAD_BU * sim.world.bu;
}

/** A new entrance takes over a pile without an entrance whose centre lies within its kept-clear zone + 2 BU. */
export function linkMoundToEntrance(sim: Sim, nest: Nest, e: Entrance): void {
  for (const id of nest.moundIds) {
    const m = moundById(sim, id);
    if (!m || m.entranceId >= 0) continue;
    if (Math.hypot(m.centerX - e.pos.x, m.centerZ - e.pos.z) > e.radius + 2 * sim.world.bu) continue;
    m.entranceId = e.id;
    e.moundId = m.id;
    clearEntranceCells(sim, m);
    return;
  }
}

/** The entrance whose opening this pile keeps clear, or null. */
function moundEntrance(sim: Sim, m: Mound): Entrance | null {
  if (m.entranceId < 0) return null;
  const nest = sim.stores.nests.get(m.nestId);
  return nest?.entrances.find((e) => e.id === m.entranceId) ?? null;
}

/** Is the cell usable for pile material (supported, not in the kept-clear hole)? */
function usable(sim: Sim, m: Mound, e: Entrance | null, idx: number): boolean {
  if (Number.isNaN(m.base[idx])) return false;
  if (!e) return true;
  const { x0, z0 } = origin(m);
  return !inClear(sim, e, x0 + (idx % m.n) * m.cell, z0 + Math.floor(idx / m.n) * m.cell);
}

/** Moves pile height out of kept-clear cells (the entrance radius may have grown) into the next ring outward. */
function clearEntranceCells(sim: Sim, m: Mound): void {
  const e = moundEntrance(sim, m);
  if (!e) return;
  const { x0, z0 } = origin(m);
  const reach = Math.ceil((e.radius + MOUND_CLEAR_PAD_BU * sim.world.bu) / m.cell) + 1;
  const ci = Math.round((e.pos.x - x0) / m.cell), ck = Math.round((e.pos.z - z0) / m.cell);
  for (let iz = ck - reach; iz <= ck + reach; iz++) for (let ix = ci - reach; ix <= ci + reach; ix++) {
    if (ix < 0 || iz < 0 || ix >= m.n || iz >= m.n) continue;
    const idx = iz * m.n + ix;
    if (m.h[idx] <= 0 || usable(sim, m, e, idx)) continue;
    const vol = m.h[idx] * m.cell * m.cell;
    // take it off the pile (grid and Mound.volume), then deposit it again outward: depositHeight adds it back
    m.h[idx] = 0;
    m.volume -= vol / sim.world.bu ** 3;
    const moved = depositHeight(sim, m, e, x0 + ix * m.cell + Math.sign(ix - ci) * (reach + 1) * m.cell, z0 + iz * m.cell + Math.sign(iz - ck) * (reach + 1) * m.cell, vol);
    // the outward point is off the grid: the nearest usable cell to this one takes it (lost only without any)
    if (!moved) depositHeight(sim, m, e, x0 + ix * m.cell, z0 + iz * m.cell, vol);
  }
}

const W3 = [1, 2, 1, 2, 4, 2, 1, 2, 1];

/**
 * Deposits `volMm3` (already bulked) on the 3 x 3 cells under (x, z), weights 4/16 centre, 2/16 edges, 1/16
 * corners, renormalised over usable cells; with none usable, the nearest usable cell in the grid takes it.
 * Returns false (nothing deposited) when the point is outside the grid.
 */
export function deposit(sim: Sim, m: Mound, x: number, z: number, volMm3: number): boolean {
  return depositHeight(sim, m, moundEntrance(sim, m), x, z, volMm3);
}

function depositHeight(sim: Sim, m: Mound, e: Entrance | null, x: number, z: number, volMm3: number): boolean {
  const c = moundCellAt(m, x, z);
  if (c < 0) return false;
  const ci = c % m.n, ck = Math.floor(c / m.n), area = m.cell * m.cell;
  let wsum = 0;
  for (let n = 0; n < 9; n++) {
    const ix = ci + (n % 3) - 1, iz = ck + Math.floor(n / 3) - 1;
    if (ix >= 0 && iz >= 0 && ix < m.n && iz < m.n && usable(sim, m, e, iz * m.n + ix)) wsum += W3[n];
  }
  if (wsum === 0) {
    const alt = nearestUsable(sim, m, e, ci, ck);
    if (alt < 0) return false;
    m.h[alt] += volMm3 / area;
  } else {
    for (let n = 0; n < 9; n++) {
      const ix = ci + (n % 3) - 1, iz = ck + Math.floor(n / 3) - 1;
      if (ix < 0 || iz < 0 || ix >= m.n || iz >= m.n) continue;
      const idx = iz * m.n + ix;
      if (usable(sim, m, e, idx)) m.h[idx] += (volMm3 * W3[n]) / wsum / area;
    }
  }
  m.volume += volMm3 / sim.world.bu ** 3;
  return true;
}

function nearestUsable(sim: Sim, m: Mound, e: Entrance | null, ci: number, ck: number): number {
  for (let r = 1; r < m.n; r++) {
    for (let iz = ck - r; iz <= ck + r; iz++) for (let ix = ci - r; ix <= ci + r; ix++) {
      if (Math.max(Math.abs(ix - ci), Math.abs(iz - ck)) !== r || ix < 0 || iz < 0 || ix >= m.n || iz >= m.n) continue;
      if (usable(sim, m, e, iz * m.n + ix)) return iz * m.n + ix;
    }
  }
  return -1;
}

/**
 * Relaxation to the angle of repose (GDD 03 §1.4): row-major sweeps over the pile's bounding box + 16 cells
 * (growing while transfers reach its edge); a cell gives half the excess over cell x tan(theta) to each lower
 * 4-neighbour; never into unusable or kept-clear cells; past the grid edge the material is lost to the terrain.
 * Returns true if anything moved.
 */
export function relax(sim: Sim, m: Mound): boolean {
  const e = moundEntrance(sim, m);
  clearEntranceCells(sim, m);
  const n = m.n, h = m.h, base = m.base;
  let x0 = n, x1 = -1, z0 = n, z1 = -1;
  for (let idx = 0; idx < n * n; idx++) {
    if (h[idx] <= 0) continue;
    const ix = idx % n, iz = (idx - ix) / n;
    if (ix < x0) x0 = ix; if (ix > x1) x1 = ix; if (iz < z0) z0 = iz; if (iz > z1) z1 = iz;
  }
  if (x1 < 0) return false;
  x0 = Math.max(0, x0 - MOUND_SWEEP_PAD); z0 = Math.max(0, z0 - MOUND_SWEEP_PAD);
  x1 = Math.min(n - 1, x1 + MOUND_SWEEP_PAD); z1 = Math.min(n - 1, z1 + MOUND_SWEEP_PAD);
  const ok = new Uint8Array(n * n);
  for (let idx = 0; idx < n * n; idx++) ok[idx] = usable(sim, m, e, idx) ? 1 : 0;
  const slope = m.cell * Math.tan((reposeDeg(m.material) * Math.PI) / 180);
  const eps = MOUND_TRANSFER_EPS_BU * sim.world.bu;
  let moved = false, lost = 0;
  for (let sweep = 0; sweep < MOUND_MAX_SWEEPS; sweep++) {
    let maxT = 0, edge = false;
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const i = iz * n + ix;
      if (h[i] <= 0 || !ok[i]) continue;
      for (let d = 0; d < 4; d++) {
        const jx = ix + (d === 0 ? -1 : d === 1 ? 1 : 0), jz = iz + (d === 2 ? -1 : d === 3 ? 1 : 0);
        const outside = jx < 0 || jz < 0 || jx >= n || jz >= n;
        const j = outside ? -1 : jz * n + jx;
        if (!outside && !ok[j]) continue;
        const topJ = outside ? base[i] : base[j] + h[j];
        const excess = base[i] + h[i] - topJ - slope;
        if (excess <= 0) continue;
        const t = Math.min(h[i], excess * 0.5);
        h[i] -= t;
        if (outside) lost += t; else h[j] += t;
        if (t > maxT) maxT = t;
        if (jx <= x0 || jx >= x1 || jz <= z0 || jz >= z1) edge = true;
      }
    }
    if (maxT > 0) moved = true;
    if (edge) { x0 = Math.max(0, x0 - 1); z0 = Math.max(0, z0 - 1); x1 = Math.min(n - 1, x1 + 1); z1 = Math.min(n - 1, z1 + 1); }
    if (maxT <= eps) break;
  }
  if (lost > 0) m.volume -= (lost * m.cell * m.cell) / sim.world.bu ** 3;
  return moved;
}

/** Pile volume from the grid, BU^3 (sum of h x cell area). */
export function moundVolume(sim: Sim, m: Mound): number {
  let s = 0;
  for (let i = 0; i < m.h.length; i++) s += m.h[i];
  return (s * m.cell * m.cell) / sim.world.bu ** 3;
}

/** Highest pile height on the ring r_ent .. r_ent + RIM_RING around the mound's entrance, BU. */
export function rimHeight(sim: Sim, m: Mound): number {
  const e = moundEntrance(sim, m);
  if (!e) return 0;
  const bu = sim.world.bu, { x0, z0 } = origin(m);
  let best = 0;
  for (let idx = 0; idx < m.h.length; idx++) {
    const ix = idx % m.n, iz = (idx - ix) / m.n;
    const d = Math.hypot(x0 + ix * m.cell - e.pos.x, z0 + iz * m.cell - e.pos.z);
    if (d >= e.radius && d <= e.radius + RIM_RING_BU * bu && m.h[idx] > best) best = m.h[idx];
  }
  return best / bu;
}

/** Pushes the pile to the field (overlay), re-projects walkers on it, marks its nest, emits `mound-changed`. */
export function publishMound(sim: Sim, m: Mound): void {
  sim.kernel.setHeightOverlay(moundOverlay(m));
  const { x0, z0 } = origin(m);
  const span = (m.n - 1) * m.cell;
  const c: Vec3 = { x: m.centerX, y: m.base[(m.n * m.n) >> 1] || 0, z: m.centerZ };
  refreshWalkers(sim, c, span * 0.75);
  markNestDirty(sim, m.nestId);
  let top = -Infinity, bottom = Infinity;
  for (let i = 0; i < m.h.length; i++) {
    if (Number.isNaN(m.base[i])) continue;
    if (m.base[i] < bottom) bottom = m.base[i];
    if (m.base[i] + m.h[i] > top) top = m.base[i] + m.h[i];
  }
  sim.emit({ type: 'mound-changed', moundId: m.id, min: { x: x0, y: bottom, z: z0 }, max: { x: x0 + span, y: top, z: z0 + span } });
}

/**
 * A dump point around an entrance (GDD 03 §7.7): uniform angle from the sim RNG, radius r_ent + U(1.5, 5) BU, or
 * r_ent + U(0.5, 1.5) BU while the entrance's rimTarget is above its rim (crater rim building).
 */
export function dumpPoint(sim: Sim, e: Entrance, out: Vec3): Vec3 {
  const bu = sim.world.bu;
  const m = e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
  const rimTargetBu = e.rimTarget / bu;
  const ring = rimTargetBu > (m ? rimHeight(sim, m) : 0) ? DUMP_RING_RIM_BU : DUMP_RING_BU;
  const a = rngRange(sim.state.rng, 0, 2 * Math.PI);
  const r = e.radius + rngRange(sim.state.rng, ring[0], ring[1]) * bu;
  out.x = e.pos.x + Math.cos(a) * r;
  out.z = e.pos.z + Math.sin(a) * r;
  out.y = sim.field.height(out.x, out.z);
  return out;
}
