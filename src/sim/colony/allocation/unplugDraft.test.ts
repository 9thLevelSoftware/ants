// Task opening-fix (the seed-4 opening, Nov 24): four first workers, the unplug floor targeting two diggers, and the
// forager waiting in the cell and the store post kept their tasks for 8 game hours (the 120 s surplus check's slack
// never fires in a colony of four). The draft moves workers that are home and over their task's target to `dig`.
import { describe, expect, it } from 'vitest';
import { addChamber, addWorkers, colonyOf, makeColonySim } from '../testkit';
import { refreshActual } from './index';
import { ti } from '../taskIdx';
import { draftUnplugDiggers } from './unplugDraft';

const T = (t: string) => ti(t as never);

function scene() {
  const sim = makeColonySim({ noAllocation: true });
  const col = colonyOf(sim);
  const ch = addChamber(sim, 'founding', { ...sim.world.queenStart.pos, y: sim.world.queenStart.pos.y - 30 });
  const forager = addWorkers(sim, 1, { task: 'forage', chamber: ch })[0];
  const store = addWorkers(sim, 1, { task: 'store', chamber: ch })[0];
  const nurse = addWorkers(sim, 1, { task: 'nurse', chamber: ch })[0];
  const scout = addWorkers(sim, 1, { task: 'scout', chamber: null })[0]; // away on a trip
  refreshActual(sim, col);
  col.alloc.target.fill(0);
  col.alloc.target[T('dig')] = 2; col.alloc.target[T('nurse')] = 0; col.alloc.target[T('queen-care')] = 1;
  return { sim, col, forager, store, nurse, scout };
}

describe('the unplug draft (opening-fix)', () => {
  it('moves home workers over their target to dig, never a nurse or an ant away on a trip', () => {
    const { sim, col, forager, store, nurse, scout } = scene();
    const def = sim.getSpecies(col.species)!;
    expect(draftUnplugDiggers(sim, col, def, 2)).toBe(2);
    expect(forager.task).toBe('dig');
    expect(store.task).toBe('dig');
    expect(nurse.task).toBe('nurse'); // over its target (0) but brood care is never drafted
    expect(scout.task).toBe('scout'); // outside: GDD 02 §6.5, she changes task when home
    expect(col.alloc.actual[T('dig')]).toBe(2);
    expect(draftUnplugDiggers(sim, col, def, 2)).toBe(0); // the floor is met
  });

  it('does nothing without the floor (an open nest) or for an ant at her own target', () => {
    const { sim, col, forager, store } = scene();
    const def = sim.getSpecies(col.species)!;
    expect(draftUnplugDiggers(sim, col, def, 0)).toBe(0);
    col.alloc.target[T('forage')] = 1; col.alloc.target[T('store')] = 1;
    expect(draftUnplugDiggers(sim, col, def, 2)).toBe(0);
    expect(forager.task).toBe('forage');
    expect(store.task).toBe('store');
  });
});
