// F-int review (adversarial): tools/sim/soak.ts output on a tiny run. FAILING ON PURPOSE until fixed: the run
// time subtracts the time of the initial invariant check, which ran before the run timer started, so runMs and
// outsideSystemsMs come out negative (or too small) — `--days 0` shows it most clearly.
import { describe, expect, it, vi } from 'vitest';
import { SYSTEMS } from '@/sim/systems';
import { systemDue } from '@/sim/sim';
import main from '../../../tools/sim/soak';

function runSoak(args: string[]): { timing: { runMs: number; outsideSystemsMs: number; systems: { name: string; calls: number }[] }; violationCount: number; ticks: number } {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    main(args);
    return JSON.parse(spy.mock.calls[spy.mock.calls.length - 1][0] as string);
  } finally {
    spy.mockRestore();
  }
}

describe('F-int verify: soak tool', () => {
  it('a zero-length run reports non-negative timings', () => {
    const r = runSoak(['--days', '0', '--seed', '2']);
    expect(r.ticks).toBe(0);
    expect(r.violationCount).toBe(0);
    expect(r.timing.runMs).toBeGreaterThanOrEqual(0);
    expect(r.timing.outsideSystemsMs).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('a short run lists every system, called exactly on its due ticks', () => {
    const r = runSoak(['--days', '0.01', '--seed', '2', '--every', '20']);
    expect(r.ticks).toBe(60);
    expect(r.timing.systems.map((s) => s.name)).toEqual(SYSTEMS.map((s) => s.name));
    SYSTEMS.forEach((sys, i) => {
      let due = 0;
      for (let t = 0; t < r.ticks; t++) if (systemDue(sys, t)) due++;
      expect(r.timing.systems[i].calls, sys.name).toBe(due);
    });
  }, 60_000);
});
