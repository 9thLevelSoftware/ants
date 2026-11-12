// Determinism and plain-data state of the ant module: same seed and commands -> same state hash; a save / restore
// in the middle of running primitives continues exactly like a straight run (no hidden runtime state).
import { afterEach, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { idleIntent } from '@/sim/types';
import { stateHash } from '@/sim/save/hash';
import { restore as restoreSave, snapshot } from '@/sim/save/snapshot';
import { createSim } from '@/sim/sim';
import { findNonPlain } from '@/sim/testing/plainData';
import { ANT_SYSTEMS, ahead, installFakes, larva, makeAntSim, source, step, worker } from './actions/testkit';
import { begin } from './actions/runner';

let restoreFakes = (): void => {};
afterEach(() => restoreFakes());

/** A busy scenario: a possessed digger with a trail, AI ants drinking, feeding, grooming, a death. */
function scenario(sim: Sim): void {
  const a = worker(sim, 50, 50);
  const b = worker(sim, 60, 50);
  const c = worker(sim, 70, 50);
  const s = source(sim, ahead(sim, b, 0.8), 'sugar', 5, { variant: 'sugary-spill' });
  const l = larva(sim, ahead(sim, c, 0.6));
  c.cropC = 0.4; c.cropP = 0.2;
  sim.enqueue({ type: 'possess', antId: a.id });
  sim.enqueue({ type: 'setTrail', on: true });
  sim.setPlayerIntent({ ...idleIntent(), held: ['dig-bite'] });
  begin(sim, b, 'harvest-liquid', { kind: 'source', id: s.id, pos: s.pos });
  begin(sim, c, 'feed-larva', { kind: 'brood', id: l.id, pos: l.pos });
  step(sim, 50);
  begin(sim, c, 'groom', null);
  sim.enqueue({ type: 'cheat.kill', id: b.id, cause: 'predation' });
}

describe('determinism and plain data', () => {
  it('same seed and commands give the same state hash; the state stays plain data', () => {
    const run = (): string => {
      const sim = makeAntSim(11);
      const f = installFakes(sim);
      scenario(sim);
      step(sim, 150);
      expect(findNonPlain(sim.state)).toEqual([]);
      f.restore();
      return stateHash(sim.state);
    };
    expect(run()).toBe(run());
  });

  it('save / restore mid-action continues exactly like a straight run', () => {
    const straight = makeAntSim(12);
    restoreFakes = installFakes(straight).restore;
    scenario(straight);
    step(straight, 7); // mid-bite, mid-groom
    const bytes = snapshot(straight);
    const loaded: Sim = createSim(restoreSave(bytes).state, straight.world, { systems: ANT_SYSTEMS });
    step(straight, 120);
    step(loaded, 120);
    expect(stateHash(loaded.state)).toBe(stateHash(straight.state));
  });
});
