// econ-growth R10: food already spoken for. A forager does not choose a source whose food the trips already on
// their way will take (claims.ts); a renewable source counts the refill until the ant arrives; herd sources are
// not claimed against (their honeydew comes by tending). Small fixture, a few ticks.

import { describe, expect, it } from 'vitest';
import type { Ant } from '@/sim/types';
import { CLAIM_MIN_TRIP_SHARE } from '@/sim/balance/foraging';
import { chooseSource, sourceScore } from './choice';
import { claimsOn, foodLeftFor, unitsPerTrip } from './claims';
import { K, PHASE } from './keys';
import { announce, forageScenario } from './testkit';

/** Puts the ant on an outbound trip to the source (as startOutbound leaves it), without moving it. */
function heading(ant: Ant, sourceId: number): void {
  ant.bb[K.src] = sourceId;
  ant.bb[K.phase] = PHASE.outbound;
}

describe('source claims (econ-growth R10)', () => {
  it('a one-unit carcass with one forager already on its way scores 0 for the next; free again when she is home', () => {
    const { sim, col, sources } = forageScenario({
      workers: 4, sources: [{ kind: 'carrion', variant: 'insect-small', distBu: 60, bearingDeg: 0, units: 1 }],
    });
    const s = sources[0];
    announce(sim, col, s);
    const [a, b] = sim.state.ants.filter((x) => x.caste === 'worker');
    expect(sourceScore(sim, b, s)).toBeGreaterThan(0);
    heading(a, s.id);
    sim.tick(); // the claims cache is per tick
    expect(claimsOn(sim, col.id, s.id)).toBe(1);
    expect(claimsOn(sim, col.id, s.id, a)).toBe(0); // her own claim does not block her
    expect(sourceScore(sim, b, s)).toBe(0);
    expect(chooseSource(sim, b)).toBe(-1);
    a.bb[K.phase] = PHASE.return;
    sim.tick();
    expect(sourceScore(sim, b, s)).toBeGreaterThan(0);
  });

  it('a big spill takes many claims; the cut-off is the food left for one more trip', () => {
    const { sim, col, sources } = forageScenario({
      workers: 12, sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 60, bearingDeg: 0, units: 4 }],
    });
    const s = sources[0];
    announce(sim, col, s);
    const ants = sim.state.ants.filter((x) => x.caste === 'worker');
    const per = unitsPerTrip(sim, ants[0], s);
    const room = Math.floor((s.units - CLAIM_MIN_TRIP_SHARE * per) / per + 1e-9) + 1; // trips that still find food
    for (let i = 0; i < room - 1; i++) heading(ants[i], s.id);
    sim.tick();
    expect(foodLeftFor(sim, ants[ants.length - 1], s, 0)).toBe(true);
    heading(ants[room - 1], s.id);
    sim.tick();
    expect(foodLeftFor(sim, ants[ants.length - 1], s, 0)).toBe(false);
  });

  it('a refilling flower takes as many ants on their way as it has slots, empty or not', () => {
    const { sim, col, sources } = forageScenario({
      workers: 6, sources: [{ kind: 'nectar', variant: 'flower', distBu: 60, bearingDeg: 0, units: 1.5 }],
    });
    const s = sources[0];
    announce(sim, col, s);
    const ants = sim.state.ants.filter((x) => x.caste === 'worker');
    s.units = 0; // just emptied: it refills while they walk (partial crops)
    const slots = Math.max(1, s.slots);
    for (let i = 0; i < slots - 1; i++) heading(ants[i], s.id);
    sim.tick();
    expect(foodLeftFor(sim, ants[ants.length - 1], s, 0)).toBe(true);
    heading(ants[slots - 1], s.id);
    sim.tick();
    expect(foodLeftFor(sim, ants[ants.length - 1], s, 0)).toBe(false);
  });
});
