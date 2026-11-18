// sim-seams review, item 8 gap: the report could not save mid-`seal` or mid-`lay` (the cheat-driven founding of
// its probe passes both within one tick). Here a founding queen reaches both phases on the founding module's own
// flat loam throat (colony/founding/sealKit.ts), and a save in each loads to an equal state and runs equally.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { TICKS_PER_DAY } from '@/sim/time';
import { OPEN_AUTO_SEAL_GD } from '@/sim/balance/founding';
import { throatCase } from '@/sim/colony/founding/sealKit';
import { phase, pinTemperature, stepUntil } from '@/sim/colony/founding/testkit';
import { restore, snapshot } from './snapshot';
import { stateHash } from './hash';

/** Saves, loads, steps both; the first checked tick at which they differ, or -1. */
function roundTrip(live: Sim, ticks: number): number {
  const loaded = createSim(restore(snapshot(live)).state, live.world, { systems: live.systems });
  pinTemperature(loaded, 22); // the runtime climate pin of the live sim (not state), installed again
  if (stateHash(live.state) !== stateHash(loaded.state)) return 0;
  for (let i = 1; i <= ticks; i++) {
    live.tick();
    loaded.tick();
    if (i % 50 === 0 && stateHash(live.state) !== stateHash(loaded.state)) return i;
  }
  return -1;
}

describe('save round trips in the founding phases seal and lay (review)', () => {
  it('mid-seal and at the start of lay', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim;
    pinTemperature(sim, 22);
    expect(phase(sim)).toBe('seal');
    expect(roundTrip(sim, 300), 'mid-seal').toBe(-1);
    stepUntil(sim, () => phase(sim) !== 'seal', OPEN_AUTO_SEAL_GD * TICKS_PER_DAY + 3000);
    expect(phase(sim)).toBe('lay');
    expect(roundTrip(sim, 300), 'lay').toBe(-1);
  }, 180_000);
});
