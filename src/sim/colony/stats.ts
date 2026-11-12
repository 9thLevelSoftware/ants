// Population accounting and time series of the player colony (GDD 02 §13): hourly samples into a 168-sample
// ring per series and one value per game day for the colony's life (progression.history). Flow series sample the
// count since the previous sample; level series sample the current value (intake and use are per-gd rates over
// the last hour, so their daily mean is the day's amount). Daily values: mean of the hourly
// level samples, sum of the flow samples. The daily ledger is filed under `ledger:<key>` at each day rollover.

import { tsCreate, tsPush } from '@/core/timeSeries';
import type { Colony, Sim } from '@/sim/types';
import { ALLOCATION_GROUPS, STARVATION_STAGES } from '@/sim/types';
import { HOURLY_HISTORY_CAP } from '@/sim/balance';
import { HOURS_PER_DAY } from '@/sim/time';
import { accGet, accSet, coreOf, type LedgerKey } from './core';
import { censusOf, colonyChambers } from './census';
import { chamberTempC } from './envAdapter';
import { queenOf } from './queen';

/** Series that accumulate a flow per hour (summed per day); every other series is a level (averaged per day). */
const FLOW_SERIES = new Set([
  'eggs-laid', 'eclosions', 'deaths', 'brood-deaths', 'trips', 'trip-success',
]);

function push(sim: Sim, id: string, v: number): void {
  const h = sim.state.progression.history;
  let ts = h.hourly[id];
  if (!ts) { ts = tsCreate(HOURLY_HISTORY_CAP); h.hourly[id] = ts; }
  tsPush(ts, v);
  const core = coreOf(sim.state.colonies[0]);
  core.acc[`day.${id}`] = (core.acc[`day.${id}`] ?? 0) + v;
  core.acc[`day.n.${id}`] = (core.acc[`day.n.${id}`] ?? 0) + 1;
}

/** Difference of a cumulative counter since the last sample. */
function delta(col: Colony, key: string, now: number): number {
  const core = coreOf(col);
  const prev = accGet(core, `last.${key}`);
  accSet(core, `last.${key}`, now);
  return Math.max(0, now - prev);
}

/** One hourly sample of the player colony (colonies[0]). */
export function sampleHour(sim: Sim): void {
  const col = sim.state.colonies[0];
  if (!col || !col.alive) return;
  const cen = censusOf(sim, col.id);
  const c = col.counters;
  const life = coreOf(col).life;
  push(sim, 'workers', cen.workers);
  for (const g of ALLOCATION_GROUPS) push(sim, `workers-by-group:${g}`, col.groupCounts[g]);
  push(sim, 'queen-alive', queenOf(sim, col) ? 1 : 0);
  push(sim, 'eggs', cen.eggs);
  push(sim, 'larvae', cen.larvae);
  push(sim, 'pupae', cen.pupae);
  push(sim, 'stores-c', col.stores.c);
  push(sim, 'stores-p', col.stores.p);
  // Rates per gd over the last hour.
  push(sim, 'intake-c', delta(col, 'inC', life.inDeliveryC) * HOURS_PER_DAY);
  push(sim, 'intake-p', delta(col, 'inP', life.inDeliveryP) * HOURS_PER_DAY);
  push(sim, 'use-c', delta(col, 'useC', life.outWorkersC + life.outQueenC + life.outLarvaeC + life.outRationC) * HOURS_PER_DAY);
  push(sim, 'use-p', delta(col, 'useP', life.outQueenP + life.outLarvaeP) * HOURS_PER_DAY);
  push(sim, 'eggs-laid', delta(col, 'eggs', c.eggsLaid));
  push(sim, 'eclosions', delta(col, 'ecl', c.eclosions));
  push(sim, 'deaths', delta(col, 'deaths', c.deaths));
  push(sim, 'brood-deaths', delta(col, 'bdeaths', c.broodDeaths));
  const trips = delta(col, 'trips', c.trips);
  push(sim, 'trips', trips);
  push(sim, 'trip-success', delta(col, 'tripOk', c.tripSuccesses));
  const tt = delta(col, 'tripTicks', c.tripTicks);
  push(sim, 'trip-time', trips > 0 ? tt / trips / 10 : 0);
  const nursery = colonyChambers(sim, col).find((ch) => ch.type === 'nursery');
  push(sim, 'nursery-temp', nursery ? chamberTempC(sim, nursery.id) : chamberTempC(sim, -1));
  push(sim, 'known-sources', col.knownSourceIds.length);
  push(sim, 'trails', accGet(coreOf(col), 'trails'));
  push(sim, 'starvation-stage', STARVATION_STAGES.indexOf(col.starvationStage));
  sim.state.progression.history.lastHourlyTick = sim.state.tick;
  sim.state.progression.peakWorkers = Math.max(sim.state.progression.peakWorkers, cen.workers);
}

/** Files the finished day: daily series values and the daily ledger (player colony). */
export function fileDay(sim: Sim, col: Colony): void {
  if (col !== sim.state.colonies[0]) return;
  const h = sim.state.progression.history;
  const core = coreOf(col);
  for (const key of Object.keys(core.acc)) {
    if (!key.startsWith('day.') || key.startsWith('day.n.')) continue;
    const id = key.slice(4);
    const n = core.acc[`day.n.${id}`] ?? 0;
    const v = FLOW_SERIES.has(id) || id.startsWith('ledger') ? core.acc[key] : n > 0 ? core.acc[key] / n : 0;
    (h.daily[id] ??= []).push(v);
    core.acc[key] = 0;
    core.acc[`day.n.${id}`] = 0;
  }
  for (const k of Object.keys(col.ledger) as (LedgerKey | 'dayStartTick')[]) {
    if (k === 'dayStartTick') continue;
    (h.daily[`ledger:${k}`] ??= []).push(col.ledger[k]);
  }
  h.lastDailyTick = sim.state.tick;
}
