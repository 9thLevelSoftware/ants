// Custom rules: validation, defaults, incompatibilities and application at game creation, including the season
// length (5 / 7 / 10) and the starting season (difficulty-rules AC4).

import { describe, expect, it } from 'vitest';
import type { DifficultyId, SeasonLengthDays, SpeciesId } from '@/sim/types';
import { SPECIES_IDS } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { DIFFICULTY_PARAMS, resolveRules } from '@/sim/balance';
import { makeTestWorld } from '@/sim/testing';
import {
  calendarTick, dayOfSeason, daysPerYear, defaultYearDay, inDefaultYearWindow, scaleDoy, seasonOf, ticksPerYear,
  TICKS_PER_DAY, yearOf, currentDayOfSeason, currentSeason,
} from '@/sim/time';
import { applyPreset, applyRules, defaultRules, GENERATION_RULES, naturalStart, normalizeCustomRules, ruleNotes, startFor } from './rules';

const PRESETS: readonly DifficultyId[] = ['gentle', 'naturalist', 'harsh'];

describe('normalizeCustomRules', () => {
  it('keeps valid overrides and drops unknown rules and invalid values with an issue each', () => {
    const r = normalizeCustomRules({ predators: 'off', rivals: 9, humanActivity: 'loud', bogus: 1, collapse: false, seasonLengthDays: 6 });
    expect(r.custom).toEqual({ predators: 'off', collapse: false });
    expect(r.issues.map((i) => i.key).sort()).toEqual(['bogus', 'humanActivity', 'rivals', 'seasonLengthDays']);
    expect(r.issues.every((i) => i.reason === 'unknown-or-invalid')).toBe(true);
  });

  it('undefined and null input are no overrides; a non-object is one issue', () => {
    expect(normalizeCustomRules(undefined)).toEqual({ custom: {}, issues: [] });
    expect(normalizeCustomRules(null)).toEqual({ custom: {}, issues: [] });
    expect(normalizeCustomRules([1]).issues).toHaveLength(1);
    expect(normalizeCustomRules('predators').issues).toHaveLength(1);
    expect(normalizeCustomRules({ predators: undefined }).custom).toEqual({});
  });

  it('mid-game the rules fixed at generation are refused', () => {
    const r = normalizeCustomRules({ seasonLengthDays: 10, startSeason: 'autumn', rivals: 0, predators: 'few' }, true);
    expect(r.custom).toEqual({ predators: 'few' });
    expect(r.issues.map((i) => i.reason)).toEqual(['fixed-at-generation', 'fixed-at-generation', 'fixed-at-generation']);
    expect([...GENERATION_RULES].sort()).toEqual(['rivals', 'seasonLengthDays', 'startSeason']);
  });

  it('winter is never a starting season', () => {
    expect(normalizeCustomRules({ startSeason: 'winter' }).custom).toEqual({});
  });
});

describe('defaults and incompatibilities', () => {
  it('defaultRules is the preset\'s rules with the given season length', () => {
    for (const p of PRESETS) {
      expect(defaultRules(p)).toEqual(resolveRules(p, {}, 7));
      expect(defaultRules(p, 10).seasonLengthDays).toBe(10);
    }
    expect(defaultRules('naturalist')).toMatchObject({ predators: 'normal', rivals: 3, humanActivity: 'normal', weatherSeverity: 'normal', startSeason: 'natural' });
  });

  it('ruleNotes names the rules that make other rules moot', () => {
    expect(ruleNotes(defaultRules('naturalist'))).toEqual([]);
    const rules = { ...defaultRules('harsh'), humanActivity: 'off', predators: 'off', weatherSeverity: 'none' } as const;
    expect(ruleNotes(rules).map((n) => n.key).sort()).toEqual(['humanActivity', 'predators', 'weatherSeverity']);
  });
});

describe('applyRules at game creation', () => {
  it('with no rules it returns exactly the default config, for every species and preset', () => {
    for (const species of SPECIES_IDS) {
      for (const preset of PRESETS) {
        const base = defaultGameConfig(species, 3, preset);
        const { config, issues } = applyRules(base, {});
        expect(issues).toEqual([]);
        expect(config).toEqual(base);
      }
    }
  });

  it('the preset\'s parameters are copied (not shared) and the overrides are recorded as custom', () => {
    const base = defaultGameConfig('lasius-niger', 1, 'harsh');
    const { config } = applyRules(base, { predators: 'few', collapse: false });
    expect(config.difficulty.preset).toBe('harsh');
    expect(config.difficulty.params).toEqual(DIFFICULTY_PARAMS.harsh);
    expect(config.difficulty.params).not.toBe(DIFFICULTY_PARAMS.harsh);
    expect(config.difficulty.custom).toEqual({ predators: 'few', collapse: false });
    expect(config.rules).toMatchObject({ predators: 'few', collapse: false, rivals: 4 });
  });

  it('the rival count and human activity reach the world generator\'s copies', () => {
    const base = defaultGameConfig('lasius-niger', 1, 'naturalist');
    const { config } = applyRules(base, { rivals: 0, humanActivity: 'off' });
    expect(config.rules.rivals).toBe(0);
    expect(config.world).toMatchObject({ difficulty: 'naturalist', rivalCount: 0, incipientCount: DIFFICULTY_PARAMS.naturalist.incipientRivals, humanActivity: 'off' });
  });

  it('applyPreset swaps the preset (params and rules) and keeps what the player overrides', () => {
    const base = defaultGameConfig('lasius-niger', 1, 'naturalist');
    const { config } = applyPreset(base, 'gentle', { humanActivity: 'high' });
    expect(config.difficulty.preset).toBe('gentle');
    expect(config.difficulty.params).toEqual(DIFFICULTY_PARAMS.gentle);
    expect(config.rules).toMatchObject({ rivals: 2, predators: 'few', collapse: false, humanActivity: 'high' });
    expect(config.world.difficulty).toBe('gentle');
  });

  it('invalid overrides are reported and ignored, the game still gets a valid config', () => {
    const base = defaultGameConfig('lasius-niger', 1, 'naturalist');
    const { config, issues } = applyRules(base, { predators: 'swarm', rivals: 2 });
    expect(issues.map((i) => i.key)).toEqual(['predators']);
    expect(config.rules.predators).toBe('normal');
    expect(config.rules.rivals).toBe(2);
  });
});

describe('season length 5 / 7 / 10 (AC4)', () => {
  const LENGTHS: readonly SeasonLengthDays[] = [5, 7, 10];

  it('the year is 20 / 28 / 40 days and every season and year boundary follows', () => {
    for (const len of LENGTHS) {
      const { config } = applyRules(defaultGameConfig('lasius-niger', 1, 'naturalist'), { seasonLengthDays: len });
      expect(config.rules.seasonLengthDays).toBe(len);
      const days = len * 4;
      expect(daysPerYear(config)).toBe(days);
      expect(ticksPerYear(config)).toBe(days * TICKS_PER_DAY);
      const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
      for (let d = 0; d < days; d++) {
        const t = d * TICKS_PER_DAY;
        expect(seasonOf(t, config), `len ${len} day ${d}`).toBe(seasons[Math.floor(d / len)]);
        expect(dayOfSeason(t, config)).toBe((d % len) + 1);
        expect(yearOf(t, config)).toBe(1);
      }
      expect(yearOf(days * TICKS_PER_DAY, config)).toBe(2);
      expect(yearOf(days * TICKS_PER_DAY - 1, config)).toBe(1);
    }
  });

  it('default-year windows (doy a-b as written in the GDD and species data) scale with the length', () => {
    const [a, b] = [9, 13]; // the Lasius flight window
    for (const len of LENGTHS) {
      const { config } = applyRules(defaultGameConfig('lasius-niger', 1, 'naturalist'), { seasonLengthDays: len });
      const tpy = ticksPerYear(config);
      const open = Math.ceil(((a - 1) * tpy) / 28), close = Math.ceil((b * tpy) / 28); // [open, close)
      expect(inDefaultYearWindow(open - 1, config, a, b), `len ${len} just before`).toBe(false);
      expect(inDefaultYearWindow(open, config, a, b), `len ${len} opens`).toBe(true);
      expect(inDefaultYearWindow(close - 1, config, a, b), `len ${len} still open`).toBe(true);
      expect(inDefaultYearWindow(close, config, a, b), `len ${len} closed`).toBe(false);
      // the window is 5/28 of the year whatever the length
      expect((close - open) / tpy).toBeCloseTo(5 / 28, 3);
      // the same default-year day is reached at the same fraction of the year
      expect(defaultYearDay(Math.round((tpy * 8) / 28), config)).toBeCloseTo(8, 2);
      expect(scaleDoy(9, config)).toBeCloseTo(1 + (8 * len) / 7, 10);
    }
  });

  it('a new game of each length starts on the species\' founding day of that length', () => {
    for (const species of SPECIES_IDS as readonly SpeciesId[]) {
      for (const len of LENGTHS) {
        const { config } = applyRules(defaultGameConfig(species, 1, 'naturalist'), { seasonLengthDays: len });
        const want = naturalStart(species, len);
        expect([config.startSeason, config.startDayOfSeason]).toEqual([want.season, want.day]);
        expect(config.startDayOfSeason).toBeGreaterThanOrEqual(1);
        expect(config.startDayOfSeason).toBeLessThanOrEqual(len);
        // and equals what defaultGameConfig itself derives for that length
        const direct = defaultGameConfig(species, 1, 'naturalist', len);
        expect([config.startSeason, config.startDayOfSeason]).toEqual([direct.startSeason, direct.startDayOfSeason]);
      }
    }
  });

  it('createNewGame honours the length: calendar, season and day of the first tick', () => {
    for (const len of LENGTHS) {
      const { config } = applyRules(defaultGameConfig('lasius-niger', 1, 'naturalist'), { seasonLengthDays: len });
      const world = makeTestWorld({ species: 'lasius-niger', seed: 1 });
      const { state } = createNewGame(config, world);
      expect(state.config.rules.seasonLengthDays).toBe(len);
      expect(currentSeason(state)).toBe(config.startSeason);
      expect(currentDayOfSeason(state)).toBe(config.startDayOfSeason);
      expect(calendarTick(state)).toBe(state.env.calendar.startTick);
      // one year later the same date comes round after exactly 4 x len days
      expect(yearOf(calendarTick(state) + len * 4 * TICKS_PER_DAY, state.config)).toBe(2);
    }
  });
});

describe('starting season rule', () => {
  it('spring, summer and autumn start on day 3 of that season (clamped into short seasons); natural keeps the species day', () => {
    for (const len of [5, 7, 10] as const) {
      for (const season of ['spring', 'summer', 'autumn'] as const) {
        const { config } = applyRules(defaultGameConfig('lasius-niger', 1, 'naturalist'), { seasonLengthDays: len, startSeason: season });
        expect([config.startSeason, config.startDayOfSeason]).toEqual([season, 3]);
        expect(config.rules.startSeason).toBe(season);
      }
    }
    expect(startFor('lasius-niger', 'natural', 7)).toEqual(naturalStart('lasius-niger', 7));
    expect(startFor('lasius-niger', 'autumn', 2)).toEqual({ season: 'autumn', day: 2 });
  });

  it('a game created with the rule starts on that date', () => {
    const { config } = applyRules(defaultGameConfig('lasius-niger', 1, 'naturalist'), { startSeason: 'autumn' });
    const { state } = createNewGame(config, makeTestWorld({ species: 'lasius-niger', seed: 1 }));
    expect(currentSeason(state)).toBe('autumn');
    expect(currentDayOfSeason(state)).toBe(3);
  });

  it('the species\' own start hour is kept', () => {
    const base = defaultGameConfig('lasius-niger', 1, 'naturalist');
    expect(applyRules(base, { startSeason: 'spring' }).config.startHour).toBe(base.startHour);
  });
});
