// Counts that can be one, and the journal wording of every key the progression module writes (review fixes).
import { describe, expect, it } from 'vitest';
import { ALERT_KINDS, HUMAN_EVENT_KINDS, MILESTONE_IDS, AIM_IDS } from '@/sim/types';
import {
  ALERT_TEXT, EVENT_ENTRY, FLIGHT_ENTRY, SEASON_ENTRY, alertText, formatText, journalEntryText, templateTokens, weatherChangeText,
} from './index';
import { wordingProblems } from '../codex/banned';

describe('count wording: {n:one|many}', () => {
  it('prints the number with the singular only for exactly 1', () => {
    const t = '{n:ant|ants}';
    expect(formatText(t, { n: 1 })).toBe('1 ant');
    expect(formatText(t, { n: '1' })).toBe('1 ant');
    expect(formatText(t, { n: 0 })).toBe('0 ants');
    expect(formatText(t, { n: 2 })).toBe('2 ants');
    expect(formatText(t, { n: 0.5 })).toBe('0.5 ants');
  });

  it('lets the form carry the verb and leaves a missing token as written', () => {
    expect(formatText('Only {n:ant remains|ants remain}', { n: 1 })).toBe('Only 1 ant remains');
    expect(formatText('Only {n:ant remains|ants remain}', { n: 3 })).toBe('Only 3 ants remain');
    expect(formatText('{n:ant|ants}')).toBe('{n:ant|ants}');
  });

  it('counts the plural token as the token n for templateTokens', () => {
    expect(templateTokens('{a:x|y} {b} {a}')).toEqual(['a', 'b']);
  });

  it('reads correctly in the alerts and the reports for one', () => {
    expect(alertText('last-ants', { n: 1, cause: 'cold' }).title).toBe('Only 1 ant remains');
    expect(alertText('last-ants', { n: 3, cause: 'cold' }).title).toBe('Only 3 ants remain');
    expect(alertText('food-p-low', { larvae: 1, p: '0.3' }).cause).toBe('1 larva, 0.3 P stored');
    expect(weatherChangeText('rain', 1).cause).toBe('within 1 game hour');
    expect(alertText('alates-ready', { n: 1 }).cause).toBe('1 winged ant');
    expect(formatText(FLIGHT_ENTRY.text, { launched: 1, mated: 1, daughters: 1 })).toBe('1 winged ant left the nest. 1 queen mated, and 1 began a nest of their own.');
  });

  it('keeps every alert within its length rules when a count is one', () => {
    for (const kind of ALERT_KINDS) {
      const a = alertText(kind, { ...ALERT_TEXT[kind].sample, n: 1, larvae: 1, h: 1, days: 1, winterDays: 1 });
      expect(a.title.length, kind).toBeLessThanOrEqual(48);
      expect(a.cause.length, kind).toBeLessThanOrEqual(72);
    }
  });
});

describe('journal wording of every key progression writes', () => {
  it('words the queen loss with the death-cause clause', () => {
    expect(journalEntryText('loss.queen', { cause: 'old-age' })).toEqual({ title: 'The queen has died', text: 'The queen died of old age.' });
    expect(journalEntryText('loss.queen', { cause: 'predation' })!.text).toBe('The queen was taken by a predator.');
    expect(journalEntryText('loss.queen', { cause: 'not-a-cause' })!.text).toBe('The queen died of an unknown cause.');
  });

  it('words a loss entry with a cause noun and a place', () => {
    expect(journalEntryText('loss', { n: 6, cause: 'heat', where: 'lawn' })!.text).toBe(
      '6 ants died within a quarter of a game day, most of them from heat on the lawn.',
    );
    expect(journalEntryText('loss', { n: 5, cause: 'cold', where: 'nest' })!.text).toContain('from cold in the nest.');
    expect(journalEntryText('loss', { n: 5, cause: 'cold', where: 'nowhere' })!.text).toContain('in the nest.');
  });

  it('words the per-year summary and the season note with the weather in words', () => {
    expect(journalEntryText('season-summary', { year: 2, seasons: 4, weather: 1 })).toEqual({
      title: 'Notes of year 2',
      text: 'The 4 season notes and 1 weather note of year 2 were folded into this line.',
    });
    const s = journalEntryText('season.1', { workers: 12, brood: 30, c: 2.5, p: 1, weather: 'rain' })!;
    expect(s.title).toBe(SEASON_ENTRY[1].title);
    expect(s.text).toContain('The season was rain.');
  });

  it('words the winter report in both forms and the events', () => {
    expect(journalEntryText('winter-report', { n: 1, cold: 1, starvation: 0, c: 3, p: 1 })!.text).toContain('Lost 1 worker (');
    expect(journalEntryText('winter-report', { n: 0, cold: 0, starvation: 0, c: 3, p: 1 })!.text).toContain('No workers were lost');
    expect(journalEntryText('event.flood')!.title).toBe(EVENT_ENTRY.flood.title);
    expect(journalEntryText('event.raid', { n: 1 })!.text).toBe('A party of 1 rival worker has set out for the nest.');
  });

  it('has wording for every milestone, aim, human event and fixed key; and none for an unknown key', () => {
    const keys = [
      ...MILESTONE_IDS, ...AIM_IDS, ...HUMAN_EVENT_KINDS.map((k) => `event.human.${k}`),
      'stage.founding', 'stage.first-workers', 'stage.growing', 'stage.mature',
      'season.0', 'season.1', 'season.2', 'season.3', 'weather.rain', 'weather.storm', 'weather.heat', 'weather.frost',
      'loss', 'loss.queen', 'season-summary', 'winter-report', 'flight', 'event.flood', 'event.raid', 'event.winter-notice',
    ];
    for (const k of keys) {
      const w = journalEntryText(k, {});
      expect(w, k).not.toBeNull();
      expect(w!.text.length, k).toBeGreaterThan(5);
      expect(wordingProblems(`${w!.title}. ${w!.text}`), k).toEqual([]);
    }
    expect(journalEntryText('event.human.nope')).toBeNull();
    expect(journalEntryText('stage.nope')).toBeNull();
    expect(journalEntryText('mystery')).toBeNull();
  });
});
