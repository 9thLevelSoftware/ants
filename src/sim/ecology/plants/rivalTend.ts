// Rivals' virtual tending (GDD 05 §3.5 "virtual harvest"): herds in a cell an abstract rival colony claims get its
// virtual tendedness min(0.7, N/300) as a floor, so a rival's territory keeps its herds productive without fielded
// tenders. Claims come from the rivals' territory grid (claimAt; a light module of types and balance only).

import type { FoodSource, Sim } from '@/sim/types';
import { claimAt } from '@/sim/rivals/claims';

/** Tendedness floor 0..1 a rival gives the herd at `src` (0 outside rival-claimed cells or without rivals). */
export function rivalTendFloor(sim: Sim, src: FoodSource | undefined): number {
  if (!src || sim.state.rivals.territory.marks.length === 0) return 0;
  const claim = claimAt(sim, src.pos);
  if (claim.owner < 0) return 0;
  const col = sim.stores.colonies.get(claim.owner);
  if (!col || !col.alive || col.isPlayer || !col.rival) return 0;
  return Math.max(0, Math.min(1, col.rival.virtualTend));
}
