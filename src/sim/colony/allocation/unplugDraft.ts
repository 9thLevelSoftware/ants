// The unplug draft (task opening-fix, with the unplug floor of targets.ts): while a closed nest's plug is short of
// the diggers the floor targets, each allocation pass moves that many workers (the floor's shortfall, never more)
// that are home and over their own task's target straight to `dig`. GDD 02 §6.5 moves ants only at the end of a task cycle or by the 120 s surplus
// check, whose slack (actual > 1.2 x target + 1) never fires in a colony of four: on the seed-4 opening the forager
// waiting in the cell and the store post kept their tasks for 8 game hours after the hand-over while the floor
// targeted two diggers and the plug lay untouched (R14: the entrance open within 4 game hours of the hand-over).
// Nurses are never drafted (integrator ruling 1: the floor must not starve the brood).

import { ti } from '../taskIdx';
import type { Colony, Sim, SpeciesDef } from '@/sim/types';
import { reassignable, switchTask } from './assign';
import { eligible, thresholdBand } from './groups';

/** Drafts diggers for the plug while the unplug floor (`unplug` > 0) is short; ants in id order (deterministic). */
export function draftUnplugDiggers(sim: Sim, col: Colony, def: SpeciesDef, unplug: number): number {
  if (unplug <= 0) return 0;
  const di = ti('dig'), ni = ti('nurse');
  // only the floor's own diggers are drafted: a dig target above it (a plan's demand) fills the usual way, at the
  // end of task cycles, so the draft never pulls a forager off her first trips for ordinary digging
  let short = Math.min(unplug, col.alloc.target[di]) - col.alloc.actual[di], drafted = 0;
  for (const a of sim.stores.ants.list) {
    if (short <= 0) break;
    if (a.colony !== col.id || a.nestId === -1 || !reassignable(a)) continue;
    const i = ti(a.task);
    if (i === di || i === ni || col.alloc.actual[i] <= col.alloc.target[i]) continue;
    if (!eligible(a, 'dig', thresholdBand(a, sim.state.tick), def)) continue;
    switchTask(sim, col, a, 'dig', 'deficit:dig');
    short--;
    drafted++;
  }
  return drafted;
}
