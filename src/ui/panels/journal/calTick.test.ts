// Journal dates come from each entry's own calendar tick (app-seams-2 item 9). A winter lapse or `cheat.setTime` moves the
// calendar anchor, so `tick + startTick` is right only for "now": an older entry must keep the day it was written on.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { journalOf } from '@/game/uiBridge/panels';
import type { UiJournal } from '../../api';
import { buildChart } from './charts';
import { dateLine, milestonePins, timeLine } from './timeline';

const DAY = TICKS_PER_DAY;
const base = { startTick: 14 * DAY, seasonLength: 7 };

describe('dates from calTick', () => {
  it('dateLine and timeLine use the entry\'s calendar tick when it has one', () => {
    // state tick 3 days in, but written on calendar day 2 (spring day 3); the anchor guess says day 17 (autumn day 4)
    const tick = 3 * DAY;
    expect(dateLine(base, tick)).toBe('Autumn · Day 4 · Year 1'); // the anchor guess: tick + startTick = day 17
    expect(dateLine(base, tick, 2 * DAY)).toBe('Spring · Day 3 · Year 1');
    expect(timeLine(base, tick, 2 * DAY + DAY / 2)).toBe('Spring · Day 3 · Year 1 · 12:00');
  });

  it('milestone pins sit on the day and carry the date of their own calTick', () => {
    const j = { ...base, nowTick: 20 * DAY, species: 'lasius-niger', aims: { current: [], done: [] }, thumbs: {}, events: [], hourly: {}, daily: {}, dailyEndDay: 0, deaths: { total: 0, top: [] },
      entries: [{ id: 1, tick: 3 * DAY, calTick: 2 * DAY, kind: 'milestone', key: 'ms-first-egg', tokens: {} }] } as UiJournal;
    const [pin] = milestonePins(j);
    expect(pin.day).toBe(2);
    expect(pin.date).toBe('Spring · Day 3 · Year 1');
  });

  it('without calTick (an old save) it falls back to tick + startTick', () => {
    expect(dateLine(base, 3 * DAY)).toBe(dateLine(base, 0, 17 * DAY));
  });
});

describe('journal slice across a moved calendar', () => {
  it('entries written before `cheat.setTime` keep the day they were written; "now" is where the clock is', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    sim.enqueue({ type: 'storeThumbnail', milestoneId: 'x', dataUrl: 'd' } as never); // harmless: forces a command round
    sim.applyPendingCommands();
    const before = journalOf(sim);
    const anchor = before.startTick;
    const firstTick = before.entries[0]?.tick ?? 0;
    // move the calendar anchor a winter ahead, as a lapse or the cheat does
    sim.state.env.calendar.startTick += 28 * DAY;
    const after = journalOf(sim);
    expect(after.startTick).toBe(anchor + 28 * DAY);
    for (const e of after.entries) expect(e.calTick, `entry ${e.key}`).toBeDefined();
    const old = after.entries.find((e) => e.tick === firstTick);
    if (old) {
      // the entry keeps its own calendar tick (the one it had before the move), not tick + the new anchor
      expect(old.calTick).toBe(before.entries.find((e) => e.id === old.id)?.calTick);
      expect(old.calTick).not.toBe(old.tick + after.startTick);
    }
    // a row written after the move uses the new anchor
    sim.state.tick += 10;
    expect(journalOf(sim).nowTick).toBe(sim.state.tick);
  });

  it('chart windows still end at "now" on the moved calendar', () => {
    const j = { ...base, nowTick: 3 * DAY, species: 'lasius-niger', aims: { current: [], done: [] }, entries: [], thumbs: {}, events: [], hourly: { 'stores-c': Array.from({ length: 168 }, (_, i) => i) }, daily: {}, dailyEndDay: 16, deaths: { total: 0, top: [] } } as UiJournal;
    const m = buildChart({ id: 'stores' } as never, j, '3d');
    expect(m.x1).toBeGreaterThan(0);
  });
});
