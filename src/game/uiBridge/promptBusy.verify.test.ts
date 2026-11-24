// Reviewer's tests for the busy lay-egg prompt (look pass 6, integrator ruling 1.2). They drive a REAL press through the
// command queue (the implementer's test sets `q.action` by hand) and read, at every tick of the batch, the lines the HUD
// gets (promptOf) and the lines the simulation itself offers (promptView, before markBusy).
//
// Finding recorded by the second test: the simulation's own validation (runner.ts validate: any running non-concurrent
// action -> 'blocked', worded "busy" by prompt.ts since the foundation) already greys every line while the batch runs,
// so markBusy() never changes a line in the real game; the implementer's unit test passes with markBusy removed.
import { describe, expect, it } from 'vitest';
import { installFakes, makeAntSim, step } from '@/sim/ants/actions/testkit';
import { promptView } from '@/sim/ants/player';
import type { Sim } from '@/sim/types';
import { promptOf } from './hudSlices';

function pressLay(): { sim: Sim; queenId: number; restore: () => void } {
  const sim = makeAntSim();
  const fakes = installFakes(sim);
  const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
  q.chamberId = 1;
  (q.queen as { founding: unknown }).founding = null; q.queen!.eggBudget = 50; q.queen!.gut.p = 1;
  sim.enqueue({ type: 'possess', antId: q.id });
  step(sim, 1);
  sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'start' });
  step(sim, 1);
  sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'stop' });
  return { sim, queenId: q.id, restore: fakes.restore };
}

describe('busy lay prompt through a real press', () => {
  it('while the batch runs (windup, active, recovery) no HUD line is offered as available', () => {
    const { sim, queenId, restore } = pressLay();
    try {
      const q = sim.stores.ants.get(queenId)!;
      expect(q.action?.id, 'the press started a batch').toBe('lay-egg');
      let ticks = 0;
      const offered: string[] = [];
      for (let i = 0; i < 400 && q.action?.id === 'lay-egg'; i++) {
        for (const l of promptOf(sim)?.lines ?? []) if (l.ok && l.slot !== 'extra') offered.push(`tick ${sim.state.tick} ${q.action.phase}: ${l.text}`);
        ticks++;
        step(sim, 1);
      }
      expect(ticks).toBeGreaterThan(10);
      expect(offered).toEqual([]);
    } finally { restore(); }
  });

  it('the simulation already words the lay line "busy" on every tick of the batch (markBusy adds nothing)', () => {
    const { sim, queenId, restore } = pressLay();
    try {
      const q = sim.stores.ants.get(queenId)!;
      let layLines = 0;
      for (let i = 0; i < 400 && q.action?.id === 'lay-egg'; i++) {
        const v = promptView(sim, q);
        for (const l of [v.primary, v.secondary, ...v.extras]) {
          if (l?.actionId !== 'lay-egg') continue;
          layLines++;
          expect(l, `tick ${sim.state.tick}`).toMatchObject({ ok: false, reason: 'blocked', text: 'Lay egg — busy' });
        }
        step(sim, 1);
      }
      expect(layLines).toBeGreaterThan(10);
    } finally { restore(); }
  });
});
