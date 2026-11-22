// Independent review of colony-life round 11, R38 item 1 (direction 24): "While any nutrient is missing: scout
// demand >= max(SCOUTS_MISSING_MIN 2 (1 below 8 workers), SCOUT_MISSING_FRAC 0.2 x workers), capped at 0.25 x
// workers, and `autoTargets` fills that floor directly after `nurse` and `queen-care`, before `forage`."
// targets.ts serves the whole scout demand first (Math.round(demand)), not the floor: where the small-colony rule
// already asks 2 scouts (fewer than 2 known sources of a needed nutrient), a colony under 8 workers sends 2 scouts
// ahead of forage, above both the floor (1) and the 0.25 x workers cap the ruling sets for it.
import { describe, expect, it } from 'vitest';
import { makeColonySim, addChamber, addWorkers, colonyOf, establishQueen, step } from './testkit';
import { computeTargets } from './allocation/targets';
import { missingScoutFloor } from './allocation/demand';
import { ti } from './taskIdx';

const T = (t: string) => ti(t as never);

function colony(workers: number) {
  const sim = makeColonySim({ summerDay: 3 });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, royal);
  addWorkers(sim, workers, { chamber: royal });
  step(sim, 20);
  return colonyOf(sim);
}

describe('colony-life round 11 review: R38 item 1 fills the floor, not more, before forage', () => {
  it('6 workers, scout demand 2 (small-colony floor), missing floor 1.2: 1 scout ahead of forage', () => {
    const col = colony(6);
    expect(missingScoutFloor(6)).toBeCloseTo(1.2, 9);
    col.alloc.demand.fill(0);
    col.alloc.demand[T('nurse')] = 2; col.alloc.demand[T('queen-care')] = 1;
    col.alloc.demand[T('forage')] = 12; col.alloc.demand[T('scout')] = 2;
    computeTargets(col, 6, false, undefined, false, 0, missingScoutFloor(6)); // round 12: the floor, not a flag
    const scouts = col.alloc.target[T('scout')];
    // ruling: the floor (1.2 -> 1, and never above 0.25 x 6 = 1.5) is served before forage; the rest of the scout
    // demand waits for its place in the GDD order, where forage takes the remaining workers first
    expect(scouts, `scouts ${scouts}, forage ${col.alloc.target[T('forage')]}`).toBeLessThanOrEqual(Math.floor(0.25 * 6));
  });

  it('control: 15 workers (floor 3 = scout demand): 3 scouts, as the round tested', () => {
    const col = colony(15);
    col.alloc.demand.fill(0);
    col.alloc.demand[T('nurse')] = 2; col.alloc.demand[T('queen-care')] = 1;
    col.alloc.demand[T('forage')] = 15; col.alloc.demand[T('tend')] = 15; col.alloc.demand[T('scout')] = 3;
    computeTargets(col, 15, false, undefined, false, 0, missingScoutFloor(15));
    expect(col.alloc.target[T('scout')]).toBe(3);
  });
});
