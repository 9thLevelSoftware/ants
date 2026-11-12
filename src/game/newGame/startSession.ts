// Builds the running session for resolved new-game options: world generation (or the prepared test world),
// the sim, the optional small test nest, and the session around it.
import { createNewGame } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { installSmallNest } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import type { ResolvedNewGame } from './options';

/** World + initial state (the slow part: world generation). */
export function generate(resolved: ResolvedNewGame): ReturnType<typeof createNewGame> {
  return createNewGame(resolved.config, resolved.world);
}

/** The runtime sim around a new state. */
export function wake(resolved: ResolvedNewGame, game: ReturnType<typeof createNewGame>): Sim {
  const sim = createSim(game.state, game.world);
  if (resolved.testWorld?.nest === 'small') installSmallNest(sim);
  return sim;
}
