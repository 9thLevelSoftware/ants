// Reviewer tests (colony-core verify): individual physiology timelines of GDD 02 §1.3-§1.4 and starvation-stage
// labelling of §5.7 that the original suite does not cover.

import { describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';

describe('physiology timelines (reviewer)', () => {
  it('§1.4: a young nurse at rest in a nest with an empty pool empties her reserve at 7.5 gd and dies at 9.5 gd', { timeout: 120000 }, () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
    const [a] = addWorkers(sim, 1, { chamber: ch, ageGd: 1, task: 'rest', state: 'rest' });
    expect(a.energy).toBeCloseTo(0.6, 6);
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 0, p: 0 });
    let emptyAt = -1, deadAt = -1, cause = '';
    sim.events.on('ant-died', (e) => { if (e.antId === a.id) { deadAt = sim.state.tick; cause = e.cause; } });
    for (let t = 0; t < 11 * TICKS_PER_DAY && deadAt < 0; t++) {
      sim.tick();
      if (emptyAt < 0 && a.energy <= 0) emptyAt = sim.state.tick;
    }
    expect(Math.abs(emptyAt / TICKS_PER_DAY - 7.5)).toBeLessThan(0.02);
    expect(Math.abs(deadAt / TICKS_PER_DAY - 9.5)).toBeLessThan(0.05);
    expect(cause).toBe('starvation');
  });

  // Outside ageing restated by ruling R30 (Nov 18, replaces R11): 1.5 / gd (GDD 02 §1.3 had 3; the dangers of foraging
  // are simulated one by one now). Inside and dormant rates unchanged.
  it('§1.3 / R30: physiological age accrues 1 / gd inside, 1.5 / gd outside, 0.15 / gd dormant', () => {
    const sim = makeColonySim({ noAllocation: true });
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
    const [inside] = addWorkers(sim, 1, { chamber: ch, ageGd: 2, task: 'rest', state: 'rest' });
    const [outside] = addWorkers(sim, 1, { chamber: null, ageGd: 2, task: 'forage', state: 'forage.outbound' });
    const [dormant] = addWorkers(sim, 1, { chamber: ch, ageGd: 2, task: 'rest', state: 'rest' });
    dormant.flags |= AntFlag.DORMANT;
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 20, p: 2 });
    outside.cropC = 1; // enough to keep her fed for 0.5 gd
    step(sim, TICKS_PER_DAY / 2);
    expect(inside.physioAgeGd - 2).toBeCloseTo(0.5, 2);
    expect(outside.physioAgeGd - 2).toBeCloseTo(0.75, 2);
    expect(dormant.physioAgeGd - 2).toBeCloseTo(0.075, 3);
  });

  it('§1.4: dormant upkeep is x 0.3 (10 dormant resting ants use 0.24 C per gd at 25 °C)', () => {
    const sim = makeColonySim({ noAllocation: true });
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
    for (const a of addWorkers(sim, 10, { chamber: ch, task: 'rest', state: 'rest' })) a.flags |= AntFlag.DORMANT;
    sim.enqueue({ type: 'cheat.killQueen', colonyId: colonyOf(sim).id, cause: 'unknown' });
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 10, p: 1 });
    sim.tick();
    const c0 = colonyOf(sim).stores.c;
    step(sim, TICKS_PER_DAY);
    expect(c0 - colonyOf(sim).stores.c).toBeCloseTo(0.24, 2);
  });
});

describe('starvation stage labels (reviewer)', () => {
  it('§5.7: with pool C plentiful and P = 0, a worker with an empty reserve inside the nest is fed by the pool, so S4 is not entered', () => {
    const sim = makeColonySim({ noAllocation: true });
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 }, 100);
    establishQueen(sim, ch);
    const ws = addWorkers(sim, 10, { chamber: ch, task: 'rest', state: 'rest' });
    // feeding larvae: an empty protein pool starves only a colony that raises them (viab-economy R5)
    addBrood(sim, 'larva', 3, ch, 0.2);
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 40, p: 0 });
    const stages: string[] = [];
    sim.events.on('starvation-stage', (e) => stages.push(e.stage));
    step(sim, 50); // the colony leaves `fed`, so reserve refills stop
    expect(colonyOf(sim).starvationStage).not.toBe('fed');
    ws[0].energy = 0;
    step(sim, Math.round(0.4 * TICKS_PER_DAY));
    expect(stages).toContain('brood-sacrifice'); // P = 0 for > 0.2 gd
    expect(colonyOf(sim).starvationStage).not.toBe('adult-starvation');
    expect(ws[0].hp).toBe(ws[0].maxHp);
  });
});
