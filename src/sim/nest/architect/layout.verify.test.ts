// Reviewer's test (architect acceptance 6): layoutNest timing measured as this process's CPU time as well as wall
// clock. On a shared, overloaded machine CPU time is the fairer estimate of the quiet-machine cost (it does not
// count time the process waits for a core). Logged always; asserted only with FOUNDRESS_PERF_STRICT=1.

import { describe, expect, it } from 'vitest';
import { PERF_STRICT_ENV, archSim, testLog } from './architectTestKit';
import { layoutNest } from './layout';

const proc = (globalThis as unknown as { process?: { cpuUsage?: () => { user: number; system: number } } }).process;
const cpuMs = (): number => {
  const u = proc?.cpuUsage?.();
  return u ? (u.user + u.system) / 1000 : performance.now();
};

describe('layoutNest timing verify (acceptance 6)', () => {
  it('CPU and wall time for 20, 100 and 400 workers (min of 5 seeds)', () => {
    const out: Record<number, { cpu: number; wall: number }> = {};
    for (const workers of [20, 100, 400]) {
      let cpu = Infinity, wall = Infinity;
      for (let n = 0; n < 5; n++) {
        const { sim, nest } = archSim({ seed: 21 + n, terrain: 'noise', architect: false, template: false });
        const c0 = cpuMs(), w0 = performance.now();
        layoutNest(sim, nest.id, workers);
        cpu = Math.min(cpu, cpuMs() - c0);
        wall = Math.min(wall, performance.now() - w0);
      }
      out[workers] = { cpu, wall };
    }
    testLog(true, `layoutNest min ms (cpu / wall): ${JSON.stringify(out)}`);
    if (PERF_STRICT_ENV) for (const w of [20, 100, 400]) expect(out[w].cpu).toBeLessThan(50);
  }, 180_000);
});
