// The lay-egg prompt line through a real press (look pass 6, integrator ruling 1.2): greyed "Lay egg — busy" from the press to the end of the batch
// (the sim's own word for `blocked`, GDD 01 9.3), the plain line again after it. The wording is the simulation's (runner validate -> prompt.ts); the HUD
// shows the lines as they come (the bridge adds nothing): the test pins that nothing is offered as available mid-batch. The first version of this fix (a `markBusy` in
// hudSlices) was dead code: the sim already worded the line, and it is gone.
import { describe, expect, it } from 'vitest';
import { installFakes, makeAntSim, step } from '@/sim/ants/actions/testkit';
import { promptOf } from './hudSlices';

describe('the lay-egg prompt line through a real press', () => {
  it('is offered before the press, busy from the first tick of the batch to its last, and offered again after it (as the egg she laid)', () => {
    const sim = makeAntSim();
    const fakes = installFakes(sim);
    try {
      const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
      q.chamberId = 1;
      (q.queen as { founding: unknown }).founding = null; q.queen!.eggBudget = 10; q.queen!.gut.p = 1;
      sim.enqueue({ type: 'possess', antId: q.id });
      step(sim, 1);
      const lay = () => promptOf(sim)?.lines?.find((l) => /^Lay egg/.test(l.text));
      expect(lay(), JSON.stringify(promptOf(sim))).toMatchObject({ ok: true, text: 'Lay egg' });
      sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'start' });
      step(sim, 1);
      sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'stop' });
      let busyTicks = 0, layBusy = 0;
      for (let i = 0; i < 400 && q.action?.id === 'lay-egg'; i++) {
        // at the end of the batch the primary line becomes the egg she has just laid ("Pick up egg — busy"): whatever line is shown, none is available
        const shown = (promptOf(sim)?.lines ?? []).filter((l) => l.slot !== 'extra');
        expect(shown.filter((l) => l.ok), `tick ${sim.state.tick}`).toEqual([]);
        if (lay()?.text === 'Lay egg — busy') layBusy++;
        busyTicks++;
        step(sim, 1);
      }
      expect(busyTicks).toBeGreaterThan(10);
      expect(layBusy).toBeGreaterThan(10);
      expect(q.action).toBeNull();
      // the egg she has laid lies at her feet: the primary line is the egg (as it was busy at the end of the batch), offered again now
      expect(promptOf(sim)?.lines?.find((l) => l.slot === 'primary')).toMatchObject({ ok: true, text: 'Pick up egg' });
    } finally { fakes.restore(); }
  });
});
