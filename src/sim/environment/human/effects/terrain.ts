// Terrain changes (GDD 04 §15.4, §16): footprint depressions in bare sand / loam / humus, sand craters and mounds
// from children, stored as sparse height-delta tiles (32 x 32 terrain grid points, 1/16 mm units; layout
// tileIndex = tz * ceil(nx / 32) + tx, as the terrain renderer reads it). The field learns them through kernel
// height overlays (one per tile, re-registered lazily after a load), so walkers stand on the deformed ground.

import type { Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { disturb } from '@/sim/nest';
import { notifySurfaceChanged } from '@/sim/locomotion';
import { FOOT_ENTRANCE_BLOCK_P, FOOT_ENTRANCE_FILL_BU } from '@/sim/balance/human';
import { rngChance } from '@/core/rng';
import { inFootprint, footprintRadius, type Footprint } from '../plan';
import { humanRng } from './common';

export const HEIGHT_TILE = 32;
export const HEIGHT_UNIT_MM = 1 / 16;
/** Kernel height-overlay ids of the delta tiles (far from mound ids). */
const OVERLAY_ID_BASE = 0x40000000;

interface OverlayState { synced: Map<number, Float32Array> }
const overlays = new WeakMap<Sim, OverlayState>();

function tileOf(sim: Sim, tileIndex: number, create: boolean): Int16Array | null {
  const list = sim.state.worldDelta.heightDeltas;
  let t = list.find((d) => d.tileIndex === tileIndex);
  if (!t && create) { t = { tileIndex, data: new Int16Array(HEIGHT_TILE * HEIGHT_TILE) }; list.push(t); }
  return t ? t.data : null;
}

/** How a deformation meets the delta already there (old and dy in mm; returns the new delta). */
export type DeltaCombine = (old: number, dy: number) => number;

/**
 * A print presses the ground to its own depth: it never digs below an existing deeper dent (overlapping prints along
 * a lane stay one print deep) and it flattens a raised spot by its depth. Bounded however often people pass.
 */
export const pressPrint: DeltaCombine = (old, dy) => (old >= 0 ? old + dy : Math.min(old, dy));

/** Digging and heaping add up, within +-`bound` mm (children's sand: +-CHILD_SAND_DELTA_MM). */
export const addWithin = (bound: number): DeltaCombine => (old, dy) => Math.max(-bound, Math.min(bound, old + dy));

/**
 * Changes the terrain grid points inside a disc by `dy(d01)` (mm, negative = dig) through the delta tiles, combined
 * with the delta already there; then refreshes the touched overlays and the walkers there (nothing when no grid
 * point changed).
 */
export function deformDisc(sim: Sim, cx: number, cz: number, r: number, dy: (d01: number) => number, cause: string,
  combine: DeltaCombine): void {
  const hf = sim.world.terrain, cell = hf.cell;
  const tilesX = Math.ceil(hf.nx / HEIGHT_TILE);
  const i0 = Math.max(0, Math.floor((cx - r) / cell)), i1 = Math.min(hf.nx - 1, Math.ceil((cx + r) / cell));
  const k0 = Math.max(0, Math.floor((cz - r) / cell)), k1 = Math.min(hf.nz - 1, Math.ceil((cz + r) / cell));
  const touched = new Set<number>();
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * cell - cx, k * cell - cz) / r;
      if (d > 1) continue;
      const tileIndex = Math.floor(k / HEIGHT_TILE) * tilesX + Math.floor(i / HEIGHT_TILE);
      const j = (k % HEIGHT_TILE) * HEIGHT_TILE + (i % HEIGHT_TILE);
      const existing = tileOf(sim, tileIndex, false);
      const old = existing ? existing[j] : 0;
      const v = Math.max(-32768, Math.min(32767, Math.round(combine(old * HEIGHT_UNIT_MM, dy(d)) / HEIGHT_UNIT_MM)));
      if (v === old) continue;
      (existing ?? tileOf(sim, tileIndex, true)!)[j] = v;
      touched.add(tileIndex);
    }
  }
  if (touched.size === 0) return;
  syncHeightOverlays(sim, touched);
  const min = { x: cx - r, y: -1e6, z: cz - r }, max = { x: cx + r, y: 1e6, z: cz + r };
  notifySurfaceChanged(sim, min, max);
  sim.emit({ type: 'world.terrain-deformed', min, max, cause });
}

/**
 * Registers delta tiles as kernel height overlays (tile grid plus a ring of zeros, so tiles sum exactly): all of them
 * (after a load), or only `only`.
 */
export function syncHeightOverlays(sim: Sim, only?: ReadonlySet<number>): void {
  let st = overlays.get(sim);
  if (!st) { st = { synced: new Map() }; overlays.set(sim, st); }
  const hf = sim.world.terrain, cell = hf.cell, T = HEIGHT_TILE, tilesX = Math.ceil(hf.nx / T);
  for (const t of sim.state.worldDelta.heightDeltas) {
    if (only && !only.has(t.tileIndex)) continue;
    const tx = t.tileIndex % tilesX, tz = Math.floor(t.tileIndex / tilesX);
    let h = st.synced.get(t.tileIndex);
    const n = T + 2;
    let changed = !h;
    if (!h) h = new Float32Array(n * n);
    for (let j = 0; j < T; j++) {
      for (let i = 0; i < T; i++) {
        const v = t.data[j * T + i] * HEIGHT_UNIT_MM, idx = (j + 1) * n + (i + 1);
        if (h[idx] !== v) { h[idx] = v; changed = true; }
      }
    }
    if (!changed) continue;
    st.synced.set(t.tileIndex, h);
    sim.kernel.setHeightOverlay({
      id: OVERLAY_ID_BASE + t.tileIndex, x0: (tx * T - 1) * cell, z0: (tz * T - 1) * cell, cell, nx: n, nz: n, h, material: null,
    });
  }
}

/** Footprint depression (bare sand deeper) and the entrance rule: an entrance on sand or loam under the sole is
 *  blocked with p 0.5 (its top 1.5 BU refilled); the nest is told of the disturbance either way. */
export function footprintOnSoil(sim: Sim, fp: Footprint, depthMm: number, soil: boolean): void {
  if (soil) deformDisc(sim, fp.x, fp.z, Math.max(fp.hx, fp.hz) * 0.8, (d) => -depthMm * (1 - d * d), 'footprint', pressPrint);
  const bu = sim.world.bu, rng = humanRng(sim);
  for (const nest of sim.state.nests) {
    for (const e of nest.entrances) {
      if (!inFootprint(fp, e.pos.x, e.pos.z, e.radius)) continue;
      disturb(sim, e.pos, footprintRadius(fp), 'footsteps');
      if (soil && e.status === 'open' && rngChance(rng, FOOT_ENTRANCE_BLOCK_P)) blockEntrance(sim, e.pos, e.radius, FOOT_ENTRANCE_FILL_BU * bu);
    }
  }
}

function blockEntrance(sim: Sim, pos: Vec3, radius: number, depth: number): void {
  const r = Math.max(radius * 1.3, depth / 2);
  for (let d = r * 0.5; d <= depth; d += r * 0.5) sim.kernel.fillSphere({ x: pos.x, y: pos.y - d, z: pos.z }, r);
  // ants inside the refilled plug go to the surface beside it
  const min = { x: pos.x - r * 2, y: pos.y - depth - r, z: pos.z - r * 2 }, max = { x: pos.x + r * 2, y: pos.y + r, z: pos.z + r * 2 };
  notifySurfaceChanged(sim, min, max);
}
