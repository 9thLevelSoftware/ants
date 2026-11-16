// Difficulty and rule multipliers of human activity (GDD 04 §15.7). The custom rule `humanActivity` replaces the
// preset frequency only when the player set it (config.difficulty.custom); `off` always silences people.

import type { Sim } from '@/sim/types';
import { HUMAN_ACTIVITY_MULT, HUMAN_LETHAL_CAP } from '@/sim/balance/human';

function customActivity(sim: Sim): keyof typeof HUMAN_ACTIVITY_MULT | undefined {
  return (sim.state.config.difficulty.custom as { humanActivity?: keyof typeof HUMAN_ACTIVITY_MULT } | undefined)?.humanActivity;
}

/** The player switched people off (rule or custom difficulty): nothing is scheduled, the world does not answer. */
export function humanActivityOff(sim: Sim): boolean {
  return sim.state.config.rules.humanActivity === 'off' || customActivity(sim) === 'off';
}

export function humanFreqMult(sim: Sim): number {
  if (humanActivityOff(sim)) return 0;
  const custom = customActivity(sim);
  if (custom !== undefined) return HUMAN_ACTIVITY_MULT[custom] ?? 1;
  return sim.state.config.difficulty.params.humanFreqMult;
}

export function humanLethalMult(sim: Sim): number {
  return sim.state.config.difficulty.params.humanLethalMult;
}

/** A crush / removal probability with the difficulty's lethality applied (cap HUMAN_LETHAL_CAP). */
export function lethalP(sim: Sim, p: number): number {
  return Math.min(HUMAN_LETHAL_CAP, p * humanLethalMult(sim));
}

export function humanTelegraphMult(sim: Sim): number {
  return sim.state.config.difficulty.params.humanTelegraphMult;
}

/** Where bait stations may be placed: none (gentle), interior, interior and garden (harsh). */
export function baitMode(sim: Sim): 'off' | 'interior' | 'interior-garden' {
  return sim.state.config.difficulty.params.baitEnabled as 'off' | 'interior' | 'interior-garden';
}

/** Gentle: the possessed ant is stunned and displaced instead of killed (§15.7). */
export function possessedSpared(sim: Sim): boolean {
  return sim.state.config.difficulty.preset === 'gentle';
}
