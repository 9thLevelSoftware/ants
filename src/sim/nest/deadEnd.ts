// The internal dump of GDD 03 §7.7 (hauler state `internal-dump`, also GDD 02 §10.8 "midden unreachable -> drop in
// a dead-end tunnel"): where a hauler holding soil or waste puts it down when its nest has no open entrance. The
// deepest dead-end tunnel tip at least INTERNAL_DUMP_MIN_CHAMBER_BU (path) from every chamber, or a `midden`
// chamber when the nest has one.
//
// Tips: a breadth-first search over the nest's open samples (6-connected) from every chamber sample gives each
// sample its path distance from the nearest chamber. A tip is a sample no neighbour of which is farther, on a
// floor, whose branch is one-sided: the samples INTERNAL_DUMP_BRANCH_BU closer to the chambers around it lie on
// one side of it (their centroid is well behind it). That rejects the ridge where two paths of a loop meet and
// shallow dimples in a through tunnel. Tips inside a live plan's volume (a digging front) or near an entrance
// throat are skipped. The search stays inside the nest's sample box, and depth is measured below the base terrain
// (mounds do not reorder tips), so the answer depends only on the nest's own carve state, chambers, entrances,
// live plans and mound volumes: it is cached on exactly those (the nest's carve stamp in runtime.ts, bumped only by
// carves touching its box; derived, never persisted). A bite in the same nest still means a recompute (about
// 5-10 ms for a 400-worker nest on the reference machine): haulers should ask once per trip, not per tick.

import type { Vec3 } from '@/core/math/vec3';
import type { Nest, Sim } from '@/sim/types';
import {
  INTERNAL_DUMP_BRANCH_BU, INTERNAL_DUMP_ENTRANCE_BU, INTERNAL_DUMP_MIN_CHAMBER_BU, INTERNAL_DUMP_PLAN_CLEAR_BU,
  INTERNAL_DUMP_SEARCH_MAX,
} from '@/sim/balance/nest';
import { heightAt } from '@/sim/world/terrainSample';
import { OPEN_MIN } from './carve/keys';
import { nestSampleBox } from './chambers/detect';
import { chamberSamples } from './chambers/registry';
import { planG } from './plans/geometry';
import { planCache } from './plans/targets';
import { planIsLive } from './navFields';
import { nestRuntime } from './runtime';
import { packSample, sampleI, sampleJ, sampleK } from './voxelKey';

export interface DumpSite {
  /** Floor point to put the item down on, mm (an open sample with a non-open sample below). */
  pos: Vec3;
  /** 'tip': a dead-end tunnel tip; 'midden': the floor under a midden chamber's centre. */
  kind: 'tip' | 'midden';
  /** Depth below the base terrain surface (without mounds), BU. */
  depthBu: number;
  /** Path distance from the nearest (non-midden) chamber, BU (0 for a midden chamber). */
  fromChamberBu: number;
}

const DIRS = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

const CACHE = new WeakMap<Sim, Map<number, { stamp: string; site: DumpSite | null }>>();
const SEARCHES = new WeakMap<Sim, number>();

/** Tip searches run so far for this Sim (diagnostics and tests: how often the cache missed). */
export function dumpSiteSearches(sim: Sim): number {
  return SEARCHES.get(sim) ?? 0;
}

function stampOf(sim: Sim, nest: Nest): string {
  const o = nest.origin;
  const chambers = nest.chambers.map((c) => `${c.id}:${c.type}:${c.voxelCount}:${c.center.x},${c.center.y},${c.center.z}:${c.radii.x},${c.radii.y},${c.radii.z}`);
  const entrances = nest.entrances.map((e) => `${e.pos.x},${e.pos.y},${e.pos.z}`);
  const plans = nest.digPlans.filter((p) => planIsLive(p.status)).map((p) => p.id);
  const mounds = nest.moundIds.map((id) => sim.state.worldDelta.mounds.find((m) => m.id === id)?.volume ?? -1);
  return `${nestRuntime(sim).carveStamp.get(nest.id) ?? 0}|${o.x},${o.y},${o.z}|${chambers.join(';')}|${entrances.join(';')}|${plans.join(',')}|${mounds.join(',')}`;
}

/** The floor under p: the lowest open sample of p's column reached from p through open samples (p itself if not open). */
function floorUnder(sim: Sim, p: Vec3): Vec3 {
  const v = sim.carve.voxel, i = Math.round(p.x / v), k = Math.round(p.z / v);
  let j = Math.round(p.y / v);
  if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) return { ...p };
  while (sim.carve.sampleAt(i, j - 1, k) >= OPEN_MIN) j--;
  return { x: i * v, y: j * v, z: k * v };
}

/**
 * The internal dump site of a nest (GDD 03 §7.7): the floor under a `midden` chamber's centre if the nest has one,
 * else the deepest dead-end tunnel tip at least INTERNAL_DUMP_MIN_CHAMBER_BU from every chamber; null when there is
 * none.
 */
export function internalDumpSite(sim: Sim, nestId: number): DumpSite | null {
  const nest = sim.stores.nests.get(nestId);
  if (!nest || !nest.alive) return null;
  const midden = nest.chambers.find((c) => c.type === 'midden');
  if (midden) {
    const pos = floorUnder(sim, midden.center);
    return { pos, kind: 'midden', depthBu: (heightAt(sim.world.terrain, pos.x, pos.z) - pos.y) / sim.world.bu, fromChamberBu: 0 };
  }
  let byNest = CACHE.get(sim);
  if (!byNest) { byNest = new Map(); CACHE.set(sim, byNest); }
  const stamp = stampOf(sim, nest);
  const hit = byNest.get(nestId);
  if (hit && hit.stamp === stamp) return hit.site ? { ...hit.site, pos: { ...hit.site.pos } } : null;
  const site = findDeepestTip(sim, nest);
  SEARCHES.set(sim, dumpSiteSearches(sim) + 1);
  byNest.set(nestId, { stamp, site });
  return site ? { ...site, pos: { ...site.pos } } : null;
}

/** Path distances (in samples) from every chamber sample over the nest's open samples in its box (6-connected). */
function chamberDistances(sim: Sim, nest: Nest): Map<number, number> {
  const b = nestSampleBox(sim, nest);
  const dist = new Map<number, number>();
  const queue: number[] = [];
  for (const c of nest.chambers) {
    for (const key of chamberSamples(sim, c)) {
      if (dist.has(key)) continue;
      dist.set(key, 0);
      queue.push(key);
    }
  }
  const carve = sim.carve;
  for (let q = 0; q < queue.length && dist.size < INTERNAL_DUMP_SEARCH_MAX; q++) {
    const key = queue[q], d = dist.get(key)!;
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
    for (let n = 0; n < 18; n += 3) {
      const ni = i + DIRS[n], nj = j + DIRS[n + 1], nk = k + DIRS[n + 2];
      if (ni < b.i0 || ni > b.i1 || nj < b.j0 || nj > b.j1 || nk < b.k0 || nk > b.k1) continue;
      const nkey = packSample(ni, nj, nk);
      if (dist.has(nkey) || carve.sampleAt(ni, nj, nk) < OPEN_MIN) continue;
      dist.set(nkey, d + 1);
      queue.push(nkey);
    }
  }
  return dist;
}

function findDeepestTip(sim: Sim, nest: Nest): DumpSite | null {
  if (nest.chambers.length === 0) return null;
  const v = sim.carve.voxel, bu = sim.world.bu, carve = sim.carve;
  const dist = chamberDistances(sim, nest);
  const minSteps = Math.ceil((INTERNAL_DUMP_MIN_CHAMBER_BU * bu) / v);
  const branch = Math.max(2, Math.round((INTERNAL_DUMP_BRANCH_BU * bu) / v));
  const entranceR = INTERNAL_DUMP_ENTRANCE_BU * bu, planClear = INTERNAL_DUMP_PLAN_CLEAR_BU * bu;
  const plans = nest.digPlans.filter((p) => planIsLive(p.status)).map((p) => planCache(sim, nest, p)?.geometry).filter((g) => !!g);
  // the farthest sample within `branch` steps of each candidate: group the candidates' rings by scanning outward
  let best: DumpSite | null = null, bestKey = Infinity;
  for (const [key, d] of dist) {
    if (d < minSteps) continue;
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
    let farther = false;
    for (let n = 0; n < 18 && !farther; n += 3) {
      const nd = dist.get(packSample(i + DIRS[n], j + DIRS[n + 1], k + DIRS[n + 2]));
      if (nd !== undefined && nd > d) farther = true;
    }
    if (farther) continue;
    // the floor under the tip, inside the substrate
    let fj = j;
    while (carve.sampleAt(i, fj - 1, k) >= OPEN_MIN && dist.has(packSample(i, fj - 1, k))) fj--;
    const x = i * v, y = fj * v, z = k * v;
    if (sim.field.substrateXYZ(x, y, z) > 0) continue; // open air above the ground
    if (nest.entrances.some((e) => Math.hypot(e.pos.x - x, e.pos.y - y, e.pos.z - z) < entranceR)) continue;
    if (plans.some((g) => planG(g!, x, y, z) > -planClear)) continue;
    if (!oneSided(dist, key, d, branch, v)) continue;
    const depthBu = (heightAt(sim.world.terrain, x, z) - y) / bu;
    const fromChamberBu = (d * v) / bu;
    const fk = packSample(i, fj, k);
    if (!best || depthBu > best.depthBu + 1e-9 || (Math.abs(depthBu - best.depthBu) <= 1e-9
      && (fromChamberBu > best.fromChamberBu + 1e-9 || (Math.abs(fromChamberBu - best.fromChamberBu) <= 1e-9 && fk < bestKey)))) {
      best = { pos: { x, y, z }, kind: 'tip', depthBu, fromChamberBu };
      bestKey = fk;
    }
  }
  return best;
}

/**
 * Is the branch ending at `key` one-sided? The samples exactly `branch` steps closer to the chambers and within
 * `branch` steps of it (a ring behind the tip) must have their centroid at least half the branch length away.
 */
function oneSided(dist: Map<number, number>, key: number, d: number, branch: number, v: number): boolean {
  const i0 = sampleI(key), j0 = sampleJ(key), k0 = sampleK(key);
  const seen = new Set<number>([key]);
  let frontier = [key];
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let step = 1; step <= branch && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const f of frontier) {
      const i = sampleI(f), j = sampleJ(f), k = sampleK(f);
      for (let q = 0; q < 18; q += 3) {
        const nk = packSample(i + DIRS[q], j + DIRS[q + 1], k + DIRS[q + 2]);
        if (seen.has(nk)) continue;
        const nd = dist.get(nk);
        if (nd === undefined || nd > d) continue;
        seen.add(nk);
        next.push(nk);
        if (step === branch && nd === d - branch) {
          sx += sampleI(nk) - i0; sy += sampleJ(nk) - j0; sz += sampleK(nk) - k0; n++;
        }
      }
    }
    frontier = next;
  }
  if (n === 0) return false;
  const off = Math.hypot(sx / n, sy / n, sz / n);
  void v;
  return off >= 0.5 * branch;
}
