// Debug flag `cheat.noLag` (GDD 06 App. B): thermal lags are skipped, so temperatures sit at their targets.
// Not part of the saved state (cheats are never saved); keyed by state object so several sims do not interfere.

import type { SimState } from '@/sim/types';

const flags = new WeakSet<SimState>();

export function setNoLag(state: SimState, on: boolean): void {
  if (on) flags.add(state);
  else flags.delete(state);
}

export function isNoLag(state: SimState): boolean {
  return flags.has(state);
}
