// Debug overrides of the flood model (GDD 03 App. B `cheat.setRain(I)`, `cheat.setDrainScale(k)`): the inflow
// intensity I at every entrance (-1 = follow the weather) and a multiplier on wall drainage. Like `cheat.noLag`
// they are not part of the saved state (cheats are never saved); keyed by the state object.

import type { SimState } from '@/sim/types';

export interface FloodCheats {
  /** Forced rain intensity I at every outdoor entrance, -1 = from the weather. */
  rainI: number;
  /** Multiplier on Q_out. */
  drainScale: number;
}

const CHEATS = new WeakMap<SimState, FloodCheats>();

export function floodCheats(state: SimState): FloodCheats {
  let c = CHEATS.get(state);
  if (!c) {
    c = { rainI: -1, drainScale: 1 };
    CHEATS.set(state, c);
  }
  return c;
}
