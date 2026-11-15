// Every codex id of the design index has an unlock rule that fires from a synthetic trigger, exactly once, writing
// progression.codexSeen and emitting `codex.unlocked` (the profile store listens to it); the cheat unlocks too.

import { describe, expect, it } from 'vitest';
import { allCodexIds } from '@/sim/types';
import { CODEX_RULES } from './index';
import { codexFixture, codexSpecies } from './codexFixtures';
import { makeProgSim, pollOnce, recordEvents } from './testkit';

describe('codex unlock table', () => {
  it('has exactly one rule per codex id of the design index', () => {
    const ids = CODEX_RULES.map((r) => r.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...allCodexIds()].sort());
  });

  it.each(allCodexIds())('%s unlocks from its synthetic trigger, exactly once', (id) => {
    const sim = makeProgSim({ species: codexSpecies(id) });
    const events = recordEvents(sim, ['codex.unlocked']);
    const fixture = codexFixture(id);
    fixture(sim);
    pollOnce(sim);
    expect(sim.state.progression.codexSeen[id], id).toBeTypeOf('number');
    fixture(sim);
    pollOnce(sim);
    expect(events.filter((e) => e.type === 'codex.unlocked' && e.id === id)).toHaveLength(1);
  });

  it('cheat.unlockCodex unlocks a known id once and rejects an unknown one', () => {
    const sim = makeProgSim();
    const events = recordEvents(sim, ['codex.unlocked', 'command-rejected']);
    sim.enqueue({ type: 'cheat.unlockCodex', id: 'cx-honeydew' });
    sim.enqueue({ type: 'cheat.unlockCodex', id: 'cx-honeydew' });
    sim.enqueue({ type: 'cheat.unlockCodex', id: 'cx-nonsense' });
    sim.applyPendingCommands();
    sim.tick();
    expect(events.filter((e) => e.type === 'codex.unlocked' && e.id === 'cx-honeydew')).toHaveLength(1);
    expect(events.some((e) => e.type === 'command-rejected')).toBe(true);
  });
});
