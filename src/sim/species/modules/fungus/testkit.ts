// Test helpers of the fungus module: an Atta colony in the standard small test nest (src/sim/testing/testNest.ts),
// its opening marked done (the colony is past its founding), one chamber made a fungus chamber holding a garden,
// castes placed by hand, and a leaf site near the entrance.

import type { Ant, Brood, BroodCaste, Caste, Chamber, GardenRecord, LeafSite, Sim, Task } from '@/sim/types';
import { makeTestSim } from '@/sim/testing/testWorld';
import { installSmallNest, type SmallNest } from '@/sim/testing/testNest';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { spawnAnt, spawnBrood } from '@/sim/entities';
import { floorPoint, GOLDEN_ANGLE } from '@/sim/ants/behaviours/nest/places';
import { walkerPlace } from '@/sim/locomotion/walker';
import { coreOf } from '@/sim/colony/core';
import { fungusParams, type FungusParams } from './params';
import { seedGarden } from './state';

export interface FungusKit {
  sim: Sim;
  nest: SmallNest;
  P: FungusParams;
  /** The chamber holding the garden (the small nest's nursery). */
  room: Chamber;
  garden: GardenRecord;
}

export interface KitOptions { seed?: number; tempC?: number; rh?: number; G?: number; surface?: number }

/** An Atta test sim with the small nest; the nursery becomes a fungus chamber with a garden of G GU. 23 °C, RH 0.9. */
export function attaKit(o: KitOptions = {}): FungusKit {
  const sim = makeTestSim({ species: 'atta-texana', seed: o.seed ?? 1, sizeBu: 160 });
  const nest = installSmallNest(sim);
  const op = sim.state.player.opening;
  if (op) { op.done = true; op.phase = 'done'; }
  const t = o.tempC ?? 23, rh = o.rh ?? 0.9;
  setClimateOverride(sim, { chamberTemp: () => t, rh: () => rh, pointTemp: () => t, surfaceActivity: () => o.surface ?? 1, rain: () => 0 });
  // the chambers' own climate (the garden reads the chamber record's humidity, GDD 03 §9.2)
  for (const ch of nest.chambers) sim.enqueue({ type: 'cheat.setChamberClimate', chamberId: ch.id, tempC: t, rh });
  const room = nest.chambers[1];
  room.type = 'fungus';
  const col = sim.state.colonies[0];
  const P = fungusParams(sim.getSpecies(col.species))!;
  const garden = seedGarden(sim, col.fungus!, P, room.id, o.G ?? 1.5, 1, 0);
  garden.state = (o.G ?? 1.5) >= P.healthyG ? 'healthy' : (o.G ?? 1.5) >= P.establishingG ? 'establishing' : 'seeded';
  return { sim, nest, P, room, garden };
}

/** Spawns `n` ants of a caste in a chamber (or at a point outside). */
export function addAnts(k: FungusKit, caste: Caste, n: number, chamber: Chamber | null, task: Task = 'idle', lengthBu?: number): Ant[] {
  const out: Ant[] = [];
  const col = k.sim.state.colonies[0];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const c = chamber ?? null;
    const p = c
      ? { x: c.center.x + Math.cos(a) * c.radii.x * 0.3, y: c.center.y, z: c.center.z + Math.sin(a) * c.radii.z * 0.3 }
      : { x: k.nest.entrance.pos.x + Math.cos(a) * 4 * k.sim.world.bu, y: k.nest.entrance.pos.y + k.sim.world.bu, z: k.nest.entrance.pos.z + Math.sin(a) * 4 * k.sim.world.bu };
    const ant = spawnAnt(k.sim, {
      colony: col.id, caste, pos: p, task, ageGd: 3, nestId: c ? k.nest.nest.id : -1, chamberId: c ? c.id : -1, lengthBu,
    });
    walkerPlace(k.sim.field, ant, p, { dir: { x: 0, y: -1, z: 0 } }, k.sim.kernel.walker);
    out.push(ant);
  }
  coreOf(col).workers += n;
  return out;
}

/** Spawns `n` larvae on the floor of a chamber (destined minor unless given). */
export function addLarvae(k: FungusKit, n: number, chamber: Chamber, destined: BroodCaste = 'minor'): Brood[] {
  const col = k.sim.state.colonies[0];
  const out: Brood[] = [];
  for (let i = 0; i < n; i++) {
    const p = floorPoint(chamber, 0.3, i * GOLDEN_ANGLE, { x: 0, y: 0, z: 0 });
    out.push(spawnBrood(k.sim, { colony: col.id, stage: 'larva', destined, pos: p, nestId: k.nest.nest.id, chamberId: chamber.id }));
  }
  return out;
}

/** Replaces the colony's leaf sites with one site near the entrance (q, p, t given), LU `lu`. */
export function leafSiteNearEntrance(k: FungusKit, over: Partial<LeafSite> = {}, dxBu = 12): LeafSite {
  const e = k.nest.entrance.pos, bu = k.sim.world.bu;
  const x = e.x + dxBu * bu, z = e.z;
  const s: LeafSite = { pos: { x, y: k.sim.field.height(x, z), z }, plantId: 7, kind: 'herbage', q: 0.8, p: 0.12, t: 0, lu: 200, capacity: 200, ...over };
  k.sim.state.colonies[0].fungus!.leafSites = [s];
  return s;
}

export function run(sim: Sim, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) { sim.tick(); each?.(); }
}
