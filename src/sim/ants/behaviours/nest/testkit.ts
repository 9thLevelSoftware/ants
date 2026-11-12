// Test support for the in-nest behaviours (never imported by game code): an established colony in the standard
// small test nest (src/sim/testing/testNest.ts: food, nursery and royal chambers one below the other), built
// only through the real modules and cheats, plus a few probes the tests share.

import type { Ant, BroodStage, Chamber, Entrance, Nest, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { makeTestSim, type TestSimOptions } from '@/sim/testing';
import { placeOnSurface } from '@/sim/locomotion';
import { setClimateOverride } from '@/sim/colony';
import { chamberTemp, relHumidity } from '@/sim/environment';
import { floorPoint, pileSlot } from './places';
import { QUEEN_SEAT_OFFSET } from '@/sim/balance/nestwork';
import { QUEEN_FAT_CAP } from '@/sim/balance/colony';
import { groupOf } from './sorting';

export interface NestColony {
  sim: Sim;
  nest: Nest;
  entrance: Entrance;
  food: Chamber;
  nursery: Chamber;
  royal: Chamber;
  queen: Ant;
}

export interface NestColonyOptions extends Omit<TestSimOptions, 'nest' | 'workers'> {
  workers?: number;
  /** Brood cheat-spawned into the given chambers (default none). */
  brood?: { stage: BroodStage; n: number; chamber: 'food' | 'nursery' | 'royal'; progress?: number }[];
  /** Starting stores, loads (default C 40, P 20). */
  stores?: { c: number; p: number };
  /** Establish the queen in the royal chamber (default true). */
  queen?: boolean;
}

/** The founding queen becomes an established queen on the royal chamber floor (stand-in for the founding module). */
export function establishQueen(sim: Sim, q: Ant, royal: Chamber): void {
  const qs = q.queen!;
  qs.founding = null;
  qs.mode = 'established';
  qs.fecundity = 1;
  // the hand-over leaves her fat body full (GDD 02 §2.7: the remaining founding pool goes to reserve / reserveP)
  qs.reserve = QUEEN_FAT_CAP;
  qs.reserveP = 1;
  q.flags &= ~AntFlag.FOUNDING;
  const floor = floorPoint(royal, QUEEN_SEAT_OFFSET, Math.PI, { x: 0, y: 0, z: 0 });
  if (!placeOnSurface(sim, q, floor, { x: 0, y: -1, z: 0 })) throw new Error('establishQueen: no floor in the royal chamber');
  q.nestId = sim.state.colonies[0].nestIds[0];
  q.chamberId = royal.id;
}

/** An established colony in the small test nest. Commands are applied at once. */
export function makeNestColony(o: NestColonyOptions = {}): NestColony {
  const sim = makeTestSim({ ...o, nest: 'small', workers: o.workers ?? 0 });
  const col = sim.state.colonies[0];
  const nest = sim.stores.nests.get(col.nestIds[0])!;
  const [food, nursery, royal] = nest.chambers;
  const entrance = nest.entrances[0];
  const queen = sim.stores.ants.get(col.queenId)!;
  if (o.queen !== false) establishQueen(sim, queen, royal);
  const stores = o.stores ?? { c: 40, p: 20 };
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: stores.c, p: stores.p, toxin: 0 });
  const rooms = { food, nursery, royal };
  for (const b of o.brood ?? []) {
    sim.enqueue({
      type: 'cheat.spawnBrood', colonyId: col.id, stage: b.stage, n: b.n, chamberId: rooms[b.chamber].id,
      progress: b.progress ?? 0, destined: 'worker',
    });
  }
  sim.applyPendingCommands();
  // spawned brood lies on the chamber floor at the stage's pile (the cheat puts it at the centre)
  for (const b of sim.stores.brood.list) {
    const ch = nest.chambers.find((c) => c.id === b.chamberId);
    if (ch && b.pos.y === ch.center.y) b.pos = pileSlot(ch, groupOf(b), b.id, sim.world.bu, { x: 0, y: 0, z: 0 });
  }
  return { sim, nest, entrance, food, nursery, royal, queen };
}

/** Runs n ticks. */
export function run(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

/** Live ants of the player colony with a task. */
export function antsWithTask(sim: Sim, task: string): Ant[] {
  return sim.stores.ants.list.filter((a) => a.alive && a.task === task);
}

/**
 * Forces chamber climates for a test: the nest module's debug override (chamber records, read by brood sorting)
 * AND the colony module's climate fake (brood development, laying), which the nest cheat does not reach.
 * `climate(chamberId)` returns [°C, RH] or null for the environment's value.
 */
export function forceClimate(k: NestColony, climate: (chamberId: number) => [number, number] | null): void {
  const { sim } = k;
  for (const c of k.nest.chambers) {
    const v = climate(c.id);
    if (v) sim.enqueue({ type: 'cheat.setChamberClimate', chamberId: c.id, tempC: v[0], rh: v[1] });
  }
  sim.applyPendingCommands();
  setClimateOverride(sim, {
    chamberTemp: (id) => climate(id)?.[0] ?? chamberTemp(sim, id),
    rh: (id) => climate(id)?.[1] ?? relHumidity(sim, k.nest.chambers.find((c) => c.id === id)?.center ?? k.royal.center),
  });
}
