// Which calendar day each daily history sample summarises (for the epitaph's graph). The colony economy files one
// daily sample at each calendar day rollover; the calendar jumps over the winter (and with time cheats), so samples
// are not one per calendar day. The tracker remembers the economy's current day at each check: the samples that
// appear by the next check summarise that day.

import type { Colony, Sim } from '@/sim/types';
import { coreOf } from '../core';
import { lifecycleOf } from './lifecycleState';

/** The series whose samples are tracked (all daily colony series are filed together). */
export const TRACKED_SERIES = 'workers';

export function trackDailySamples(sim: Sim, col: Colony): void {
  const s = lifecycleOf(col).succession;
  const n = sim.state.progression.history.daily[TRACKED_SERIES]?.length ?? 0;
  const days = (s.sampleDays ??= []);
  const ticks = (s.sampleTicks ??= []);
  if (days.length > n) { days.length = n; ticks.length = n; } // history was reset
  const known = s.trackDay ?? -1;
  while (days.length < n) {
    // only the newest sample can be dated: the ones before it were filed before tracking started
    const newest = days.length === n - 1 && known >= 0;
    days.push(newest ? known : -1);
    ticks.push(newest ? sim.state.tick : -1);
  }
  s.trackDay = coreOf(col).day;
}
