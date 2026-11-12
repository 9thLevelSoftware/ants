import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { PHERO_CHANNELS } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { PHERO_DIFFUSE_PER_S, PHERO_HALF_LIFE_S } from './balance';
import { pheroDecayRateMult } from './factors';
import { pheromoneSystem, pheroRuntime, wipeRegion } from './index';
import { newField, TEST_CELL } from './testkit';

const C = (i: number, j: number, k: number) => ({ x: (i + 0.5) * TEST_CELL, y: (j + 0.5) * TEST_CELL, z: (k + 0.5) * TEST_CELL });

describe('pheromone decay', () => {
  it('AC2: a cell at 1.0 reads 0.5 +-2 % after one half-life, each channel (pheromoneSystem in a sim)', () => {
    for (const ch of PHERO_CHANNELS) {
      const sim = makeTestSim({ systems: [pheromoneSystem] });
      const rt = pheroRuntime(sim.phero);
      expect(rt).toBeDefined();
      rt?.setHooks({ isFree: () => false }); // isolate decay from alarm diffusion (tested below)
      const p = { x: 200.5 * sim.state.phero.cell, y: 0.5 * sim.state.phero.cell, z: 100.5 * sim.state.phero.cell };
      sim.phero.deposit(0, ch, p, 1.0);
      const ticks = PHERO_HALF_LIFE_S[ch] * TICKS_PER_SECOND;
      for (let t = 0; t <= ticks; t++) sim.tick(); // the system runs at tick `ticks` (every 10)
      expect(sim.state.phero.lastDecayTick).toBe(ticks);
      const v = sim.phero.sample(0, ch, p);
      expect(Math.abs(v - 0.5) / 0.5).toBeLessThan(0.02);
    }
  });

  it('decays by elapsed game time, so skipped ticks decay correctly', () => {
    const a = newField(), b = newField();
    a.deposit(1, 'trail', C(0, 0, 0), 8);
    b.deposit(1, 'trail', C(0, 0, 0), 8);
    for (let i = 0; i < 90; i++) a.step(10);
    b.step(900);
    expect(a.sample(1, 'trail', C(0, 0, 0))).toBeCloseTo(4, 3);
    expect(b.sample(1, 'trail', C(0, 0, 0))).toBeCloseTo(4, 5);
  });

  it('GDD 02 E11: 10 ph shaded concrete trail -> 5.0 after 900 s at 22 C and after 450 s at 32 C; vacuum -> 0', () => {
    for (const [tempC, seconds] of [[22, 900], [32, 450]] as const) {
      const f = newField();
      f.setHooks({ decayModifier: (ch) => pheroDecayRateMult(ch, { tempC, exposure: 'normal' }) });
      f.deposit(1, 'trail', C(4, 0, 4), 10);
      for (let s = 0; s < seconds; s++) f.step(1);
      expect(f.sample(1, 'trail', C(4, 0, 4))).toBeGreaterThan(4.9);
      expect(f.sample(1, 'trail', C(4, 0, 4))).toBeLessThan(5.1);
    }
    // Vacuum footprint: factor 0 / 0 over the strip (GDD 04 §15.4), value 0 immediately and gone after the step.
    const sim = makeTestSim({ systems: [pheromoneSystem] });
    const cell = sim.state.phero.cell;
    const p = { x: 10.5 * cell, y: 0.5 * cell, z: 10.5 * cell };
    sim.phero.deposit(0, 'trail', p, 10);
    wipeRegion(sim, { kind: 'box', center: p, halfX: 140, halfY: 20, halfZ: 300 }, { trail: 0, home: 0 });
    expect(sim.phero.sample(0, 'trail', p)).toBe(0);
    for (let t = 0; t <= 10; t++) sim.tick();
    expect(sim.phero.activeCellCount?.()).toBe(0);
  });

  it('applies the exposure and heat factors only to trail, temperature to every channel', () => {
    expect(pheroDecayRateMult('trail', { tempC: 22, exposure: 'sunlit-porous' })).toBeCloseTo(2, 9);
    expect(pheroDecayRateMult('trail', { tempC: 22, exposure: 'sheltered' })).toBeCloseTo(1 / 1.5, 9);
    expect(pheroDecayRateMult('trail', { tempC: 22, tmicroC: 36 })).toBeCloseTo(1.5, 9);
    expect(pheroDecayRateMult('home', { tempC: 22, exposure: 'sunlit-porous', tmicroC: 40 })).toBe(1);
    expect(pheroDecayRateMult('alarm', { tempC: 12 })).toBeCloseTo(0.5, 9);
    expect(pheroDecayRateMult('home', { tempC: -30 })).toBeCloseTo(1 / 3, 9); // clamp: half-life x3 max
    expect(pheroDecayRateMult('home', { tempC: 60 })).toBeCloseTo(4, 9); // clamp: half-life x0.25 min
  });

  it('a decay modifier of 0 freezes a cell; per-cell modifiers act per cell', () => {
    const f = newField();
    f.setHooks({ decayModifier: (_ch, x) => (x < 10 * TEST_CELL ? 0 : 2) });
    f.deposit(1, 'home', C(1, 0, 0), 4);
    f.deposit(1, 'home', C(20, 0, 0), 4);
    f.step(1200);
    expect(f.sample(1, 'home', C(1, 0, 0))).toBe(4);
    expect(f.sample(1, 'home', C(20, 0, 0))).toBeCloseTo(1, 5);
  });

  it('alarm diffuses 0.12 /s to free face neighbours, conserving mass; trail and home do not diffuse', () => {
    const f = newField();
    f.setHooks({ isFree: (_x, y) => y > 0 }); // ground plane: cells below y = 0 are solid
    f.deposit(1, 'alarm', C(5, 0, 5), 4);
    f.deposit(1, 'trail', C(5, 0, 5), 4);
    // Undo the decay of one step exactly to isolate diffusion: compare with pure decay.
    f.step(1);
    const decayOnly = 4 * Math.pow(2, -1 / PHERO_HALF_LIFE_S.alarm);
    const centre = f.sampleCell(1, 'alarm', C(5, 0, 5));
    expect(centre).toBeCloseTo(decayOnly * (1 - PHERO_DIFFUSE_PER_S.alarm), 5);
    // 5 free neighbours (not the one below): each gets an equal share.
    const share = (decayOnly * PHERO_DIFFUSE_PER_S.alarm) / 5;
    expect(f.sampleCell(1, 'alarm', C(6, 0, 5))).toBeCloseTo(share, 5);
    expect(f.sampleCell(1, 'alarm', C(5, 1, 5))).toBeCloseTo(share, 5);
    expect(f.sampleCell(1, 'alarm', C(5, -1, 5))).toBe(0);
    let mass = 0;
    f.forEachActiveCell(1, 'alarm', (_x, _y, _z, v) => { mass += v; });
    expect(mass).toBeCloseTo(decayOnly, 5);
    expect(f.activeCellCount(1, 'trail')).toBe(1);
    expect(f.validate()).toEqual([]);
  });

  it('a 4 ph alarm release spreads, fades and frees all its cells within a few half-lives', () => {
    const f = newField();
    f.deposit(1, 'alarm', C(5, 0, 5), 4);
    let peak = 0;
    for (let s = 0; s < 200; s++) {
      f.step(1);
      peak = Math.max(peak, f.activeCellCount(1, 'alarm'));
    }
    expect(peak).toBeGreaterThan(7);
    expect(peak).toBeLessThan(400);
    expect(f.activeCellCount()).toBe(0);
    expect(f.stats().chunks).toBe(0);
  });
});
