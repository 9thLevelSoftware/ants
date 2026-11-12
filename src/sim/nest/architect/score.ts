// Placement score terms of the nest architect (GDD 03 §8.4): S = 3 depthFit + 2 climateFit + 1.5 proximity
// - 1 digCost - 3 floodRisk (T2: 0) - 1 pathCost + w_cover cover + 0.5 compactness. Every term except digCost is
// known before validation (`partial`), so placement can validate candidates best-first and stop early (place.ts).

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, ChamberType, Nest, Sim, SpeciesId } from '@/sim/types';
import { BROOD_PREF, nestTemplate } from '@/sim/balance/nest';
import {
  COVER_REACH_BU, COVER_WEIGHT, DEPTH_FIT_FALLOFF_BU, DIGCOST_VOLUME, PROXIMITY_BU, PROXIMITY_OTHER, SCORE_W,
  TYPE_CLIMATE_PREF,
} from '@/sim/balance/architect';
import { chamberHumidity, chamberTemp } from '@/sim/environment/chamber';
import { depthAbove } from '../chambers/registry';
import { digSpeedAt } from '../substrate';

/** Piecewise-linear curve over [x, value] points; values beyond the end points hold. */
export function curve(points: readonly [number, number][], x: number): number {
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

/** 1 inside [lo, hi], falling linearly to 0 at DEPTH_FIT_FALLOFF_BU outside. */
export function depthFit(depthBu: number, band: [number, number]): number {
  const out = depthBu < band[0] ? band[0] - depthBu : depthBu > band[1] ? depthBu - band[1] : 0;
  return Math.max(0, 1 - out / DEPTH_FIT_FALLOFF_BU);
}

/** Depth band of a type for the species (general's band when the template has none for the type). */
export function bandOf(species: string, type: ChamberType): [number, number] {
  const t = nestTemplate(species);
  return t.depthBands[type] ?? t.depthBands.general ?? [0, t.maxDepth];
}

const scratch: Chamber = {
  id: -1, type: 'general', designatedBy: 'auto', center: { x: 0, y: 0, z: 0 }, radii: { x: 1, y: 1, z: 1 }, volume: 0,
  floorArea: 0, depthBu: 0, depthMm: 0, roofMin: 0, covered: false, seedVoxel: 0, voxelCount: 0,
  capacity: { adults: 0, brood: 0, food: 0, other: 0 }, occupancy: { adults: 0, brood: 0, food: 0, other: 0 },
  temp: 20, humidity: 0.7, wetUntilTick: -1, flooded: 0, floodRisk: 0, flags: 0, createdTick: 0,
};

/** Preference of a chamber type for the predicted microclimate at `c` (GDD 03 §9.1-9.3). */
export function climateFit(sim: Sim, nest: Nest, type: ChamberType, c: Vec3, depthMm: number, covered: boolean): number {
  const pref = type === 'nursery' ? BROOD_PREF.larva : TYPE_CLIMATE_PREF[type];
  if (!pref) return 1; // rest, general: depth only
  scratch.type = type;
  scratch.center = c;
  scratch.depthMm = depthMm;
  scratch.depthBu = depthMm / sim.world.bu;
  scratch.covered = covered;
  const t = chamberTemp(sim, nest, scratch), rh = chamberHumidity(sim, nest, scratch);
  return curve(pref.temp, t) * curve(pref.rh, rh);
}

/** Is there a non-diggable solid (stone, slab) within COVER_REACH_BU above y (the room's ceiling)? */
export function coveredAbove(sim: Sim, x: number, y: number, z: number): boolean {
  const step = 0.5 * sim.carve.voxel, max = COVER_REACH_BU * sim.world.bu;
  for (let d = step; d <= max; d += step) {
    if (sim.field.hardXYZ(x, y + d, z) <= 0) return true;
    if (sim.field.substrateXYZ(x, y + d, z) > 0) return false; // reached the open air first
  }
  return false;
}

export function coverWeight(species: string, type: ChamberType): number {
  const w = COVER_WEIGHT[species as SpeciesId] ?? COVER_WEIGHT['lasius-niger'];
  return w.byType[type] ?? w.base;
}

/** Everything a candidate's score needs (distances in BU, -1 = no such target). */
export interface ScoreInputs {
  type: ChamberType;
  /** Room centre (or a connector's end), mm. */
  centre: Vec3;
  /** Ceiling height of the room, mm (cover test). */
  ceilingY: number;
  /** Path from the room to its related target (GDD 03 §8.4 proximity), BU; -1 none. */
  relatedPathBu: number;
  /** Path from the room to the nearest entrance, BU. */
  entrancePathBu: number;
}

export interface PartialScore {
  /** Score without the digCost term (an upper bound of the full score). */
  partial: number;
  depthBu: number;
  covered: boolean;
}

export function partialScore(sim: Sim, nest: Nest, species: string, s: ScoreInputs): PartialScore {
  const bu = sim.world.bu, t = nestTemplate(species);
  const d = depthAbove(sim, s.centre);
  const depthBu = d.depthMm / bu;
  const covered = coveredAbove(sim, s.centre.x, s.ceilingY, s.centre.z);
  const proximity = s.relatedPathBu < 0 ? PROXIMITY_OTHER : Math.max(0, 1 - s.relatedPathBu / PROXIMITY_BU);
  const pathCost = Math.min(1, Math.max(0, s.entrancePathBu) / t.maxPathToEntrance);
  const horiz = Math.hypot(s.centre.x - nest.origin.x, s.centre.z - nest.origin.z) / bu;
  const compactness = Math.max(0, 1 - horiz / t.footprintR);
  const partial = SCORE_W.depthFit * depthFit(depthBu, bandOf(species, s.type))
    + SCORE_W.climateFit * climateFit(sim, nest, s.type, s.centre, d.depthMm, covered || d.covered)
    + SCORE_W.proximity * proximity
    + SCORE_W.pathCost * pathCost
    + coverWeight(species, s.type) * (covered ? 1 : 0)
    + SCORE_W.compactness * compactness;
  return { partial, depthBu, covered };
}

/** digCost = min(1, targetVolume / (digSpeed at the centre x DIGCOST_VOLUME)), in [0, 1]. */
export function digCost(sim: Sim, species: string, centre: Vec3, targetVolume: number): number {
  const speed = digSpeedAt(sim, species as SpeciesId, centre);
  return speed <= 0 ? 1 : Math.min(1, targetVolume / (speed * DIGCOST_VOLUME));
}
