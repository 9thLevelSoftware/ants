// Frass falls (GDD 07 §6.2.3 `eject-frass`: "frass falls under gravity and joins the frass-pile below"; §5.2.9
// moment 3: "pellets flicked from a window collect as a pale pile at the foot of the log"). A hauler drops frass at
// the opening, on the wood's outer surface; this pass lets every such item roll off the wood (outward, away from it)
// and fall to the first surface below that is not that wood: the ground at the foot of a log, a skirting board.
// There the nest module's mound batches settle it into the frass pile like any other surface pellet.

import type { Item, Primitive, Sim } from '@/sim/types';
import {
  FRASS_FALL_LIFT_BU, FRASS_FALL_MAX_BU, FRASS_LAND_CLEAR_BU, FRASS_ON_WOOD_BU, FRASS_ROLL_MAX_BU, FRASS_ROLL_STEP_BU,
} from '@/sim/balance/species-carpenter';
import { grainAxisOf, horizLen, primDistance } from './primGeom';
import { woodAt } from './woodState';

const DOWN = { x: 0, y: -1, z: 0 };
const q = { x: 0, y: 0, z: 0 };
const probe = { x: 0, y: 0, z: 0 };

/** Horizontal unit direction away from the primitive at p (its distance gradient; across the grain on a ridge). */
function outward(prim: Primitive, p: { x: number; y: number; z: number }, step: number, tie: number): { x: number; z: number } {
  const d = (dx: number, dz: number) => { probe.x = p.x + dx; probe.y = p.y; probe.z = p.z + dz; return primDistance(prim, probe); };
  let gx = d(step, 0) - d(-step, 0), gz = d(0, step) - d(0, -step);
  let len = horizLen(gx, gz);
  if (len < 1e-9) {
    const a = grainAxisOf(prim);
    gx = -a.z * tie; gz = a.x * tie;
    len = horizLen(gx, gz);
    if (len < 1e-9) { gx = tie; gz = 0; len = 1; } // a standing post seen from its top: any side
  }
  return { x: gx / len, z: gz / len };
}

/**
 * Lets one frass item lying on wood roll off and fall. Returns true when it moved. It stays where it is when no
 * landing within FRASS_ROLL_MAX_BU of it is clear of the wood (a pocket on top of a wide stump).
 */
export function dropFrassItem(sim: Sim, it: Item, prim: Primitive): boolean {
  const bu = sim.world.bu;
  const dir = outward(prim, it.pos, 0.25 * bu, (it.id & 1) === 0 ? 1 : -1);
  const step = FRASS_ROLL_STEP_BU * bu, steps = Math.ceil(FRASS_ROLL_MAX_BU / FRASS_ROLL_STEP_BU);
  const maxFall = FRASS_FALL_MAX_BU * bu;
  for (let k = 0; k <= steps; k++) {
    q.x = it.pos.x + dir.x * step * k; q.y = it.pos.y + FRASS_FALL_LIFT_BU * bu; q.z = it.pos.z + dir.z * step * k;
    if (sim.field.sample(q) <= 0) continue; // the start point is inside something: roll further
    const t = sim.field.sphereTrace(q, DOWN, maxFall, 0);
    if (t >= maxFall) continue;
    probe.x = q.x; probe.y = q.y - t; probe.z = q.z;
    if (primDistance(prim, probe) <= FRASS_LAND_CLEAR_BU * bu) continue; // still on the wood
    // already lying on what is below it (the ground at the foot of the wood): nothing to do
    if (k === 0 && Math.abs(probe.y - it.pos.y) <= FRASS_LAND_CLEAR_BU * bu) return false;
    it.pos = { x: probe.x, y: probe.y, z: probe.z };
    it.inNest = false;
    it.chamberId = -1;
    return true;
  }
  return false;
}

/** Every frass item lying outside on nest wood falls off it. Returns how many fell. */
export function frassFallPass(sim: Sim): number {
  const reach = FRASS_ON_WOOD_BU * sim.world.bu;
  let n = 0;
  for (const it of sim.stores.items.list) {
    if (!it.alive || it.kind !== 'frass' || it.inNest || it.carrierIds.length > 0) continue;
    const hit = woodAt(sim, it.pos, reach);
    if (hit && dropFrassItem(sim, it, hit.prim)) n++;
  }
  return n;
}
