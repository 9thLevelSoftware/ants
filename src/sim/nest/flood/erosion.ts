// Rain erosion of mounds (GDD 03 §1.4, T2): for each game hour with rain intensity I > 0.2 at the mound, one
// relaxation pass over the whole grid at the repose angle minus 8 deg x I. Volume is conserved (material only moves
// between usable cells; kept-clear cells and the crater cap of moundRelax.ts are respected), so mounds slump,
// spread and the crater rim that protects the entrance against rain wears down. Mounds are spread over the hour by id
// (one slot per flood step), so the passes of different mounds never stack on one tick.

import type { Mound, Sim } from '@/sim/types';
import { MOUND_BREACH_PROBE_BU } from '@/sim/balance/nest';
import { EROSION_DEG_PER_I, EROSION_EVERY_TICKS, EROSION_MIN_I, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { moundMask, usableCell } from '../moundRelax';
import { publishMound } from '../mounds';
import { nestRuntime } from '../runtime';
import { reposeDeg } from '../substrate';
import { intensityAt } from './inflow';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const DD = DX.map((x, i) => Math.hypot(x, DZ[i]));

/**
 * Breach records near a mound grid (positions and radii): the mound mask probes around them, but the nest runtime's
 * mask cache is keyed on the breach COUNT only, so a breach replaced by another elsewhere leaves a stale mask (task
 * weather-fix2: stage1a.e2e (c) diverged after a restore because the uninterrupted game eroded with a cached mask
 * holding a hole column a fresh build no longer probes). Owner of the cache: nestops (reported).
 */
function breachSignature(sim: Sim, m: Mound): string {
  const half = ((m.n - 1) * m.cell) / 2, pad = MOUND_BREACH_PROBE_BU * sim.world.bu;
  const x0 = m.centerX - half, z0 = m.centerZ - half, span = 2 * half;
  let sig = '';
  for (const b of sim.carve.breaches) {
    const r = b.r + pad;
    if (b.pos.x + r < x0 || b.pos.x - r > x0 + span || b.pos.z + r < z0 || b.pos.z - r > z0 + span) continue;
    sig += `${b.pos.x},${b.pos.z},${b.r};`;
  }
  return sig;
}

/** Per Sim (derived, never persisted): the breach signature each mound's cached mask was last rebuilt for here. */
const MASK_SIGS = new WeakMap<Sim, Map<number, string>>();

/**
 * The mound's kept-clear mask as a fresh build would give it: the cached one, unless this runtime has not rebuilt
 * it yet or the breaches around the grid changed since (then the cached entry is dropped and rebuilt). A new
 * runtime (a restored game) rebuilds at its first pass, so both games erode with masks of the same state.
 */
function currentMask(sim: Sim, m: Mound): ReturnType<typeof moundMask> {
  let sigs = MASK_SIGS.get(sim);
  if (!sigs) { sigs = new Map(); MASK_SIGS.set(sim, sigs); }
  const sig = breachSignature(sim, m);
  if (sigs.get(m.id) !== sig) {
    nestRuntime(sim).moundMasks.delete(m.id);
    sigs.set(m.id, sig);
  }
  return moundMask(sim, m);
}

/** One erosion pass over a mound at intensity I; returns the height moved, mm (summed transfers). */
export function erodeMound(sim: Sim, m: Mound, intensity: number): number {
  if (intensity <= EROSION_MIN_I) return 0;
  const mask = currentMask(sim, m);
  const n = m.n, h = m.h, base = m.base;
  const angle = Math.max(1, reposeDeg(m.material) - EROSION_DEG_PER_I * intensity);
  const tan = Math.tan((angle * Math.PI) / 180) * m.cell;
  let moved = 0;
  for (let i = 0; i < n * n; i++) {
    if (h[i] <= 0 || !usableCell(mask, i)) continue;
    const ix = i % n, iz = (i - ix) / n;
    const top = base[i] + h[i];
    for (let d = 0; d < DX.length; d++) {
      const jx = ix + DX[d], jz = iz + DZ[d];
      if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
      const j = jz * n + jx;
      if (!usableCell(mask, j)) continue;
      const excess = top - (base[j] + h[j]) - tan * DD[d];
      if (excess <= 0) continue;
      const t = Math.min(h[i], excess / 2, Math.max(0, mask.cap[j] - (base[j] + h[j])));
      if (t <= 0) continue;
      h[i] -= t;
      h[j] += t;
      moved += t;
      if (h[i] <= 0) break;
    }
  }
  if (moved > 0) publishMound(sim, m);
  return moved;
}

/** Hourly erosion of every mound by the rain at its centre (all at once: tests and tools). */
export function erodeMounds(sim: Sim): number {
  let moved = 0;
  for (const m of sim.state.worldDelta.mounds) moved += erodeMound(sim, m, intensityAt(sim, { x: m.centerX, y: 0, z: m.centerZ }));
  return moved;
}

/** Slots per erosion period (one per flood step). */
const SLOTS = EROSION_EVERY_TICKS / FLOOD_STEP_TICKS;

/** The flood step's share of the hourly erosion: the mounds whose slot (by id) is due at tick t + offset. */
export function erodeDueMounds(sim: Sim, t: number, offset: number): number {
  let moved = 0;
  for (const m of sim.state.worldDelta.mounds) {
    if ((t + offset + (m.id % SLOTS) * FLOOD_STEP_TICKS) % EROSION_EVERY_TICKS !== 0) continue;
    moved += erodeMound(sim, m, intensityAt(sim, { x: m.centerX, y: 0, z: m.centerZ }));
  }
  return moved;
}
