// Duel tables (acceptance criterion 2). Always: 3 seeds per table as a smoke check. With FOUNDRESS_LONG=1: 500
// seeded trials per table, printed, and checked against the ranges the chapter states (App. E 9: one of two
// mutually locked Lasius workers dies 9.5-16 s after the lock in >= 95 % of trials).
import { describe, expect, it } from 'vitest';
import { duelTable, runDuel, type DuelKind } from './duels';

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const LONG = ENV.FOUNDRESS_LONG === '1';
const KINDS: DuelKind[] = ['locked-workers', 'workers', 'workers-no-acid', 'major-vs-minor', 'three-vs-one', 'three-vs-one-no-acid'];

describe('duels (3 seeds)', () => {
  it('every duel kind ends; locked workers die inside 9.5-16 s; the major and the three win', () => {
    for (const k of KINDS) {
      for (const seed of [1, 2, 3]) {
        const r = runDuel(k, seed);
        if (k === 'locked-workers') {
          expect(r.winner).not.toBe('none');
          expect(r.firstDeathS).toBeGreaterThanOrEqual(9.5 - 1e-9);
          expect(r.firstDeathS).toBeLessThanOrEqual(16);
        }
        if (k === 'major-vs-minor' || k.startsWith('three')) expect(r.winner).toBe('a');
        expect(r.durationS).toBeLessThanOrEqual(90);
      }
    }
  });
});

describe.skipIf(!LONG)('duel tables (500 trials each, FOUNDRESS_LONG=1)', () => {
  it('win rates and durations', { timeout: 600_000 }, () => {
    const seeds = Array.from({ length: 500 }, (_, i) => 1000 + i);
    const rows = KINDS.map((k) => duelTable(k, seeds, k === 'locked-workers' ? [9.5, 16] : [0, Infinity]));
    // eslint-disable-next-line no-console
    console.table(rows);
    const locked = rows[0];
    expect(locked.inRange).toBeGreaterThanOrEqual(0.95);
    expect(Math.abs(locked.winA - locked.winB)).toBeLessThan(0.15 * locked.trials);
    expect(rows[3].winA / rows[3].trials).toBeGreaterThanOrEqual(0.95);
    expect(rows[4].winA / rows[4].trials).toBeGreaterThanOrEqual(0.95);
    expect(rows[5].winA / rows[5].trials).toBeGreaterThanOrEqual(0.95);
  });
});
