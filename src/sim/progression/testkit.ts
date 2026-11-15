// Test helpers of the progression module (tests only): a small sim running only progression's systems, event
// delivery, polling, and a recorder of the events progression emits.

import type { Ant, Sim, SimEvent, SpeciesId } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { PROGRESSION_POLL_EVERY } from '@/sim/balance';
import { attachProgression, systems } from './index';

export interface ProgSimOptions {
  species?: SpeciesId;
  workers?: number;
  seed?: number;
}

/** A test sim (small nest, workers) whose system list is progression's only; the listener is attached. */
export function makeProgSim(o: ProgSimOptions = {}): Sim {
  const sim = makeTestSim({ species: o.species, seed: o.seed ?? 1, nest: 'small', workers: o.workers ?? 4, systems });
  attachProgression(sim);
  return sim;
}

/** Queues an event and delivers it (one tick). */
export function deliver(sim: Sim, ev: SimEvent): void {
  sim.emit(ev);
  sim.tick();
}

/** Ticks long enough for one state poll to run (and flushes its events). */
export function pollOnce(sim: Sim): void {
  for (let i = 0; i < PROGRESSION_POLL_EVERY + 1; i++) sim.tick();
}

/** Records every event of the given types from now on. */
export function recordEvents(sim: Sim, types: readonly string[]): SimEvent[] {
  const out: SimEvent[] = [];
  sim.events.onAny((type, payload) => { if (types.includes(type as string)) out.push(payload as SimEvent); });
  return out;
}

/** A living worker of the player colony. */
export function aWorker(sim: Sim): Ant {
  const col = sim.state.colonies[0];
  const a = sim.stores.ants.list.find((x) => x.alive && x.colony === col.id && x.caste === 'worker');
  if (!a) throw new Error('testkit: no worker');
  return a;
}
