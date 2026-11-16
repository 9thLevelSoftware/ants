// Lead times (GDD 04 §15.3): every cue's lead is multiplied by HUMAN_TELEGRAPH_MULT; a run's first impact comes
// after its longest lead so that every warning starts inside the run.

import type { Sim } from '@/sim/types';
import type { HumanCueSpec } from '@/sim/balance/human';
import { TICKS_PER_SECOND } from '@/sim/time';
import { humanTelegraphMult } from '../rules';

/** Lead of one cue spec, ticks (difficulty applied). */
export function cueLeadTicks(sim: Sim, spec: HumanCueSpec): number {
  return Math.ceil(spec.lead * humanTelegraphMult(sim) * TICKS_PER_SECOND);
}

/** Tick (after the start) of a run's first impact: the longest lead plus one tick. */
export function leadTicks(sim: Sim, cues: readonly HumanCueSpec[]): number {
  let m = 0;
  for (const c of cues) m = Math.max(m, cueLeadTicks(sim, c));
  return m + 1;
}

export const secondsToT = (s: number): number => Math.round(s * TICKS_PER_SECOND);
