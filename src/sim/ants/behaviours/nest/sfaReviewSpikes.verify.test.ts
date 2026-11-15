// Reviewer measurement (FOUNDRESS_LONG=1 only): per-tick cost distribution of an 800-worker in-nest colony. The
// waiting ants and the groomers of sim-fix-ants think on aligned ticks (multiples of WAIT_THINK_TICKS /
// GROOM_JOB_CHECK_TICKS) and the nursery board is rebuilt on the first read of each 2 s window: the mean per tick
// fell, but the cost may now come in bursts on those ticks. Reports mean, p50, p95, max and the mean of the aligned
// ticks against the others; asserts nothing strict (shared, loaded machine).
import { describe, expect, it } from 'vitest';
import { WAIT_THINK_TICKS } from '@/sim/balance/nestwork';
import { writeReport } from '@/sim/ants/testing/report';
import type { Sim, System } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { makeNestColony } from './testkit';

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;
const now = (): number => (globalThis as unknown as { performance: { now(): number } }).performance.now();

describe.skipIf(!LONG)('reviewer: per-tick cost bursts (sim-fix-ants item 2)', () => {
  it('800 in-nest workers: distribution of whole-tick times', async () => {
    const workers = 800;
    // per-system time on aligned and other ticks
    const acc: Record<string, [number, number]> = {};
    let alignedNow = false;
    const systems: System[] = SYSTEMS.map((sy) => ({
      ...sy,
      run(sim: Sim) {
        const t0 = now();
        sy.run(sim);
        const a = (acc[sy.name] ??= [0, 0]);
        a[alignedNow ? 0 : 1] += now() - t0;
      },
    }));
    const k = makeNestColony({
      workers, seed: 2, systems, stores: { c: 4 * workers, p: 2 * workers },
      brood: [
        { stage: 'egg', n: 66, chamber: 'nursery' }, { stage: 'larva', n: 66, chamber: 'nursery' }, { stage: 'pupa', n: 66, chamber: 'royal' },
      ],
    });
    const { sim } = k;
    for (let i = 0; i < 600; i++) sim.tick();
    for (const key of Object.keys(acc)) acc[key] = [0, 0];
    const rows: { aligned: boolean; ms: number }[] = [];
    for (let i = 0; i < 900; i++) {
      const aligned = sim.state.tick % WAIT_THINK_TICKS === 0;
      alignedNow = aligned;
      const t0 = now();
      sim.tick();
      rows.push({ aligned, ms: now() - t0 });
    }
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
    const out = {
      mean: +mean(ms).toFixed(2), p50: +ms[Math.floor(ms.length * 0.5)].toFixed(2), p95: +ms[Math.floor(ms.length * 0.95)].toFixed(2),
      max: +ms[ms.length - 1].toFixed(2),
      alignedMean: +mean(rows.filter((r) => r.aligned).map((r) => r.ms)).toFixed(2),
      otherMean: +mean(rows.filter((r) => !r.aligned).map((r) => r.ms)).toFixed(2),
    };
    const nA = rows.filter((r) => r.aligned).length, nO = rows.length - nA;
    const bySystem: Record<string, { aligned: number; other: number }> = {};
    for (const [key, [a, o]] of Object.entries(acc)) {
      if (a / nA >= 0.05 || o / nO >= 0.05) bySystem[key] = { aligned: +(a / nA).toFixed(2), other: +(o / nO).toFixed(2) };
    }
    console.log('[review spikes 800]', JSON.stringify({ ...out, bySystem }));
    await writeReport('review-spikes-800', { ...out, bySystem });
    expect(out.mean).toBeGreaterThan(0);
  }, 1_800_000);
});
