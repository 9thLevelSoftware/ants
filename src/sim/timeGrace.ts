// The opening grace period (GDD 06 §5.2): "no human event or predator spawns for the first OPEN_GRACE_GD = 0.3 GD
// (Gentle 0.6, Harsh 0.15)" of a new game, difficulty parameter `openingGraceGd`. Read by the human-event scheduler
// (naturally scheduled events only; debug triggers still run) and the creature director (ant predators and bird visits
// only; prey and neutral creatures still appear). `state.tick` counts from the start of the game, so a load keeps it.
// The human schedule is drawn once per day, at the first tick of the day: in the game the intro card is skipped by a
// command applied before that tick's environment phase, so the first draw sees the grace (a sim ticked while still at
// the intro card would keep that day's draw unfiltered).

import type { Sim } from '@/sim/types';
import { difficultyValue } from '@/sim/balance';
import { TICKS_PER_DAY } from '@/sim/time';

/** First tick after the opening grace (state ticks); 0 when the game plays no opening (see inOpeningGrace). */
export function openingGraceEndTick(sim: Sim): number {
  const op = sim.state.player.opening;
  if (!op || op.phase === 'intro-card') return 0;
  return Math.round(difficultyValue(sim, 'openingGraceGd') * TICKS_PER_DAY);
}

/**
 * True during the opening grace period of a new game whose opening is being played. The intro card pauses the game's
 * clock (GDD 06 §5.1), so a sim still at `intro-card` is a scene that never plays the opening (module tests, tools
 * that build a colony by cheats): it gets no grace.
 */
export function inOpeningGrace(sim: Sim): boolean {
  const op = sim.state.player.opening;
  if (!op || op.phase === 'intro-card') return false;
  return sim.state.tick < openingGraceEndTick(sim);
}
