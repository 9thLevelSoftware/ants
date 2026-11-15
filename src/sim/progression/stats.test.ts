// Statistics series (GDD 06 §9.2, task criterion 5): 168-sample hourly rings, one daily value per game day,
// continuity across skipped ticks and save/load, and a headless run of the whole simulation on the test world with
// continuous series (2 days always; 28 days with FOUNDRESS_LONG=1).

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { HOURLY_HISTORY_CAP, PROGRESSION_STATS_OFFSET } from '@/sim/balance';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { makeTestSim } from '@/sim/testing';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { attachProgression, historySeries, systems } from './index';
import { ownsDaily } from './stats';
import { makeProgSim } from './testkit';

declare const process: { env: Record<string, string | undefined> };

function run(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.tick();
}

/** Every hourly series that existed from the first sample has one sample per hour (ring-capped). */
function expectContinuous(sim: Sim, hours: number, days: number, own: (id: string) => boolean): void {
  const h = sim.state.progression.history;
  const ids = Object.keys(h.hourly).filter(own);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    if (id.startsWith('deaths-by-cause:') || id.startsWith('intake-by-kind:') || id.startsWith('deaths:')) continue; // start at their first event
    expect(h.hourly[id].len, id).toBe(Math.min(HOURLY_HISTORY_CAP, hours));
    expect(historySeries(sim, id, 'hourly').every(Number.isFinite), id).toBe(true);
  }
  for (const id of Object.keys(h.daily).filter(own)) {
    if (id.startsWith('deaths-by-cause:') || id.startsWith('intake-by-kind:')) continue;
    expect(h.daily[id].length, id).toBe(days);
  }
}

describe('statistics rings', () => {
  it('keep 168 hourly samples and one value per day', () => {
    const sim = makeProgSim({ workers: 6 });
    run(sim, 200 * TICKS_PER_HOUR);
    expect(sim.state.progression.history.hourly['nest-volume'].len).toBe(HOURLY_HISTORY_CAP);
    expect(sim.state.progression.history.hourly['workers-by-caste:worker'].cap).toBe(HOURLY_HISTORY_CAP);
    const days = sim.state.progression.history.daily['nest-volume'].length;
    expect(days).toBeGreaterThanOrEqual(7);
    expect(days).toBeLessThanOrEqual(9);
    expect(sim.state.progression.history.daily['air-temp:min'].length).toBe(days);
    expect(historySeries(sim, 'workers-by-caste:worker', 'daily').every((v) => v === 6)).toBe(true);
  });

  it('fill skipped hours and days with the last values (no gaps)', () => {
    const sim = makeProgSim();
    run(sim, 3 * TICKS_PER_HOUR);
    const before = sim.state.progression.history.hourly.alates.len;
    sim.state.tick += 30 * TICKS_PER_HOUR; // a jump forward (cheat.setTime, a long lapse)
    run(sim, TICKS_PER_HOUR);
    expect(sim.state.progression.history.hourly.alates.len).toBe(before + 31);
    const days = sim.state.progression.history.daily.alates.length;
    expect(days).toBeGreaterThanOrEqual(1);
  });

  it('survive save/load: a restored run continues identically (hash equal to an unbroken run)', () => {
    const a = makeProgSim({ workers: 8, seed: 3 });
    const b = makeProgSim({ workers: 8, seed: 3 });
    run(a, 30 * TICKS_PER_HOUR);
    run(b, 30 * TICKS_PER_HOUR);
    const restoredB = createSim(restore(snapshot(b)).state, b.world, { systems });
    attachProgression(restoredB);
    expect(restoredB.state.progression.history.hourly.alates.len).toBe(30);
    run(a, 10 * TICKS_PER_HOUR);
    run(restoredB, 10 * TICKS_PER_HOUR);
    expect(stateHash(restoredB.state)).toBe(stateHash(a.state));
    expect(historySeries(restoredB, 'air-temp', 'hourly')).toEqual(historySeries(a, 'air-temp', 'hourly'));
  });
});

/** A headless run of every system on the test world: series stay continuous, numbers finite. */
function headless(days: number): Sim {
  const sim = makeTestSim({ nest: 'small', workers: 20, seed: 2 });
  run(sim, days * TICKS_PER_DAY);
  return sim;
}

describe('headless run with every system', () => {
  it('2 game days: continuous progression and colony series', () => {
    const sim = headless(2);
    const first = (TICKS_PER_HOUR - PROGRESSION_STATS_OFFSET) % TICKS_PER_HOUR; // first tick the hourly system runs
    const hours = Math.floor((sim.state.tick - 1 - first) / TICKS_PER_HOUR) + 1;
    const h = sim.state.progression.history;
    expectContinuous(sim, hours, h.daily.alates.length, ownsDaily);
    expect(h.daily.alates.length).toBeGreaterThanOrEqual(1);
    // the colony module's own series (GDD 02 §13.2) are continuous too
    const colonyHours = h.hourly.workers.len;
    for (const id of ['workers', 'stores-c', 'eggs', 'nursery-temp']) expect(h.hourly[id].len, id).toBe(colonyHours);
  }, 120_000);

  it.skipIf(!process.env.FOUNDRESS_LONG)('28 game days: continuous series, daily values for every day', () => {
    const sim = headless(28);
    const h = sim.state.progression.history;
    expectContinuous(sim, HOURLY_HISTORY_CAP, h.daily.alates.length, ownsDaily);
    expect(h.daily.alates.length).toBeGreaterThanOrEqual(27);
    expect(h.daily['nest-volume'].every(Number.isFinite)).toBe(true);
  }, 3_600_000);
});
