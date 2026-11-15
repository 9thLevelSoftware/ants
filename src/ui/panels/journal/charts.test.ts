// Journal graphs: scales, axes, windows by range, stacking and season bands (task ui-panels, GDD 08 7.2).
import { describe, expect, it } from 'vitest';
import type { UiJournal } from '../../api';
import { buildChart, CHARTS, cursorAt, dayLabel, seasonBands, windowOf } from './charts';
import { linear, nearestIndex, niceScale, niceStep, tickLabel, valueText } from './scales';

function journal(o: Partial<UiJournal> = {}): UiJournal {
  return {
    nowTick: 6000 * 3, startTick: 6000 * 14, seasonLength: 7, species: 'lasius-niger', aims: { current: [], done: [] }, entries: [], thumbs: {}, events: [],
    hourly: {}, daily: {}, dailyEndDay: 16, deaths: { total: 0, top: [] }, ...o,
  };
}
const ramp = (n: number, k = 1): number[] => Array.from({ length: n }, (_, i) => (i + 1) * k);

describe('scales', () => {
  it('nice steps are 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceStep(0.9)).toBe(1);
    expect(niceStep(1.3)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(37)).toBe(50);
    expect(niceStep(0)).toBe(1);
  });
  it('a value axis starts at 0 and ends on a tick at or above the data maximum', () => {
    const s = niceScale(3, 87, 4);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(87);
    expect(s.ticks[0]).toBe(0);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
    expect(s.ticks.length).toBeLessThanOrEqual(8);
  });
  it('a temperature axis can start at the data minimum', () => {
    const s = niceScale(12, 27, 4, false);
    expect(s.min).toBeLessThanOrEqual(12);
    expect(s.min).toBeGreaterThan(0);
  });
  it('a flat series still gets a usable axis', () => {
    const s = niceScale(5, 5, 4);
    expect(s.max).toBeGreaterThan(s.min);
    expect(s.ticks.length).toBeGreaterThan(1);
  });
  it('non-finite input falls back to 0..1', () => {
    expect(niceScale(Number.NaN, 3).ticks[0]).toBe(0);
  });
  it('linear maps ends, and a flat domain to the middle', () => {
    const f = linear(0, 10, 100, 200);
    expect([f(0), f(5), f(10)]).toEqual([100, 150, 200]);
    expect(linear(3, 3, 0, 10)(3)).toBe(5);
  });
  it('tick and value labels are short and unit-free', () => {
    expect(tickLabel(250, 50)).toBe('250');
    expect(tickLabel(0.5, 0.25)).toBe('0.50');
    expect(tickLabel(0.25, 0.25)).toBe('0.25');
    expect(tickLabel(2.5, 2.5)).toBe('2.5');
    expect(tickLabel(12000, 2000)).toBe('12k');
    expect(valueText(3.14159)).toBe('3.14');
    expect(valueText(1234.5)).toBe('1235');
  });
  it('the nearest sample to a day', () => {
    expect(nearestIndex([1, 2, 3, 4], 2.4)).toBe(1);
    expect(nearestIndex([1, 2, 3, 4], 9)).toBe(3);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});

describe('windows', () => {
  it('3 days takes the last 72 hourly samples, ending now, one hour apart', () => {
    const j = journal({ hourly: { eggs: ramp(168) } });
    const w = windowOf(j, ['eggs'], '3d');
    expect(w.scale).toBe('hourly');
    expect(w.xs).toHaveLength(72);
    expect(w.cols[0][71]).toBe(168);
    expect(w.xs[71]).toBeCloseTo((j.nowTick + j.startTick) / 6000, 6);
    expect(w.xs[1] - w.xs[0]).toBeCloseTo(1 / 24, 6);
  });
  it('year uses daily samples, at most four seasons of them; all uses every one', () => {
    const j = journal({ daily: { eggs: ramp(60) }, hourly: { eggs: ramp(168) } });
    expect(windowOf(j, ['eggs'], 'year').xs).toHaveLength(28);
    expect(windowOf(j, ['eggs'], 'all').xs).toHaveLength(60);
    expect(windowOf(j, ['eggs'], 'all').xs[59]).toBe(j.dailyEndDay + 0.5);
  });
  it('the year length follows the configured season length', () => {
    const j = journal({ seasonLength: 5, daily: { eggs: ramp(60) } });
    expect(windowOf(j, ['eggs'], 'year').xs).toHaveLength(20);
  });
  it('a game too young for daily samples falls back to the hourly ring', () => {
    const j = journal({ daily: { eggs: [4] }, hourly: { eggs: ramp(30) } });
    const w = windowOf(j, ['eggs'], 'all');
    expect(w.scale).toBe('hourly');
    expect(w.xs).toHaveLength(30);
  });
  it('a series that began later is padded with zeros at the start', () => {
    const j = journal({ hourly: { a: ramp(10), b: ramp(4) } });
    const w = windowOf(j, ['a', 'b'], '3d');
    expect(w.cols[1]).toEqual([0, 0, 0, 0, 0, 0, 1, 2, 3, 4]);
  });
});

describe('charts', () => {
  it('stacks bands: each top is the running sum, each base the one below', () => {
    const j = journal({ hourly: { eggs: [1, 2, 3], larvae: [4, 5, 6], pupae: [0, 0, 1] } });
    const m = buildChart(CHARTS.find((c) => c.id === 'brood')!, j, '3d');
    expect(m.series.map((s) => s.top)).toEqual([[1, 2, 3], [5, 7, 9], [5, 7, 10]]);
    expect(m.series[1].base).toEqual([1, 2, 3]);
    expect(m.y.max).toBeGreaterThanOrEqual(10);
    expect(m.y.min).toBe(0);
  });
  it('population by caste finds the castes in the data, workers first', () => {
    const j = journal({ hourly: { 'workers-by-caste:queen': [1, 1], 'workers-by-caste:worker': [5, 6], 'workers-by-caste:major': [0, 1] } });
    const m = buildChart(CHARTS[0], j, '3d');
    expect(m.series.map((s) => s.label)).toEqual(['Workers', 'Majors', 'Queen']);
  });
  it('lines are not stacked and carry the nutrient letter', () => {
    const j = journal({ hourly: { 'stores-c': [3, 4], 'stores-p': [1, 2] } });
    const m = buildChart(CHARTS.find((c) => c.id === 'stores')!, j, '3d');
    expect(m.series.map((s) => s.mark)).toEqual(['C', 'P']);
    expect(m.series[1].top).toEqual([1, 2]);
    expect(m.series[1].base).toEqual([0, 0]);
  });
  it('deaths by cause are daily bars whatever the range', () => {
    const j = journal({ daily: { 'deaths-by-cause:cold': [0, 2, 1], 'deaths-by-cause:old-age': [1, 0, 0] } });
    const m = buildChart(CHARTS.find((c) => c.id === 'deaths')!, j, '3d');
    expect(m.scale).toBe('daily');
    expect(m.series.map((s) => s.label)).toEqual(['Cold', 'Old age']);
    expect(m.series[1].top).toEqual([1, 2, 1]);
  });
  it('a chart with no data is empty, not broken', () => {
    const m = buildChart(CHARTS[0], journal(), '3d');
    expect(m.empty).toBe(true);
    expect(m.y.ticks.length).toBeGreaterThan(1);
  });
  it('the cursor reads every series at the nearest sample', () => {
    const j = journal({ hourly: { 'stores-c': [3, 4, 5], 'stores-p': [1, 2, 3] } });
    const m = buildChart(CHARTS.find((c) => c.id === 'stores')!, j, '3d');
    const c = cursorAt(m, m.xs[1] + 0.001)!;
    expect(c.index).toBe(1);
    expect(c.rows.map((r) => r.value)).toEqual([4, 2]);
  });
  it('day labels count game days from the first day', () => {
    const j = journal();
    expect(dayLabel(j, 14)).toBe('Day 1');
    expect(dayLabel(j, 16.7)).toBe('Day 3');
  });
});

describe('season bands', () => {
  it('splits the axis at season boundaries of the configured length', () => {
    const b = seasonBands(5, 20, 7);
    expect(b.map((x) => [x.from, x.to, x.label])).toEqual([[5, 7, 'Spring'], [7, 14, 'Summer'], [14, 20, 'Autumn']].map(([a, c, l]) => [a, c, l]));
  });
  it('follows a different season length and wraps around the year', () => {
    const b = seasonBands(18, 32, 5);
    expect(b.map((x) => x.label)).toEqual(['Winter', 'Spring', 'Summer', 'Autumn']);
    expect(b[0].from).toBe(18);
    expect(b[b.length - 1].to).toBe(32);
  });
  it('an empty or reversed range has no bands', () => {
    expect(seasonBands(3, 3, 7)).toEqual([]);
    expect(seasonBands(5, 3, 7)).toEqual([]);
  });
});

describe('intake by source', () => {
  const chart = CHARTS.find((c) => c.id === 'intake-source')!;
  it('stacks one band per food kind found in the data, named in words, and leaves out kinds that never arrived', () => {
    const j = journal({ hourly: { 'intake-by-kind:honeydew': [1, 2, 3], 'intake-by-kind:pet-food': [0, 0, 0], 'intake-by-kind:prey': [2, 2, 2] } });
    const m = buildChart(chart, j, '3d');
    expect(m.series.map((s) => s.label)).toEqual(['Honeydew', 'Prey']);
    expect(m.series[1].top).toEqual([3, 4, 5]);
    expect(m.def.kind).toBe('stacked-area');
  });
  it('the daily scale serves the year range', () => {
    const j = journal({ daily: { 'intake-by-kind:seed': ramp(10) } });
    expect(buildChart(chart, j, 'year').series.map((s) => s.id)).toEqual(['intake-by-kind:seed']);
  });
});

describe('day labels agree with the date lines', () => {
  it('count the day of the season, as "Summer · Day 3 · Year 1" does', async () => {
    const { dateLine, timelineAxis } = await import('./timeline');
    const j = journal({ startTick: 6000 * 9, nowTick: 6000 * 12, seasonLength: 7 });
    // calendar day 9 is the 3rd day of summer, whichever way the game started
    expect(dateLine(j, 0)).toBe('Summer · Day 3 · Year 1');
    expect(dayLabel(j, 9)).toBe('Day 3');
    const axis = timelineAxis(j);
    expect(axis.days[0].label).toBe('Day 3');
    expect(axis.days[0].major).toBe(true);
    // the next labelled tick is the first day of autumn (calendar day 14), not "every 5 days"
    const j2 = journal({ startTick: 6000 * 9, nowTick: 6000 * 8, seasonLength: 7 });
    expect(timelineAxis(j2).days.filter((d) => d.major).map((d) => d.label)).toEqual(['Day 3', 'Day 1']);
  });
});
