// econ-growth review: the honeydew of the herds a colony works counts as known carbohydrate capacity (allocation/
// demand.ts knownCapacity), so a colony living on its herds does not report a carbohydrate scout shortfall of 1 and
// send scouts out for sugar it already has. The herd adds no forager-equivalents: tenders are the `tend` demand.

import { describe, expect, it } from 'vitest';
import { HONEYDEW_PER_APHID } from '@/sim/balance';
import { colonySlotBit } from '@/sim/entities';
import { herdSourceOf } from '@/sim/ecology';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { knownCapacity, scoutShortfall } from './allocation/demand';

const APHIDS = 200;

function herdColony(known: boolean) {
  const { sim, plants } = plantSim({ workers: 20, sizeBu: 400, herbs: [{ dx: 80, dz: 40 }], seed: 1 });
  const col = sim.state.colonies[0];
  const herd = addHerd(sim, plants[0], APHIDS, { kMax: APHIDS + 50 });
  if (known) herdSourceOf(sim, herd)!.discoveredBy |= colonySlotBit(sim, col.id);
  // short of carbohydrate (no stock, need 1), protein stocked
  col.needs.rateC = 10; col.needs.rateP = 1; col.needs.needC = 1; col.needs.needP = 0;
  col.stores.c = 0; col.stores.p = 10;
  return { sim, col };
}

describe('herd honeydew counts as known carbohydrate capacity (econ-growth review)', () => {
  it('a known 200-aphid herd adds its full-tending honeydew to the C capacity, and no foragers', () => {
    const { sim, col } = herdColony(true);
    const k = knownCapacity(sim, col);
    expect(k.loadsC).toBeCloseTo(APHIDS * HONEYDEW_PER_APHID, 6);
    expect(k.loadsP).toBe(0);
    expect(k.ants).toBe(0);
    // want = rate 10 + (3 gd x 10 - 0) / 2 = 25 C/gd against 20 C/gd from the herd: shortfall 0.2, not 1
    expect(scoutShortfall(col, k)).toBeCloseTo(1 - 20 / 25, 6);
  });

  it('an unknown herd does not count', () => {
    const { sim, col } = herdColony(false);
    const k = knownCapacity(sim, col);
    expect(k.loadsC).toBe(0);
    expect(scoutShortfall(col, k)).toBe(1);
  });
});
