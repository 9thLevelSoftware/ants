// Brood that is carried is being handled (colony-life round 2): its pile clock (GDD 02 §2.5 `untended`, a pile with
// now - lastTendedTick > UNTENDED_GD) starts where it is put down. Before, the clock ran on while an ant held the
// brood, so a clutch put down after 0.16 gd in a queen-carer's mandibles died `untended` at once (kitchen-door #3).

import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { UNTENDED_GD } from '@/sim/balance/colony';
import { addBrood, addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';

describe('carried brood is tended', () => {
  it('an egg held past UNTENDED_GD and put down is not untended', () => {
    const sim = makeColonySim({ noAllocation: true });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 100);
    establishQueen(sim, ch);
    addWorkers(sim, 1, { chamber: ch, task: 'rest', state: 'rest' });
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 50, p: 20 });
    addBrood(sim, 'egg', 1, ch, 0);
    const egg = sim.state.brood.find((b) => b.alive && b.stage === 'egg')!;
    const carrier = sim.state.ants.find((a) => a.caste === 'worker')!;
    egg.carriedBy = carrier.id; // held (the hazard check skips carried brood; this test is about its clock)
    step(sim, Math.round((UNTENDED_GD + 0.1) * TICKS_PER_DAY));
    egg.carriedBy = -1; // put down
    const untendedFor = (sim.state.tick - egg.lastTendedTick) / TICKS_PER_DAY;
    expect(untendedFor).toBeLessThan(0.05);
  });
});
