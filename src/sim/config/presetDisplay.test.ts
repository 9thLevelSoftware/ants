// The New Game screen's display data: every parameter of the table is shown, the values printed are the table's, and
// the custom-rule choices are exactly the values the rule validation accepts.

import { describe, expect, it } from 'vitest';
import type { CustomRules, DifficultyId } from '@/sim/types';
import { DIFFICULTY_KEYS, DIFFICULTY_PARAMS, invalidCustomRules, presetRuleValues } from '@/sim/balance';
import {
  PRESET_ROWS, PRESET_SUMMARY, presetCard, RULE_DISPLAY, UNWIRED_PARAMS, UNWIRED_RULES, UNWIRED_WHY,
} from './presetDisplay';

const PRESETS: readonly DifficultyId[] = ['gentle', 'naturalist', 'harsh'];
const RULE_KEYS: (keyof CustomRules)[] = ['predators', 'rivals', 'humanActivity', 'weatherSeverity', 'seasonLengthDays', 'startSeason',
  'foundingLeniency', 'winterMode', 'foundingAssist', 'queenSenescence', 'collapse', 'extinctionEndsGame'];

describe('preset cards', () => {
  it('every parameter of the table appears in at least one row, and rows name only table keys', () => {
    const shown = new Set(PRESET_ROWS.flatMap((r) => r.keys));
    expect([...shown].sort()).toEqual([...DIFFICULTY_KEYS].sort());
  });

  it.each(PRESETS)('%s: one row per entry, two description lines, values printed from the table', (id) => {
    const card = presetCard(id);
    expect(card.rows).toHaveLength(PRESET_ROWS.length);
    expect(card.lines).toHaveLength(2);
    expect(card.lines.every((l) => l.length > 20)).toBe(true);
    expect(card.name).toBe(PRESET_SUMMARY[id].name);
    const byLabel = Object.fromEntries(card.rows.map((r) => [r.label, r.value]));
    expect(byLabel['Tries at another site']).toBe(String(DIFFICULTY_PARAMS[id].openingRetries));
    expect(byLabel['Predators']).toBe(`x${DIFFICULTY_PARAMS[id].predatorDensityMult}`);
    expect(byLabel['Brood forecast']).toBe(DIFFICULTY_PARAMS[id].forecastPanel ? 'shown' : 'hidden');
  });

  it('the cards differ the way the design says (spot values)', () => {
    const v = (id: DifficultyId, label: string) => presetCard(id).rows.find((r) => r.label === label)?.value;
    expect([v('gentle', 'Bait stations'), v('naturalist', 'Bait stations'), v('harsh', 'Bait stations')]).toEqual(['none', 'indoors', 'indoors and garden']);
    expect([v('gentle', 'Storms'), v('naturalist', 'Storms'), v('harsh', 'Storms')]).toEqual(['x0.5', 'x1', 'x1.6']);
    expect([v('gentle', 'Predator events on the flight'), v('harsh', 'Predator events on the flight')]).toEqual(['0-1', '3-5']);
    expect([v('gentle', 'Heat tolerance of ants'), v('naturalist', 'Heat tolerance of ants'), v('harsh', 'Heat tolerance of ants')]).toEqual(['+2 C', '0 C', '-1 C']);
  });

  it('the cards carry the rule values of the preset', () => {
    for (const id of PRESETS) expect(presetCard(id).rules).toEqual({ ...presetRuleValues(id), seasonLengthDays: 7 });
  });
});

describe('custom rules table', () => {
  it('lists every rule once, in the New Game order of GDD 08 §3.7 first', () => {
    expect(RULE_DISPLAY.map((r) => r.key).sort()).toEqual([...RULE_KEYS].sort());
    expect(RULE_DISPLAY.slice(0, 4).map((r) => r.key)).toEqual(['predators', 'rivals', 'humanActivity', 'weatherSeverity']);
  });

  it('every choice is accepted by the rule validation, and the preset\'s own value is among the choices', () => {
    for (const r of RULE_DISPLAY) {
      for (const c of r.choices) expect(invalidCustomRules({ [r.key]: c.value }), `${r.key}=${String(c.value)}`).toEqual([]);
      if (r.key === 'seasonLengthDays' || r.key === 'startSeason') continue;
      for (const id of PRESETS) {
        const own = (presetRuleValues(id) as Record<string, unknown>)[r.key];
        expect(r.choices.some((c) => c.value === own), `${r.key} on ${id}`).toBe(true);
      }
    }
  });

  it('winter is not offered as a starting season, and the fixed-at-generation rules are marked', () => {
    const start = RULE_DISPLAY.find((r) => r.key === 'startSeason');
    expect(start?.choices.map((c) => c.value)).toEqual(['natural', 'spring', 'summer', 'autumn']);
    expect(RULE_DISPLAY.filter((r) => r.fixedAtGeneration).map((r) => r.key).sort()).toEqual(['rivals', 'seasonLengthDays', 'startSeason']);
  });
});

const SOURCES = import.meta.glob('/src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Source of every file outside the table, the display data, the types and the tests: where a value would be read. */
function readers(): string {
  return Object.entries(SOURCES)
    .filter(([path]) => !/\.test\.ts$/.test(path)
      && !/(balance\/difficulty|config\/presetDisplay|config\/rules|types\/config)\.ts$/.test(path))
    .map(([, text]) => text).join('\n');
}

describe('values that no system reads yet are marked as not in effect', () => {
  it.each([...UNWIRED_PARAMS, ...UNWIRED_RULES])('%s is read nowhere (wire it and take it off the unwired list)', (key) => {
    const code = readers();
    expect(new RegExp(`\\b${key}\\b`).test(code)).toBe(false);
    expect(UNWIRED_WHY[key].length, `${key}: say what is missing`).toBeGreaterThan(20);
  });

  it('the opening grace is read by the human-event scheduler and the creature director (GDD 06 §5.2)', () => {
    expect(UNWIRED_PARAMS).not.toContain('openingGraceGd');
    expect(SOURCES['/src/sim/timeGrace.ts']).toMatch(/difficultyValue\(sim, 'openingGraceGd'\)/);
    expect(SOURCES['/src/sim/environment/human/index.ts']).toContain('openingGraceEndTick(sim)');
    expect(SOURCES['/src/sim/ecology/creatures/director.ts']).toContain('inOpeningGrace(sim)');
  });

  it('the cards and the rules table carry the flag', () => {
    const rows = presetCard('naturalist').rows;
    expect(rows.find((r) => r.label === 'Grace period before threats')?.inEffect).toBe(true); // wired by sim-seams
    expect(rows.find((r) => r.label === 'Rain')?.inEffect).toBe(true);
    expect(RULE_DISPLAY.filter((r) => !r.inEffect).map((r) => r.key).sort()).toEqual([...UNWIRED_RULES].sort());
  });
});
