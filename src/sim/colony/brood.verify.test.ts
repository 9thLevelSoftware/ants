// Reviewer tests (colony-core verify): larval starvation clocks, extra hazards, minims and queen laying factors
// (GDD 02 §2.4-§2.6, §3.2) beyond the original suite.

import { describe, expect, it } from 'vitest';
import { BroodFlag } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { ecloseBrood } from './brood';
import { layingFactors } from './queen';
import { setClimateOverride } from './envAdapter';

/** A nursery with haulers (the care fake removes waste at once, so hygiene hazards stay out of the way). */
function nursery(o: Parameters<typeof makeColonySim>[0] = {}) {
  const sim = makeColonySim({ noAllocation: true, extra: [careSystem({})], ...o });
  const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 100);
  establishQueen(sim, ch);
  addWorkers(sim, 5, { chamber: ch, task: 'rest', state: 'rest' });
  sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 50, p: 20 });
  return { sim, ch };
}

describe('larval starvation clocks (reviewer, §2.4-2.5)', () => {
  it('a larva with an empty gut dies of starvation just after 0.5 gd, not before', () => {
    const { sim, ch } = nursery();
    addBrood(sim, 'larva', 40, ch, 0.1);
    const deaths: { t: number; cause: string }[] = [];
    sim.events.on('brood-died', (e) => deaths.push({ t: sim.state.tick / TICKS_PER_DAY, cause: e.cause }));
    step(sim, Math.round(0.6 * TICKS_PER_DAY));
    const starved = deaths.filter((d) => d.cause === 'starvation');
    expect(starved.length).toBeGreaterThan(30);
    for (const d of starved) expect(d.t).toBeGreaterThan(0.5);
    for (const d of starved) expect(d.t).toBeLessThan(0.52);
  });

  it('a larva with C but no P makes no progress and dies after pStarveT 2.0 gd', { timeout: 60000 }, () => {
    const { sim, ch } = nursery();
    addBrood(sim, 'larva', 20, ch, 0.2);
    const deaths: { t: number; cause: string }[] = [];
    sim.events.on('brood-died', (e) => deaths.push({ t: sim.state.tick / TICKS_PER_DAY, cause: e.cause }));
    for (let t = 0; t < 2.2 * TICKS_PER_DAY; t++) {
      for (const b of sim.state.brood) if (b.alive && b.stage === 'larva') { b.gutC = 0.2; b.gutP = 0; }
      sim.tick();
      for (const b of sim.state.brood) if (b.alive) expect(b.progress).toBeCloseTo(0.2, 9);
    }
    const starved = deaths.filter((d) => d.cause === 'starvation');
    expect(starved.length).toBeGreaterThan(15);
    for (const d of starved) expect(d.t).toBeGreaterThan(2.0);
  });

  it('eggs left untended for > 0.25 gd die at about 2.0 per gd (cause untended)', () => {
    const { sim, ch } = nursery();
    addBrood(sim, 'egg', 300, ch, 0);
    step(sim, Math.round(0.26 * TICKS_PER_DAY));
    const alive0 = sim.state.brood.filter((b) => b.alive).length;
    const causes: string[] = [];
    sim.events.on('brood-died', (e) => causes.push(e.cause));
    step(sim, Math.round(0.1 * TICKS_PER_DAY));
    const alive1 = sim.state.brood.filter((b) => b.alive).length;
    // exp(-(2.0 + base 0.0753 x r(25)) x 0.1) ~ 0.81
    expect(alive1 / alive0).toBeGreaterThan(0.74);
    expect(alive1 / alive0).toBeLessThan(0.88);
    expect(causes.filter((c) => c === 'untended').length).toBeGreaterThan(causes.length * 0.8);
  });

  it('a larva fed P only grows at half rate (C deficit halves growth)', () => {
    const { sim, ch } = nursery();
    addBrood(sim, 'larva', 10, ch, 0);
    const dt = 0.2 * TICKS_PER_DAY;
    for (let t = 0; t < dt; t++) {
      for (const b of sim.state.brood) if (b.alive && b.stage === 'larva') { b.gutC = 0; b.gutP = 0.2; }
      sim.tick();
    }
    const alive = sim.state.brood.filter((b) => b.alive && b.stage === 'larva');
    expect(alive.length).toBeGreaterThan(5);
    // progress = 0.5 x r(25) x 0.2 / 0.6 = 0.2273 (+- one slow tick)
    for (const b of alive) expect(Math.abs(b.progress - 0.2273)).toBeLessThan(0.005);
  });
});

describe('minims and nanitics (reviewer, §2.6, §2.9)', () => {
  it('a larva past 0.8 progress pupates as a minim after needP >= 0.8 held 0.25 gd and ecloses at scale 0.9', () => {
    const { sim, ch } = nursery({ extra: [careSystem({ tend: true, feedLarvae: false })] });
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 50, p: 0 });
    addBrood(sim, 'larva', 5, ch, 0.85);
    let minims = 0;
    for (let t = 0; t < 0.3 * TICKS_PER_DAY; t++) {
      for (const b of sim.state.brood) if (b.alive && b.stage === 'larva') { b.gutC = 0.1; b.gutP = 0.1; b.progress = Math.min(b.progress, 0.9); }
      sim.tick();
    }
    for (const b of sim.state.brood) if (b.alive && b.stage === 'pupa' && (b.flags & BroodFlag.MINIM)) minims++;
    expect(minims).toBeGreaterThan(0);
    const pupa = sim.state.brood.find((b) => b.alive && b.stage === 'pupa' && (b.flags & BroodFlag.MINIM))!;
    pupa.progress = 1;
    pupa.flags |= BroodFlag.READY;
    const ant = ecloseBrood(sim, pupa.id)!;
    expect(ant.lengthBu).toBeCloseTo(0.9, 6);
  });
});

describe('queen laying factors (reviewer, §3.2)', () => {
  function queenSim(workers: number, tempC: number, summerDay = 3) {
    const sim = makeColonySim({ summerDay, noAllocation: true });
    const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 100);
    const q = establishQueen(sim, royal);
    addWorkers(sim, workers, { chamber: royal, task: 'rest', state: 'rest' });
    setClimateOverride(sim, { chamberTemp: () => tempC, pointTemp: () => tempC, rh: () => 0.8, surfaceActivity: () => 1 });
    step(sim, 10);
    return { sim, q };
  }

  it.each([[14, 0], [17, 0.5], [25, 1], [32, 0.75], [35, 0.25], [36, 0]])('fTempQ(%d °C) = %f', (t, f) => {
    const { sim, q } = queenSim(18, t);
    expect(layingFactors(sim, colonyOf(sim), q, sim.species).temp).toBeCloseTo(f, 6);
  });

  it('fCap tapers to 0 at WORKER_CAP: N = 1400 gives (1500 - 1400) / 225', { timeout: 60000 }, () => {
    const { sim, q } = queenSim(1400, 25);
    expect(layingFactors(sim, colonyOf(sim), q, sim.species).cap).toBeCloseTo(100 / 225, 3);
  });

  it('fHealth: a queen below 0.3 health has potential 0', () => {
    const { sim, q } = queenSim(18, 25);
    q.hp = 0.29 * q.maxHp;
    expect(layingFactors(sim, colonyOf(sim), q, sim.species).potential).toBe(0);
  });
});
