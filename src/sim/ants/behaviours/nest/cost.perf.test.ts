// sim-fix-ants item 2: cost per tick and per system of an in-nest colony with autonomous behaviour. The table for
// 300 / 800 / 1500 workers runs with FOUNDRESS_LONG=1 (written to test-output/reports/cost-table.json).
import { describe, expect, it } from 'vitest';
import { writeReport } from '@/sim/ants/testing/report';
import { measureCost } from '@/sim/ants/testing/costTable';

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;

describe('in-nest cost table (sim-fix-ants 2)', () => {
  it.skipIf(!LONG)('300 / 800 / 1500 workers: ms per tick, per system (minimum of 3 segments)', async () => {
    const rows = [300, 800, 1500].map((n) => measureCost(n, { warm: 600, ticks: 300, segments: 3 }));
    await writeReport('cost-table', rows);
    for (const r of rows) expect(r.tickMs).toBeGreaterThan(0);
  }, 3_600_000);
});
