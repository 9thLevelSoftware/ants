// Adversarial checks of the Journal (task ui-panels review, GDD 08 7.2, task spec deliverable 3): range selection of every
// chart, the chart catalogue against the spec's list, the UI's own calendar maths against the sim's, and odd inputs.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { dateOf } from '@/game/uiBridge/panels';
import type { UiJournal } from '../../api';
import { buildChart, CHARTS } from './charts';
import { dateLine, layoutPins, timelineAxis, type Pin } from './timeline';

function journal(o: Partial<UiJournal> = {}): UiJournal {
  return {
    nowTick: 6000 * 20, startTick: 6000 * 14, seasonLength: 7, species: 'lasius-niger', aims: { current: [], done: [] }, entries: [], thumbs: {}, events: [],
    hourly: {}, daily: {}, dailyEndDay: 33, deaths: { total: 0, top: [] }, ...o,
  };
}
const chart = (id: string) => CHARTS.find((c) => c.id === id)!;

describe('range selection', () => {
  // Deaths are daily-only, so "3 days" must still mean the last 3 days, not a whole year of bars.
  it('deaths by cause with the "3 days" range shows at most 3 daily bars', () => {
    const j = journal({ daily: { 'deaths-by-cause:cold': Array.from({ length: 20 }, (_, i) => i % 3) } });
    const m = buildChart(chart('deaths'), j, '3d');
    expect(m.xs.length).toBeLessThanOrEqual(3);
  });

  it('"3 days" of an hourly chart never spans more than 3 days', () => {
    const j = journal({ hourly: { 'stores-c': Array.from({ length: 168 }, (_, i) => i) } });
    const m = buildChart(chart('stores'), j, '3d');
    expect(m.x1 - m.x0).toBeLessThanOrEqual(3 + 1e-9);
  });

  it('the year range follows a 10-day season (40 days), all keeps everything', () => {
    const j = journal({ seasonLength: 10, daily: { 'stores-c': Array.from({ length: 60 }, (_, i) => i) } });
    expect(buildChart(chart('stores'), j, 'year').xs.length).toBe(40);
    expect(buildChart(chart('stores'), j, 'all').xs.length).toBe(60);
  });
});

describe('the chart catalogue covers the spec', () => {
  // Task spec deliverable 3: "history graphs (population by caste, stores, intake by source, deaths by cause)". The
  // progression module records `intake-by-kind:<source>` and the journal slice even copies it, but no chart draws it.
  it('there is an intake-by-source chart over the intake-by-kind series', () => {
    const hasBySource = CHARTS.some((c) => c.prefix?.id === 'intake-by-kind:' || (c.series ?? []).some((s) => s.id.startsWith('intake-by-kind:')));
    expect(hasBySource).toBe(true);
  });
});

describe('calendar maths of the UI agree with the sim', () => {
  for (const seasonLengthDays of [5, 7, 10] as const) {
    it(`dateLine equals the sim's date for a ${seasonLengthDays}-day season`, () => {
      const sim = makeTestSim({ config: { rules: { ...makeTestSim().state.config.rules, seasonLengthDays } } });
      const j = { startTick: sim.state.env.calendar.startTick, seasonLength: sim.state.config.rules.seasonLengthDays };
      for (const tick of [0, 1, 5999, 6000, 6000 * 9 + 17, 6000 * 41, 6000 * 123 + 4000]) expect(dateLine(j, tick)).toBe(dateOf(sim, tick));
    });
  }
});

describe('timeline edge cases', () => {
  it('pins on the same day stack in separate lanes, never on top of each other', () => {
    const p = (id: number): Pin => ({ id, key: `ms-${id}`, tick: 0, day: 3, title: 'A long milestone title', text: '', thumb: null, lane: 0, date: '' });
    const laid = layoutPins([p(1), p(2), p(3)], 40, () => 120);
    expect(new Set(laid.map((x) => x.lane)).size).toBe(3);
  });

  it('a game on its first tick has one day on the axis', () => {
    const j = journal({ nowTick: 0 });
    const a = timelineAxis(j);
    expect(a.days.length).toBe(1);
    expect(a.bands.length).toBeGreaterThan(0);
  });
});

describe('odd data', () => {
  it('NaN samples in a series do not reach the axis', () => {
    const j = journal({ hourly: { 'stores-c': [1, Number.NaN, 3], 'stores-p': [0, 1, 2] } });
    const m = buildChart(chart('stores'), j, '3d');
    expect(m.y.ticks.every(Number.isFinite)).toBe(true);
  });

  it('negative temperatures get an axis below zero', () => {
    const j = journal({ hourly: { 'air-temp': [-6, -2, 3], 'nursery-temp': [4, 5, 6] } });
    const m = buildChart(chart('nest-temp'), j, '3d');
    expect(m.y.min).toBeLessThanOrEqual(-6);
  });
});
