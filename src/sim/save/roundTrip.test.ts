// sim-seams item 8 (cheap part; the generated-world table is in the sim-seams report): a save made in the winter
// prompt, on the first ticks of spring after the lapse, and early in an opening loads to an equal state hash and
// continues equally. The full table (opening phases, time-lapse, hand-over, flood, human event, generated worlds)
// is the probe test-output/sim-seams/probe/saveTable.ts.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import { makeLifeSim, send } from '@/sim/colony/succession/testLife';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { restore, snapshot } from './snapshot';
import { stateHash } from './hash';

/** Saves, loads into a second Sim, and steps both `ticks`; returns the first tick at which the hashes differ, or -1. */
function roundTrip(live: Sim, ticks: number, prepare?: (s: Sim) => void): number {
  const loaded = createSim(restore(snapshot(live)).state, live.world, { systems: live.systems });
  prepare?.(loaded); // runtime test hooks of the live sim (not state) are installed again, as its kit did
  if (stateHash(live.state) !== stateHash(loaded.state)) return 0;
  for (let i = 1; i <= ticks; i++) {
    live.tick();
    loaded.tick();
    if (i % 50 === 0 && stateHash(live.state) !== stateHash(loaded.state)) return i;
  }
  return stateHash(live.state) === stateHash(loaded.state) ? -1 : ticks;
}

/** makeLifeSim's constant chamber climate (a runtime override, not state). */
const lifeClimate = (s: Sim): void => setClimateOverride(s, { chamberTemp: () => 6, pointTemp: () => 6, rh: () => 0.8, surfaceActivity: () => 1 });

describe('save round trips (item 8)', () => {
  it('in the winter prompt (banner) and on the first ticks of spring after the lapse', () => {
    const sim = makeLifeSim({ chamberC: 6 });
    send(sim, { type: 'cheat.triggerWinter' });
    expect(sim.state.env.winter.phase).toBe('banner');
    expect(roundTrip(sim, 300, lifeClimate)).toBe(-1);
    const spring = makeLifeSim({ chamberC: 6 });
    send(spring, { type: 'cheat.triggerWinter' });
    send(spring, { type: 'overwinterChoice', choice: 'begin' });
    send(spring, { type: 'overwinterChoice', choice: 'close-report' });
    expect(roundTrip(spring, 300, lifeClimate)).toBe(-1);
  });

  it('early in an opening (queen searching, all systems)', () => {
    const sim = makeTestSim({ seed: 2 });
    send(sim, { type: 'openingSkipIntro' } as never, 200);
    expect(sim.state.player.opening?.phase).toBe('search');
    expect(roundTrip(sim, 300)).toBe(-1);
  });
});
