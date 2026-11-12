// Periodic chamber upkeep: detection pass per nest, occupancy and capacity, microclimate (computed by the
// environment module from the depth / cover data here, GDD 03 §9), brood placement ranking (§9.4), the
// founding-to-royal rule (§6.5).

import type { BroodStage, Chamber, Nest, Sim } from '@/sim/types';
import { BROOD_CHAMBER_TYPES, BROOD_PREF, BROOD_SPACE, nestTemplate } from '@/sim/balance/nest';
import { chamberHumidity, chamberTemp } from '@/sim/environment/chamber';
import { nestComponents } from '../entrances';
import { nestRuntime } from '../runtime';
import { sampleI, sampleJ, sampleK } from '../voxelKey';
import { detectRegions, nestSampleBox } from './detect';
import { applyDetection, chamberAtIn, designateChamberImpl } from './registry';

/** Detection pass over one nest: regions connected to the nest's cavity, then the identity rules. */
export function detectNestChambers(sim: Sim, nest: Nest): void {
  const v = sim.carve.voxel;
  const comps = nestComponents(sim, nest);
  const regions = detectRegions(sim, nestSampleBox(sim, nest)).filter((r) => {
    const s = r.core[0];
    const c = sim.nestNav.componentAt({ x: sampleI(s) * v, y: sampleJ(s) * v, z: sampleK(s) * v });
    return c >= 0 && comps.has(c);
  });
  applyDetection(sim, nest, regions);
  nest.volumeOpen = nestOpenVolume(sim, nest);
}

/** Open carved volume of the nest's sample box below the surface, BU^3 (OPEN_FRACTION x solid share). */
export function nestOpenVolume(sim: Sim, nest: Nest): number {
  const b = nestSampleBox(sim, nest), carve = sim.carve, v = carve.voxel;
  let vol = 0;
  for (const key of carve.data.keys) {
    carve.forEachOpenSample(key, (i, j, k, o) => {
      if (i < b.i0 || i > b.i1 || j < b.j0 || j > b.j1 || k < b.k0 || k > b.k1) return;
      let solid = 0.5 - sim.field.substrateXYZ(i * v, j * v, k * v) / v;
      solid = solid < 0 ? 0 : solid > 1 ? 1 : solid;
      vol += Math.min(1, Math.max(0, o / 127.5 - 0.5)) * solid;
    });
  }
  return vol * (v / sim.world.bu) ** 3;
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

/** Chamber temperature and humidity from the environment's cavity model (debug overrides win). */
export function updateMicroclimate(sim: Sim, nest: Nest): void {
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
