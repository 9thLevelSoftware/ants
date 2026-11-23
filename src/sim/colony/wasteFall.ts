// Colony-life round 14 (direction 29 Part C item 2): waste falls to the floor. Brood waste (meconium, cocoons, dead
// brood) is spawned where the brood is, and brood can be held up where nothing would hold a lump of waste: carried, or
// resting under a ceiling. cpv #1's royal chamber kept 8 such items from its founding (made at ticks 28803-44871,
// 0.11 mm under the ceiling, 8 mm above the floor) for all of year two: hauling reads them as out of reach (nest
// behaviours `onSurface`: nothing below within REACHABLE_ABOVE_BU), so nobody carried them out, and every egg the
// queen laid there lay among 8 waste items against a tolerance of 3.

import type { Colony, Item, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { WASTE_FALL_MAX_BU, WASTE_SUPPORTED_BU } from '@/sim/balance/colony';

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/**
 * The floor under p where a dropped thing comes to rest: p itself if something holds it up within WASTE_SUPPORTED_BU
 * below (or p is inside solid), else the first surface straight down within WASTE_FALL_MAX_BU; null if none (p stays).
 */
export function restingPointUnder(sim: Sim, p: Vec3): Vec3 | null {
  const bu = sim.world.bu;
  if (sim.field.sample(p) <= 0) return null;
  const max = WASTE_FALL_MAX_BU * bu, d = sim.field.sphereTrace(p, DOWN, max, 0);
  if (d <= WASTE_SUPPORTED_BU * bu || d >= max) return null;
  return { x: p.x, y: p.y - d, z: p.z };
}

/** Moves a loose item that nothing holds up to the floor under it (its chamber record follows if it left it). */
export function dropLooseItem(sim: Sim, it: Item): boolean {
  if (it.carrierIds.length > 0) return false;
  const q = restingPointUnder(sim, it.pos);
  if (!q) return false;
  it.pos = q;
  const nest = sim.stores.nests.get(it.nestId);
  if (nest && it.chamberId >= 0) {
    const c = nest.chambers.find((x) => x.id === it.chamberId);
    // the chamber's ellipsoid with the 1.2 slack chamberAt (locomotion/nests.ts) uses: still in it, or in none
    if (c) {
      const dx = (q.x - c.center.x) / (c.radii.x * 1.2), dy = (q.y - c.center.y) / (c.radii.y * 1.2 + 1e-4), dz = (q.z - c.center.z) / (c.radii.z * 1.2);
      if (dx * dx + dy * dy + dz * dz > 1) it.chamberId = -1;
    }
  }
  return true;
}

/** Once a colony cycle: the colony's loose waste and corpses inside its nests that hang where nothing holds them fall. */
export function settleHangingWaste(sim: Sim, col: Colony): number {
  let n = 0;
  for (const it of sim.stores.items.list) {
    if (!it.alive || !it.inNest || (it.kind !== 'waste' && it.kind !== 'corpse') || it.carrierIds.length > 0) continue;
    if (!col.nestIds.includes(it.nestId)) continue;
    if (dropLooseItem(sim, it)) n++;
  }
  return n;
}
