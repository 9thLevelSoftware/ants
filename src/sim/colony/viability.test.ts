// viab-economy rules (task docs/design/tasks/viab-economy.md): the provisioned hand-over and its grace (R2), the
// small-colony forage floor and spontaneous departures (R3), the laying-protein release (R4), honest diagnostics and
// alerts (R6). Colony-level tests on the colony test sim; the generated-world sweep is tools/sim/life.ts.

import { describe, expect, it } from 'vitest';
import type { Diagnostic, Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import {
  AUTUMN_STOCK_TARGET_C_MULT, HANDOVER_PROVISION_WINDOW_GD, HANDOVER_QUEEN_KEEP_C, HANDOVER_QUEEN_KEEP_P, LAYING_RELEASE_FLOOR_DAYS, SMALL_OUTSIDE_FRAC, SMALL_SCOUTS_MIN,
  SMALL_COLONY_N, SMALL_SPONT_MULT_MAX, STARVE_ALERT_GRACE_GD, WINTER_RESERVE_FROM_D28,
} from '@/sim/balance';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { provisionAtHandover, starvationHeld } from './handover';
import { smallColonySpontMult } from './activation';
import { computeDemand } from './allocation/demand';
import { censusOf } from './census';
import { ti } from './taskIdx';
import { layingProteinPermitted, layingReleaseShare, queenProteinCredit, queenWantsFood, winterReserveShort } from './queen';
import { setClimateOverride } from './envAdapter';
import { feedFromCrop, poolCapacity, poolSpace } from './stores';
import { publishWithHysteresis } from './diagFactors';
import { SEASON_STOCK_C_KEY, daysOfStock, needRates, targetDays } from './needs';

/** A colony whose founding lapse ended at `endTick` (the hand-over), queen established with these reserves. */
function handedOver(reserveC: number, reserveP: number, workers = 12): { sim: Sim; endTick: number } {
  const sim = makeColonySim();
  const ch = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 });
  const q = establishQueen(sim, ch);
  q.queen!.reserve = reserveC;
  q.queen!.reserveP = reserveP;
  addWorkers(sim, workers, { chamber: ch, ageGd: 1 });
  const op = sim.state.player.opening!;
  // the opening is over, as in a real game a few seconds after the hand-over card (founding/system.ts): stores
  // alerts are then held by the grace alone, not by foundingInProgress
  op.phase = 'done';
  op.done = true;
  op.lapse = { startTick: 0, endTick: sim.state.tick, skipped: false, outcome: '' };
  sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 0, p: 0 });
  sim.applyPendingCommands();
  return { sim, endTick: sim.state.tick };
}

describe('R2: the hand-over is provisioned', () => {
  it('the queen keeps her own floor; the rest of her reserve goes into the pool', () => {
    const { sim } = handedOver(11, 11);
    const col = colonyOf(sim);
    const q = sim.stores.ants.get(col.queenId)!;
    const ledger0 = col.ledger.inRecycledC;
    step(sim, 20); // the colony cycle provisions once
    const movedC = 11 - q.queen!.reserve, movedP = 11 - q.queen!.reserveP;
    expect(movedC).toBeGreaterThan(5);
    expect(movedC).toBeLessThanOrEqual(11 - HANDOVER_QUEEN_KEEP_C + 0.01);
    expect(movedP).toBeGreaterThan(0);
    expect(q.queen!.reserve).toBeGreaterThanOrEqual(HANDOVER_QUEEN_KEEP_C - 0.05); // her floor (less a little upkeep)
    expect(q.queen!.reserveP).toBeGreaterThanOrEqual(HANDOVER_QUEEN_KEEP_P - 1e-9);
    expect(col.ledger.inRecycledC - ledger0).toBeCloseTo(movedC, 1); // booked as recycled food
    expect(col.stores.c).toBeGreaterThan(5);
    expect(provisionAtHandover(sim, col)).toEqual({ c: 0, p: 0 });
  });

  it('what a full pool cannot hold at the hand-over moves in later, once there is room', () => {
    const { sim } = handedOver(HANDOVER_QUEEN_KEEP_C, 9);
    const col = colonyOf(sim);
    const q = sim.stores.ants.get(col.queenId)!;
    const room = poolSpace(col);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: room.c, p: 0 }); // the pool full of carbohydrate
    sim.applyPendingCommands();
    const before = provisionAtHandover(sim, col);
    expect(before.p).toBeLessThan(0.5);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 0, p: 0 }); // room again
    sim.applyPendingCommands();
    step(sim, 20);
    // the queen pays in what the workers' social stomachs hold (round 5: never into a larder or pile, where it spoils);
    // the rest stays in her body for the next cycle
    const stomachP = poolCapacity(col).stomachP;
    expect(col.stores.p).toBeGreaterThan(Math.min(stomachP, 9 - HANDOVER_QUEEN_KEEP_P) - 0.05);
    expect(q.queen!.reserveP + col.stores.p).toBeGreaterThan(9 - before.p - 0.05); // nothing lost on the way
    expect(q.queen!.reserveP).toBeGreaterThanOrEqual(HANDOVER_QUEEN_KEEP_P - 1e-9);
    // as the stomachs empty (the brood eats), more comes in
    const p1 = q.queen!.reserveP;
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 0, p: 0 });
    sim.applyPendingCommands();
    step(sim, 20);
    expect(q.queen!.reserveP).toBeLessThan(p1 - Math.min(stomachP, p1 - HANDOVER_QUEEN_KEEP_P) + 0.05);
  });

  it('the carbohydrate provision ends HANDOVER_PROVISION_WINDOW_GD after the hand-over (her fat is hers), the protein is paid in while she holds it', () => {
    const { sim, endTick } = handedOver(HANDOVER_QUEEN_KEEP_C, HANDOVER_QUEEN_KEEP_P);
    const col = colonyOf(sim);
    const q = sim.stores.ants.get(col.queenId)!;
    step(sim, 20); // pool capacity set by the colony cycle; the queen at her keep gives nothing
    sim.state.tick = endTick + Math.ceil(HANDOVER_PROVISION_WINDOW_GD * TICKS_PER_DAY) + 1;
    q.queen!.reserve = HANDOVER_QUEEN_KEEP_C + 4; // e.g. fattened for the winter
    q.queen!.reserveP = HANDOVER_QUEEN_KEEP_P + 4; // what the first larvae have not eaten yet (round 6, P1d)
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 0, p: 0 });
    sim.applyPendingCommands();
    const late = provisionAtHandover(sim, col);
    expect(late.c).toBe(0);
    expect(late.p).toBeGreaterThan(0); // into the empty stomachs
    expect(col.stores.p).toBeLessThanOrEqual(poolCapacity(col).stomachP + 1e-9); // never past the stomachs (P1)
    sim.state.tick = endTick + Math.floor(HANDOVER_PROVISION_WINDOW_GD * TICKS_PER_DAY) - 1;
    expect(provisionAtHandover(sim, col).c).toBeGreaterThan(3.9);
  });

  it('a queen at or below her floor gives nothing', () => {
    const { sim } = handedOver(2, 0.5);
    expect(provisionAtHandover(sim, colonyOf(sim))).toEqual({ c: 0, p: 0 });
  });

  it('within the grace, workers refill no fat from a pool under its carbohydrate target', () => {
    const { sim } = handedOver(HANDOVER_QUEEN_KEEP_C, HANDOVER_QUEEN_KEEP_P);
    const col = colonyOf(sim);
    step(sim, 20); // needs rates set
    const ws = sim.state.ants.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker');
    for (const w of ws) w.energy = 0.05;
    const rate = needRates(col).c;
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 2 * rate, p: 1 }); // 2 gd: above lean, under target
    sim.applyPendingCommands();
    const e0 = ws.reduce((s, w) => s + w.energy, 0);
    step(sim, 200);
    expect(daysOfStock(col).c).toBeLessThan(targetDays(col).c);
    expect(ws.reduce((s, w) => s + w.energy, 0)).toBeLessThanOrEqual(e0 + 1e-9);
  });

  it('no starvation stage and no stores alert within the grace after the hand-over, even with an empty pool', () => {
    const { sim, endTick } = handedOver(HANDOVER_QUEEN_KEEP_C, HANDOVER_QUEEN_KEEP_P);
    const col = colonyOf(sim);
    const stages: string[] = [];
    sim.events.on('starvation-stage', (e) => { if (e.colonyId === col.id) stages.push(e.stage); });
    const graceTicks = STARVE_ALERT_GRACE_GD * TICKS_PER_DAY;
    for (let t = 0; t < graceTicks - 50; t += 50) {
      step(sim, 50);
      expect(starvationHeld(sim, col)).toBe(sim.state.tick - endTick < graceTicks);
      expect(col.starvationStage).toBe('fed');
    }
    expect(stages).toEqual([]);
    const kinds = sim.state.progression.alerts.map((a) => a.kind);
    expect(kinds).not.toContain('food-c-low');
    expect(kinds).not.toContain('food-p-low');
    expect(kinds).not.toContain('colony-starving');
    // after the grace the stages run again (the pool is empty: rationing at least)
    step(sim, 0.3 * TICKS_PER_DAY);
    expect(col.starvationStage).not.toBe('fed');
    // with no brood the starving alert never says brood is sacrificed (R6)
    step(sim, 0.6 * TICKS_PER_DAY);
    const starving = sim.state.progression.alerts.find((a) => a.kind === 'colony-starving');
    expect(starving).toBeDefined();
    expect(starving!.cause).not.toMatch(/brood/);
  });
});

describe('R2 / R6: no stage and no stores alert while the founding queen is alone', () => {
  it('an empty pool during the opening is no famine: stage fed, no food-c-low / food-p-low / colony-starving', () => {
    const sim = makeColonySim(); // the test world's queen is still the founding queen (opening at its intro card)
    const col = colonyOf(sim);
    expect(sim.stores.ants.get(col.queenId)?.queen?.founding).toBeTruthy();
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 0, p: 0 });
    step(sim, 0.7 * TICKS_PER_DAY);
    expect(col.starvationStage).toBe('fed');
    const kinds = sim.state.progression.alerts.map((a) => a.kind);
    for (const k of ['food-c-low', 'food-p-low', 'colony-starving']) expect(kinds).not.toContain(k);
    const p = sim.state.progression.diagnostics.find((d) => d.id === 'diag-food-intake-p');
    expect(p).toBeDefined();
    if (p!.status === 'ok') expect(p!.value).toBeGreaterThan(0.5); // never "Good at 0.0 of need"
  });
});

describe('R3: small colonies forage', () => {
  it('under the stock target, forage + scout demand is at least max(2, 35 %) with 2 scouts until 2 sources are known', () => {
    const { sim } = handedOver(3, 1, 12);
    const col = colonyOf(sim);
    step(sim, 200);
    col.needs.needC = 1; col.needs.needP = 1;
    const d = computeDemand(sim, col, censusOf(sim, col.id));
    expect(d[ti('scout')]).toBeGreaterThanOrEqual(SMALL_SCOUTS_MIN);
    expect(d[ti('forage')] + d[ti('scout')]).toBeGreaterThanOrEqual(Math.max(2, SMALL_OUTSIDE_FRAC * 12) - 1e-6);
  });

  it('no floor when the stores are at their target', () => {
    const { sim } = handedOver(3, 1, 12);
    const col = colonyOf(sim);
    step(sim, 200);
    col.needs.needC = 0; col.needs.needP = 0;
    const d = computeDemand(sim, col, censusOf(sim, col.id));
    expect(d[ti('forage')] + d[ti('scout')]).toBeLessThan(SMALL_OUTSIDE_FRAC * 12);
  });

  it('spontaneous departures are faster in small colonies, tapering to the GDD rate at 30 workers', () => {
    expect(smallColonySpontMult(10)).toBe(SMALL_SPONT_MULT_MAX);
    expect(smallColonySpontMult(30)).toBe(1);
    expect(smallColonySpontMult(300)).toBe(1);
    expect(smallColonySpontMult(22.5)).toBeCloseTo(1 + (SMALL_SPONT_MULT_MAX - 1) / 2, 6);
  });
});

describe('R5: a small colony keeps its carbohydrate for the winter', () => {
  function small(c: number, d28: number): Sim {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 });
    establishQueen(sim, ch);
    addWorkers(sim, 14, { chamber: ch, ageGd: 3 });
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c, p: 10 });
    sim.applyPendingCommands();
    step(sim, 200); // upkeep rates set by the colony cycle
    setClimateOverride(sim, { d28: () => d28 });
    return sim;
  }

  it('late in the season laying protein waits until the pool covers the adults to the winter', () => {
    const late = WINTER_RESERVE_FROM_D28 + 2;
    const sim = small(1, late);
    const col = colonyOf(sim);
    expect(winterReserveShort(sim, col, 14)).toBe(true);
    expect(layingProteinPermitted(sim, col)).toBe(false);
    // the same colony with a pool that covers the adults' need until the winter lays again
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 40, p: 10 });
    sim.applyPendingCommands();
    expect(winterReserveShort(sim, col, 14)).toBe(false);
  });

  it('not before WINTER_RESERVE_FROM_D28, and not from SMALL_COLONY_N workers on', () => {
    const sim = small(1, WINTER_RESERVE_FROM_D28 - 1);
    expect(winterReserveShort(sim, colonyOf(sim), 14)).toBe(false);
    setClimateOverride(sim, { d28: () => WINTER_RESERVE_FROM_D28 + 2 });
    expect(winterReserveShort(sim, colonyOf(sim), SMALL_COLONY_N)).toBe(false);
  });
});

describe('R4: laying protein above the brood reserve goes to the queen', () => {
  function layingColony(p: number): Sim {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 });
    establishQueen(sim, ch);
    addWorkers(sim, 40, { chamber: ch, ageGd: 3 });
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 40, p });
    sim.applyPendingCommands();
    step(sim, 600);
    return sim;
  }

  it('the released share grows with the protein days above the floor; a lean-by-carbohydrate colony still releases', () => {
    const rich = layingColony(30), poor = layingColony(0);
    expect(layingReleaseShare(rich, colonyOf(rich))).toBeGreaterThan(0.5);
    expect(layingReleaseShare(poor, colonyOf(poor))).toBe(0);
    const col = colonyOf(rich);
    col.starvationStage = 'lean';
    expect(layingReleaseShare(rich, col)).toBeGreaterThan(0);
    expect(LAYING_RELEASE_FLOOR_DAYS).toBeGreaterThan(0);
  });

  it('the queen takes protein only against her credit (withheld laying protein does not reach her gut)', () => {
    const sim = layingColony(0.2);
    const col = colonyOf(sim);
    const q = sim.stores.ants.get(col.queenId)!;
    q.queen!.gut.c = 0.3; q.queen!.gut.p = 0;
    q.bb['cq.creditP'] = 0;
    const carer = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
    carer.cropC = 0.2; carer.cropP = 0.5;
    expect(queenWantsFood(q)).toBe(false); // C at target, no protein credit
    const got = feedFromCrop(sim, carer, -1, 0.2, 0.5);
    expect(got.p).toBe(0);
    q.bb['cq.creditP'] = 0.1;
    expect(queenWantsFood(q)).toBe(true);
    expect(feedFromCrop(sim, carer, -1, 0, 0.5).p).toBeCloseTo(0.1, 9);
    expect(queenProteinCredit(q)).toBeCloseTo(0, 9);
  });
});

describe('R6: honest diagnostics', () => {
  it('a status held by hysteresis keeps the value it was given for', () => {
    const sim = makeColonySim();
    const col = colonyOf(sim);
    const base: Omit<Diagnostic, 'sinceTick' | 'status' | 'value'> = { id: 'diag-food-intake-p', system: 'colony', label: 'Protein intake', factors: [], remedies: [], focus: null };
    publishWithHysteresis(sim, col, { ...base, status: 'ok', value: 1.2 });
    sim.state.tick += 10; // the clock only: the colony's own diagnostics would republish this id
    const held = publishWithHysteresis(sim, col, { ...base, status: 'bad', value: 0 });
    expect(held.status).toBe('ok');
    expect(held.value).toBe(1.2);
    sim.state.tick += TICKS_PER_DAY * 0.2;
    const now = publishWithHysteresis(sim, col, { ...base, status: 'bad', value: 0 });
    expect(now.status).toBe('bad');
    expect(now.value).toBe(0);
  });
});

describe('R5: autumn hoarding', () => {
  it('the carbohydrate stock target is raised in autumn only; protein stays', () => {
    const sim = makeColonySim();
    const col = colonyOf(sim);
    step(sim, 50);
    const summer = targetDays(col);
    expect(col.core?.acc[SEASON_STOCK_C_KEY]).toBe(1);
    sim.state.tick += 7 * TICKS_PER_DAY; // summer day 2 -> autumn day 2 (the colony test sim has no clock commands)
    step(sim, 50);
    const autumn = targetDays(col);
    expect(autumn.c).toBeCloseTo(summer.c * AUTUMN_STOCK_TARGET_C_MULT, 6);
    expect(autumn.p).toBeCloseTo(summer.p, 6);
  });
});
