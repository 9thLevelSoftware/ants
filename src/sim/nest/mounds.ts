// Mounds and spoil heaps (GDD 03 §1.4): pile heightfields in WorldDelta.mounds, registered with the world field
// as height overlays (walkable, renderable, diggable as loose soil). Deposits spread over 3 x 3 cells; batches
// relax the pile to its angle of repose (moundRelax.ts) around kept-clear openings, so an entrance mound is a
// crater ring around its throat.

import type { Vec3 } from '@/core/math/vec3';
import { rngRange } from '@/core/rng';
import type { Entrance, Mound, Nest, Sim } from '@/sim/types';
import { notifySurfaceChanged } from '@/sim/locomotion';
import { DUMP_RING_BU, DUMP_RING_RIM_BU, MOUND_CELL_BU, MOUND_GRID_N, MOUND_LINK_BU, RIM_RING_BU } from '@/sim/balance/nest';
import { moundOverlay } from '@/sim/services';
import { heightAt } from '@/sim/world/terrainSample';
import { refreshWalkers } from './carveOps';
import { clearKeptCells, entrancesOnGrid, moundMask, moundOrigin, nearestUsable, relaxPile, usableCell } from './moundRelax';
import { markNestDirty, nestRuntime } from './runtime';

export function moundById(sim: Sim, id: number): Mound | undefined {
  return sim.state.worldDelta.mounds.find((m) => m.id === id);
}

/** Grid point index nearest (x, z), or -1 outside the grid. */
export function moundCellAt(m: Mound, x: number, z: number): number {
  const { x0, z0 } = moundOrigin(m);
  const ix = Math.round((x - x0) / m.cell), iz = Math.round((z - z0) / m.cell);
  return ix < 0 || iz < 0 || ix >= m.n || iz >= m.n ? -1 : iz * m.n + ix;
}

export function moundContains(m: Mound, x: number, z: number): boolean {
  return moundCellAt(m, x, z) >= 0;
}

/**
 * New pile centred on (cx, cz): base = terrain height under each grid point; NaN (unusable) where a hard primitive
 * sits on the ground or the ground is open (a hole) at creation. Holes opening later and entrances are kept clear
 * by the pile mask (moundRelax.ts), which follows the carve grid and entrance records as they change.
 */
export function createMound(sim: Sim, nest: Nest, entrance: Entrance | null, cx: number, cz: number, material: string): Mound {
  const bu = sim.world.bu, cell = MOUND_CELL_BU * bu, n = MOUND_GRID_N;
  const m: Mound = {
    id: sim.state.nextId++, nestId: nest.id, entranceId: entrance ? entrance.id : -1, centerX: cx, centerZ: cz, cell, n,
    base: new Float32Array(n * n), h: new Float32Array(n * n), material, volume: 0, absorbed: 0, lastBatchTick: sim.state.tick,
  };
  const { x0, z0 } = moundOrigin(m);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = x0 + ix * cell, z = z0 + iz * cell;
    const g = heightAt(sim.world.terrain, x, z);
    m.base[iz * n + ix] = sim.field.hardXYZ(x, g + cell * 0.5, z) < 0 || sim.field.isHoleAt(x, z) ? NaN : g;
  }
  sim.state.worldDelta.mounds.push(m);
  nest.moundIds.push(m.id);
  if (entrance) entrance.moundId = m.id;
  sim.kernel.setHeightOverlay(moundOverlay(m));
  return m;
}

/**
 * A new entrance takes over a pile of its nest without an entrance whose centre lies within its radius +
 * MOUND_LINK_BU (a spoil heap that started before the hole registered, e.g. the first founding expulsions).
 */
export function linkMoundToEntrance(sim: Sim, nest: Nest, e: Entrance): void {
  for (const id of nest.moundIds) {
    const m = moundById(sim, id);
    if (!m || m.entranceId >= 0 || m.material === 'frass') continue;
    if (Math.hypot(m.centerX - e.pos.x, m.centerZ - e.pos.z) > e.radius + MOUND_LINK_BU * sim.world.bu) continue;
    m.entranceId = e.id;
    e.moundId = m.id;
    if (clearKeptCells(sim, m, moundMask(sim, m))) publishMound(sim, m);
    return;
  }
}

/**
 * An entrance appeared, widened or moved: every pile whose grid it touches gives up the cells its kept-clear disc
 * (and the hole columns around it) now covers at once, not at the pile's next batch (GDD 03 §1.4: held at h = 0).
 */
export function clearPilesAround(sim: Sim, e: Entrance): void {
  nestRuntime(sim).moundMasks.clear();
  for (const m of sim.state.worldDelta.mounds) {
    if (!entrancesOnGrid(sim, m).includes(e)) continue;
    if (clearKeptCells(sim, m, moundMask(sim, m))) publishMound(sim, m);
  }
}

/** The entrance whose opening this pile belongs to, or null. */
function moundEntrance(sim: Sim, m: Mound): Entrance | null {
  if (m.entranceId < 0) return null;
  const nest = sim.stores.nests.get(m.nestId);
  return nest?.entrances.find((e) => e.id === m.entranceId) ?? null;
}

const W3 = [1, 2, 1, 2, 4, 2, 1, 2, 1];

/**
 * Deposits `volMm3` (already bulked) on the 3 x 3 cells under (x, z), weights 4/16 centre, 2/16 edges, 1/16
 * corners, renormalised over usable cells; with none usable, the nearest usable cell in the grid takes it.
 * Returns false (nothing deposited) when the point is outside the grid or no cell is usable.
 */
export function deposit(sim: Sim, m: Mound, x: number, z: number, volMm3: number): boolean {
  const c = moundCellAt(m, x, z);
  if (c < 0) return false;
  const mask = moundMask(sim, m);
  const ci = c % m.n, ck = Math.floor(c / m.n), area = m.cell * m.cell;
  let wsum = 0;
  for (let n = 0; n < 9; n++) {
    const ix = ci + (n % 3) - 1, iz = ck + Math.floor(n / 3) - 1;
    if (ix >= 0 && iz >= 0 && ix < m.n && iz < m.n && usableCell(mask, iz * m.n + ix)) wsum += W3[n];
  }
  if (wsum === 0) {
    const alt = nearestUsable(m, mask, ci, ck);
    if (alt < 0) return false;
    m.h[alt] += volMm3 / area;
  } else {
    for (let n = 0; n < 9; n++) {
      const ix = ci + (n % 3) - 1, iz = ck + Math.floor(n / 3) - 1;
      if (ix < 0 || iz < 0 || ix >= m.n || iz >= m.n) continue;
      const idx = iz * m.n + ix;
      if (usableCell(mask, idx)) m.h[idx] += (volMm3 * W3[n]) / wsum / area;
    }
  }
  m.volume += volMm3 / sim.world.bu ** 3;
  return true;
}

/** Relaxation to the angle of repose around the kept-clear openings (moundRelax.ts). True if anything moved. */
export function relax(sim: Sim, m: Mound): boolean {
  return relaxPile(sim, m);
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
  const bu = sim.world.bu, { x0, z0 } = moundOrigin(m);
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
  const { x0, z0 } = moundOrigin(m);
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
  const min = { x: x0, y: bottom, z: z0 }, max = { x: x0 + span, y: top, z: z0 + span };
  // the pile changed the walkable ground: locomotion re-derives the nav-grid cells under it and replans walkers
  if (top >= bottom) notifySurfaceChanged(sim, min, max);
  sim.emit({ type: 'mound-changed', moundId: m.id, min: { ...min }, max: { ...max } });
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
