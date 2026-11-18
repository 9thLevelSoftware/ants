// Rival nests built when the game is created (sim-seams item 3). Building the real nests (carving, entrances, queens,
// display brood) costs 0.3-1 s per established colony, all of it inside nest-module carve operations that a tick
// cannot split; done on the first rivals tick it made that tick last 1.5-2 s (1.7-5.5 s in the gate runs).
// createNewGame has no Sim, so the set-up runs on a short-lived Sim over the new state (no systems, nothing ticked)
// and only the state it wrote is kept; the game's own Sim rebuilds every runtime cache from that state. The
// first-tick path (tick.ts) stays for saves made before this change and for colonies created without it.
//
// The short-lived Sim is assembled here from the services rather than by createSim: importing src/sim/sim.ts from
// this module (loaded inside the systems list's own evaluation) breaks the module cycle (commands.ts builds its table
// at load). Needs only what the nest set-up reads; a hook in createNewGame calling createSim would be cleaner
// (reported).

import { EventBus } from '@/core/events';
import { rngFork } from '@/core/rng';
import type { Sim, SimEventMap, SimState, WorldData } from '@/sim/types';
import { createServices } from '@/sim/services';
import { getSpecies, requireSpecies } from '@/sim/species';
import { setupRivalNest } from './setup';
import { colExt, rivalColonies } from './state';

function setupSim(state: SimState, world: WorldData): Sim {
  const events = new EventBus<SimEventMap>();
  const refuse = (): never => { throw new Error('rivals/prepare: the set-up Sim does not run'); };
  const sim: Sim = {
    state, world, ...createServices(state, world),
    species: requireSpecies(state.config.species), getSpecies, events, systems: [],
    behaviours: { get: () => undefined },
    tick: refuse, enqueue: refuse, applyPendingCommands: refuse, setPlayerIntent: refuse, integratePossessed: refuse,
    emit: (ev) => events.queue(ev.type, ev as SimEventMap[typeof ev.type]),
    stream: (name) => (state.rngStreams[name] ??= rngFork(state.config.world.seed, name)),
  };
  return sim;
}

/** Builds the real nest of every rival colony of a new game's state that has none yet. */
export function prepareRivalNests(state: SimState, world: WorldData): void {
  if (!state.colonies.some((c) => c.rival && !colExt(state, c.id).setupDone)) return;
  const sim = setupSim(state, world);
  for (const col of rivalColonies(sim)) if (!colExt(state, col.id).setupDone) setupRivalNest(sim, col);
}
