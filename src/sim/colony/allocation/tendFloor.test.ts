// winter-sugar arm T: while carbohydrate is short (needC > 0) the herds' keep (R39's tendKeep) is served before
// `forage` (demand.ts tendFloor, targets.ts planTargets). Item 4's long runs: on the brood-peak days of year two the
// tend demand was 6-12 and the tend target 0-1 (forage and store took the workers first in GDD 02 §6.3's order).
import { describe, expect, it } from 'vitest';
import { addWorkers, colonyOf, makeColonySim } from '../testkit';
import { ti } from '../taskIdx';
import { computeTargets } from './targets';
import { tendFloor } from './demand';

const T = (t: string) => ti(t as never);

function colony() {
  const sim = makeColonySim({ noAllocation: true });
  addWorkers(sim, 10, {});
  return { sim, col: colonyOf(sim) };
}

describe('the tend floor (winter-sugar arm T)', () => {
  it('more demand than workers: the floor\'s tenders are targeted before forage takes the rest', () => {
    const { col } = colony();
    const d = col.alloc.demand;
    d.fill(0);
    d[T('nurse')] = 6; d[T('queen-care')] = 1; d[T('forage')] = 9; d[T('store')] = 2; d[T('tend')] = 8;
    computeTargets(col, 10, false, undefined, false, 0, 0, 0, 0);
    const without = col.alloc.target[T('tend')];
    computeTargets(col, 10, false, undefined, false, 0, 0, 0, 3);
    expect(without).toBe(0);
    expect(col.alloc.target[T('tend')]).toBe(3);
    expect(col.alloc.target[T('nurse')]).toBeGreaterThanOrEqual(3); // the brood's care is served first
  });

  it('no floor while the carbohydrate need is met, nor on an unworkable surface', () => {
    const { sim, col } = colony();
    col.needs.needC = 0;
    expect(tendFloor(sim, col, true, 8)).toBe(0);
    col.needs.needC = 0.5;
    expect(tendFloor(sim, col, false, 8)).toBe(0);
  });
});
