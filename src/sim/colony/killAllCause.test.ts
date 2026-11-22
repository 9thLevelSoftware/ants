// Direction 17 (colony-life round 9): `cheat.killAll` takes an optional death cause, so the epitaph screen can be shown
// with a real DeathCause; without one (or with an unknown word) the deaths stay 'unknown' as before.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';

describe('cheat.killAll cause', () => {
  it('every death carries the given cause; an unknown word falls back to unknown', () => {
    for (const [given, want] of [['drowning', 'drowning'], ['no-such-cause', 'unknown'], [undefined, 'unknown']] as const) {
      const sim = makeTestSim({ nest: 'small', workers: 3 });
      const colonyId = sim.state.colonies[0].id;
      const causes: string[] = [];
      sim.events.on('ant-died', (e) => { if (e.colonyId === colonyId) causes.push(e.cause); });
      sim.enqueue(given === undefined ? { type: 'cheat.killAll', colonyId } : { type: 'cheat.killAll', colonyId, cause: given });
      sim.tick();
      sim.events.flush();
      expect(causes.length).toBeGreaterThan(0);
      expect(new Set(causes)).toEqual(new Set([want]));
    }
  });
});
