// granary-state events (GDD 07 App. C: "alerts on transitions"): emitted when the set of cohort states present in a
// granary changes, which includes the first seed stored (the milestone ms-first-granary listens to it).

import type { GranaryModule, Sim } from '@/sim/types';
import { GRANARY_STATE_MIN_LOADS } from '@/sim/balance/species-harvester';
import { totalsOf } from './cohorts';

const STOCKED = 1, DAMP = 2, GERMINATING = 4, SPROUTED = 8, ROTTING = 16;

/** Bit mask: stocked from the first seed; the other states from GRANARY_STATE_MIN_LOADS loads. */
export function stateMaskOf(t: ReturnType<typeof totalsOf>): number {
  const on = (loads: number, bit: number): number => (loads >= GRANARY_STATE_MIN_LOADS ? bit : 0);
  return (t.loads > 0 ? STOCKED : 0) | on(t.damp, DAMP) | on(t.germinating, GERMINATING) | on(t.sprouted, SPROUTED)
    | on(t.rotting, ROTTING);
}

/** Emits granary-state for every granary whose state mask changed since its last event. */
export function emitGranaryStates(sim: Sim, mod: GranaryModule): void {
  for (const gr of mod.granaries) {
    const t = totalsOf(gr);
    const mask = stateMaskOf(t);
    if (mask === (gr.stateMask ?? 0)) continue;
    gr.stateMask = mask;
    sim.emit({
      type: 'granary-state', granaryId: gr.chamberId, damp: t.damp, germinating: t.germinating, sprouted: t.sprouted,
      rotting: t.rotting,
    });
  }
}
