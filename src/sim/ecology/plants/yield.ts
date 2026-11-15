// Honeydew yield per colony per game day (persisted in Colony.honeydew, so a loaded game keeps counting): the
// droplets taken from herds. Closed days go into Colony.honeydew.yieldHistory (the diag-herds sparkline).

import type { Colony, Sim } from '@/sim/types';
import { tsPush } from '@/core/timeSeries';
import { TICKS_PER_DAY } from '@/sim/time';

function dayNow(sim: Sim): number {
  return Math.floor(sim.state.tick / TICKS_PER_DAY);
}

/** Closes the colony's yield day when a new game day has begun (empty days in between count as 0). */
export function rollYield(sim: Sim, col: Colony): void {
  const m = col.honeydew;
  if (!m) return;
  const today = dayNow(sim);
  const day = m.yieldDay ?? -1;
  if (day < 0) { m.yieldDay = today; m.yieldTodayC = 0; return; }
  if (day >= today) return;
  tsPush(m.yieldHistory, m.yieldTodayC ?? 0);
  for (let d = day + 1; d < today && d < day + 1 + m.yieldHistory.cap; d++) tsPush(m.yieldHistory, 0);
  m.yieldDay = today;
  m.yieldTodayC = 0;
}

/** Adds honeydew taken from a herd by an ant of the colony. */
export function noteYield(sim: Sim, colonyId: number, c: number): void {
  const col = sim.stores.colonies.get(colonyId);
  if (!col?.honeydew || !(c > 0)) return;
  rollYield(sim, col);
  col.honeydew.yieldTodayC = (col.honeydew.yieldTodayC ?? 0) + c;
}

/** Honeydew taken today so far, loads. */
export function yieldToday(sim: Sim, col: Colony): number {
  const m = col.honeydew;
  return m && (m.yieldDay ?? -1) === dayNow(sim) ? m.yieldTodayC ?? 0 : 0;
}
