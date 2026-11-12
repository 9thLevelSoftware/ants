import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { AntFlag, BroodFlag } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { ecloseBrood } from './brood';

/** Ticks from start to the brood-stage events of `to`, per brood id. */
function stageTimes(sim: Sim, to: string): Map<number, number> {
  const out = new Map<number, number>();
  sim.events.on('brood-stage', (e) => { if (e.to === to && !out.has(e.broodId)) out.set(e.broodId, sim.state.tick); });
  return out;
}

function setup(tempC: number, care = { tend: true, feedLarvae: true }) {
  const sim = makeColonySim({ climate: { chamberTemp: () => tempC }, extra: [careSystem(care)] });
  const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 });
  establishQueen(sim, ch);
  addWorkers(sim, 5, { chamber: ch });
  sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 40, p: 60, toxin: 0 });
  return { sim, ch };
}

function meanGd(times: Map<number, number>, startTick: number): number {
  const v = [...times.values()].map((t) => (t - startTick) / TICKS_PER_DAY);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

describe('brood development (GDD 02 §2.2-2.3, E1-E3)', () => {
  it.each([
    [21, 'egg', 'larva', 1.4], [25, 'egg', 'larva', 1.4 / 1.364],
    [21, 'larva', 'pupa', 0.6], [21, 'pupa', 'ready', 1.9], [15, 'egg', 'larva', 1.4 / 0.455],
    [30, 'egg', 'larva', 1.4 / 1.818], [34, 'egg', 'larva', 1.4 / 0.909],
  ])('at %d °C the %s stage lasts its DU / r(T) (%s)', (tempC, stage, to, expected) => {
    const { sim, ch } = setup(tempC);
    addBrood(sim, stage as 'egg', 30, ch);
    const start = sim.state.tick;
    const ready = new Map<number, number>();
    const times = to === 'ready' ? ready : stageTimes(sim, to);
    const ids = sim.stores.brood.list.map((b) => b.id);
    const limit = Math.ceil(expected * 1.2 * TICKS_PER_DAY);
    for (let t = 0; t < limit; t++) {
      sim.tick();
      if (to === 'ready') {
        for (const id of ids) {
          const b = sim.stores.brood.get(id);
          if (b && (b.flags & BroodFlag.READY) && !ready.has(id)) ready.set(id, sim.state.tick);
        }
      }
    }
    expect(times.size).toBeGreaterThan(15); // most survive the base hazard
    expect(Math.abs(meanGd(times, start) - expected) / expected).toBeLessThan(0.03);
    expect(Math.abs(meanGd(times, start) - expected)).toBeLessThan(0.01 + expected * 0.005);
  });

  it('E2: a larva refilled whenever below 0.15 pupates with fed = 1.20 P and 0.40 C', () => {
    const { sim, ch } = setup(21);
    addBrood(sim, 'larva', 20, ch);
    sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 0, p: 30, toxin: 0 });
    const fed = new Map<number, { c: number; p: number }>();
    sim.events.on('brood-stage', (e) => {
      if (e.to !== 'pupa') return;
      const b = sim.state.brood.find((x) => x.id === e.broodId)!;
      fed.set(e.broodId, { c: b.fedC, p: b.fedP });
    });
    step(sim, Math.ceil(0.7 * TICKS_PER_DAY));
    expect(fed.size).toBeGreaterThan(10);
    for (const [, f] of fed) {
      expect(f.p).toBeGreaterThan(1.18);
      expect(f.p).toBeLessThan(1.22);
      expect(f.c).toBeGreaterThan(0.38);
      expect(f.c).toBeLessThan(0.42);
    }
  });

  it('E3: at 8 °C no brood progress changes over 1 gd', () => {
    const { sim, ch } = setup(8);
    addBrood(sim, 'egg', 5, ch, 0.3);
    addBrood(sim, 'larva', 5, ch, 0.3);
    addBrood(sim, 'pupa', 5, ch, 0.3);
    step(sim, TICKS_PER_DAY);
    for (const b of sim.stores.brood.list) if (b.alive) expect(b.progress).toBe(0.3);
  });
});

describe('eclosion (GDD 02 §2.9, E4)', () => {
  it('a ready pupa ecloses with help into a callow adult and leaves a cocoon', () => {
    const { sim, ch } = setup(25);
    addBrood(sim, 'pupa', 1, ch, 0.999);
    step(sim, 40);
    const p = sim.stores.brood.list.find((b) => b.alive)!;
    expect(p.flags & BroodFlag.READY).toBeTruthy();
    const before = sim.stores.ants.count;
    const ant = ecloseBrood(sim, p.id, -1)!;
    expect(ant.flags & AntFlag.CALLOW).toBeTruthy();
    expect(ant.physioAgeGd).toBe(0);
    expect(ant.hp).toBe(ant.maxHp);
    expect(ant.energy).toBeCloseTo(0.4, 6);
    expect(ant.cropC + ant.cropP).toBe(0);
    expect(sim.stores.ants.count).toBe(before + 1);
    expect(sim.state.items.some((i) => i.alive && i.wasteKind === 'cocoon')).toBe(true);
  });

  it('without help a ready pupa gets the eclosion-failed hazard 3.0/gd after 0.3 gd', () => {
    const { sim, ch } = setup(25, { tend: true, feedLarvae: false });
    addBrood(sim, 'pupa', 200, ch, 0.999);
    const causes: string[] = [];
    sim.events.on('brood-died', (e) => causes.push(e.cause));
    step(sim, Math.round(0.3 * TICKS_PER_DAY) + 20);
    const early = causes.filter((c) => c === 'eclosion-failed').length;
    expect(early).toBe(0);
    const alive0 = sim.stores.brood.list.filter((b) => b.alive).length;
    step(sim, Math.round(0.1 * TICKS_PER_DAY));
    const alive1 = sim.stores.brood.list.filter((b) => b.alive).length;
    // Survival over 0.1 gd at hazard 3.0: exp(-0.3) = 0.741.
    expect(alive1 / alive0).toBeGreaterThan(0.64);
    expect(alive1 / alive0).toBeLessThan(0.84);
    expect(causes.filter((c) => c === 'eclosion-failed').length).toBeGreaterThan(20);
  });
});
