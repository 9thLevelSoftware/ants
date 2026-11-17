// The granary in the overwintering (GDD 07 §5.3.7, GDD 06 §6): the aggregate winter model draws the colony's food
// from its stores; for a harvester those are the granaries, converted to paste at winterPasteConversion without
// simulating the milling labour. When the overwintering notice or banner shows, the granary stock moves into the
// colony pool as paste nutrition (as much as the pool holds), once per year.

import type { Colony, Sim, System } from '@/sim/types';
import { deposit } from '@/sim/colony/stores';
import { currentYear } from '@/sim/time';
import { granaryColonies } from './economy';
import type { GranaryParams } from './params';
import { pruneCohorts } from './cohorts';
import { colonyStock } from './state';

/** Moves granary stock into the pool for the winter; returns the seed loads moved. */
export function stockForWinter(col: Colony, g: GranaryParams): number {
  const mod = col.granary!;
  const stock = colonyStock(mod);
  if (stock <= 0) return 0;
  const k = g.winterPasteConversion;
  const got = deposit(col, stock * k * g.pasteC, stock * k * g.pasteP, 0, 'delivery');
  const moved = Math.min(stock, Math.max(got.c / (k * g.pasteC), got.p / (k * g.pasteP)));
  if (moved <= 0) return 0;
  const frac = moved / stock;
  for (const gr of mod.granaries) {
    for (const c of gr.cohorts) c.loads *= 1 - frac;
    pruneCohorts(gr);
  }
  return moved;
}

export const granaryWinterSystem: System = {
  name: 'granary-winter', phase: 'colony-economy', every: 50,
  run(sim: Sim) {
    const w = sim.state.env.winter;
    if (w.phase !== 'notice' && w.phase !== 'banner') return;
    const year = currentYear(sim.state);
    for (const { col, g } of granaryColonies(sim)) {
      const mod = col.granary!;
      if (mod.winterYear === year) continue;
      stockForWinter(col, g);
      mod.winterYear = year;
    }
  },
};
