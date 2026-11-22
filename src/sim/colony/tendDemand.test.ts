// R39 (colony-life direction 26 item 1, round 12): the `tend` demand follows the carbohydrate the colony wants.
// tend = min(Σ slots, max(keep, ceil(TEND_HEADROOM x wantC / C one tender brings a gd))), keep = 1 a workable herd
// while the surface is workable; a herd under the colony's forage marker keeps its (multiplied) slots.

import { describe, expect, it } from 'vitest';
import { colonySlotBit, placeMarker } from '@/sim/entities';
import { herdSourceOf } from '@/sim/ecology';
import { tendersWanted } from '@/sim/ecology/plants/demand';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { forageWant, knownCapacity, tendDemand, tendKeep } from './allocation/demand';

/** A colony of 15 that knows `aphids.length` herds; carbohydrate rate rateC, stock stockC. */
function colonyWithHerds(aphids: number[], rateC: number, stockC: number) {
  const herbs = aphids.map((_, i) => ({ dx: 60 + 30 * i, dz: 30 }));
  const { sim, plants } = plantSim({ workers: 15, sizeBu: 400, herbs, seed: 1 });
  const col = sim.state.colonies[0];
  const herds = aphids.map((a, i) => {
    const h = addHerd(sim, plants[i], a, { kMax: a + 50 });
    herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
    return h;
  });
  col.needs.rateC = rateC; col.needs.rateP = 0.5; col.needs.needC = stockC > 0 ? 0 : 1; col.needs.needP = 0.5;
  col.stores.c = stockC; col.stores.p = 0;
  return { sim, col, herds };
}

describe('R39: tenders follow the carbohydrate want', () => {
  it('two herds (4 slots), carbohydrate stock over its target: the keep, 2, not 4', () => {
    const { sim, col } = colonyWithHerds([20, 20], 1, 40);
    const want = forageWant(col).c;
    expect(want).toBeCloseTo(1, 6); // stock over target: the rate only
    // one tender brings 20 x 0.1 / 2 = 1 C a gd: ceil(1.25 x 1 / 1) = 2 = the keep
    expect(tendDemand(sim, col, knownCapacity(sim, col), true)).toBe(2);
  });

  it('the same herds with no stock and a need: all 4 slots', () => {
    const { sim, col } = colonyWithHerds([20, 20], 1, 0);
    expect(tendDemand(sim, col, knownCapacity(sim, col), true)).toBe(4);
  });

  it('one herd of 100 aphids (6 slots) and a small want: the want (2), not 6', () => {
    const { sim, col } = colonyWithHerds([100], 2, 40);
    // one tender: 100 x 0.1 / 6 = 1.67 C a gd; ceil(1.25 x 2 / 1.67) = 2
    expect(tendDemand(sim, col, knownCapacity(sim, col), true)).toBe(2);
  });

  it('a small want on an unworkable surface: no keep, the want alone', () => {
    const { sim, col } = colonyWithHerds([20, 20], 0.5, 40);
    // want 0.5 C a gd, one tender 1 C a gd: ceil(0.625) = 1; the keep (2) only while the surface is workable
    expect(tendDemand(sim, col, knownCapacity(sim, col), false)).toBe(1);
    expect(tendDemand(sim, col, knownCapacity(sim, col), true)).toBe(2);
  });

  it('a herd under the colony forage marker keeps its multiplied slots', () => {
    const { sim, col, herds } = colonyWithHerds([20], 1, 40);
    const src = herdSourceOf(sim, herds[0])!;
    placeMarker(sim, { kind: 'forage', colony: col.id, pos: { ...src.pos }, radius: 20 * sim.world.bu });
    expect(tendDemand(sim, col, knownCapacity(sim, col), true)).toBe(tendersWanted(sim, col, herds[0]));
    expect(tendersWanted(sim, col, herds[0])).toBe(4);
  });

  it('the keep holds a large herd against a rival (tend above RIVAL_TEND_GUARD 0.2)', () => {
    expect(tendKeep(20)).toBe(1);
    expect(tendKeep(200)).toBe(1); // 4 needed at full tending: 1 tender = 0.25
    expect(tendKeep(250)).toBe(2); // 5 needed: 1 tender = 0.2, not above the guard
    expect(tendKeep(600)).toBe(3); // 12 needed: 0.2 x 12 = 2.4 -> 3
  });
});
