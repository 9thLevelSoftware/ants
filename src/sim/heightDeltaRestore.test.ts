// Sweep-5 review finding 2: after a load the ground under a footprint (human-event terrain delta, GDD 04 §15.4) must
// read the same as in the game that was saved, from the first tick on. The human-events system registers the delta
// tiles as height overlays at its first tick, but ant-thermal runs before it in the environment phase: an ant in a
// cavity under a print read a 0.8-2.4 mm different depth, its body temperature differed, and the loaded game left the
// saved one within 10 ticks. The overlays are now registered when the Sim is built (wiring.ts).

import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { deformDisc, pressPrint } from '@/sim/environment/human/effects/terrain';
import { creatureScene } from '@/sim/ecology/creatures/testkit';

describe('terrain deltas after a load', () => {
  it('the ground under a footprint reads the same in the loaded game before its first tick', () => {
    const sim = creatureScene({ seed: 5, sizeBu: 128 });
    const x = 200, z = 220;
    const before = sim.field.height(x, z);
    deformDisc(sim, x, z, 30, (d) => -3 * (1 - d * d), 'footprint', pressPrint);
    const pressed = sim.field.height(x, z);
    expect(before - pressed).toBeGreaterThan(2);
    const loaded = createSim(restore(snapshot(sim)).state, sim.world);
    expect(loaded.field.height(x, z)).toBe(pressed);
    expect(loaded.field.height(x + 11, z - 7)).toBe(sim.field.height(x + 11, z - 7));
  });
});
