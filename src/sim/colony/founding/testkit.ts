// Test helpers for the founding module (test support only; never imported by game code).

import type { Ant, OpeningPhase, Primitive, Sim } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { makeTestSim, makeTestWorld, type TestSimOptions } from '@/sim/testing';
import { setClimateOverride } from '../envAdapter';
import { foundingNest, queenOf } from './access';

export function queen(sim: Sim): Ant {
  const q = queenOf(sim);
  if (!q) throw new Error('no queen');
  return q;
}

export function nestOf(sim: Sim) {
  const n = foundingNest(sim);
  if (!n) throw new Error('no founding nest');
  return n;
}

/** Ticks until pred() or max ticks; returns the ticks run. */
export function stepUntil(sim: Sim, pred: () => boolean, max: number): number {
  let t = 0;
  for (; t < max && !pred(); t++) sim.tick();
  return t;
}

export function phase(sim: Sim): OpeningPhase {
  return sim.state.player.opening!.phase;
}

/** A founding test sim with the intro and dealation behind it (phase `search`). */
export function searchingSim(opts: TestSimOptions = {}): Sim {
  const sim = makeTestSim({ sizeBu: 128, ...opts });
  sim.enqueue({ type: 'openingSkipIntro' });
  stepUntil(sim, () => phase(sim) === 'search', 200);
  return sim;
}

/** A flat test world with a floating stone slab (a roof 1.5-2.5 BU above the ground) centred at (cx, cz), BU. */
export function slabWorld(cx: number, cz: number, halfBu = 6) {
  const bu = 4;
  const slab: Primitive = {
    id: 1, shape: 'box', pos: { x: cx * bu, y: 2 * bu, z: cz * bu }, rot: { x: 0, y: 0, z: 0, w: 1 },
    size: { x: halfBu * bu, y: 0.5 * bu, z: halfBu * bu }, round: 0, material: 'stone', flags: PrimFlag.SHELTER, objectId: -1,
  };
  return makeTestWorld({ sizeBu: 128, prims: [slab] });
}

/** Every temperature the colony and founding rules read, pinned (GDD checks at a constant chamber temperature). */
export function pinTemperature(sim: Sim, tempC: number): void {
  setClimateOverride(sim, { chamberTemp: () => tempC, pointTemp: () => tempC });
}
