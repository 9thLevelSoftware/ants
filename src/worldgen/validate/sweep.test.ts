// Acceptance 6 and GDD 04 App. E 3, 6, 7 over many seeds: every world passes validation (founding sites reachable
// from the queen start, connectivity) within the attempt limit, almost always without repairs.
// Default: 3 seeds per archetype; FOUNDRESS_WORLDGEN_FULL=1 runs 20 (the acceptance sweep, about 2 minutes).
import { describe, expect, it } from 'vitest';
import { generateWorldReport } from '../pipeline';
import { FULL, paramsFor, T1_ARCHETYPES } from '../testing/fixtures';

const SEEDS = FULL ? 20 : 3;

describe(`validation over ${SEEDS} seeds per Tier 1 archetype (standard, Lasius)`, () => {
  for (const a of T1_ARCHETYPES) {
    it(`${a}: v-found and v-connect pass, attempts <= 8, repairs on < 5 %`, () => {
      let repaired = 0;
      const lines: string[] = [];
      for (let s = 100; s < 100 + SEEDS; s++) {
        const r = generateWorldReport(paramsFor(a, s));
        const found = r.checks.find((c) => c.id === 'v-found')!, conn = r.checks.find((c) => c.id === 'v-connect')!;
        lines.push(`${s}: attempts=${r.attempts} ${found.detail} | ${conn.detail}`);
        expect(found.status, `${a} seed ${s}: ${found.detail}`).toBe('pass');
        expect(conn.status, `${a} seed ${s}: ${conn.detail}`).toBe('pass');
        expect(r.checks.filter((c) => c.status === 'fail')).toEqual([]);
        expect(r.attempts).toBeLessThanOrEqual(8);
        if (r.repairs.length > 0) repaired++;
      }
      expect(repaired / SEEDS).toBeLessThan(0.05 + (SEEDS < 20 ? 1 / SEEDS : 0));
      if (FULL) console.log(`[sweep] ${a}\n  ${lines.join('\n  ')}`);
    }, 600_000);
  }
});
