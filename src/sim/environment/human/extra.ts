// Lazily created additive human state (src/sim/types/human.ts): older saves and new games start without it.

import type { HumanExtraState, Sim } from '@/sim/types';

export function humanExtra(sim: Sim): HumanExtraState {
  const h = sim.state.env.human;
  if (!h.extra) {
    h.extra = {
      progress: {}, parked: [], baits: [], regrow: [], grassDay: -1, baitDueTick: -1, baitDuePatio: false, visitDay: -1,
      patioDays: 0, patioVisitsToday: 0, extraWipeDay: -1,
    };
  }
  return h.extra;
}
