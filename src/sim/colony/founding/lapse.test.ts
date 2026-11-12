// The time-lapse on the real simulation (GDD 06 §5.11-§5.13): the clutch develops in the sealed cell with the
// queen's automatic care, the first worker ecloses on the GDD's schedule, the lapse ends 0.4 GD later and the
// colony is handed over (queen established, reserves split, the plug reopened by the workers, first aims).
// App. E check 19 (timing) on the running game; check 18's distribution is the model's (model.test.ts), compared
// with the running game over many seeds behind FOUNDRESS_LONG.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { requireSpecies } from '@/sim/species';
import { modelStats, runModel } from './model';
import { foundingView } from './view';
import { pinTemperature, phase, queen, nestOf, stepUntil } from './testkit';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';

const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

interface Outcome { sim: Sim; firstEggTick: number; firstEclosionTick: number; workers: number; reserves: number; events: string[] }

/** A founding run through cheat.completeFounding at a constant temperature, with the site quality fixed at q. */
function runFounding(seed: number, tempC: number, q: number, workers = 10): Outcome {
  const sim = makeTestSim({ sizeBu: 128, seed });
  pinTemperature(sim, tempC);
  const events: string[] = [];
  let firstEclosionTick = -1;
  sim.events.on('ant-eclosed', () => { if (firstEclosionTick < 0) firstEclosionTick = sim.state.tick; });
  sim.events.on('opening.phase', (e) => events.push(e.to));
  sim.enqueue({ type: 'cheat.completeFounding', workers });
  stepUntil(sim, () => phase(sim) === 'lay', 2000);
  sim.state.player.opening!.siteQ = q;
  stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 60_000);
  const out = foundingView(sim)?.outcome ?? { workers: 0, reserves: 0 };
  return { sim, firstEggTick: sim.state.env.calendar.foundingTick, firstEclosionTick, workers: out.workers, reserves: out.reserves, events };
}

describe('first-brood time-lapse on the running simulation (GDD 06 §5.11-§5.13)', () => {
  it('E19: at a constant 19.5 C the first worker ecloses 4.52 +- 0.1 GD after the first egg; hand-over follows 0.4 GD later', () => {
    const o = runFounding(1, 19.5, 0.7);
    expect(phase(o.sim)).toBe('handover');
    expect(o.events).toEqual(['dealation', 'search', 'dig', 'seal', 'lay', 'timelapse', 'handover']);
    expect(o.firstEggTick).toBeGreaterThan(0);
    const gd = (o.firstEclosionTick - o.firstEggTick) / TICKS_PER_DAY;
    expect(Math.abs(gd - 4.52)).toBeLessThanOrEqual(0.1);
    const lapse = o.sim.state.player.opening!.lapse!;
    expect(lapse.endTick - o.firstEclosionTick).toBeGreaterThanOrEqual(0.4 * TICKS_PER_DAY - 11);
    // a good site, clutch 24: the GDD's 8-15 first workers (one seed: a little wider), about 0.4 of the pool left
    expect(o.workers).toBeGreaterThanOrEqual(5);
    expect(o.workers).toBeLessThanOrEqual(18);
    expect(o.reserves).toBeGreaterThan(0.2);
    expect(o.reserves).toBeLessThan(0.6);

    // hand-over: an established queen with the pool split into reserve C and P, the cell reopened by the workers
    const q = queen(o.sim);
    expect(q.queen!.founding).toBeNull();
    expect(q.queen!.reserve).toBeCloseTo(q.queen!.reserveP, 9);
    expect(q.queen!.reserve * 2).toBeCloseTo(o.reserves * 56, 1);
    expect(o.sim.state.player.timelapse).toBeNull(); // normal speeds again
    expect(nestOf(o.sim).founding?.state).toBe('reopening');
    const aims = o.sim.state.progression.aims.filter((a) => a.state === 'open').map((a) => a.id);
    expect(aims).toEqual(expect.arrayContaining(['aim-first-food', 'aim-second-chamber']));
    // after hand-over the workers are the colony's own (autonomous behaviours, no founding flag on the queen)
    const workers = o.sim.state.ants.filter((a) => a.alive && a.caste === 'worker');
    expect(workers.length).toBe(o.workers);
    o.sim.tick();
    expect(o.sim.state.player.opening!.phase).toBe('handover');
    stepUntil(o.sim, () => phase(o.sim) === 'done', 200);
    expect(phase(o.sim)).toBe('done');
  }, 120_000);
});

describe.skipIf(!env.FOUNDRESS_LONG)('running game against the model, many seeds (FOUNDRESS_LONG=1)', () => {
  it('E18 on the running simulation: Q 0.7, 19.5 C, clutch 24: mean within the model mean +- 2', () => {
    const def = requireSpecies('lasius-niger');
    const n = Number(env.FOUNDRESS_SEEDS ?? 20);
    const game: number[] = [];
    for (let s = 1; s <= n; s++) game.push(runFounding(s, 19.5, 0.7).workers);
    const model = modelStats(Array.from({ length: 200 }, (_, i) => runModel({ def, q: 0.7, tempC: 19.5, clutch: 24, seed: i + 1 })));
    const mean = game.reduce((a, b) => a + b, 0) / n;
    console.log(`running game: mean ${mean.toFixed(2)} over ${n} seeds (${game.join(' ')}); model ${model.meanWorkers.toFixed(2)}`);
    expect(Math.abs(mean - model.meanWorkers)).toBeLessThanOrEqual(2);
  }, 3_600_000);
});
