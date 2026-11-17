// Brood out of rising water (GDD 03 §9.4 emergency: "flood predicted within 1 BU of a chamber floor and rising, actual
// flooding ... allow any chamber type, ignore the cap, and score dryness first"; §11.3 nurses evacuate; task
// nest-fix3 item 2). Read by the nursery board once per build (every 2 s) for each wet nest:
//   - brood is in water when the water over its floor point is above 0, or within BROOD_EVAC_MARGIN_BU while the
//     nest takes water (rising);
//   - its destination is the dry chamber (any type) with the highest floor, or, with none, DRY_SPOT: the nurse puts it
//     down at the nearest dry place she can reach (flood/dryPlace.ts), the throat or the mound if need be.

import type { Vec3 } from '@/core/math/vec3';
import type { Brood, Nest, Sim } from '@/sim/types';
import { BROOD_EVAC_MARGIN_BU, FLEE_DRY_MARGIN_BU } from '@/sim/balance/weather';
import { nestInflow } from '@/sim/nest/flood/inflow';
import { depthOver, dryPlace, isDryAt, waterView, type WaterView } from '@/sim/nest/flood/dryPlace';

/** Carry-job destination "the nearest dry place" (no chamber of the nest is dry). */
export const DRY_SPOT = -2;

/** A wet nest's evacuation data for one board build. */
export interface FloodEvac {
  water: WaterView;
  /** The nest takes water now (rain or seepage). */
  rising: boolean;
  /** Destination chamber id of evacuated brood, or DRY_SPOT. */
  dest: number;
  /** Chambers whose floor the water reaches (or nearly, while rising): no brood is moved into them. */
  wetChambers: Set<number>;
}

const floor: Vec3 = { x: 0, y: 0, z: 0 };

/** The evacuation data of a nest, or null when it is dry. */
export function floodEvac(sim: Sim, nest: Nest): FloodEvac | null {
  const water = waterView(sim, nest);
  if (!water) return null;
  const rising = nestInflow(sim, nest) > 0;
  const margin = (rising ? BROOD_EVAC_MARGIN_BU : 0) * sim.world.bu;
  const wetChambers = new Set<number>();
  let dest = DRY_SPOT, bestY = -Infinity;
  for (const c of nest.chambers) {
    floor.x = c.center.x; floor.y = c.center.y - c.radii.y; floor.z = c.center.z;
    if (c.flooded > 0 || !isDryAt(sim, water, floor, Math.max(margin, 1e-6))) { wetChambers.add(c.id); continue; }
    if (floor.y > bestY || (floor.y === bestY && c.id < dest)) { dest = c.id; bestY = floor.y; }
  }
  return { water, rising, dest, wetChambers };
}

/** Is this lying brood item in the water (or about to be, while it rises)? */
export function broodInWater(sim: Sim, f: FloodEvac, b: Brood): boolean {
  if (b.carriedBy >= 0) return false;
  const margin = (f.rising ? BROOD_EVAC_MARGIN_BU : 0) * sim.world.bu;
  return depthOver(sim, f.water, b.pos, b.pos.y) > -margin;
}

/** Where a nurse puts evacuated brood down when no chamber is dry: the nearest dry place from her, or null. */
export function dryDropPoint(sim: Sim, nest: Nest, from: Vec3): Vec3 | null {
  const w = waterView(sim, nest);
  if (!w) return null;
  return dryPlace(sim, w, from, FLEE_DRY_MARGIN_BU * sim.world.bu)?.pos ?? null;
}
