// Ruling R21 — the larder of a small nest (colony-life round 4; a deviation from GDD 03 §6.4, where a pile has
// capacity only in food chambers). Round 3 found a nest without a food chamber refusing every solid load once the
// workers' social stomachs were full (P 0.15 per worker): prey carried home lay unbooked on the floor (62 refused
// prey loads on the forage bench). Rule: (a) with no food chamber, solid food is piled on the floor of the chamber the
// brood lives in, one game day of the colony's own need per nutrient, never less than 4 loads; it is booked as stores,
// spoils at that chamber's temperature and its spoiled food lies there; (b) a delivery the full stores refuse while
// the colony has no food chamber makes the first food chamber a planning need at once, whatever the worker count.

import { describe, expect, it } from 'vitest';
import { LARDER_MIN_LOADS, STOMACH_P_PER_ADULT } from '@/sim/balance/colony';
import { TICKS_PER_DAY } from '@/sim/time';
import { liveInputs, missingType } from '@/sim/nest/architect/needs';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { depositFood, poolSpace } from './index';
import { needRates } from './needs';

/** 10 workers, a royal chamber with the queen, a nursery with 6 larvae (or pupae); no food chamber unless asked. */
function smallNest(o: { foodChamber?: boolean; nurseryC?: number; care?: boolean; brood?: 'larva' | 'pupa' } = {}) {
  const sim = makeColonySim({
    climate: { chamberTemp: (id) => (id === nurseryId ? o.nurseryC ?? 25 : 25) },
    // scripted nurses keep the larvae alive (the brood stays in the nursery)
    extra: o.care ? [careSystem({ tend: true, haul: false })] : [],
  });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 0);
  const nursery = addChamber(sim, 'nursery', { x: 160, y: -40, z: 100 }, 0);
  nurseryId = nursery.id;
  const food = o.foodChamber ? addChamber(sim, 'food', { x: 220, y: -40, z: 100 }, 0) : undefined;
  establishQueen(sim, royal);
  addWorkers(sim, 10, { chamber: royal, task: 'rest', state: 'rest' });
  addBrood(sim, o.brood ?? 'larva', 6, nursery);
  step(sim, 10); // one colony cycle: capacity, larder
  return { sim, col: colonyOf(sim), royal, nursery, food };
}
let nurseryId = -1;

describe('the larder of a small nest (R21)', () => {
  it('(a) with no food chamber the brood chamber holds a pile of one game day of need per nutrient, at least 4 loads', () => {
    const { sim, col, nursery } = smallNest();
    expect(col.core!.larderChamberId).toBe(nursery.id); // the brood lives in the nursery
    const need = needRates(col);
    const larderP = Math.max(LARDER_MIN_LOADS, need.p);
    expect(col.core!.larderP).toBeCloseTo(larderP, 9);
    expect(col.core!.larderC).toBeCloseTo(Math.max(LARDER_MIN_LOADS, need.c), 9);
    // protein: the social stomach (0.15 per worker), then the larder; what is beyond is refused
    const got = depositFood(sim, col.id, 0, 100);
    expect(got.p).toBeCloseTo(STOMACH_P_PER_ADULT * 10 + larderP, 6);
    expect(poolSpace(col).p).toBeCloseTo(0, 6);
    // the larder of one nutrient is not taken by the other
    expect(poolSpace(col).c).toBeGreaterThan(LARDER_MIN_LOADS);
  });

  it('(a) a colony with a food chamber has no larder (GDD 03 §6.4 unchanged)', () => {
    const { sim, col } = smallNest({ foodChamber: true });
    expect(col.core!.larderP).toBe(0);
    expect(depositFood(sim, col.id, 0, 100).p).toBeCloseTo(STOMACH_P_PER_ADULT * 10, 6); // the food chamber's piles are 0 here
    expect(col.core!.larderRefusedTick ?? -1).toBe(-1); // (b) does not apply
  });

  it('(a) larder food spoils at the brood chamber temperature and the spoiled food lies in that chamber', () => {
    // pupae (tended, they eat nothing) keep the brood in the nursery; the pile is the only P beyond the stomachs
    const { sim, col, nursery } = smallNest({ nurseryC: 20, care: true, brood: 'pupa' });
    depositFood(sim, col.id, 0, STOMACH_P_PER_ADULT * 10 + 4);
    const pile0 = col.stores.p - STOMACH_P_PER_ADULT * 10;
    expect(pile0).toBeCloseTo(4, 6);
    step(sim, 2 * TICKS_PER_DAY);
    expect(col.core!.larderChamberId).toBe(nursery.id);
    // P half-life 3 gd at 20 C (GDD 02 §5.1): 2^(-2/3) = 0.63 of the pile is left after 2 gd; the queen eats from the
    // pool too, so at most that
    expect(col.stores.p - STOMACH_P_PER_ADULT * 10).toBeLessThan(pile0 * 0.64);
    const spoiled = sim.state.items.filter((i) => i.alive && i.wasteKind === 'spoiled-food');
    expect(spoiled.length).toBeGreaterThan(0);
    expect(spoiled.map((i) => i.chamberId)).toEqual(spoiled.map(() => nursery.id));
  });

  it('(b) a delivery refused while there is no food chamber makes the first food chamber a missing type at 10 workers', () => {
    const { sim, col } = smallNest();
    const nest = sim.stores.nests.get(col.nestIds[0])!;
    expect(missingType(nest, 'lasius-niger', liveInputs(sim, nest), true)).toBeNull(); // 10 < 25 workers
    depositFood(sim, col.id, 0, 100); // more than stomach + larder: refused in part
    expect(col.core!.larderRefusedTick).toBe(sim.state.tick);
    const inputs = liveInputs(sim, nest);
    expect(inputs.workers).toBe(10);
    expect(missingType(nest, 'lasius-niger', inputs, true)).toMatchObject({ type: 'food', size: 's' });
  });
});
