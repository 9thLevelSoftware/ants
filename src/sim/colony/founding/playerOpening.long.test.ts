// Task opening-fix: the player's opening of tests/e2e/firstplay.mjs (beats 04-13), headless, on the seeds the browser
// failed on Nov 23 (seed 2: the queen drowned in the lapse; seed 1 / seed 4: the first workers never reopened the
// entrance). Each case: the founding hands over without a stand-in, and within R14's 4 game hours of the hand-over
// the entrance is `open` and a worker is on the surface away from it. About 2 minutes per seed: FOUNDRESS_LONG=1.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '@/sim/time';
import { runOpening } from './playerOpeningKit';

/** R14 (STATUS rulings): the entrance open within 4 game hours of the hand-over. */
const R14_TICKS = 4 * TICKS_PER_HOUR;
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

describe.skipIf(!ENV.FOUNDRESS_LONG)('the player\'s opening, headless (opening-fix, R13 / R14)', () => {
  for (const seed of [1, 2, 4]) {
    it(`seed ${seed}: beats 04-13 pass, the entrance opens and a worker is out within 4 game hours`, () => {
      const { result } = runOpening({ seed, until: '', afterTicks: 7500 });
      expect(result.failure).toBeNull();
      const r = result.checks.reopened as { openedAfterTicks: number; outsideAfterTicks: number };
      expect(r.openedAfterTicks).toBeGreaterThan(0);
      expect(r.openedAfterTicks).toBeLessThanOrEqual(R14_TICKS);
      expect(r.outsideAfterTicks).toBeLessThanOrEqual(R14_TICKS);
    }, 900_000);
  }
});
