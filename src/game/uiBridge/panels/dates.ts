// Date stamps of a tick for the panels ("Summer · Day 4 · Year 1", "Summer Day 4, 09:00"). Pure reads.
import { dayOfSeason, hourOf, seasonOf, yearOf } from '@/sim/time';
import type { CodexUnlock, Sim } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { DEFAULT_SEASON_LENGTH_DAYS } from '@/sim/balance';

const cap = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

/** Calendar tick of a state tick. */
export function calTickOf(sim: Sim, tick: number): number {
  return tick + sim.state.env.calendar.startTick;
}

/** "Spring · Day 2 · Year 1" (the form of the journal and the codex). */
export function dateOf(sim: Sim, tick: number): string {
  const t = calTickOf(sim, tick), cfg = sim.state.config;
  return `${cap(seasonOf(t, cfg))} · Day ${dayOfSeason(t, cfg)} · Year ${yearOf(t, cfg)}`;
}

/** "Summer Day 4, 09:00" (the "since" stamp of a diagnostic row). */
export function sinceOf(sim: Sim, tick: number): string {
  const t = calTickOf(sim, tick), cfg = sim.state.config;
  const h = hourOf(t), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${cap(seasonOf(t, cfg))} Day ${dayOfSeason(t, cfg)}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** The date line of a device codex unlock (its day of the year and year), "Spring · Day 2 · Year 1". The season length is the running game's, else the standard one. */
export function unlockLabel(u: Pick<CodexUnlock, 'doy' | 'year'>, seasonLength: number = DEFAULT_SEASON_LENGTH_DAYS): string {
  const len = Math.max(1, seasonLength);
  const d = Math.max(0, Math.floor(u.doy) - 1);
  const season = Math.min(SEASONS.length - 1, Math.floor(d / len));
  return `${cap(SEASONS[season])} · Day ${d - season * len + 1} · Year ${Math.max(1, Math.floor(u.year))}`;
}
