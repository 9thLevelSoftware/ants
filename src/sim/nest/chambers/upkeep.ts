// Periodic chamber upkeep: detection pass per nest, occupancy and capacity, microclimate (computed by the
// environment module from the depth / cover data here, GDD 03 §9), brood placement ranking (§9.4), the
// founding-to-royal rule (§6.5).

import type { BroodStage, Chamber, Nest, Sim } from '@/sim/types';
import { BROOD_CHAMBER_TYPES, BROOD_PREF, BROOD_SPACE, MICRO_UPDATE_TICKS, nestTemplate } from '@/sim/balance/nest';
import { chamberHumidity, chamberTemp } from '@/sim/environment/chamber';
import { nestComponents } from '../entrances';
import { nestRuntime, type ChunkVolume } from '../runtime';
import { CHUNK, keyCx, keyCy, keyCz, type VoxelBox } from '../carve/keys';
import { heightAt } from '@/sim/world/terrainSample';
import { sampleI, sampleJ, sampleK } from '../voxelKey';
import { detectRegions, nestSampleBox, type Region } from './detect';
import { applyFoundingCell } from './foundingCell';
import { planG } from '../plans/geometry';
import { planCache } from '../plans/targets';
import { applyDetection, chamberAtIn, designateChamberImpl, refreshChamberMarch } from './registry';

/**
 * Detection pass over one nest: regions connected to the nest's cavity, then the identity rules, then (while the
 * nest is founding) the founding cell rule.
 */
export function detectNestChambers(sim: Sim, nest: Nest): void {
  const v = sim.carve.voxel;
  const comps = nestComponents(sim, nest);
  const rt = nestRuntime(sim);
  const regions = detectRegions(sim, nestSampleBox(sim, nest), rt.coreByChunk, rt.passGrid).filter((r) => {
    const s = r.core[0];
    const c = sim.nestNav.componentAt({ x: sampleI(s) * v, y: sampleJ(s) * v, z: sampleK(s) * v });
    return c >= 0 && comps.has(c);
  });
  applyDetection(sim, nest, regions, (r) => insideLiveChamberPlan(sim, nest, r));
  applyFoundingCell(sim, nest);
  nest.volumeOpen = nestOpenVolume(sim, nest);
}

/**
 * Open carved volume of the nest's sample box below the surface, BU^3 (OPEN_FRACTION x solid share). Only the
 * carve chunks inside the box are read; per chunk the samples deep under the (static) terrain are summed once and
 * cached (dropped by the carve listener), the few near the surface are evaluated against the live field.
 */
export function nestOpenVolume(sim: Sim, nest: Nest): number {
  const b = nestSampleBox(sim, nest), carve = sim.carve, v = carve.voxel, rt = nestRuntime(sim);
  // the cached chunk volumes are clipped to the box they were computed with: a nest whose box changed (it grew)
  // starts a new cache, or an uninterrupted run would keep stale clips that a restored game recomputes
  // (int-1B-sim: volumeOpen drifted apart after a save / restore)
  const boxSig = `${b.i0},${b.j0},${b.k0},${b.i1},${b.j1},${b.k1}`;
  let cache = rt.deepVolByNest.get(nest.id);
  if (!cache || rt.deepVolBox.get(nest.id) !== boxSig) {
    cache = new Map(); rt.deepVolByNest.set(nest.id, cache); rt.deepVolBox.set(nest.id, boxSig);
  }
  const keys = carve.data.keys.filter((key) => {
    const ci = keyCx(key) * CHUNK, cj = keyCy(key) * CHUNK, ck = keyCz(key) * CHUNK;
    return ci + CHUNK > b.i0 && ci <= b.i1 && cj + CHUNK > b.j0 && cj <= b.j1 && ck + CHUNK > b.k0 && ck <= b.k1;
  }).sort((p, q) => p - q);
  let vol = 0;
  for (const key of keys) {
    let cv = cache.get(key);
    if (!cv) { cv = chunkVolume(sim, key, b); cache.set(key, cv); }
    let part = cv.deep;
    const sh = cv.shallow;
    for (let n = 0; n < sh.length; n += 4) {
      let solid = 0.5 - sim.field.substrateXYZ(sh[n] * v, sh[n + 1] * v, sh[n + 2] * v) / v;
      solid = solid < 0 ? 0 : solid > 1 ? 1 : solid;
      part += openShare(sh[n + 3]) * solid;
    }
    vol += part;
  }
  return vol * (v / sim.world.bu) ** 3;
}

const openShare = (o: number): number => Math.min(1, Math.max(0, o / 127.5 - 0.5));

/** Splits a chunk's open samples inside the box into the deep sum and the near-surface list. */
function chunkVolume(sim: Sim, key: number, b: VoxelBox): ChunkVolume {
  const v = sim.carve.voxel, terrain = sim.world.terrain, out: ChunkVolume = { deep: 0, shallow: [] };
  sim.carve.forEachOpenSample(key, (i, j, k, o) => {
    if (i < b.i0 || i > b.i1 || j < b.j0 || j > b.j1 || k < b.k0 || k > b.k1) return;
    // well below the terrain the solid share is 1 (mound piles and primitives only add solid above it)
    if (j * v < heightAt(terrain, i * v, k * v) - 2 * v) out.deep += openShare(o);
    else out.shallow.push(i, j, k, o);
  });
  return out;
}

/** Occupancy of every chamber of the nest from the positions of its colony's adults, brood and items. */
export function updateOccupancy(sim: Sim, nest: Nest): void {
  for (const c of nest.chambers) { c.occupancy.adults = 0; c.occupancy.brood = 0; c.occupancy.food = 0; c.occupancy.other = 0; }
  if (nest.chambers.length === 0) return;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== nest.colony || a.caste === 'queen') continue;
    const c = chamberAtIn(sim, nest, a.pos);
    if (c) c.occupancy.adults += a.lengthBu * a.lengthBu;
  }
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== nest.colony || b.carriedBy >= 0) continue;
    const c = chamberAtIn(sim, nest, b.pos);
    if (c) c.occupancy.brood += BROOD_SPACE[b.stage];
  }
  for (const it of sim.stores.items.list) {
    if (!it.alive || it.carrierIds.length > 0 || it.nestId !== nest.id) continue;
    const c = chamberAtIn(sim, nest, it.pos);
    if (!c) continue;
    if (it.foodKind !== null) c.occupancy.food += it.c + it.p;
    else if (it.kind === 'waste' || it.kind === 'corpse') c.occupancy.other += it.count;
  }
}

/**
 * Chamber temperature and humidity from the environment's cavity model (debug overrides win). First one chamber
 * per update (round robin by id) re-marches its depth, roof and cover, which detection keeps while the room's
 * voxels do not change (registry.ts keptRegionStats).
 */
export function updateMicroclimate(sim: Sim, nest: Nest): void {
  if (nest.chambers.length > 0) {
    const byId = [...nest.chambers].sort((a, b) => a.id - b.id);
    refreshChamberMarch(sim, byId[Math.floor(sim.state.tick / MICRO_UPDATE_TICKS) % byId.length]);
  }
  const over = nestRuntime(sim).climate;
  for (const c of nest.chambers) {
    const o = over.get(c.id);
    if (o) { c.temp = o.temp; c.humidity = o.rh; continue; }
    const t = chamberTemp(sim, nest, c), rh = chamberHumidity(sim, nest, c);
    if (Number.isFinite(t)) c.temp = t;
    if (Number.isFinite(rh)) c.humidity = rh;
  }
}

function curve(points: readonly [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let n = 1; n < points.length; n++) {
    const [x1, y1] = points[n];
    if (x <= x1) {
      const [x0, y0] = points[n - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** Brood placement score of a chamber for a stage (GDD 03 §9.4): g_T x g_H x accepts brood x capacity left. */
export function broodScore(c: Chamber, stage: BroodStage): number {
  if (!BROOD_CHAMBER_TYPES.includes(c.type) || c.capacity.brood - c.occupancy.brood <= 0) return 0;
  const pref = BROOD_PREF[stage];
  return curve(pref.temp, c.temp) * curve(pref.rh, c.humidity);
}

export function bestBroodChamberImpl(sim: Sim, nestId: number, stage: BroodStage): number {
  const nest = sim.stores.nests.get(nestId);
  if (!nest) return -1;
  let best = -1, bestS = 0;
  for (const c of [...nest.chambers].sort((a, b) => a.id - b.id)) {
    const s = broodScore(c, stage);
    if (s > bestS) { bestS = s; best = c.id; }
  }
  return best;
}

/** The founding cell becomes royal at `royalAt` adult workers unless the player designated it (GDD 03 §6.5). */
export function checkRoyal(sim: Sim, nest: Nest): void {
  const col = sim.stores.colonies.get(nest.colony);
  if (!col) return;
  const cell = nest.chambers.find((c) => c.type === 'founding' && c.designatedBy !== 'player');
  if (!cell || nest.chambers.some((c) => c.type === 'royal')) return;
  let workers = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste !== 'queen' && a.caste !== 'gyne' && a.caste !== 'male') workers++;
  if (workers >= nestTemplate(col.species).royalAt) designateChamberImpl(sim, cell.id, 'royal', 'auto');
}

/** Is most of the region inside the room of a chamber plan that is still being dug? */
function insideLiveChamberPlan(sim: Sim, nest: Nest, r: Region): boolean {
  const v = sim.carve.voxel;
  for (const plan of nest.digPlans) {
    if (plan.kind !== 'chamber' || plan.status === 'complete' || plan.status === 'cancelled') continue;
    const g = planCache(sim, nest, plan)?.geometry;
    if (!g) continue;
    let inside = 0;
    for (const key of r.keys) if (planG(g, sampleI(key) * v, sampleJ(key) * v, sampleK(key) * v) > -v) inside++;
    if (inside * 2 >= r.keys.length) return true;
  }
  return false;
}
