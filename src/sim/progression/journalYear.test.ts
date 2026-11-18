// sim-seams item 2: journal dates across the winter lapse. The lapse moves the calendar anchor (startTick) to spring
// day 1 without moving `tick`, so a date derived later from `tick` shifts every older entry by the winter's length.
// Entries carry the calendar tick they were written at; the winter notice and the spring return get entries.
import { describe, expect, it } from 'vitest';
import type { Sim, System } from '@/sim/types';
import { JOURNAL_CAP } from '@/sim/balance';
import { calendarSystem } from '@/sim/environment/calendar';
import { calendarTickAt, currentDayOfYear, currentSeason, currentYear, ticksPerYear } from '@/sim/time';
import { makeLifeSim, send, step } from '@/sim/colony/succession/testLife';
import { attachProgression, progressionSystem } from './index';
import { addJournal, entryDate, SEASON_SUMMARY_KEY } from './journal';

/** The lifecycle test colony (overwinter system, established queen, workers, stores) plus calendar and progression. */
function winterSim(): Sim {
  const sim = makeLifeSim({ chamberC: 6, c: 12, p: 5 });
  const list = sim.systems as System[];
  list.splice(1, 0, calendarSystem); // after commands, as in the game
  list.push(progressionSystem);
  attachProgression(sim);
  return sim;
}

interface Seen { id: number; year: number; doy: number; key: string }

/** Records the date each entry was written at (from the calendar at that moment). */
function watchDates(sim: Sim): Seen[] {
  const seen: Seen[] = [];
  sim.events.on('journal.entry', (e) => {
    const entry = sim.state.progression.journal.entries.find((x) => x.id === e.entryId)!;
    seen.push({ id: e.entryId, year: currentYear(sim.state), doy: currentDayOfYear(sim.state), key: entry.key ?? '' });
  });
  return seen;
}

function lapse(sim: Sim): void {
  send(sim, { type: 'cheat.triggerWinter' });
  expect(sim.state.env.winter.phase).toBe('banner');
  send(sim, { type: 'overwinterChoice', choice: 'begin' });
  expect(currentSeason(sim.state)).toBe('spring');
  send(sim, { type: 'overwinterChoice', choice: 'close-report' });
}

describe('journal dates across two winters', () => {
  it('every entry keeps the day and year it was written on; notice, report and spring return are entries', () => {
    const sim = winterSim();
    const seen = watchDates(sim);
    const y1 = currentYear(sim.state);
    addJournal(sim, 'event', 'test.summer-1');
    step(sim, 1);
    lapse(sim);
    expect(currentYear(sim.state)).toBe(y1 + 1);
    step(sim, 300);
    addJournal(sim, 'event', 'test.spring-2');
    step(sim, 1);
    // the winter notice (autumn day 6, 12:00) of year 2: a normal day, reached by the clock cheat
    send(sim, { type: 'cheat.setTime', tick: y1 * ticksPerYear(sim.state.config) + calendarTickAt('autumn', 6, 11.99, sim.state.config) });
    step(sim, 30);
    lapse(sim);
    expect(currentYear(sim.state)).toBe(y1 + 2);
    step(sim, 300);

    const entries = sim.state.progression.journal.entries;
    expect(seen.length).toBe(entries.length);
    for (const s of seen) {
      const e = entries.find((x) => x.id === s.id)!;
      expect(entryDate(sim, e), `${s.key} #${s.id}`).toMatchObject({ year: s.year, doy: s.doy });
    }
    const keys = seen.map((s) => `${s.key}@${s.year}`);
    expect(keys).toContain(`test.summer-1@${y1}`);
    expect(keys).toContain(`test.spring-2@${y1 + 1}`);
    expect(keys).toContain(`event.winter-notice@${y1 + 1}`);
    // both lapses: the report, then the spring note of the new year (the calendar emits no time.season after the jump)
    for (const y of [y1 + 1, y1 + 2]) {
      expect(keys, `report and spring of ${y}`).toContain(`winter-report@${y}`);
      expect(keys).toContain(`season.0@${y}`);
      expect(keys.filter((k) => k === `season.0@${y}`)).toHaveLength(1);
    }
  });

  it('a full timeline merges the notes of the year they were written in, not of a tick-derived year', () => {
    const sim = winterSim();
    const y1 = currentYear(sim.state);
    addJournal(sim, 'weather', 'weather.rain');
    addJournal(sim, 'season', 'season.1');
    lapse(sim);
    step(sim, 300);
    send(sim, { type: 'cheat.setTime', tick: y1 * ticksPerYear(sim.state.config) + calendarTickAt('autumn', 6, 11.99, sim.state.config) });
    lapse(sim); // now spring of year 3; from `tick` alone year 1's notes would read as late year 2
    const fills = JOURNAL_CAP - sim.state.progression.journal.entries.length;
    for (let i = 0; i < fills; i++) addJournal(sim, 'event', 'test.fill');
    addJournal(sim, 'event', 'test.overflow');
    const entries = sim.state.progression.journal.entries;
    const summary = entries.find((e) => e.key === SEASON_SUMMARY_KEY);
    expect(summary?.tokens?.year).toBe(y1);
    expect(entryDate(sim, summary!).year).toBe(y1);
    expect(entries.some((e) => e.key === 'weather.rain' || e.key === 'season.1')).toBe(false);
    // the spring notes of years 2 and 3 are not merged into year 1
    expect(entries.filter((e) => e.key === 'season.0').map((e) => entryDate(sim, e).year)).toEqual([y1 + 1, y1 + 2]);
  });

});
