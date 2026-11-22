import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { depositFood, poolSpace, withdrawFood } from './index';
import { FORAGE_RATE_P_KEY, PROSPECTIVE_P_KEY, daysOfStock, desiredProteinShare, intakeTarget, nutrientWeights } from './needs';
import { fMet } from './life';

describe('worker upkeep and starvation of an individual (GDD 02 §1.4, E5, E10)', () => {
  it('E5: 10 resting workers at 25 °C, queen removed, pool C 10 / P 0: C = 9.20 after 1 gd', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
    addWorkers(sim, 10, { chamber: ch, task: 'rest', state: 'rest' });
    sim.enqueue({ type: 'cheat.killQueen', colonyId: colonyOf(sim).id, cause: 'unknown' });
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 10, p: 0 });
    sim.tick();
    const c0 = colonyOf(sim).stores.c;
    step(sim, TICKS_PER_DAY);
    expect(c0 - colonyOf(sim).stores.c).toBeCloseTo(0.8, 2);
  });

  it('E10: an old worker outside with a full reserve empties it at 1.25 gd and dies of starvation at 3.25 gd', () => {
    const sim = makeColonySim();
    const [a] = addWorkers(sim, 1, { chamber: null, ageGd: 14, task: 'forage', state: 'forage.outbound' });
    expect(a.energy).toBeCloseTo(0.25, 6);
    let emptyAt = -1, deadAt = -1, cause = '';
    sim.events.on('ant-died', (e) => { if (e.antId === a.id) { deadAt = sim.state.tick; cause = e.cause; } });
    for (let t = 0; t < 4 * TICKS_PER_DAY && deadAt < 0; t++) {
      sim.tick();
      if (emptyAt < 0 && a.energy <= 0) emptyAt = sim.state.tick;
    }
    expect(emptyAt / TICKS_PER_DAY).toBeCloseTo(1.25, 1);
    expect(Math.abs(emptyAt / TICKS_PER_DAY - 1.25)).toBeLessThan(0.02);
    expect(Math.abs(deadAt / TICKS_PER_DAY - 3.25)).toBeLessThan(0.05);
    expect(cause).toBe('starvation');
  });

  it('fMet follows 2^((T-25)/10) clamped to [0.15, 1.8]', () => {
    expect(fMet(25)).toBe(1);
    expect(fMet(15)).toBeCloseTo(0.5, 6);
    expect(fMet(45)).toBe(1.8);
    expect(fMet(-20)).toBe(0.15);
  });
});

describe('pool capacity, deposits and demand signals (GDD 02 §5.1, §5.5)', () => {
  it('social stomach 2 + 0.8 N C and 0.15 N P plus chamber piles bound deposits', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'food', { x: 100, y: -40, z: 100 }, 5);
    addWorkers(sim, 10, { chamber: ch });
    step(sim, 10);
    const col = colonyOf(sim);
    const got = depositFood(sim, col.id, 100, 0);
    expect(got.c).toBeCloseTo(2 + 8 + 5, 6);
    expect(depositFood(sim, col.id, 0, 10).p).toBeCloseTo(1.5, 6); // pile room is taken by C
    expect(poolSpace(col).c).toBeCloseTo(0, 6);
    expect(withdrawFood(sim, col.id, 1, 1).c).toBe(1);
  });

  it('no deposits while the colony has no worker (founding pool replaces the stores)', () => {
    const sim = makeColonySim();
    step(sim, 10);
    expect(depositFood(sim, colonyOf(sim).id, 1, 1)).toEqual({ c: 0, p: 0 });
  });

  it('needs, diet emphasis and nutrient weights follow §5.5', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'food', { x: 100, y: -40, z: 100 }, 100);
    establishQueen(sim, ch);
    addWorkers(sim, 60, { chamber: ch });
    const col = colonyOf(sim);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 30, p: 10 });
    step(sim, 20);
    col.needs.rateC = 10.71;
    col.needs.rateP = 12.9;
    // the worked example's 12.9 P/gd is what its eaters need (no store spoiling), so the forage side's rate (R35 point
    // 4) is the same; no laying withheld (no prospective demand)
    col.core!.acc[FORAGE_RATE_P_KEY] = 12.9;
    col.core!.acc[PROSPECTIVE_P_KEY] = 0;
    const d = daysOfStock(col);
    expect(d.c).toBeCloseTo(2.8, 1);
    expect(d.p).toBeCloseTo(0.78, 2);
    expect(intakeTarget(col)).toBeCloseTo(29.4, 0);
    const sP = desiredProteinShare(col);
    col.directives.diet = 100;
    expect(desiredProteinShare(col)).toBeCloseTo(Math.min(0.95, sP + 0.4), 6);
    col.directives.diet = 'auto';
    col.needs.needC = 0.07; col.needs.needP = 0.48; col.needs.sP = sP;
    const w = nutrientWeights(col);
    expect(w.wP).toBeGreaterThan(w.wC); // protein is the tighter nutrient (worked example)
  });

  it('stores-full fires after the pool has been at capacity for 0.25 gd', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'food', { x: 100, y: -40, z: 100 }, 0);
    addWorkers(sim, 10, { chamber: ch });
    step(sim, 10);
    let fullAt = -1;
    sim.events.on('stores-full', () => { if (fullAt < 0) fullAt = sim.state.tick; });
    const col = colonyOf(sim);
    for (let t = 0; t < TICKS_PER_DAY / 2; t++) {
      depositFood(sim, col.id, 1, 0);
      sim.tick();
    }
    expect(fullAt).toBeGreaterThan(0);
    expect(Math.abs((fullAt - 10) / TICKS_PER_DAY - 0.25)).toBeLessThan(0.01);
  });

  it('pile protein spoils with a 3 gd half-life at 20 °C', () => {
    const sim = makeColonySim({ climate: { chamberTemp: () => 20 } });
    const ch = addChamber(sim, 'food', { x: 100, y: -40, z: 100 }, 100);
    addWorkers(sim, 1, { chamber: ch, task: 'rest', state: 'rest' });
    const col = colonyOf(sim);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 0, p: 20.15 });
    step(sim, 10);
    const p0 = col.stores.p - 0.15;
    step(sim, 3 * TICKS_PER_DAY);
    expect((col.stores.p - 0.15) / p0).toBeCloseTo(0.5, 2);
    const items = sim.state.items.filter((i) => i.alive && i.wasteKind === 'spoiled-food').length;
    expect(Math.abs(items - (p0 / 2) / 0.5)).toBeLessThanOrEqual(1);
  });
});
