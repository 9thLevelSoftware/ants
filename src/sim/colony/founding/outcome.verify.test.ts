// Reviewer's check of the founding outcome in the running game with its real environment (founding review). The
// module's own tests pin every temperature to the GDD's calibration value (19.5-30 C); here nothing is pinned: the
// default Lasius start (summer day 3, afternoon), the environment's own cell temperature, cheat.completeFounding.
// GDD 06 §5.11 expected span 4.5-5.5 GD, §5.15 first workers 8-16; task acceptance criterion 3.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { foundingView } from './view';
import { phase, stepUntil } from './testkit';

describe('founding outcome with the real environment (no pinned temperature)', () => {
  it('the default start reaches the hand-over within 7 GD of the first egg with at least 5 first workers', () => {
    const sim = makeTestSim({ sizeBu: 128, seed: 1 });
    sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    stepUntil(sim, () => phase(sim) === 'timelapse', 4000);
    expect(phase(sim)).toBe('timelapse');
    const t0 = sim.state.tick;
    stepUntil(sim, () => phase(sim) !== 'timelapse', 7 * TICKS_PER_DAY);
    const gd = (sim.state.tick - t0) / TICKS_PER_DAY;
    expect({ phase: phase(sim), gd: Number(gd.toFixed(2)) }).toEqual({ phase: 'handover', gd: expect.any(Number) });
    expect(foundingView(sim)!.outcome!.workers).toBeGreaterThanOrEqual(5);
  }, 120_000);
});
