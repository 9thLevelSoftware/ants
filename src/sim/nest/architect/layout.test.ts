// Acceptance 6 (architect spec): layoutNest lays out a valid, navigable nest for 20, 100 and 400 workers without
// running the simulation, each in under 50 ms (minimum of several runs; the budget is skipped under heavy machine
// load unless FOUNDRESS_PERF_STRICT=1, src/sim/testing/perfLoad.ts).

import { describe, expect, it } from 'vitest';
import { REQUIRED_TYPES } from '@/sim/balance/architect';
import { nestTemplate } from '@/sim/balance/nest';
import { heavyLoad } from '@/sim/testing/perfLoad';
import { PERF_STRICT_ENV, archSim, testLog } from './architectTestKit';
import { layoutNest } from './layout';
import { checkNest, recordCreations, type CreatedPlan } from './nestChecks';
import { architectRuntime } from './runtime';

const log = (...a: unknown[]) => testLog(false, ...a);
const LAYOUT_BUDGET_MS = 50;

function layout(workers: number, seed: number) {
  const { sim, nest } = archSim({ seed, terrain: 'noise', architect: false, template: false });
  const created: CreatedPlan[] = [];
  architectRuntime(sim).probe = recordCreations(sim, created);
  const t0 = performance.now();
  const res = layoutNest(sim, nest.id, workers);
  const ms = performance.now() - t0;
  return { sim, nest, created, res, ms };
}

describe('layoutNest (acceptance 6)', () => {
  it.each([20, 100, 400])('%i workers: valid, navigable, template types', (workers) => {
    const { sim, nest, created, res, ms } = layout(workers, 7);
    const r = checkNest(sim, nest, created, 4);
    log(`layout ${workers}: ${ms.toFixed(1)} ms plans ${res.planIds.length} steps ${res.steps} unplaced ${res.unplaced} ${JSON.stringify(r.chambersByType)} vol ${r.volume.toFixed(0)}`);
    expect(r.invalidPlans).toBe(0);
    expect(r.unreachable).toEqual([]);
    expect(r.thinWalls).toEqual([]);
    expect(r.thinRoofs).toBe(0);
    expect(r.outOfBand).toEqual([]);
    expect(r.footprintBu).toBeLessThanOrEqual(nestTemplate('lasius-niger').footprintR);
    expect(r.chambersByType.royal).toBe(1);
    for (const q of REQUIRED_TYPES['lasius-niger']) if (workers >= q.workers) expect(r.chambersByType[q.type] ?? 0).toBeGreaterThanOrEqual(q.count);
    expect(sim.state.tick).toBe(0); // no simulation ran
  });

  it('is deterministic for a seed', () => {
    const a = layout(100, 3), b = layout(100, 3);
    expect(b.created.map((p) => JSON.stringify(p.spec))).toEqual(a.created.map((p) => JSON.stringify(p.spec)));
    expect(b.nest.chambers.map((c) => [c.type, c.voxelCount])).toEqual(a.nest.chambers.map((c) => [c.type, c.voxelCount]));
  });

  it(`takes under ${LAYOUT_BUDGET_MS} ms for 20, 100 and 400 workers (min of 5)`, () => {
    const times: Record<number, number> = {};
    for (const workers of [20, 100, 400]) {
      let best = Infinity;
      for (let n = 0; n < 5; n++) best = Math.min(best, layout(workers, 11 + n).ms);
      times[workers] = best;
    }
    testLog(true, `layoutNest min ms: ${JSON.stringify(times)}`);
    if (heavyLoad() && !PERF_STRICT_ENV) return;
    for (const w of [20, 100, 400]) expect(times[w]).toBeLessThan(LAYOUT_BUDGET_MS);
  }, 120_000);
});
