import { describe, expect, it } from 'vitest';
import { createPheromoneField } from '@/sim/pheromones';
import type { PheromoneState } from '@/sim/types';
import { ScentCache, type CellLayerSpec, type RefreshBudget } from './ScentCache';
import { FakeCells, flatSnapper, lineCells } from './testkit';
import { FULL_PH, RIVAL_FLAG, STYLE } from './tuning';

const CELL = 16;
const ALL: RefreshBudget = { chunks: Infinity, visits: Infinity, minRefreshS: 0 };
const trail = (origins = [{ x: 0, y: 0, z: 0 }]): CellLayerSpec => ({
  kind: 'cells', key: '0:trail', colony: 0, channel: 'trail', style: STYLE.trail, fullPh: FULL_PH.trail, origins,
});

/** Two passes (a vanished cell needs two passes without it), snaps, axes, and easing to the end. */
function settle(c: ScentCache, src: FakeCells, now = 0): void {
  c.refresh(src, null, ALL, now);
  c.refresh(src, null, ALL, now);
  c.processSnaps(flatSnapper(), Infinity);
  c.processAxes(Infinity);
  c.ease(0, Infinity);
}

describe('ScentCache', () => {
  it('draws one slot per active cell, on the surface, with intensity by strength', () => {
    const src = new FakeCells();
    src.set(0, 'trail', [...lineCells(CELL, 0, 10, 10), ...lineCells(CELL, 0, 1, 0.4, 200)]);
    const c = new ScentCache(1000, CELL);
    c.setLayers([trail()]);
    settle(c, src);
    expect(c.stats().live).toBe(11);
    const vals: number[] = [];
    c.forEachLive((_s, _x, y, _z, v) => { expect(y).toBe(0); vals.push(v); });
    expect(Math.max(...vals)).toBeCloseTo(1, 5); // 10 ph = FULL_PH.trail
    expect(Math.min(...vals)).toBeCloseTo(Math.sqrt(0.4 / FULL_PH.trail), 5);
  });

  it('fades a weakened trail smoothly and frees vanished cells after fading', () => {
    const src = new FakeCells();
    src.set(0, 'trail', lineCells(CELL, 0, 5, 10));
    const c = new ScentCache(100, CELL);
    c.setLayers([trail()]);
    settle(c, src);
    src.set(0, 'trail', lineCells(CELL, 0, 5, 2.5)); // a quarter of the value: intensity 0.5
    c.refresh(src, null, ALL, 1);
    c.ease(0.1, 3);
    let v = 0;
    c.forEachLive((_s, _x, _y, _z, val) => { v = val; });
    expect(v).toBeLessThan(1);
    expect(v).toBeGreaterThan(0.5); // eased, still on its way down
    for (let i = 0; i < 40; i++) c.ease(0.1, 3);
    c.forEachLive((_s, _x, _y, _z, val) => { v = val; });
    expect(v).toBeCloseTo(0.5, 2);
    src.set(0, 'trail', []);
    c.refresh(src, null, ALL, 2);
    c.refresh(src, null, ALL, 3);
    for (let i = 0; i < 30; i++) c.ease(0.1, 3);
    expect(c.stats().live).toBe(0);
    expect(c.layerCount('0:trail')).toBe(0);
  });

  it('applies small decay steps at once and eases only large changes', () => {
    const src = new FakeCells();
    src.set(0, 'trail', lineCells(CELL, 0, 50, 10));
    const c = new ScentCache(100, CELL);
    c.setLayers([trail()]);
    settle(c, src);
    src.set(0, 'trail', lineCells(CELL, 0, 50, 9.8));
    c.refresh(src, null, ALL, 1);
    expect(c.stats().moving).toBe(0);
    expect(c.valHi - c.valLo).toBe(50);
  });

  it('points the trail axis away from the colony entrance (chevrons flow towards the food)', () => {
    const src = new FakeCells();
    src.set(0, 'trail', lineCells(CELL, 0, 12, 8));
    for (const origin of [{ x: -50, y: 0, z: 8 }, { x: 500, y: 0, z: 8 }]) {
      const c = new ScentCache(100, CELL);
      c.setLayers([trail([origin])]);
      settle(c, src);
      const expectSign = origin.x < 0 ? 1 : -1;
      let n = 0;
      c.forEachLive((s) => {
        const ax = c.axis[s * 3], ay = c.axis[s * 3 + 1], az = c.axis[s * 3 + 2];
        expect(Math.sign(ax)).toBe(expectSign);
        expect(Math.abs(ax)).toBeGreaterThan(0.95);
        expect(Math.abs(ay)).toBeLessThan(1e-6); // tangent to the ground
        expect(Math.abs(az)).toBeLessThan(0.3);
        n++;
      });
      expect(n).toBe(12);
    }
  });

  it('respects the snap budget and hides cells with no surface', () => {
    const src = new FakeCells();
    src.set(0, 'trail', lineCells(CELL, 0, 50, 5));
    src.set(0, 'home', [8, 1000, 8, 5]); // floating far above anything
    const c = new ScentCache(1000, CELL);
    c.setLayers([trail(), { kind: 'cells', key: '0:home', colony: 0, channel: 'home', style: STYLE.home, fullPh: FULL_PH.home, origins: [] }]);
    c.refresh(src, null, { chunks: 0, visits: 10, minRefreshS: 0 }, 0); // one layer at least, even over budget
    expect(c.stats().visits).toBe(50);
    expect(c.processSnaps(flatSnapper(), 20)).toBe(20);
    c.ease(0, Infinity);
    expect(c.stats().live).toBe(20);
    expect(c.stats().pending).toBe(30);
    c.refresh(src, null, ALL, 1);
    c.processSnaps(flatSnapper(200), Infinity);
    c.ease(0, Infinity);
    expect(c.stats().live).toBe(50); // the floating home cell has no surface: not drawn
    expect(c.layerCount('0:home')).toBe(1);
  });

  it('starts a new layer pass at most every minRefreshS', () => {
    const src = new FakeCells();
    src.set(0, 'trail', lineCells(CELL, 0, 3, 5));
    const c = new ScentCache(100, CELL);
    c.setLayers([trail()]);
    const b = { chunks: Infinity, visits: Infinity, minRefreshS: 0.5 };
    c.refresh(src, null, b, 0);
    expect(c.stats().visits).toBe(3);
    c.refresh(src, null, b, 0.2);
    expect(c.stats().visits).toBe(0);
    c.refresh(src, null, b, 0.6);
    expect(c.stats().visits).toBe(3);
  });

  it('scans the persisted chunks incrementally within the chunk budget', () => {
    const data: PheromoneState = { cell: CELL, chunkCells: 16, layers: [], lastDecayTick: 0 };
    const f = createPheromoneField(data);
    // 4 chunks along x, 20 cells each
    for (let ch = 0; ch < 4; ch++) for (let i = 0; i < 20; i++) f.deposit(0, 'trail', { x: (ch * 16 + (i % 16) + 0.5) * CELL, y: 8, z: (Math.floor(i / 16) + 0.5) * CELL }, 3);
    expect(data.layers[0].keys.length).toBe(4);
    const c = new ScentCache(1000, CELL);
    c.setLayers([trail()]);
    const b = { chunks: 1, visits: Infinity, minRefreshS: 0 };
    let total = 0;
    for (let k = 0; k < 4; k++) { c.refresh(f, data, b, k); total += c.stats().visits; expect(c.stats().chunks).toBe(1); }
    expect(total).toBe(80);
    c.processSnaps(flatSnapper(), Infinity);
    c.ease(0, Infinity);
    expect(c.stats().live).toBe(80);
    // the same cells as the field's own iteration
    const fromApi = new Set<string>();
    f.forEachActiveCell!(0, 'trail', (x, _y, z) => fromApi.add(`${x},${z}`));
    c.forEachLive((_s, x, _y, z) => expect(fromApi.has(`${x},${z}`)).toBe(true));
  });

  it('drops cells beyond capacity instead of failing, and reuses freed slots', () => {
    const src = new FakeCells();
    src.set(0, 'trail', lineCells(CELL, 0, 30, 5));
    const c = new ScentCache(10, CELL);
    c.setLayers([trail()]);
    settle(c, src);
    expect(c.stats().live).toBe(10);
    // equal-strength cells cannot evict each other: refused as outranked, not as a budget miss
    expect(c.stats().outranked).toBeGreaterThan(0);
    expect(c.stats().dropped).toBe(0);
    src.set(0, 'trail', []);
    c.refresh(src, null, ALL, 1);
    c.refresh(src, null, ALL, 2);
    c.ease(0, Infinity);
    expect(c.stats().live).toBe(0);
    src.set(0, 'trail', lineCells(CELL, 1000, 10, 5));
    settle(c, src, 3);
    expect(c.stats().live).toBe(10);
    expect(c.high).toBeLessThanOrEqual(10);
  });

  it('marks rival layers with the rival flag and fades a layer that is no longer listed', () => {
    const src = new FakeCells();
    src.set(5, 'trail', lineCells(CELL, 0, 4, 5));
    const c = new ScentCache(100, CELL);
    c.setLayers([{ ...trail(), key: '5:trail', colony: 5, style: STYLE.trail + RIVAL_FLAG }]);
    settle(c, src);
    let n = 0;
    c.forEachLive((_s, _x, _y, _z, _v, style) => { expect(style).toBe(STYLE.trail + RIVAL_FLAG); n++; });
    expect(n).toBe(4);
    c.clearLayers();
    c.refresh(src, null, ALL, 1);
    for (let i = 0; i < 40; i++) c.ease(0.1, 3);
    c.refresh(src, null, ALL, 2);
    expect(c.stats().live).toBe(0);
    expect(c.stats().layers).toBe(0);
  });

  it('places food plumes as point glyphs and fades them when the source is gone', () => {
    const c = new ScentCache(10, CELL);
    c.setLayers([{ kind: 'points', key: 'food', style: STYLE.food }]);
    c.setPoints('food', [{ id: 7, pos: { x: 1, y: 2, z: 3 }, up: { x: 0, y: 1, z: 0 }, radiusMm: 40, intensity: 0.8 }]);
    c.ease(0, Infinity);
    expect(c.stats().live).toBe(1);
    expect(c.posSize[3]).toBe(40);
    c.setPoints('food', []);
    for (let i = 0; i < 40; i++) c.ease(0.1, 3);
    expect(c.stats().live).toBe(0);
  });
});
