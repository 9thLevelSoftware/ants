// Cost of progression's work with a large colony: one state poll (census, triggers, stage, aims) and one hourly
// statistics sample with 2500 ants. Load-tolerant limits; FOUNDRESS_STRICT_PERF=1 applies the budget limits.

import { describe, expect, it } from 'vitest';
import { PROGRESSION_POLL_EVERY } from '@/sim/balance';
import { addWorkers } from './fixtures';
import { makeProgSim } from './testkit';
import { sampleProgressionHour } from './stats';

declare const process: { env: Record<string, string | undefined> };

const STRICT = !!process.env.FOUNDRESS_STRICT_PERF;
/** ms per poll / per hourly sample: strict budget (idle machine) and the loose limit used under shared load. */
const POLL_LIMIT_MS = STRICT ? 1 : 10;
const SAMPLE_LIMIT_MS = STRICT ? 2 : 20;

function minOf(n: number, fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('progression cost with 2500 ants', () => {
  it('poll and hourly sample stay within budget', () => {
    const sim = makeProgSim({ workers: 4 });
    addWorkers(sim, 2500);
    // ticks with a poll are 1 in PROGRESSION_POLL_EVERY; measure one poll tick at a time
    const pollTick = (): void => { for (let i = 0; i < PROGRESSION_POLL_EVERY; i++) sim.tick(); };
    pollTick();
    const poll = minOf(20, pollTick);
    const sample = minOf(10, () => sampleProgressionHour(sim));
    console.log(`progression poll (10 ticks) ${poll.toFixed(3)} ms, hourly sample ${sample.toFixed(3)} ms`);
    expect(poll).toBeLessThan(POLL_LIMIT_MS);
    expect(sample).toBeLessThan(SAMPLE_LIMIT_MS);
  });
});
