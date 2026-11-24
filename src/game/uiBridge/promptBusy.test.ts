// The lay-egg prompt line while the queen's batch runs (look pass 6, integrator ruling 1): busy and greyed, not offered as available.
import { describe, expect, it } from 'vitest';
import { installFakes, makeAntSim, step } from '@/sim/ants/actions/testkit';
import type { Ant } from '@/sim/types';
import { markBusy, promptOf } from './hudSlices';

const line = (actionId: string | null, ok = true, text = 'Lay egg') => ({ actionId, ok, text });

describe('the lay-egg prompt line while a batch runs', () => {
  it('reads "Lay egg — busy" and is not ok while the queen\'s own lay-egg action is running', () => {
    const q = { action: { id: 'lay-egg', phase: 'active' } } as unknown as Ant;
    expect(markBusy(q, line('lay-egg'))).toEqual({ text: 'Lay egg — busy', ok: false });
  });
  it('is the plain line when no action runs, or another one does', () => {
    expect(markBusy({ action: null } as unknown as Ant, line('lay-egg'))).toEqual({ text: 'Lay egg', ok: true });
    expect(markBusy({ action: { id: 'groom' } } as unknown as Ant, line('lay-egg'))).toEqual({ text: 'Lay egg', ok: true });
  });
  it('leaves other lines and lines the sim already refuses as they are', () => {
    const q = { action: { id: 'lay-egg' } } as unknown as Ant;
    expect(markBusy(q, line('groom', true, 'Groom yourself'))).toEqual({ text: 'Groom yourself', ok: true });
    expect(markBusy(q, line('lay-egg', false, 'Lay egg — no strength left today'))).toEqual({ text: 'Lay egg — no strength left today', ok: false });
    expect(markBusy(q, line(null, true, 'Colony orders'))).toEqual({ text: 'Colony orders', ok: true });
  });
  it('promptOf gives the HUD the busy line for the possessed queen mid-batch and the plain one after it', () => {
    const sim = makeAntSim();
    const fakes = installFakes(sim);
    try {
      const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
      q.chamberId = 1; // in a chamber: her prompt is "Lay egg"
      (q.queen as { founding: unknown }).founding = null; q.queen!.eggBudget = 10; q.queen!.gut.p = 1; // ... and she can lay (the colony's budget and protein rules)
      sim.enqueue({ type: 'possess', antId: q.id });
      step(sim, 1);
      const lay = (p: ReturnType<typeof promptOf>) => p?.lines?.find((l) => /^Lay egg/.test(l.text));
      expect(lay(promptOf(sim)), JSON.stringify(promptOf(sim))).toMatchObject({ ok: true, text: 'Lay egg' });
      q.action = { id: 'lay-egg', phase: 'active', startTick: sim.state.tick, durationTicks: 60, target: { kind: 'none', id: -1, pos: { x: 0, y: 0, z: 0 } }, repeat: false, secondary: false, reason: null } as never;
      expect(lay(promptOf(sim))).toMatchObject({ ok: false, text: 'Lay egg — busy' });
      q.action = null;
      expect(lay(promptOf(sim))).toMatchObject({ ok: true, text: 'Lay egg' });
    } finally { fakes.restore(); }
  });
});
