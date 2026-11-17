// gate-close-app seam: "E Groom yourself — not now" showed during the nuptial flight. In the air no ground action
// applies, so the possessed ant gets no context prompt. Cross-edit logged in test-output/gate-close/cross-edits.md.
import { afterEach, describe, expect, it } from 'vitest';
import { installFakes, makeAntSim, step, worker } from '../actions/testkit';
import { currentPrompt, promptView } from './prompt';

let restore = (): void => {};
afterEach(() => restore());

describe('prompt in flight', () => {
  it('a possessed ant on the ground has a prompt; in flight it has none', () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const a = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    step(sim, 3);
    expect(promptView(sim, a).primary).not.toBeNull();
    a.alate = { state: 'flying', flightPhase: 'lek', flightEnergy: 1, mating: 0 } as typeof a.alate;
    const v = promptView(sim, a);
    expect(v.primary).toBeNull();
    expect(v.secondary).toBeNull();
    expect(v.extras).toEqual([]);
    expect(currentPrompt(sim, a)).toBeNull();
  });
});
