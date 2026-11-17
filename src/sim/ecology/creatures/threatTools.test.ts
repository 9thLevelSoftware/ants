// tools/sim/threatBatch.ts resume rule (threats-calibrate review): a result on disk is reused only when it was made
// with the same run options, not just the same file name.

import { describe, expect, it } from 'vitest';
import { runMismatch } from '../../../../tools/sim/threatBatch';

const base = {
  archetype: 'woodland-edge', seed: 1, days: 6, preset: null, rules: null, cache: 'c', out: 'o1', tag: '', snapshot: null,
  workers: 60, food: [0, 0], runSeed: 1, untilWinter: false,
};

describe('threatBatch resume', () => {
  it('the same run (other --out only) is reused', () => {
    expect(runMismatch(base, { ...base, out: 'o2' })).toEqual([]);
  });

  it('an older result without untilWinter counts as untilWinter false', () => {
    const { untilWinter: _, ...old } = base;
    expect(runMismatch(old, base)).toEqual([]);
  });

  it('other days, until-winter, food, cache or rules content are refused', () => {
    expect(runMismatch(base, { ...base, days: 2 })).toEqual(['days']);
    expect(runMismatch(base, { ...base, untilWinter: true })).toEqual(['untilWinter']);
    expect(runMismatch(base, { ...base, food: [10, 5] })).toEqual(['food']);
    expect(runMismatch(base, { ...base, cache: 'other' })).toEqual(['cache']);
    expect(runMismatch({ ...base, rules: { predators: 'many' } }, { ...base, rules: { predators: 'few' } })).toEqual(['rules']);
  });

  it('rules compare by content, not key order', () => {
    expect(runMismatch({ ...base, rules: { a: 1, b: 2 } }, { ...base, rules: { b: 2, a: 1 } })).toEqual([]);
  });
});
