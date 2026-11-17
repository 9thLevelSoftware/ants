// The viable verdict of a colony-life run (viab-economy task; it replaces the gate's "healthy" verdict for that
// task's acceptance, the strict verdict of lifeHealth.ts is reported beside it). A run is viable when, with no player
// input, at the first tick of Winter 1 (`--until winter`):
// - the queen is alive;
// - workers >= VIABLE_WORKER_SHARE x the first workers;
// - no worker died of starvation;
// - no starvation stage worse than lean (rationing, brood sacrifice, adult starvation) lasted over VIABLE_BAD_STAGE_GD
//   at a stretch (sampled every StuckSampler.SAMPLE_S game seconds);
// - the stores (ruling R27, Nov 17 19:05) cover the winter stores need: the lapse's own C need at the cluster
//   temperature + 4 gd of the adults' C need (overwinter/storesNeed.ts, read from the last day state); a report
//   written before R27 has no such field and keeps the old check, >= VIABLE_STORE_GD gd of the adults' C need.

import type { LifeReport } from './life';

export const VIABLE_WORKER_SHARE = 0.8;
export const VIABLE_BAD_STAGE_GD = 1;
export const VIABLE_STORE_GD = 1;

export interface ViableVerdict {
  viable: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

/** Trips started per worker per game day over the colony-life days (mean of the daily ratios). */
export function tripsPerWorkerDay(r: LifeReport): number {
  const live = r.days.slice(1).filter((d) => d.state.workers > 0);
  if (live.length === 0) return 0;
  return live.reduce((a, d) => a + d.events.tripsStarted / d.state.workers, 0) / live.length;
}

/** Trips started per outside worker (forage, scout, tend at the day end) per game day, over days with any. */
export function tripsPerForagerDay(r: LifeReport): number {
  const live = r.days.slice(1).map((d) => ({ d, n: (d.state.byTask.forage ?? 0) + (d.state.byTask.scout ?? 0) + (d.state.byTask.tend ?? 0) }))
    .filter((x) => x.n > 0);
  if (live.length === 0) return 0;
  return live.reduce((a, x) => a + x.d.events.tripsStarted / x.n, 0) / live.length;
}

/** Deaths of the player colony by caste:cause over the colony-life days. */
export function deathsByCause(r: LifeReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of r.days.slice(1)) for (const [k, v] of Object.entries(d.events.deathsByCause)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function judgeViable(r: LifeReport): ViableVerdict {
  const checks: ViableVerdict['checks'] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const last = r.days[r.days.length - 1]?.state;
  const handed = r.founding.phase === 'handover' || r.founding.phase === 'done';
  // a forced seal (life.ts fallback when the real founding fails) still judges the economy; the detail says so
  add('hand-over', handed, `${r.founding.phase} after ${r.founding.gd} gd${r.founding.forcedSeal ? ` (forced seal; real founding ${r.founding.forcedSeal})` : ''}`);
  if (r.options.untilWinter) add('winter reached', last?.season === 'winter', `ended in ${last?.season ?? '-'} on day ${last?.day ?? '-'}`);
  add('queen alive', !!last?.queenAlive, last?.queenAlive ? 'alive' : 'dead');
  const w0 = r.founding.workers, w1 = last?.workers ?? 0;
  add('workers', w0 > 0 && w1 >= VIABLE_WORKER_SHARE * w0, `${w0} -> ${w1} (need >= ${(VIABLE_WORKER_SHARE * w0).toFixed(1)})`);
  const deaths = deathsByCause(r);
  const starved = deaths['worker:starvation'] ?? 0;
  add('no worker starved', starved === 0, `${starved} workers died of starvation`);
  const bad = r.economy?.longestBadStageGd ?? 0;
  add('starvation stage', bad <= VIABLE_BAD_STAGE_GD, `longest stretch worse than lean ${bad.toFixed(2)} gd`);
  const need = last?.adultNeedC ?? 0, c = last?.storesC ?? 0;
  const days = need > 0 ? c / need : 0;
  const r27 = last?.winterStoresNeedC;
  if (r27 !== undefined && r27 > 0) {
    add('stores', c >= r27, `C ${c} for the R27 winter need ${r27} (lapse ${last?.lapseNeedC ?? '-'} + 4 gd x ${need}) = ` +
      `${(c / r27).toFixed(2)} of it (P ${last?.storesP ?? 0})`);
  } else {
    add('stores', need > 0 && days >= VIABLE_STORE_GD, `C ${c} for an adult need of ${need} C/gd = ${days.toFixed(2)} gd (P ${last?.storesP ?? 0}; pre-R27 check)`);
  }
  return { viable: checks.every((x) => x.ok), checks };
}
