import { describe, expect, it } from 'vitest';
import { decode, encode } from '@/core/serialize';
import type { PheroChannel, PheromoneState } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save';
import { makeTestSim } from '@/sim/testing';
import { findNonPlain } from '@/sim/testing';
import { createPheromoneField, type PheroFieldOptions, type PheromoneRuntime } from './field';
import { pheromoneSystem } from './index';
import { emptyPheroState, testRandom } from './testkit';

const CHANNELS: PheroChannel[] = ['trail', 'home', 'alarm'];

/** Small caps so evictions of cells and chunks happen often. */
const TIGHT: PheroFieldOptions = {
  limits: { trail: { maxCells: 40, maxChunks: 6 }, home: { maxCells: 60, maxChunks: 8 }, alarm: { maxCells: 30, maxChunks: 4 } },
};

/** One pseudo-random operation on the field; returns a value derived from any read so reads are compared too. */
function randomOp(f: PheromoneRuntime, r: () => number): number {
  const op = r();
  const colony = 1 + Math.floor(r() * 3);
  const ch = CHANNELS[Math.floor(r() * 3)];
  // Half the positions in a 4-chunk cluster (fills the cell caps), half spread out (fills the chunk caps).
  const p = r() < 0.5 ? { x: r() * 400, y: r() * 30, z: r() * 400 } : { x: r() * 1500 - 200, y: r() * 60 - 20, z: r() * 1500 };
  if (op < 0.62) {
    f.deposit(colony, ch, p, r() < 0.1 ? 40 : r() * 3);
    return 0;
  }
  if (op < 0.72) { f.step(r() < 0.8 ? 1 : r() * 60); return 0; }
  // Wipes and washes: mostly mild, sometimes to zero (exercises cells listed at 0 until the next step).
  const k = () => (r() < 0.15 ? 0 : 0.7 + 0.3 * r());
  if (op < 0.78) return f.wipeRegion({ kind: 'sphere', center: p, radius: r() * 40 }, { trail: k(), home: k() });
  if (op < 0.82) return f.wipeRegion({ kind: 'box', center: p, halfX: r() * 900, halfY: 30, halfZ: r() * 20, yaw: r() * 3 }, k());
  if (op < 0.85) return f.washExposed({ trail: k(), home: 0.9, alarm: 1 }, (x, _y, z) => (x + z) % 300 < 150);
  if (op < 0.87) { f.decay(ch, 0.95 + 0.05 * r()); return 0; }
  if (op < 0.8703) { f.clearColony(colony); return 0; }
  if (op < 0.94) {
    const out = { x: 0, y: 0, z: 0 };
    return f.strongestNear(colony, ch, p, r() * 200, out) + out.x * 1e-3 + out.z * 1e-6;
  }
  const out = { x: 0, y: 0, z: 0 };
  const s = f.sense(colony, ch, p, { x: r() - 0.5, y: 0, z: r() - 0.5 }, { x: 0, y: 1, z: 0 }, out);
  return s + out.x + 2 * out.z + f.sample(colony, ch, p);
}

/** Byte equality without vitest's deep-diff cost on large arrays. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function reload(f: PheromoneRuntime, opts?: PheroFieldOptions): PheromoneRuntime {
  return createPheromoneField(decode(encode(f.data)) as PheromoneState, opts);
}

describe('pheromone persistence (AC5)', () => {
  it('round-trips through core encode/decode with identical sampling and identical bytes', () => {
    const f = createPheromoneField(emptyPheroState());
    const r = testRandom(3);
    for (let i = 0; i < 6000; i++) randomOp(f, r);
    expect(f.activeCellCount()).toBeGreaterThan(200);
    expect(findNonPlain(f.data)).toEqual([]);
    const g = reload(f);
    expect(g.validate()).toEqual([]);
    expect(sameBytes(encode(g.data), encode(f.data))).toBe(true);
    const q = testRandom(4);
    for (let i = 0; i < 4000; i++) {
      const p = { x: q() * 1500 - 200, y: q() * 60 - 20, z: q() * 1500 };
      for (const c of [1, 2, 3]) for (const ch of CHANNELS) {
        expect(g.sample(c, ch, p)).toBe(f.sample(c, ch, p));
      }
    }
  }, 60000);

  it('a whole sim snapshot restores the field (sample identical, system keeps decaying)', () => {
    const sim = makeTestSim({ systems: [pheromoneSystem] });
    const cell = sim.state.phero.cell;
    for (let i = 0; i < 200; i++) sim.phero.deposit(0, i % 2 ? 'trail' : 'home', { x: (i + 0.5) * cell, y: 2, z: 3 * cell }, 5);
    for (let t = 0; t < 95; t++) sim.tick();
    const again = createSim(restore(snapshot(sim)).state, sim.world, { systems: [pheromoneSystem] });
    for (let i = 0; i < 200; i++) {
      const p = { x: (i + 0.5) * cell, y: 2, z: 3 * cell };
      expect(again.phero.sample(0, 'trail', p)).toBe(sim.phero.sample(0, 'trail', p));
      expect(again.phero.sample(0, 'home', p)).toBe(sim.phero.sample(0, 'home', p));
    }
    for (let t = 0; t < 300; t++) { sim.tick(); again.tick(); }
    expect(sameBytes(encode(again.state.phero), encode(sim.state.phero))).toBe(true);
  });

  it('repairs malformed saved data instead of throwing', () => {
    const bad = emptyPheroState();
    const vals = new Float32Array(4096);
    vals[5] = NaN; vals[6] = -2; vals[7] = 3;
    bad.layers.push(
      { colony: 1, channel: 'trail', keys: [12345, 99], chunks: [vals, new Float32Array(7)] },
      { colony: 1, channel: 'trail', keys: [], chunks: [] }, // duplicate layer
      { colony: 4, channel: 'alarm', keys: [], chunks: [] }, // alarm must be the shared layer
      { colony: 1, channel: 'smell' as PheroChannel, keys: [], chunks: [] },
    );
    const f = createPheromoneField(bad);
    expect(f.validate()).toEqual([]);
    expect(f.data.layers.length).toBe(1);
    expect(f.activeCellCount()).toBe(1);
  });
});

describe('pheromone determinism (AC8)', () => {
  it('identical call sequences give identical state bytes and identical reads', () => {
    const run = () => {
      const f = createPheromoneField(emptyPheroState(), TIGHT);
      const r = testRandom(99);
      let acc = 0;
      for (let i = 0; i < 20000; i++) acc += randomOp(f, r);
      return { bytes: encode(f.data), acc };
    };
    const a = run(), b = run();
    expect(b.acc).toBe(a.acc);
    expect(sameBytes(b.bytes, a.bytes)).toBe(true);
  }, 60000);

  it('saving and reloading at any point does not change the outcome (with evictions)', () => {
    const straight = createPheromoneField(emptyPheroState(), TIGHT);
    let reloaded = createPheromoneField(emptyPheroState(), TIGHT);
    const ra = testRandom(5), rb = testRandom(5), when = testRandom(6);
    let accA = 0, accB = 0, peakCells = 0, peakChunks = 0;
    for (let i = 0; i < 20000; i++) {
      accA += randomOp(straight, ra);
      peakCells = Math.max(peakCells, straight.activeCellCount(1, 'trail'), straight.activeCellCount(2, 'trail'));
      peakChunks = Math.max(peakChunks, straight.stats().chunks);
      accB += randomOp(reloaded, rb);
      if (when() < 0.004) {
        reloaded = reload(reloaded, TIGHT);
        expect(sameBytes(encode(reloaded.data), encode(straight.data))).toBe(true);
      }
    }
    expect(accB).toBe(accA);
    expect(peakCells).toBe(40); // the trail cell cap was reached (and evicted from)
    expect(peakChunks).toBeGreaterThanOrEqual(3 * 6 + 3 * 8); // chunk caps reached in most layers
    expect(sameBytes(encode(reloaded.data), encode(straight.data))).toBe(true);
    expect(straight.validate()).toEqual([]);
    expect(reloaded.validate()).toEqual([]);
  }, 60000);
});
