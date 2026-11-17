// Colony-life round 4: a small colony short of workers (ΣD > A) gave `haul` nothing under GDD 02 §6.3's fixed
// priority order, so waste lying among the brood was never taken out (suburban-garden #2: 9 workers, haul demand
// 1.6-1.8, haul workers 0, 0 of 23 waste items removed in 5 gd, 15 of 16 brood dead of hygiene). With waste in a brood
// chamber at the hygiene tolerance, `haul` ranks right after `queen-care` (allocation/targets.ts withHygiene).
import { describe, expect, it } from 'vitest';
import { taskIndex } from '@/sim/types';
import { colonyOf, makeColonySim } from '../testkit';
import { computeTargets } from './targets';

/** A 9-worker colony's demand, as on suburban-garden #2: more demand than workers. */
function shortColony() {
  const sim = makeColonySim({ noAllocation: true });
  const col = colonyOf(sim);
  const d = col.alloc.demand;
  d.fill(0);
  d[taskIndex('nurse')] = 2; d[taskIndex('queen-care')] = 2; d[taskIndex('forage')] = 8; d[taskIndex('store')] = 1;
  d[taskIndex('tend')] = 2; d[taskIndex('scout')] = 1; d[taskIndex('haul')] = 1.8;
  return { sim, col };
}

describe('haul ranks after queen-care while the brood lies among waste (round 4)', () => {
  it('without waste among the brood the GDD order gives haul nothing when workers are short', () => {
    const { col } = shortColony();
    computeTargets(col, 9, false);
    expect(col.alloc.target[taskIndex('haul')]).toBe(0);
  });

  it('with waste among the brood haul gets its share before forage, store, tend and scout', () => {
    const { col } = shortColony();
    computeTargets(col, 9, false, undefined, true);
    expect(col.alloc.target[taskIndex('haul')]).toBe(1);
    expect(col.alloc.target[taskIndex('nurse')]).toBeGreaterThanOrEqual(1);
    expect(col.alloc.target[taskIndex('queen-care')]).toBeGreaterThanOrEqual(1);
  });
});
