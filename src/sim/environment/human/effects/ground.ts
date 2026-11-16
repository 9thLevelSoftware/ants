// Ground-contact effects (GDD 04 §15.4): crushing by soles, paws, tyres and mower wheels with the CRUSH_P table,
// loose items removed or scattered, pheromone multipliers over the footprint, and removal of food sources.

import { rngChance, rngRange } from '@/core/rng';
import type { FoodSource, HumanEventRun, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { removeItem } from '@/sim/entities';
import { removeSourcesInArea, sourceDef } from '@/sim/ecology';
import { wipeRegion } from '@/sim/pheromones';
import { CRUSH_P, CRUSH_STUN_S, HUMAN_PHERO, HUMAN_PHERO_HALF_BU, type CrushContact } from '@/sim/balance/human';
import { crushColumn, surfaceClass } from '../ground';
import { footprintRadius, inFootprint, type Footprint } from '../plan';
import { lethalP } from '../rules';
import { antGround, antsIn, countRemoved, humanRng, lethalHit, shelteredBelow } from './common';

const g: Vec3 = { x: 0, y: 0, z: 0 };
const ids: number[] = [];

/** Crush test for every ant under the footprint: CRUSH_P[contact][surface] x lethality; sheltered ants are safe. */
export function crushAnts(sim: Sim, run: HumanEventRun, fp: Footprint, plane: number, contact: CrushContact, stunS = CRUSH_STUN_S,
  floorY = NaN): void {
  for (const ant of antsIn(sim, fp, plane, 3 * sim.world.bu)) {
    if (shelteredBelow(sim, ant, plane, floorY)) continue;
    const col = crushColumn(surfaceClass(sim, antGround(ant, g)));
    lethalHit(sim, run, ant, lethalP(sim, CRUSH_P[contact][col]), stunS);
  }
}

/** Crush probability at a point for a contact (debug query `crushP(kind, pos)`, GDD 04 App. B). */
export function crushPAt(sim: Sim, contact: CrushContact, p: Vec3): number {
  return lethalP(sim, CRUSH_P[contact][crushColumn(surfaceClass(sim, p))]);
}

/**
 * Loose items in the footprint no longer than maxBu: removed with probability pRemove, else scattered lo-hi mm.
 * Items in a nest, carried or below the plane (in a crevice) are untouched. Returns the number removed.
 */
export function disturbItems(sim: Sim, run: HumanEventRun, fp: Footprint, plane: number, maxBu: number, pRemove: number,
  scatterMm: readonly [number, number] | null, cause: string, along: number | null = null): number[] {
  const bu = sim.world.bu, rng = humanRng(sim);
  g.x = fp.x; g.y = plane; g.z = fp.z;
  sim.index.queryItems(g, footprintRadius(fp) + 2 * bu, ids);
  let removed = 0;
  const moved: number[] = [];
  for (const id of [...ids]) {
    const it = sim.stores.items.get(id);
    if (!it || !it.alive || it.inNest || it.carrierIds.length > 0 || !inFootprint(fp, it.pos.x, it.pos.z)) continue;
    if (it.pos.y < plane - bu * 0.5 || it.pos.y > plane + bu * 3) continue;
    if (it.lengthMm > maxBu * bu) continue;
    if (rngChance(rng, pRemove)) { if (removeItem(sim, id, cause)) removed++; continue; }
    if (!scatterMm) continue;
    const a = along ?? rngRange(rng, 0, Math.PI * 2), d = rngRange(rng, scatterMm[0], scatterMm[1]);
    it.pos = { x: it.pos.x + Math.cos(a) * d, y: it.pos.y, z: it.pos.z + Math.sin(a) * d };
    moved.push(id);
  }
  countRemoved(run, removed);
  return moved;
}

/** GDD 04 §15.4 pheromone multipliers over the footprint (alarm takes the trail value). */
export function wipeFootprint(sim: Sim, fp: Footprint, plane: number, key: keyof typeof HUMAN_PHERO, halfHeightBu = HUMAN_PHERO_HALF_BU[key]): void {
  const f = HUMAN_PHERO[key];
  const bu = sim.world.bu;
  const center = { x: fp.x, y: plane, z: fp.z };
  if (fp.disc) wipeRegion(sim, { kind: 'cylinder', center, radius: fp.hx, halfHeight: halfHeightBu * bu }, { trail: f.trail, home: f.home });
  else wipeRegion(sim, { kind: 'box', center, halfX: fp.hx, halfY: halfHeightBu * bu, halfZ: fp.hz, yaw: -fp.yaw }, { trail: f.trail, home: f.home });
}

/** Food sources in the footprint matching `filter`, removed with probability p each. Returns the number removed. */
export function removeSources(sim: Sim, run: HumanEventRun, fp: Footprint, p: number, cause: string,
  filter: (s: FoodSource) => boolean): number {
  const rng = humanRng(sim);
  const n = removeSourcesInArea(sim, { x: fp.x, y: fp.y, z: fp.z }, footprintRadius(fp) + sim.world.bu * 2, cause,
    (s) => inFootprint(fp, s.pos.x, s.pos.z) && filter(s) && rngChance(rng, p));
  countRemoved(run, n);
  return n;
}

/** Solid crumbs and seeds (pick sources) vs liquids. */
export const isPickSource = (s: FoodSource): boolean => s.variant !== null && sourceDef(s.variant).form === 'pick';
