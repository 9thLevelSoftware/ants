// Task opening-fix: the player's opening of tests/e2e/firstplay.mjs (beats 04-13), headless, on the seeds the browser
// failed on Nov 23 (seed 2: the queen drowned in the lapse; seed 1 / seed 4: the first workers never reopened the
// entrance). Each case: the founding hands over without a stand-in, and the entrance is `open` and a worker is on
// the surface away from it within R14 as restated by the integrator (winter-sugar A1): 4 game hours counted from the
// first game hour after the hand-over in which the air at the nest mouth is at or above the forage gate's full band
// (a cold-night hand-over starts its clock when the workers can work). About 2 minutes per case: FOUNDRESS_LONG=1.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '@/sim/time';
import { runOpening } from './playerOpeningKit';

/** R14: 4 game hours. */
const R14_TICKS = 4 * TICKS_PER_HOUR;
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

interface Reopened { openedAfterTicks: number; outsideAfterTicks: number; warmFromTicks: number; fullBandC: number }

describe.skipIf(!ENV.FOUNDRESS_LONG)('the player\'s opening, headless (opening-fix, R13 / R14 restated)', () => {
  // The browser script's clutch (4 batches, each waited out: firstplay.mjs layBatch) on seeds 1, 2, 4, and an extra
  // case with 2 batches on seed 4 (the old script's 12-egg clutch: the 4-worker colony the browser handed over).
  const cases = [
    { seed: 1, layBatches: 4 }, { seed: 2, layBatches: 4 }, { seed: 4, layBatches: 4 }, { seed: 4, layBatches: 2 },
  ] as const;
  for (const c of cases) {
    it(`seed ${c.seed}, ${c.layBatches} lay batches: beats 04-13 pass; open and a worker out within R14 (restated)`, () => {
      const { result } = runOpening({ seed: c.seed, until: '', afterTicks: 7500, layBatches: c.layBatches });
      expect(result.failure).toBeNull();
      const r = result.checks.reopened as Reopened;
      expect(r.openedAfterTicks).toBeGreaterThan(0);
      // the clock starts at the hand-over when the air is warm then, else at the first warm hour (-1: none yet, and
      // the entrance opened while still cold, so it is within any clock)
      const bound = (r.warmFromTicks >= 0 ? r.warmFromTicks : Infinity) + R14_TICKS;
      expect(r.openedAfterTicks).toBeLessThanOrEqual(bound);
      expect(r.outsideAfterTicks).toBeLessThanOrEqual(bound);
      if (c.layBatches === 2) expect((result.checks.clutch as { eggs: number }).eggs).toBeLessThanOrEqual(12);
      if (c.layBatches === 4) expect((result.checks.clutch as { eggs: number }).eggs).toBeGreaterThan(12);
    }, 900_000);
  }
});
