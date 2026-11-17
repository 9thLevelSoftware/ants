// Adversarial checks of the custom rules at creation and mid-game (difficulty-rules review). Regression tests unless
// a comment says FAILS.

import { describe, expect, it } from 'vitest';
import type { SeasonLengthDays, SpeciesId } from '@/sim/types';
import { SPECIES_IDS } from '@/sim/types';
import { createNewGame, defaultGameConfig, startCalendarTick } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { makeTestWorld } from '@/sim/testing';
import { requireSpecies } from '@/sim/species';
import { defaultYearDoy } from '@/sim/time';
import { DIFFICULTY_PARAMS, difficultyValue, effectiveRule } from '@/sim/balance';
import { resolveNewGame } from '@/game/newGame/options';
import { applyRules, normalizeCustomRules } from './rules';

describe('natural start at every season length stays inside the species founding window (GDD 06 §1.6, §1.7)', () => {
  it.each(SPECIES_IDS as readonly SpeciesId[])('%s', (species) => {
    const { min, max } = requireSpecies(species).opening.startDoy;
    for (const len of [5, 7, 10] as SeasonLengthDays[]) {
      const { config } = applyRules(defaultGameConfig(species, 1, 'naturalist'), { seasonLengthDays: len });
      const doy28 = defaultYearDoy(startCalendarTick(config), config);
      expect(doy28, `${species} len ${len}`).toBeGreaterThanOrEqual(min);
      expect(doy28, `${species} len ${len}`).toBeLessThanOrEqual(max);
    }
  });
});

describe('resolveNewGame (the New Game request path) applies the rules', () => {
  it('custom rules and the starting season reach config, rules and the world generator copies', () => {
    const { config } = resolveNewGame({
      difficulty: 'harsh', seed: 7, startSeason: 'autumn',
      customRules: { seasonLengthDays: 10, rivals: 1, predators: 'off', humanActivity: 'off', collapse: false },
    });
    expect(config.difficulty.preset).toBe('harsh');
    expect(config.rules).toMatchObject({ seasonLengthDays: 10, rivals: 1, predators: 'off', humanActivity: 'off', collapse: false, startSeason: 'autumn' });
    expect([config.startSeason, config.startDayOfSeason]).toEqual(['autumn', 3]);
    expect(config.world).toMatchObject({ difficulty: 'harsh', rivalCount: 1, incipientCount: DIFFICULTY_PARAMS.harsh.incipientRivals, humanActivity: 'off' });
    expect(difficultyValue({ state: { config } }, 'predatorDensityMult')).toBe(0);
  });

  it('garbage from untyped JSON is ignored, never thrown', () => {
    const bad = JSON.parse('{"predators":"swarm","rivals":-1,"seasonLengthDays":"7","startSeason":"winter","x":1}') as never;
    const { config } = resolveNewGame({ difficulty: 'naturalist', customRules: bad });
    expect(config.rules).toMatchObject({ predators: 'normal', rivals: 3, seasonLengthDays: 7, startSeason: 'natural' });
    expect(normalizeCustomRules(bad).issues.map((i) => i.key).sort()).toEqual(['predators', 'rivals', 'seasonLengthDays', 'startSeason', 'x']);
  });
});

describe('setDifficulty mid-game (sim command) and the accessors', () => {
  function sim(preset: 'gentle' | 'naturalist' | 'harsh') {
    const { config } = applyRules(defaultGameConfig('lasius-niger', 1, preset), {});
    const world = makeTestWorld({ species: 'lasius-niger', seed: 1 });
    return createSim(createNewGame(config, world).state, world);
  }

  it('a rule override acts from the next tick; generation rules are refused; removing it restores the preset', () => {
    const s = sim('harsh');
    expect(difficultyValue(s, 'predatorDensityMult')).toBe(1.6);
    s.enqueue({ type: 'setDifficulty', custom: { predators: 'off', weatherSeverity: 'mild', seasonLengthDays: 5, rivals: 0 } });
    s.tick();
    expect(difficultyValue(s, 'predatorDensityMult')).toBe(0);
    expect(difficultyValue(s, 'flightPredatorEvents')).toEqual([0, 0]);
    expect(difficultyValue(s, 'stormFreqMult')).toBeCloseTo(1.6 * 0.6, 12);
    expect(s.state.config.rules.seasonLengthDays).toBe(7);
    expect(s.state.config.rules.rivals).toBe(4);
    expect(effectiveRule(s.state.config, 'rivals')).toBe(4);
    s.enqueue({ type: 'setDifficulty', custom: { predators: undefined, weatherSeverity: undefined } });
    s.tick();
    expect(difficultyValue(s, 'predatorDensityMult')).toBe(1.6);
    expect(difficultyValue(s, 'stormFreqMult')).toBe(1.6);
  });

  it('a preset change mid-game swaps the parameters and keeps the player\'s overrides', () => {
    const s = sim('naturalist');
    s.enqueue({ type: 'setDifficulty', custom: { humanActivity: 'off' } });
    s.tick();
    s.enqueue({ type: 'setDifficulty', preset: 'gentle' });
    s.tick();
    expect(difficultyValue(s, 'stormFreqMult')).toBe(DIFFICULTY_PARAMS.gentle.stormFreqMult);
    expect(difficultyValue(s, 'predatorDensityMult')).toBe(DIFFICULTY_PARAMS.gentle.predatorDensityMult);
    expect(difficultyValue(s, 'humanFreqMult')).toBe(0);
    expect(effectiveRule(s.state.config, 'collapse')).toBe(false);
  });

  it('a setDifficulty payload with a prototype-named key is rejected, not thrown out of the tick', () => {
    const s = sim('naturalist');
    s.enqueue(JSON.parse('{"type":"setDifficulty","custom":{"hasOwnProperty":1}}'));
    // FAILS: invalidCustomRules calls Object.prototype.hasOwnProperty as a validator and throws inside the tick
    expect(() => s.tick()).not.toThrow();
    expect(Object.keys(s.state.config.rules)).not.toContain('hasOwnProperty');
  });
});
