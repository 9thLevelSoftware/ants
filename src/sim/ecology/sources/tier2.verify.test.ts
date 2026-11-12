// Reviewer checks of the Tier 2 switch: ECOLOGY_TIER is a constant (1 today); the module says "raise to 2 when the
// Tier 2 ecology lands". These tests run the module with the constant mocked to 2.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sim/balance/ecology', async (orig) => ({ ...(await orig<typeof import('@/sim/balance/ecology')>()), ECOLOGY_TIER: 2 }));

import { spawnItem } from '@/sim/entities';
import { TICKS_PER_DAY } from '@/sim/time';
import { createSource } from './spawn';
import { carrionFromItem } from './runtime';
import { anchorVariant } from './anchors';
import { centre, anchor, makeSourceSim, stepTicks } from './testkit';

describe('Tier 2 rules (ECOLOGY_TIER mocked to 2)', () => {
  it('runtime carrion drops start fresh and go through the stages', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'insect-small', pos: centre(sim) });
    expect(s.stage).toBe('fresh');
  });

  it('T2 does not create static honeydew-film sites from anchors', () => {
    expect(anchorVariant({ ...anchor('honeydew', 1, 1), id: 0 }, 0)).toBeNull();
  });

  it('a fresh corpse item (stage null) left outside becomes carrion that decays and is removed', () => {
    const sim = makeSourceSim();
    const it = spawnItem(sim, { kind: 'corpse', pos: centre(sim), init: { c: 0.05, p: 0.4, bulk: 0.5 } });
    expect(it.stage).toBeNull(); // items are created without a stage
    const id = carrionFromItem(sim, it.id);
    const s = sim.stores.sources.get(id);
    expect(s?.stage).toBe('fresh'); // BUG: stays null -> no stage clock, and T2 insect-small has no lifetime
    stepTicks(sim, 8 * TICKS_PER_DAY);
    expect(sim.stores.sources.get(id)).toBeUndefined(); // BUG: never removed at T2
  });
});
