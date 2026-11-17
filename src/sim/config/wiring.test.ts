// Wiring check (difficulty-rules deliverable 3): systems read tuned values through difficultyValue / effectiveRule,
// never from `config.difficulty.params` or the rule record directly, so every custom rule reaches every system.
// A source scan: the files that legitimately hold or copy the params are listed.

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('/src/sim/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Files that own, copy or reset the preset values rather than read a tuned value. */
const ALLOWED = [
  '/src/sim/balance/difficulty.ts', // the table and the accessors
  '/src/sim/createGame.ts', // copies the preset's params into a new config; reads autoSlowDefault once at creation
  '/src/sim/config/rules.ts', // copies the params at game creation
  '/src/sim/progression/index.ts', // setDifficulty replaces the params with the new preset's
  '/src/sim/types/', // contracts
  // GDD 07 asks difficulty for `diseaseMult` (Escovopsis), which GDD 06 §14 does not list: the leafcutter module reads it
  // from the params by a cast, with a default. It needs an owner's value in the table (difficulty-rules report).
  '/src/sim/species/modules/fungus/economy.ts',
];
const isTest = (p: string): boolean => /\.(test|verify\.test|long\.test)\.ts$/.test(p) || /testkit|testKit|soakScene|fixtures/.test(p);

describe('difficulty wiring', () => {
  it('no system reads config.difficulty.params.<key> directly', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(SOURCES)) {
      if (isTest(path) || ALLOWED.some((a) => path.startsWith(a))) continue;
      text.split('\n').forEach((line, i) => {
        if (/difficulty\.params\b/.test(line) && !/^\s*(\/\/|\*)/.test(line)) offenders.push(`${path}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the rule-driven systems read rules through effectiveRule or difficultyValue', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(SOURCES)) {
      if (isTest(path) || ALLOWED.some((a) => path.startsWith(a))) continue;
      text.split('\n').forEach((line, i) => {
        if (/config\.rules\.(predators|humanActivity|weatherSeverity|foundingLeniency)\b/.test(line) && !/^\s*(\/\/|\*)/.test(line)) offenders.push(`${path}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
