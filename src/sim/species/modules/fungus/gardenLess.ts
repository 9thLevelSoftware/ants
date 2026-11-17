// The garden-less colony (GDD 07 §6.4.9): when every garden is dead (Σ G = 0) after the founding, the colony enters
// `garden-less` (event `all-gardens-lost`, alert "The garden is lost"): larvae die at hazard 1.0 per game day, the
// queen lays no eggs and draws 0.1 loads per game day from a 3 GD reserve, then dies (cause `starvation`); adults
// live on sap. A living garden again (a fungus piece from a surviving garden) ends the state.

import { rngFloat } from '@/core/rng';
import type { Colony, Sim } from '@/sim/types';
import { broodDies } from '@/sim/colony/brood';
import { colonyAlert, colonyClearAlert } from '@/sim/colony/alerts';
import { processAntDeath } from '@/sim/ants/lifecycle';
import type { FungusParams } from './params';
import { liveGardens } from './state';
import { openingRunning } from './work';

/** Whether the colony has ever had a garden (a colony still in its opening before the pellet is planted has none). */
function hadGarden(col: Colony): boolean {
  return (col.fungus?.gardens.length ?? 0) > 0;
}

export function gardenLessStep(sim: Sim, col: Colony, P: FungusParams, dtGd: number): void {
  const mod = col.fungus!;
  const live = liveGardens(mod).length > 0;
  if (live) {
    if (mod.gardenLess) {
      mod.gardenLess = false;
      mod.gardenLessTick = -1;
      colonyClearAlert(sim, 'garden-failing', col.id);
    }
    return;
  }
  if (!hadGarden(col) || openingRunning(sim, col)) return;
  if (!mod.gardenLess) {
    mod.gardenLess = true;
    mod.gardenLessTick = sim.state.tick;
    mod.gardenLessReserve = P.gardenLessDrawLoads * P.gardenLessReserveGd;
    const cause = mod.lostCause ?? mod.gardens.map((g) => g.lastCause).find((c) => !!c) ?? 'unknown';
    mod.lostCause = cause;
    sim.emit({ type: 'all-gardens-lost', colonyId: col.id, cause });
    if (col.isPlayer) colonyAlert(sim, 'garden-failing', 'critical', col.id, 'The garden is lost', cause, 'diag-garden');
  }
  // larvae without staphylae: hazard gardenLessLarvaHazard per game day
  const rng = sim.stream('rng.colony');
  const p = 1 - Math.exp(-P.gardenLessLarvaHazard * dtGd);
  for (const b of sim.stores.brood.list) {
    if (b.alive && b.colony === col.id && b.stage === 'larva' && rngFloat(rng) < p) broodDies(sim, b, 'starvation');
  }
  // the queen: no eggs, her reserve, then starvation
  const q = sim.stores.ants.get(col.queenId);
  if (q && q.alive && q.queen) {
    q.queen.eggBudget = 0;
    mod.gardenLessReserve = (mod.gardenLessReserve ?? 0) - P.gardenLessDrawLoads * dtGd;
    if (mod.gardenLessReserve <= 0) processAntDeath(sim, q.id, 'starvation');
  }
}

/** Every tick while garden-less: the queen's laying budget stays at 0 (her slow tick may have added to it). */
export function holdGardenLessLaying(sim: Sim, col: Colony): void {
  if (!col.fungus?.gardenLess) return;
  const q = sim.stores.ants.get(col.queenId);
  if (q?.queen) q.queen.eggBudget = 0;
}
