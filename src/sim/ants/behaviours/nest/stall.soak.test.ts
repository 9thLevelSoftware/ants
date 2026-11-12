// sim-fix-ants item 1: share of ant-ticks an in-nest colony spends "walking" (nav.status 'moving') at speed 0.
// Default mode runs a short window; FOUNDRESS_LONG=1 runs the 2-game-day scenario of the task's acceptance 2.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { makeNestColony } from './testkit';
import { writeReport } from '@/sim/ants/testing/report';

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;

export interface StallCount { antTicks: number; moving: number; stalled: number; worst: number }

/** Runs n ticks and counts, per ant and tick, 'moving' at a speed below 0.01 BU/s (ants in the air excluded). */
export function countStalls(sim: Sim, n: number): StallCount {
  const eps = 0.01 * sim.world.bu;
  const per = new Map<number, number>();
  const c: StallCount = { antTicks: 0, moving: 0, stalled: 0, worst: 0 };
  for (let t = 0; t < n; t++) {
    sim.tick();
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.caste === 'queen') continue;
      c.antTicks++;
      if (a.nav.status !== 'moving' || a.medium === 'air') continue;
      c.moving++;
      if (a.speed < eps) { c.stalled++; per.set(a.id, (per.get(a.id) ?? 0) + 1); }
    }
  }
  for (const v of per.values()) c.worst = Math.max(c.worst, v);
  return c;
}

function scenario(workers: number) {
  return makeNestColony({
    workers, stores: { c: 300, p: 200 }, seed: 5,
    brood: [
      { stage: 'egg', n: 15, chamber: 'nursery' }, { stage: 'larva', n: 20, chamber: 'nursery' },
      { stage: 'pupa', n: 10, chamber: 'nursery' },
    ],
  });
}

describe('in-nest walkers do not stand still while walking (sim-fix-ants 1)', () => {
  it('short window: under 1 % of ant-ticks at "moving, speed 0"', async () => {
    const k = scenario(40);
    const c = countStalls(k.sim, 600);
    const share = c.stalled / c.antTicks;
    await writeReport('stall-short', { ...c, share });
    expect(share, JSON.stringify(c)).toBeLessThan(0.01);
  }, 120_000);

  it.skipIf(!LONG)('2 game days, 100 workers: share of "moving, speed 0" ant-ticks below 1 %', async () => {
    const k = scenario(100);
    const c = countStalls(k.sim, 2 * TICKS_PER_DAY);
    const share = c.stalled / c.antTicks;
    await writeReport('stall-2gd', { ...c, share, shareOfMoving: c.stalled / Math.max(1, c.moving) });
    expect(share).toBeLessThan(0.01);
  }, 3_600_000);
});
