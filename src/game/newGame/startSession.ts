// Builds the running sim for resolved new-game options: world generation and the sim around it, or, for test
// worlds, makeTestSim (the prepared world, the optional small nest and its workers, exactly as module tests do).
import { createNewGame } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import type { ResolvedNewGame } from './options';

export type Generated = ReturnType<typeof createNewGame> | null;

/** World + initial state (the slow part: world generation). Null for test worlds (built whole in wake). */
export function generate(resolved: ResolvedNewGame): Generated {
  return resolved.testWorld ? null : createNewGame(resolved.config, resolved.world);
}

/** The runtime sim. */
export function wake(resolved: ResolvedNewGame, generated: Generated): Sim {
  const tw = resolved.testWorld;
  if (tw && resolved.world) {
    return makeTestSim({ world: resolved.world, config: resolved.config, nest: tw.nest ?? 'none', workers: tw.workers ?? 0 });
  }
  if (!generated) throw new Error('startSession: nothing generated');
  return createSim(generated.state, generated.world);
}
