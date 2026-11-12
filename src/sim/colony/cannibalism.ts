// Brood cannibalism under starvation (GDD 02 §5.7 S3): which item nurses eat next, and eating it.

import type { Brood, Sim } from '@/sim/types';
import { CANNIBAL_INTERVAL_S, CANNIBAL_MIN_HUNGER_GD, CANNIBAL_RECYCLE_FRAC, EGG_RECYCLE_P } from '@/sim/balance';
import { daysToTicks, secondsToTicks } from '@/sim/time';
import { coreOf } from './core';
import { broodDies } from './brood';
import { deposit } from './stores';

/**
 * Next brood item nurses may eat (GDD 02 §5.7 S3): eggs first, then larvae with the least progress that have
 * been hungry for _CANNIBAL_MIN_HUNGER_GD; null outside S3+ or while the colony rate limit holds.
 */
export function nextCannibalVictim(sim: Sim, colonyId: number): Brood | null {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return null;
  if (col.starvationStage !== 'brood-sacrifice' && col.starvationStage !== 'adult-starvation') return null;
  if (sim.state.tick < coreOf(col).cannibalReadyTick) return null;
  let egg: Brood | null = null;
  let larva: Brood | null = null;
  const minHunger = daysToTicks(CANNIBAL_MIN_HUNGER_GD);
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== colonyId || b.carriedBy !== -1) continue;
    if (b.stage === 'egg') { if (!egg || b.id < egg.id) egg = b; } else if (b.stage === 'larva' && b.hungerTicks > minHunger) {
      if (!larva || b.progress < larva.progress) larva = b;
    }
  }
  return egg ?? larva;
}

/** A nurse eats a brood item (`nurse.cannibalise`): recycled into the pool (eggs EGG_RECYCLE_P, larvae half of fed). */
export function cannibaliseBrood(sim: Sim, _eaterId: number, broodId: number): boolean {
  const b = sim.stores.brood.get(broodId);
  if (!b || b.stage === 'pupa') return false;
  const col = sim.stores.colonies.get(b.colony);
  if (!col) return false;
  const c = b.stage === 'larva' ? CANNIBAL_RECYCLE_FRAC * b.fedC : 0;
  const p = b.stage === 'larva' ? CANNIBAL_RECYCLE_FRAC * b.fedP : EGG_RECYCLE_P;
  broodDies(sim, b, 'cannibalised');
  deposit(col, c, p, 0, 'recycled');
  coreOf(col).cannibalReadyTick = sim.state.tick + secondsToTicks(CANNIBAL_INTERVAL_S);
  sim.emit({ type: 'cannibalism', colonyId: col.id, broodId });
  return true;
}
