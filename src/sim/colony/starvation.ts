// Starvation stages S0-S4 (GDD 02 §5.7). Evaluated on the colony cycle; the effects live where they act:
// reserve refill (physiology), laying-protein permission (queen), cannibalism (brood), health loss (physiology).

import type { Colony, Sim, StarvationStage } from '@/sim/types';
import {
  LEAN_DAYS_C, LEAN_DAYS_P, LEAN_EXIT_DAYS_C, LEAN_EXIT_DAYS_P, LEAN_EXIT_GD, LOAD_EPS, RATION_EXIT_C, RATION_EXIT_P,
  SACRIFICE_C_ZERO_GD, SACRIFICE_P_ZERO_GD,
} from '@/sim/balance';
import { daysToTicks } from '@/sim/time';
import { coreOf } from './core';
import { daysOfStock } from './needs';
import { colonyAlert, colonyClearAlert } from './alerts';

const RANK: Record<StarvationStage, number> = { fed: 0, lean: 1, rationing: 2, 'brood-sacrifice': 3, 'adult-starvation': 4 };

export function stageRank(s: StarvationStage): number {
  return RANK[s];
}

/**
 * Advances the colony's starvation stage. `starvingAdults` = workers at reserve 0 with no food source this cycle (S4 gate).
 */
export function updateStarvation(sim: Sim, col: Colony, starvingAdults: number): void {
  const core = coreOf(col);
  const now = sim.state.tick;
  const s = col.stores;
  if (s.c <= LOAD_EPS) { if (core.cZeroSinceTick < 0) core.cZeroSinceTick = now; } else core.cZeroSinceTick = -1;
  if (s.p <= LOAD_EPS) { if (core.pZeroSinceTick < 0) core.pZeroSinceTick = now; } else core.pZeroSinceTick = -1;

  const days = daysOfStock(col);
  const empty = core.cZeroSinceTick >= 0 || core.pZeroSinceTick >= 0;
  const sacrifice = (core.pZeroSinceTick >= 0 && now - core.pZeroSinceTick > daysToTicks(SACRIFICE_P_ZERO_GD))
    || (core.cZeroSinceTick >= 0 && now - core.cZeroSinceTick > daysToTicks(SACRIFICE_C_ZERO_GD));
  const lean = days.c < LEAN_DAYS_C || days.p < LEAN_DAYS_P;
  const cur = col.starvationStage;
  let next: StarvationStage = cur;

  if (RANK[cur] >= 2) {
    // S2-S4 leave together once the pool holds some of both again (back to S1, which then exits normally).
    if (s.c > RATION_EXIT_C && s.p > RATION_EXIT_P) next = 'lean';
    else if (cur === 'adult-starvation') next = cur; // S4 has no exit but a refilled pool (GDD 02 §5.7)
    else if (!sacrifice) next = 'rationing';
    // S4 follows S3: adults starve only once brood sacrifice is under way (the order of death in §5.7).
    else next = cur === 'brood-sacrifice' && starvingAdults > 0 ? 'adult-starvation' : 'brood-sacrifice';
  } else if (empty) {
    next = sacrifice ? 'brood-sacrifice' : 'rationing';
  } else if (cur === 'lean') {
    const exitHolds = days.c > LEAN_EXIT_DAYS_C && days.p > LEAN_EXIT_DAYS_P;
    if (!exitHolds) core.exitSinceTick = -1;
    else if (core.exitSinceTick < 0) core.exitSinceTick = now;
    if (exitHolds && now - core.exitSinceTick >= daysToTicks(LEAN_EXIT_GD)) next = 'fed';
  } else if (lean) {
    next = 'lean';
  }
  if (next !== cur) setStage(sim, col, cur, next);
}

function setStage(sim: Sim, col: Colony, from: StarvationStage, to: StarvationStage): void {
  const core = coreOf(col);
  col.starvationStage = to;
  col.starvationSinceTick = sim.state.tick;
  core.exitSinceTick = -1;
  sim.emit({ type: 'starvation-stage', colonyId: col.id, stage: to });
  if (!col.isPlayer) return;
  if (RANK[to] >= 1 && RANK[from] === 0) {
    const d = daysOfStock(col);
    if (d.c < LEAN_DAYS_C) colonyAlert(sim, 'food-c-low', 'warning', col.id, 'Carbohydrate stores low', `${d.c.toFixed(1)} days left`, 'diag-stores');
    if (d.p < LEAN_DAYS_P) colonyAlert(sim, 'food-p-low', 'warning', col.id, 'Protein stores low', `${d.p.toFixed(1)} days left`, 'diag-stores');
  }
  if (RANK[to] >= 3 && RANK[from] < 3) colonyAlert(sim, 'colony-starving', 'critical', col.id, 'The colony is starving', 'brood is being sacrificed', 'diag-stores');
  if (RANK[to] < 3 && RANK[from] >= 3) colonyClearAlert(sim, 'colony-starving', col.id);
  if (to === 'fed') {
    colonyClearAlert(sim, 'food-c-low', col.id);
    colonyClearAlert(sim, 'food-p-low', col.id);
  }
}
