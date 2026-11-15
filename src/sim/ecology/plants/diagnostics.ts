// Diagnostics inputs of the herds (GDD 07 §6.1.6 `diag-herds`, GDD 05 App. D `diag-honeydew`): numbers per colony
// for the Why view, and a published `diag-herds` record for the player colony (the honeydew module of a later
// stage may refine it; it reads the same inputs).

import type { Colony, Diagnostic, DiagnosticFactor, DiagnosticStatus, Sim } from '@/sim/types';
import { tsAt } from '@/core/timeSeries';
import { kEff, productionPerGd, tendersNeeded } from './herdMath';
import { herdWorkable } from './demand';
import { growthRate, isDormantSeason, phaseName } from './season';
import { tendersPresent } from './tending';
import { yieldToday } from './yield';

export interface HerdDiagInputs {
  /** Herds the colony claims (tenderColony) / works (known, in range, not avoided). */
  claimed: number;
  workable: number;
  /** Known herds held by a tending rival. */
  rivalClaims: number;
  /** Aphids on the claimed herds. */
  aphids: number;
  /** Mean tend of the claimed herds (0 with none). */
  meanTend: number;
  /** Tenders needed (ceil(A/50) summed) and present now at the claimed herds. */
  tendersNeeded: number;
  tendersPresent: number;
  /** Claimed herds with a predator on them. */
  predatorHerds: number;
  /** Claimed herds on a mown host. */
  mownHerds: number;
  /** Mean host quality of the claimed herds (1 with none). */
  hostQuality: number;
  /** Production of the claimed herds now, loads/gd, and what full tending would give. */
  productionPerGd: number;
  productionTendedPerGd: number;
  /** Honeydew taken today so far and the last closed days (newest last), loads. */
  yieldToday: number;
  yieldDays: number[];
  /** Herd season phase ('spring growth' ... 'dormant') and whether the herds are past their peak. */
  phase: string;
  declining: boolean;
}

export function herdDiagInputs(sim: Sim, col: Colony, d28: number, fT: number): HerdDiagInputs {
  const r: HerdDiagInputs = {
    claimed: 0, workable: 0, rivalClaims: 0, aphids: 0, meanTend: 0, tendersNeeded: 0, tendersPresent: 0,
    predatorHerds: 0, mownHerds: 0, hostQuality: 1, productionPerGd: 0, productionTendedPerGd: 0,
    yieldToday: yieldToday(sim, col), yieldDays: [], phase: phaseName(d28), declining: growthRate(d28) < 0 || isDormantSeason(d28),
  };
  let tend = 0, q = 0;
  for (const h of sim.stores.herds.list) {
    if (!h.alive) continue;
    const works = herdWorkable(sim, col, h);
    if (works) r.workable++;
    if (h.tenderColony !== col.id) {
      if (h.tenderColony >= 0 && h.a >= 1) r.rivalClaims += works ? 0 : 1;
      continue;
    }
    r.claimed++;
    r.aphids += h.a;
    tend += h.tend;
    q += h.hostQuality;
    r.tendersNeeded += h.a >= 1 ? tendersNeeded(h.a) : 0;
    r.tendersPresent += tendersPresent(sim, h, col.id);
    if (h.predators.length > 0) r.predatorHerds++;
    if (h.mownUntilTick > sim.state.tick) r.mownHerds++;
    r.productionPerGd += productionPerGd(h.a, h.tend, fT);
    r.productionTendedPerGd += productionPerGd(Math.min(h.a, kEff(h, sim.state.tick)), 1, fT);
  }
  if (r.claimed > 0) { r.meanTend = tend / r.claimed; r.hostQuality = q / r.claimed; }
  const ts = col.honeydew?.yieldHistory;
  if (ts) for (let i = Math.max(0, ts.len - 3); i < ts.len; i++) r.yieldDays.push(tsAt(ts, i) ?? 0);
  return r;
}

function status(i: HerdDiagInputs): DiagnosticStatus {
  const lostAll = i.claimed === 0 && !i.declining && i.yieldDays.some((v) => v > 0);
  if (lostAll) return 'bad';
  const d = i.yieldDays;
  const falling = d.length === 3 && d[0] > d[1] && d[1] > d[2];
  return falling || (i.claimed > 0 && i.meanTend < 0.5) ? 'warn' : 'ok';
}

/**
 * GDD 07 §6.1.6: raise the `tend` slider (the `tend` sub-share inside Forage), a `forage` marker on a herd, possess a
 * worker and chase the predator (a tender: `tend` guards its herd). Ids follow 00-index §B `remedy.slider.<group>` /
 * `remedy.possess.<task>`. "Move aphids" and shelters are Tier 3 (not offered yet).
 */
const HERD_REMEDIES: readonly string[] = ['remedy.slider.tend', 'remedy.marker.forage', 'remedy.possess.tend'];

/** The `diag-herds` record of a colony (factors weighted by the shortfall each causes, summing to 1). */
export function herdDiagnostic(sim: Sim, col: Colony, d28: number, fT: number): Diagnostic {
  const i = herdDiagInputs(sim, col, d28, fT);
  const raw: [string, number, string][] = [
    ['tenders-short', i.claimed > 0 ? 1 - i.meanTend : 0, `${i.tendersPresent} of ${i.tendersNeeded} tenders at the herds`],
    ['predators', i.claimed > 0 ? i.predatorHerds / i.claimed : 0, `predators at ${i.predatorHerds} herds`],
    ['season', i.declining ? 1 : 1 - i.hostQuality, i.phase],
    ['host-damage', i.claimed > 0 ? i.mownHerds / i.claimed : 0, `${i.mownHerds} hosts mown`],
    ['rival-claims', i.rivalClaims > 0 ? Math.min(1, i.rivalClaims / Math.max(1, i.claimed + i.rivalClaims)) : 0, `${i.rivalClaims} herds held by rivals`],
  ];
  const sum = raw.reduce((s, f) => s + f[1], 0);
  const factors: DiagnosticFactor[] = raw.filter((f) => f[1] > 0)
    .map(([cause, w, detail]) => ({ cause, weight: w / sum, detail, diagId: null }))
    .sort((a, b) => b.weight - a.weight);
  return {
    id: 'diag-herds', system: 'ecology', status: status(i), label: 'Aphid herds', value: i.yieldToday, factors,
    remedies: [...HERD_REMEDIES], sinceTick: -1, focus: null,
  };
}
