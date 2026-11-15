// Headless creature soak (task AC 3; GDD 05 I5, I11, E21/E25 creature parts). Always on: 2 game days, 1 seed.
// FOUNDRESS_LONG=1: the 28-game-day run (a whole default year from summer day 3), results in test-output/.

import { describe, expect, it } from 'vitest';
import { runSoak, type SoakResult } from './soakScene';

/** Analytic upper bound of predation deaths per gd: every ant predator kills at most once per feed (>= 60-120 s). */
const MAX_PREDATION_PER_GD = 3 * 5 + 4 * 5 + 3 * 5 + 3 * 5 + 2 * 10 + 6 * 10 + 12 * 1.6;

function check(r: SoakResult): void {
  expect(r.capViolations).toEqual([]);
  expect(r.maxTotal).toBeLessThanOrEqual(260);
  expect(r.insideSolid).toBe(0);
  for (const d of r.deathsPerGd) expect(d).toBeLessThanOrEqual(MAX_PREDATION_PER_GD);
  if (r.minWindowShare !== null) expect(r.minWindowShare).toBeGreaterThanOrEqual(0.6);
}

declare const process: { env: Record<string, string | undefined> } | undefined;
const LONG = (typeof process !== 'undefined' ? process.env : {}).FOUNDRESS_LONG === '1';

interface Fs { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string): void }

/** Writes the numbers for the report under test-output/ (no node typings in this project: loaded at run time). */
async function save(name: string, r: SoakResult & { wallMs: number }): Promise<void> {
  try {
    const mod = 'node:fs';
    const fs = (await import(/* @vite-ignore */ mod)) as Fs;
    fs.mkdirSync('test-output', { recursive: true });
    fs.writeFileSync(`test-output/${name}.json`, JSON.stringify(r, null, 1));
  } catch { /* report only */ }
}

describe('creature soak', () => {
  it('2 game days, 300 workers: counts within caps, nobody in a solid, predation bounded', async () => {
    const t0 = performance.now();
    const r = runSoak(2, 1);
    await save('creatures-soak-2d', { ...r, wallMs: performance.now() - t0 });
    check(r);
    expect(r.telegraphs).toBeGreaterThan(0);
  }, 120_000);

  describe.skipIf(!LONG)('long', () => {
    it.each([1, 2, 3])('28 game days, seed %s: caps, quiet share >= 0.60 in every 3-GD window, >= 1 major threat', async (seed) => {
      const t0 = performance.now();
      const r = runSoak(28, seed);
      await save(`creatures-soak-28d-seed${seed}`, { ...r, wallMs: performance.now() - t0 });
      check(r);
      expect(r.windows).toBeGreaterThan(0);
      expect(r.threats).toBeGreaterThan(0);
    }, 3_600_000);
  });
});
