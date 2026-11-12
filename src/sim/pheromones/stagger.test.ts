// Staggered decay (GDD 02 §8.2 "every 10 ticks, active chunks only, staggered"), decay-modifier patches and the
// colony argument, species trail half-life.
import { describe, expect, it } from 'vitest';
import { PHERO_DECAY_EVERY } from '@/sim/balance';
import type { PheromoneState, Sim } from '@/sim/types';
import { PHERO_DECAY_PATCH_CELLS, PHERO_HALF_LIFE_S } from './balance';
import { pheroDecayRateMult } from './factors';
import { createPheromoneField, type PheromoneRuntime } from './field';
import { stepPheromones } from './index';
import { pheroChunkGroup, pheroChunkKey } from './layer';
import { emptyPheroState, newField, TEST_CELL } from './testkit';

const C = (i: number, j: number, k: number) => ({ x: (i + 0.5) * TEST_CELL, y: (j + 0.5) * TEST_CELL, z: (k + 0.5) * TEST_CELL });

/** The smallest sim stepPheromones needs. */
function miniSim(): { sim: Sim; f: PheromoneRuntime } {
  const phero: PheromoneState = emptyPheroState();
  const f = createPheromoneField(phero);
  const sim = { state: { tick: 0, phero }, phero: f } as unknown as Sim;
  return { sim, f };
}

/** One cell in each of 40 chunks along x. */
function seed(f: PheromoneRuntime): void {
  for (let c = 0; c < 40; c++) f.deposit(1, 'trail', C(c * 16 + 3, 0, 0), 8);
}

describe('staggered decay', () => {
  it('each tick decays only the chunks of one stagger group, each chunk every PHERO_DECAY_EVERY ticks', () => {
    const { sim, f } = miniSim();
    seed(f);
    const groups = Array.from({ length: 40 }, (_, c) => pheroChunkGroup(pheroChunkKey(c, 0, 0)));
    expect(new Set(groups).size).toBeGreaterThan(5); // the hash spreads neighbouring chunks
    for (let t = 1; t <= 3 * PHERO_DECAY_EVERY; t++) {
      const before = groups.map((_, c) => f.sampleCell(1, 'trail', C(c * 16 + 3, 0, 0)));
      sim.state.tick = t;
      stepPheromones(sim);
      groups.forEach((g, c) => {
        const after = f.sampleCell(1, 'trail', C(c * 16 + 3, 0, 0));
        if (g === t % PHERO_DECAY_EVERY) expect(after).toBeLessThan(before[c]);
        else expect(after).toBe(before[c]);
      });
    }
  });

  it('over whole cadences every chunk gets exactly the decay of an unstaggered field', () => {
    const { sim, f } = miniSim();
    const ref = newField();
    seed(f); seed(ref);
    const T = 9000; // 900 s
    for (let t = 1; t <= T; t++) { sim.state.tick = t; stepPheromones(sim); }
    ref.step(T / 10);
    // Group g's first turn (tick g) covers a whole cadence and its turns end at tick T - (T - g) mod 10, so after
    // T ticks every group has decayed exactly T ticks (T a multiple of the cadence).
    for (let c = 0; c < 40; c++) {
      expect(f.sampleCell(1, 'trail', C(c * 16 + 3, 0, 0))).toBeCloseTo(ref.sampleCell(1, 'trail', C(c * 16 + 3, 0, 0)), 5);
    }
    expect(ref.sampleCell(1, 'trail', C(3, 0, 0))).toBeCloseTo(8 * Math.pow(2, -900 / PHERO_HALF_LIFE_S.trail), 5);
  });

  it('irregular calls (time-lapse, skipped ticks) catch every group up: same values as calling every tick', () => {
    const a = miniSim(), b = miniSim();
    seed(a.f); seed(b.f);
    for (let t = 1; t <= 500; t++) { a.sim.state.tick = t; stepPheromones(a.sim); }
    for (const t of [3, 4, 37, 120, 121, 333, 500]) { b.sim.state.tick = t; stepPheromones(b.sim); }
    for (let c = 0; c < 40; c++) {
      expect(b.f.sampleCell(1, 'trail', C(c * 16 + 3, 0, 0))).toBeCloseTo(a.f.sampleCell(1, 'trail', C(c * 16 + 3, 0, 0)), 5);
    }
  });

  it('calls the decay modifier once per patch, with the layer colony', () => {
    const f = newField();
    // A 16 x 16 cell sheet on the ground (one chunk) and the shared alarm layer.
    for (let i = 0; i < 16; i++) for (let k = 0; k < 16; k++) f.deposit(2, 'home', C(i, 0, k), 5);
    f.deposit(2, 'alarm', C(3, 0, 3), 5);
    const calls: { ch: string; colony: number | undefined; x: number }[] = [];
    f.setHooks({ decayModifier: (ch, x, _y, _z, colony) => { calls.push({ ch, colony, x }); return 1; }, isFree: () => false });
    f.step(1);
    const home = calls.filter((c) => c.ch === 'home');
    expect(home.length).toBe((16 / PHERO_DECAY_PATCH_CELLS) ** 2);
    expect(home.every((c) => c.colony === 2)).toBe(true);
    expect(home.every((c) => (c.x / TEST_CELL) % PHERO_DECAY_PATCH_CELLS === PHERO_DECAY_PATCH_CELLS / 2)).toBe(true);
    expect(calls.filter((c) => c.ch === 'alarm').map((c) => c.colony)).toEqual([-1]);
    // A constant modifier of 1 decays exactly like no modifier.
    const g = newField();
    for (let i = 0; i < 16; i++) for (let k = 0; k < 16; k++) g.deposit(2, 'home', C(i, 0, k), 5);
    g.step(1);
    expect(f.sampleCell(2, 'home', C(7, 0, 7))).toBeCloseTo(g.sampleCell(2, 'home', C(7, 0, 7)), 12);
  });

  it('per tick, the staggered pass with a temperature modifier costs about a tenth of a full pass', () => {
    const { sim, f } = miniSim();
    const p = { x: 0, y: 2, z: 0 };
    for (let i = 0; i < 60000; i++) {
      p.x = ((i % 245) + 0.5) * TEST_CELL; p.z = (Math.floor(i / 245) + 0.5) * TEST_CELL;
      f.deposit(0, 'home', p, 10);
    }
    for (let i = 0; i < 40000; i++) {
      p.x = ((i % 200) + 0.5) * TEST_CELL; p.z = (Math.floor(i / 200) + 0.5) * TEST_CELL;
      f.deposit(0, 'trail', p, 10);
    }
    const climate = { tempC: 22, exposure: 'normal' as const };
    f.setHooks({ decayModifier: (ch, x, _y, z) => { climate.tempC = 20 + 0.001 * x + 0.0007 * z; return pheroDecayRateMult(ch, climate); } });
    const times: number[] = [];
    for (let t = 1; t <= 300; t++) {
      sim.state.tick = t;
      const t0 = performance.now();
      stepPheromones(sim);
      times.push(performance.now() - t0);
    }
    expect(f.activeCellCount()).toBe(100000);
    const sorted = times.slice(50).sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    console.log(`staggered decay tick, 100k cells with modifier: median ${median.toFixed(3)} ms, max ${sorted[sorted.length - 1].toFixed(3)} ms`);
    expect(median).toBeLessThan(1); // budget 3 ms for a full pass; a tick does about a tenth
  }, 60000);
});

describe('species trail half-life', () => {
  it('pheroDecayRateMult uses trailHalfLifeS at trailRefC (GDD 07): Camponotus 1800 s at 20 C', () => {
    expect(pheroDecayRateMult('trail', { tempC: 20, trailHalfLifeS: 1800, trailRefC: 20 })).toBeCloseTo(0.5, 9);
    expect(pheroDecayRateMult('trail', { tempC: 30, trailHalfLifeS: 1800, trailRefC: 20 })).toBeCloseTo(1, 9);
    expect(pheroDecayRateMult('trail', { tempC: 25, trailHalfLifeS: 120, trailRefC: 22 })).toBeCloseTo((900 / 120) * Math.pow(2, 0.3), 9);
    // Lasius data (900 s at 22 C) equals the default; home and alarm ignore the species trail values.
    expect(pheroDecayRateMult('trail', { tempC: 17, trailHalfLifeS: 900, trailRefC: 22 })).toBeCloseTo(pheroDecayRateMult('trail', { tempC: 17 }), 12);
    expect(pheroDecayRateMult('home', { tempC: 22, trailHalfLifeS: 120, trailRefC: 22 })).toBe(1);
  });
});
