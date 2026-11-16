// "Exposed" to the sky (GDD 06 §3.3): above ground, outdoors, and no overhead cover within 3 BU (a leaf, stone,
// slab, a roof or table from the shelter map, or a grass canopy taller than 8 BU). Rain hits, washing and wetting
// use it. The cover part is cached per 2 x 0.5 x 2 BU cell in a derived per-Sim cache. The cache is dropped when
// the dynamic world changes (dynamic primitives, terrain deformation, object states, a carve-grid rebuild) and
// every game hour; an ordinary carve or fill only drops the columns its change box touches, and a mound change
// only the columns under that mound, so a digging colony keeps the rest of the cache warm.

import type { Vec3 } from '@/core/math/vec3';
import type { CarveChange, CarveGrid, Mound, Sim } from '@/sim/types';
import { UNDERGROUND_MM } from '@/sim/balance';
import { WX_COVER_BU, WX_EXPOSURE_CELL_BU, WX_EXPOSURE_LAYER_BU, WX_GRASS_COVER_BU, WX_SHELTER_COVERED } from '@/sim/balance/weather';
import { TICKS_PER_HOUR } from '@/sim/time';
import { byteAt } from '@/sim/world/terrainSample';
import { isInteriorAt } from './ground';

const COL_BIAS = 32768;

interface ExposureCache {
  /** Column key -> (layer index -> exposed). */
  cols: Map<number, Map<number, boolean>>;
  /** Lengths of the dynamic-world lists (dynamic primitives, height deltas, object states) when last checked. */
  dyn: number;
  hd: number;
  os: number;
  hour: number;
  /** Per mound id: its shape key when last checked (a change drops the mound's footprint columns). */
  mounds: Map<number, number>;
  carve: CarveGrid;
  /** carve.version after the last change this cache accounted for; any other bump (rebuild) drops everything. */
  carveVersion: number;
  listener: (ch: CarveChange) => void;
}

const CACHES = new WeakMap<Sim, ExposureCache>();
const UP: Vec3 = { x: 0, y: 1, z: 0 };
const probe: Vec3 = { x: 0, y: 0, z: 0 };

const colKey = (i: number, k: number): number => (i + COL_BIAS) + (k + COL_BIAS) * 65536;

/** Drops the cached columns whose cover trace can read samples inside the change box (plus a voxel of margin). */
function dropColumns(sim: Sim, c: ExposureCache, ch: CarveChange): void {
  c.carveVersion = c.carve.version;
  if (c.cols.size === 0) return;
  const q = WX_EXPOSURE_CELL_BU * sim.world.bu, v = c.carve.voxel, b = ch.box;
  const i0 = Math.floor(((b.i0 - 2) * v) / q), i1 = Math.floor(((b.i1 + 2) * v) / q);
  const k0 = Math.floor(((b.k0 - 2) * v) / q), k1 = Math.floor(((b.k1 + 2) * v) / q);
  for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) c.cols.delete(colKey(i, k));
}

function freshCache(sim: Sim): ExposureCache {
  const c: ExposureCache = {
    cols: new Map(), dyn: -1, hd: -1, os: -1, hour: -1, mounds: new Map(), carve: sim.carve, carveVersion: -1,
    listener: (ch) => dropColumns(sim, c, ch),
  };
  sim.carve.addListener(c.listener);
  return c;
}

/** Shape key of a mound: changes with every pellet batch and every relaxation step. */
function moundKey(m: Mound): number {
  return m.lastBatchTick * 4096 + (m.relaxSweep ?? -1) * 64 + (m.relaxRow ?? 0) + m.volume;
}

/** Drops the columns under mounds whose pile changed (their ground height, hence the canonical points, moved). */
function checkMounds(sim: Sim, c: ExposureCache): void {
  const q = WX_EXPOSURE_CELL_BU * sim.world.bu;
  for (const m of sim.state.worldDelta.mounds) {
    const key = moundKey(m);
    if (c.mounds.get(m.id) === key) continue;
    c.mounds.set(m.id, key);
    const half = 0.5 * m.n * m.cell;
    const i0 = Math.floor((m.centerX - half) / q), i1 = Math.floor((m.centerX + half) / q);
    const k0 = Math.floor((m.centerZ - half) / q), k1 = Math.floor((m.centerZ + half) / q);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) c.cols.delete(colKey(i, k));
  }
}

function cacheOf(sim: Sim): ExposureCache {
  const hour = Math.floor(sim.state.tick / TICKS_PER_HOUR);
  const d = sim.state.worldDelta;
  let c = CACHES.get(sim);
  if (c && c.carve !== sim.carve) {
    c.carve.removeListener(c.listener);
    c = undefined;
  }
  if (!c) {
    c = freshCache(sim);
    CACHES.set(sim, c);
  }
  if (c.hour !== hour || c.carveVersion !== sim.carve.version
    || c.dyn !== d.dynPrims.length || c.hd !== d.heightDeltas.length || c.os !== d.objectStates.length) {
    c.cols.clear();
    c.mounds.clear();
    c.hour = hour;
    c.carveVersion = sim.carve.version;
    c.dyn = d.dynPrims.length; c.hd = d.heightDeltas.length; c.os = d.objectStates.length;
  }
  if (d.mounds.length > 0) checkMounds(sim, c);
  return c;
}

/** Above ground and outdoors (the uncached part of the test). */
function openAir(sim: Sim, x: number, y: number, z: number): boolean {
  if (isInteriorAt(sim.world, x, z)) return false;
  return y >= sim.field.height(x, z) - UNDERGROUND_MM;
}

/** No overhead cover above (x, y, z): shelter map, grass canopy, a solid within WX_COVER_BU straight up. */
function uncovered(sim: Sim, x: number, y: number, z: number): boolean {
  const w = sim.world, bu = w.bu;
  if (byteAt(w.maps.shelter, x, z) >= WX_SHELTER_COVERED) return false;
  const ground = sim.field.height(x, z);
  const nav = w.nav.cls;
  const ix = Math.min(nav.nx - 1, Math.max(0, Math.floor(x / nav.cell)));
  const iz = Math.min(nav.nz - 1, Math.max(0, Math.floor(z / nav.cell)));
  const sward = sim.state.worldDelta.grassHeightMm[iz * nav.nx + ix] ?? 0;
  if (sward > WX_GRASS_COVER_BU * bu && y - ground < sward) return false;
  probe.x = x; probe.y = Math.max(y, ground) + 0.25 * bu; probe.z = z;
  const reach = WX_COVER_BU * bu;
  return sim.field.sphereTrace(probe, UP, reach, 0.1 * bu) >= reach - 1e-6;
}

/** Uncached exposure test at a point (mm). */
export function exposedNow(sim: Sim, x: number, y: number, z: number): boolean {
  return openAir(sim, x, y, z) && uncovered(sim, x, y, z);
}

/** Exposure with the cover part cached per 2 x 0.5 x 2 BU cell. */
export function isExposedAt(sim: Sim, x: number, y: number, z: number): boolean {
  if (!openAir(sim, x, y, z)) return false;
  const q = WX_EXPOSURE_CELL_BU * sim.world.bu, qy = WX_EXPOSURE_LAYER_BU * sim.world.bu;
  const i = Math.floor(x / q), j = Math.floor(y / qy), k = Math.floor(z / q);
  const c = cacheOf(sim);
  const ck = colKey(i, k);
  let col = c.cols.get(ck);
  if (!col) {
    col = new Map();
    c.cols.set(ck, col);
  }
  let v = col.get(j);
  if (v === undefined) {
    // a canonical point per cell (column centre, layer bottom), so the answer never depends on which query came
    // first (save/load safe); thin layers keep "on top of a stone" and "under it" apart
    const cx = (i + 0.5) * q, cz = (k + 0.5) * q;
    v = uncovered(sim, cx, Math.max(j * qy, sim.field.height(cx, cz)), cz);
    col.set(j, v);
  }
  return v;
}

/**
 * Exposure of a volume cell (a pheromone cell) given its centre and half height, mm. A cell whose vertical extent
 * contains the ground surface holds the open air just above the ground, so it is tested there: a trail laid on
 * open ground sits in such a cell, whose centre can lie up to half a cell below the surface.
 */
export function isCellExposedAt(sim: Sim, x: number, y: number, z: number, halfHeight: number): boolean {
  const ground = sim.field.height(x, z);
  const yTest = ground > y && ground <= y + halfHeight ? ground : y;
  return isExposedAt(sim, x, yTest, z);
}

/** Same as isExposedAt, for a Vec3. */
export function isExposed(sim: Sim, p: Vec3): boolean {
  return isExposedAt(sim, p.x, p.y, p.z);
}

/** Cached columns (tests, perf read-outs). */
export function exposureCacheColumns(sim: Sim): number {
  return CACHES.get(sim)?.cols.size ?? 0;
}

/** Drops the whole cache (tests: compare a warm cache with a cold one). */
export function resetExposureCache(sim: Sim): void {
  const c = CACHES.get(sim);
  if (!c) return;
  c.carve.removeListener(c.listener);
  CACHES.delete(sim);
}
