// Season, day phase and the activity factor a of a rival colony (GDD 05 §3.2: 1 inside the species' surface
// temperature window at the nest and its active hours, 0 outside, 2 °C linear ramps).

import type { Season, Sim } from '@/sim/types';
import { ACTIVITY_RAMP_C, WARM_NIGHT_C } from '@/sim/balance/rivals';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import { calendarNow, surfaceTemp } from '@/sim/environment';
import { currentDayOfSeason, currentSeason } from '@/sim/time';
import { homeNest } from './setup';
import type { RivalColony } from './state';

export interface Clock {
  season: Season;
  dayOfSeason: number;
  /** Day phase is not `night`. */
  day: boolean;
  /** Night, dusk or dawn. */
  dark: boolean;
}

export function clockOf(sim: Sim): Clock {
  const cal = calendarNow(sim);
  return {
    season: currentSeason(sim.state), dayOfSeason: currentDayOfSeason(sim.state),
    day: cal.phase !== 'night', dark: cal.phase === 'night' || cal.phase === 'dusk' || cal.phase === 'dawn',
  };
}

/** 1 inside [lo, hi], falling linearly to 0 over ACTIVITY_RAMP_C beyond either end. */
export function tempActivity(t: number, lo: number, hi: number): number {
  const up = (t - (lo - ACTIVITY_RAMP_C)) / ACTIVITY_RAMP_C;
  const down = (hi + ACTIVITY_RAMP_C - t) / ACTIVITY_RAMP_C;
  return Math.max(0, Math.min(1, up, down));
}

function nestTemp(sim: Sim, col: RivalColony): number {
  const n = homeNest(sim, col);
  if (!n) return 20;
  try {
    const t = surfaceTemp(sim, n.origin);
    return Number.isFinite(t) ? t : 20;
  } catch {
    return 20;
  }
}

/** Activity a of a colony now (0 in winter). */
export function activityOf(sim: Sim, col: RivalColony, clock: Clock = clockOf(sim)): number {
  if (clock.season === 'winter') return 0;
  const p = rivalProfile(col.species);
  const t = nestTemp(sim, col);
  const aT = tempActivity(t, p.activityC[0], p.activityC[1]);
  let aTime: number;
  if (p.nocturnal) aTime = clock.dark ? 1 : 0;
  else aTime = clock.day ? 1 : p.warmNights && clock.season === 'summer' && t >= WARM_NIGHT_C ? 1 : 0;
  return aT * aTime;
}
