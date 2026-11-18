// Rival nests built when the game is created (sim-seams item 3). Building the real nests (carving, entrances, queens,
// display brood) costs 0.3-1 s per established colony, all of it inside nest-module carve operations that a tick
// cannot split; done on the first rivals tick it made that tick last 1.7-5.5 s. createNewGame has no Sim, so the
// set-up runs on a short-lived Sim over the new state (systems none, nothing ticked) and only the state it wrote is
// kept; the game's own Sim rebuilds every runtime cache from that state. The first-tick path stays for saves made
// before this change and for colonies a test creates without it.

import type { SimState, WorldData } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { setupRivalNest } from './setup';
import { colExt, rivalColonies } from './state';

/** Builds the real nest of every rival colony of a new game's state that has none yet. */
export function prepareRivalNests(state: SimState, world: WorldData): void {
  const pending = state.colonies.filter((c) => c.rival && !colExt(state, c.id).setupDone);
  if (pending.length === 0) return;
  const sim = createSim(state, world, { systems: [], behaviours: [] });
  for (const col of rivalColonies(sim)) if (!colExt(state, col.id).setupDone) setupRivalNest(sim, col);
}
