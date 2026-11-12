// Reviewer tests (colony-core verify): ledger exactness under edge inputs and flows the original suite does not
// exercise (cheats with negative amounts, NaN amounts from callers, cannibalism, direct crop feeds, deaths).

import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { depositFood, feedBrood, withdrawFood } from './index';
import { coreOf, ledgerNet } from './core';

function baseSim() {
  const sim = makeColonySim();
  const ch = addChamber(sim, 'food', { x: 100, y: -40, z: 100 }, 50);
  establishQueen(sim, ch);
  addWorkers(sim, 10, { chamber: ch, task: 'rest', state: 'rest' });
  step(sim, 10);
  return { sim, ch, col: colonyOf(sim) };
}

/** Stock now minus (stock at mark + lifetime ledger net since mark), per nutrient. */
function drift(col: ReturnType<typeof colonyOf>, mark: { c: number; p: number; net: { c: number; p: number } }) {
  const net = ledgerNet(coreOf(col).life);
  return { c: col.stores.c - (mark.c + net.c - mark.net.c), p: col.stores.p - (mark.p + net.p - mark.net.p) };
}

function markOf(col: ReturnType<typeof colonyOf>) {
  return { c: col.stores.c, p: col.stores.p, net: ledgerNet(coreOf(col).life) };
}

describe('ledger exactness under edge inputs (reviewer)', () => {
  it('cheat.addFood with a negative amount larger than the stock keeps the ledger exact', () => {
    const { sim, col } = baseSim();
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 5, p: 2 });
    step(sim, 1);
    const mark = markOf(col);
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: -10, p: -10, toxin: 0 });
    step(sim, 1);
    const d = drift(col, mark);
    expect(col.stores.c).toBeGreaterThanOrEqual(0);
    expect(Math.abs(d.c)).toBeLessThan(1e-6);
    expect(Math.abs(d.p)).toBeLessThan(1e-6);
  });

  it('cheat.setStores to a negative value keeps the ledger exact', () => {
    const { sim, col } = baseSim();
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 5, p: 2 });
    step(sim, 1);
    const mark = markOf(col);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: -3, p: -1 });
    step(sim, 1);
    const d = drift(col, mark);
    expect(Math.abs(d.c)).toBeLessThan(1e-6);
    expect(Math.abs(d.p)).toBeLessThan(1e-6);
  });

  it('depositFood with a NaN amount never poisons the pool', () => {
    const { sim, col } = baseSim();
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 5, p: 2 });
    step(sim, 1);
    depositFood(sim, col.id, Number.NaN, 0.1);
    step(sim, 20);
    expect(Number.isFinite(col.stores.c)).toBe(true);
    expect(Number.isFinite(col.needs.rateC)).toBe(true);
  });

  it('withdrawFood with NaN amounts never poisons the pool', () => {
    const { sim, col } = baseSim();
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 5, p: 2 });
    step(sim, 1);
    withdrawFood(sim, col.id, Number.NaN, Number.NaN);
    step(sim, 20);
    expect(Number.isFinite(col.stores.c)).toBe(true);
    expect(Number.isFinite(col.stores.p)).toBe(true);
  });

  it('depositFood with an infinite amount is bounded by capacity', () => {
    const { sim, col } = baseSim();
    depositFood(sim, col.id, 0.1, Number.POSITIVE_INFINITY);
    step(sim, 20);
    expect(Number.isFinite(col.stores.p)).toBe(true);
  });

  it('a forager feeding a larva straight from a foraged crop leaves the pool and ledger net unchanged', () => {
    const { sim, ch, col } = baseSim();
    addBrood(sim, 'larva', 1, ch, 0.2);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 5, p: 2 });
    step(sim, 1);
    const larva = sim.state.brood.find((b) => b.alive && b.stage === 'larva')!;
    const giver = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
    const mark = markOf(col);
    giver.cropC = 0.05; giver.cropP = 0.15;
    const moved = feedBrood(sim, giver, larva.id, 0.05, 0.15);
    expect(moved.c + moved.p).toBeGreaterThan(0.19);
    const d = drift(col, mark);
    expect(Math.abs(d.c)).toBeLessThan(1e-9);
    expect(Math.abs(d.p)).toBeLessThan(1e-9);
    expect(col.stores.c).toBe(mark.c);
  });

  it('soak through starvation (cannibalism, deaths with full crops, recycling) keeps the ledger exact', { timeout: 120000 }, () => {
    const sim = makeColonySim({ extra: [careSystem({ feedLarvae: true, tend: true, assist: true, lay: true, feedQueen: true, cannibalise: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 5);
    establishQueen(sim, ch);
    const ws = addWorkers(sim, 15, { chamber: ch, ageGd: 13 });
    for (const a of ws.slice(0, 5)) { a.cropC = 0.5; a.cropP = 0.2; }
    addBrood(sim, 'egg', 15, ch);
    addBrood(sim, 'larva', 10, ch, 0.3);
    addBrood(sim, 'pupa', 5, ch, 0.5);
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 4, p: 1.5 });
    step(sim, 1);
    const col = colonyOf(sim);
    const mark = markOf(col);
    let recycled = 0;
    sim.events.on('cannibalism', () => recycled++);
    let worst = 0;
    for (let t = 0; t < 4 * TICKS_PER_DAY; t++) {
      sim.tick();
      if (t % 50 === 0) {
        const d = drift(col, mark);
        worst = Math.max(worst, Math.abs(d.c), Math.abs(d.p));
        expect(col.stores.c).toBeGreaterThanOrEqual(0);
        expect(col.stores.p).toBeGreaterThanOrEqual(0);
      }
    }
    expect(recycled).toBeGreaterThan(0);
    expect(worst).toBeLessThan(1e-6);
  });
});
