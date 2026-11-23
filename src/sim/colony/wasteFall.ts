// Colony-life round 14 (direction 29 Part C item 2): waste falls to the floor. Brood waste (meconium, cocoons, dead
// brood) is spawned where the brood is, and brood can be held up where nothing would hold a lump of waste: carried, or
// resting under a ceiling. cpv #1's royal chamber kept 8 such items from its founding (made at ticks 28803-44871,
// 0.11 mm under the ceiling, 8 mm above the floor) for all of year two: hauling reads them as out of reach (nest
// behaviours `onSurface`: nothing below within REACHABLE_ABOVE_BU), so nobody carried them out, and every egg the
// queen laid there lay among 8 waste items against a tolerance of 3.

//
// Round 15 (direction 30 item 2): spoiled food was spawned at the chamber ellipsoid's bottom (centre.y - radii.y), and in
// the game's nests the registry's vertical radius exceeds the cavity's half-height, so it lay ~0.3-0.45 BU inside the
// floor: counted as the chamber's waste, out of every hauler's reach (kd #3's royal chamber: 9 such items against a
// tolerance of 3 for 12 gd). It now lands on the floor under the centre (chamberFloorUnder), and waste a save already
// holds inside solid rides up onto the floor above it (liftBuriedItem, from the same cycle hook).

import type { Chamber, Colony, Item, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { WASTE_FALL_MAX_BU, WASTE_SUPPORTED_BU } from '@/sim/balance/colony';
import { BURIED_LIFT_BU, ITEM_BURIED_BU } from '@/sim/balance/nest';

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

/**
 * The floor of a chamber's cavity under its centre (the centre lies in the air of the cavity): where an item put
 * "in the chamber" lies within every hauler's reach. The registry's ellipsoid bottom (centre.y - radii.y) is not
 * that floor: the registry's vertical radius can exceed the cavity's half-height.
 */
export function chamberFloorUnder(sim: Sim, ch: Chamber): Vec3 {
  const c = ch.center;
  const q = restingPointUnder(sim, c);
  if (q) return q;
  // the centre is already within WASTE_SUPPORTED_BU of a surface, or inside solid (a chamber filled in): keep it
  return { x: c.x, y: c.y, z: c.z };
}

/**
 * Moves a loose item buried inside solid deeper than ITEM_BURIED_BU (no hauler reaches it: places.ts onSurface)
 * straight up onto the floor above it: the first free point in half-voxel steps up to BURIED_LIFT_BU (as tamp.ts
 * lifts a buried pellet). False (unchanged) when it is not buried or nothing is open above it within reach.
 */
export function liftBuriedItem(sim: Sim, it: Item): boolean {
  if (it.carrierIds.length > 0 || sim.field.sample(it.pos) >= -ITEM_BURIED_BU * sim.world.bu) return false;
  const step = sim.carve.voxel / 2, max = BURIED_LIFT_BU * sim.world.bu;
  const p = { x: it.pos.x, y: it.pos.y, z: it.pos.z };
  for (let d = step; d <= max; d += step) {
    p.y = it.pos.y + d;
    if (sim.field.sample(p) >= 0) { moveItem(sim, it, p); return true; }
  }
  return false;
}

/** Moves a loose item that nothing holds up to the floor under it (its chamber record follows if it left it). */
export function dropLooseItem(sim: Sim, it: Item): boolean {
  if (it.carrierIds.length > 0) return false;
  const q = restingPointUnder(sim, it.pos);
  if (!q) return false;
  moveItem(sim, it, q);
  return true;
}

/** Puts the item at q; its chamber record is cleared if q lies outside that chamber. */
function moveItem(sim: Sim, it: Item, q: Vec3): void {
  it.pos = { x: q.x, y: q.y, z: q.z };
  const nest = sim.stores.nests.get(it.nestId);
  if (nest && it.chamberId >= 0) {
    const c = nest.chambers.find((x) => x.id === it.chamberId);
    // the chamber's ellipsoid with the 1.2 slack chamberAt (locomotion/nests.ts) uses: still in it, or in none
    if (c) {
      const dx = (q.x - c.center.x) / (c.radii.x * 1.2), dy = (q.y - c.center.y) / (c.radii.y * 1.2 + 1e-4), dz = (q.z - c.center.z) / (c.radii.z * 1.2);
      if (dx * dx + dy * dy + dz * dz > 1) it.chamberId = -1;
    }
  }
}

/**
 * Once a colony cycle: the colony's loose waste and corpses inside its nests that lie buried in solid ride up onto
 * the floor above them, and those that hang where nothing holds them fall. Returns the items moved.
 */
export function settleHangingWaste(sim: Sim, col: Colony): number {
  let n = 0;
  for (const it of sim.stores.items.list) {
    if (!it.alive || !it.inNest || (it.kind !== 'waste' && it.kind !== 'corpse') || it.carrierIds.length > 0) continue;
    if (!col.nestIds.includes(it.nestId)) continue;
    const lifted = liftBuriedItem(sim, it);
    if (dropLooseItem(sim, it) || lifted) n++;
  }
  return n;
}
