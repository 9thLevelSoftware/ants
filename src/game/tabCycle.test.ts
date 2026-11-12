import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { TAB_LIST_TTL_S, TabCycle, tabCandidates } from './tabCycle';

describe('Tab possession cycling (GDD 01 §3.2, E20)', () => {
  it('cycles through the nearby ants nearest first and wraps on the 6th press of 5', () => {
    const sim = makeTestSim({ nest: 'small', workers: 5 });
    const queen = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const centre = sim.state.ants.find((a) => a.caste === 'worker')!.pos;
    const cands = tabCandidates(sim, centre, queen.id);
    expect(cands.length).toBe(5);
    const t = new TabCycle();
    const got = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((s) => t.next(sim, centre, queen.id, 1, s));
    expect(new Set(got.slice(0, 5)).size).toBe(5);
    expect(got[5]).toBe(got[0]);
  });

  it('rebuilds the list after the TTL', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    const centre = sim.state.ants[0].pos;
    const t = new TabCycle();
    const a = t.next(sim, centre, -1, 1, 0);
    expect(t.next(sim, centre, -1, 1, TAB_LIST_TTL_S + 1)).toBe(a);
  });
});
