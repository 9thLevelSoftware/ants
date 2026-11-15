// Headless creature soak (task AC 3; GDD 05 I5, I11, E21/E25 creature parts). Always on: 2 game days, 1 seed.
// FOUNDRESS_LONG=1: the 28-game-day run (a whole default year from summer day 3), results in test-output/.

import { describe, expect, it } from 'vitest';
import { BIRD_MAX_KILLS } from '@/sim/balance/creatures';
import { runSoak, type SoakResult } from './soakScene';

/**
 * Caps (I5), nobody in a solid, predation within the chapter's bounds: per kind and game day at most the kills its
 * feeding times allow (predationBoundPerGd), every predation death attributable to a striking predator, at most
 * BIRD_MAX_KILLS per bird event; the quiet share (I11, with the real predator-near warnings) >= the preset's
 * QUIET_SHARE_MIN; every prey patch >= 0.05 K at the end of each active day (I2).
 */
function check(r: SoakResult, quietMin = 0.6): void {
  expect(r.capViolations).toEqual([]);
  expect(r.maxTotal).toBeLessThanOrEqual(260);
  expect(r.insideSolid).toBe(0);
  expect(r.killsByKind.unknown ?? 0).toBe(0);
  for (const [k, n] of Object.entries(r.maxKillsPerGdByKind)) if (r.boundPerGdByKind[k] !== undefined) expect(n, k).toBeLessThanOrEqual(r.boundPerGdByKind[k]);
  expect(r.maxBirdKills).toBeLessThanOrEqual(BIRD_MAX_KILLS);
  if (r.minWindowShare !== null) expect(r.minWindowShare).toBeGreaterThanOrEqual(quietMin);
  if (r.minPatchShare !== null) expect(r.minPatchShare).toBeGreaterThanOrEqual(0.05);
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

    it.each([['gentle', 0.75], ['harsh', 0.4]] as const)('28 game days, %s, seed 1: quiet share >= %s in every window', async (preset, min) => {
      const t0 = performance.now();
      const r = runSoak(28, 1, preset);
      await save(`creatures-soak-28d-${preset}`, { ...r, wallMs: performance.now() - t0 });
      check(r, min);
      expect(r.windows).toBeGreaterThan(0);
      if (preset === 'harsh') expect(r.threats).toBeGreaterThan(0);
    }, 3_600_000);
  });
});
