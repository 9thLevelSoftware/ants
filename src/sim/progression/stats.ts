// Progression's statistics series (GDD 06 §9.2, registry B6) into progression.history: one sample per game hour
// into the 168-sample ring per series, one value per game day (never discarded). The colony module samples its own
// GDD 02 §13.2 series (workers, brood, stores, intake-c/p, ...); this file adds the rest: workers-by-caste,
// alates, intake-by-kind, deaths-by-cause, air-temp (+ daily min / max), nest-volume, nest-chambers, range-max,
// queen-reserves. Multi-valued series are stored per member as `<id>:<member>`.
// Continuity: when ticks were skipped (time set by a cheat, a load into a later tick) the missing hours and days are
// filled with the last values, so every series has exactly one sample per hour and per day.

import { tsCreate, tsLast, tsPush } from '@/core/timeSeries';
import type { Sim } from '@/sim/types';
import { CASTES } from '@/sim/types';
import { HOURLY_HISTORY_CAP } from '@/sim/balance';
import { airTemp } from '@/sim/environment';
import { calendarTick, dayOf, HOURS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { censusOf, engineOf, memGet, memSet, playerColony } from './engine';
import { playerNests } from './triggers';

/** Series summed per day (counts per hour); every other series is averaged per day. */
const FLOW_PREFIXES = ['deaths-by-cause:'];
/** Series whose daily file also keeps the day's minimum and maximum. */
const MIN_MAX = new Set(['air-temp']);

const isFlow = (id: string): boolean => FLOW_PREFIXES.some((p) => id.startsWith(p));

/** Adds to an event accumulator that the next hourly sample reads and resets (e.g. `intake-by-kind:honeydew`). */
export function accumulate(sim: Sim, seriesId: string, v: number): void {
  const acc = engineOf(sim).hourAcc;
  acc[seriesId] = (acc[seriesId] ?? 0) + v;
}

function pushHourly(sim: Sim, id: string, v: number): void {
  const h = sim.state.progression.history;
  let ts = h.hourly[id];
  if (!ts) { ts = tsCreate(HOURLY_HISTORY_CAP); h.hourly[id] = ts; }
  tsPush(ts, v);
  const day = engineOf(sim).dayAcc;
  const a = day[id] ?? (day[id] = [0, 0, v, v]);
  a[0] += v; a[1]++; a[2] = Math.min(a[2], v); a[3] = Math.max(a[3], v);
}

/** Current values of every progression series. */
function currentValues(sim: Sim): Record<string, number> {
  const out: Record<string, number> = {};
  const census = censusOf(sim);
  for (const c of CASTES) out[`workers-by-caste:${c}`] = census.byCaste[c] ?? 0;
  out.alates = (census.byCaste.gyne ?? 0) + (census.byCaste.male ?? 0);
  out['air-temp'] = airTemp(sim);
  const nests = playerNests(sim);
  out['nest-volume'] = nests.reduce((v, n) => v + n.volumeOpen, 0);
  out['nest-chambers'] = nests.reduce((v, n) => v + n.chambers.length, 0);
  out['range-max'] = rangeMaxBu(sim);
  out['queen-reserves'] = queenReserves(sim);
  // event accumulators: intake as a per-day rate over the hour, deaths as counts in the hour
  const acc = engineOf(sim).hourAcc;
  for (const k of Object.keys(acc)) out[k] = k.startsWith('intake-by-kind:') ? acc[k] * HOURS_PER_DAY : acc[k];
  // series seen before keep a sample (0) in hours without events
  for (const k of Object.keys(sim.state.progression.history.hourly)) {
    if ((k.startsWith('intake-by-kind:') || k.startsWith('deaths-by-cause:')) && out[k] === undefined) out[k] = 0;
  }
  return out;
}

/**
 * Farthest point of the colony's range, BU: the worker outside the nest farthest from its nearest entrance (stands
 * for "farthest trail point from an entrance", GDD 06 §9.2; trail cells are not scanned every hour).
 */
function rangeMaxBu(sim: Sim): number {
  const col = playerColony(sim);
  if (!col) return 0;
  const entrances = playerNests(sim).flatMap((n) => n.entrances);
  if (entrances.length === 0) return 0;
  let best = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.nestId >= 0 || a.medium === 'cavity') continue;
    let d = Infinity;
    for (const e of entrances) d = Math.min(d, Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z));
    if (d > best) best = d;
  }
  return best / sim.world.bu;
}

/** Founding: reserves as a share of R0 (0..1). Afterwards: the queen's fat and protein reserve, loads. 0 = no queen. */
function queenReserves(sim: Sim): number {
  const col = playerColony(sim);
  const q = col ? sim.stores.ants.get(col.queenId) : undefined;
  if (!q || !q.alive || !q.queen) return 0;
  const f = q.queen.founding;
  if (f) return f.R0 > 0 ? Math.max(0, f.reserveLoads) / f.R0 : 0;
  return q.queen.reserve + q.queen.reserveP;
}

/** Files the accumulated day into history.daily (mean or sum; min / max where kept). */
function fileDay(sim: Sim): void {
  const daily = sim.state.progression.history.daily;
  const acc = engineOf(sim).dayAcc;
  for (const id of Object.keys(acc)) {
    const [sum, n, min, max] = acc[id];
    (daily[id] ??= []).push(isFlow(id) ? sum : n > 0 ? sum / n : 0);
    if (MIN_MAX.has(id)) {
      (daily[`${id}:min`] ??= []).push(n > 0 ? min : 0);
      (daily[`${id}:max`] ??= []).push(n > 0 ? max : 0);
    }
  }
  engineOf(sim).dayAcc = {};
}

/** Repeats the last filed day for days that were skipped. */
function repeatLastDay(sim: Sim): void {
  const daily = sim.state.progression.history.daily;
  for (const id of Object.keys(daily)) if (daily[id].length > 0 && ownsDaily(id)) daily[id].push(daily[id][daily[id].length - 1]);
}

const OWN_PREFIXES = ['workers-by-caste:', 'intake-by-kind:', 'deaths-by-cause:', 'air-temp'];
const OWN_IDS = new Set(['alates', 'nest-volume', 'nest-chambers', 'range-max', 'queen-reserves']);
/** True for a series this file samples (the colony module's series are left alone). */
export function ownsDaily(id: string): boolean {
  return OWN_IDS.has(id) || OWN_PREFIXES.some((p) => id.startsWith(p));
}

/** One hourly sample (and the daily file at the first sample of a new day), with gap filling. */
export function sampleProgressionHour(sim: Sim): void {
  const now = sim.state.tick;
  const last = memGet(sim, 'statsTick', -1);
  const day = dayOf(calendarTick(sim.state));
  const lastDay = memGet(sim, 'statsDay', day);
  if (lastDay !== day) {
    fileDay(sim);
    for (let d = lastDay + 1; d < day; d++) repeatLastDay(sim);
  }
  const values = currentValues(sim);
  const missed = last < 0 ? 0 : Math.min(HOURLY_HISTORY_CAP, Math.floor((now - last) / TICKS_PER_HOUR) - 1);
  const hourly = sim.state.progression.history.hourly;
  for (let i = 0; i < missed; i++) {
    for (const id of Object.keys(values)) {
      const ts = hourly[id];
      tsPush(ts ?? (hourly[id] = tsCreate(HOURLY_HISTORY_CAP)), ts ? tsLast(ts) : values[id]);
    }
  }
  for (const id of Object.keys(values)) pushHourly(sim, id, values[id]);
  const eng = engineOf(sim);
  eng.hourAcc = {};
  const w = sim.state.env.weather.state;
  eng.seasonWeather[w] = (eng.seasonWeather[w] ?? 0) + 1;
  memSet(sim, 'statsTick', now);
  memSet(sim, 'statsDay', day);
}
