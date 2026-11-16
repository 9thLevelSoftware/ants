// The Winter Report (GDD 06 §6.5): the record kept on the colony, the numbers the `overwinter.report` event and
// `env.winter.report` carry, and the "Why" ranking of the losses (diagnostic style: cause, weight, numbers, remedy id).

import type { WinterRecord, WinterWhy } from '@/sim/types';
import type { WinterOutcome } from './model';

/** Remedy id per loss cause (worded by the interface). */
const REMEDY: Record<string, string> = {
  cold: 'dig-deeper', starvation: 'stock-before-winter', disease: 'drier-chamber', drowning: 'raise-entrance',
  outdoors: 'recall-foragers', 'old-age': 'none',
};

export interface WhyInputs {
  coldestC: number;
  coldestDepthBu: number;
  humidity: number;
  starvedDays: number;
  floods: number;
}

/** The top 3 causes of the winter's worker losses, weights summing to 1 over the causes shown. */
export function rankWhy(losses: Record<string, number>, w: WhyInputs): WinterWhy[] {
  const total = Object.values(losses).reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const rows = Object.entries(losses).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
  return rows.map(([cause, n]): WinterWhy => ({
    cause, n, weight: n / total, remedy: REMEDY[cause] ?? 'none',
    detail: (cause === 'cold' ? { tMin: round1(w.coldestC), depthBu: Math.round(w.coldestDepthBu) }
      : cause === 'starvation' ? { days: round1(w.starvedDays) }
        : cause === 'disease' ? { humidity: round1(w.humidity * 100) }
          : cause === 'drowning' ? { floods: w.floods } : {}) as Record<string, number>,
  }));
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Numbers of the `overwinter.report` event and `env.winter.report` (keys read by the journal: workersLost ...). */
export function reportNumbers(r: WinterRecord): Record<string, number> {
  const lost = r.workers0 - r.workers1;
  const out: Record<string, number> = {
    year: r.year, workers0: r.workers0, workers1: r.workers1, workersLost: lost, larvae0: r.larvae0, larvae1: r.larvae1,
    storesC0: r.c0, storesC1: r.c1, storesP0: r.p0, storesP1: r.p1, storesUsedC: round1(r.c0 - r.c1),
    storesUsedP: round1(r.p0 - r.p1), daysLeft: round1(r.daysLeft), queenAlive: r.queenAlive ? 1 : 0,
    coldestC: round1(r.coldestC), coldestDepthBu: Math.round(r.coldestDepthBu), frostNights: r.frostNights,
    heaviestRainMm: round1(r.heaviestRainMm), floods: r.floods,
  };
  for (const [k, n] of Object.entries(r.losses)) out[k] = n;
  return out;
}

/** Brood-stage totals helper for the record. */
export function sumLosses(o: WinterOutcome): number {
  return Object.values(o.losses).reduce((a, b) => a + b, 0);
}
