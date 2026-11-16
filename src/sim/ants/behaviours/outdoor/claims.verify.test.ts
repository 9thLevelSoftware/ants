// econ-growth review (verify): source claims (claims.ts) must only count ants that are really on a trip to the
// source. Claims are read from the outdoor blackboard keys (fo.src / fo.ph), which the outdoor behaviour's exit()
// does not reset. A forager reassigned while still in the nest on its outbound leg (taking its departure ration or
// walking to the exit: deliver-first does not hold it, it carries nothing) keeps `fo.ph = outbound` under its new
// task, so it claims the source for as long as it does nest work. On a one-unit carcass one such phantom claim
// blocks every forager of the colony from choosing it (chooseSource -> -1).

import { describe, expect, it } from 'vitest';
import { enteredTask } from '@/sim/ants/behaviourRunner';
import { chooseSource } from './choice';
import { claimsOn, foodLeftFor } from './claims';
import { K, PHASE } from './keys';
import { announce, forageScenario } from './testkit';

describe('claims count only ants on a trip (econ-growth verify)', () => {
  it('a forager reassigned to nursing inside the nest no longer claims the carcass it was heading for', () => {
    const { sim, col, sources } = forageScenario({
      workers: 4, sources: [{ kind: 'carrion', variant: 'insect-small', distBu: 60, bearingDeg: 0, units: 1 }],
    });
    const s = sources[0];
    announce(sim, col, s);
    const [a, b] = sim.state.ants.filter((x) => x.caste === 'worker');
    // a enters the forage behaviour and is put on its outbound leg while still inside (as startOutbound leaves it)
    a.task = 'forage';
    for (let i = 0; i < 50 && enteredTask(a) !== 'forage'; i++) sim.tick();
    expect(enteredTask(a)).toBe('forage');
    a.bb[K.src] = s.id;
    a.bb[K.phase] = PHASE.outbound;
    expect(a.nestId).toBeGreaterThanOrEqual(0);
    // the allocator moves her to nursing before she leaves the nest
    a.task = 'nurse';
    for (let i = 0; i < 50 && enteredTask(a) !== 'nurse'; i++) sim.tick();
    expect(enteredTask(a)).toBe('nurse');
    sim.tick();
    // she is no longer on a trip: her old outbound phase must not claim the carcass
    expect(claimsOn(sim, col.id, s.id)).toBe(0);
    expect(foodLeftFor(sim, b, s, 0)).toBe(true);
    expect(chooseSource(sim, b)).toBe(s.id);
  });
});
