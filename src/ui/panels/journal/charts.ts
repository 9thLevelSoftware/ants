// The Journal's graphs, pure part (GDD 08 7.2, GDD 06 9.2): the chart catalogue, the sample window of a range
// (last 3 days from the hourly ring, the last year or everything from the daily series), series alignment, stacking,
// season bands for the x axis, and the cursor's value table. Series ids are the history ids of the progression module.
import { SEASON_WORD } from '@/content/text/words';
import type { UiJournal } from '../../api';
import { CHART_Y_TICKS } from '../balance';
import { niceScale, nearestIndex, type NiceScale } from './scales';

export type RangeId = '3d' | 'year' | 'all';
export const RANGES: readonly { id: RangeId; label: string }[] = [
  { id: '3d', label: '3 days' }, { id: 'year', label: 'Year' }, { id: 'all', label: 'All' },
];

export type ChartKind = 'stacked-area' | 'line' | 'stacked-bars';

export interface SeriesDef {
  /** History series id. */
  id: string;
  label: string;
  /** Letter that always travels with a nutrient series (colour is never the only carrier). */
  mark?: string;
}

export interface ChartDef {
  id: string;
  label: string;
  kind: ChartKind;
  /** y axis title with unit. */
  unit: string;
  /** Fixed series, or a prefix whose members are found in the data (`workers-by-caste:`). */
  series?: readonly SeriesDef[];
  prefix?: { id: string; label: (member: string) => string; order?: readonly string[] };
  /** Draw the y axis from 0 (default) or from the data minimum (temperatures). */
  fromZero?: boolean;
  /** Series that only exist as a daily value (deaths per day). */
  dailyOnly?: boolean;
}

const CASTE_LABEL: Record<string, string> = {
  worker: 'Workers', minor: 'Minors', media: 'Media workers', major: 'Majors', queen: 'Queen', gyne: 'Gynes', male: 'Males',
};
const CAUSE_LABEL = (c: string): string => c.replace(/-/g, ' ').replace(/^./, (s) => s.toUpperCase());
const KIND_LABEL = (k: string): string => k.replace(/-/g, ' ').replace(/^./, (s) => s.toUpperCase());

export const CHARTS: readonly ChartDef[] = [
  { id: 'population', label: 'Population by caste', kind: 'stacked-area', unit: 'ants', prefix: { id: 'workers-by-caste:', label: (m) => CASTE_LABEL[m] ?? m, order: ['worker', 'minor', 'media', 'major', 'queen', 'gyne', 'male'] } },
  { id: 'brood', label: 'Brood by stage', kind: 'stacked-area', unit: 'brood', series: [{ id: 'eggs', label: 'Eggs' }, { id: 'larvae', label: 'Larvae' }, { id: 'pupae', label: 'Pupae' }] },
  { id: 'stores', label: 'Stores', kind: 'line', unit: 'loads', series: [{ id: 'stores-c', label: 'Carbohydrate', mark: 'C' }, { id: 'stores-p', label: 'Protein', mark: 'P' }] },
  { id: 'intake', label: 'Intake per game day', kind: 'line', unit: 'loads per day', series: [{ id: 'intake-c', label: 'Carbohydrate', mark: 'C' }, { id: 'intake-p', label: 'Protein', mark: 'P' }] },
  { id: 'deaths', label: 'Deaths by cause', kind: 'stacked-bars', unit: 'ants per day', dailyOnly: true, prefix: { id: 'deaths-by-cause:', label: CAUSE_LABEL } },
  { id: 'nest-volume', label: 'Nest volume', kind: 'line', unit: 'BU³', series: [{ id: 'nest-volume', label: 'Open volume' }] },
  { id: 'nest-temp', label: 'Nest and surface temperature', kind: 'line', unit: '°C', fromZero: false, series: [{ id: 'nursery-temp', label: 'Nursery' }, { id: 'air-temp', label: 'Surface air' }] },
];
export { KIND_LABEL };

export interface ChartSeries {
  id: string;
  label: string;
  mark?: string;
  /** Raw values aligned to `xs`. */
  ys: number[];
  /** Cumulative top of the band for stacked kinds (same as ys for lines). */
  top: number[];
  /** Cumulative bottom of the band (0 for lines). */
  base: number[];
}

export interface SeasonBand {
  /** Calendar days (fractional), from inclusive, to exclusive. */
  from: number;
  to: number;
  /** 0..3 (SEASON_WORD order). */
  season: number;
  label: string;
}

export interface ChartModel {
  def: ChartDef;
  /** Calendar day of each sample (fractional days; ascending). */
  xs: number[];
  series: ChartSeries[];
  y: NiceScale;
  /** x axis ends in calendar days. */
  x0: number;
  x1: number;
  bands: SeasonBand[];
  /** True when the window had no samples at all. */
  empty: boolean;
  /** The data actually shown is hourly or daily samples. */
  scale: 'hourly' | 'daily';
  /** Calendar day of game day 1 (axis labels count game days from the start). */
  startDay: number;
}

const TICKS_PER_DAY = 6000;

/** Calendar day (fractional) of a tick. */
export function calDay(j: Pick<UiJournal, 'startTick'>, tick: number): number {
  return (tick + j.startTick) / TICKS_PER_DAY;
}

/** "Day 12": game days counted from the first day of the game. */
export function dayLabel(j: Pick<UiJournal, 'startTick'>, calendarDay: number): string {
  return `Day ${Math.floor(calendarDay) - Math.floor(j.startTick / TICKS_PER_DAY) + 1}`;
}

/** Season bands between two calendar days (the season length comes from the game config, never a literal 7). */
export function seasonBands(x0: number, x1: number, seasonLength: number): SeasonBand[] {
  const out: SeasonBand[] = [];
  if (!(x1 > x0) || !(seasonLength > 0)) return out;
  let s = Math.floor(x0 / seasonLength);
  for (let guard = 0; guard < 2000; guard++, s++) {
    const from = Math.max(x0, s * seasonLength), to = Math.min(x1, (s + 1) * seasonLength);
    if (from >= x1) break;
    if (to <= from) continue;
    const idx = ((s % 4) + 4) % 4;
    out.push({ from, to, season: idx, label: SEASON_WORD[idx] });
  }
  return out;
}

/** Members of a prefixed family present in the data, in the family's preferred order, then alphabetical. */
function members(j: UiJournal, prefix: string, order: readonly string[] = [], daily: boolean): string[] {
  const src = daily ? j.daily : j.hourly;
  const found = Object.keys(src).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  return found.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

/** The newest `n` values of a series, padded with zeros at the start when it is shorter (a series that began later). */
function tail(src: readonly number[] | undefined, n: number): number[] {
  const s = src ?? [];
  const cut = s.length > n ? s.slice(s.length - n) : s.slice();
  return cut.length < n ? [...new Array<number>(n - cut.length).fill(0), ...cut] : cut;
}

/**
 * The samples a range shows. 3 days: the last 72 hourly samples. Year / all: daily samples (the last `4 x season
 * length` days for the year); a game too young to have a daily sample falls back to the hourly ring (up to 7 days).
 */
export function windowOf(j: UiJournal, ids: readonly string[], range: RangeId, dailyOnly = false): { xs: number[]; scale: 'hourly' | 'daily'; cols: number[][] } {
  const hourlyLen = Math.max(0, ...ids.map((id) => (j.hourly[id] ?? []).length));
  const dailyLen = Math.max(0, ...ids.map((id) => (j.daily[id] ?? []).length));
  const useDaily = dailyOnly || (range !== '3d' && dailyLen >= 2);
  if (useDaily) {
    const cap = range === 'year' || range === '3d' ? Math.max(1, j.seasonLength * 4) : Number.MAX_SAFE_INTEGER;
    const n = Math.min(dailyLen, range === '3d' && !dailyOnly ? 3 : cap);
    const end = j.dailyEndDay + 0.5;
    return { xs: Array.from({ length: n }, (_, i) => end - (n - 1 - i)), scale: 'daily', cols: ids.map((id) => tail(j.daily[id], n)) };
  }
  const n = range === '3d' ? Math.min(hourlyLen, 72) : hourlyLen;
  const now = calDay(j, j.nowTick);
  return { xs: Array.from({ length: n }, (_, i) => now - (n - 1 - i) / 24), scale: 'hourly', cols: ids.map((id) => tail(j.hourly[id], n)) };
}

/** Builds a chart for the journal data and a range. */
export function buildChart(def: ChartDef, j: UiJournal, range: RangeId): ChartModel {
  const daily = !!def.dailyOnly;
  let defs: SeriesDef[];
  if (def.prefix) {
    const pre = def.prefix;
    // a family is found in the data of the scale the window will use
    const found = members(j, pre.id, pre.order, daily || range !== '3d').length ? members(j, pre.id, pre.order, daily || range !== '3d') : members(j, pre.id, pre.order, false);
    defs = found.map((m) => ({ id: `${pre.id}${m}`, label: pre.label(m) }));
    // a family lists only what exists: a caste or a cause with no ant in the window stays out of the legend
    const w0 = windowOf(j, defs.map((d) => d.id), range, daily);
    defs = defs.filter((_, k) => (w0.cols[k] ?? []).some((v) => v > 0));
  } else defs = [...(def.series ?? [])];
  const w = windowOf(j, defs.map((d) => d.id), range, daily);
  const stacked = def.kind !== 'line';
  const run = new Array<number>(w.xs.length).fill(0);
  const series: ChartSeries[] = defs.map((d, k) => {
    const ys = w.cols[k] ?? [];
    const base = stacked ? run.slice() : ys.map(() => 0);
    const top = ys.map((v, i) => (stacked ? run[i] + Math.max(0, v) : v));
    if (stacked) for (let i = 0; i < ys.length; i++) run[i] += Math.max(0, ys[i]);
    return { id: d.id, label: d.label, mark: d.mark, ys, top, base };
  });
  const all = series.flatMap((s) => s.top);
  const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
  const y = niceScale(lo, hi, CHART_Y_TICKS, def.fromZero !== false);
  const half = w.scale === 'daily' ? 0.5 : 0;
  const x0 = w.xs.length ? w.xs[0] - half : calDay(j, j.nowTick) - 1;
  const x1 = w.xs.length ? w.xs[w.xs.length - 1] + half : calDay(j, j.nowTick);
  return {
    def, xs: w.xs, series, y, x0, x1, bands: seasonBands(x0, x1, j.seasonLength), empty: w.xs.length === 0 || series.length === 0,
    scale: w.scale, startDay: Math.floor(j.startTick / TICKS_PER_DAY),
  };
}

export interface CursorRow {
  id: string;
  label: string;
  mark?: string;
  value: number;
}

/** The value table at the sample nearest to calendar day `x`. */
export function cursorAt(m: ChartModel, x: number): { index: number; x: number; rows: CursorRow[] } | null {
  const i = nearestIndex(m.xs, x);
  if (i < 0) return null;
  return { index: i, x: m.xs[i], rows: m.series.map((s) => ({ id: s.id, label: s.label, mark: s.mark, value: s.ys[i] ?? 0 })) };
}
