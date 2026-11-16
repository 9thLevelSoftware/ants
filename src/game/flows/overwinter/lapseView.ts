// The winter time-lapse's presentation (GDD 06 §6.4): the result is already computed (the Winter record), the
// lapse only plays it back. `progress` 0..1 maps to the winter's days; watching and skipping show the same record
// and change nothing in the simulation. Pure: no DOM, no three.
import type { WinterRecord } from '@/sim/types';
import { OVERWINTER_STILLS } from '@/sim/balance/lifecycle';
import type { WinterLapseUi } from '@/ui/screens/overwinter/store';

export function winterLapseView(rec: WinterRecord, progress: number, reducedMotion: boolean, skipping: boolean): WinterLapseUi {
  const days = Math.max(1, rec.days.length);
  const p = Math.min(1, Math.max(0, progress));
  const still = Math.min(OVERWINTER_STILLS - 1, Math.floor(p * OVERWINTER_STILLS));
  // reduced motion: OVERWINTER_STILLS crossfaded stills, each showing one day spread over the winter
  const idx = reducedMotion
    ? Math.round((still * (days - 1)) / Math.max(1, OVERWINTER_STILLS - 1))
    : Math.min(days - 1, Math.floor(p * days));
  const d = rec.days[idx];
  const frostSoFar = rec.days.slice(0, idx + 1).filter((x) => x.frost).length;
  // the day counter is the winter's own: after "Delay one day" the lapse starts on a later winter day
  const first = Math.max(1, rec.firstWinterDay ?? 1);
  return {
    progress: p, day: first + idx, days: first - 1 + days,
    workers: d ? d.workers : rec.workers1, larvae: d ? d.larvae : rec.larvae1,
    c: d ? d.c : rec.c1, p: d ? d.p : rec.p1, tMean: d ? d.tMean : rec.coldestC, frost: d ? d.frost : false,
    beat: d ? d.beat : '', frostSoFar, reducedMotion, still,
    skipping,
  };
}
