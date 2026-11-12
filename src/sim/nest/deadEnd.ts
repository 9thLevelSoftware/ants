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
// throat are skipped. Cached per carve version and chamber set (derived, never persisted).

import type { Vec3 } from '@/core/math/vec3';
import type { Nest, Sim } from '@/sim/types';
import {
  INTERNAL_DUMP_BRANCH_BU, INTERNAL_DUMP_ENTRANCE_BU, INTERNAL_DUMP_MIN_CHAMBER_BU, INTERNAL_DUMP_PLAN_CLEAR_BU,
  INTERNAL_DUMP_SEARCH_MAX,
} from '@/sim/balance/nest';
import { OPEN_MIN } from './carve/keys';
import { chamberSamples } from './chambers/registry';
import { planG } from './plans/geometry';
import { planCache } from './plans/targets';
import { planIsLive } from './navFields';
import { packSample, sampleI, sampleJ, sampleK } from './voxelKey';

export interface DumpSite {
  /** Floor point to put the item down on, mm. */
  pos: Vec3;
  /** 'tip': a dead-end tunnel tip; 'midden': the centre of a midden chamber. */
  kind: 'tip' | 'midden';
  /** Depth below the terrain surface, BU. */
  depthBu: number;
  /** Path distance from the nearest (non-midden) chamber, BU (0 for a midden chamber). */
  fromChamberBu: number;
}

const DIRS = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

const CACHE = new WeakMap<Sim, Map<number, { stamp: string; site: DumpSite | null }>>();

function stampOf(sim: Sim, nest: Nest): string {
  return `${sim.carve.version}|${nest.chambers.map((c) => `${c.id}:${c.type}:${c.voxelCount}`).join(',')}|${nest.entrances.length}|${nest.digPlans.filter((p) => planIsLive(p.status)).map((p) => p.id).join(',')}`;
}

/**
 * The internal dump site of a nest (GDD 03 §7.7): a `midden` chamber's centre if the nest has one, else the
 * deepest dead-end tunnel tip at least INTERNAL_DUMP_MIN_CHAMBER_BU from every chamber; null when there is none.
 */
export function internalDumpSite(sim: Sim, nestId: number): DumpSite | null {
  const nest = sim.stores.nests.get(nestId);
  if (!nest || !nest.alive) return null;
  const midden = nest.chambers.find((c) => c.type === 'midden');
  if (midden) {
    return { pos: { ...midden.center }, kind: 'midden', depthBu: midden.depthBu, fromChamberBu: 0 };
  }
  let byNest = CACHE.get(sim);
  if (!byNest) { byNest = new Map(); CACHE.set(sim, byNest); }
  const stamp = stampOf(sim, nest);
  const hit = byNest.get(nestId);
  if (hit && hit.stamp === stamp) return hit.site ? { ...hit.site, pos: { ...hit.site.pos } } : null;
  const site = findDeepestTip(sim, nest);
  byNest.set(nestId, { stamp, site });
  return site ? { ...site, pos: { ...site.pos } } : null;
}

/** Path distances (in samples) from every chamber sample over the nest's open samples (6-connected). */
function chamberDistances(sim: Sim, nest: Nest): Map<number, number> {
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
    const depthBu = (sim.field.height(x, z) - y) / bu;
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
