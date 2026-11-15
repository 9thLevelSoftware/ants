// The leak of the founding cavity (task founding-close §1): a flood from the founding cell through free carve samples
// until it reaches the outside air. The shortest such path IS the leak; sealing aims where it crosses the throat.
// "Free" is the nest module's own passage test (src/sim/nest/entrances.ts throatPassage): a carved sample open at or
// above the iso level, or a point outside the substrate (air). Six-connected, like the kernel nav. Pure reads.

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, Nest, Sim } from '@/sim/types';
import { THROAT_BU } from '@/sim/balance/nest';
import { SEAL_FLOOD_MAX_SAMPLES, SEAL_FLOOD_RADIUS_BU } from '@/sim/balance/founding';

/** Carve-grid openness from which a sample counts as open (nest carve keys OPEN_MIN; seed §4: iso 127.5). */
export const CARVE_OPEN_MIN = 128;

/** A sphere that a predicted plug would fill (treated as solid by the flood). */
export interface Sphere { c: Vec3; r: number }

export interface CavityFlood {
  /** Sample indices (i, j, k triples) of the shortest path from the cell to the air, cell end first; null: sealed. */
  path: number[] | null;
  /** Every carved open sample of the cavity reached (key -> parent key), the air samples excluded. */
  cavity: Map<number, number>;
}

// sample keys: a world of 5000 BU at 0.5 BU samples spans 10 000 samples per axis (< SPAN), exact in a double
const SPAN = 16384, OFF = 8192;
const key = (i: number, j: number, k: number): number => ((i + OFF) * SPAN + (j + OFF)) * SPAN + (k + OFF);
export const keyI = (n: number): number => Math.floor(n / (SPAN * SPAN)) - OFF;
export const keyJ = (n: number): number => (Math.floor(n / SPAN) % SPAN) - OFF;
export const keyK = (n: number): number => (n % SPAN) - OFF;
export { key as sampleKey };

/** The sample position of key n, into out (mm). */
export function keyPos(sim: Sim, n: number, out: Vec3): Vec3 {
  const v = sim.carve.voxel;
  out.x = keyI(n) * v; out.y = keyJ(n) * v; out.z = keyK(n) * v;
  return out;
}

export function isOpenSample(sim: Sim, i: number, j: number, k: number): boolean {
  return sim.carve.sampleAt(i, j, k) >= CARVE_OPEN_MIN;
}

/** Outside the substrate: open air (a sink of the flood). */
export function isAirSample(sim: Sim, i: number, j: number, k: number): boolean {
  const v = sim.carve.voxel;
  return sim.field.substrateXYZ(i * v, j * v, k * v) > 0;
}

function inSpheres(x: number, y: number, z: number, fill: readonly Sphere[]): boolean {
  for (const s of fill) if ((x - s.c.x) ** 2 + (y - s.c.y) ** 2 + (z - s.c.z) ** 2 <= s.r * s.r) return true;
  return false;
}

/** The open sample nearest p within 2 samples (the flood's seed), or -1. */
function seedNear(sim: Sim, p: Vec3): number {
  const v = sim.carve.voxel, ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v);
  let best = -1, bestD = Infinity;
  for (let dk = -2; dk <= 2; dk++) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const d = di * di + dj * dj + dk * dk;
    if (d < bestD && isOpenSample(sim, ci + di, cj + dj, ck + dk) && !isAirSample(sim, ci + di, cj + dj, ck + dk)) {
      best = key(ci + di, cj + dj, ck + dk); bestD = d;
    }
  }
  return best;
}

const DIRS = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

/**
 * Floods the whole cavity from `from` (the founding cell) through open samples; air samples are sinks (the first
 * one reached gives `path`, the shortest way out). `fill`:
 * spheres treated as solid (a predicted plug). Bounded by SEAL_FLOOD_RADIUS_BU around `from` and
 * SEAL_FLOOD_MAX_SAMPLES samples.
 */
export function floodCavity(sim: Sim, from: Vec3, fill: readonly Sphere[] = []): CavityFlood {
  const v = sim.carve.voxel, maxR = SEAL_FLOOD_RADIUS_BU * sim.world.bu;
  const cavity = new Map<number, number>();
  const seed = seedNear(sim, from);
  if (seed < 0) return { path: null, cavity };
  cavity.set(seed, -1);
  const queue = [seed];
  let path: number[] | null = null;
  for (let q = 0; q < queue.length && cavity.size < SEAL_FLOOD_MAX_SAMPLES; q++) {
    const n = queue[q], i = keyI(n), j = keyJ(n), k = keyK(n);
    for (let d = 0; d < 18; d += 3) {
      const ni = i + DIRS[d], nj = j + DIRS[d + 1], nk = k + DIRS[d + 2];
      const nk2 = key(ni, nj, nk);
      if (cavity.has(nk2)) continue;
      const x = ni * v, y = nj * v, z = nk * v;
      if ((x - from.x) ** 2 + (y - from.y) ** 2 + (z - from.z) ** 2 > maxR * maxR) continue;
      if (fill.length > 0 && inSpheres(x, y, z, fill)) continue;
      if (isAirSample(sim, ni, nj, nk)) { if (!path) path = pathTo(cavity, n, nk2); continue; }
      if (!isOpenSample(sim, ni, nj, nk)) continue;
      cavity.set(nk2, n);
      queue.push(nk2);
    }
  }
  return { path, cavity };
}

function pathTo(parents: Map<number, number>, last: number, air: number): number[] {
  const out = [air];
  for (let n = last; n >= 0; n = parents.get(n) ?? -1) out.push(n);
  return out.reverse();
}

/** Where the flood starts: the founding cell's centre, else the cavity seed, else the nest origin. */
export function floodStart(nest: Nest): Vec3 {
  const cell = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  return cell ? cell.center : nest.founding?.cavitySeed ?? nest.origin;
}

/**
 * The leak as the nest module judges sealing (src/sim/nest/entrances.ts throatPassage, GDD 03 §4.2): a path of
 * free samples (open, or air) inside the throat sphere (radius + THROAT_BU around the opening) from the mouth (free
 * samples at the ground level inside the opening) to the sphere's inner shell in the soil. Sample keys from the
 * mouth end; null when there is none (the entrance reads `sealed`). `fill`: spheres treated as solid.
 */
export function throatLeak(sim: Sim, e: Entrance, fill: readonly Sphere[] = []): number[] | null {
  const v = sim.carve.voxel, R = e.radius + THROAT_BU * sim.world.bu, inner = R - 2 * v;
  const free = (i: number, j: number, k: number): boolean => {
    const x = i * v, y = j * v, z = k * v;
    if (fill.length > 0 && inSpheres(x, y, z, fill)) return false;
    return isOpenSample(sim, i, j, k) || isAirSample(sim, i, j, k);
  };
  const inSphere = (i: number, j: number, k: number) => (i * v - e.pos.x) ** 2 + (j * v - e.pos.y) ** 2 + (k * v - e.pos.z) ** 2 <= R * R;
  const parents = new Map<number, number>();
  const queue: number[] = [];
  const i0 = Math.floor((e.pos.x - R) / v), i1 = Math.ceil((e.pos.x + R) / v);
  const j0 = Math.floor((e.pos.y - R) / v), j1 = Math.ceil((e.pos.y + R) / v);
  const k0 = Math.floor((e.pos.z - R) / v), k1 = Math.ceil((e.pos.z + R) / v);
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (!inSphere(i, j, k)) continue;
    if (sim.field.substrateXYZ(i * v, j * v, k * v) < -0.5 * v) continue;
    if (Math.hypot(i * v - e.pos.x, k * v - e.pos.z) > e.radius + v) continue;
    if (!free(i, j, k)) continue;
    const n = key(i, j, k);
    parents.set(n, -1);
    queue.push(n);
  }
  for (let q = 0; q < queue.length; q++) {
    const n = queue[q], i = keyI(n), j = keyJ(n), k = keyK(n);
    const d2 = (i * v - e.pos.x) ** 2 + (j * v - e.pos.y) ** 2 + (k * v - e.pos.z) ** 2;
    if (d2 >= inner * inner && sim.field.substrateXYZ(i * v, j * v, k * v) < 0) {
      const out: number[] = [];
      for (let m = n; m >= 0; m = parents.get(m) ?? -1) out.push(m);
      return out.reverse();
    }
    for (let d = 0; d < 18; d += 3) {
      const ni = i + DIRS[d], nj = j + DIRS[d + 1], nk = k + DIRS[d + 2];
      const m = key(ni, nj, nk);
      if (parents.has(m) || !inSphere(ni, nj, nk) || !free(ni, nj, nk)) continue;
      parents.set(m, n);
      queue.push(m);
    }
  }
  return null;
}
