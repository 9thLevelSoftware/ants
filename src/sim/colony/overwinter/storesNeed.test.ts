// Ruling R27 (winter stores, Nov 17 19:05): the stores at the first tick of winter must cover the lapse's own C need
// plus WINTER_STORES_SPRING_GD game days of the adults' spring need; the autumn stock target (R6) aims for it.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, seasonLength } from '@/sim/time';
import { AUTUMN_STOCK_TARGET_C_MULT } from '@/sim/balance/colony';
import { WINTER_STORES_SPRING_GD, WINTER_STORES_TARGET_MARGIN } from '@/sim/balance/lifecycle';
import { colonyOf, makeLifeSim, step } from '../succession/testLife';
import { needRates, targetDays } from '../needs';
import { clusterOf } from './climate';
import { dayNeedC, metFactor } from './model';
import { winterParams } from './begin';
import { winterStoresNeed } from './storesNeed';

describe('R27: winter stores need', () => {
  it('is the lapse need at the cluster temperature now plus 4 gd of the adults\' C need', () => {
    const sim = makeLifeSim({ chamberC: 8, workers: 20, larvae: 6, c: 5, p: 2 });
    step(sim, 20); // a colony cycle sets the adults' need rates
    const col = colonyOf(sim);
    const n = winterStoresNeed(sim, col);
    const def = sim.getSpecies(col.species)!;
    const fMet = metFactor(winterParams(sim, def), clusterOf(sim, col).tNow);
    expect(n.lapseC).toBeCloseTo(seasonLength(sim.state) * dayNeedC(20, 6, true, fMet), 6);
    const adult = (col.core!.acc['inst.upkeepC'] ?? 0) + (col.core!.acc['inst.queenC'] ?? 0);
    expect(adult).toBeGreaterThan(0);
    expect(n.springC).toBeCloseTo(WINTER_STORES_SPRING_GD * adult, 6);
    expect(n.needC).toBeCloseTo(n.lapseC + n.springC, 9);
    // a warmer cluster burns more over the winter
    const warm = makeLifeSim({ chamberC: 14, workers: 20, larvae: 6, c: 5, p: 2 });
    step(warm, 20);
    expect(winterStoresNeed(warm, colonyOf(warm)).lapseC).toBeGreaterThan(n.lapseC);
  });

  it('the autumn carbohydrate stock target covers R27\'s need with its margin (and never less than the old x2)', () => {
    const sim = makeLifeSim({ chamberC: 8, workers: 30, larvae: 10, c: 5, p: 2 });
    const col = colonyOf(sim);
    step(sim, 20);
    const summer = targetDays(col).c;
    sim.state.tick += 7 * TICKS_PER_DAY; // summer -> autumn (the colony test sim has no clock commands)
    step(sim, 20);
    const targetLoads = targetDays(col).c * needRates(col).c;
    expect(targetLoads).toBeGreaterThanOrEqual(winterStoresNeed(sim, col).needC * WINTER_STORES_TARGET_MARGIN - 1e-6);
    expect(targetDays(col).c).toBeGreaterThanOrEqual(summer * AUTUMN_STOCK_TARGET_C_MULT - 1e-6);
  });
});
