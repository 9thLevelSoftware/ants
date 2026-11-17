// Daily counters of the granary module (seed loads in, loads milled, paste used) for diagnostics: today's running
// sums and yesterday's totals, rolled at the first step of each game day.

import type { GranaryModule, Sim } from '@/sim/types';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';

export function rollDayCounters(sim: Sim, mod: GranaryModule): void {
  const day = Math.floor(sim.state.tick / TICKS_PER_DAY);
  if (mod.counterDay === day) return;
  const fresh = mod.counterDay === undefined || mod.counterDay < 0;
  mod.milledYesterday = fresh ? 0 : mod.milledToday ?? 0;
  mod.seedInYesterday = fresh ? 0 : mod.seedInToday ?? 0;
  mod.pasteUseYesterday = fresh ? 0 : mod.pasteUseToday ?? 0;
  // the summer-lull reference: the mean daily seed intake of the spring days lived (GDD 07 §5.3.7)
  if (!fresh && currentSeason(sim.state) === 'spring') {
    const n = (mod.springDays ?? 0) + 1;
    mod.springSeedMean = ((mod.springSeedMean ?? 0) * (n - 1) + (mod.seedInYesterday ?? 0)) / n;
    mod.springDays = n;
  }
  mod.milledToday = 0;
  mod.seedInToday = 0;
  mod.pasteUseToday = 0;
  mod.counterDay = day;
}

/** Fraction of today that has passed, 0..1 (to read today's running sums as a rate). */
export function dayFraction(sim: Sim): number {
  return (sim.state.tick % TICKS_PER_DAY) / TICKS_PER_DAY;
}

/** A per-game-day rate from yesterday's total and today's running sum, weighted by the time elapsed today. */
export function dailyRate(sim: Sim, today: number | undefined, yesterday: number | undefined): number {
  const f = dayFraction(sim);
  const t = today ?? 0, y = yesterday ?? 0;
  return f > 0.25 ? t / f : y * (1 - f) + t;
}
